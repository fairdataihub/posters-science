import { faker } from "@faker-js/faker";
import type { ManagedConference } from "#shared/types/managedConference";

faker.seed(2_026_0328);

function formatDateRange(start: Date, end: Date) {
  const startLabel = start.toLocaleDateString("en-US", {
    month: "long",
    day: "numeric",
  });
  const endLabel = end.toLocaleDateString("en-US", {
    month: "long",
    day: "numeric",
    year: "numeric",
  });

  return `${startLabel}–${endLabel}`;
}

function buildConference(
  overrides: Partial<ManagedConference> & Pick<ManagedConference, "id" | "status">,
): ManagedConference {
  const start = faker.date.future({ years: 0.4 });
  const end = faker.date.soon({ days: faker.number.int({ min: 2, max: 5 }), refDate: start });

  return {
    name: `${faker.company.name()} Conference`,
    acronym: faker.string.alpha({ length: 4, casing: "upper" }),
    location: `${faker.location.city()}, ${faker.location.state()}, ${faker.location.country()}`,
    dateRange: formatDateRange(start, end),
    submittedAt: faker.date.recent({ days: 60 }).toISOString(),
    description: faker.lorem.sentences({ min: 1, max: 2 }),
    imageUrl: null,
    ...overrides,
  };
}

/** In-memory mock store until conference management is persisted. */
const MANAGED_CONFERENCES: ManagedConference[] = [
  buildConference({
    id: "pacific-coast-bioinformatics-symposium-2026",
    status: "pending_review",
    name: "Pacific Coast Bioinformatics Symposium",
    acronym: "PCBS",
    location: "San Diego, California, USA",
    dateRange: "November 4–6, 2026",
    submittedAt: "2026-10-01T16:00:00.000Z",
    description:
      "Annual symposium bringing together researchers working in bioinformatics, computational biology, genomics, and data science.",
  }),
  buildConference({
    id: "international-digital-health-research-meeting-2026",
    status: "approved",
    name: "International Digital Health Research Meeting",
    acronym: "IDHRM",
    location: "Montreal, Quebec, Canada",
    dateRange: "October 19–21, 2026",
    submittedAt: "2026-08-12T12:00:00.000Z",
    description:
      "International meeting focused on emerging research in digital health, clinical informatics, health data, and technology-enabled care.",
  }),
  buildConference({
    id: "quantitative-methods-summit-2026",
    status: "rejected",
    name: "Quantitative Methods Summit",
    acronym: "QMS",
    location: "Austin, Texas, USA",
    dateRange: "April 2–4, 2026",
    submittedAt: "2026-07-01T09:00:00.000Z",
    description:
      "Regional summit on quantitative methods and reproducible research workflows.",
  }),
];

export function listManagedConferencesForUser(_userId: string) {
  return MANAGED_CONFERENCES;
}

export function getManagedConferenceById(
  conferenceId: string,
  _userId: string,
) {
  return (
    MANAGED_CONFERENCES.find((conference) => conference.id === conferenceId) ??
    null
  );
}
