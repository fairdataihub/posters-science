/* eslint-disable @typescript-eslint/no-explicit-any */
import "dotenv/config";
import * as fs from "fs";
import * as path from "path";
import { PrismaClient } from "../shared/generated/client";
import { PrismaPg } from "@prisma/adapter-pg";

const adapter = new PrismaPg({ connectionString: process.env.DATABASE_URL });
const prisma = new PrismaClient({ adapter });

/**
 * Usage:
 *   pnpm tsx scripts/add-extracted-posters.ts
 *
 * Optional:
 *   --dir     path to merged folder (default: ./merged)
 *   --limit   max number of posters to import (default: all)
 *
 * Posters are upserted by DOI URL (https://doi.org/<doi>).
 * If a poster with the same DOI already exists it will be updated; otherwise created.
 */
function getArg(name: string): string | undefined {
  const idx = process.argv.indexOf(`--${name}`);
  if (idx === -1) return undefined;

  return process.argv[idx + 1];
}

type JsonPoster = {
  creators?: any[];
  titles?: any[];
  descriptions?: any[];
  publicationYear?: number | null;
  subjects?: any[];
  publisher?: any;
  conference?: {
    conferenceName?: string | null;
    conferenceAcronym?: string | null;
    conferenceYear?: number | null;
    conferenceLocation?: string | null;
    conferenceUri?: string | null;
    conferenceIdentifier?: string | null;
    conferenceIdentifierType?: string | null;
    conferenceStartDate?: string | null;
    conferenceEndDate?: string | null;
    conferenceSeries?: string | null;
  };
  formats?: any[];
  /** Real JSON uses "content", not "posterContent" */
  content?: { sections?: any[] };
  imageCaptions?: any[];
  tableCaptions?: any[];
  rightsList?: any[];
  identifiers?: any[];
  alternateIdentifiers?: any[];
  dates?: any[];
  types?: any;
  language?: string | null;
  relatedIdentifiers?: any[];
  sizes?: any[];
  version?: string | null;
  fundingReferences?: any[];
  ethicsApprovals?: any[];
  domain?: string;
};

