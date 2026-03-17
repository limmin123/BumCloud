-- CreateTable
CREATE TABLE "File" (
    "id" TEXT NOT NULL,
    "uploaderUid" TEXT NOT NULL,
    "originalName" TEXT NOT NULL,
    "savedName" TEXT NOT NULL,
    "filePath" TEXT NOT NULL,
    "fileSize" BIGINT NOT NULL,
    "comment" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "File_pkey" PRIMARY KEY ("id")
);

-- AddForeignKey
ALTER TABLE "File" ADD CONSTRAINT "File_uploaderUid_fkey" FOREIGN KEY ("uploaderUid") REFERENCES "User"("uid") ON DELETE CASCADE ON UPDATE CASCADE;
