BEGIN;

DELETE FROM "AiRun"
WHERE "threadId" LIKE 'admin-review:%'
   OR "threadId" IN (SELECT id FROM "AiThread" WHERE scope = 'ADMIN');

DELETE FROM "AiThread" WHERE scope = 'ADMIN';

DROP TABLE "AiSuggestion";

COMMIT;
