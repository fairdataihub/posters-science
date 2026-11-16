type BunnyListEntry = {
  ObjectName?: string;
  IsDirectory?: boolean;
  Length?: number;
};

export type BunnyStoredObject = {
  path: string;
  length: number;
};

/** List files under a prefix (relative to the storage zone base URL). */
export async function listBunnyStorageObjects(
  baseUrl: string,
  accessKey: string,
  relativePrefix: string,
  maxDepth = 24,
): Promise<BunnyStoredObject[]> {
  const base = baseUrl.replace(/\/$/, "");
  const root = relativePrefix.replace(/^\/+|\/+$/g, "");
  const objects: BunnyStoredObject[] = [];

  async function walk(currentPath: string, depth: number) {
    if (depth > maxDepth) return;

    const listUrl = currentPath ? `${base}/${currentPath}/` : `${base}/`;
    const res = await fetch(listUrl, {
      method: "GET",
      headers: { AccessKey: accessKey, Accept: "application/json" },
    });

    if (res.status === 404) return;
    if (!res.ok) {
      const text = await res.text().catch(() => "");
      throw new Error(
        `Bunny list failed ${res.status} for ${listUrl}: ${text.slice(0, 200)}`,
      );
    }

    const entries = (await res.json()) as BunnyListEntry[];
    if (!Array.isArray(entries)) return;

    for (const entry of entries) {
      const name = entry.ObjectName;
      if (!name) continue;

      const childPath = currentPath ? `${currentPath}/${name}` : name;

      if (entry.IsDirectory) {
        await walk(childPath, depth + 1);
      } else {
        objects.push({
          path: childPath,
          length: entry.Length ?? 0,
        });
      }
    }
  }

  await walk(root, 0);

  return objects.sort((a, b) => a.path.localeCompare(b.path));
}

/** @deprecated Prefer {@link listBunnyStorageObjects} when size matters. */
export async function listBunnyStorageFilePaths(
  baseUrl: string,
  accessKey: string,
  relativePrefix: string,
  maxDepth = 24,
): Promise<string[]> {
  const objects = await listBunnyStorageObjects(
    baseUrl,
    accessKey,
    relativePrefix,
    maxDepth,
  );
  return objects.map((object) => object.path);
}
