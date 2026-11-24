import { isValidOrcidChecksum } from "../../shared/utils/orcid";

/**
 * Builds the Figshare item (article) payload for a poster, following the
 * draft crosswalk (poster-json-schema crosswalk/figshare.md, PR #17).
 *
 * Pure: no database, no network, no Nuxt auto-imports, so it can be checked
 * with `npx tsx scripts/check-figshare.ts`. The deposit client lives in
 * figshare.ts.
 */

/** Figshare's description holds up to 20,000 characters (ArticleCreate). */
export const FIGSHARE_DESCRIPTION_MAX = 20_000;
export const FIGSHARE_TITLE_MIN = 3;
export const FIGSHARE_TITLE_MAX = 1_000;
/** First and last name of one author together. */
export const FIGSHARE_AUTHOR_NAME_MAX = 255;

/** DataCite relation types Figshare's related_materials accept. */
const FIGSHARE_RELATIONS = new Set([
  "IsCitedBy",
  "Cites",
  "IsSupplementTo",
  "IsSupplementedBy",
  "IsContinuedBy",
  "Continues",
  "Describes",
  "IsDescribedBy",
  "HasMetadata",
  "IsMetadataFor",
  "HasVersion",
  "IsVersionOf",
  "IsNewVersionOf",
  "IsPreviousVersionOf",
  "IsPartOf",
  "HasPart",
  "IsPublishedIn",
  "IsReferencedBy",
  "References",
  "IsDocumentedBy",
  "Documents",
  "IsCompiledBy",
  "Compiles",
  "IsVariantFormOf",
  "IsOriginalFormOf",
  "IsIdenticalTo",
  "IsReviewedBy",
  "Reviews",
  "IsDerivedFrom",
  "IsSourceOf",
  "IsRequiredBy",
  "Requires",
  "IsObsoletedBy",
  "Obsoletes",
]);

/** Figshare links the versions of an item itself, so these stay in poster.json. */
const VERSION_RELATIONS = new Set(["IsNewVersionOf", "IsPreviousVersionOf"]);

/** DataCite identifier types Figshare's related_materials accept. */
const FIGSHARE_IDENTIFIER_TYPES = new Set([
  "ARK",
  "arXiv",
  "bibcode",
  "DOI",
  "EAN13",
  "EISSN",
  "Handle",
  "IGSN",
  "ISBN",
  "ISSN",
  "ISTC",
  "LISSN",
  "LSID",
  "PMID",
  "PURL",
  "UPC",
  "URL",
  "URN",
  "w3id",
]);

export type DbCreator = {
  name?: string;
  givenName?: string;
  familyName?: string;
  nameType?: string;
  nameIdentifiers?: {
    nameIdentifier: string;
    nameIdentifierScheme?: string;
    schemeURI?: string;
  }[];
};

export type DbRelatedIdentifier = {
  relatedIdentifier?: string;
  relatedIdentifierType?: string;
  relationType?: string;
};

export type DbFundingReference = {
  funderName?: string;
  awardNumber?: string;
  awardTitle?: string;
};

/** The PosterMetadata fields the payload reads. */
export type FigshareSourceMetadata = {
  creators?: unknown;
  subjects?: string[] | null;
  identifiers?: unknown;
  relatedIdentifiers?: unknown;
  fundingReferences?: unknown;
  conferenceName?: string | null;
  conferenceAcronym?: string | null;
  conferenceLocation?: string | null;
  conferenceStartDate?: string | null;
  conferenceEndDate?: string | null;
  conferenceUri?: string | null;
  posterContent?: unknown;
};

export type FigshareAuthor = {
  name?: string;
  first_name?: string;
  last_name?: string;
  orcid_id?: string;
};

export type FigshareRelatedMaterial = {
  identifier: string;
  identifier_type: string;
  relation: string;
  title?: string;
};

export type FigshareArticlePayload = {
  title: string;
  defined_type: "poster";
  description: string;
  authors: FigshareAuthor[];
  keywords: string[];
  categories_by_source_id: string[];
  license?: number;
  related_materials: FigshareRelatedMaterial[];
  funding_list: { title: string }[];
};

