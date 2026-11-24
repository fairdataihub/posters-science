-- CreateTable
CREATE TABLE "FigshareToken" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "tokenType" TEXT NOT NULL DEFAULT 'oauth',
    "accessToken" TEXT NOT NULL,
    "refreshToken" TEXT,
    "expiresAt" TIMESTAMP(3),
    "created" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "FigshareToken_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "FigshareDeposition" (
    "id" TEXT NOT NULL,
    "articleId" INTEGER NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'draft-new',
    "lastPublishedDoi" TEXT,
    "figshareVersion" INTEGER,
    "publicUrl" TEXT,
    "userId" TEXT NOT NULL,
    "posterId" INTEGER NOT NULL,
    "created" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "FigshareDeposition_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "FigshareToken_userId_key" ON "FigshareToken"("userId");

-- CreateIndex
CREATE UNIQUE INDEX "FigshareDeposition_posterId_key" ON "FigshareDeposition"("posterId");

-- CreateIndex
CREATE INDEX "FigshareDeposition_articleId_idx" ON "FigshareDeposition"("articleId");

-- AddForeignKey
ALTER TABLE "FigshareToken" ADD CONSTRAINT "FigshareToken_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "FigshareDeposition" ADD CONSTRAINT "FigshareDeposition_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "FigshareDeposition" ADD CONSTRAINT "FigshareDeposition_posterId_fkey" FOREIGN KEY ("posterId") REFERENCES "Poster"("id") ON DELETE CASCADE ON UPDATE CASCADE;
