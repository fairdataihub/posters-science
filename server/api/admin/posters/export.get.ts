import type { SortField } from "../../../utils/adminPosters";

// A guard rail rather than a real limit: the table is for triage, and a bigger
// pull belongs in a script with direct database access.
const MAX_EXPORT_ROWS = 10_000;

const COLUMNS = [
  "id",
  "rootId",
  "versionSequence",
  "isLatestVersion",
  "title",
  "status",
  "tombstone",
  "tombstoneReason",
  "automated",
  "ownerName",
  "ownerEmail",
  "doi",
  "zenodoDoi",
  "zenodoDepositionId",
  "license",
  "publisher",
  "metadataVersion",
  "extractionStatus",
  "extractionError",
  "likes",
  "publishedAt",
  "created",
  "updated",
] as const;

// Building the quoting by character code keeps the double quote out of the
// source, where the quote style rule and prettier disagree on escaping it.
const QUOTE = String.fromCharCode(34);

function csvCell(value: unknown): string {
  if (value === null || value === undefined) return "";

  const text = value instanceof Date ? value.toISOString() : String(value);

  // Blunt the spreadsheet formula injection vector, since this file is opened
  // in Excel more often than not.
  const guarded = /^[=+\-@\t\r]/.test(text) ? `'${text}` : text;

  // Escape embedded quotes by doubling them, per RFC 4180.
  return QUOTE + guarded.split(QUOTE).join(QUOTE + QUOTE) + QUOTE;
}

export default defineEventHandler(async (event) => {
  await requireAdminSession(event);

  const query = getQuery(event);

  const where = buildPosterAdminWhere({
    search: query.search as string | undefined,
    status: query.status as string | undefined,
    doi: query.doi as string | undefined,
    automated: query.automated as string | undefined,
    extraction: query.extraction as string | undefined,
  });

  const sortParam = (query.sort as string | undefined) ?? "created";
  const sort: SortField = isSortField(sortParam) ? sortParam : "created";
  const order = query.order === "asc" ? "asc" : "desc";

  const posters = await prisma.poster.findMany({
    where,
    select: POSTER_ADMIN_SELECT,
    orderBy: { [sort]: order },
    take: MAX_EXPORT_ROWS,
  });

  const rows = posters.map((poster) =>
    [
      poster.id,
      poster.versionRootId ?? poster.id,
      poster.versionSequence,
      poster.isLatestVersion,
      poster.title,
      poster.status,
      poster.tombstone,
      poster.tombedReason,
      poster.automated,
      `${poster.user.givenName} ${poster.user.familyName}`.trim(),
      poster.user.emailAddress,
      poster.posterMetadata?.doi,
      poster.zenodoDepositions?.lastPublishedZenodoDoi,
      poster.zenodoDepositions?.depositionId,
      poster.posterMetadata?.license,
      poster.posterMetadata?.publisher,
      poster.posterMetadata?.version,
      poster.extractionJob?.status,
      poster.extractionJob?.error,
      poster._count.likes,
      poster.publishedAt,
      poster.created,
      poster.updated,
    ]
      .map(csvCell)
      .join(","),
  );

  const csv = [COLUMNS.join(","), ...rows].join("\r\n");
  const stamp = new Date().toISOString().slice(0, 10);

  setResponseHeaders(event, {
    "Content-Type": "text/csv; charset=utf-8",
    "Content-Disposition": `attachment; filename="posters-${stamp}.csv"`,
  });

  return csv;
});
