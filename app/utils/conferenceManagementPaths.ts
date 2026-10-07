import { shareNewBulkPath } from "~/utils/sharePaths";

export function conferenceManagementDetailPath(conferenceId: string) {
  return `/conferences/management/${conferenceId}`;
}

/** @deprecated Use shareNewBulkPath — bulk upload lives under /share/new-bulk */
export function conferencePosterAdditionPath(conferenceId: string) {
  return shareNewBulkPath({ managedConferenceId: conferenceId });
}
