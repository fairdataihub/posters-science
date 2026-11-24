import archiver from "archiver";
import { Readable } from "node:stream";
import { sendStream, setHeader } from "h3";
import {
  holdReason,
  parseHeldPosters,
} from "~~/server/utils/bulkWorksheetHold";

const UNSAFE = /[^a-zA-Z0-9._-]+/g;

function safeName(value: string, fallback: string) {
  const name = value.replace(UNSAFE, "-").replace(/-+/g, "-");

  return name.replace(/^-|-$/g, "").slice(0, 80) || fallback;
}

/**
 * Zips a held batch's files: worksheets/, posters/ for posters held from
 * Review, and hold.txt with the details. Files missing from Bunny are listed
 * in hold.txt.
 */
export default defineEventHandler(async (event) => {
  await requireAdminSession(event);
  const jobId = getRouterParam(event, "jobId");
  if (!jobId) {
    throw createError({ statusCode: 400, statusMessage: "Invalid batch id" });
  }

  const job = await prisma.bulkSubmission.findUnique({
    where: { id: jobId },
    select: {
      id: true,
      name: true,
      worksheetHeldAt: true,
      worksheetHoldReason: true,
      worksheetHoldPlatform: true,
      worksheetHoldProblems: true,
      worksheetHoldFiles: true,
      worksheetHoldEmail: true,
      postersHeldAt: true,
      heldPosters: true,
      user: {
        select: { givenName: true, familyName: true, emailAddress: true },
      },
    },
  });
  if (!job) {
    throw createError({ statusCode: 404, statusMessage: "Batch not found" });
  }

  const heldPosters = job.postersHeldAt
    ? parseHeldPosters(job.heldPosters)
    : [];
  const posterFiles = heldPosters.length
    ? await prisma.extractionJob.findMany({
        where: { posterId: { in: heldPosters.map((p) => p.posterId) } },
        select: { posterId: true, fileName: true, filePath: true },
      })
    : [];
  const worksheetFiles = job.worksheetHeldAt ? job.worksheetHoldFiles : [];

  if (!worksheetFiles.length && !posterFiles.length) {
    throw createError({
      statusCode: 404,
      statusMessage: "No files were saved for this hold",
    });
  }

  const { bunnyPrivateStorage, bunnyPrivateStorageKey } = useRuntimeConfig();
  if (!bunnyPrivateStorage || !bunnyPrivateStorageKey) {
    throw createError({
      statusCode: 503,
      statusMessage: "Storage not configured",
    });
  }

  // Fetch everything first so a missing file doesn't break the zip.
  type Entry = { zipPath: string; data: Buffer };
  const entries: Entry[] = [];
  const missing: string[] = [];
  const used = new Set<string>();
  const unique = (path: string) => {
    let name = path;
    for (let n = 2; used.has(name.toLowerCase()); n++) {
      name = path.replace(/(\.[^./]+)?$/, `-${n}$1`);
    }
    used.add(name.toLowerCase());

    return name;
  };

  async function fetchFile(bunnyPath: string, zipPath: string) {
    const response = await fetch(`${bunnyPrivateStorage}/${bunnyPath}`, {
      headers: { AccessKey: bunnyPrivateStorageKey! },
    }).catch(() => null);
    if (!response?.ok) {
      missing.push(bunnyPath);

      return;
    }
    entries.push({
      zipPath: unique(zipPath),
      data: Buffer.from(await response.arrayBuffer()),
    });
  }

  for (const path of worksheetFiles) {
    await fetchFile(path, `worksheets/${path.split("/").pop()}`);
  }
  for (const file of posterFiles) {
    await fetchFile(
      file.filePath,
      `posters/${file.posterId}-${file.fileName || "poster.pdf"}`,
    );
  }

  const name = `${job.user.givenName} ${job.user.familyName}`.trim();
  const info = [
    `Batch: ${job.name} (${job.id})`,
    `Organizer: ${name || "Unknown"} <${job.user.emailAddress}>`,
    job.worksheetHeldAt &&
    job.worksheetHoldEmail &&
    job.worksheetHoldEmail !== job.user.emailAddress
      ? `Reach them at: ${job.worksheetHoldEmail}`
      : null,
    job.worksheetHeldAt
      ? `Whole batch held since ${job.worksheetHeldAt.toISOString()}: ${
          holdReason(job.worksheetHoldReason) === "unsupported_platform"
            ? "unsupported platform"
            : "worksheet problem"
        }${job.worksheetHoldPlatform ? ` (${job.worksheetHoldPlatform})` : ""}`
      : null,
    job.worksheetHoldProblems.length && job.worksheetHeldAt
      ? `Why it was refused:\n${job.worksheetHoldProblems.map((p) => `- ${p}`).join("\n")}`
      : null,
    heldPosters.length
      ? `Posters held since ${job.postersHeldAt!.toISOString()} (no worksheet row):\n${heldPosters
          .map((p) => `- #${p.posterId} ${p.fileName} (${p.reason})`)
          .join("\n")}`
      : null,
    missing.length
      ? `Could not be fetched from Bunny:\n${missing.map((p) => `- ${p}`).join("\n")}`
      : null,
  ]
    .filter(Boolean)
    .join("\n\n");

  const archive = archiver("zip", { zlib: { level: 1 } });
  archive.append(Buffer.from(`${info}\n`, "utf-8"), { name: "hold.txt" });
  for (const entry of entries) {
    archive.append(entry.data, { name: entry.zipPath });
  }

  setHeader(event, "Content-Type", "application/zip");
  setHeader(
    event,
    "Content-Disposition",
    `attachment; filename="${safeName(job.name, "batch")}-hold-files.zip"`,
  );
  setHeader(event, "Cache-Control", "no-store");

  const webStream = Readable.toWeb(
    archive as unknown as Readable,
  ) as ReadableStream;
  archive.finalize();

  return sendStream(event, webStream);
});
