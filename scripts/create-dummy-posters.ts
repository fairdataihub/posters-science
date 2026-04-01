/* eslint-disable @typescript-eslint/no-explicit-any */
import "dotenv/config";
import { PrismaClient } from "@prisma/client";
import { faker } from "@faker-js/faker";

const prisma = new PrismaClient();

/**
 * Usage:
 *   pnpm tsx scripts/seed-dummy-posters.ts --count 25 --email test@example.com
 *
 * Optional:
 *   --clear   (deletes existing posters for that user first)
 */
function getArg(name: string): string | undefined {
  const idx = process.argv.indexOf(`--${name}`);
  if (idx === -1) return undefined;

  return process.argv[idx + 1];
}

function hasFlag(name: string): boolean {
  return process.argv.includes(`--${name}`);
}

type ExtractedData = {
  creators?: any[];
  imageCaption?: any[];
  posterContent?: { sections?: any[] };
  tableCaption?: any[];
  titles?: any[];
  descriptions?: any[];
  identifiers?: any[];
  alternateIdentifiers?: any[];
  publisher?: any;
  publicationYear?: number | null;
  subjects?: any[];
  dates?: any[];
  language?: string | null;
  types?: any;
  relatedIdentifiers?: any[];
  sizes?: any[];
  formats?: any[];
  version?: string | null;
  rightsList?: any[];
  fundingReferences?: any[];
  ethicsApprovals?: any[];
  conference?: {
    conferenceName?: string | null;
    conferenceLocation?: string | null;
    conferenceUri?: string | null;
    conferenceIdentifier?: string | null;
    conferenceIdentifierType?: string | null;
    conferenceYear?: number | null;
    conferenceStartDate?: string | null;
    conferenceEndDate?: string | null;
    conferenceAcronym?: string | null;
    conferenceSeries?: string | null;
  };
  domain?: string;
};

function pick<T>(arr: T[]): T {
  return arr[Math.floor(Math.random() * arr.length)]!;
}

function randomDoi(): string {
  const suffix = faker.number.int({ min: 1000000, max: 99999999 });

  return `10.5281/zenodo.${suffix}`;
}

function makeCreators() {
  const n = faker.number.int({ min: 1, max: 6 });

  return Array.from({ length: n }).map(() => {
    const hasAff = faker.datatype.boolean({ probability: 0.7 });
    const hasIds = faker.datatype.boolean({ probability: 0.5 });

    return {
      name: faker.person.fullName(),
      nameType: faker.datatype.boolean({ probability: 0.2 })
        ? "Personal"
        : undefined,
      ...(hasIds && {
        nameIdentifiers: [
          {
            nameIdentifier: faker.string.uuid(),
            nameIdentifierScheme: "ORCID",
            nameIdentifierSchemeUri: "https://orcid.org",
          },
        ],
      }),
      ...(hasAff && {
        affiliation: [
          {
            name: faker.company.name(),
            affiliationIdentifier: faker.datatype.boolean({ probability: 0.4 })
              ? faker.string.alphanumeric(8)
              : null,
            affiliationIdentifierScheme: faker.datatype.boolean({
              probability: 0.4,
            })
              ? "ROR"
              : null,
          },
        ],
      }),
    };
  });
}

