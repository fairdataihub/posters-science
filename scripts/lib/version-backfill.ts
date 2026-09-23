import { createHash } from "node:crypto";
import { readFileSync } from "node:fs";
import { inflateRawSync } from "node:zlib";

export const RESOLVED_SHEET = "Resolved links (live)";
export const BACKFILL_SHEET = "Backfill status";

export type ResolvedLinkRow = {
  ownDoi: string;
  familyDoi: string;
  versionSequence: number;
  depositVersion: string | null;
  isLatestVersion: boolean;
  olderSiblingDoi: string | null;
  newerSiblingDoi: string | null;
  hasSiblingInCorpus: boolean;
  familyComplete: boolean;
  liveOnBlob: boolean;
  repository: string;
  dateSpan: string;
  title: string;
};

export type BackfillStatusRow = {
  status: string;
  liveOnBlob: boolean;
  missingVersionDoi: string;
  familyRootDoi: string | null;
  repositorySequence: number;
  repository: string;
  title: string;
};

export type VersionWorkbook = {
  resolved: ResolvedLinkRow[];
  backfill: BackfillStatusRow[];
};

export type WorkbookSummary = {
  resolvedRecords: number;
  distinctFamilies: number;
  latestRecords: number;
  nonLatestRecords: number;
  multiRecordFamilies: number;
  singletonFamilies: number;
  liveBackfillRows: number;
  pendingBackfillRows: number;
  standaloneLiveRows: BackfillStatusRow[];
  ambiguousLiveDois: Array<{ doi: string; rows: BackfillStatusRow[] }>;
};

export type ExistingPoster = {
  id: number;
  doi: string;
  automated: boolean;
  status: string;
  imageUrl: string;
  metadataVersion: string | null;
  versionRootId: number | null;
  versionSequence: number;
  isLatestVersion: boolean;
  tombstone: boolean;
  updated: string;
};

type ZipEntry = {
  compressionMethod: number;
  compressedSize: number;
  localHeaderOffset: number;
};

function findEndOfCentralDirectory(buffer: Buffer): number {
  const minimum = Math.max(0, buffer.length - 65_557);
  for (let offset = buffer.length - 22; offset >= minimum; offset--) {
    if (buffer.readUInt32LE(offset) === 0x06054b50) return offset;
  }
  throw new Error("Invalid XLSX: ZIP central directory was not found");
}

function readZipEntries(buffer: Buffer): Map<string, Buffer> {
  const end = findEndOfCentralDirectory(buffer);
  const entryCount = buffer.readUInt16LE(end + 10);
  let offset = buffer.readUInt32LE(end + 16);
  const directory = new Map<string, ZipEntry>();

  for (let index = 0; index < entryCount; index++) {
    if (buffer.readUInt32LE(offset) !== 0x02014b50) {
      throw new Error("Invalid XLSX: malformed ZIP central directory");
    }
    const fileNameLength = buffer.readUInt16LE(offset + 28);
    const extraLength = buffer.readUInt16LE(offset + 30);
    const commentLength = buffer.readUInt16LE(offset + 32);
    const fileName = buffer
      .subarray(offset + 46, offset + 46 + fileNameLength)
      .toString("utf8")
      .replaceAll("\\", "/");
    directory.set(fileName, {
      compressionMethod: buffer.readUInt16LE(offset + 10),
      compressedSize: buffer.readUInt32LE(offset + 20),
      localHeaderOffset: buffer.readUInt32LE(offset + 42),
    });
    offset += 46 + fileNameLength + extraLength + commentLength;
  }

  const result = new Map<string, Buffer>();
  for (const [fileName, entry] of directory) {
    const local = entry.localHeaderOffset;
    if (buffer.readUInt32LE(local) !== 0x04034b50) {
      throw new Error(`Invalid XLSX: malformed local header for ${fileName}`);
    }
    const fileNameLength = buffer.readUInt16LE(local + 26);
    const extraLength = buffer.readUInt16LE(local + 28);
    const start = local + 30 + fileNameLength + extraLength;
    const compressed = buffer.subarray(start, start + entry.compressedSize);

    if (entry.compressionMethod === 0) result.set(fileName, compressed);
    else if (entry.compressionMethod === 8)
      result.set(fileName, inflateRawSync(compressed));
    else
      throw new Error(
        `Invalid XLSX: unsupported ZIP compression method ${entry.compressionMethod}`,
      );
  }

  return result;
}

