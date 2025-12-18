import * as z from "zod";
import isoLanguages from "@/assets/data/iso-639-1.json";
import licenses from "@/assets/data/licenses.json";
// Constants and options for select fields
const DATE_TYPE_VALUES = [
  "Accepted",
  "Available",
  "Copyrighted",
  "Collected",
  "Coverage",
  "Created",
  "Issued",
  "Submitted",
  "Updated",
  "Valid",
  "Withdrawn",
  "Presented",
  "Other",
] as const;

export const DATE_TYPE_OPTIONS = DATE_TYPE_VALUES.map((v) => ({
  label: v,
  value: v,
}));

const DESCRIPTION_TYPE_VALUES = [
  "Abstract",
  "Methods",
  "SeriesInformation",
  "TableOfContents",
  "TechnicalInfo",
  "Other",
];

const TITLE_TYPE_VALUES = [
  "AlternativeTitle",
  "Subtitle",
  "TranslatedTitle",
  "Other",
] as const;

export const TITLE_TYPE_OPTIONS = TITLE_TYPE_VALUES.map((v) => ({
  label: v,
  value: v,
}));

export const DESCRIPTION_TYPE_OPTIONS = DESCRIPTION_TYPE_VALUES.map((v) => ({
  label: v,
  value: v,
}));

export const ISO_LANGUAGE_OPTIONS = isoLanguages.map((lang) => ({
  label: `${lang.name}`,
  value: lang.code,
}));

export const LICENSE_OPTIONS = licenses.map((lic) => ({
  label: lic.name,
  value: lic.licenseId,
}));

const RESOURCE_TYPE_VALUES = [
  "Audiovisual",
  "Award",
  "Book",
  "BookChapter",
  "Collection",
  "ComputationalNotebook",
  "ConferencePaper",
  "ConferenceProceeding",
  "DataPaper",
  "Dataset",
  "Dissertation",
  "Event",
  "Image",
  "InteractiveResource",
  "Journal",
  "JournalArticle",
  "Model",
  "OutputManagementPlan",
  "PeerReview",
  "PhysicalObject",
  "Preprint",
  "Project",
  "Report",
  "Software",
  "Sound",
  "Standard",
  "StudyRegistration",
  "Text",
  "Workflow",
  "Other",
] as const;

export const RESOURCE_TYPE_OPTIONS = RESOURCE_TYPE_VALUES.map((v) => ({
  label: v,
  value: v,
}));

// Super refines
const AffiliationSuperRefine = (
  data: z.infer<typeof AffiliationSchema>[],
  ctx: z.RefinementCtx,
) => {
  data.forEach((aff, index) => {
    if (
      (aff.affiliationIdentifier && !aff.affiliationIdentifierScheme) ||
      (!aff.affiliationIdentifier && aff.affiliationIdentifierScheme)
    ) {
      const missingField = aff.affiliationIdentifier
        ? "affiliationIdentifierScheme"
        : "affiliationIdentifier";
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message:
          "Both affiliation identifier and scheme must be provided together",
        path: [index, missingField],
      });
    }
  });
};

// Zod schemas for the poster metadata
const IdentifierSchema = z.object({
  identifier: z.string().min(1, { message: "Identifier is required" }),
  identifierType: z.string().min(1, { message: "Identifier type is required" }),
});

const AlternateIdentifierSchema = z.object({
  alternateIdentifier: z
    .string()
    .min(1, { message: "Alternate identifier is required" }),
  alternateIdentifierType: z
    .string()
    .min(1, { message: "Alternate identifier type is required" }),
});

const NameIdentifierSchema = z.object({
  nameIdentifier: z.string().min(1, { message: "Name identifier is required" }),
  nameIdentifierScheme: z.string().optional(),
  schemeURI: z.string().optional(),
});

const AffiliationSchema = z.object({
  name: z.string().min(1, { message: "Name is required" }),
  affiliationIdentifier: z.string().optional(),
  affiliationIdentifierScheme: z.string().optional(),
  schemeURI: z.string().optional(),
});

const CreatorSchema = z.object({
  givenName: z.string().min(1, { message: "Given name is required" }),
  familyName: z.string().min(1, { message: "Family name is required" }),
  nameType: z.enum(["Personal", "Organizational"]).default("Personal"),
  nameIdentifiers: z.array(NameIdentifierSchema).optional().default([]),
  affiliation: z
    .array(AffiliationSchema)
    .optional()
    .default([])
    .superRefine(AffiliationSuperRefine),
});

const TitleEntrySchema = z.object({
  title: z.string().min(1, { message: "A title is required" }),
  titleType: z.enum(TITLE_TYPE_VALUES).optional(),
});

const publisherSuperRefine = (
  data: z.infer<typeof PublisherSchema>,
  ctx: z.RefinementCtx,
) => {
  if (
    (data.publisherIdentifier && !data.publisherIdentifierScheme) ||
    (!data.publisherIdentifier && data.publisherIdentifierScheme)
  ) {
    const missingField = data.publisherIdentifier
      ? "publisherIdentifierScheme"
      : "publisherIdentifier";
    ctx.addIssue({
      code: z.ZodIssueCode.custom,
      message: "Both publisher identifier and scheme must be provided together",
      path: [missingField],
    });
  }
};

const PublisherSchema = z.object({
  name: z.string().min(1, { message: "Publisher name is required" }),
  publisherIdentifier: z.string().optional(),
  publisherIdentifierScheme: z.string().optional(),
  schemeURI: z.string().optional(),
});

