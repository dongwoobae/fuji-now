import { env } from 'cloudflare:workers';
import { getDb } from '@/db';
import { observations } from '@/db/schema';

export const runtime = 'edge';
const labels = ['Perfect', 'Clear', 'Cloudy', 'Obscured', 'Bad'] as const;
const serverKey = () => (env as unknown as { GEMINI_API_KEY?: string }).GEMINI_API_KEY;

export async function GET() {
  return Response.json({ available: Boolean(serverKey()) }, { headers: { 'Cache-Control': 'no-store' } });
}

export async function POST(request: Request) {
  if (Number(request.headers.get('content-length') || 0) > 2_700_000) {
    return Response.json({ error: '이미지는 2MB 이하로 줄여주세요.' }, { status: 413 });
  }
  let body: { image?: string; mimeType?: string };
  try { body = await request.json(); } catch { return Response.json({ error: '요청 형식이 올바르지 않습니다.' }, { status: 400 }); }
  const key = serverKey();
  if (!key) return Response.json({ error: '사진 판정 기능을 준비 중입니다.' }, { status: 503 });
  if (!body.image || body.image.length > 2_600_000 || !/^[A-Za-z0-9+/]+={0,2}$/.test(body.image) || !['image/jpeg', 'image/png', 'image/webp'].includes(body.mimeType || '')) {
    return Response.json({ error: 'JPG, PNG 또는 WebP 이미지(2MB 이하)를 선택해주세요.' }, { status: 400 });
  }
  try {
    const response = await fetch('https://generativelanguage.googleapis.com/v1beta/models/gemini-3.1-flash-lite:generateContent', {
      method: 'POST', headers: { 'Content-Type': 'application/json', 'x-goog-api-key': key },
      body: JSON.stringify({
        contents: [{ parts: [
          { text: '이 사진은 후지산 관측용입니다. 산이 전혀 없거나 밤이라 판정할 수 없으면 Bad로 하세요. 이미지에 보이는 상태만 평가하고 날씨를 추측하지 마세요. Perfect=산 전체가 매우 선명, Clear=산 대부분 선명, Cloudy=일부 구름에 가림, Obscured=대부분 가림, Bad=전혀 판정 불가. 한국어로 짧게 근거를 적으세요. confidence는 모델의 주관적 확신(0~1)이며 확률 보장이 아닙니다.' },
          { inline_data: { mime_type: body.mimeType, data: body.image } },
        ] }],
        generationConfig: { responseMimeType: 'application/json', responseSchema: { type: 'OBJECT', properties: {
          label: { type: 'STRING', enum: labels }, summitVisible: { type: 'BOOLEAN' }, confidence: { type: 'NUMBER' }, note: { type: 'STRING' }
        }, required: ['label', 'summitVisible', 'confidence', 'note'] } },
      }),
    });
    if (!response.ok) {
      console.error('Gemini error status', response.status);
      return Response.json({ error: response.status === 400 || response.status === 403 ? 'API 키 또는 모델 사용 권한을 확인해주세요.' : 'AI 판정 요청이 실패했습니다.' }, { status: 502 });
    }
    const data = await response.json() as { candidates?: { content?: { parts?: { text?: string }[] } }[] };
    const raw = data.candidates?.[0]?.content?.parts?.[0]?.text;
    if (!raw) throw new Error('Empty model result');
    const parsed = JSON.parse(raw) as { label: string; summitVisible: boolean; confidence: number; note: string };
    if (!labels.includes(parsed.label as typeof labels[number]) || typeof parsed.summitVisible !== 'boolean' || !Number.isFinite(parsed.confidence) || typeof parsed.note !== 'string') throw new Error('Invalid model result');
    const observation = {
      observedAt: new Date().toISOString(), location: '가와구치코', label: parsed.label,
      summitVisible: parsed.summitVisible, confidence: Math.max(0, Math.min(1, parsed.confidence)), note: parsed.note.slice(0, 180),
    };
    try { await getDb().insert(observations).values(observation); } catch (error) { console.error('Observation save failed', error); }
    return Response.json(observation, { headers: { 'Cache-Control': 'no-store' } });
  } catch (error) {
    console.error('Image analysis failed', error);
    return Response.json({ error: '이미지를 판정하지 못했습니다. 잠시 후 다시 시도해주세요.' }, { status: 502 });
  }
}
