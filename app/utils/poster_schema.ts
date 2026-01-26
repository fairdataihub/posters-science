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

const NAME_TYPE_VALUES = ["Personal", "Organizational"] as const;

export const NAME_TYPE_OPTIONS = NAME_TYPE_VALUES.map((v) => ({
  label: v,
  value: v,
}));

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

const TitleEntrySchema = z.object({
  title: z.string().min(1, { message: "A title is required" }),
  titleType: z.enum(TITLE_TYPE_VALUES).optional(),
});

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

const CaptionSchema = z.object({
  caption1: z.string().optional(),
  caption2: z.string().optional(),
});

// Schema for validating extraction API response (reuses existing schemas with looser requirements)
// Includes both `name` (from extraction) and `givenName`/`familyName` (from saved form data)
const ExtractionCreatorSchema = z.object({
  name: z.string().optional(),
  givenName: z.string().optional(),
  familyName: z.string().optional(),
  nameType: z.enum(NAME_TYPE_VALUES).optional(),
  nameIdentifiers: z.array(NameIdentifierSchema.partial()).optional(),
  affiliation: z.array(AffiliationSchema.partial()).optional(),
});

// Extraction API returns dates with different structure currently
const ExtractionDateSchema = z.object({
  date: z.string().optional(),
  dateType: z.string().optional(),
  dateInformation: z.string().optional(),
});

// Conference schema
const ConferenceSchema = z.object({
  conferenceName: z.string().optional(),
  conferenceLocation: z.string().optional(),
  conferenceUri: z.string().optional(),
  conferenceIdentifier: z.string().optional(),
  conferenceIdentifierType: z.string().optional(),
  conferenceSchemaUri: z.string().optional(),
  conferenceStartDate: z.string().optional(),
  conferenceEndDate: z.string().optional(),
  conferenceAcronym: z.string().optional(),
  conferenceSeries: z.string().optional(),
});

// Poster content schema
const PosterSectionSchema = z.object({
  sectionTitle: z.string().optional(),
  sectionContent: z.string().optional(),
});

const PosterContentSchema = z.object({
  sections: z.array(PosterSectionSchema).optional(),
  unstructuredContent: z.string().optional(),
});

// EXTRACTION API SCHEMA
// Used to validate data from the external extraction API

export const schema = z.object({
  doi: z.string().optional(),
  prefix: z.string().optional(),
  suffix: z.string().optional(),

  creators: z.array(ExtractionCreatorSchema).optional(),
  titles: z.array(TitleEntrySchema.partial()).optional(),
  descriptions: z.array(DescriptionEntrySchema.partial()).optional(),
  identifiers: z.array(IdentifierSchema.partial()).optional(),
  alternateIdentifiers: z.array(AlternateIdentifierSchema.partial()).optional(),
  publisher: PublisherSchema.partial().optional(),
  publicationYear: z.number().nullable().optional(),
  subjects: z.array(SubjectSchema.partial()).optional(),
  dates: z.array(ExtractionDateSchema).optional(),
  language: z.string().nullable().optional(),
  types: TypesSchema.partial().optional(), // Single object, not array
  relatedIdentifiers: z.array(RelatedIdentifierSchema.partial()).optional(),
  sizes: z.array(z.string()).optional(),
  formats: z.array(z.string()).optional(),
  version: z.string().nullable().optional(),
  rightsList: z.array(RightsSchema.partial()).optional(),
  fundingReferences: z.array(FundingSchema.partial()).optional(),
  ethicsApprovals: z.array(z.string()).optional(),
  imageCaption: z.array(CaptionSchema).optional(),
  posterContent: PosterContentSchema.optional(),
  tableCaption: z.array(CaptionSchema).optional(),
  conference: ConferenceSchema.optional(),
  domain: z.string().optional(),
});

export type Schema = z.infer<typeof schema>;

// FORM SCHEMA
// Used to validate form state before submission to store in DB
const FormCreatorSchema = z.object({
  givenName: z.string().optional(),
  familyName: z.string().optional(),
  nameType: z.enum(NAME_TYPE_VALUES).optional(),
  nameIdentifiers: z.array(NameIdentifierSchema.partial()).optional(),
  affiliation: z.array(AffiliationSchema.partial()).optional(),
});

const FormDateSchema = z.object({
  start: z.string().optional(),
  end: z.string().optional(),
  dateType: z.enum(DATE_TYPE_VALUES).optional(),
  dateInformation: z.string().optional().nullable(),
});

// API RESPONSE SCHEMA
// Used to type the response from GET /api/poster/:id
export const posterResponseSchema = z.object({
  id: z.number(),
  title: z.string().optional(),
  description: z.string().optional(),
  posterMetadata: schema.optional(),
});

export type PosterResponse = z.infer<typeof posterResponseSchema>;

export const formSchema = z.object({
  title: z.string().default(""),
  description: z.string().default(""),

  doi: z.string().default(""),
  prefix: z.string().default(""),
  suffix: z.string().default(""),

  creators: z.array(FormCreatorSchema).default([]),
  titles: z.array(TitleEntrySchema.partial()).default([]),
  descriptions: z.array(DescriptionEntrySchema.partial()).default([]),
  identifiers: z.array(IdentifierSchema.partial()).default([]),
  alternateIdentifiers: z
    .array(AlternateIdentifierSchema.partial())
    .default([]),
  publisher: PublisherSchema.partial().default({}),
  publicationYear: z.number().optional(),
  subjects: z.array(SubjectSchema.partial()).default([]),
  dates: z.array(FormDateSchema).default([]),
  language: z.string().default("en"),
  types: TypesSchema.partial().default({}),
  relatedIdentifiers: z.array(RelatedIdentifierSchema.partial()).default([]),
  sizes: z.array(z.string()).default([]),
  formats: z.array(z.string()).default([]),
  version: z.string().default(""),
  rightsList: z.array(RightsSchema.partial()).default([]),
  fundingReferences: z.array(FundingSchema.partial()).default([]),
  ethicsApprovals: z.array(z.string()).default([]),
  imageCaption: z.array(CaptionSchema).default([]),
  tableCaption: z.array(CaptionSchema).default([]),
  conference: ConferenceSchema.default({}),

  domain: z.string().default(""),
});

