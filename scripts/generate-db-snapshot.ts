import * as fs from "node:fs";
import * as path from "node:path";
import "dotenv/config";
import { PrismaPg } from "@prisma/adapter-pg";
import { PrismaClient } from "../shared/generated/client";

const DEFAULT_CHUNK_SIZE = 5000;
const DEFAULT_OUTPUT_ROOT = "db-snapshots";

function resolveDiscoverBaseUrl(explicitBaseUrl?: string): string {
  if (explicitBaseUrl) {
    return explicitBaseUrl.replace(/\/+$/, "");
  }

  const siteEnv =
    process.env.NUXT_SITE_ENV ??
    process.env.NUXT_PUBLIC_SITE_ENV ??
    process.env.SITE_ENV;

  if (siteEnv === "staging") {
    return "https://sandbox.posters.science";
  }

  return "https://posters.science";
}

function getArg(name: string): string | undefined {
  const idx = process.argv.indexOf(`--${name}`);
  if (idx === -1) return undefined;

  return process.argv[idx + 1];
}

function getTodayFolderName(): string {
  return new Date().toISOString().slice(0, 10);
}

function toPositiveInt(value: string | undefined, fallback: number): number {
  if (!value) return fallback;
  const parsed = Number.parseInt(value, 10);
  if (!Number.isFinite(parsed) || parsed <= 0) return fallback;

  return parsed;
}

type PosterRow = {
  id: number;
  title: string;
  description: string;
  imageUrl: string;
  publishedAt: Date | null;
  posterMetadata: {
    doi: string | null;
    identifiers: unknown;
    creators: unknown;
    publisher: string | null;
    publicationYear: number | null;
    subjects: string[];
    domain: string | null;
    language: string | null;
    version: string | null;
    size: string | null;
    format: string | null;
    license: string | null;
    fundingReferences: unknown;
    conferenceName: string | null;
    conferenceLocation: string | null;
    conferenceUri: string | null;
    conferenceIdentifier: string | null;
    conferenceIdentifierType: string | null;
    conferenceYear: number | null;
    conferenceStartDate: string | null;
    conferenceEndDate: string | null;
    conferenceAcronym: string | null;
    conferenceSeries: string | null;
    dates: unknown;
    relatedIdentifiers: unknown;
  } | null;
};

function sanitizePoster(row: PosterRow) {
  return {
    id: row.id,
    posterUrl: `${discoverBaseUrl}/discover/${row.id}`,
    title: row.title,
    description: row.description,
    imageUrl: row.imageUrl,
    publishedAt: row.publishedAt,
    posterMetadata: row.posterMetadata,
  };
}

async function main() {
  const connectionString = process.env.DATABASE_URL;
  if (!connectionString) {
    throw new Error("DATABASE_URL is required to export published posters.");
  }

  const chunkSize = toPositiveInt(getArg("chunk-size"), DEFAULT_CHUNK_SIZE);
  const outputRoot = getArg("output-root") ?? DEFAULT_OUTPUT_ROOT;
  discoverBaseUrl = resolveDiscoverBaseUrl(getArg("base-url"));

  const datedOutputDir = path.join(outputRoot, getTodayFolderName());
  fs.mkdirSync(datedOutputDir, { recursive: true });

  const adapter = new PrismaPg({ connectionString });
  const prisma = new PrismaClient({ adapter });

  let fileIndex = 1;
  let cursorId: number | undefined;
  let totalExported = 0;

  try {
    while (true) {
      const rows: PosterRow[] = await prisma.poster.findMany({
        where: { status: "published" },
        orderBy: { id: "asc" },
        ...(cursorId
          ? {
              cursor: { id: cursorId },
              skip: 1,
            }
          : {}),
        take: chunkSize,
        select: {
          id: true,
          title: true,
          description: true,
          imageUrl: true,
          publishedAt: true,
          posterMetadata: {
            select: {
              doi: true,
              identifiers: true,
              creators: true,
              publisher: true,
              publicationYear: true,
              subjects: true,
              domain: true,
              language: true,
              version: true,
              size: true,
              format: true,
              license: true,
              fundingReferences: true,
              conferenceName: true,
              conferenceLocation: true,
              conferenceUri: true,
              conferenceIdentifier: true,
              conferenceIdentifierType: true,
              conferenceYear: true,
              conferenceStartDate: true,
              conferenceEndDate: true,
              conferenceAcronym: true,
              conferenceSeries: true,
              dates: true,
              relatedIdentifiers: true,
            },
          },
        },
      });

      if (rows.length === 0) {
        break;
      }

      const filePath = path.join(datedOutputDir, `${fileIndex}.ndjson`);
      const serialized = rows
        .map((row) => JSON.stringify(sanitizePoster(row)))
        .join("\n");

      fs.writeFileSync(filePath, `${serialized}\n`, "utf8");

      totalExported += rows.length;
      cursorId = rows[rows.length - 1]?.id;
      console.log(`Wrote ${rows.length} records to ${filePath}`);

      fileIndex += 1;
    }

    console.log(
      `Export complete. Total published posters exported: ${totalExported}`,
    );
    console.log(`Output directory: ${datedOutputDir}`);
  } finally {
    await prisma.$disconnect();
  }
}

let discoverBaseUrl = "https://posters.science";

main().catch((error) => {
  console.error("Failed to generate NDJSON snapshot:", error);
  process.exit(1);
});
