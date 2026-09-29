import { getDb } from '@/db';
import { observations } from '@/db/schema';
import { desc } from 'drizzle-orm';
export const runtime = 'edge';
export async function GET() {
  try {
    const rows = await getDb().select().from(observations).orderBy(desc(observations.id)).limit(24);
    return Response.json(rows, { headers: { 'Cache-Control': 'no-store' } });
  } catch (error) {
    console.error('Observation read failed', error);
    return Response.json({ error: '기록을 불러오지 못했습니다.' }, { status: 503 });
  }
}
