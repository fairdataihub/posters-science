export type ConferenceRegistrationStatus =
  | "pending_review"
  | "approved"
  | "rejected";

export type ConferenceRegistration = {
  id: string;
  name: string;
  acronym: string;
  location: string;
  dateRange: string;
  status: ConferenceRegistrationStatus;
  submittedAt: string;
  participantPosterChoice: "participants-submit" | "organizer-import";
  description: string;
  imageUrl: string | null;
};

/** Placeholder until conference registration API exists. */
export const MOCK_CONFERENCE_REGISTRATIONS: ConferenceRegistration[] = [
  {
    id: "pacific-coast-bioinformatics-symposium-2026",
    name: "Pacific Coast Bioinformatics Symposium",
    acronym: "PCBS",
    location: "San Diego, California, USA",
    dateRange: "November 4–6, 2026",
    status: "pending_review",
    submittedAt: "2026-10-01T16:00:00.000Z",
    participantPosterChoice: "participants-submit",
    description:
      "Annual symposium bringing together researchers working in bioinformatics, computational biology, genomics, and data science.",
    imageUrl: null,
  },
  {
    id: "international-digital-health-research-meeting-2026",
    name: "International Digital Health Research Meeting",
    acronym: "IDHRM",
    location: "Montreal, Quebec, Canada",
    dateRange: "October 19–21, 2026",
    status: "approved",
    submittedAt: "2026-08-12T12:00:00.000Z",
    participantPosterChoice: "organizer-import",
    description:
      "International meeting focused on emerging research in digital health, clinical informatics, health data, and technology-enabled care.",
    imageUrl: null,
  },
];

export function getConferenceRegistrationById(id: string) {
  return (
    MOCK_CONFERENCE_REGISTRATIONS.find(
      (registration) => registration.id === id,
    ) ?? null
  );
}
