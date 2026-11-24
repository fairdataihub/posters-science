import type { PosterMetadata } from "#shared/generated/client";
import { isValidOrcidChecksum } from "#shared/utils/orcid";
import spdxLicenses from "../../app/assets/data/licenses.json";
import type {
  FigshareArticlePayload,
  FigshareAuthorInput,
  FigshareLicense,
  FigshareRelatedMaterial,
} from "./figshareClient";

/**
 * Builds the Figshare item for a poster, following the draft crosswalk in
 * fairdataihub/poster-json-schema PR #17 (crosswalk/figshare.md). What
 * Figshare has no field for (affiliations, language, funder ids, conference
 * details apart from the description block) stays in the deposited
 * poster.json, which is the complete copy of the metadata.
 */

// ArticleCreate limits in the Figshare API spec.
export const FIGSHARE_TITLE_MIN = 3;
export const FIGSHARE_TITLE_MAX = 1000;
export const FIGSHARE_DESCRIPTION_MAX = 20_000;

type DbCreator = {
  name?: string;
  givenName?: string;
  familyName?: string;
  nameType?: string;
  nameIdentifiers?: {
    nameIdentifier?: string;
    nameIdentifierScheme?: string;
    schemeURI?: string;
  }[];
};

type DbRelatedIdentifier = {
  relatedIdentifier?: string;
  relatedIdentifierType?: string;
  relationType?: string;
};

type DbIdentifier = { identifier?: string; identifierType?: string };

export type DbFundingReference = {
  funderName?: string;
  awardNumber?: string;
  awardTitle?: string;
};

// The identifier types and relations Figshare's related_materials accept
// (RelatedMaterial in the API spec). They use DataCite's names.
const FIGSHARE_IDENTIFIER_TYPES = new Set([
  "ARK",
  "arXiv",
  "bibcode",
  "DOI",
  "EAN13",
  "EISSN",
  "Handle",
  "IGSN",
  "ISBN",
  "ISSN",
  "ISTC",
  "LISSN",
  "LSID",
  "PMID",
  "PURL",
  "UPC",
  "URL",
  "URN",
  "w3id",
]);

const FIGSHARE_RELATIONS = new Set([
  "IsCitedBy",
  "Cites",
  "IsSupplementTo",
  "IsSupplementedBy",
  "IsContinuedBy",
  "Continues",
  "Describes",
  "IsDescribedBy",
  "HasMetadata",
  "IsMetadataFor",
  "HasVersion",
  "IsVersionOf",
  "IsPartOf",
  "HasPart",
  "IsPublishedIn",
  "IsReferencedBy",
  "References",
  "IsDocumentedBy",
  "Documents",
  "IsCompiledBy",
  "Compiles",
  "IsVariantFormOf",
  "IsOriginalFormOf",
  "IsIdenticalTo",
  "IsReviewedBy",
  "Reviews",
  "IsDerivedFrom",
  "IsSourceOf",
  "IsRequiredBy",
  "Requires",
  "IsObsoletedBy",
  "Obsoletes",
]);

// Figshare links the versions of an item itself, so these stay in poster.json.
const VERSION_RELATIONS = new Set(["IsNewVersionOf", "IsPreviousVersionOf"]);

function clean(value: unknown) {
  return typeof value === "string" ? value.trim() : "";
}

