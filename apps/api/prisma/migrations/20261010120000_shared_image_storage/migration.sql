CREATE TABLE "StorageObject" (
    "storagePath" TEXT NOT NULL,
    "contents" BYTEA NOT NULL,
    "mimeType" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "StorageObject_pkey" PRIMARY KEY ("storagePath"),
    CONSTRAINT "StorageObject_contents_size_check" CHECK (octet_length("contents") BETWEEN 1 AND 5242880),
    CONSTRAINT "StorageObject_mimeType_check" CHECK ("mimeType" IN ('image/jpeg', 'image/png', 'image/webp'))
);
