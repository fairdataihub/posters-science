/* eslint-disable @typescript-eslint/no-explicit-any */
/**
 * @file Loads the auto-indexed poster corpus (the extracted JSON records from
 * Zenodo and Figshare) into the database. Records that already have a poster
 * get their metadata refreshed in place, new records become new posters, and
 * optionally posters that dropped out of the corpus are tombstoned.
 *
 * ## How a run works
 *
 * Nothing is written until every record has been read and matched, so a bad
 * corpus fails before it touches the database.
 *
 *   1. Plan (always runs, including with --dry-run)
 *      - Find every `<id>_complete.json` under each --dir.
 *      - Map each record to database fields ({@link mapToDbFields}).
 *      - Match each record to an existing automated poster (see "Matching").
 *      - Sort records into update / create / skip / defer, and work out which
 *        posters to tombstone.
 *      - Run the safety checks (see "Safety guards").
 *   2. Apply (skipped with --dry-run)
 *      - Write updates and creations in parallel (--concurrency).
 *      - Tombstone posters one by one, each with an admin audit log entry.
 *   3. Report
 *      - Write the run report, plus an error report if anything failed.
 *
 * ## Input layout
 *
 * Each record is one file named after its repository record id, inside a
 * folder named after the repository:
 *
 *   poster_index_20250101-20251231/        <- corpus root
 *     merged/                              <- merged folder
 *       zenodo/12345678_complete.json
 *       figshare/1009548.v2_complete.json
 *
 * --dir can point at either the corpus root or the merged folder. Files that
 * are not directly inside a `zenodo/` or `figshare/` folder are ignored.
 *
 * ## Usage
 *
 *   pnpm tsx scripts/add-extracted-posters.ts [options]
 *
 * The database URL is read from `.env` (via dotenv). The script prints the
 * target as host:port/db before doing anything, so check it every time.
 * Always dry run first and read the run report; worked examples are at the
 * end of this comment.
 *
 * ## Options
 *
 * Where to read and write
 *   --dir <path>           Corpus root or merged folder (default: ./merged).
 *                          Repeat it to read several corpora in one run.
 *   --database-env <name>  Env var holding the connection string
 *                          (default: DATABASE_URL), e.g. STAGING_DATABASE_URL.
 *   --report <path>        Run report path
 *                          (default: ./reports/add-extracted-posters-<run|dry-run>-<time>.json).
 *   --error-report <path>  Error report path, only written when something failed
 *                          (default: ./reports/add-extracted-posters-errors-<time>.json).
 *
 * What to change
 *   --dry-run              Plan everything and write the report, but change nothing.
 *   --update-only          Update existing posters, never create new ones.
 *   --create-only <file>   Text file listing the only new records that may be
 *                          created, one path per line, e.g.
 *                          poster_index_20250101-20251231/merged/zenodo/123_complete.json.
 *                          Lines are compared on their last four path segments;
 *                          blank lines and lines starting with # are ignored.
 *                          Has no effect with --update-only.
 *   --limit <n>            Write at most n posters, updates first, then
 *                          creations (default: all). Not allowed with
 *                          --tombstone-missing.
 *   --defer-reconciliation Leave out updates that would retire duplicate copies
 *                          or replace a poster's existing DOI, and list them in
 *                          the report as "deferred". A later run without the
 *                          flag applies them. Not allowed with --tombstone-missing.
 *
 * Tombstoning (retiring posters)
 *   --tombstone-missing    Tombstone automated posters that no record matched,
 *                          and extra copies of a record left by earlier imports.
 *   --audit-email <email>  Admin account the tombstones are logged under, as
 *                          /admin does. Required with --tombstone-missing
 *                          unless it is a dry run.
 *   --max-tombstones <n>   Refuse to run if more than n posters would be
 *                          tombstoned (default: 25). Catches a --dir that points
 *                          at only part of the corpus.
 *
 * Performance
 *   --concurrency <n>      Records written in parallel (default: 4).
 *
 * ## Matching
 *
 * Each record is matched to an existing automated poster in this order, and a
 * poster is only ever claimed by one record:
 *   1. DOI (case-insensitive).
 *   2. Source file: the `<repository>_<record id>` baked into the poster's
 *      thumbnail URL, or the dicebear seed for license-blocked posters. This
 *      only matches posters whose DOI no record carries (none, or an outdated
 *      one), so a record whose DOI changed still updates its existing poster.
 *   3. For records without a DOI, case-insensitive title + identifiers overlap.
 * When steps 2 or 3 find several posters with the same title, they are copies
 * of one record left by earlier imports: one keeps its id ({@link pickKeeper})
 * and the rest are tombstoned as duplicates (with --tombstone-missing).
 *
 * ## What an update keeps
 *
 * Existing posters keep their id, owner, thumbnail, version family links and
 * likes; only the title, description, dates and metadata are replaced. The
 * thumbnail switches to a placeholder if a record becomes license-blocked, and
 * back to the CDN thumbnail once a record is unblocked and the CDN has one.
 *
 * ## Safety guards
 *
 *   - Tombstoned posters are never updated or brought back ("skip-tombstoned").
 *   - When two records claim the same poster, or two new records share a DOI,
 *     both are reported as errors and neither is written.
 *   - --tombstone-missing refuses to apply when any record failed to parse or
 *     match, since those records' posters would look missing.
 *   - Posters owned by a user, or in a version family, are never tombstoned.
 *     They show up in the report as "blocked" for review by hand.
 *
 * ## Output
 *
 * The run report (always written) holds `totals` plus one entry per record
 * file in `records`, each with the action taken (see {@link RecordAction}).
 * It also lists `tombstones`, `duplicateCopies`, `outdatedDois` (posters whose
 * DOI is being replaced), `thumbnailUpgrades`, and `undatedRecords` (records
 * with no Issued or Submitted date, which get the run time as their date; fix
 * those in the blob). The error report lists every record that failed, with
 * the phase it failed in.
 *
 * ## Reusing the mappers
 *
 * {@link mapToDbFields}, {@link getImageUrl} and {@link JsonPoster} are
 * exported for other scripts. Importing this file does not start an import.
 *
 * @example
 * # 1. Always dry run first, then read the run report in ./reports
 * pnpm tsx scripts/add-extracted-posters.ts \
 *   --database-env STAGING_DATABASE_URL \
 *   --dir ./poster_index_19860101-20241231 \
 *   --dir ./poster_index_20250101-20251231 \
 *   --dry-run
 *
 * @example
 * # 2. Refresh existing posters only, and retire the ones no longer in the corpus
 * pnpm tsx scripts/add-extracted-posters.ts \
 *   --database-env STAGING_DATABASE_URL \
 *   --dir ./poster_index_19860101-20241231 \
 *   --dir ./poster_index_20250101-20251231 \
 *   --update-only --tombstone-missing \
 *   --audit-email admin@example.org --max-tombstones 10
 *
 * @example
 * # 3. Cautious first pass: apply only the plain updates, and hold back
 * #    anything that retires duplicates or swaps a DOI for review
 * pnpm tsx scripts/add-extracted-posters.ts --dir ./merged --update-only --defer-reconciliation
 */
import "dotenv/config";
import * as fs from "fs";
import * as path from "path";
import { pathToFileURL } from "url";
import { PrismaClient } from "../shared/generated/client";
import { PrismaPg } from "@prisma/adapter-pg";

/**
 * Reads the value that follows a CLI option. Only the first occurrence counts,
 * e.g. `getArg("limit")` returns "10" for `--limit 10`.
 *
 * @param name - Option name without the leading `--`.
 * @returns The value, or `undefined` when the option was not passed.
 */
function getArg(name: string): string | undefined {
  const idx = process.argv.indexOf(`--${name}`);
  if (idx === -1) return undefined;

  return process.argv[idx + 1];
}

/**
 * Like {@link getArg}, but collects every occurrence of a repeatable option,
 * e.g. `--dir a --dir b` gives `["a", "b"]`.
 *
 * @param name - Option name without the leading `--`.
 * @returns Every value passed, in order; empty when the option was not passed.
 */
function getArgs(name: string): string[] {
  const values: string[] = [];
  for (let i = 0; i < process.argv.length; i++) {
    if (process.argv[i] === `--${name}` && process.argv[i + 1]) {
      values.push(process.argv[i + 1]);
    }
  }

  return values;
}

/**
 * Checks for an on/off flag that takes no value, such as `--dry-run`.
 *
 * @param name - Flag name without the leading `--`.
 */
function hasFlag(name: string): boolean {
  return process.argv.includes(`--${name}`);
}

/**
 * One `<id>_complete.json` record as written by the extraction pipeline. It
 * follows the posters.science metadata schema (DataCite based), but every
 * field is optional because older extractions leave some out. Only the fields
 * this script reads closely are typed in detail.
 */
