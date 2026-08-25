export function posterFamilyRootId(poster: {
  id: number;
  versionRootId: number | null;
}): number {
  return poster.versionRootId ?? poster.id;
}

export function posterFamilyWhere(rootId: number) {
  return {
    OR: [{ id: rootId }, { versionRootId: rootId }],
  };
}

export function posterVersionLabel(sequence: number): string {
  return String(sequence);
}
