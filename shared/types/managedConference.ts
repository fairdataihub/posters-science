export type ManagedConferenceStatus =
  | "pending_review"
  | "approved"
  | "rejected";

export type ManagedConference = {
  id: string;
  name: string;
  acronym: string;
  location: string;
  dateRange: string;
  status: ManagedConferenceStatus;
  submittedAt: string;
  description: string;
  imageUrl: string | null;
};
