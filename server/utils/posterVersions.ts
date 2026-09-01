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
  const relatedIdentifiers = Array.isArray(raw)
    ? raw
        .filter(
          (relation): relation is VersionRelatedIdentifier =>
            typeof relation === "object" && relation !== null,
        )
        .map((relation) => {
          if (
            relation.relationType !== "IsNewVersionOf" ||
            relation.resourceTypeGeneral
          ) {
            return relation;
          }

          changed = true;

          return { ...relation, resourceTypeGeneral: "Text" };
        })
    : [];
  const normalizedPreviousDoi = previousDoi?.trim();

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
      resourceTypeGeneral: "Text",
    });
    changed = true;
  }

  return { relatedIdentifiers, changed };
}
