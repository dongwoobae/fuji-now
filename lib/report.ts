import { z } from "zod";
import { LAKE_IDS, type LakeId } from "./lakes";
import { VISIBILITY_GRADES, type VisibilityGrade } from "./visibility";

export const REPORT_COOKIE = "fuji_report";
export const REPORT_COOKIE_MAX_AGE = 180 * 24 * 60 * 60;
export const NOTE_MAX_LENGTH = 500;
// 폰 시계가 조금 빠른 경우만 받아 준다. 미래 시각의 실측은 오타다.
const FUTURE_SLACK_MS = 10 * 60 * 1000;

const reportFormSchema = z.object({
  place: z.enum(LAKE_IDS),
  grade: z.enum(VISIBILITY_GRADES),
  // <input type="datetime-local">은 오프셋 없는 시각을 보낸다. 입력 화면이 일본 시각이라고 안내한다.
  observedAt: z.string().regex(/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}$/),
  note: z.string().trim().max(NOTE_MAX_LENGTH),
});

export type ReportInput = { place: LakeId; grade: VisibilityGrade; observedAt: Date; note: string | null };

export function parseReportForm(form: FormData, now: Date): { ok: true; value: ReportInput } | { ok: false } {
  const parsed = reportFormSchema.safeParse({
    place: form.get("place"),
    grade: form.get("grade"),
    observedAt: form.get("observedAt"),
    note: form.get("note") ?? "",
  });
  if (!parsed.success) return { ok: false };
  const observedAt = new Date(`${parsed.data.observedAt}:00+09:00`);
  if (Number.isNaN(observedAt.getTime()) || observedAt.getTime() > now.getTime() + FUTURE_SLACK_MS) return { ok: false };
  const { place, grade, note } = parsed.data;
  return { ok: true, value: { place, grade, observedAt, note: note === "" ? null : note } };
}

// datetime-local 입력의 기본값. 일본 시각으로 분까지.
export function toJstInputValue(date: Date): string {
  return new Date(date.getTime() + 9 * 3_600_000).toISOString().slice(0, 16);
}

// 쿠키에는 비밀 코드 대신 그 해시를 둔다. 코드를 바꾸면 기존 쿠키가 모두 무효가 된다.
export async function reportToken(code: string): Promise<string> {
  const digest = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(`fuji-now-report:${code}`));
  return Array.from(new Uint8Array(digest), (byte) => byte.toString(16).padStart(2, "0")).join("");
}

export async function isReportAuthorized(cookie: string | undefined, code: string | undefined): Promise<boolean> {
  if (!code || !cookie) return false;
  const expected = await reportToken(code);
  if (cookie.length !== expected.length) return false;
  let diff = 0;
  for (let i = 0; i < expected.length; i++) diff |= cookie.charCodeAt(i) ^ expected.charCodeAt(i);
  return diff === 0;
}
