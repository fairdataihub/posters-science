import { conferenceYearFromStartDate } from "#shared/types/bulkImportConference";
import {
  inferAffiliationIdentifierScheme,
  inferFunderIdentifierType,
  inferNameIdentifierScheme,
  isCanonicalSchemeUri,
  normalizeAffiliationIdentifierToUrl,
  normalizeNameIdentifierToUrl,
  schemeUriForScheme,
  strictFormSchema,
  type PosterResponse,
  type StrictFormSchema,
  type StrictFormState,
} from "~/utils/poster_schema";

type FundingReference = StrictFormSchema["fundingReferences"][number];

function syncFunderSchemeUri(
  funder: FundingReference,
  type = funder.funderIdentifierType,
) {
  if (!type) {
    funder.schemeUri = "";
    return;
  }

  if (type === "Other") {
    if (isCanonicalSchemeUri(funder.schemeUri)) funder.schemeUri = "";
    return;
  }

  funder.schemeUri = schemeUriForScheme(type) ?? funder.schemeUri;
}

function emptyStrictFormDefaults(): StrictFormState {
  return {
    title: "",
    description: "",
    submissionAbstract: "",
    doi: "",
    identifiers: [],
    creators: [
      {
        givenName: "",
        familyName: "",
        nameType: "Personal",
        nameIdentifiers: [
          { nameIdentifier: "", nameIdentifierScheme: "", schemeURI: "" },
        ],
        affiliation: [],
      },
    ],
    publisher: "",
    publicationYear: undefined,
    subjects: [],
    language: "en",
    relatedIdentifiers: [],
    size: "",
    format: "PDF",
    version: "",
    license: "",
    fundingReferences: [],
    conference: {
      conferenceName: "",
      conferenceLocation: "",
      conferenceUri: "",
      conferenceIdentifier: "",
      conferenceIdentifierType: "",
      conferenceYear: undefined,
      conferenceStartDate: "",
      conferenceEndDate: "",
      conferenceAcronym: "",
      conferenceSeries: "",
      presentedStartDate: "",
      presentedEndDate: "",
    },
    posterContent: {
      sections: [],
      unstructuredContent: "",
    },
    tableCaptions: [],
    imageCaptions: [],
    domain: "",
  };
}

/**
 * Maps GET /api/poster/:id payload into the same shape the single-poster editor
 * uses before strictFormSchema validation.
 */
