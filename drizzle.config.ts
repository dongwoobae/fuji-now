import type { Config } from "drizzle-kit";

// 로컬에서는 .env.local의 DATABASE_URL을 쓴다. CI는 환경 변수로 넘긴다. generate는 DB에 접속하지 않는다.
try {
  process.loadEnvFile(".env.local");
} catch {}

export default {
  schema: "./lib/db/schema.ts",
  out: "./drizzle",
  dialect: "postgresql",
  dbCredentials: { url: process.env.DATABASE_URL ?? "" },
} satisfies Config;