function makeExtractedData(): ExtractedData {
  const year = faker.number.int({ min: 2016, max: new Date().getFullYear() });
  const domain = pick([
    "Neuroscience",
    "Bioinformatics",
    "Genomics",
    "Immunology",
    "Computer Vision",
    "Machine Learning",
    "Public Health",
    "Other",
  ]);

  const conferenceName = pick([
    "BOSC / ISMB",
    "NeurIPS",
    "AAAI",
    "IEEE VIS",
    "RECOMB",
    "BioIT World",
    "Society for Neuroscience (SfN)",
  ]);

  const conferenceAcronym = conferenceName.includes("(")
    ? (conferenceName.match(/\((.*?)\)/)?.[1] ?? null)
    : (conferenceName.split(" ")[0] ?? null);

  const start = faker.date.between({
    from: new Date(`${year}-01-01T00:00:00Z`),
    to: new Date(`${year}-12-01T00:00:00Z`),
  });
  const end = new Date(start);
  end.setDate(end.getDate() + faker.number.int({ min: 1, max: 4 }));

  const title = faker.lorem.sentence({ min: 4, max: 9 }).replace(/\.$/, "");
  const desc = faker.lorem.paragraphs({ min: 1, max: 2 });

  return {
    creators: makeCreators(),
    titles: [{ title }],
    descriptions: [{ description: desc }],
    imageCaption: Array.from({
      length: faker.number.int({ min: 0, max: 3 }),
    }).map(() => ({
      caption: faker.lorem.sentence(),
    })),
    tableCaption: Array.from({
      length: faker.number.int({ min: 0, max: 2 }),
    }).map(() => ({
      caption: faker.lorem.sentence(),
    })),
    posterContent: {
      sections: Array.from({
        length: faker.number.int({ min: 3, max: 7 }),
      }).map(() => ({
        sectionTitle: pick([
          "Background",
          "Methods",
          "Results",
          "Discussion",
          "Conclusion",
          "Future Work",
        ]),
        sectionContent: faker.lorem.paragraphs({ min: 1, max: 3 }),
      })),
    },
    identifiers: faker.datatype.boolean({ probability: 0.75 })
      ? [{ identifier: randomDoi(), identifierType: "DOI" }]
      : [],
    alternateIdentifiers: faker.datatype.boolean({ probability: 0.4 })
      ? [
          {
            alternateIdentifier: faker.string.uuid(),
            alternateIdentifierType: "Internal",
          },
        ]
      : [],
    publisher: faker.datatype.boolean({ probability: 0.6 })
      ? faker.company.name()
      : null,
    publicationYear: year,
    subjects: Array.from({ length: faker.number.int({ min: 2, max: 6 }) }).map(
      () => ({
        subject: faker.lorem.words({ min: 1, max: 3 }),
      }),
    ),
    dates: [{ date: start.toISOString().slice(0, 10), dateType: "Issued" }],
    language: pick(["en", "es", "fr"]) as any,
    types: faker.datatype.boolean({ probability: 0.6 })
      ? { resourceType: "Poster" }
      : null,
    relatedIdentifiers: faker.datatype.boolean({ probability: 0.35 })
      ? [
          {
            relatedIdentifier: randomDoi(),
            relatedIdentifierType: "DOI",
            relationType: "IsSupplementTo",
          },
        ]
      : [],
    sizes: faker.datatype.boolean({ probability: 0.4 })
      ? [`${faker.number.int({ min: 1, max: 25 })} MB`]
      : [],
    formats: ["application/pdf"],
    version: faker.datatype.boolean({ probability: 0.35 })
      ? `v${faker.number.int({ min: 1, max: 5 })}.${faker.number.int({ min: 0, max: 9 })}`
      : null,
    rightsList: faker.datatype.boolean({ probability: 0.45 })
      ? [
          {
            rights: "CC-BY-4.0",
            rightsUri: "https://creativecommons.org/licenses/by/4.0/",
            rightsIdentifier: "CC-BY-4.0",
          },
        ]
      : [],
    fundingReferences: faker.datatype.boolean({ probability: 0.35 })
      ? [
          {
            funderName: pick(["NIH", "NSF", "Wellcome Trust", "DOE", "DARPA"]),
            awardNumber: faker.string.alphanumeric(10),
          },
        ]
      : [],
    ethicsApprovals: faker.datatype.boolean({ probability: 0.25 })
      ? [
          {
            ethicsApprovalId: faker.string.alphanumeric(10),
            ethicsApprovalAuthority: faker.company.name(),
          },
        ]
      : [],
    conference: {
      conferenceName,
      conferenceLocation: `${faker.location.city()}, ${faker.location.state({ abbreviated: true })}`,
      conferenceUri: faker.internet.url(),
      conferenceIdentifier: faker.string.alphanumeric(8),
      conferenceIdentifierType: "URL",
      conferenceYear: year,
      conferenceStartDate: start.toISOString().slice(0, 10),
      conferenceEndDate: end.toISOString().slice(0, 10),
      conferenceAcronym,
      conferenceSeries: faker.datatype.boolean({ probability: 0.4 })
        ? `${conferenceName} Series`
        : null,
    },
    domain,
  };
}

