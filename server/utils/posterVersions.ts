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

type VersionRelatedIdentifier = {
  relatedIdentifier?: string;
  relatedIdentifierType?: string;
  relationType?: string;
  resourceTypeGeneral?: string;
  [key: string]: unknown;
};

export function normalizeVersionRelatedIdentifiers(
  raw: unknown,
  previousDoi?: string | null,
) {
  let changed = false;
  const existing = Array.isArray(raw)
    ? raw.filter(
        (relation): relation is VersionRelatedIdentifier =>
          typeof relation === "object" && relation !== null,
      )
    : [];
  const normalizedPreviousDoi = previousDoi?.trim();

  const relatedIdentifiers = existing
    .filter((relation) => {
      // A version is a new edition of the one before it, nothing earlier.
      // Versions inherit their predecessor's metadata, so without this the
      // chain grows by one IsNewVersionOf per version.
      if (!normalizedPreviousDoi) return true;
      if (relation.relationType !== "IsNewVersionOf") return true;

      const isImmediatePredecessor =
        relation.relatedIdentifier?.trim().toLowerCase() ===
        normalizedPreviousDoi.toLowerCase();

      if (!isImmediatePredecessor) changed = true;

      return isImmediatePredecessor;
    })
    .map((relation) => {
      if (
        relation.relationType !== "IsNewVersionOf" ||
        relation.resourceTypeGeneral
      ) {
        return relation;
      }

      changed = true;

      return { ...relation, resourceTypeGeneral: "Poster" };
    });

  if (
    normalizedPreviousDoi &&
    !relatedIdentifiers.some(
      (relation) =>
        relation.relationType === "IsNewVersionOf" &&
        relation.relatedIdentifier?.trim().toLowerCase() ===
          normalizedPreviousDoi.toLowerCase(),
    )
  ) {
    relatedIdentifiers.push({
      relatedIdentifier: normalizedPreviousDoi,
      relatedIdentifierType: "DOI",
      relationType: "IsNewVersionOf",
      resourceTypeGeneral: "Poster",
    });
    changed = true;
  }

  return { relatedIdentifiers, changed };
}