export type FormSchema = z.infer<typeof formSchema>;

// STRICT FORM SCHEMA
// Used for PUT endpoint validation
// enforces all required fields from poster_schema.json
const StrictAffiliationSchema = z
  .object({
    name: z.string().min(1, { message: "Affiliation name is required" }),
    affiliationIdentifier: z.string().optional(),
    affiliationIdentifierScheme: z.string().optional(),
    schemeURI: z.string().optional(),
  })
  .refine(
    (data) => !data.affiliationIdentifier || data.affiliationIdentifierScheme,
    {
      message: "Scheme is required when identifier is provided",
      path: ["affiliationIdentifierScheme"],
    },
  );

const StrictCreatorSchema = z.object({
  givenName: z.string().min(1, { message: "Given name is required" }),
  familyName: z.string().min(1, { message: "Family name is required" }),
  nameType: z.enum(NAME_TYPE_VALUES).optional(),
  nameIdentifiers: z.array(NameIdentifierSchema.partial()).optional(),
  affiliation: z.array(StrictAffiliationSchema).optional(),
});

const StrictPublisherSchema = z
  .object({
    name: z.string().min(1, { message: "Publisher name is required" }),
    publisherIdentifier: z.string().optional(),
    publisherIdentifierScheme: z.string().optional(),
    schemeURI: z.string().optional(),
  })
  .refine(
    (data) => !data.publisherIdentifier || data.publisherIdentifierScheme,
    {
      message: "Scheme is required when identifier is provided",
      path: ["publisherIdentifierScheme"],
    },
  );

const StrictFundingSchema = z
  .object({
    funderName: z.string().min(1, { message: "Funder name is required" }),
    funderIdentifier: z.string().optional(),
    funderIdentifierType: z
      .enum(["Crossref Funder ID", "GRID", "ISNI", "ROR", "Other"])
      .optional(),
    schemeUri: z.string().optional(),
    awardNumber: z.string().optional(),
    awardUri: z.string().optional(),
    awardTitle: z.string().optional(),
  })
  .refine((data) => !data.funderIdentifier || data.funderIdentifierType, {
    message: "Identifier type is required when identifier is provided",
    path: ["funderIdentifierType"],
  });

const StrictConferenceSchema = z.object({
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

const StrictDateSchema = z.object({
  date: z.string().min(1, { message: "A date is required" }),
  dateType: z.enum(DATE_TYPE_VALUES, { message: "Date type is required" }),
  dateInformation: z.string().optional().nullable(),
});

const StrictTypesSchema = z.object({
  resourceType: z.string().min(1, { message: "Resource type is required" }),
  resourceTypeGeneral: z.enum(RESOURCE_TYPE_VALUES).default("Other"),
});

export const strictFormSchema = z.object({
  title: z.string().min(1, { message: "Title is required" }),
  description: z.string().min(1, { message: "Description is required" }),
  language: z.string().min(2, { message: "Language is required" }),
  domain: z.string().min(1, { message: "Domain is required" }),

  doi: z.string().optional(),
  prefix: z.string().optional(),
  suffix: z.string().optional(),

  identifiers: z
    .array(IdentifierSchema)
    .min(1, { message: "At least one identifier is required" }),
  creators: z
    .array(StrictCreatorSchema)
    .min(1, { message: "At least one creator is required" }),
  titles: z
    .array(TitleEntrySchema)
    .min(1, { message: "At least one title entry is required" }),
  subjects: z
    .array(SubjectSchema)
    .min(1, { message: "At least one subject is required" }),
  dates: z
    .array(StrictDateSchema)
    .min(1, { message: "At least one date is required" }),
  formats: z
    .array(z.string().min(1))
    .min(1, { message: "At least one format is required" }),
  rightsList: z
    .array(RightsSchema)
    .min(1, { message: "At least one rights entry is required" }),
  descriptions: z
    .array(DescriptionEntrySchema)
    .min(1, { message: "At least one description is required" }),
  fundingReferences: z
    .array(StrictFundingSchema)
    .min(1, { message: "At least one funding reference is required" }),

  publisher: StrictPublisherSchema,
  publicationYear: z
    .number()
    .int()
    .min(1000)
    .max(9999, { message: "Publication year is required" }),
  types: StrictTypesSchema,
  version: z.string().min(1, { message: "Version is required" }),
  conference: StrictConferenceSchema,
  alternateIdentifiers: z.array(AlternateIdentifierSchema.partial()).optional(),
  relatedIdentifiers: z.array(RelatedIdentifierSchema.partial()).optional(),
  sizes: z.array(z.string()).optional(),
  ethicsApprovals: z.array(z.string()).optional(),
  imageCaption: z.array(CaptionSchema).optional(),
  tableCaption: z.array(CaptionSchema).optional(),
});

export type StrictFormSchema = z.infer<typeof strictFormSchema>;
