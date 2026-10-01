// drizzle/의 마이그레이션을 DATABASE_URL의 DB에 적용한다. CI가 main 배포 직전에 부른다.
// 로컬: pnpm db:migrate (.env.local의 DATABASE_URL)
// neon-http 마이그레이터는 문장을 하나씩 실행하고 적용 기록을 맨 끝에 남긴다. 중간에 끊기면 DB가 반만 바뀐 채 다음 실행도 막힌다.
// WebSocket(Pool) 드라이버의 마이그레이터는 대기 중인 마이그레이션 전부를 트랜잭션 하나로 적용한다. Node 22 이상은 WebSocket이 내장이다.
import { Pool } from "@neondatabase/serverless";
import { drizzle } from "drizzle-orm/neon-serverless";
import { migrate } from "drizzle-orm/neon-serverless/migrator";

if (!process.env.DATABASE_URL) {
  console.error("[migrate] DATABASE_URL이 없다");
  process.exit(1);
}

const pool = new Pool({ connectionString: process.env.DATABASE_URL });
try {
  await migrate(drizzle({ client: pool }), { migrationsFolder: "drizzle" });
} finally {
  await pool.end();
}
console.log("[migrate] 적용 완료");
