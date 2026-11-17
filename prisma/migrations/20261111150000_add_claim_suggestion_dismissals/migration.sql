-- AlterTable
ALTER TABLE "User" ADD COLUMN     "orcidSuggestionsHidden" BOOLEAN NOT NULL DEFAULT false;

-- CreateTable
CREATE TABLE "ClaimSuggestionDismissal" (
    "id" TEXT NOT NULL,
    "posterId" INTEGER NOT NULL,
    "userId" TEXT NOT NULL,
    "created" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ClaimSuggestionDismissal_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "ClaimSuggestionDismissal_posterId_idx" ON "ClaimSuggestionDismissal"("posterId");

-- CreateIndex
CREATE UNIQUE INDEX "ClaimSuggestionDismissal_userId_posterId_key" ON "ClaimSuggestionDismissal"("userId", "posterId");

-- AddForeignKey
ALTER TABLE "ClaimSuggestionDismissal" ADD CONSTRAINT "ClaimSuggestionDismissal_posterId_fkey" FOREIGN KEY ("posterId") REFERENCES "Poster"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ClaimSuggestionDismissal" ADD CONSTRAINT "ClaimSuggestionDismissal_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

