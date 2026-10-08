import { PrismaClient } from "#shared/generated/client";
import { PrismaPg } from "@prisma/adapter-pg";

declare const globalThis: {
  prismaGlobal?: PrismaClient;
  prismaGlobalDatabaseUrl?: string;
} & typeof global;

function clientHasExpectedModels(client: PrismaClient) {
  return "maintenanceFlag" in client && "bulkSubmission" in client;
}

function createPrismaClient() {
  const connectionString = process.env.DATABASE_URL;
  if (!connectionString) {
    throw new Error("DATABASE_URL is not set");
  }

  const adapter = new PrismaPg({ connectionString });
  return new PrismaClient({ adapter });
}

function getPrismaClient() {
  const databaseUrl = process.env.DATABASE_URL;
  const cached = globalThis.prismaGlobal;

  if (
    cached &&
    databaseUrl &&
    globalThis.prismaGlobalDatabaseUrl === databaseUrl &&
    clientHasExpectedModels(cached)
  ) {
    return cached;
  }

  const client = createPrismaClient();

  if (process.env.NODE_ENV !== "production") {
    globalThis.prismaGlobal = client;
    globalThis.prismaGlobalDatabaseUrl = databaseUrl;
  }

  return client;
}

const prisma = getPrismaClient();

export default prisma;
