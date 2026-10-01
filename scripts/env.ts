// 로컬 스크립트는 .env.local의 DATABASE_URL로 Neon에 붙는다.
export function requireDatabaseUrl(tag: string): string {
  try {
    process.loadEnvFile(".env.local");
  } catch {}
  const databaseUrl = process.env.DATABASE_URL;
  if (!databaseUrl) {
    console.error(`[${tag}] DATABASE_URL이 없다 (.env.local)`);
    process.exit(1);
  }
  return databaseUrl;
}