export function posterResponseToStrictFormSchema(
  poster: PosterResponse,
): StrictFormState {
  const state = emptyStrictFormDefaults();

  if (poster.title) state.title = poster.title;
  if (poster.description) state.description = poster.description;

  const meta = poster.posterMetadata;
  if (!meta) return state;

  if (meta.doi) state.doi = meta.doi;

  if (
    meta.identifiers &&
    Array.isArray(meta.identifiers) &&
    meta.identifiers.length
  ) {
    state.identifiers = (
      meta.identifiers as { identifier?: string; identifierType?: string }[]
    ).map((i) => ({
      identifier: i.identifier || "",
      identifierType: i.identifierType || "",
    }));
  }

  if (meta.creators?.length) {
    state.creators = meta.creators.map((creator) => {
      let givenName = creator.givenName || "";
      let familyName = creator.familyName || "";

      if (creator.name && !givenName && !familyName) {
        const trimmed = creator.name.trim();

        if (creator.nameType === "Organizational") {
          givenName = trimmed;
        } else if (trimmed.includes(",")) {
          const [family, ...rest] = trimmed.split(",");
          familyName = (family ?? "").trim();
          givenName = rest.join(",").trim();
        } else {
          const nameParts = trimmed.split(/\s+/);

          if (nameParts.length === 1) {
            familyName = nameParts[0] ?? "";
          } else {
            familyName = nameParts.pop() || "";
            givenName = nameParts.join(" ");
          }
        }
      }

      return {
        givenName,
        familyName,
        nameType: (creator.nameType || "Personal") as
          | "Personal"
          | "Organizational",
        nameIdentifiers: (() => {
          const raw: unknown[] = creator.nameIdentifiers || [];
          const mapped = raw.map((ni: unknown) => {
            if (typeof ni === "string") {
              return {
                nameIdentifier: ni,
                nameIdentifierScheme: "",
                schemeURI: "",
              };
            }

            const record = ni as {
              nameIdentifier?: string;
              nameIdentifierScheme?: string;
              schemeURI?: string;
            };

            return {
              nameIdentifier: record?.nameIdentifier || "",
              nameIdentifierScheme: record?.nameIdentifierScheme || "",
              schemeURI: record?.schemeURI || "",
            };
          });

          const firstNonEmpty = mapped.findIndex(
            (entry) => entry.nameIdentifier.trim() !== "",
          );
          if (firstNonEmpty > 0) {
            mapped.unshift(...mapped.splice(firstNonEmpty, 1));
          }

          return mapped.length > 0
            ? mapped
            : [
                {
                  nameIdentifier: "",
                  nameIdentifierScheme: "",
                  schemeURI: "",
                },
              ];
        })(),
        affiliation: (creator.affiliation || []).map((aff: unknown) => {
          if (typeof aff === "string") {
            return {
              name: aff,
              affiliationIdentifier: "",
              affiliationIdentifierScheme: "",
              schemeURI: "",
            };
          }

          const record = aff as {
            name?: string;
            affiliationIdentifier?: string;
            affiliationIdentifierScheme?: string;
            schemeURI?: string;
          };

          return {
            name: record?.name || "",
            affiliationIdentifier: record?.affiliationIdentifier || "",
            affiliationIdentifierScheme:
              record?.affiliationIdentifierScheme || "",
            schemeURI: record?.schemeURI || "",
          };
        }),
      };
    });

    state.creators.forEach((creator) => {
      creator.nameIdentifiers?.forEach((ni) => {
        if (ni.nameIdentifier) {
          const inferred = inferNameIdentifierScheme(ni.nameIdentifier);
          if (inferred) {
            ni.nameIdentifierScheme ||= inferred.scheme;
            ni.schemeURI ||= inferred.schemeURI;
            if (!ni.nameIdentifier.trim().startsWith("http")) {
              const normalized = normalizeNameIdentifierToUrl(
                ni.nameIdentifier,
                inferred.scheme,
              );
              if (normalized) ni.nameIdentifier = normalized;
            }
          }
        }
      });
      creator.affiliation?.forEach((aff) => {
        if (!aff.schemeURI && aff.affiliationIdentifier) {
          const inferred = inferAffiliationIdentifierScheme(
            aff.affiliationIdentifier,
          );
          if (inferred) {
            aff.affiliationIdentifierScheme ||= inferred.scheme;
            aff.schemeURI = inferred.schemeURI;
          }
        }
      });
    });
  }

  if (meta.publisher) {
    const pub = Array.isArray(meta.publisher)
      ? meta.publisher[0]
      : meta.publisher;
    if (pub && typeof pub === "object" && "name" in pub) {
      state.publisher = (pub as { name?: string }).name || "";
    }
  }

  if (meta.publicationYear) state.publicationYear = meta.publicationYear;

  if (meta.subjects?.length) {
    state.subjects = meta.subjects as string[];
  }

  if (meta.language) state.language = meta.language;

  if (
    meta.relatedIdentifiers &&
    Array.isArray(meta.relatedIdentifiers) &&
    meta.relatedIdentifiers.length
  ) {
    state.relatedIdentifiers =
      meta.relatedIdentifiers as StrictFormSchema["relatedIdentifiers"];
  }

  if (meta.size) state.size = meta.size;
  if (meta.format) state.format = meta.format;
  if (meta.version) state.version = meta.version;
  if (meta.license) state.license = meta.license;

  if (meta.fundingReferences?.length) {
    state.fundingReferences = meta.fundingReferences.map((f: unknown) => {
      const row = f as Record<string, unknown>;
      const funder: FundingReference = {
        funderName: (row.funderName as string) || "",
        funderIdentifier: (row.funderIdentifier as string) || "",
        funderIdentifierType: (row.funderIdentifierType ||
          (row.funderIdentifier
            ? inferFunderIdentifierType(row.funderIdentifier as string)
            : undefined)) as FundingReference["funderIdentifierType"],
        schemeUri: (row.schemeUri as string) || "",
        awardNumber: (row.awardNumber as string) || "",
        awardUri: (row.awardUri as string) || "",
        awardTitle: (row.awardTitle as string) || "",
      };

      if (
        funder.funderIdentifierType &&
        funder.funderIdentifierType !== "Other"
      ) {
        syncFunderSchemeUri(funder);
      }

      return funder;
    });
  }

  if (meta.conference) {
    state.conference = {
      conferenceName: meta.conference.conferenceName ?? "",
      conferenceLocation: meta.conference.conferenceLocation || "",
      conferenceUri: meta.conference.conferenceUri || "",
      conferenceIdentifier: meta.conference.conferenceIdentifier || "",
      conferenceIdentifierType: meta.conference.conferenceIdentifierType || "",
      conferenceYear: meta.conference.conferenceYear ?? undefined,
      conferenceStartDate: meta.conference.conferenceStartDate ?? "",
      conferenceEndDate: meta.conference.conferenceEndDate ?? "",
      conferenceAcronym: meta.conference.conferenceAcronym || "",
      conferenceSeries: meta.conference.conferenceSeries || "",
      presentedStartDate: meta.conference.presentedStartDate ?? "",
      presentedEndDate: meta.conference.presentedEndDate ?? "",
    };
    const yearFromStart = conferenceYearFromStartDate(
      state.conference.conferenceStartDate,
    );
    if (state.conference.conferenceYear == null && yearFromStart != null) {
      state.conference.conferenceYear = yearFromStart;
    }
  }

  if (meta.posterContent) {
    state.posterContent = {
      sections:
        meta.posterContent.sections?.map((section: unknown) => {
          const row = section as {
            sectionTitle?: string;
            sectionContent?: string;
          };
          return {
            sectionTitle: row.sectionTitle || "",
            sectionContent: row.sectionContent || "",
          };
        }) || [],
      unstructuredContent: meta.posterContent.unstructuredContent || "",
    };

    if (meta.posterContent.submissionAbstract) {
      state.submissionAbstract = meta.posterContent.submissionAbstract;
    }
  }

  const tableCaps = meta.tableCaptions ?? (meta as { tableCaption?: unknown }).tableCaption ?? [];

  if (Array.isArray(tableCaps) && tableCaps.length) {
    state.tableCaptions = tableCaps
      .filter((cap: unknown) => {
        const caption = (cap as { caption?: string }).caption ?? "";
        return caption.trim() !== "";
      })
      .map((cap: unknown) => {
        const row = cap as { id?: string; caption?: string };
        return {
          ...(row.id ? { id: row.id } : {}),
          caption: row.caption ?? "",
        };
      });
  }

  const imgCaps = meta.imageCaptions ?? (meta as { imageCaption?: unknown }).imageCaption ?? [];

  if (Array.isArray(imgCaps) && imgCaps.length) {
    state.imageCaptions = imgCaps
      .filter((cap: unknown) => {
        const caption = (cap as { caption?: string }).caption ?? "";
        return caption.trim() !== "";
      })
      .map((cap: unknown) => {
        const row = cap as { id?: string; caption?: string };
        return {
          ...(row.id ? { id: row.id } : {}),
          caption: row.caption ?? "",
        };
      });
  }

  state.domain = meta.domain ?? "";

  state.creators = state.creators.filter(
    (creator) => !contributorRowIsEmpty(creator),
  );

  return state;
}