export type JsonPoster = {
  creators?: any[];
  titles?: any[];
  descriptions?: any[];
  publicationYear?: number | null;
  subjects?: any[];
  publisher?: any;
  conference?: {
    conferenceName?: string | null;
    conferenceAcronym?: string | null;
    conferenceYear?: number | null;
    conferenceLocation?: string | null;
    conferenceUri?: string | null;
    conferenceIdentifier?: string | null;
    conferenceIdentifierType?: string | null;
    conferenceStartDate?: string | null;
    conferenceEndDate?: string | null;
    conferenceSeries?: string | null;
  };
  formats?: any[];
  /** Real JSON uses "content", not "posterContent" */
  content?: { sections?: any[] };
  imageCaptions?: any[];
  tableCaptions?: any[];
  rightsList?: any[];
  identifiers?: any[];
  alternateIdentifiers?: any[];
  dates?: any[];
  types?: any;
  language?: string | null;
  relatedIdentifiers?: any[];
  sizes?: any[];
  version?: string | null;
  fundingReferences?: any[];
  ethicsApprovals?: any[];
  /** Research domain; posters without one are filed under "Other" */
  domain?: string;
  /**
   * Set by the pipeline when the record's license does not allow showing the
   * poster itself. Such posters get a placeholder thumbnail and no extracted
   * content (see {@link mapToDbFields} and {@link getImageUrl}).
   */
  _license_blocked?: boolean;
};

/**
 * Removes characters that would break the database write or show up as
 * garbage: ASCII control characters (tab, newline and carriage return are
 * kept) and unpaired UTF-16 surrogates, which PDF text extraction sometimes
 * leaves behind.
 *
 * @param value - Any string from a record.
 * @returns The string without those characters.
 */
function sanitizeText(value: string): string {
  let out = "";

  for (let i = 0; i < value.length; i++) {
    const code = value.charCodeAt(i);

    // Remove ASCII control chars except tab/newline/carriage return.
    if (
      (code >= 0x00 && code <= 0x08) ||
      code === 0x0b ||
      code === 0x0c ||
      (code >= 0x0e && code <= 0x1f) ||
      code === 0x7f
    ) {
      continue;
    }

    // Keep only valid surrogate pairs; drop unpaired surrogates.
    if (code >= 0xd800 && code <= 0xdbff) {
      const nextCode = i + 1 < value.length ? value.charCodeAt(i + 1) : -1;
      if (nextCode >= 0xdc00 && nextCode <= 0xdfff) {
        out += value[i] + value[i + 1];
        i++;
      }
      continue;
    }

    if (code >= 0xdc00 && code <= 0xdfff) {
      continue;
    }

    out += value[i];
  }

  return out;
}

/**
 * Runs {@link sanitizeText} on every string inside a value, walking through
 * arrays and plain objects. Dates, null, undefined, numbers and booleans pass
 * through unchanged.
 *
 * @param value - Any JSON-like value.
 * @returns A sanitized copy with the same shape.
 */
function sanitizeValue<T>(value: T): T {
  if (typeof value === "string") {
    return sanitizeText(value) as T;
  }

  if (Array.isArray(value)) {
    return value.map((item) => sanitizeValue(item)) as T;
  }

  if (value instanceof Date || value === null || value === undefined) {
    return value;
  }

  if (typeof value === "object") {
    const sanitizedEntries = Object.entries(
      value as Record<string, unknown>,
    ).map(([key, val]) => [key, sanitizeValue(val)]);

    return Object.fromEntries(sanitizedEntries) as T;
  }

  return value;
}

/**
 * Turns one extracted record into the values the `Poster` and
 * `PosterMetadata` tables store. This is the one place that interprets record
 * JSON, so a change to the extraction output usually only needs a change here.
 *
 * Rules worth knowing:
 *   - DOIs are lowercased, both in `doi` and inside `identifiers`.
 *   - `publisher` falls back to "Figshare" or "Zenodo" based on the DOI.
 *   - Dates: `submittedAt` is the record's Submitted date, else its Issued
 *     date; date ranges ("2020-01-01/2020-01-03") use their start. With
 *     neither date both fall back to the time of the run, and `hasRecordDate`
 *     is false so the run report can list the record.
 *   - License-blocked records keep their bibliographic metadata but lose their
 *     extracted content and image and table captions.
 *   - Missing titles and descriptions get placeholder text, and `format` is
 *     always "application/pdf".
 *   - Every string in the result goes through {@link sanitizeValue}.
 *
 * @param data - A parsed `<id>_complete.json` record.
 * @returns Flat object of database-ready values. {@link metadataPayload}
 *   picks the `PosterMetadata` columns from it; `posterTitle`,
 *   `posterDescription` and `submittedAt` go on the `Poster` row.
 */
export function mapToDbFields(data: JsonPoster) {
  const creators = (data.creators ?? []).map((creator: any) => {
    // affiliation can be string[] or object[] depending on source
    const rawAff: any[] = Array.isArray(creator.affiliation)
      ? creator.affiliation
      : creator.affiliation
        ? [creator.affiliation]
        : [];

    const affiliation = rawAff.map((aff: any) =>
      typeof aff === "string"
        ? {
            name: aff,
            affiliationIdentifier: null,
            affiliationIdentifierScheme: null,
          }
        : {
            name: aff.name ?? "",
            affiliationIdentifier: aff.affiliationIdentifier ?? null,
            affiliationIdentifierScheme:
              aff.affiliationIdentifierScheme ?? null,
          },
    );

    // The record only carries a scheme (e.g. "ORCID"); it fills both columns.
    const rawIds: any[] = creator.nameIdentifiers ?? [];
    const nameIdentifiers = rawIds.map((ni: any) => ({
      nameIdentifier: ni.nameIdentifier,
      nameIdentifierType: ni.nameIdentifierScheme ?? null,
      nameIdentifierScheme: ni.nameIdentifierScheme ?? null,
    }));

    return {
      name: creator.name ?? "Unknown Creator",
      ...(creator.nameType ? { nameType: creator.nameType } : {}),
      ...(nameIdentifiers.length > 0 ? { nameIdentifiers } : {}),
      ...(affiliation.length > 0 ? { affiliation } : {}),
    };
  });

  const titles = data.titles ?? [];
  const descriptions = data.descriptions ?? [];
  const posterTitle = titles[0]?.title ?? "Untitled Poster";
  const posterDescription =
    descriptions[0]?.description ?? "No description provided for this poster";

  const identifiers = (data.identifiers ?? []).map((id: any) => {
    if (id?.identifierType === "DOI" && typeof id?.identifier === "string") {
      return {
        ...id,
        identifier: id.identifier.toLowerCase(),
      };
    }

    return id;
  });

  const doiEntry = identifiers.find((x: any) => x?.identifierType === "DOI");
  const doiRaw = doiEntry?.identifier;
  const doi = typeof doiRaw === "string" ? doiRaw.toLowerCase() : null;

  const publisherName =
    typeof data.publisher === "string"
      ? data.publisher
      : data.publisher && typeof data.publisher === "object"
        ? (data.publisher as { name?: unknown }).name
        : null;

  const publisher =
    typeof publisherName === "string" && publisherName.trim().length > 0
      ? publisherName.trim()
      : doi && /figshare/i.test(doi)
        ? "Figshare"
        : doi && /zenodo/i.test(doi)
          ? "Zenodo"
          : null;

  const publicationYear = data.publicationYear ?? null;

  const subjectsRaw = data.subjects ?? [];
  const subjects = subjectsRaw.map((s: any) =>
    typeof s === "string" ? s : (s?.subject ?? ""),
  );

  const language = data.language ?? null;
  const relatedIdentifiers = data.relatedIdentifiers ?? [];

  const sizesArr = (data.sizes ?? []).filter((s: any) => typeof s === "string");
  const size = sizesArr[0] ?? null;
  const format = "application/pdf";
  const version = data.version ?? null;

  const rightsList = data.rightsList ?? [];
  const license =
    rightsList[0]?.rightsIdentifier ?? rightsList[0]?.rights ?? null;

  const fundingReferences = data.fundingReferences ?? [];

  const { conference } = data;
  const conferenceName = conference?.conferenceName ?? null;
  const conferenceLocation = conference?.conferenceLocation ?? null;
  const conferenceUri = conference?.conferenceUri ?? null;
  const conferenceIdentifier = conference?.conferenceIdentifier ?? null;
  const conferenceIdentifierType = conference?.conferenceIdentifierType ?? null;
  const conferenceYear = conference?.conferenceYear ?? null;
  const conferenceStartDate = conference?.conferenceStartDate ?? null;
  const conferenceEndDate = conference?.conferenceEndDate ?? null;
  const conferenceAcronym = conference?.conferenceAcronym ?? null;
  const conferenceSeries = conference?.conferenceSeries ?? null;

  const domain = data.domain ?? "Other";

  // Dates may be ranges such as "2020-01-01/2020-01-03"; only the start is used.
  const datesArr = data.dates ?? [];

  const issuedDateRaw = datesArr.find(
    (d: any) => d?.dateType === "Issued",
  )?.date;
  const issuedDateStr = issuedDateRaw?.split("/")[0] ?? null;
  const issuedAt = issuedDateStr ? new Date(issuedDateStr) : new Date();

  const submittedDateRaw = datesArr.find(
    (d: any) => d?.dateType === "Submitted",
  )?.date;
  const submittedDateStr = submittedDateRaw?.split("/")[0] ?? null;
  const submittedAt = submittedDateStr ? new Date(submittedDateStr) : issuedAt;
  // Without either date the two above fall back to the load time; the run
  // report lists these records so their dates can be fixed in the blob.
  const hasRecordDate = Boolean(issuedDateStr || submittedDateStr);

  // License-blocked posters withhold their thumbnail (see getImageUrl), so any
  // extracted content-derived fields must be blanked out too rather than leaking
  // poster content the license doesn't allow us to show.
  const licenseBlocked = data._license_blocked === true;

  // Real JSON uses "content" field; fall back to empty sections
  const posterContent = licenseBlocked ? {} : (data.content ?? {});

  const imageCaptions = licenseBlocked
    ? []
    : (data.imageCaptions ?? []).map((c: any) => ({
        ...(c.id ? { id: c.id } : {}),
        caption: c.caption ?? "",
      }));

  const tableCaptions = licenseBlocked
    ? []
    : (data.tableCaptions ?? []).map((c: any) => ({
        ...(c.id ? { id: c.id } : {}),
        caption: c.caption ?? "",
      }));

  return sanitizeValue({
    creators,
    imageCaptions,
    posterContent,
    tableCaptions,
    posterTitle,
    posterDescription,
    doi,
    identifiers,
    publisher,
    issuedAt,
    submittedAt,
    hasRecordDate,
    dates: datesArr,
    publicationYear,
    subjects,
    language,
    relatedIdentifiers,
    size,
    format,
    version,
    license,
    fundingReferences,
    conferenceName,
    conferenceLocation,
    conferenceUri,
    conferenceIdentifier,
    conferenceIdentifierType,
    conferenceYear,
    conferenceStartDate,
    conferenceEndDate,
    conferenceAcronym,
    conferenceSeries,
    domain,
  });
}

