import { neon } from "@neondatabase/serverless";
import { drizzle } from "drizzle-orm/neon-http";
import * as schema from "./schema";

// neon-http는 쿼리마다 fetch 한 번이라 Workers에서 연결을 유지하지 않아도 된다(ycc-website와 같은 드라이버).
export function createDb(databaseUrl: string) {
  return drizzle(neon(databaseUrl), { schema });
}

export type Db = ReturnType<typeof createDb>;

// drizzle은 쿼리 오류를 "Failed query: <SQL> params: <값 수천 개>"로 감싸고 원인을 cause에 둔다. 원인만 짧게 보여준다.
export function describeError(error: unknown): string {
  if (!(error instanceof Error)) return String(error);
  return error.cause instanceof Error ? error.cause.message : error.message.slice(0, 300);
}
