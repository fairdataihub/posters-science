/**
 * Turn strict-form validation paths (e.g. "creators.0.nameIdentifiers.0.nameIdentifier")
 * into readable labels ("Creator 1 ORCID") for user-facing messages.
 */

const LIST_ITEM_LABELS: Record<string, string> = {
  creators: "Creator",
  affiliation: "affiliation",
  fundingReferences: "Funder",
  relatedIdentifiers: "Related resource",
  identifiers: "Identifier",
  sections: "Section",
  imageCaptions: "Image caption",
  tableCaptions: "Table caption",
  subjects: "Keyword",
};

const FIELD_LABELS: Record<string, string> = {
  title: "Title",
  description: "Description",
  subjects: "Keywords",
  givenName: "given name",
  familyName: "family name",
  name: "name",
  nameType: "name type",
  nameIdentifier: "ORCID",
  nameIdentifierScheme: "identifier scheme",
  affiliationIdentifier: "ROR identifier",
  funderName: "name",
  funderIdentifier: "identifier",
  funderIdentifierType: "identifier type",
  schemeUri: "scheme URI",
  awardNumber: "award number",
  awardTitle: "award title",
  awardUri: "award URI",
  relatedIdentifier: "identifier",
  relatedIdentifierType: "identifier type",
  relationType: "relation type",
  relationTypeInformation: "relation description",
  resourceTypeGeneral: "resource type",
  identifier: "identifier",
  identifierType: "identifier type",
  sectionTitle: "title",
  sectionContent: "content",
  caption: "caption",
  submissionAbstract: "Submission abstract",
  language: "Primary language",
  domain: "Domain",
  license: "License",
  version: "Version",
  doi: "DOI",
  publisher: "Publisher",
  publicationYear: "Publication year",
  format: "Format",
  conferenceName: "Conference name",
  conferenceYear: "Conference year",
  conferenceLocation: "Conference location",
  conferenceUri: "Conference website",
  conferenceIdentifier: "Conference identifier",
  conferenceIdentifierType: "Conference identifier type",
  conferenceAcronym: "Conference acronym",
  conferenceSeries: "Conference series",
  conferenceStartDate: "Conference start date",
  conferenceEndDate: "Conference end date",
  presentedStartDate: "Poster presentation date",
};

/** Containers that add nothing readable on their own. */
const SKIP_SEGMENTS = new Set([
  "conference",
  "posterContent",
  "nameIdentifiers",
]);

export function strictIssuePathLabel(path: string | undefined): string {
  if (!path) return "";
  const segments = path.split(".");
  const parts: string[] = [];

  for (let i = 0; i < segments.length; i++) {
    const segment = segments[i]!;
    const next = segments[i + 1];
    const index = next != null && /^\d+$/.test(next) ? Number(next) : null;

    if (/^\d+$/.test(segment)) continue;
    if (SKIP_SEGMENTS.has(segment)) continue;

    if (index != null && LIST_ITEM_LABELS[segment]) {
      parts.push(`${LIST_ITEM_LABELS[segment]} ${index + 1}`);
      continue;
    }

    parts.push(FIELD_LABELS[segment] ?? segment);
  }

  const label = parts.join(" ").trim();
  return label.charAt(0).toUpperCase() + label.slice(1);
}

function lastFieldLabel(path: string): string {
  const segments = path.split(".").filter((segment) => !/^\d+$/.test(segment));
  const last = segments[segments.length - 1] ?? "";
  return (FIELD_LABELS[last] ?? last).toLowerCase();
}

/** "Creator 1 ORCID must be a valid URL (…)" */
export function strictIssueMessage(
  path: string | undefined,
  message: string,
): string {
  if (!path) return message;
  const segments = path.split(".");

  // Whole-list problems ("creators", "subjects") read fine on their own.
  if (segments.length === 1 && LIST_ITEM_LABELS[segments[0]!]) return message;

  const label = strictIssuePathLabel(path);
  if (!label) return message;

  const lowerMessage = message.toLowerCase();
  const field = lastFieldLabel(path);
  const fieldStem = field.replace(/s$/, "");

  // Message already names the field ("Title is required", "Section content is required").
  if (fieldStem && lowerMessage.includes(fieldStem)) {
    const context = label.slice(0, label.length - field.length).trim();
    // Keep the item context ("Creator 2") when the message doesn't have it.
    if (context && !lowerMessage.includes(context.toLowerCase())) {
      return lowerMessage.startsWith(field)
        ? `${context} ${field}${message.slice(field.length)}`
        : `${context}: ${message}`;
    }
    return message;
  }

  // Sentence-style for messages like "Must be …" / "Is required".
  if (/^(must|is|are|should|cannot|can't|needs?|required)\b/i.test(message)) {
    const rest =
      message.toLowerCase() === "required"
        ? "is required"
        : `${message.charAt(0).toLowerCase()}${message.slice(1)}`;
    return `${label} ${rest}`;
  }
  return `${label}: ${message}`;
}
