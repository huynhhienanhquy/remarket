ALTER TABLE "Session" ADD COLUMN "transport" TEXT NOT NULL DEFAULT 'WEB';
ALTER TABLE "Session" ADD CONSTRAINT "Session_transport_check" CHECK ("transport" IN ('WEB', 'MOBILE'));