function contributorRowIsEmpty(
  creator: StrictFormSchema["creators"][number],
): boolean {
  const given = creator.givenName?.trim() ?? "";
  const family = creator.familyName?.trim() ?? "";
  if (creator.nameType === "Organizational") return given.length === 0;
  return given.length === 0 && family.length === 0;
}

export const BULK_CONTRIBUTOR_REQUIRED_MESSAGE =
  "You must add at least one contributor.";

function isPlaceholderContributorIssue(issue: PosterStrictValidationIssue): boolean {
  if (issue.path === "creators") {
    return (
      issue.message === BULK_CONTRIBUTOR_REQUIRED_MESSAGE ||
      issue.message === "At least one creator is required" ||
      /creator|contributor/i.test(issue.message)
    );
  }

  if (!issue.path.startsWith("creators.")) return false;

  const field = issue.path.split(".").pop();
  if (field === "givenName" && issue.message === "Name is required") {
    return true;
  }
  if (field === "familyName" && issue.message === "Family name is required") {
    return true;
  }

  return false;
}

/** Collapse empty creator rows into one contributor message for bulk UX. */
export function normalizeStrictValidationIssues(
  issues: PosterStrictValidationIssue[],
): PosterStrictValidationIssue[] {
  if (issues.length === 0) return issues;

  const hasPlaceholderContributorIssue = issues.some(isPlaceholderContributorIssue);
  if (!hasPlaceholderContributorIssue) return issues;

  const otherIssues = issues.filter((issue) => !isPlaceholderContributorIssue(issue));
  const contributorIssue: PosterStrictValidationIssue = {
    path: "creators",
    message: BULK_CONTRIBUTOR_REQUIRED_MESSAGE,
  };

  if (otherIssues.length === 0) return [contributorIssue];
  return [...otherIssues, contributorIssue];
}

export type PosterStrictValidationIssue = {
  path: string;
  message: string;
};

export type PosterStrictValidationResult = {
  valid: boolean;
  issues: PosterStrictValidationIssue[];
};

export function validatePosterResponseStrictForm(
  poster: PosterResponse,
): PosterStrictValidationResult {
  const payload = posterResponseToStrictFormSchema(poster);
  const parseResult = strictFormSchema.safeParse(payload);

  if (parseResult.success) {
    return { valid: true, issues: [] };
  }

  return {
    valid: false,
    issues: normalizeStrictValidationIssues(
      parseResult.error.issues.map((issue) => ({
        path: issue.path.join("."),
        message: issue.message,
      })),
    ),
  };
}