function decodeXml(value: string): string {
  return value
    .replaceAll("&lt;", "<")
    .replaceAll("&gt;", ">")
    .replaceAll("&quot;", String.fromCodePoint(34))
    .replaceAll("&apos;", "'")
    .replaceAll("&amp;", "&")
    .replace(/&#(\d+);/g, (_, code: string) =>
      String.fromCodePoint(Number.parseInt(code, 10)),
    )
    .replace(/&#x([\da-f]+);/gi, (_, code: string) =>
      String.fromCodePoint(Number.parseInt(code, 16)),
    );
}

function attribute(source: string, name: string): string | null {
  const match = source.match(
    new RegExp(`(?:^|\\s)${name.replace(":", "\\:")}="([^"]*)"`),
  );

  return match ? decodeXml(match[1] ?? "") : null;
}

function xmlText(source: string): string {
  return [...source.matchAll(/<t\b[^>]*>([\s\S]*?)<\/t>/g)]
    .map((match) => decodeXml(match[1] ?? ""))
    .join("");
}

function normalizeWorksheetTarget(target: string): string {
  const normalized = target.replaceAll("\\", "/").replace(/^\//, "");

  return normalized.startsWith("xl/") ? normalized : `xl/${normalized}`;
}

function readWorksheet(
  entries: Map<string, Buffer>,
  sheetName: string,
): Array<Record<string, string>> {
  const workbook = entries.get("xl/workbook.xml")?.toString("utf8");
  const relationships = entries
    .get("xl/_rels/workbook.xml.rels")
    ?.toString("utf8");
  if (!workbook || !relationships) {
    throw new Error("Invalid XLSX: workbook metadata is missing");
  }

  const relationshipTargets = new Map<string, string>();
  for (const match of relationships.matchAll(
    /<Relationship\b([^>]*)\/?\s*>/g,
  )) {
    const id = attribute(match[1] ?? "", "Id");
    const target = attribute(match[1] ?? "", "Target");
    if (id && target)
      relationshipTargets.set(id, normalizeWorksheetTarget(target));
  }

  let relationshipId: string | null = null;
  for (const match of workbook.matchAll(/<sheet\b([^>]*)\/?\s*>/g)) {
    if (attribute(match[1] ?? "", "name") === sheetName) {
      relationshipId = attribute(match[1] ?? "", "r:id");
      break;
    }
  }
  if (!relationshipId)
    throw new Error(`Workbook sheet not found: ${sheetName}`);

  const target = relationshipTargets.get(relationshipId);
  const worksheet = target ? entries.get(target)?.toString("utf8") : null;
  if (!worksheet)
    throw new Error(`Workbook data not found for sheet: ${sheetName}`);

  const sharedStringsXml = entries
    .get("xl/sharedStrings.xml")
    ?.toString("utf8");
  const sharedStrings = sharedStringsXml
    ? [...sharedStringsXml.matchAll(/<si\b[^>]*>([\s\S]*?)<\/si>/g)].map(
        (match) => xmlText(match[1] ?? ""),
      )
    : [];

  const rows: Array<Record<string, string>> = [];
  for (const rowMatch of worksheet.matchAll(/<row\b[^>]*>([\s\S]*?)<\/row>/g)) {
    const row: Record<string, string> = {};
    for (const cellMatch of (rowMatch[1] ?? "").matchAll(
      /<c\b([^>]*)>([\s\S]*?)<\/c>/g,
    )) {
      const attrs = cellMatch[1] ?? "";
      const body = cellMatch[2] ?? "";
      const reference = attribute(attrs, "r");
      const column = reference?.match(/^[A-Z]+/)?.[0];
      if (!column) continue;
      const type = attribute(attrs, "t");
      const rawValue = body.match(/<v\b[^>]*>([\s\S]*?)<\/v>/)?.[1];
      let value = "";
      if (type === "inlineStr") value = xmlText(body);
      else if (type === "s" && rawValue !== undefined)
        value = sharedStrings[Number.parseInt(rawValue, 10)] ?? "";
      else if (rawValue !== undefined) value = decodeXml(rawValue);
      row[column] = value;
    }
    rows.push(row);
  }

  if (rows.length === 0) return [];
  const headers = rows[0] ?? {};

  return rows
    .slice(1)
    .map((row) =>
      Object.fromEntries(
        Object.entries(row).map(([column, value]) => [headers[column], value]),
      ),
    );
}

function required(
  row: Record<string, string>,
  key: string,
  sheet: string,
): string {
  const value = row[key]?.trim();
  if (!value) throw new Error(`${sheet}: required value ${key} is missing`);

  return value;
}

function optional(row: Record<string, string>, key: string): string | null {
  const value = row[key]?.trim();

  return value ? value : null;
}

function integer(
  row: Record<string, string>,
  key: string,
  sheet: string,
): number {
  const value = Number.parseInt(required(row, key, sheet), 10);
  if (!Number.isSafeInteger(value) || value < 1) {
    throw new Error(`${sheet}: ${key} must be a positive integer`);
  }

  return value;
}

function yes(value: string | undefined): boolean {
  return value?.trim().toLowerCase() === "yes";
}

function bool(value: string | undefined, key: string): boolean {
  const normalized = value?.trim().toLowerCase();
  if (normalized === "true") return true;
  if (normalized === "false") return false;
  throw new Error(`${key} must be true or false`);
}

export function readVersionWorkbook(filePath: string): VersionWorkbook {
  const entries = readZipEntries(readFileSync(filePath));
  const resolved = readWorksheet(entries, RESOLVED_SHEET).map((row) => ({
    ownDoi: normalizeDoi(required(row, "ownDoi", RESOLVED_SHEET)),
    familyDoi: normalizeDoi(
      required(row, "versionRootId_target", RESOLVED_SHEET),
    ),
    versionSequence: integer(
      row,
      row.repositorySequence ? "repositorySequence" : "versionSequence",
      RESOLVED_SHEET,
    ),
    depositVersion: optional(row, "depositVersion"),
    isLatestVersion: bool(row.isLatestVersion, "isLatestVersion"),
    olderSiblingDoi: normalizeDoi(optional(row, "olderSiblingDoi")) || null,
    newerSiblingDoi: normalizeDoi(optional(row, "newerSiblingDoi")) || null,
    hasSiblingInCorpus: yes(row.hasSiblingInCorpus),
    familyComplete: yes(row.familyComplete),
    liveOnBlob: yes(row.liveOnBlob),
    repository: required(row, "repository", RESOLVED_SHEET).toLowerCase(),
    dateSpan: required(row, "dateSpan", RESOLVED_SHEET),
    title: row.title?.trim() ?? "",
  }));
  const backfill = readWorksheet(entries, BACKFILL_SHEET).map((row) => ({
    status: required(row, "status", BACKFILL_SHEET),
    liveOnBlob: yes(row.liveOnBlob),
    missingVersionDoi: normalizeDoi(
      required(row, "missingVersionDoi", BACKFILL_SHEET),
    ),
    familyRootDoi: normalizeDoi(optional(row, "familyRootDoi")) || null,
    repositorySequence: integer(row, "repositorySequence", BACKFILL_SHEET),
    repository: required(row, "repository", BACKFILL_SHEET).toLowerCase(),
    title: row.title?.trim() ?? "",
  }));
  const workbook = { resolved, backfill };
  summarizeWorkbook(workbook);

  return workbook;
}

export function normalizeDoi(value: unknown): string {
  if (typeof value !== "string") return "";

  return value
    .trim()
    .replace(/^https?:\/\/(?:dx\.)?doi\.org\//i, "")
    .replace(/^doi:\s*/i, "")
    .trim()
    .toLowerCase();
}

export function summarizeWorkbook(workbook: VersionWorkbook): WorkbookSummary {
  const byFamily = new Map<string, ResolvedLinkRow[]>();
  const byDoi = new Map<string, ResolvedLinkRow>();
  for (const row of workbook.resolved) {
    if (!row.liveOnBlob)
      throw new Error(`Resolved record is not live: ${row.ownDoi}`);
    if (byDoi.has(row.ownDoi)) {
      throw new Error(`Resolved manifest has duplicate DOI: ${row.ownDoi}`);
    }
    byDoi.set(row.ownDoi, row);
    const family = byFamily.get(row.familyDoi) ?? [];
    family.push(row);
    byFamily.set(row.familyDoi, family);
  }

  let latestRecords = 0;
  let multiRecordFamilies = 0;
  let singletonFamilies = 0;
  for (const [familyDoi, rows] of byFamily) {
    const sequences = new Set<number>();
    for (const row of rows) {
      if (sequences.has(row.versionSequence)) {
        throw new Error(
          `Family ${familyDoi} has duplicate sequence ${row.versionSequence}`,
        );
      }
      sequences.add(row.versionSequence);
      if (row.isLatestVersion) latestRecords++;
      if (row.isLatestVersion !== !row.newerSiblingDoi) {
        throw new Error(`Family ${familyDoi} has an inconsistent latest flag`);
      }
    }
    if (rows.filter((row) => row.isLatestVersion).length !== 1) {
      throw new Error(
        `Family ${familyDoi} must contain exactly one latest record`,
      );
    }
    if (rows.length > 1) multiRecordFamilies++;
    else singletonFamilies++;
  }

  const liveBackfill = workbook.backfill.filter((row) => row.liveOnBlob);
  const pendingBackfillRows = workbook.backfill.filter(
    (row) => !row.liveOnBlob,
  ).length;
  const liveByDoi = new Map<string, BackfillStatusRow[]>();
  for (const row of liveBackfill) {
    const rows = liveByDoi.get(row.missingVersionDoi) ?? [];
    rows.push(row);
    liveByDoi.set(row.missingVersionDoi, rows);
  }
  const ambiguousLiveDois = [...liveByDoi]
    .filter(([, rows]) => rows.length > 1)
    .map(([doi, rows]) => ({ doi, rows }));
  const ambiguousSet = new Set(ambiguousLiveDois.map(({ doi }) => doi));
  const standaloneLiveRows = liveBackfill.filter(
    (row) =>
      !byDoi.has(row.missingVersionDoi) &&
      !ambiguousSet.has(row.missingVersionDoi),
  );

  return {
    resolvedRecords: workbook.resolved.length,
    distinctFamilies: byFamily.size,
    latestRecords,
    nonLatestRecords: workbook.resolved.length - latestRecords,
    multiRecordFamilies,
    singletonFamilies,
    liveBackfillRows: liveBackfill.length,
    pendingBackfillRows,
    standaloneLiveRows,
    ambiguousLiveDois,
  };
}

export function chooseCanonicalRoot(
  familyRows: ResolvedLinkRow[],
  existingByDoi: ReadonlyMap<string, ExistingPoster>,
): { existingPosterId: number | null; doi: string } {
  const existing = familyRows
    .map((row) => existingByDoi.get(row.ownDoi))
    .filter((row): row is ExistingPoster => Boolean(row));
  const establishedRootIds = new Set(
    existing.flatMap((row) =>
      row.versionRootId === null ? [] : [row.versionRootId],
    ),
  );
  if (establishedRootIds.size > 1) {
    throw new Error("Existing records point at more than one family root");
  }
  const establishedRootId = [...establishedRootIds][0];
  if (establishedRootId !== undefined) {
    const root = existing.find((row) => row.id === establishedRootId);
    if (!root) throw new Error("Existing family root is outside the manifest");

    return { existingPosterId: root.id, doi: root.doi };
  }
  if (existing.length > 0) {
    const root = [...existing].sort((a, b) => a.id - b.id)[0]!;

    return { existingPosterId: root.id, doi: root.doi };
  }
  const root = [...familyRows].sort(
    (a, b) =>
      a.versionSequence - b.versionSequence || a.ownDoi.localeCompare(b.ownDoi),
  )[0];
  if (!root) throw new Error("Cannot choose a root for an empty family");

  return { existingPosterId: null, doi: root.ownDoi };
}

export function fingerprintExistingPosters(rows: ExistingPoster[]): string {
  const canonical = [...rows]
    .sort((a, b) => a.id - b.id)
    .map((row) => ({
      id: row.id,
      doi: normalizeDoi(row.doi),
      automated: row.automated,
      status: row.status,
      imageUrl: row.imageUrl,
      metadataVersion: row.metadataVersion,
      versionRootId: row.versionRootId,
      versionSequence: row.versionSequence,
      isLatestVersion: row.isLatestVersion,
      tombstone: row.tombstone,
      updated: row.updated,
    }));

  return sha256(JSON.stringify(canonical));
}

export function sha256(value: string | Buffer): string {
  return createHash("sha256").update(value).digest("hex");
}
