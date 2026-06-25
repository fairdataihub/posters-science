import { existsSync } from "node:fs";
import type { Prisma } from "../shared/generated/client";
import { PrismaClient } from "../shared/generated/client";
import { PrismaPg } from "@prisma/adapter-pg";
import { computeMetrics } from "../server/utils/computeMetrics";

// Load .env for local runs
if (existsSync(".env")) process.loadEnvFile(".env");

const adapter = new PrismaPg({ connectionString: process.env.DATABASE_URL });
const prisma = new PrismaClient({ adapter });

async function main() {
  console.log("Computing metrics snapshot...");

  const payload = await computeMetrics(prisma);

  const snapshot = await prisma.metricsSnapshot.create({
    data: { payload: payload as unknown as Prisma.InputJsonValue },
  });

  console.log(
    `Saved snapshot #${snapshot.id} at ${snapshot.generatedAt.toISOString()}`,
  );
}

main()
  .catch((error) => {
    console.error("Failed to compute metrics snapshot:", error);
    process.exitCode = 1;
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
