import * as z from "zod";
import { StrictConferenceSchema } from "~~/app/utils/poster_schema";
import { BULK_IMPORT_ACCEPTABLE_LICENSES } from "#shared/data/bulkImportAcceptableLicenses";
import {
  MAX_BULK_IMPORT_REVIEW_EMBARGO_DAYS,
  MIN_BULK_IMPORT_REVIEW_EMBARGO_DAYS,
} from "#shared/types/bulkImportReviewEmbargo";
import {
  BULK_IMPORT_WIZARD_STEPS,
  bulkImportNameSchema,
} from "#shared/types/bulkImportWizard";

/** Same rules as the conference step form, in the shape stored on the batch. */
const batchConferenceSchema = StrictConferenceSchema.omit({
  presentedStartDate: true,
  presentedEndDate: true,
})
  .partial({ conferenceStartDate: true, conferenceEndDate: true })
  .extend({ conferenceSchemaUri: z.string().max(500).optional() })
  .strict()
  .refine(
    (conference) =>
      !conference.conferenceStartDate ||
      Number(conference.conferenceStartDate.slice(0, 4)) ===
        conference.conferenceYear,
    {
      path: ["conferenceStartDate"],
      error: "The start date must be in the conference year",
    },
  );

/**
 * What the wizard may change on a batch. Anything else (status, staged
 * posters, counts) is set by the server's own routes, never by this PATCH.
 */
export const updateBulkJobBodySchema = z
  .strictObject({
    name: bulkImportNameSchema.optional(),
    wizardStep: z.enum(BULK_IMPORT_WIZARD_STEPS.map((step) => step.id)).optional(),
    conference: batchConferenceSchema.optional(),
    uniformLicense: z
      .enum(BULK_IMPORT_ACCEPTABLE_LICENSES.map((license) => license.value))
      .optional(),
    reviewEmbargo: z
      .discriminatedUnion("enabled", [
        z.strictObject({ enabled: z.literal(false) }),
        z.strictObject({
          enabled: z.literal(true),
          days: z
            .number()
            .int()
            .min(MIN_BULK_IMPORT_REVIEW_EMBARGO_DAYS)
            .max(MAX_BULK_IMPORT_REVIEW_EMBARGO_DAYS),
        }),
      ])
      .optional(),
  })
  .refine((body) => Object.keys(body).length > 0, {
    error: "Nothing to update",
  });

export type UpdateBulkJobBody = z.input<typeof updateBulkJobBodySchema>;
