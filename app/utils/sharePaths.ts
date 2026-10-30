import type { BulkImportWizardStep } from "#shared/types/bulkImportWizard";
import { normalizeBulkImportWizardStep } from "#shared/types/bulkImportWizard";

/** Query key: bulk import job to return to after editing a poster in `/share/:id`. */
export const SHARE_BULK_IMPORT_JOB_QUERY = "bulkImportJobId";

/** Query key: wizard step to restore on bulk import (e.g. `review`). */
export const SHARE_BULK_IMPORT_STEP_QUERY = "bulkWizardStep";

/** Bulk poster import wizard (share workflow; conference linking comes later). */
export function shareNewBulkPath(options?: {
  jobId?: string;
  managedConferenceId?: string;
  wizardStep?: BulkImportWizardStep;
}) {
  const query: Record<string, string> = {};

  if (options?.jobId) {
    query.jobId = options.jobId;
  }
  if (options?.managedConferenceId) {
    query.managedConferenceId = options.managedConferenceId;
  }
  if (options?.wizardStep) {
    query[SHARE_BULK_IMPORT_STEP_QUERY] = options.wizardStep;
  }

  if (Object.keys(query).length === 0) {
    return "/share/new-bulk";
  }

  return { path: "/share/new-bulk", query };
}

export function sharePosterEditPath(
  posterId: number,
  options?: {
    bulkImportJobId?: string;
    bulkWizardStep?: BulkImportWizardStep;
  },
) {
  const query: Record<string, string> = {};
  if (options?.bulkImportJobId) {
    query[SHARE_BULK_IMPORT_JOB_QUERY] = options.bulkImportJobId;
  }
  if (options?.bulkWizardStep) {
    query[SHARE_BULK_IMPORT_STEP_QUERY] = options.bulkWizardStep;
  }

  if (Object.keys(query).length === 0) {
    return `/share/${posterId}`;
  }

  return { path: `/share/${posterId}`, query };
}

/** Summary page after every poster in a bulk batch is published. */
export function shareBulkCompletionPath(jobId: string) {
  return `/share/bulk/${jobId}/complete`;
}

export type ShareBulkImportReturnContext = {
  jobId: string;
  wizardStep: BulkImportWizardStep;
};

/** When set, `/share/:id` should return to bulk import instead of the publish step. */
export function shareBulkImportReturnFromQuery(
  query: Record<string, unknown> | undefined | null,
): ShareBulkImportReturnContext | null {
  if (!query) return null;

  const rawJobId = query[SHARE_BULK_IMPORT_JOB_QUERY];
  const jobId = Array.isArray(rawJobId) ? rawJobId[0] : rawJobId;
  if (typeof jobId !== "string" || !jobId.trim()) return null;

  const rawStep = query[SHARE_BULK_IMPORT_STEP_QUERY];
  const stepValue = Array.isArray(rawStep) ? rawStep[0] : rawStep;
  const wizardStep =
    normalizeBulkImportWizardStep(
      typeof stepValue === "string" ? stepValue : undefined,
    ) ?? "review";

  return { jobId: jobId.trim(), wizardStep };
}
