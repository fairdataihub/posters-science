import type { Archiver } from "archiver";
import type { PosterMetadata } from "#shared/generated/client";
import { Readable } from "node:stream";
import { buildPosterJson } from "./buildPosterJson";

export type PosterForDownloadPackage = {
  id: number;
  title: string | null;
  description: string | null;
  posterMetadata: PosterMetadata | null;
  extractionJob: {
    fileName: string | null;
    filePath: string | null;
  } | null;
};

function entryPath(prefix: string, name: string) {
  if (!prefix) return name;
  const normalized = prefix.endsWith("/") ? prefix : `${prefix}/`;
  return `${normalized}${name}`;
}

export async function appendPosterDownloadPackage(
  archive: Archiver,
  poster: PosterForDownloadPackage,
  options: {
    pathPrefix?: string;
    bunnyPrivateStorage: string;
    bunnyPrivateStorageKey: string;
  },
): Promise<void> {
  const { pathPrefix = "", bunnyPrivateStorage, bunnyPrivateStorageKey } =
    options;

  const { extractionJob } = poster;
  if (!extractionJob?.filePath) {
    throw new Error(`Poster ${poster.id} has no extraction file`);
  }

  const fileUrl = `${bunnyPrivateStorage}/${extractionJob.filePath}`;
  const fileResponse = await fetch(fileUrl, {
    headers: {
      AccessKey: bunnyPrivateStorageKey,
      "Content-Type": "application/octet-stream",
    },
  });

  if (!fileResponse.ok || !fileResponse.body) {
    throw new Error(`Failed to fetch file for poster ${poster.id}`);
  }

  const meta = poster.posterMetadata;
  const posterJson = meta
    ? buildPosterJson(meta, {
        title: poster.title,
        description: poster.description,
      })
    : { title: poster.title, description: poster.description };
  const posterJsonBuffer = Buffer.from(
    JSON.stringify(posterJson, null, 2),
    "utf-8",
  );

  archive.append(posterJsonBuffer, { name: entryPath(pathPrefix, "poster.json") });

  const nodeStream = Readable.fromWeb(
    fileResponse.body as Parameters<typeof Readable.fromWeb>[0],
  );
  const zipEntryName = extractionJob.fileName || "poster.pdf";
  archive.append(nodeStream, {
    name: entryPath(pathPrefix, zipEntryName),
  });
}

const INVALID_ZIP_NAME_CHARS = /[/\\:*?"<>|]/g;

export function sanitizeZipFolderName(name: string): string {
  const trimmed = name.replace(INVALID_ZIP_NAME_CHARS, "_").trim();
  return trimmed || "poster";
}

export function uniquePosterFolderName(
  fileName: string,
  posterId: number,
  usedLowercase: Set<string>,
): string {
  const withoutExtension = fileName.replace(/\.[^.]+$/, "").trim();
  const base = sanitizeZipFolderName(withoutExtension || `poster-${posterId}`);

  let candidate = base;
  let suffix = 2;
  while (usedLowercase.has(candidate.toLowerCase())) {
    candidate = `${base}-${suffix}`;
    suffix += 1;
  }

  usedLowercase.add(candidate.toLowerCase());
  return candidate;
}