function escapeHtml(text: string) {
  return text
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

/** Plain text to HTML paragraphs: blank lines split paragraphs, single newlines become breaks. */
function paragraphs(text: string) {
  return text
    .split(/\n\s*\n/)
    .map((block) => block.trim())
    .filter(Boolean)
    .map((block) => `<p>${escapeHtml(block).replace(/\n/g, "<br>")}</p>`)
    .join("");
}

/** Shortens text to at most `max` characters, at a word boundary. */
function shortenAtWord(text: string, max: number) {
  if (text.length <= max) return text;
  if (max <= 1) return "";

  const cut = text.slice(0, max - 1);
  const lastSpace = cut.lastIndexOf(" ");

  return `${(lastSpace > max * 0.6 ? cut.slice(0, lastSpace) : cut).trimEnd()}…`;
}

function bareOrcid(creator: DbCreator) {
  for (const ni of creator.nameIdentifiers ?? []) {
    const value = clean(ni.nameIdentifier);

    if (!value) continue;

    const isOrcid =
      /orcid\.org\//i.test(value) ||
      clean(ni.nameIdentifierScheme).toLowerCase() === "orcid" ||
      clean(ni.schemeURI).toLowerCase().includes("orcid.org");

    if (!isOrcid) continue;

    const bare = value.replace(/^.*orcid\.org\//i, "").trim();

    if (isValidOrcidChecksum(bare)) return bare;
  }

  return undefined;
}

export function buildFigshareAuthors(creators: DbCreator[]) {
  const authors: FigshareAuthorInput[] = [];

  for (const creator of creators) {
    const orcid = bareOrcid(creator);
    const isOrganization =
      clean(creator.nameType).toLowerCase() === "organizational";
    let first = clean(creator.givenName);
    let last = clean(creator.familyName);
    const name = clean(creator.name);

    if (isOrganization || (!first && !last)) {
      // "Family, Given" names without parts are split as Zenodo does.
      if (!isOrganization && name.includes(",")) {
        const [family, ...given] = name.split(",");

        last = clean(family);
        first = clean(given.join(","));
      } else if (name || last) {
        authors.push({
          name: (name || last).slice(0, 255),
          ...(orcid && { orcid_id: orcid }),
        });
        continue;
      } else {
        continue;
      }
    }

    // Figshare allows 255 characters for the first and last name together.
    const lastName = last.slice(0, 255);
    const firstName = first.slice(0, Math.max(0, 254 - lastName.length));

    authors.push({
      ...(firstName && { first_name: firstName }),
      ...(lastName && { last_name: lastName }),
      ...(!lastName && !firstName && name && { name: name.slice(0, 255) }),
      ...(orcid && { orcid_id: orcid }),
    });
  }

  return authors;
}

export function buildFigshareKeywords(subjects: string[]) {
  const seen = new Set<string>();
  const keywords: string[] = [];

  for (const subject of subjects) {
    const keyword = clean(subject);
    const key = keyword.toLowerCase();

    if (!keyword || seen.has(key)) continue;

    seen.add(key);
    keywords.push(keyword);
  }

  return keywords;
}

/**
 * The Conference block agreed on 2026-10-23: "Presented at Name (ACRONYM),
 * Location, start - end." then the conference link. Missing parts are left
 * out. Null when there is no conference.
 */
export function figshareConferenceBlock(meta: PosterMetadata) {
  const name = clean(meta.conferenceName);
  const acronym = clean(meta.conferenceAcronym);
  const location = clean(meta.conferenceLocation);
  const start = clean(meta.conferenceStartDate);
  const end = clean(meta.conferenceEndDate);
  const uri = clean(meta.conferenceUri);
  const dates =
    start && end && start !== end
      ? `${start} - ${end}`
      : start ||
        end ||
        (meta.conferenceYear ? String(meta.conferenceYear) : "");
  const title =
    name && acronym && acronym !== name
      ? `${name} (${acronym})`
      : name || acronym;
  const place = [title, location].filter(Boolean);

  if (place.length === 0 && !dates && !uri) return null;

  let html = "<h3>Conference</h3>";

  // Without a name or place, "Presented at 2019." would read wrong.
  if (place.length > 0) {
    html += `<p>Presented at ${escapeHtml([...place, dates].filter(Boolean).join(", "))}.</p>`;
  } else if (dates) {
    html += `<p>Presented ${/^\d{4}$/.test(dates) ? "in" : "on"} ${escapeHtml(dates)}.</p>`;
  }

  if (/^https?:\/\//i.test(uri)) {
    const safe = escapeHtml(uri);

    html += `<p><a href="${safe}">${safe}</a></p>`;
  }

  return html;
}

/**
 * One HTML description: the poster's description, the submission abstract
 * under "Abstract", then the conference block. Over Figshare's 20,000
 * characters the conference block stays whole and the longer of the other two
 * is shortened first, at a word.
 */
export function buildFigshareDescription(
  posterDescription: string,
  submissionAbstract: string | undefined,
  meta: PosterMetadata,
) {
  let description = clean(posterDescription);
  let abstract = clean(submissionAbstract);

  if (abstract && abstract === description) abstract = "";

  const conference = figshareConferenceBlock(meta) ?? "";
  const render = () =>
    [
      description ? paragraphs(description) : "",
      abstract ? `<h3>Abstract</h3>${paragraphs(abstract)}` : "",
      conference,
    ].join("");

  let html = render();

  // Escaping and tags add length, so shorten in steps until it fits.
  for (
    let guard = 0;
    html.length > FIGSHARE_DESCRIPTION_MAX && guard < 50;
    guard += 1
  ) {
    const over = html.length - FIGSHARE_DESCRIPTION_MAX;

    if (description.length >= abstract.length && description) {
      description = shortenAtWord(description, description.length - over - 20);
    } else if (abstract) {
      abstract = shortenAtWord(abstract, abstract.length - over - 20);
    } else {
      break;
    }

    html = render();
  }

  return html.slice(0, FIGSHARE_DESCRIPTION_MAX);
}

function looksLikeUrl(value: string) {
  return /^https?:\/\/\S+$/i.test(value);
}

/** A DOI or link that is this same Figshare item, any version. */
function isThisItem(identifier: string, articleId?: number) {
  if (!articleId) return false;

  return new RegExp(`(^|[./])${articleId}(\\.v\\d+)?/?$`).test(identifier);
}

export function buildFigshareRelatedMaterials(
  relatedIdentifiers: DbRelatedIdentifier[],
  identifiers: DbIdentifier[],
  articleId?: number,
) {
  const materials: FigshareRelatedMaterial[] = [];
  const dropped: string[] = [];
  const seen = new Set<string>();

  const add = (material: FigshareRelatedMaterial) => {
    const key = `${material.relation}|${material.identifier.toLowerCase()}`;

    if (seen.has(key)) return;

    seen.add(key);
    materials.push(material);
  };

  for (const related of relatedIdentifiers) {
    const identifier = clean(related.relatedIdentifier);
    const relation = clean(related.relationType) || "References";
    let type = clean(related.relatedIdentifierType) || "URL";

    if (!identifier || isThisItem(identifier, articleId)) continue;
    if (VERSION_RELATIONS.has(relation)) continue;

    if (!FIGSHARE_RELATIONS.has(relation)) {
      dropped.push(`${relation} ${identifier}`);
      continue;
    }

    if (!FIGSHARE_IDENTIFIER_TYPES.has(type)) {
      if (!looksLikeUrl(identifier)) {
        dropped.push(`${type} ${identifier}`);
        continue;
      }

      type = "URL";
    }

    add({ identifier, identifier_type: type, relation });
  }

  // Other identifiers of this same poster (a DOI from elsewhere, arXiv, ...).
  for (const entry of identifiers) {
    const identifier = clean(entry.identifier);
    let type = clean(entry.identifierType) || "URL";

    if (!identifier || isThisItem(identifier, articleId)) continue;
    if (/figshare/i.test(identifier)) continue;

    if (!FIGSHARE_IDENTIFIER_TYPES.has(type)) {
      if (!looksLikeUrl(identifier)) continue;
      type = "URL";
    }

    add({ identifier, identifier_type: type, relation: "IsIdenticalTo" });
  }

  return { materials, dropped };
}

/** "Funder, award number: award title", leaving out what is missing. */
export function figshareFundingText(funding: DbFundingReference) {
  const funder = clean(funding.funderName);
  const award = clean(funding.awardNumber);
  const title = clean(funding.awardTitle);
  const head = [funder, award].filter(Boolean).join(", ");

  if (head && title) return `${head}: ${title}`;

  return head || title;
}

export type FigshareArticleChoices = {
  categoryIds: number[];
  licenseId?: number;
  /** Set when updating an existing item, to skip links to itself. */
  articleId?: number;
};

export type FigshareArticleDraft = {
  payload: FigshareArticlePayload;
  /** What Figshare needs before it publishes, in words for the form. */
  missing: string[];
  /** Related identifiers Figshare has no place for; kept in poster.json. */
  dropped: string[];
};

export function buildFigshareArticle(
  poster: { title: string; description: string },
  meta: PosterMetadata,
  choices: FigshareArticleChoices,
): FigshareArticleDraft {
  const title = clean(poster.title).slice(0, FIGSHARE_TITLE_MAX);
  const creators = Array.isArray(meta.creators)
    ? (meta.creators as DbCreator[])
    : [];
  const authors = buildFigshareAuthors(creators);
  const keywords = buildFigshareKeywords(meta.subjects ?? []);
  const posterContent = (meta.posterContent ?? null) as {
    submissionAbstract?: string;
  } | null;
  const description = buildFigshareDescription(
    poster.description,
    posterContent?.submissionAbstract,
    meta,
  );
  const { materials, dropped } = buildFigshareRelatedMaterials(
    Array.isArray(meta.relatedIdentifiers)
      ? (meta.relatedIdentifiers as DbRelatedIdentifier[])
      : [],
    Array.isArray(meta.identifiers) ? (meta.identifiers as DbIdentifier[]) : [],
    choices.articleId,
  );
  const fundingTexts = (
    Array.isArray(meta.fundingReferences)
      ? (meta.fundingReferences as DbFundingReference[])
      : []
  )
    .map(figshareFundingText)
    .filter(Boolean);
  const categories = [...new Set(choices.categoryIds)].filter((id) =>
    Number.isInteger(id),
  );

  const missing: string[] = [];

  if (title.length < FIGSHARE_TITLE_MIN) {
    missing.push(`A title of at least ${FIGSHARE_TITLE_MIN} characters`);
  }
  if (authors.length === 0) missing.push("At least one author");
  if (keywords.length === 0) missing.push("At least one keyword");
  if (!description) missing.push("A description");
  if (categories.length === 0) missing.push("At least one category");
  if (!choices.licenseId) missing.push("A license");

  return {
    payload: {
      title,
      description,
      defined_type: "poster",
      authors,
      keywords,
      ...(categories.length > 0 && { categories }),
      ...(choices.licenseId && { license: choices.licenseId }),
      ...(materials.length > 0 && { related_materials: materials }),
      ...(fundingTexts.length > 0 && {
        funding_list: fundingTexts.map((text) => ({ title: text })),
      }),
    },
    missing,
    dropped,
  };
}

// License matching. Figshare lists licenses by its own id, name and URL
// (figshare.com: "CC BY 4.0", "CC0", "MIT", "Apache 2.0", "GPL 3.0+", ...).
// Posters store SPDX ids. Only exact matches count.

function normalizeLicenseUrl(url: string | undefined) {
  return clean(url)
    .toLowerCase()
    .replace(/^https?:\/\//, "")
    .replace(/^www\./, "")
    .replace(/\/(legalcode(\.[a-z-]+)?|deed\.[a-z-]+)$/, "")
    .replace(/\.html$/, "")
    .replace(/\/+$/, "");
}

function normalizeLicenseName(name: string | undefined) {
  return clean(name)
    .toLowerCase()
    .replace(/[\s_-]+/g, " ")
    .replace(/ or later$/, "+")
    .replace(/ only$/, "")
    .trim();
}

type SpdxLicense = { licenseId: string; name: string; seeAlso?: string[] };

/** Names Figshare is known to use for an SPDX id, beyond what SPDX lists. */
function figshareStyleNames(spdxId: string) {
  const names = [spdxId];
  const cc = spdxId.match(/^CC-(BY(?:-[A-Z]+)*)-(\d\.\d)$/);

  if (cc) names.push(`CC ${cc[1]} ${cc[2]}`);
  if (spdxId === "CC0-1.0") names.push("CC0", "CC0 1.0");
  if (spdxId === "Apache-2.0") names.push("Apache 2.0");

  const gpl = spdxId.match(/^GPL-(\d\.\d)(-or-later|-only)?$/);

  if (gpl) {
    names.push(gpl[2] === "-or-later" ? `GPL ${gpl[1]}+` : `GPL ${gpl[1]}`);
  }

  return names.map(normalizeLicenseName);
}

function spdxEntry(spdxId: string) {
  return (spdxLicenses as SpdxLicense[]).find(
    (license) => license.licenseId === spdxId,
  );
}

function licenseMatches(spdxId: string, license: FigshareLicense) {
  const entry = spdxEntry(spdxId);
  const url = normalizeLicenseUrl(license.url);
  const urls = (entry?.seeAlso ?? []).map(normalizeLicenseUrl);

  if (url && urls.includes(url)) return true;

  const name = normalizeLicenseName(license.name);
  const names = [
    ...figshareStyleNames(spdxId),
    ...(entry ? [normalizeLicenseName(entry.name)] : []),
  ];

  return !!name && names.includes(name);
}

/** The account's license for a stored SPDX id, if Figshare offers it. */
export function matchFigshareLicense(
  spdxId: string | null | undefined,
  licenses: FigshareLicense[],
) {
  const id = clean(spdxId);

  if (!id) return undefined;

  return licenses.find((license) => licenseMatches(id, license));
}

/** The SPDX id for a Figshare license, to keep poster.json in step with Figshare. */
export function spdxForFigshareLicense(license: FigshareLicense) {
  const candidates = (spdxLicenses as SpdxLicense[]).filter((entry) =>
    licenseMatches(entry.licenseId, license),
  );

  // Prefer a current id over a deprecated alias of the same license.
  return (
    candidates.find(
      (entry) =>
        !(entry as SpdxLicense & { isDeprecatedLicenseId?: boolean })
          .isDeprecatedLicenseId,
    ) ?? candidates[0]
  )?.licenseId;
}