function mapToDbFields(extractedData: ExtractedData) {
  const creators = (extractedData.creators ?? []).map((creator: any) => ({
    name: creator.name ?? "Unknown Creator",
    ...(creator.nameType && { nameType: creator.nameType }),
    ...(creator.nameIdentifiers && {
      nameIdentifiers: creator.nameIdentifiers.map((ni: any) => ({
        nameIdentifier: ni.nameIdentifier,
        nameIdentifierType: ni.nameIdentifierScheme || null,
        nameIdentifierScheme: ni.nameIdentifierScheme || null,
      })),
    }),
    ...(creator.affiliation && {
      affiliation: creator.affiliation.map((aff: any) => ({
        name: aff.name,
        affiliationIdentifier: aff.affiliationIdentifier || null,
        affiliationIdentifierScheme: aff.affiliationIdentifierScheme || null,
      })),
    }),
  }));

  const imageCaptions = (extractedData.imageCaption ?? []).map((c: any) => ({
    ...(c.id ? { id: c.id } : {}),
    caption: c.caption ?? "",
  }));
  const posterContent = extractedData.posterContent ?? {};
  const tableCaptions = (extractedData.tableCaption ?? []).map((c: any) => ({
    ...(c.id ? { id: c.id } : {}),
    caption: c.caption ?? "",
  }));
  const titles = extractedData.titles ?? [];
  const descriptions = extractedData.descriptions ?? [];

  const posterTitle = titles[0]?.title ?? "Untitled Poster";
  const posterDescription =
    descriptions[0]?.description ?? "No description provided for this poster";

  const identifiers = extractedData.identifiers ?? [];
  const publisher =
    typeof extractedData.publisher === "string"
      ? extractedData.publisher
      : (extractedData.publisher?.name ?? null);
  const publicationYear = extractedData.publicationYear ?? null;
  const subjectsRaw = extractedData.subjects ?? [];
  const subjects = subjectsRaw.map((s: any) =>
    typeof s === "string" ? s : (s?.subject ?? ""),
  );
  const language = extractedData.language ?? null;
  const relatedIdentifiers = extractedData.relatedIdentifiers ?? [];
  const sizesArr = (extractedData.sizes ?? []).filter(
    (s: any) => typeof s === "string",
  );
  const formatsArr = (extractedData.formats ?? []).filter(
    (f: any) => typeof f === "string",
  );
  const size = sizesArr[0] ?? null;
  const format = formatsArr[0] ?? null;
  const version = extractedData.version ?? null;
  const rightsList = extractedData.rightsList ?? [];
  const license =
    rightsList[0]?.rightsIdentifier ?? rightsList[0]?.rights ?? null;
  const fundingReferences = extractedData.fundingReferences ?? [];

  const { conference } = extractedData;
  const conferenceName = conference?.conferenceName ?? null;
  const conferenceLocation = conference?.conferenceLocation ?? null;
  const conferenceUri = conference?.conferenceUri ?? null;
  const conferenceIdentifier = conference?.conferenceIdentifier ?? null;
  const conferenceIdentifierType = conference?.conferenceIdentifierType ?? null;
  const conferenceYear = conference?.conferenceYear ?? null;
  const conferenceStartDate = conference?.conferenceStartDate ?? null;
  const conferenceEndDate = conference?.conferenceEndDate ?? null;
  const conferenceAcronym = conference?.conferenceAcronym ?? null;
  const conferenceSeries = conference?.conferenceSeries ?? null;

  const domain = extractedData.domain ?? "Other";

  const doi =
    identifiers.find((x: any) => x?.identifierType === "DOI")?.identifier ??
    null;

  return {
    creators,
    imageCaptions,
    posterContent,
    tableCaptions,
    posterTitle,
    posterDescription,
    doi,
    identifiers,
    publisher,
    publicationYear,
    subjects,
    language,
    relatedIdentifiers,
    size,
    format,
    version,
    license,
    fundingReferences,
    conferenceName,
    conferenceLocation,
    conferenceUri,
    conferenceIdentifier,
    conferenceIdentifierType,
    conferenceYear,
    conferenceStartDate,
    conferenceEndDate,
    conferenceAcronym,
    conferenceSeries,
    domain,
  };
}

