/** Bulk poster import wizard (share workflow; conference linking comes later). */
export function shareNewBulkPath(options?: {
  jobId?: string;
  managedConferenceId?: string;
}) {
  const query: Record<string, string> = {};

  if (options?.jobId) {
    query.jobId = options.jobId;
  }
  if (options?.managedConferenceId) {
    query.managedConferenceId = options.managedConferenceId;
  }

  if (Object.keys(query).length === 0) {
    return "/share/new-bulk";
  }

  return { path: "/share/new-bulk", query };
}
