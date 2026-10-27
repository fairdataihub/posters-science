-- AlterTable
ALTER TABLE "User" ADD COLUMN     "affiliation" TEXT NOT NULL DEFAULT '',
ADD COLUMN     "bio" TEXT NOT NULL DEFAULT '',
ADD COLUMN     "profileId" TEXT,
ADD COLUMN     "profilePublic" BOOLEAN NOT NULL DEFAULT false,
ADD COLUMN     "profileShowLikes" BOOLEAN NOT NULL DEFAULT false;

-- CreateTable
CREATE TABLE "PosterClaim" (
    "id" TEXT NOT NULL,
    "posterId" INTEGER NOT NULL,
    "userId" TEXT NOT NULL,
    "role" TEXT NOT NULL DEFAULT 'author',
    "created" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "PosterClaim_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "PosterClaim_userId_idx" ON "PosterClaim"("userId");

-- CreateIndex
CREATE UNIQUE INDEX "PosterClaim_posterId_userId_key" ON "PosterClaim"("posterId", "userId");

-- CreateIndex
CREATE UNIQUE INDEX "User_profileId_key" ON "User"("profileId");

-- AddForeignKey
ALTER TABLE "PosterClaim" ADD CONSTRAINT "PosterClaim_posterId_fkey" FOREIGN KEY ("posterId") REFERENCES "Poster"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PosterClaim" ADD CONSTRAINT "PosterClaim_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