const SubjectSchema = z.object({
  subject: z.string().min(1, { message: "Subject is required" }),
  schemeUri: z.string().optional(),
  valueUri: z.string().optional(),
  subjectScheme: z.string().optional(),
  classificationCode: z.string().optional(),
});

export const DateSchema = z.object({
  start: z.string().min(1, { message: "Start date is required" }),
  end: z.string().optional(),
  dateType: z.enum(DATE_TYPE_VALUES),
  dateInformation: z.string().optional().nullable(),
});

const TypesSchema = z.object({
  resourceType: z.string().min(1, { message: "Resource type is required" }),
  resourceTypeGeneral: z.enum(RESOURCE_TYPE_VALUES).default("Other"),
});

const RelatedIdentifierSchema = z.object({
  relatedIdentifier: z
    .string()
    .min(1, { message: "Related identifier is required" }),
  relatedIdentifierType: z
    .string()
    .min(1, { message: "Related identifier type is required" }),
  relationType: z.string().min(1, { message: "Relation type is required" }),
  relatedMetadataScheme: z.string().optional(),
  schemeURI: z.string().optional(),
  schemeType: z.string().optional(),
  resourceTypeGeneral: TypesSchema.shape.resourceTypeGeneral.optional(),
});

const RightsSchema = z.object({
  rights: z.string().min(1, { message: "Rights statement is required" }),
  rightsUri: z.string().optional(),
  rightsIdentifier: z.string().optional(),
  rightsIdentifierScheme: z.string().optional(),
  schemeUri: z.string().optional(),
});

const DescriptionEntrySchema = z.object({
  description: z.string().min(1, { message: "Description is required" }),
  descriptionType: z.enum([
    "Abstract",
    "Methods",
    "SeriesInformation",
    "TableOfContents",
    "TechnicalInfo",
    "Other",
  ]),
});

const FundingSchema = z.object({
  funderName: z.string().min(1, { message: "Funder name is required" }),
  funderIdentifier: z.string().optional(),
  funderIdentifierType: z
    .enum(["Crossref Funder ID", "GRID", "ISNI", "ROR", "Other"])
    .optional(),
  schemeUri: z.string().optional(),
  awardNumber: z.string().optional(),
  awardUri: z.string().optional(),
  awardTitle: z.string().optional(),
});

const ConferenceSchema = z.object({
  conferenceName: z.string().min(1, { message: "Conference name is required" }),
  conferenceLocation: z.string().optional(),
  conferenceUri: z.string().optional(),
  conferenceIdentifier: z.string().optional(),
  conferenceIdentifierType: z.string().optional(),
  conferenceSchemaUri: z.string().optional(),
  conferenceStartDate: z
    .string()
    .min(1, { message: "Conference start date is required" }),
  conferenceEndDate: z
    .string()
    .min(1, { message: "Conference end date is required" }),
  conferenceAcronym: z.string().optional(),
  conferenceSeries: z.string().optional(),
});

const CaptionSchema = z.object({
  caption1: z.string().optional(),
  caption2: z.string().optional(),
});

// Top level schema
export const schema = z.object({
  title: z.string().min(1, { message: "Title is required" }),
  description: z.string().min(1, { message: "Description is required" }),
  doi: z.string().optional(),
  prefix: z.string().optional(),
  suffix: z.string().optional(),
  identifiers: z
    .array(IdentifierSchema)
    .min(1, { message: "At least one identifier is required" }),
  alternateIdentifiers: z.array(AlternateIdentifierSchema).optional(),
  creators: z
    .array(CreatorSchema)
    .min(1, { message: "At least one creator is required" }),
  titles: z
    .array(TitleEntrySchema)
    .min(1, { message: "At least one title is required" }),
  publisher: PublisherSchema.superRefine(publisherSuperRefine),
  publicationYear: z
    .number({
      required_error: "Publication year is required",
      invalid_type_error: "Publication year must be a number",
    })
    .int()
    .min(1000)
    .max(9999),
  subjects: z
    .array(SubjectSchema)
    .min(1, { message: "At least one subject is required" }),
  dates: z
    .array(DateSchema)
    .min(1, { message: "At least one date is required" }),
  language: z.string().min(2, { message: "Language is required" }),
  types: TypesSchema,
  relatedIdentifiers: z.array(RelatedIdentifierSchema).optional(),
  sizes: z.array(z.string().min(1, { message: "Size is required" })).optional(),
  formats: z
    .array(z.string().min(1, { message: "Format is required" }))
    .min(1, { message: "At least one format is required" }),
  version: z.string().min(1, { message: "Version is required" }),
  rightsList: z
    .array(RightsSchema)
    .min(1, { message: "At least one rights statement is required" }),
  descriptions: z
    .array(DescriptionEntrySchema)
    .min(1, { message: "At least one description is required" }),
  fundingReferences: z
    .array(FundingSchema)
    .min(1, { message: "At least one funding reference is required" }),
  ethicsApprovals: z
    .array(z.string().min(1, { message: "Ethics approval is required" }))
    .optional(),
  conference: ConferenceSchema,
  tableCaption: z.array(CaptionSchema).optional(),
  imageCaption: z.array(CaptionSchema).optional(),
  domain: z.string().min(1, { message: "Domain / field of study is required" }),
});
