import JSZip from "jszip";
import {
  ALLOWED_POSTER_FILE_TYPES,
  POSTER_FILE_ACCEPT,
  posterFileRejectionReason,
} from "#shared/utils/posterFile";

export type BulkPosterUploadSkip = {
  name: string;
  reason: string;
};

function posterMimeForFileName(name: string): string {
  const ext = name.trim().toLowerCase().split(".").pop() ?? "";
  return ALLOWED_POSTER_FILE_TYPES[ext] ?? "application/octet-stream";
}

function shouldSkipArchivePath(path: string): boolean {
  const normalized = path.replace(/\\/g, "/");
  const segments = normalized.split("/").filter(Boolean);
  if (segments.some((segment) => segment === "__MACOSX")) return true;
  const base = segments[segments.length - 1] ?? "";
  if (!base || base === ".DS_Store" || base.startsWith(".")) return true;
  return false;
}

import {
  dedupePosterUploadBaseName,
  posterUploadBaseName,
  posterUploadPathHint,
} from "#shared/utils/bulkPosterUploadFileName";

/** Archive extensions accepted for bulk upload. ZIP uses JSZip; the rest use libarchive.js. */
const BULK_POSTER_ARCHIVE_EXTENSIONS = [
  ".zip",
  ".7z",
  ".rar",
  ".tar",
  ".tar.gz",
  ".tgz",
];

export function isBulkPosterArchive(name: string): boolean {
  const lower = name.toLowerCase();

  return BULK_POSTER_ARCHIVE_EXTENSIONS.some((ext) => lower.endsWith(ext));
}

type ArchiveEntry = { path: string; blob: Blob };

async function zipArchiveEntries(file: File): Promise<ArchiveEntry[]> {
  const zip = await JSZip.loadAsync(file);
  const entries: ArchiveEntry[] = [];
  for (const [path, entry] of Object.entries(zip.files)) {
    if (entry.dir || shouldSkipArchivePath(path)) continue;
    entries.push({ path, blob: await entry.async("blob") });
  }

  return entries;
}

class EncryptedArchiveError extends Error {}

/** 7z, RAR and TAR archives. The WASM reader loads only when one is added. */
async function libarchiveEntries(file: File): Promise<ArchiveEntry[]> {
  const [{ Archive }, { default: workerUrl }] = await Promise.all([
    import("libarchive.js"),
    import("libarchive.js/dist/worker-bundle.js?worker&url"),
  ]);
  Archive.init({
    getWorker: () => new Worker(workerUrl, { type: "module" }),
  });

  const archive = await Archive.open(file);
  try {
    if (await archive.hasEncryptedData()) throw new EncryptedArchiveError();
    await archive.extractFiles();
    const extracted = (await archive.getFilesArray()) as {
      file: File;
      path: string;
    }[];

    return extracted
      .map(({ file: entry, path }) => ({
        path: `${path}${entry.name}`,
        blob: entry,
      }))
      .filter(({ path }) => !shouldSkipArchivePath(path));
  } finally {
    await archive.close();
  }
}

async function posterFilesFromArchive(file: File): Promise<{
  files: File[];
  skipped: BulkPosterUploadSkip[];
}> {
  const skipped: BulkPosterUploadSkip[] = [];

  let entries: ArchiveEntry[];
  try {
    entries = file.name.toLowerCase().endsWith(".zip")
      ? await zipArchiveEntries(file)
      : await libarchiveEntries(file);
  } catch (error) {
    return {
      files: [],
      skipped: [
        {
          name: file.name,
          reason:
            error instanceof EncryptedArchiveError
              ? "Password-protected archives are not supported."
              : "Could not read archive.",
        },
      ],
    };
  }

  const files: File[] = [];
  const usedNames = new Set<string>();

  for (const { path, blob } of entries) {
    const uploadName = dedupePosterUploadBaseName(path, usedNames);
    // libarchive labels every entry application/octet-stream.
    const type =
      blob.type && blob.type !== "application/octet-stream"
        ? blob.type
        : posterMimeForFileName(uploadName);
    const rejection = posterFileRejectionReason({
      name: uploadName,
      type,
      size: blob.size,
    });

    if (rejection) {
      skipped.push({ name: `${file.name} → ${uploadName}`, reason: rejection });
      continue;
    }

    files.push(
      new File([blob], uploadName, {
        type,
        lastModified: file.lastModified,
      }),
    );
  }

  if (files.length === 0 && skipped.length === 0) {
    skipped.push({
      name: file.name,
      reason: "Archive contained no accepted poster PDF or image files.",
    });
  }

  return { files, skipped };
}

function renameFile(file: File, uploadName: string): File {
  if (uploadName === file.name) return file;
  return new File([file], uploadName, {
    type: file.type,
    lastModified: file.lastModified,
  });
}

