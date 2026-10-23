-- AlterTable
ALTER TABLE "ZenodoToken" ADD COLUMN     "tokenType" TEXT NOT NULL DEFAULT 'oauth',
ALTER COLUMN "refreshToken" DROP NOT NULL,
ALTER COLUMN "expiresAt" DROP NOT NULL;
