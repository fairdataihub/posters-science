import * as z from "zod";
import isoLanguages from "@/assets/data/iso-639-1.json";
import licenses from "@/assets/data/licenses.json";
import identifierTypes from "@/assets/data/identifier-types.json";
import relationTypes from "@/assets/data/relation-types.json";
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

export const IDENTIFIER_TYPE_OPTIONS = identifierTypes.map((id) => ({
  label: id.label,
  value: id.value,
}));

export const IDENTIFIER_TYPE_PLACEHOLDER_OPTIONS = identifierTypes.map(
  (id) => ({
    label: id.placeholder,
    value: id.value,
  }),
);

export const RELATION_TYPE_OPTIONS = relationTypes.map((rt) => ({
  label: rt.const,
  value: rt.const,
  description: rt.description,
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
  id: z.string().optional(),
  caption: z.string().min(1, { message: "Caption is required" }),
});

// Schema for validating extraction API response (reuses existing schemas with looser requirements)
// Includes both `name` (from extraction) and `givenName`/`familyName` (from saved form data)
// Affiliation can be plain strings (from extraction API) or objects (from saved form data)
const ExtractionAffiliationItem = z.union([
  z.string(),
  AffiliationSchema.partial(),
]);

const ExtractionCreatorSchema = z.object({
  name: z.string().optional(),
  givenName: z.string().optional(),
  familyName: z.string().optional(),
  nameType: z.enum(NAME_TYPE_VALUES).optional(),
  nameIdentifiers: z.array(NameIdentifierSchema.partial()).optional(),
  affiliation: z.array(ExtractionAffiliationItem).optional(),
});

// Extraction API returns dates with different structure currently
const ExtractionDateSchema = z.object({
  date: z.string().optional(),
  dateType: z.string().optional(),
  dateInformation: z.string().optional(),
});

// Conference schema (matches PosterMetadata flat fields)
const ConferenceSchema = z.object({
  conferenceName: z.string().optional(),
  conferenceLocation: z.string().optional(),
  conferenceUri: z.string().optional(),
  conferenceIdentifier: z.string().optional(),
  conferenceIdentifierType: z.string().optional(),
  conferenceYear: z.number().optional(),
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

// Extraction API schema: accepts all extraction API fields; only PosterMetadata fields are stored
export const schema = z.object({
  $schema: z.string().optional(),
  _validation: z.unknown().optional(),

  doi: z.string().optional(),
  creators: z.array(ExtractionCreatorSchema).optional(),
  identifiers: z.array(IdentifierSchema.partial()).optional(),
  publisher: PublisherSchema.partial().optional(),
  publicationYear: z.number().nullable().optional(),
  subjects: z.array(SubjectSchema.partial()).optional(),
  language: z.string().nullable().optional(),
  relatedIdentifiers: z.array(RelatedIdentifierSchema.partial()).optional(),
  size: z.string().nullable().optional(),
  format: z.string().nullable().optional(),
  version: z.string().nullable().optional(),
  license: z.string().nullable().optional(),
  fundingReferences: z.array(FundingSchema.partial()).optional(),
  conference: ConferenceSchema.optional(),

  imageCaptions: z.array(CaptionSchema).optional(),
  tableCaptions: z.array(CaptionSchema).optional(),
  posterContent: PosterContentSchema.optional(),
  domain: z.string().optional(),

  // Extraction API may still send these; accepted but not stored in PosterMetadata
  prefix: z.string().optional(),
  suffix: z.string().optional(),
  titles: z.array(TitleEntrySchema.partial()).optional(),
  descriptions: z.array(DescriptionEntrySchema.partial()).optional(),
  alternateIdentifiers: z.array(AlternateIdentifierSchema.partial()).optional(),
  dates: z.array(ExtractionDateSchema).optional(),
  types: TypesSchema.partial().optional(),
  sizes: z.array(z.string()).optional(),
  formats: z.array(z.string()).optional(),
  rightsList: z.array(RightsSchema.partial()).optional(),
  ethicsApprovals: z.array(z.string()).optional(),
  content: PosterContentSchema.optional(),
  researchField: z.string().optional(),
  imageCaption: z.array(CaptionSchema).optional(),
  tableCaption: z.array(CaptionSchema).optional(),
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

// API RESPONSE SCHEMA
// Used to type the response from GET /api/poster/:id
export const posterResponseSchema = z.object({
  id: z.number(),
  title: z.string().optional(),
  description: z.string().optional(),
  status: z.enum(["draft", "published"]).optional(),
  publishedAt: z.string().optional(),
  posterMetadata: schema.optional(),
  extractionJob: z
    .object({
      completed: z.boolean().optional(),
      status: z
        .enum(["pending-extraction", "processing", "completed", "failed"])
        .optional(),
      fileName: z.string().optional(),
      filePath: z.string().optional(),
    })
    .optional(),
});

export type PosterResponse = z.infer<typeof posterResponseSchema>;

export const formSchema = z.object({
  title: z.string().default(""),
  description: z.string().default(""),

  doi: z.string().default(""),
  creators: z.array(FormCreatorSchema).default([]),
  identifiers: z.array(IdentifierSchema.partial()).default([]),
  publisher: PublisherSchema.partial().default({}),
  publicationYear: z.number().optional(),
  subjects: z.array(SubjectSchema.partial()).default([]),
  language: z.string().default("en"),
  relatedIdentifiers: z.array(RelatedIdentifierSchema.partial()).default([]),
  size: z.string().default(""),
  format: z.string().default(""),
  version: z.string().default(""),
  license: z.string().default(""),
  fundingReferences: z.array(FundingSchema.partial()).default([]),
  posterContent: PosterContentSchema.optional(),
  tableCaptions: z.array(CaptionSchema).default([]),
  imageCaptions: z.array(CaptionSchema).default([]),
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
  conferenceYear: z
    .number()
    .min(1000)
    .max(9999, { message: "Conference year is required" }),
  conferenceStartDate: z
    .string()
    .min(1, { message: "Conference start date is required" }),
  conferenceEndDate: z
    .string()
    .min(1, { message: "Conference end date is required" }),
  conferenceAcronym: z.string().optional(),
  conferenceSeries: z.string().optional(),
});

export const strictFormSchema = z.object({
  title: z.string().min(1, { message: "Title is required" }),
  description: z.string().min(1, { message: "Description is required" }),
  language: z.string(),
  domain: z.string(),
  doi: z.string(),
  identifiers: z.array(IdentifierSchema),
  creators: z
    .array(StrictCreatorSchema)
    .min(1, { message: "At least one creator is required" }),
  subjects: z
    .array(z.string())
    .min(1, { message: "At least one subject is required" }),
  format: z.string().min(1, { message: "Format is required" }),
  license: z.string().min(1, { message: "License is required" }),
  fundingReferences: z
    .array(StrictFundingSchema)
    .min(1, { message: "At least one funding reference is required" }),
  publisher: z.string(),
  publicationYear: z
    .number()
    .int()
    .min(1000)
    .max(9999, { message: "Publication year is required" })
    .optional(),
  version: z.string(),
  conference: StrictConferenceSchema,
  relatedIdentifiers: z.array(RelatedIdentifierSchema.partial()),
  size: z.string().optional(),
  posterContent: PosterContentSchema.optional(),
  tableCaptions: z.array(CaptionSchema).optional(),
  imageCaptions: z.array(CaptionSchema).optional(),
});

export type StrictFormSchema = z.infer<typeof strictFormSchema>;
