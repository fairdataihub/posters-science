-- CreateTable
CREATE TABLE "User" (
    "id" TEXT NOT NULL,
    "givenName" TEXT NOT NULL DEFAULT '',
    "familyName" TEXT NOT NULL DEFAULT '',
    "emailAddress" TEXT NOT NULL,
    "password" TEXT NOT NULL,
    "emailVerified" BOOLEAN NOT NULL DEFAULT false,
    "emailVerifiedAt" TIMESTAMP(3),
    "emailVerificationToken" TEXT,
    "emailVerificationTokenExpires" TIMESTAMP(3),
    "created" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "User_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "UserInterest" (
    "id" TEXT NOT NULL,
    "emailAddress" TEXT NOT NULL,
    "created" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "UserInterest_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Poster" (
    "id" SERIAL NOT NULL,
    "title" TEXT NOT NULL,
    "description" TEXT NOT NULL,
    "imageUrl" TEXT NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'draft',
    "publishedAt" TIMESTAMP(3),
    "userId" TEXT NOT NULL,
    "randomInt" INTEGER NOT NULL DEFAULT 0,
    "created" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Poster_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "PosterMetadata" (
    "posterId" INTEGER NOT NULL,
    "doi" TEXT,
    "identifiers" JSONB NOT NULL DEFAULT '[]',
    "creators" JSONB NOT NULL DEFAULT '[]',
    "publisher" TEXT,
    "publicationYear" INTEGER,
    "subjects" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "domain" TEXT,
    "language" TEXT,
    "version" TEXT,
    "size" TEXT,
    "format" TEXT,
    "license" TEXT,
    "fundingReferences" JSONB NOT NULL DEFAULT '[]',
    "conferenceName" TEXT,
    "conferenceLocation" TEXT,
    "conferenceUri" TEXT,
    "conferenceIdentifier" TEXT,
    "conferenceIdentifierType" TEXT,
    "conferenceYear" INTEGER,
    "conferenceStartDate" TEXT,
    "conferenceEndDate" TEXT,
    "conferenceAcronym" TEXT,
    "conferenceSeries" TEXT,
    "relatedIdentifiers" JSONB NOT NULL DEFAULT '[]',
    "posterContent" JSONB NOT NULL DEFAULT '[]',
    "tableCaptions" JSONB NOT NULL DEFAULT '[]',
    "imageCaptions" JSONB NOT NULL DEFAULT '[]',
    "created" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "PosterMetadata_pkey" PRIMARY KEY ("posterId")
);

-- CreateTable
CREATE TABLE "Like" (
    "userId" TEXT NOT NULL,
    "posterId" INTEGER NOT NULL,
    "created" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Like_pkey" PRIMARY KEY ("userId","posterId")
);

-- CreateTable
CREATE TABLE "ZenodoToken" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "accessToken" TEXT NOT NULL,
    "refreshToken" TEXT NOT NULL,
    "expiresAt" TIMESTAMP(3) NOT NULL,
    "created" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "ZenodoToken_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ZenodoDeposition" (
    "id" TEXT NOT NULL,
    "depositionId" INTEGER NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'unpublished',
    "lastPublishedZenodoDoi" TEXT,
    "userId" TEXT NOT NULL,
    "posterId" INTEGER NOT NULL,
    "created" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "ZenodoDeposition_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ExtractionJob" (
    "id" TEXT NOT NULL,
    "posterId" INTEGER NOT NULL,
    "fileName" TEXT NOT NULL,
    "filePath" TEXT NOT NULL,
    "completed" BOOLEAN NOT NULL DEFAULT false,
    "status" TEXT NOT NULL DEFAULT 'pending-extraction',
    "error" TEXT,
    "created" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "ExtractionJob_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "User_emailAddress_key" ON "User"("emailAddress");

-- CreateIndex
CREATE UNIQUE INDEX "User_emailVerificationToken_key" ON "User"("emailVerificationToken");

-- CreateIndex
CREATE INDEX "User_emailAddress_idx" ON "User"("emailAddress");

-- CreateIndex
CREATE UNIQUE INDEX "UserInterest_emailAddress_key" ON "UserInterest"("emailAddress");

-- CreateIndex
CREATE INDEX "UserInterest_emailAddress_idx" ON "UserInterest"("emailAddress");

-- CreateIndex
CREATE UNIQUE INDEX "ZenodoToken_userId_key" ON "ZenodoToken"("userId");

-- CreateIndex
CREATE INDEX "ZenodoToken_userId_idx" ON "ZenodoToken"("userId");

-- CreateIndex
CREATE UNIQUE INDEX "ZenodoDeposition_depositionId_key" ON "ZenodoDeposition"("depositionId");

-- CreateIndex
CREATE UNIQUE INDEX "ZenodoDeposition_posterId_key" ON "ZenodoDeposition"("posterId");

-- CreateIndex
CREATE UNIQUE INDEX "ExtractionJob_posterId_key" ON "ExtractionJob"("posterId");

-- CreateIndex
CREATE INDEX "ExtractionJob_status_idx" ON "ExtractionJob"("status");

-- AddForeignKey
ALTER TABLE "Poster" ADD CONSTRAINT "Poster_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PosterMetadata" ADD CONSTRAINT "PosterMetadata_posterId_fkey" FOREIGN KEY ("posterId") REFERENCES "Poster"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Like" ADD CONSTRAINT "Like_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Like" ADD CONSTRAINT "Like_posterId_fkey" FOREIGN KEY ("posterId") REFERENCES "Poster"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ZenodoToken" ADD CONSTRAINT "ZenodoToken_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ZenodoDeposition" ADD CONSTRAINT "ZenodoDeposition_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ZenodoDeposition" ADD CONSTRAINT "ZenodoDeposition_posterId_fkey" FOREIGN KEY ("posterId") REFERENCES "Poster"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ExtractionJob" ADD CONSTRAINT "ExtractionJob_posterId_fkey" FOREIGN KEY ("posterId") REFERENCES "Poster"("id") ON DELETE CASCADE ON UPDATE CASCADE;