export type FigshareArticleInput = {
  title: string;
  /** Poster.description */
  description: string;
  metadata: FigshareSourceMetadata;
  /** Figshare license id (`value` from GET /account/licenses). */
  licenseId?: number;
  /** Category source ids the user picked (ANZSRC codes on figshare.com). */
  categoryIds?: string[];
  /** The poster's public page on posters.science, sent as IsDescribedBy. */
  postersScienceUrl?: string;
  /** The DOI Figshare reserved for this item, left out of IsIdenticalTo. */
  figshareDoi?: string;
};

export type FigshareArticleResult = {
  payload: FigshareArticlePayload;
  /** Fields Figshare needs before it publishes. Empty means ready. */
  missing: string[];
  /** Values dropped because Figshare has no place for them (kept in poster.json). */
  dropped: string[];
};

const asArray = <T>(value: unknown): T[] =>
  Array.isArray(value) ? (value as T[]) : [];

const text = (value: unknown): string =>
  typeof value === "string" ? value.trim() : "";

export function escapeFigshareHtml(value: string): string {
  return value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

function bareOrcid(creator: DbCreator): string | undefined {
  for (const ni of creator.nameIdentifiers ?? []) {
    const value = text(ni?.nameIdentifier);
    if (!value) continue;
    const isOrcid =
      /orcid\.org\//i.test(value) ||
      ni.nameIdentifierScheme?.toLowerCase() === "orcid" ||
      ni.schemeURI?.toLowerCase().includes("orcid.org");
    if (!isOrcid) continue;
    const bare = value.replace(/.*orcid\.org\//i, "").trim();
    if (isValidOrcidChecksum(bare)) return bare;
  }

  return undefined;
}

export function buildFigshareAuthors(
  creators: DbCreator[],
  dropped: string[],
): FigshareAuthor[] {
  const authors: FigshareAuthor[] = [];
  for (const c of creators) {
    const orcid = bareOrcid(c);
    const isOrg = c.nameType?.toLowerCase() === "organizational";
    let given = text(c.givenName);
    let family = text(c.familyName);
    if (!isOrg && !given && !family && text(c.name).includes(",")) {
      const [f, ...g] = text(c.name).split(",");
      family = f!.trim();
      given = g.join(",").trim();
    }
    if (isOrg && text(c.name)) {
      dropped.push(
        `author type of ${text(c.name)} (Figshare lists every author as a person)`,
      );
    }
    const full =
      isOrg || (!given && !family)
        ? text(c.name) || family
        : [given, family].filter(Boolean).join(" ");
    if (!full) continue;
    if (full.length > FIGSHARE_AUTHOR_NAME_MAX) {
      dropped.push(
        `author name over ${FIGSHARE_AUTHOR_NAME_MAX} characters: ${full.slice(0, 40)}...`,
      );
      continue;
    }
    authors.push({
      name: full,
      ...(!isOrg &&
        given &&
        family && { first_name: given, last_name: family }),
      ...(orcid && { orcid_id: orcid }),
    });
  }

  return authors;
}

function conferenceDates(start: string, end: string): string {
  if (start && end && start !== end) return `${start} - ${end}`;

  return start || end;
}

/** The "Conference" block agreed on 2026-10-23. Missing parts are left out. */
export function figshareConferenceBlock(meta: FigshareSourceMetadata): string {
  const name = text(meta.conferenceName);
  const acronym = text(meta.conferenceAcronym);
  const location = text(meta.conferenceLocation);
  const dates = conferenceDates(
    text(meta.conferenceStartDate),
    text(meta.conferenceEndDate),
  );
  const rawUri = text(meta.conferenceUri);
  const uri = /^https?:\/\/\S+$/i.test(rawUri) ? rawUri : "";
  const label = name
    ? acronym && !name.includes(acronym)
      ? `${name} (${acronym})`
      : name
    : acronym;
  const parts = [label, location, dates].filter(Boolean);
  if (!parts.length && !uri) return "";

  let html = "<h3>Conference</h3>";
  if (parts.length)
    html += `<p>Presented at ${escapeFigshareHtml(parts.join(", "))}.</p>`;
  if (uri) {
    const safe = escapeFigshareHtml(uri);
    html += `<p><a href="${safe}">${safe}</a></p>`;
  }

  return html;
}

function paragraphs(value: string): string {
  return value
    .split(/\n\s*\n/)
    .map((p) => p.trim())
    .filter(Boolean)
    .map((p) => `<p>${escapeFigshareHtml(p).replace(/\n/g, "<br>")}</p>`)
    .join("");
}

/** Shortens plain text to at most `max` characters, at a word boundary. */
export function shortenFigshareText(value: string, max: number): string {
  if (value.length <= max) return value;
  if (max <= 3) return "";
  const cut = value.slice(0, max - 3);
  const space = cut.lastIndexOf(" ");

  return `${(space > 0 ? cut.slice(0, space) : cut).trimEnd()}...`;
}

/**
 * The item description: the poster's description, then the submission
 * abstract under its own heading, then the conference block. Over 20,000
 * characters, the conference block stays whole and the longer of the other
 * two is shortened first, never mid-word.
 */
export function buildFigshareDescription(
  description: string,
  abstract: string,
  meta: FigshareSourceMetadata,
  max = FIGSHARE_DESCRIPTION_MAX,
): string {
  const conference = figshareConferenceBlock(meta);
  const abstractHeading = "<h3>Abstract</h3>";
  let desc = description.trim();
  let abs = abstract.trim();
  const render = () =>
    paragraphs(desc) +
    (abs ? abstractHeading + paragraphs(abs) : "") +
    conference;

  let html = render();
  for (let guard = 0; html.length > max && guard < 50; guard++) {
    const over = html.length - max;
    // Escaping can lengthen text, so trim a little more than the overflow.
    const step = Math.max(over + 16, 64);
    if (abs.length >= desc.length && abs) {
      abs = shortenFigshareText(abs, Math.max(0, abs.length - step));
    } else {
      desc = shortenFigshareText(desc, Math.max(0, desc.length - step));
    }
    html = render();
  }

  return html.length > max ? conference.slice(0, max) : html;
}

function submissionAbstract(posterContent: unknown): string {
  if (
    posterContent &&
    typeof posterContent === "object" &&
    !Array.isArray(posterContent)
  ) {
    return text(
      (posterContent as { submissionAbstract?: unknown }).submissionAbstract,
    );
  }

  return "";
}

function isUrl(value: string): boolean {
  return /^https?:\/\/\S+$/i.test(value);
}

export function buildFigshareRelatedMaterials(
  input: FigshareArticleInput,
  dropped: string[],
): FigshareRelatedMaterial[] {
  const out: FigshareRelatedMaterial[] = [];
  const seen = new Set<string>();
  const add = (m: FigshareRelatedMaterial) => {
    const key = `${m.relation}|${m.identifier.toLowerCase()}`;
    if (seen.has(key)) return;
    seen.add(key);
    out.push(m);
  };

  for (const r of asArray<DbRelatedIdentifier>(
    input.metadata.relatedIdentifiers,
  )) {
    const identifier = text(r?.relatedIdentifier);
    const relation = text(r?.relationType);
    let type = text(r?.relatedIdentifierType);
    if (!identifier) continue;
    if (VERSION_RELATIONS.has(relation)) continue; // Figshare versions the item itself
    if (!FIGSHARE_RELATIONS.has(relation)) {
      dropped.push(`related ${identifier} (${relation || "no relation type"})`);
      continue;
    }
    if (!FIGSHARE_IDENTIFIER_TYPES.has(type)) {
      if (!isUrl(identifier)) {
        dropped.push(
          `related ${identifier} (identifier type ${type || "missing"})`,
        );
        continue;
      }
      type = "URL";
    }
    add({ identifier, identifier_type: type, relation });
  }

  // Other identifiers of this same poster (a Zenodo DOI, arXiv, PMID).
  const own = text(input.figshareDoi).toLowerCase();
  for (const id of asArray<{ identifier?: string; identifierType?: string }>(
    input.metadata.identifiers,
  )) {
    const identifier = text(id?.identifier);
    const type = text(id?.identifierType);
    if (!identifier || identifier.toLowerCase() === own) continue;
    if (FIGSHARE_IDENTIFIER_TYPES.has(type)) {
      add({ identifier, identifier_type: type, relation: "IsIdenticalTo" });
    } else if (isUrl(identifier)) {
      add({ identifier, identifier_type: "URL", relation: "IsIdenticalTo" });
    } else {
      dropped.push(`identifier ${identifier} (type ${type || "missing"})`);
    }
  }

  const page = text(input.postersScienceUrl);
  if (isUrl(page)) {
    add({
      identifier: page,
      identifier_type: "URL",
      relation: "IsDescribedBy",
    });
  }

  return out;
}

/** Free text funding entries; figshare.ts links exact grant matches by id. */
export function figshareFundingTitle(f: DbFundingReference): string {
  const funder = text(f.funderName);
  const award = text(f.awardNumber);
  const title = text(f.awardTitle);
  let line = funder;
  if (award) line += line ? `, ${award}` : award;
  if (title) line += line ? `: ${title}` : title;

  return line;
}

export function buildFigshareArticle(
  input: FigshareArticleInput,
): FigshareArticleResult {
  const missing: string[] = [];
  const dropped: string[] = [];
  const meta = input.metadata;

  const title = text(input.title);
  if (title.length < FIGSHARE_TITLE_MIN)
    missing.push("title (at least 3 characters)");
  if (title.length > FIGSHARE_TITLE_MAX)
    missing.push("a title of 1,000 characters or fewer");

  const authors = buildFigshareAuthors(
    asArray<DbCreator>(meta.creators),
    dropped,
  );
  if (!authors.length) missing.push("at least one author");

  const keywords: string[] = [];
  const seenKeywords = new Set<string>();
  for (const k of meta.subjects ?? []) {
    const value = text(k);
    if (!value || seenKeywords.has(value.toLowerCase())) continue;
    seenKeywords.add(value.toLowerCase());
    keywords.push(value);
  }
  if (!keywords.length) missing.push("at least one keyword");

  const categories = (input.categoryIds ?? []).map(text).filter(Boolean);
  if (!categories.length) missing.push("at least one category");

  if (input.licenseId === undefined) missing.push("a license");

  const description = buildFigshareDescription(
    input.description ?? "",
    submissionAbstract(meta.posterContent),
    meta,
  );
  if (!description) missing.push("a description");

  const funding = asArray<DbFundingReference>(meta.fundingReferences)
    .map(figshareFundingTitle)
    .filter(Boolean)
    .map((t) => ({ title: t }));

  const payload: FigshareArticlePayload = {
    title,
    defined_type: "poster",
    description,
    authors,
    keywords,
    categories_by_source_id: categories,
    ...(input.licenseId !== undefined && { license: input.licenseId }),
    related_materials: buildFigshareRelatedMaterials(input, dropped),
    funding_list: funding,
  };

  return { payload, missing, dropped };
}

export type FigshareLicense = { value: number; name: string; url?: string };

const SPDX_URLS: Record<string, string> = {
  "cc-by-4.0": "creativecommons.org/licenses/by/4.0",
  "cc-by-sa-4.0": "creativecommons.org/licenses/by-sa/4.0",
  "cc-by-nc-4.0": "creativecommons.org/licenses/by-nc/4.0",
  "cc-by-nd-4.0": "creativecommons.org/licenses/by-nd/4.0",
  "cc0-1.0": "creativecommons.org/publicdomain/zero/1.0",
  mit: "opensource.org/licenses/mit",
  "apache-2.0": "www.apache.org/licenses/license-2.0",
};

const urlKey = (url: string) =>
  url
    .toLowerCase()
    .replace(/^https?:\/\//, "")
    .replace(/\/+$/, "")
    .replace(/\.html?$/, "");

const nameKey = (name: string) =>
  name
    .toLowerCase()
    .replace(/-or-later$/, "+")
    .replace(/\+/g, "plus")
    .replace(/[^a-z0-9]/g, "");

/**
 * Finds the account's Figshare license for a stored SPDX id or license URL.
 * Only exact matches: a license the account doesn't offer returns undefined,
 * and the user picks from the account's list instead.
 */
export function matchFigshareLicense(
  licenses: FigshareLicense[],
  spdxOrUrl: string | null | undefined,
): FigshareLicense | undefined {
  const value = text(spdxOrUrl);
  if (!value) return undefined;
  const wantUrl = isUrl(value) ? urlKey(value) : SPDX_URLS[value.toLowerCase()];
  if (wantUrl) {
    const byUrl = licenses.find(
      (l) => l.url && urlKey(l.url) === urlKey(wantUrl),
    );
    if (byUrl) return byUrl;
  }
  if (isUrl(value)) return undefined;
  const want = nameKey(value);

  return licenses.find((l) => nameKey(l.name) === want);
}
