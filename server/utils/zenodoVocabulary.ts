/**
 * Translates our DataCite 4.7 metadata into Zenodo's vocabulary.
 *
 * Zenodo speaks its own dialect: hierarchical resource type ids, idutils scheme
 * names rather than DataCite's, and relation types still at DataCite 4.4.
 * Keeping the translation here means poster.json stays canonical DataCite.
 *
 * Check new terms against `{zenodoApiEndpoint}/vocabularies/` to stay up to date.
 */

/** A related identifier as stored: DataCite 4.7 terms. */
export type DataciteRelatedIdentifier = {
  relatedIdentifier?: string;
  relatedIdentifierType?: string;
  relationType?: string;
  resourceTypeGeneral?: string;
};

/** A related identifier as InvenioRDM expects it. */
export type RdmRelatedIdentifier = {
  identifier: string;
  scheme: string;
  relation_type: { id: string };
  resource_type?: { id: string };
};

// Every DataCite term is listed so a schema bump can't silently drop one.
// Terms Zenodo has no equivalent for map to "other" rather than vanishing.
const RESOURCE_TYPE: Record<string, string> = {
  Audiovisual: "video",
  Award: "other",
  Book: "publication-book",
  BookChapter: "publication-section",
  Collection: "other",
  ComputationalNotebook: "software-computationalnotebook",
  ConferencePaper: "publication-conferencepaper",
  ConferenceProceeding: "publication-conferenceproceeding",
  DataPaper: "publication-datapaper",
  Dataset: "dataset",
  Dissertation: "publication-dissertation",
  Event: "event",
  Image: "image",
  Instrument: "other",
  InteractiveResource: "other",
  Journal: "publication-journal",
  JournalArticle: "publication-article",
  Model: "model",
  OutputManagementPlan: "publication-datamanagementplan",
  PeerReview: "publication-peerreview",
  PhysicalObject: "physicalobject",
  Poster: "poster",
  Preprint: "publication-preprint",
  Presentation: "presentation",
  Project: "other",
  Report: "publication-report",
  Service: "other",
  Software: "software",
  Sound: "other",
  Standard: "publication-standard",
  StudyRegistration: "other",
  Text: "publication",
  Workflow: "workflow",
  Other: "other",
};

/** The Zenodo resource_type id for a DataCite resourceTypeGeneral term. */
export function zenodoResourceTypeFor(term: string): string | undefined {
  return RESOURCE_TYPE[term];
}

// Schemes Zenodo spells differently. Anything absent just lowercases.
const SCHEME: Record<string, string> = {
  bibcode: "ads",
  swhid: "swh",
};

// Zenodo has no scheme for these. URL-shaped values still go as a plain url so
// the link survives; anything else is dropped.
const UNSUPPORTED_SCHEMES = new Set(["raid"]);

// DataCite 4.7 terms that Zenodo's 4.4-era vocabulary lacks. Passed through
// unchanged on purpose: rewriting them would hide a gap that is Zenodo's to
// fix. Warned about so the rejection is recognisable in the logs.
const RELATION_TYPES_ZENODO_LACKS = new Set([
  "collects",
  "iscollectedby",
  "hastranslation",
  "istranslationof",
  "other",
]);

/** Translates stored DataCite related identifiers into InvenioRDM's shape. */
export function toZenodoRelatedIdentifiers(
  related: DataciteRelatedIdentifier[],
): RdmRelatedIdentifier[] {
  return related
    .filter(
      (r) => r.relatedIdentifier && r.relatedIdentifierType && r.relationType,
    )
    .flatMap((r) => {
      const identifier = r.relatedIdentifier!;
      const dataciteScheme = r.relatedIdentifierType!;
      const isUrl = /^https?:\/\//.test(identifier);
      let scheme =
        SCHEME[dataciteScheme.toLowerCase()] ?? dataciteScheme.toLowerCase();

      // Shape checks Zenodo would otherwise reject outright.
      if (scheme === "url" && !isUrl) return [];
      if (scheme === "doi" && !/^10\.\d{4,}\//.test(identifier)) return [];

      if (UNSUPPORTED_SCHEMES.has(scheme)) {
        if (!isUrl) {
          console.warn(
            `[Zenodo] Dropping related identifier: Zenodo has no "${dataciteScheme}" scheme and the value is not a URL`,
          );

          return [];
        }

        console.warn(
          `[Zenodo] Zenodo has no "${dataciteScheme}" scheme, publishing this identifier as a plain url`,
        );
        scheme = "url";
      }

      const relationType = r.relationType!.toLowerCase();

      if (RELATION_TYPES_ZENODO_LACKS.has(relationType)) {
        console.warn(
          `[Zenodo] Relation type "${r.relationType}" is DataCite 4.7 but absent from Zenodo's 4.4-era vocabulary - expect this record to be rejected`,
        );
      }

      const resourceType = r.resourceTypeGeneral
        ? RESOURCE_TYPE[r.resourceTypeGeneral]
        : undefined;

      if (r.resourceTypeGeneral && !resourceType) {
        console.warn(
          `[Zenodo] No Zenodo resource type mapping for "${r.resourceTypeGeneral}", omitting it from this related identifier`,
        );
      }

      // poster and presentation have no DataCite generic, but Zenodo renders
      // them as "Text" via its own vocabulary, so they are safe to send.
      return [
        {
          identifier,
          scheme,
          relation_type: { id: relationType },
          ...(resourceType && { resource_type: { id: resourceType } }),
        },
      ];
    });
}