function normalizePosterFile(file: File, usedNames: Set<string>): File {
  const uploadName = dedupePosterUploadBaseName(posterUploadPathHint(file), usedNames);
  return renameFile(file, uploadName);
}

export function bulkPosterUploadFileForStaging(file: File, usedNames: Set<string>): File {
  return normalizePosterFile(file, usedNames);
}

export { posterUploadBaseName, posterUploadPathHint };

export const BULK_POSTER_UPLOAD_ACCEPT = [
  POSTER_FILE_ACCEPT,
  ...BULK_POSTER_ARCHIVE_EXTENSIONS,
  "application/zip",
  "application/x-zip-compressed",
  "application/x-7z-compressed",
  "application/vnd.rar",
  "application/x-rar-compressed",
  "application/x-tar",
  "application/gzip",
  "application/x-gzip",
].join(",");

async function readAllDirectoryEntries(
  reader: FileSystemDirectoryReader,
): Promise<FileSystemEntry[]> {
  const entries: FileSystemEntry[] = [];
  let batch: FileSystemEntry[];

  do {
    batch = await new Promise<FileSystemEntry[]>((resolve, reject) => {
      reader.readEntries(resolve, reject);
    });
    entries.push(...batch);
  } while (batch.length > 0);

  return entries;
}

async function fileFromFileSystemEntry(
  entry: FileSystemFileEntry,
  relativePath: string,
): Promise<{ file: File; relativePath: string }> {
  const file = await new Promise<File>((resolve, reject) => {
    entry.file(resolve, reject);
  });

  return { file, relativePath };
}

async function filesFromDirectoryEntry(
  entry: FileSystemDirectoryEntry,
  pathPrefix: string,
): Promise<{ file: File; relativePath: string }[]> {
  const reader = entry.createReader();
  const entries = await readAllDirectoryEntries(reader);
  const files: { file: File; relativePath: string }[] = [];

  for (const child of entries) {
    const childPath = pathPrefix ? `${pathPrefix}/${child.name}` : child.name;
    if (child.isFile) {
      files.push(
        await fileFromFileSystemEntry(child as FileSystemFileEntry, childPath),
      );
    } else if (child.isDirectory) {
      if (child.name === "__MACOSX" || child.name.startsWith(".")) continue;
      files.push(
        ...(await filesFromDirectoryEntry(
          child as FileSystemDirectoryEntry,
          childPath,
        )),
      );
    }
  }

  return files;
}

/** Reads flat files, archives, and dropped folders from a drag-and-drop event. */
export async function readBulkPosterUploadDataTransfer(
  dataTransfer: DataTransfer,
): Promise<File[]> {
  const items = dataTransfer.items;

  if (items?.length) {
    const entries = [...items]
      .map((item) => item.webkitGetAsEntry?.())
      .filter((entry): entry is FileSystemEntry => Boolean(entry));

    if (entries.length > 0) {
      const collected: { file: File; relativePath: string }[] = [];

      for (const entry of entries) {
        if (entry.isFile) {
          collected.push(
            await fileFromFileSystemEntry(
              entry as FileSystemFileEntry,
              entry.name,
            ),
          );
        } else if (entry.isDirectory) {
          if (entry.name === "__MACOSX" || entry.name.startsWith(".")) {
            continue;
          }
          collected.push(
            ...(await filesFromDirectoryEntry(
              entry as FileSystemDirectoryEntry,
              "",
            )),
          );
        }
      }

      if (collected.length > 0) {
        const usedNames = new Set<string>();
        return collected.map(({ file, relativePath }) =>
          renameFile(
            file,
            dedupePosterUploadBaseName(relativePath, usedNames),
          ),
        );
      }
    }
  }

  return dataTransfer.files ? [...dataTransfer.files] : [];
}

/**
 * Expands a file-picker or drop selection into poster files (archives → many files,
 * folder picks → unique names from relative paths).
 */
export async function expandBulkPosterUploadSelection(files: File[]): Promise<{
  files: File[];
  skipped: BulkPosterUploadSkip[];
}> {
  const posters: File[] = [];
  const skipped: BulkPosterUploadSkip[] = [];
  const usedNames = new Set<string>();

  for (const file of files) {
    if (isBulkPosterArchive(file.name)) {
      const fromArchive = await posterFilesFromArchive(file);
      for (const poster of fromArchive.files) {
        usedNames.add(poster.name.toLowerCase());
      }
      posters.push(...fromArchive.files);
      skipped.push(...fromArchive.skipped);
      continue;
    }

    const normalized = normalizePosterFile(file, usedNames);
    const rejection = posterFileRejectionReason({
      name: normalized.name,
      type: normalized.type,
      size: normalized.size,
    });

    if (rejection) {
      skipped.push({ name: normalized.name, reason: rejection });
      continue;
    }

    posters.push(normalized);
  }

  return { files: posters, skipped };
}
