// drizzle/의 마이그레이션을 DATABASE_URL의 DB에 적용한다. CI가 main 배포 직전에 부른다.
// 로컬: pnpm db:migrate (.env.local의 DATABASE_URL)
import { neon } from "@neondatabase/serverless";
import { drizzle } from "drizzle-orm/neon-http";
import { migrate } from "drizzle-orm/neon-http/migrator";

if (!process.env.DATABASE_URL) {
  console.error("[migrate] DATABASE_URL이 없다");
  process.exit(1);
}

await migrate(drizzle(neon(process.env.DATABASE_URL)), { migrationsFolder: "drizzle" });
console.log("[migrate] 적용 완료");