async function resolveUserId(emailAddress: string): Promise<string> {
  const user = await prisma.user.findUnique({
    where: { emailAddress },
    select: { id: true },
  });

  if (!user?.id) {
    throw new Error(
      `Could not find a user with emailAddress="${emailAddress}". Create the user first or pass the right email.`,
    );
  }

  return user.id;
}

async function main() {
  const count = Number(getArg("count") ?? "20");
  const email = getArg("email") ?? process.env.SEED_USER_EMAIL;
  const clear = hasFlag("clear");

  if (!email) {
    throw new Error(
      "Missing --email test@example.com (or set SEED_USER_EMAIL in .env).",
    );
  }

  console.log(`\n👤 Seeding posters for user: ${email}`);
  const userId = await resolveUserId(email);

  if (clear) {
    console.log(`🧹 Clearing existing posters for userId=${userId}...`);
    await prisma.poster.deleteMany({ where: { userId } });
  }

  console.log(`🧪 Creating ${count} dummy posters...`);

  for (let i = 0; i < count; i++) {
    const extractedData = makeExtractedData();
    const mapped = mapToDbFields(extractedData);

    const created = await prisma.$transaction(async (tx) => {
      const poster = await tx.poster.create({
        data: {
          userId,
          title: mapped.posterTitle,
          description: mapped.posterDescription,
          imageUrl: faker.image.urlPicsumPhotos({
            width: 400,
            height: 300,
            blur: 0,
          }),
          status: "draft",
          randomInt: faker.number.int(1000000),
        },
        select: { id: true, title: true },
      });

      await tx.posterMetadata.create({
        data: {
          posterId: poster.id,
          doi: mapped.doi,
          identifiers: mapped.identifiers,
          creators: mapped.creators,
          publisher: mapped.publisher,
          publicationYear: mapped.publicationYear,
          subjects: mapped.subjects,
          language: mapped.language,
          relatedIdentifiers: mapped.relatedIdentifiers,
          size: mapped.size,
          format: mapped.format,
          version: mapped.version,
          license: mapped.license,
          fundingReferences: mapped.fundingReferences,
          conferenceName: mapped.conferenceName,
          conferenceLocation: mapped.conferenceLocation,
          conferenceUri: mapped.conferenceUri,
          conferenceIdentifier: mapped.conferenceIdentifier,
          conferenceIdentifierType: mapped.conferenceIdentifierType,
          conferenceYear: mapped.conferenceYear,
          conferenceStartDate: mapped.conferenceStartDate,
          conferenceEndDate: mapped.conferenceEndDate,
          conferenceAcronym: mapped.conferenceAcronym,
          conferenceSeries: mapped.conferenceSeries,
          posterContent: mapped.posterContent,
          tableCaptions: mapped.tableCaptions,
          imageCaptions: mapped.imageCaptions,
          domain: mapped.domain,
        },
        select: { posterId: true },
      });

      return poster;
    });

    console.log(
      `   ✅ [${i + 1}/${count}] Created: ${created.id} — ${created.title}`,
    );
  }

  console.log(`\n🎉 Done. Seeded ${count} posters.\n`);
}

main()
  .catch((err) => {
    console.error("\n❌ Seed failed:");
    console.error(err);
    process.exitCode = 1;
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
