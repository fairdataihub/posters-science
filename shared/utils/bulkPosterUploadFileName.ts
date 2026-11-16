/** Last path segment for bulk poster uploads (handles `\` and `/`). */
export function posterUploadBaseName(clientPath: string): string {
  const normalized = clientPath.replace(/\\/g, "/").trim();
  const parts = normalized.split("/").filter(Boolean);
  return parts[parts.length - 1] ?? normalized;
}

export function posterUploadPathHint(file: { name: string; webkitRelativePath?: string }): string {
  const relative = file.webkitRelativePath?.trim();
  if (relative) return relative.replace(/\\/g, "/");
  return file.name.replace(/\\/g, "/");
}

/** Unique staged file name; uses basename unless two files would collide. */
export function dedupePosterUploadBaseName(
  clientPath: string,
  used: Set<string>,
): string {
  const normalized = clientPath.replace(/\\/g, "/").trim();
  const parts = normalized.split("/").filter(Boolean);
  const candidates: string[] = [];

  if (parts.length > 0) {
    candidates.push(parts[parts.length - 1]!);
  }
  if (parts.length > 2) {
    candidates.push(parts.slice(1).join("-"));
  }
  if (parts.length >= 2) {
    candidates.push(parts.join("-"));
  }

  for (const candidate of candidates) {
    const key = candidate.toLowerCase();
    if (!used.has(key)) {
      used.add(key);
      return candidate;
    }
  }

  const base = posterUploadBaseName(normalized);
  const ext = base.includes(".") ? base.slice(base.lastIndexOf(".")) : "";
  const stem = ext ? base.slice(0, -ext.length) : base;
  let index = 2;
  while (index < 1000) {
    const candidate = `${stem}-${index}${ext}`;
    const key = candidate.toLowerCase();
    if (!used.has(key)) {
      used.add(key);
      return candidate;
    }
    index += 1;
  }

  return base;
}
