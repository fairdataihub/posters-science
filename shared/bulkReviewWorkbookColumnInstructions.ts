/**
 * Column help text aligned with the single-poster Review Metadata UI (share/[id]).
 * Workbook row 2; validation notes reflect strictFormSchema / bulk import behavior.
 */
const INSTRUCTIONS: Record<string, string> = {
  poster_id:
    "Links this row to a poster in your bulk import. Must be a valid poster ID from this batch.",
  file_name:
    "Original upload file name for reference when sorting or copying rows; import matching uses Poster ID.",
  title: "Poster title. Required to submit a poster in the share workflow.",
  description:
    "Short description of the poster. Required to submit a poster in the share workflow.",
  keywords:
    "Separate keywords with semicolons (e.g. Machine Learning; Type 2 Diabetes). At least one keyword is required to submit.",
  given_name:
    "For Personal authors: given name. For Organizational: organization name (Family name is not used). Required when this creator row is used.",
  family_name:
    "Family name for Personal authors. Required for Personal name type; leave blank for Organizational.",
  name_type:
    "Personal or Organizational. Same choices as the Type field on the share form.",
  name_identifier:
    "Personal: ORCID URL (https://orcid.org/…); must be a valid URL and ORCID checksum. Organizational: organization ROR URL (https://ror.org/…).",
  conference_name:
    "Name of the conference or event where the poster was presented. Required to submit in the share workflow.",
  conference_year:
    "Four-digit year. Optional if Conference start date is set; on import the year is taken from the start date when the sheet year is blank.",
  conference_location:
    "Where the event took place (e.g. Seattle, WA, USA). Same as Location on the share form.",
  conference_acronym: "Short acronym (e.g. ARVO).",
  conference_uri:
    "Conference website URL. Must be a valid URL if provided (same as Conference Website on the share form).",
  conference_identifier: "Optional external identifier for the conference series or event.",
  conference_identifier_type:
    "Type for the conference identifier (when an identifier is provided).",
  conference_series: "Name of the recurring conference series, if applicable.",
  conference_start_date:
    "Start of the conference date range (YYYY-MM-DD). Conference year is taken from this date. Required to submit; start and end must be within 365 days and end must not be before start.",
  conference_end_date:
    "End of the conference date range (YYYY-MM-DD). Optional; if set, must be on or after the start date and within 365 days of it.",
  presented_date:
    "When the poster was first presented (YYYY-MM-DD). Same as Poster presentation date on the share form.",
  submission_abstract:
    "Poster abstract exactly as submitted to the conference (share UI: Poster Abstract).",
  language:
    "Primary language — use the same ISO 639-1 code as the Primary Language dropdown on the share form (e.g. en).",
  domain:
    "Domain or field of study (e.g. Machine Learning, Clinical Medicine). Same as Domain / Field of Study on the share form.",
  related_identifier:
    "URL or identifier for a related publication, dataset, or supplement. Required on a related-resource row when any related field is filled; format is checked against the selected type on submit.",
  related_identifier_type:
    "Identifier type (DOI, URL, etc.). Required when a related identifier is provided.",
  relation_type:
    "How the resource relates to your poster (A = your poster, B = the resource). Required when a related identifier is provided.",
  relation_description:
    "Explain the relationship. Recommended when relation type is Other.",
  resource_type_general:
    "General type of the related resource (optional; same options as Resource Type on the share form).",
  funder_name:
    "Funding organization name. Required when this funding row is used (share UI: Funder Name).",
  funder_identifier_type:
    "Required when a funder identifier is provided (Crossref Funder ID, GRID, ISNI, ROR, or Other).",
  funder_identifier:
    "Funder ID URL (e.g. https://ror.org/…). Must pair with identifier type when provided.",
  scheme_uri:
    "Base URI of the identifier scheme. Required when identifier type is Other and a funder identifier is provided.",
  award_number: "Grant or award number (e.g. R01GM123456).",
  award_title: "Title of the grant or award.",
  award_uri:
    "Link to the award record. Requires an award number or award title when provided; must be a valid URL.",
  section_title: "Title of a section extracted from the poster body.",
  section_content:
    "Text of the section. Share UI: Poster content — content extracted from your poster.",
  item_id:
    "Stable ID for the table or figure on the poster (used to match captions to items).",
  caption:
    "Caption text. Must not be empty when the caption row is used (share form validation).",
};

const AFFILIATION_NAME_INSTRUCTION =
  "Institution or organization name. Required when this affiliation slot is used.";
const AFFILIATION_ROR_INSTRUCTION =
  "ROR URL for this affiliation (https://ror.org/…). Must be a valid URL; ROR IDs use a 9-character ID in the URL.";

export function bulkReviewWorkbookInstructionForFillKey(
  fillKey: string,
): string {
  const direct = INSTRUCTIONS[fillKey];
  if (direct) return direct;

  const nameMatch = /^contributor_affiliation_(\d+)_name$/.exec(fillKey);
  if (nameMatch) {
    const slot = Number(nameMatch[1]);
    return slot === 1
      ? `${AFFILIATION_NAME_INSTRUCTION} Add Affiliation 2, 3, … on the same row for more institutions.`
      : AFFILIATION_NAME_INSTRUCTION;
  }
  if (/^contributor_affiliation_\d+_ror$/.test(fillKey)) {
    return AFFILIATION_ROR_INSTRUCTION;
  }

  return "";
}