function mapToDbFields(data: JsonPoster) {
  const creators = (data.creators ?? []).map((creator: any) => {
    // affiliation can be string[] or object[] depending on source
    const rawAff: any[] = Array.isArray(creator.affiliation)
      ? creator.affiliation
      : creator.affiliation
        ? [creator.affiliation]
        : [];

    const affiliation = rawAff.map((aff: any) =>
      typeof aff === "string"
        ? {
            name: aff,
            affiliationIdentifier: null,
            affiliationIdentifierScheme: null,
          }
        : {
            name: aff.name ?? "",
            affiliationIdentifier: aff.affiliationIdentifier ?? null,
            affiliationIdentifierScheme:
              aff.affiliationIdentifierScheme ?? null,
          },
    );

    const rawIds: any[] = creator.nameIdentifiers ?? [];
    const nameIdentifiers = rawIds.map((ni: any) => ({
      nameIdentifier: ni.nameIdentifier,
      nameIdentifierType: ni.nameIdentifierScheme ?? null,
      nameIdentifierScheme: ni.nameIdentifierScheme ?? null,
    }));

    return {
      name: creator.name ?? "Unknown Creator",
      ...(creator.nameType ? { nameType: creator.nameType } : {}),
      ...(nameIdentifiers.length > 0 ? { nameIdentifiers } : {}),
      ...(affiliation.length > 0 ? { affiliation } : {}),
    };
  });

  const titles = data.titles ?? [];
  const descriptions = data.descriptions ?? [];
  const posterTitle = titles[0]?.title ?? "Untitled Poster";
  const posterDescription =
    descriptions[0]?.description ?? "No description provided for this poster";

  const identifiers = (data.identifiers ?? []).map((id: any) => {
    if (id?.identifierType === "DOI" && typeof id?.identifier === "string") {
      return {
        ...id,
        identifier: id.identifier.toLowerCase(),
      };
    }

    return id;
  });

  const doiEntry = identifiers.find((x: any) => x?.identifierType === "DOI");
  const doiRaw = doiEntry?.identifier;
  const doi = typeof doiRaw === "string" ? doiRaw.toLowerCase() : null;

  const publisher =
    typeof data.publisher === "string"
      ? data.publisher
      : (data.publisher?.name ?? null);

  const publicationYear = data.publicationYear ?? null;

  const subjectsRaw = data.subjects ?? [];
  const subjects = subjectsRaw.map((s: any) =>
    typeof s === "string" ? s : (s?.subject ?? ""),
  );

  const language = data.language ?? null;
  const relatedIdentifiers = data.relatedIdentifiers ?? [];

  const sizesArr = (data.sizes ?? []).filter((s: any) => typeof s === "string");
  const formatsArr = (data.formats ?? []).filter(
    (f: any) => typeof f === "string",
  );
  const size = sizesArr[0] ?? null;
  const format = formatsArr[0] ?? null;
  const version = data.version ?? null;

  const rightsList = data.rightsList ?? [];
  const license =
    rightsList[0]?.rightsIdentifier ?? rightsList[0]?.rights ?? null;

  const fundingReferences = data.fundingReferences ?? [];

  const { conference } = data;
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

  const domain = data.domain ?? "Other";

  const issuedDateStr = (data.dates ?? []).find(
    (d: any) => d?.dateType === "Issued",
  )?.date;
  const issuedAt = issuedDateStr ? new Date(issuedDateStr) : new Date();

  // Real JSON uses "content" field; fall back to empty sections
  const posterContent = data.content ?? {};

  const imageCaptions = (data.imageCaptions ?? []).map((c: any) => ({
    ...(c.id ? { id: c.id } : {}),
    caption: c.caption ?? "",
  }));

  const tableCaptions = (data.tableCaptions ?? []).map((c: any) => ({
    ...(c.id ? { id: c.id } : {}),
    caption: c.caption ?? "",
  }));

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
    issuedAt,
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

function collectJsonFiles(mergedDir: string): string[] {
  const sources = ["zenodo", "figshare"];
  const files: string[] = [];

  for (const source of sources) {
    const dir = path.join(mergedDir, source);
    if (!fs.existsSync(dir)) continue;

    const entries = fs.readdirSync(dir);
    for (const entry of entries) {
      if (entry.endsWith("_complete.json")) {
        files.push(path.join(dir, entry));
      }
    }
  }

  return files;
}

async function main() {
  const userId = "0";
  const limitArg = getArg("limit");
  const limit = limitArg ? Number(limitArg) : Infinity;
  const mergedDir = getArg("dir") ?? path.join(process.cwd(), "merged");

  console.log(`\n👤 Importing posters for userId: ${userId}`);

  const allFiles = collectJsonFiles(mergedDir);
  console.log(`📂 Found ${allFiles.length} JSON files in ${mergedDir}`);

  let created = 0;
  let updated = 0;
  let errored = 0;

  for (const filePath of allFiles) {
    if (created + updated >= limit) break;

    const raw = fs.readFileSync(filePath, "utf-8");
    let data: JsonPoster;
    try {
      data = JSON.parse(raw) as JsonPoster;
    } catch {
      console.warn(`   ⚠️  Could not parse ${filePath}`);
      errored++;
      continue;
    }

    const mapped = mapToDbFields(data);

    // The unique key is the DOI URL (https://doi.org/<doi>)
    const existingMetadata = mapped.doi
      ? await prisma.posterMetadata.findFirst({
          where: {
            doi: {
              equals: mapped.doi,
              mode: "insensitive",
            },
          },
          select: { posterId: true },
        })
      : null;

    const metadataPayload = {
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
    };

    try {
      if (existingMetadata) {
        // Update existing poster and its metadata
        await prisma.$transaction(async (tx) => {
          await tx.poster.update({
            where: { id: existingMetadata.posterId },
            data: {
              title: mapped.posterTitle,
              description: mapped.posterDescription,
              publishedAt: mapped.issuedAt,
              updated: mapped.issuedAt,
            },
          });

          await tx.posterMetadata.update({
            where: { posterId: existingMetadata.posterId },
            data: metadataPayload,
          });
        });

        updated++;
        console.log(
          `   🔄 [updated] ${existingMetadata.posterId} — ${mapped.posterTitle.slice(0, 60)}`,
        );
      } else {
        // Create new poster and metadata
        const poster = await prisma.$transaction(async (tx) => {
          const p = await tx.poster.create({
            data: {
              userId,
              title: mapped.posterTitle,
              description: mapped.posterDescription,
              imageUrl: "",
              automated: true,
              status: "published",
              publishedAt: mapped.issuedAt,
              created: mapped.issuedAt,
              updated: mapped.issuedAt,
              randomInt: Math.floor(Math.random() * 1000000),
            },
            select: { id: true, title: true },
          });

          await tx.posterMetadata.create({
            data: { posterId: p.id, ...metadataPayload },
            select: { posterId: true },
          });

          return p;
        });

        created++;
        console.log(
          `   ✅ [created] ${poster.id} — ${poster.title.slice(0, 60)}`,
        );
      }
    } catch (err: any) {
      console.warn(`   ❌ Failed: ${filePath}\n      ${err?.message}`);
      errored++;
    }
  }

  console.log(
    `\n🎉 Done. Created: ${created}, Updated: ${updated}, Errored: ${errored}\n`,
  );
}

main()
  .catch((err) => {
    console.error("\n❌ Import failed:");
    console.error(err);
    process.exitCode = 1;
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
