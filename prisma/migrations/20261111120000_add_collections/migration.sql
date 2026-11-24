-- CreateTable
CREATE TABLE "Collection" (
    "id" TEXT NOT NULL,
    "profileId" TEXT NOT NULL,
    "ownerId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "description" TEXT NOT NULL DEFAULT '',
    "conference" TEXT NOT NULL DEFAULT '',
    "isPublic" BOOLEAN NOT NULL DEFAULT false,
    "hiddenAt" TIMESTAMP(3),
    "hiddenReason" TEXT NOT NULL DEFAULT '',
    "sourceBulkSubmissionId" TEXT,
    "created" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Collection_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "CollectionPoster" (
    "id" TEXT NOT NULL,
    "collectionId" TEXT NOT NULL,
    "posterId" INTEGER NOT NULL,
    "created" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "CollectionPoster_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "OrganizationCollection" (
    "id" TEXT NOT NULL,
    "organizationId" TEXT NOT NULL,
    "collectionId" TEXT NOT NULL,
    "created" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "OrganizationCollection_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "Collection_profileId_key" ON "Collection"("profileId");

-- CreateIndex
CREATE UNIQUE INDEX "Collection_sourceBulkSubmissionId_key" ON "Collection"("sourceBulkSubmissionId");

-- CreateIndex
CREATE INDEX "Collection_ownerId_idx" ON "Collection"("ownerId");

-- CreateIndex
CREATE INDEX "Collection_isPublic_hiddenAt_idx" ON "Collection"("isPublic", "hiddenAt");

-- CreateIndex
CREATE INDEX "CollectionPoster_posterId_idx" ON "CollectionPoster"("posterId");

-- CreateIndex
CREATE UNIQUE INDEX "CollectionPoster_collectionId_posterId_key" ON "CollectionPoster"("collectionId", "posterId");

-- CreateIndex
CREATE INDEX "OrganizationCollection_collectionId_idx" ON "OrganizationCollection"("collectionId");

-- CreateIndex
CREATE UNIQUE INDEX "OrganizationCollection_organizationId_collectionId_key" ON "OrganizationCollection"("organizationId", "collectionId");

-- AddForeignKey
ALTER TABLE "Collection" ADD CONSTRAINT "Collection_ownerId_fkey" FOREIGN KEY ("ownerId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Collection" ADD CONSTRAINT "Collection_sourceBulkSubmissionId_fkey" FOREIGN KEY ("sourceBulkSubmissionId") REFERENCES "BulkSubmission"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CollectionPoster" ADD CONSTRAINT "CollectionPoster_collectionId_fkey" FOREIGN KEY ("collectionId") REFERENCES "Collection"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CollectionPoster" ADD CONSTRAINT "CollectionPoster_posterId_fkey" FOREIGN KEY ("posterId") REFERENCES "Poster"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "OrganizationCollection" ADD CONSTRAINT "OrganizationCollection_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "Organization"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "OrganizationCollection" ADD CONSTRAINT "OrganizationCollection_collectionId_fkey" FOREIGN KEY ("collectionId") REFERENCES "Collection"("id") ON DELETE CASCADE ON UPDATE CASCADE;

