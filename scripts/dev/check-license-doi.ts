import { readFileSync } from "node:fs";
import { PrismaClient } from "../../shared/generated/client";
import { PrismaPg } from "@prisma/adapter-pg";
import "dotenv/config";

const adapter = new PrismaPg({ connectionString: process.env.DATABASE_URL });
const prisma = new PrismaClient({ adapter });

interface LiceEntry {
  id: number;
  license: string | null;
  doi: string;
}

async function main() {
  const entries: LiceEntry[] = JSON.parse(readFileSync("lice.json", "utf-8"));

  let missingRecords = 0;
  let updatedCount = 0;

  for (const [index, entry] of entries.entries()) {
    process.stdout.write(`\rProcessing ${index + 1}/${entries.length}...`);

    const record = await prisma.posterMetadata.findFirst({
      where: { doi: entry.doi, poster: { automated: true, tombstone: false } },
      select: { posterId: true, license: true },
    });

    if (!record) {
      missingRecords++;
      console.log(`doi=${entry.doi}: no PosterMetadata record found`);
      continue;
    }

    if (record.license === null) {
      await prisma.posterMetadata.update({
        where: { posterId: record.posterId },
        data: { license: entry.license },
      });
      updatedCount++;
      console.log(
        `doi=${entry.doi}: db license was null, set to "${entry.license}" (posterId=${record.posterId})`,
      );
    }
  }

  console.log("\n---");
  console.log(`Total entries: ${entries.length}`);
  console.log(`Missing DB records (no doi match): ${missingRecords}`);
  console.log(`Licenses updated: ${updatedCount}`);
}

main()
  .catch((error) => {
    console.error("Failed:", error);
    process.exitCode = 1;
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
