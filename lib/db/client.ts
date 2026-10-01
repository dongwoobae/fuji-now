import { neon } from "@neondatabase/serverless";
import { drizzle } from "drizzle-orm/neon-http";
import * as schema from "./schema";

// neon-http는 쿼리마다 fetch 한 번이라 Workers에서 연결을 유지하지 않아도 된다(ycc-website와 같은 드라이버).
export function createDb(databaseUrl: string) {
  return drizzle(neon(databaseUrl), { schema });
}

export type Db = ReturnType<typeof createDb>;