/**
 * Builds the thumbnail URL a record's poster should have.
 *
 *   - License-blocked: a dicebear placeholder seeded with the record id, so the
 *     poster has a stable image without showing its content.
 *   - Otherwise: `https://cdn.posters.science/thumbnails/a/<source>_<id>.jpeg`,
 *     where `<source>` comes from the publisher, then the DOI, then the folder
 *     the file sits in. This does not check that the CDN has the image; see
 *     {@link findCdnThumbnail} for that.
 *   - No DOI, or no recognizable source: an empty string (no thumbnail).
 *
 * The `<source>_<id>` part (or the seed) also ties the poster back to its
 * record file on later runs; see {@link posterSourceKey}.
 *
 * @param filePath - Path to the record file; its name gives the record id.
 * @param doi - The record's DOI as returned by {@link mapToDbFields}.
 * @param publisher - The record's raw `publisher` (a string or `{ name }`).
 * @param licenseBlocked - The record's `_license_blocked` flag.
 * @returns The thumbnail URL, or "" when the poster gets none.
 */
export function getImageUrl(
  filePath: string,
  doi: string | null,
  publisher?: unknown,
  licenseBlocked?: boolean,
): string {
  const basename = path.basename(filePath); // e.g. "12345678_complete.json"
  const id = basename.replace(/_complete\.json$/, "");
  // Windows paths use backslashes, which the folder fallbacks below would miss.
  const normalizedPath = filePath.replaceAll("\\", "/");

  if (licenseBlocked) {
    return `https://api.dicebear.com/9.x/shapes/svg?seed=${id}`;
  }

  if (!doi) return "";

  const publisherName =
    typeof publisher === "string"
      ? publisher
      : publisher && typeof publisher === "object"
        ? (publisher as { name?: unknown }).name
        : null;

  const publisherText = typeof publisherName === "string" ? publisherName : "";
  let source: "zenodo" | "figshare" | null = null;

  // Prefer publisher metadata first, then DOI/path fallbacks.
  if (/figshare/i.test(publisherText)) source = "figshare";
  else if (/zenodo/i.test(publisherText)) source = "zenodo";
  else if (/zenodo/i.test(doi)) source = "zenodo";
  else if (/figshare/i.test(doi)) source = "figshare";
  else if (/\/zenodo\//i.test(normalizedPath)) source = "zenodo";
  else if (/\/figshare\//i.test(normalizedPath)) source = "figshare";

  if (!source) return "";

  return `https://cdn.posters.science/thumbnails/a/${source}_${id}.jpeg`;
}

/** Repository folders a corpus is split into. Other folders are ignored. */
const SOURCES = ["zenodo", "figshare"] as const;

/** A record file found on disk, with what its path says about the record. */
type SourceFile = {
  filePath: string;
  /** Repository folder the record was scraped from */
  source: (typeof SOURCES)[number];
  /** Repository record id, e.g. "12345678" or "1009548.v2" for figshare versions */
  recordId: string;
};

/**
 * Finds every `<source>/<id>_complete.json` below `rootDir`, at any depth, so
 * the same call handles a merged folder and a corpus root that contains one.
 *
 * @param rootDir - A merged folder or a corpus root (the value of --dir).
 * @returns The record files, sorted by path so every run sees the same order.
 */
function collectJsonFiles(rootDir: string): SourceFile[] {
  const files: SourceFile[] = [];

  const visit = (dir: string) => {
    for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
      const fullPath = path.join(dir, entry.name);
      if (entry.isDirectory()) {
        visit(fullPath);
        continue;
      }

      const source = SOURCES.find((s) => s === path.basename(dir));
      if (source && entry.name.endsWith("_complete.json")) {
        files.push({
          filePath: fullPath,
          source,
          recordId: entry.name.replace(/_complete\.json$/, ""),
        });
      }
    }
  };
  visit(rootDir);

  return files.sort((a, b) => a.filePath.localeCompare(b.filePath));
}

/**
 * Keys that tie a database poster back to the file it was imported from. The
 * importer bakes the record into the thumbnail URL (`<source>_<id>.jpeg`), or
 * into the dicebear seed when the license blocked the thumbnail.
 *
 * @example
 * posterSourceKey("https://cdn.posters.science/thumbnails/a/zenodo_123.jpeg"); // "zenodo_123"
 * posterSourceKey("https://api.dicebear.com/9.x/shapes/svg?seed=123"); // "seed:123"
 * posterSourceKey(""); // null
 *
 * @param imageUrl - A poster's `imageUrl` from the database.
 * @returns The key, or null when the URL does not identify a record.
 */
function posterSourceKey(imageUrl: string): string | null {
  const cdn = /\/thumbnails\/a\/([a-z]+_[^/]+?)\.jpe?g$/i.exec(imageUrl);
  if (cdn) return cdn[1];

  const seed = /api\.dicebear\.com\/.*[?&]seed=([^&]+)$/.exec(imageUrl);
  if (seed) return `seed:${decodeURIComponent(seed[1])}`;

  return null;
}

/**
 * Every source key a poster imported from this file could carry, to look up
 * in the posters' {@link posterSourceKey} index.
 *
 * @param file - The record file.
 * @param computedImageUrl - The URL {@link getImageUrl} built for the record.
 * @returns The folder-based key, the key from the computed URL, and the
 *   placeholder seed key, without repeats.
 */
function fileSourceKeys(file: SourceFile, computedImageUrl: string): string[] {
  const keys = new Set([`${file.source}_${file.recordId}`]);
  // Older imports picked the thumbnail prefix from the publisher, so a record
  // in zenodo/ can have a figshare_ thumbnail.
  const computed = posterSourceKey(computedImageUrl);
  if (computed) keys.add(computed);
  keys.add(`seed:${file.recordId}`);

  return [...keys];
}

/**
 * Lowercases a title and collapses every run of punctuation and whitespace to
 * one space, so "Foo: Bar!" and "foo bar" compare equal. Used to decide
 * whether several posters are copies of one record.
 *
 * Note the title lookup in {@link createMatcher} uses a stricter key (only
 * trimmed and lowercased), so punctuation still has to match there.
 */
function normalizeTitle(title: string): string {
  return title
    .toLowerCase()
    .replace(/[^\p{L}\p{N}]+/gu, " ")
    .trim();
}

/**
 * Trims and lowercases an identifier part.
 *
 * @returns The normalized string, or null for blanks and non-strings.
 */
function normalizeIdentifierValue(value: unknown): string | null {
  if (typeof value !== "string") return null;
  const normalized = value.trim().toLowerCase();

  return normalized.length > 0 ? normalized : null;
}

/**
 * Turns an identifiers array into `type|value` tokens (both lowercased) that
 * can be compared between a record and a poster. Accepts DataCite
 * `identifiers`, `nameIdentifiers` and `relatedIdentifiers` entries. Entries
 * without a value are skipped, and a missing type becomes "unknown".
 *
 * @example
 * collectIdentifierTokens([{ identifier: "123", identifierType: "Zenodo" }]);
 * // Set { "zenodo|123" }
 *
 * @param identifiers - Any value; anything but an array gives an empty set.
 */
function collectIdentifierTokens(identifiers: unknown): Set<string> {
  const tokens = new Set<string>();
  if (!Array.isArray(identifiers)) return tokens;

  for (const raw of identifiers) {
    if (!raw || typeof raw !== "object") continue;

    const entry = raw as {
      identifier?: unknown;
      identifierType?: unknown;
      nameIdentifier?: unknown;
      nameIdentifierType?: unknown;
      relatedIdentifier?: unknown;
      relatedIdentifierType?: unknown;
    };

    const identifier =
      normalizeIdentifierValue(entry.identifier) ??
      normalizeIdentifierValue(entry.nameIdentifier) ??
      normalizeIdentifierValue(entry.relatedIdentifier);

    if (!identifier) continue;

    const type =
      normalizeIdentifierValue(entry.identifierType) ??
      normalizeIdentifierValue(entry.nameIdentifierType) ??
      normalizeIdentifierValue(entry.relatedIdentifierType) ??
      "unknown";

    tokens.add(`${type}|${identifier}`);
  }

  return tokens;
}

/**
 * True when two token sets from {@link collectIdentifierTokens} share at least
 * one token. An empty set never overlaps.
 */
function hasIdentifierOverlap(a: Set<string>, b: Set<string>): boolean {
  if (a.size === 0 || b.size === 0) return false;

  for (const token of a) {
    if (b.has(token)) return true;
  }

  return false;
}

/** One failed record in the error report. */
type ErrorReportItem = {
  /** Position of the file in the sorted file list */
  index: number;
  filePath: string;
  fileName: string;
  /**
   * Where it failed. parse: unreadable JSON. match: ambiguous match, or another
   * record claims the same poster. upsert: the database write failed.
   */
  phase: "parse" | "match" | "upsert";
  message: string;
  doi: string | null;
  title: string | null;
  publisher: string | null;
};

/**
 * An automated, published poster already in the database, with the fields
 * matching and tombstoning need. Loaded once per run by
 * {@link loadAutomatedPosters}.
 */
type ExistingPoster = {
  id: number;
  /** {@link IMPORT_USER_ID} for imported posters; anything else is a user's */
  userId: string;
  title: string;
  imageUrl: string;
  tombstone: boolean;
  tombedReason: string;
  /** Root poster of its version family; null for a root or an unversioned poster */
  versionRootId: number | null;
  /** Like count, used to pick which duplicate copy survives */
  likes: number;
  /** Lowercased, with a blank DOI stored as null */
  doi: string | null;
  identifiers: unknown;
};

/** Which matching rule found the existing poster (see the file header). */
type MatchedBy = "doi" | "source-file" | "title-identifiers";

/**
 * What matching needs from a record. The mapped metadata itself is rebuilt
 * when the record is written, because holding it for a whole corpus of
 * posters exhausts the heap.
 */
type PlannedRecord = {
  /** Position of the file in the sorted file list */
  index: number;
  file: SourceFile;
  doi: string | null;
  title: string;
  publisher: string | null;
  licenseBlocked: boolean;
  /** Thumbnail from {@link getImageUrl}: used for new posters, and as the placeholder once a record is license-blocked */
  imageUrl: string;
  /** Poster this record updates, or null when it would create a new one */
  existing: ExistingPoster | null;
  matchedBy: MatchedBy | null;
  /** Real thumbnail to replace a placeholder the record no longer needs */
  thumbnailUpgrade: string | null;
  /** Other posters holding a copy of this record, retired as duplicates */
  duplicates: ExistingPoster[];
};

/**
 * What happened to a record, as listed in the run report:
 *   - update / create: written (in a dry run, would be written)
 *   - skip-create: a new record not created, because of --update-only or
 *     --create-only
 *   - skip-tombstoned: matched a poster an admin retired, so left alone
 *   - deferred: held back by --defer-reconciliation for review
 *   - error: could not be matched or written; see the error report
 */
type RecordAction =
  | "update"
  | "create"
  | "skip-create"
  | "skip-tombstoned"
  | "deferred"
  | "error";

/** One record file in the run report's `records` list. */
type ReportRecord = {
  action: RecordAction;
  filePath: string;
  posterId: number | null;
  matchedBy: MatchedBy | null;
  doi: string | null;
  title: string | null;
  message?: string;
};

/** A poster the run means to tombstone, listed in the run report. */
type TombstonePlan = {
  /** duplicate: a second copy of a record; missing: no record matches it */
  kind: "duplicate" | "missing";
  posterId: number;
  doi: string | null;
  title: string;
  /** Saved as the poster's tombedReason */
  reason: string;
  /**
   * planned: will be tombstoned (or would be, in a dry run).
   * tombstoned: done. error: the write failed, see `message`.
   * blocked: needs a person to decide, see {@link blockVersionFamilies}.
   */
  status: "planned" | "tombstoned" | "blocked" | "error";
  message?: string;
};

/**
 * Default report location, `<cwd>/reports/add-extracted-posters-<kind>-<time>.json`.
 *
 * @param cwd - Directory the script was started from.
 * @param kind - "run", "dry-run" or "errors".
 */
function createDefaultReportPath(cwd: string, kind: string): string {
  const stamp = new Date().toISOString().replace(/[:.]/g, "-");

  return path.join(
    cwd,
    "reports",
    `add-extracted-posters-${kind}-${stamp}.json`,
  );
}

/** host:port/db only, so the target can be logged without its credentials */
function describeDatabase(connectionString: string): string {
  const url = new URL(connectionString);

  return `${url.hostname}:${url.port || "5432"}${url.pathname}`;
}

/**
 * Trims and lowercases a DOI read from the database, so it compares equal to
 * the DOIs {@link mapToDbFields} produces.
 *
 * @returns The DOI, or null when it is missing or blank.
 */
function normalizeDoi(value: string | null | undefined): string | null {
  // Some rows store a blank string rather than null, so treat empty as absent.
  const normalized = value?.trim().toLowerCase();

  return normalized ? normalized : null;
}

/**
 * Groups items by a key, keeping their order within each group.
 *
 * @param getKey - Returns the group key, or null to leave the item out.
 */
function groupBy<T>(
  items: T[],
  getKey: (item: T) => string | null,
): Map<string, T[]> {
  const groups = new Map<string, T[]>();
  for (const item of items) {
    const key = getKey(item);
    if (key === null) continue;
    const group = groups.get(key) ?? [];
    group.push(item);
    groups.set(key, group);
  }

  return groups;
}

/**
 * Loads every automated, published poster, tombstoned ones included, so
 * records can be matched against them. Posters people uploaded themselves
 * (`automated: false`) and unpublished ones are never loaded, so this script
 * never updates or tombstones them.
 *
 * @returns The posters, oldest first.
 */
async function loadAutomatedPosters(
  prisma: PrismaClient,
): Promise<ExistingPoster[]> {
  const rows = await prisma.poster.findMany({
    where: { automated: true, status: "published" },
    select: {
      id: true,
      userId: true,
      title: true,
      imageUrl: true,
      tombstone: true,
      tombedReason: true,
      versionRootId: true,
      _count: { select: { likes: true } },
      posterMetadata: { select: { doi: true, identifiers: true } },
    },
    orderBy: { id: "asc" },
  });

  return rows.map((row) => ({
    id: row.id,
    userId: row.userId,
    title: row.title,
    imageUrl: row.imageUrl,
    tombstone: row.tombstone,
    tombedReason: row.tombedReason,
    versionRootId: row.versionRootId,
    likes: row._count.likes,
    doi: normalizeDoi(row.posterMetadata?.doi),
    identifiers: row.posterMetadata?.identifiers ?? [],
  }));
}

/** The parts of a mapped record that matching looks at. */
type MatchInput = Pick<
  ReturnType<typeof mapToDbFields>,
  "doi" | "posterTitle" | "identifiers"
>;

/** Outcome of matching one record against the existing posters. */
type MatchResult = {
  /** Poster the record updates, or null when the record is new */
  existing: ExistingPoster | null;
  matchedBy: MatchedBy | null;
  /** Other copies of the same record that lost to `existing` in {@link pickKeeper} */
  duplicates: ExistingPoster[];
};

/**
 * Picks which of several copies of one record keeps its id: a live poster
 * over a tombstoned one, then one in a version family, then the most liked,
 * then one with a thumbnail, then the oldest.
 *
 * @param copies - Posters that all hold the same record.
 * @param familyIds - Ids of every poster that belongs to a version family.
 * @returns The poster the record will update; the others become duplicates.
 */
function pickKeeper(
  copies: ExistingPoster[],
  familyIds: Set<number>,
): ExistingPoster {
  return [...copies].sort(
    (a, b) =>
      Number(a.tombstone) - Number(b.tombstone) ||
      Number(familyIds.has(b.id)) - Number(familyIds.has(a.id)) ||
      b.likes - a.likes ||
      Number(Boolean(b.imageUrl)) - Number(Boolean(a.imageUrl)) ||
      a.id - b.id,
  )[0];
}

/**
 * Indexes the existing posters once and returns a function that matches one
 * record at a time, following the order in the file header:
 *   1. DOI: the one poster with the record's DOI. Several is an error.
 *   2. Source file: posters whose thumbnail or placeholder seed points at this
 *      record's file. Title + identifier matches join the same group, since
 *      copies imported without a thumbnail have no source key.
 *   3. Title + identifiers: only for records without a DOI.
 * Steps 2 and 3 only consider posters whose DOI is missing or not carried by
 * any record in the corpus, so a poster whose DOI is still in use is never
 * taken over by a different record.
 *
 * When step 2 or 3 finds several posters, they must share a title (compared
 * with {@link normalizeTitle}) or the match throws; {@link pickKeeper} then
 * decides which one the record updates.
 *
 * @param posters - Every automated poster, from {@link loadAutomatedPosters}.
 * @param corpusDois - Every DOI carried by a record in this run.
 * @returns `match(file, input, imageUrl)`, which throws on an ambiguous match.
 */
function createMatcher(posters: ExistingPoster[], corpusDois: Set<string>) {
  const byDoi = groupBy(posters, (p) => p.doi);
  // A poster whose DOI no record carries any more (an older extraction took a
  // cited paper's DOI) can still be found through its source file or title.
  const unclaimedByDoi = posters.filter(
    (p) => !p.doi || !corpusDois.has(p.doi),
  );
  const bySourceKey = groupBy(unclaimedByDoi, (p) =>
    posterSourceKey(p.imageUrl),
  );
  const byTitle = groupBy(unclaimedByDoi, (p) => p.title.trim().toLowerCase());
  const familyIds = new Set(
    posters.flatMap((p) =>
      p.versionRootId === null ? [] : [p.id, p.versionRootId],
    ),
  );

  // Several posters for one record are copies left by earlier imports only
  // when they also share a title. Anything else is too ambiguous to merge.
  const resolve = (
    candidates: ExistingPoster[],
    matchedBy: MatchedBy,
    what: string,
  ): MatchResult => {
    const titles = new Set(candidates.map((p) => normalizeTitle(p.title)));
    if (titles.size > 1) {
      throw new Error(
        `${what} matches ${candidates.length} posters with different titles (${candidates.map((p) => p.id).join(", ")})`,
      );
    }
    const keeper = pickKeeper(candidates, familyIds);

    return {
      existing: keeper,
      matchedBy,
      duplicates: candidates.filter((p) => p !== keeper),
    };
  };

  return (
    file: SourceFile,
    input: MatchInput,
    imageUrl: string,
  ): MatchResult => {
    // Step 1: DOI.
    if (input.doi) {
      const matches = byDoi.get(input.doi) ?? [];
      if (matches.length > 1) {
        throw new Error(
          `DOI ${input.doi} matches ${matches.length} posters (${matches.map((p) => p.id).join(", ")})`,
        );
      }
      if (matches.length === 1) {
        return { existing: matches[0], matchedBy: "doi", duplicates: [] };
      }
    }

    // Same title and an identifier in common (usually the repository record
    // id). Copies imported without a thumbnail have no source key, so this is
    // the only way to find them.
    const titleIdentifierMatches = () => {
      const title = input.posterTitle.trim().toLowerCase();
      const incomingIdentifierTokens = collectIdentifierTokens(
        input.identifiers,
      );
      if (title.length === 0 || incomingIdentifierTokens.size === 0) return [];

      return (byTitle.get(title) ?? []).filter((candidate) =>
        hasIdentifierOverlap(
          incomingIdentifierTokens,
          collectIdentifierTokens(candidate.identifiers),
        ),
      );
    };

    // Step 2: source file.
    const sourceMatches = new Map<number, ExistingPoster>();
    for (const key of fileSourceKeys(file, imageUrl)) {
      for (const poster of bySourceKey.get(key) ?? []) {
        sourceMatches.set(poster.id, poster);
      }
    }
    if (sourceMatches.size > 0) {
      for (const poster of titleIdentifierMatches()) {
        sourceMatches.set(poster.id, poster);
      }

      return resolve([...sourceMatches.values()], "source-file", "Source file");
    }

    // Step 3: title + identifiers.
    if (!input.doi) {
      // Fallback match path for no-DOI records: title + identifiers overlap.
      const matches = titleIdentifierMatches();
      if (matches.length > 0) {
        return resolve(matches, "title-identifiers", "Title and identifiers");
      }
    }

    return { existing: null, matchedBy: null, duplicates: [] };
  };
}

/**
 * Points a tombstone at the poster it duplicates when one surviving poster
 * shares its title, so an admin can see why it was retired.
 *
 * Titles count as shared when they are equal after {@link normalizeTitle}, or
 * when one starts with the other and the shorter is at least 30 characters.
 *
 * @param poster - The poster being tombstoned because no record matched it.
 * @param survivors - Posters some record matched in this run.
 * @returns "Duplicate entry to poster id: <id>" when exactly one survivor
 *   shares the title, otherwise "No longer in the auto-indexed corpus".
 */
function tombstoneReason(
  poster: ExistingPoster,
  survivors: ExistingPoster[],
): string {
  const title = normalizeTitle(poster.title);
  const duplicates = survivors.filter((other) => {
    const otherTitle = normalizeTitle(other.title);
    if (otherTitle === title) return true;

    // Re-uploads often only add a word to the title, e.g. a place name.
    const [shorter, longer] =
      otherTitle.length < title.length
        ? [otherTitle, title]
        : [title, otherTitle];

    return shorter.length >= 30 && longer.startsWith(shorter);
  });

  if (duplicates.length === 1) {
    return `Duplicate entry to poster id: ${duplicates[0].id}`;
  }

  return "No longer in the auto-indexed corpus";
}

/** Owner of every poster this importer creates. */
const IMPORT_USER_ID = "0";

/**
 * Marks tombstone plans "blocked" when retiring the poster needs a person to
 * decide. Blocked plans are listed in the report but never applied.
 *
 *   - Owned by a user: only imported posters are ever retired, since a poster
 *     someone shared or claimed belongs to them.
 *   - In a version family: retiring one member would leave the others
 *     pointing at a hidden root, or leave a gap in the version sequence.
 *
 * @param plans - Tombstones planned so far.
 * @param posters - Every automated poster, to look up owners and families.
 * @returns The same plans, with the risky ones set to "blocked".
 */
function blockVersionFamilies(
  plans: TombstonePlan[],
  posters: ExistingPoster[],
): TombstonePlan[] {
  const versionRoots = new Set(
    posters.map((p) => p.versionRootId).filter((id) => id !== null),
  );
  const inFamily = new Set(
    posters
      .filter((p) => p.versionRootId !== null || versionRoots.has(p.id))
      .map((p) => p.id),
  );
  const userOwned = new Set(
    posters.filter((p) => p.userId !== IMPORT_USER_ID).map((p) => p.id),
  );

  return plans.map((plan) => {
    if (userOwned.has(plan.posterId)) {
      return {
        ...plan,
        status: "blocked",
        message: "Owned by a user, not imported; review by hand",
      };
    }
    if (inFamily.has(plan.posterId)) {
      return {
        ...plan,
        status: "blocked",
        message: "Part of a version family, review by hand",
      };
    }

    return plan;
  });
}

/**
 * Plans a tombstone for every extra copy of a record, with a reason that
 * names the copy that kept its id.
 *
 * @param copies - Each extra copy and the id of the poster that kept the record.
 * @param posters - Every automated poster, for {@link blockVersionFamilies}.
 */
function planDuplicateTombstones(
  copies: Array<{ poster: ExistingPoster; keeperId: number }>,
  posters: ExistingPoster[],
): TombstonePlan[] {
  return blockVersionFamilies(
    copies.map(({ poster, keeperId }) => ({
      kind: "duplicate",
      posterId: poster.id,
      doi: poster.doi,
      title: poster.title,
      reason: `Duplicate entry to poster id: ${keeperId}`,
      status: "planned",
    })),
    posters,
  );
}

/**
 * Plans a tombstone for every live poster that no record matched, which
 * means it is no longer in the corpus.
 *
 * @param posters - Every automated poster.
 * @param claimed - Ids of posters some record matched, conflicting records included.
 * @param duplicateIds - Ids already planned by {@link planDuplicateTombstones}.
 */
function planTombstones(
  posters: ExistingPoster[],
  claimed: Set<number>,
  duplicateIds: Set<number>,
): TombstonePlan[] {
  const survivors = posters.filter((p) => claimed.has(p.id));

  const plans = posters
    .filter(
      (p) => !p.tombstone && !claimed.has(p.id) && !duplicateIds.has(p.id),
    )
    .map(
      (poster): TombstonePlan => ({
        kind: "missing",
        posterId: poster.id,
        doi: poster.doi,
        title: poster.title,
        reason: tombstoneReason(poster, survivors),
        status: "planned",
      }),
    );

  return blockVersionFamilies(plans, posters);
}

/** True for a dicebear placeholder, the image license-blocked posters get. */
const isPlaceholder = (imageUrl: string) =>
  imageUrl.includes("api.dicebear.com");

/**
 * Looks for a generated thumbnail on the CDN, trying the URL the importer
 * would build and then the one named after the source folder.
 *
 * @param file - The record file.
 * @param computedImageUrl - The URL {@link getImageUrl} built for the record.
 * @returns The first URL that answers a HEAD request with an image, or null.
 *   A network error counts as no thumbnail.
 */
async function findCdnThumbnail(
  file: SourceFile,
  computedImageUrl: string,
): Promise<string | null> {
  const candidates = new Set<string>();
  if (computedImageUrl.startsWith("https://cdn.posters.science/")) {
    candidates.add(computedImageUrl);
  }
  candidates.add(
    `https://cdn.posters.science/thumbnails/a/${file.source}_${file.recordId}.jpeg`,
  );

  for (const url of candidates) {
    try {
      const res = await fetch(url, { method: "HEAD" });
      if (res.ok && res.headers.get("content-type")?.startsWith("image/")) {
        return url;
      }
    } catch {
      // Treat an unreachable CDN as no thumbnail.
    }
  }

  return null;
}

/** The admin that tombstones are logged under in the admin audit log. */
type AuditAdmin = { id: string; emailAddress: string };

/**
 * Looks up the --audit-email account (case-insensitive). Runs before anything
 * is written, so a typo fails the run straight away.
 *
 * @throws When no user has that email, or the user is not an admin.
 */
async function findAuditAdmin(
  prisma: PrismaClient,
  email: string,
): Promise<AuditAdmin> {
  const admin = await prisma.user.findFirst({
    where: { emailAddress: { equals: email.trim(), mode: "insensitive" } },
    select: { id: true, emailAddress: true, role: true },
  });
  if (!admin) throw new Error(`No user with email ${email}`);
  if (admin.role !== "admin") throw new Error(`${email} is not an admin`);

  return { id: admin.id, emailAddress: admin.emailAddress };
}

/**
 * Tombstones a poster and records it in the admin audit log, like /admin does.
 * Both writes happen in one transaction.
 *
 * @param reason - Saved as the poster's tombedReason.
 * @param admin - The admin the audit entry is logged under.
 */
async function tombstonePoster(
  prisma: PrismaClient,
  poster: ExistingPoster,
  reason: string,
  admin: AuditAdmin,
) {
  await prisma.$transaction(async (tx) => {
    await tx.poster.update({
      where: { id: poster.id },
      data: { tombstone: true, tombedReason: reason },
    });

    await tx.adminAuditLog.create({
      data: {
        adminUserId: admin.id,
        action: "TOMBSTONE_POSTER",
        entityType: "poster",
        entityId: String(poster.id),
        details: { title: poster.title, ownerId: poster.userId, reason },
      },
    });
  });
}

/**
 * Picks the `PosterMetadata` columns from {@link mapToDbFields} output. Updates
 * and creations both use it, so they always write the same fields.
 */
function metadataPayload(mapped: ReturnType<typeof mapToDbFields>) {
  return {
    doi: mapped.doi,
    identifiers: mapped.identifiers,
    creators: mapped.creators,
    publisher: mapped.publisher,
    publicationYear: mapped.publicationYear,
    subjects: mapped.subjects,
    language: mapped.language,
    relatedIdentifiers: mapped.relatedIdentifiers,
    size: mapped.size,
    format: mapped.format,
    version: mapped.version,
    license: mapped.license,
    fundingReferences: mapped.fundingReferences,
    conferenceName: mapped.conferenceName,
    conferenceLocation: mapped.conferenceLocation,
    conferenceUri: mapped.conferenceUri,
    conferenceIdentifier: mapped.conferenceIdentifier,
    conferenceIdentifierType: mapped.conferenceIdentifierType,
    conferenceYear: mapped.conferenceYear,
    conferenceStartDate: mapped.conferenceStartDate,
    conferenceEndDate: mapped.conferenceEndDate,
    conferenceAcronym: mapped.conferenceAcronym,
    conferenceSeries: mapped.conferenceSeries,
    posterContent: mapped.posterContent,
    tableCaptions: mapped.tableCaptions,
    imageCaptions: mapped.imageCaptions,
    domain: mapped.domain,
    dates: mapped.dates,
  };
}

/**
 * Reads and maps a record file again right before it is written. Planning
 * does not keep the mapped records, because holding a whole corpus of them
 * runs out of memory (see {@link PlannedRecord}).
 *
 * @throws When the file's DOI no longer matches the plan, i.e. the file was
 *   edited during the run.
 */
function loadMapped(record: PlannedRecord) {
  const data = JSON.parse(
    fs.readFileSync(record.file.filePath, "utf-8"),
  ) as JsonPoster;
  const mapped = mapToDbFields(data);
  if (mapped.doi !== record.doi) {
    throw new Error(
      `DOI changed since planning (${record.doi} -> ${mapped.doi}), rerun the import`,
    );
  }

  return mapped;
}

/**
 * Replaces a matched poster's title, description, dates and metadata with the
 * record's, in one transaction. The id, owner, likes and version family links
 * are left as they are. The publish, created and updated dates are all set to
 * the record's date.
 *
 * @param record - A planned record whose `existing` poster is set.
 */
async function updatePoster(prisma: PrismaClient, record: PlannedRecord) {
  const { existing } = record;
  if (!existing) throw new Error("updatePoster needs a matched poster");
  const mapped = loadMapped(record);

  // Keep the thumbnail people already see. Swap in the placeholder when the
  // record's license now blocks showing the poster, and swap a placeholder
  // out once the record is unblocked and the CDN has a real thumbnail.
  const hideThumbnail =
    record.licenseBlocked && !isPlaceholder(existing.imageUrl);
  const imageUrl = hideThumbnail ? record.imageUrl : record.thumbnailUpgrade;

  await prisma.$transaction(async (tx) => {
    await tx.poster.update({
      where: { id: existing.id },
      data: {
        title: mapped.posterTitle,
        description: mapped.posterDescription,
        publishedAt: mapped.submittedAt,
        updated: mapped.submittedAt,
        created: mapped.submittedAt,
        ...(imageUrl ? { imageUrl } : {}),
      },
    });

    await tx.posterMetadata.update({
      where: { posterId: existing.id },
      data: metadataPayload(mapped),
    });
  });
}

/**
 * Creates a new automated, published poster and its metadata in one
 * transaction, using the thumbnail from {@link getImageUrl}.
 *
 * @param record - A planned record with no `existing` poster.
 * @param userId - Owner of the new poster, {@link IMPORT_USER_ID}.
 * @returns The new poster's id.
 */
async function createPoster(
  prisma: PrismaClient,
  record: PlannedRecord,
  userId: string,
): Promise<number> {
  const mapped = loadMapped(record);

  const poster = await prisma.$transaction(async (tx) => {
    const p = await tx.poster.create({
      data: {
        userId,
        title: mapped.posterTitle,
        description: mapped.posterDescription,
        imageUrl: record.imageUrl,
        automated: true,
        status: "published",
        publishedAt: mapped.submittedAt,
        created: mapped.submittedAt,
        updated: mapped.submittedAt,
        randomInt: Math.floor(Math.random() * 1000000),
      },
      select: { id: true },
    });

    await tx.posterMetadata.create({
      data: { posterId: p.id, ...metadataPayload(mapped) },
      select: { posterId: true },
    });

    return p;
  });

  return poster.id;
}

/**
 * Runs `worker` over `items`, in order, with at most `concurrency` calls in
 * flight. A worker that throws rejects the whole pool, so workers should
 * catch and record their own errors.
 */
async function runPool<T>(
  items: T[],
  concurrency: number,
  worker: (item: T) => Promise<void>,
) {
  let next = 0;
  const lanes = Array.from(
    { length: Math.max(1, Math.min(concurrency, items.length)) },
    async () => {
      while (next < items.length) {
        const item = items[next++];
        await worker(item);
      }
    },
  );
  await Promise.all(lanes);
}

/**
 * Builds a run report entry for a record.
 *
 * @param posterId - The poster written or matched, or null when there is none.
 * @param message - Optional detail, e.g. why the record was skipped.
 */
function toReportRecord(
  record: PlannedRecord,
  action: RecordAction,
  posterId: number | null,
  message?: string,
): ReportRecord {
  return {
    action,
    filePath: record.file.filePath,
    posterId,
    matchedBy: record.matchedBy,
    doi: record.doi,
    title: record.title,
    ...(message ? { message } : {}),
  };
}

/**
 * Runs one import: parse the CLI options, plan every record, apply the plan
 * (unless --dry-run), then write the reports. See the file header for the
 * options and the rules each step follows.
 *
 * @throws Before writing anything, when the options conflict, the database
 *   URL is missing, or a safety check fails.
 */
async function main() {
  // Options. See the file header for what each one does.
  const userId = IMPORT_USER_ID;
  const limitArg = getArg("limit");
  const limit = limitArg ? Number(limitArg) : Infinity;
  const dirs = getArgs("dir");
  if (dirs.length === 0) dirs.push(path.join(process.cwd(), "merged"));
  const databaseEnv = getArg("database-env") ?? "DATABASE_URL";
  const dryRun = hasFlag("dry-run");
  const updateOnly = hasFlag("update-only");
  const createOnlyPath = getArg("create-only");
  // Blob paths, compared on their last four segments:
  // <corpus>/merged/<source>/<id>_complete.json
  const createOnly = createOnlyPath
    ? new Set(
        fs
          .readFileSync(createOnlyPath, "utf-8")
          .split(/\r?\n/)
          .map((line) => line.trim().replaceAll("\\", "/"))
          .filter((line) => line && !line.startsWith("#"))
          .map((line) => line.split("/").slice(-4).join("/")),
      )
    : null;
  const tombstoneMissing = hasFlag("tombstone-missing");
  const deferReconciliation = hasFlag("defer-reconciliation");
  const maxTombstones = Number(getArg("max-tombstones") ?? 25);
  const auditEmail = getArg("audit-email");
  const concurrency = Number(getArg("concurrency") ?? 4);
  const reportPath =
    getArg("report") ??
    createDefaultReportPath(process.cwd(), dryRun ? "dry-run" : "run");
  const errorReportPath =
    getArg("error-report") ?? createDefaultReportPath(process.cwd(), "errors");

  // Option combinations that could tombstone the wrong posters.
  if (tombstoneMissing && deferReconciliation) {
    throw new Error(
      "--defer-reconciliation leaves duplicate copies for review, so it cannot be combined with --tombstone-missing",
    );
  }
  if (tombstoneMissing && Number.isFinite(limit)) {
    throw new Error(
      "--tombstone-missing needs the full corpus, so it cannot be combined with --limit",
    );
  }
  if (tombstoneMissing && !dryRun && !auditEmail) {
    throw new Error(
      "--tombstone-missing needs --audit-email so each tombstone is logged under an admin, as /admin does",
    );
  }

  // Print the target first so a run against the wrong database is obvious.
  const connectionString = process.env[databaseEnv];
  if (!connectionString) throw new Error(`${databaseEnv} is not set`);
  const database = describeDatabase(connectionString);

  console.log(`\n Database: ${database} (from ${databaseEnv})`);
  console.log(` Importing posters for userId: ${userId}`);
  if (dryRun) console.log(" Dry run: nothing will be written");

  const adapter = new PrismaPg({ connectionString });
  const prisma = new PrismaClient({ adapter });

  try {
    const allFiles = dirs.flatMap((dir) => collectJsonFiles(dir));
    console.log(` Found ${allFiles.length} JSON files in ${dirs.join(", ")}`);

    const auditAdmin = auditEmail
      ? await findAuditAdmin(prisma, auditEmail)
      : null;
    if (auditAdmin) {
      console.log(` Tombstones are logged under ${auditAdmin.emailAddress}`);
    }

    const posters = await loadAutomatedPosters(prisma);
    console.log(` Loaded ${posters.length} automated published posters`);

    const erroredItems: ErrorReportItem[] = [];
    const reportRecords: ReportRecord[] = [];
    const planned: PlannedRecord[] = [];
    // Records with no Issued or Submitted date get the load time as their
    // publish date, so list them for a fix in the blob.
    const undatedRecords: Array<{ filePath: string; doi: string | null }> = [];

    // 1. Plan: read every record, then match it, before anything is written.
    // Matching needs every DOI in the corpus up front, to tell a poster's
    // outdated DOI from one a record still carries.

    // 1a. Read and map every file, and collect the corpus DOIs.
    const parsed: Array<{ record: PlannedRecord; input: MatchInput }> = [];
    const corpusDois = new Set<string>();
    for (let i = 0; i < allFiles.length; i++) {
      const file = allFiles[i];
      const { filePath } = file;

      let data: JsonPoster;
      try {
        data = JSON.parse(fs.readFileSync(filePath, "utf-8")) as JsonPoster;
      } catch (err: any) {
        console.warn(`     Could not parse ${filePath}`);
        erroredItems.push({
          index: i,
          filePath,
          fileName: path.basename(filePath),
          phase: "parse",
          message: err?.message ?? "Could not parse JSON",
          doi: null,
          title: null,
          publisher: null,
        });
        continue;
      }

      const mapped = mapToDbFields(data);
      if (!mapped.hasRecordDate) {
        undatedRecords.push({ filePath, doi: mapped.doi });
      }
      const imageUrl = getImageUrl(
        filePath,
        mapped.doi,
        data.publisher,
        data._license_blocked,
      );
      const record: PlannedRecord = {
        index: i,
        file,
        doi: mapped.doi,
        title: mapped.posterTitle,
        publisher: mapped.publisher,
        licenseBlocked: data._license_blocked === true,
        imageUrl,
        existing: null,
        matchedBy: null,
        thumbnailUpgrade: null,
        duplicates: [],
      };
      if (mapped.doi) corpusDois.add(mapped.doi);
      parsed.push({
        record,
        input: {
          doi: mapped.doi,
          posterTitle: mapped.posterTitle,
          identifiers: mapped.identifiers,
        },
      });
    }

    // 1b. Match each record to an existing poster (or none, for a new one).
    const matchPoster = createMatcher(posters, corpusDois);
    for (const { record, input } of parsed) {
      try {
        Object.assign(record, matchPoster(record.file, input, record.imageUrl));
        planned.push(record);
      } catch (err: any) {
        erroredItems.push({
          index: record.index,
          filePath: record.file.filePath,
          fileName: path.basename(record.file.filePath),
          phase: "match",
          message: err?.message ?? "Could not match poster",
          doi: record.doi,
          title: record.title,
          publisher: record.publisher,
        });
        reportRecords.push(toReportRecord(record, "error", null, err?.message));
      }
    }

    // 1c. Conflicts.
    // A poster can only take one record's metadata. Two records landing on the
    // same poster (or two new records sharing a DOI) means the corpus has a
    // duplicate, so neither is applied.
    const conflicts = new Set<PlannedRecord>();
    const byPoster = groupBy(planned, (r) =>
      r.existing ? String(r.existing.id) : null,
    );
    const newByDoi = groupBy(
      planned.filter((r) => !r.existing),
      (r) => r.doi,
    );
    for (const [key, group] of [...byPoster, ...newByDoi]) {
      if (group.length < 2) continue;
      const target = group[0].existing ? `poster ${key}` : `DOI ${key}`;
      const message = `${group.length} records claim ${target}: ${group.map((r) => path.basename(r.file.filePath)).join(", ")}`;
      for (const record of group) {
        conflicts.add(record);
        erroredItems.push({
          index: record.index,
          filePath: record.file.filePath,
          fileName: path.basename(record.file.filePath),
          phase: "match",
          message,
          doi: record.doi,
          title: record.title,
          publisher: record.publisher,
        });
        reportRecords.push(toReportRecord(record, "error", null, message));
      }
    }

    // 1d. Sort each record into update, create or skip. `claimed` collects
    // every poster some record matched; whatever is left over is missing.
    const claimed = new Set<number>();
    const toUpdate: PlannedRecord[] = [];
    const toCreate: PlannedRecord[] = [];
    let skipped = 0;
    let skippedNew = 0;
    for (const record of planned) {
      const { existing } = record;
      // A conflicting record still proves its poster is in the corpus.
      if (existing) claimed.add(existing.id);
      if (conflicts.has(record)) continue;

      // Tombstoned posters were deliberately retired by an admin (e.g. license
      // or content issue). Re-importing must not resurrect or overwrite them.
      if (existing?.tombstone) {
        skipped++;
        reportRecords.push(
          toReportRecord(
            record,
            "skip-tombstoned",
            existing.id,
            existing.tombedReason || "no reason recorded",
          ),
        );
        continue;
      }

      if (existing) toUpdate.push(record);
      else if (updateOnly) {
        skippedNew++;
        reportRecords.push(toReportRecord(record, "skip-create", null));
      } else if (
        createOnly &&
        !createOnly.has(
          record.file.filePath
            .replaceAll("\\", "/")
            .split("/")
            .slice(-4)
            .join("/"),
        )
      ) {
        skippedNew++;
        reportRecords.push(
          toReportRecord(record, "skip-create", null, "not in --create-only"),
        );
      } else toCreate.push(record);
    }

    // 1e. Outdated DOIs, listed in the report.
    // Posters matched by source file or title whose DOI the record no longer
    // has. The update writes the record's DOI (or none), as in the blob.
    const outdatedDois = toUpdate
      .filter((r) => r.existing!.doi && r.existing!.doi !== r.doi)
      .map((r) => ({
        posterId: r.existing!.id,
        from: r.existing!.doi,
        to: r.doi,
      }));

    // 1f. Deferred updates.
    // With --defer-reconciliation, matches that would retire duplicate copies
    // or replace an existing DOI are left alone so they can be reviewed first.
    // A later run without the flag applies them.
    const liveCopies = (record: PlannedRecord) =>
      record.duplicates.filter((d) => !d.tombstone && !claimed.has(d.id));
    let deferred = 0;
    if (deferReconciliation) {
      for (let i = toUpdate.length - 1; i >= 0; i--) {
        const record = toUpdate[i];
        const copies = liveCopies(record);
        const replacesDoi =
          record.existing!.doi !== null && record.existing!.doi !== record.doi;
        if (copies.length === 0 && !replacesDoi) continue;

        toUpdate.splice(i, 1);
        deferred++;
        const reasons = [
          copies.length > 0
            ? `duplicate copies: ${copies.map((d) => d.id).join(", ")}`
            : null,
          replacesDoi ? `would replace DOI ${record.existing!.doi}` : null,
        ].filter(Boolean);
        reportRecords.push(
          toReportRecord(
            record,
            "deferred",
            record.existing!.id,
            reasons.join("; "),
          ),
        );
      }
    }

    // 1g. Thumbnail upgrades. This checks the CDN, so it runs in a dry run too.
    // A poster on a placeholder, or with no image at all (older imports gave
    // records without a DOI none), gets the CDN thumbnail when its record is
    // not license-blocked and the CDN actually has one.
    const thumbnailUpgrades: Array<{
      posterId: number;
      from: string;
      to: string;
    }> = [];
    for (const record of toUpdate) {
      const { existing } = record;
      if (!existing || record.licenseBlocked) continue;
      if (existing.imageUrl && !isPlaceholder(existing.imageUrl)) continue;

      record.thumbnailUpgrade = await findCdnThumbnail(
        record.file,
        record.imageUrl,
      );
      if (record.thumbnailUpgrade) {
        thumbnailUpgrades.push({
          posterId: existing.id,
          from: existing.imageUrl,
          to: record.thumbnailUpgrade,
        });
      }
    }

    // 1h. Duplicate copies and tombstones.
    // Copies of a record beyond the one that keeps its id. A copy that another
    // record matched is not a duplicate.
    const duplicateCopies = new Map<
      number,
      { poster: ExistingPoster; keeperId: number }
    >();
    for (const record of planned) {
      if (conflicts.has(record) || !record.existing) continue;
      for (const copy of record.duplicates) {
        if (claimed.has(copy.id) || copy.tombstone) continue;
        if (duplicateCopies.has(copy.id)) continue;
        duplicateCopies.set(copy.id, {
          poster: copy,
          keeperId: record.existing.id,
        });
      }
    }

    const tombstones = tombstoneMissing
      ? [
          ...planDuplicateTombstones([...duplicateCopies.values()], posters),
          ...planTombstones(posters, claimed, new Set(duplicateCopies.keys())),
        ]
      : [];
    const plannedTombstones = tombstones.filter((t) => t.status === "planned");

    // 1i. Print the plan, then the safety checks. A dry run skips the checks,
    // so it still writes a report for a plan a real run would refuse.
    const matchedBy = groupBy(toUpdate, (r) => r.matchedBy);
    console.log(
      ` Plan: update ${toUpdate.length} (${[...matchedBy].map(([k, v]) => `${k} ${v.length}`).join(", ")}), ` +
        `create ${toCreate.length}, skip new ${skippedNew}, skip tombstoned ${skipped}, ` +
        `duplicate copies ${duplicateCopies.size}, outdated DOIs ${outdatedDois.length}, deferred ${deferred}, ` +
        `tombstone ${plannedTombstones.length} (blocked ${tombstones.length - plannedTombstones.length}), ` +
        `thumbnail upgrades ${thumbnailUpgrades.length}, errors ${erroredItems.length}`,
    );
    if (undatedRecords.length > 0) {
      console.warn(
        ` ${undatedRecords.length} records have no Issued or Submitted date and will be dated with the load time (listed in the run report)`,
      );
    }

    if (tombstoneMissing && erroredItems.length > 0 && !dryRun) {
      throw new Error(
        "Refusing to tombstone while some records failed to parse or match, since their posters would look missing. Fix the errors or drop --tombstone-missing.",
      );
    }
    if (plannedTombstones.length > maxTombstones && !dryRun) {
      throw new Error(
        `Refusing to tombstone ${plannedTombstones.length} posters (limit ${maxTombstones}). Check --dir points at the full corpus, or raise --max-tombstones.`,
      );
    }

    // 2. Apply. A dry run only records what it would have written.
    // 2a. Updates and creations, in parallel. --limit cuts the list here.
    const writes = [
      ...toUpdate.map((record) => ({ kind: "update" as const, record })),
      ...toCreate.map((record) => ({ kind: "create" as const, record })),
    ].slice(0, limit);
    let created = 0;
    let updated = 0;
    let done = 0;
    const startedAt = Date.now();

    if (dryRun) {
      for (const { kind, record } of writes) {
        reportRecords.push(
          toReportRecord(record, kind, record.existing?.id ?? null),
        );
      }
    } else {
      await runPool(writes, concurrency, async ({ kind, record }) => {
        try {
          if (kind === "update") {
            await updatePoster(prisma, record);
            updated++;
            reportRecords.push(
              toReportRecord(record, "update", record.existing!.id),
            );
          } else {
            const posterId = await createPoster(prisma, record, userId);
            created++;
            reportRecords.push(toReportRecord(record, "create", posterId));
            console.log(
              `    [created] ${posterId} - ${record.title.slice(0, 60)}\n      imageUrl: ${record.imageUrl || "(none)"}`,
            );
          }
        } catch (err: any) {
          console.warn(
            `    Failed: ${record.file.filePath}\n      ${err?.message}`,
          );
          erroredItems.push({
            index: record.index,
            filePath: record.file.filePath,
            fileName: path.basename(record.file.filePath),
            phase: "upsert",
            message: err?.message ?? "Unknown upsert error",
            doi: record.doi,
            title: record.title,
            publisher: record.publisher,
          });
          reportRecords.push(
            toReportRecord(
              record,
              "error",
              record.existing?.id ?? null,
              err?.message,
            ),
          );
        }

        done++;
        if (done % 500 === 0 || done === writes.length) {
          const seconds = Math.round((Date.now() - startedAt) / 1000);
          console.log(`Progress: ${done}/${writes.length} (${seconds}s)`);
        }
      });

      // 2b. Tombstones, one at a time, after every write has finished.
      const postersById = new Map(posters.map((p) => [p.id, p]));
      for (const tombstone of plannedTombstones) {
        try {
          await tombstonePoster(
            prisma,
            postersById.get(tombstone.posterId)!,
            tombstone.reason,
            auditAdmin!,
          );
          tombstone.status = "tombstoned";
          console.log(
            `    [tombstoned] ${tombstone.posterId} - ${tombstone.reason}`,
          );
        } catch (err: any) {
          tombstone.status = "error";
          tombstone.message = err?.message ?? "Unknown tombstone error";
        }
      }
    }

    // 3. Reports. In a dry run the totals are what the plan would do.
    const totals = {
      files: allFiles.length,
      updated: dryRun ? toUpdate.length : updated,
      created: dryRun ? toCreate.length : created,
      skippedNew,
      skippedTombstoned: skipped,
      deferred,
      tombstoned: tombstones.filter((t) =>
        dryRun ? t.status === "planned" : t.status === "tombstoned",
      ).length,
      tombstonesBlocked: tombstones.filter((t) => t.status === "blocked")
        .length,
      errored: erroredItems.length,
    };

    fs.mkdirSync(path.dirname(reportPath), { recursive: true });
    fs.writeFileSync(
      reportPath,
      JSON.stringify(
        {
          generatedAt: new Date().toISOString(),
          database,
          dirs,
          dryRun,
          updateOnly,
          tombstoneMissing,
          auditEmail: auditAdmin?.emailAddress ?? null,
          totals,
          tombstones,
          duplicateCopies: [...duplicateCopies.values()].map(
            ({ poster, keeperId }) => ({
              posterId: poster.id,
              keeperId,
              doi: poster.doi,
              title: poster.title,
            }),
          ),
          outdatedDois,
          thumbnailUpgrades,
          undatedRecords,
          records: reportRecords.sort((a, b) =>
            a.filePath.localeCompare(b.filePath),
          ),
        },
        null,
        2,
      ),
    );
    console.log(`Run report written to: ${reportPath}`);

    if (erroredItems.length > 0) {
      fs.mkdirSync(path.dirname(errorReportPath), { recursive: true });
      fs.writeFileSync(
        errorReportPath,
        JSON.stringify(
          {
            generatedAt: new Date().toISOString(),
            database,
            dirs,
            totals,
            items: erroredItems,
          },
          null,
          2,
        ),
      );
      console.log(`Error report written to: ${errorReportPath}`);
    }

    console.log(
      `\n🎉 Done${dryRun ? " (dry run)" : ""}. Created: ${totals.created}, Updated: ${totals.updated}, ` +
        `Skipped new: ${totals.skippedNew}, Skipped (tombstoned): ${totals.skippedTombstoned}, ` +
        `Tombstoned: ${totals.tombstoned}, Errored: ${totals.errored}\n`,
    );
  } finally {
    await prisma.$disconnect();
  }
}

// Only run when executed directly, so other scripts can import the mappers.
const isEntryPoint =
  process.argv[1] !== undefined &&
  import.meta.url === pathToFileURL(path.resolve(process.argv[1])).href;

if (isEntryPoint) {
  main().catch((err) => {
    console.error("\n Import failed:");
    console.error(err);
    process.exitCode = 1;
  });
}
