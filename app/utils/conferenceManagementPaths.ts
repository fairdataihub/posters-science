export function conferenceManagementDetailPath(conferenceId: string) {
  return `/conferences/management/${conferenceId}`;
}

export function conferencePosterAdditionPath(conferenceId: string) {
  return `/conferences/management/${conferenceId}/poster-addition`;
}
