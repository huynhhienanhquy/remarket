process.env.NODE_ENV = "test";
if (process.env.TEST_DATABASE_URL) process.env.DATABASE_URL = process.env.TEST_DATABASE_URL;
process.env.DATABASE_URL ??= "postgresql://remarket:remarket@127.0.0.1:5432/remarket_test";
process.env.DIRECT_URL ??= process.env.DATABASE_URL;
process.env.JWT_SECRET ??= "test-only-secret-with-at-least-thirty-two-characters";
process.env.FRONTEND_URL ??= "http://localhost:5173";
process.env.RUN_JOBS = "false";
process.env.STORAGE_DRIVER = "local";
