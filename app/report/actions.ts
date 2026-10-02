"use server";

import { env } from "cloudflare:workers";
import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { createDb } from "@/lib/db/client";
import { deleteReport, insertReport } from "@/lib/db/reports";
import { isReportAuthorized, parseReportForm, parseReportId, REPORT_COOKIE, REPORT_COOKIE_MAX_AGE, reportToken } from "@/lib/report";

const cookieOptions = { httpOnly: true, secure: true, sameSite: "strict", path: "/report" } as const;

export async function login(form: FormData) {
  const code = form.get("code");
  // 쿠키 확인과 같은 경로(해시 + 고정 시간 비교)로 코드를 확인한다.
  const token = typeof code === "string" ? await reportToken(code) : undefined;
  if (!token || !(await isReportAuthorized(token, env.REPORT_CODE))) redirect("/report?error=code");
  (await cookies()).set(REPORT_COOKIE, token, { ...cookieOptions, maxAge: REPORT_COOKIE_MAX_AGE });
  redirect("/report");
}

export async function logout() {
  (await cookies()).delete({ name: REPORT_COOKIE, path: cookieOptions.path });
  redirect("/report");
}

export async function submitReport(form: FormData) {
  const cookie = (await cookies()).get(REPORT_COOKIE)?.value;
  if (!(await isReportAuthorized(cookie, env.REPORT_CODE))) redirect("/report?error=auth");
  const parsed = parseReportForm(form, new Date());
  if (!parsed.ok) redirect("/report?error=input");
  if (!env.DATABASE_URL) redirect("/report?error=db");
  let id: number;
  try {
    id = await insertReport(createDb(env.DATABASE_URL), parsed.value);
  } catch (error) {
    console.log(JSON.stringify({ event: "report", written: false, error: error instanceof Error ? error.message : String(error) }));
    redirect("/report?error=db");
  }
  redirect(`/report?saved=${id}`);
}

export async function removeReport(form: FormData) {
  const cookie = (await cookies()).get(REPORT_COOKIE)?.value;
  if (!(await isReportAuthorized(cookie, env.REPORT_CODE))) redirect("/report?error=auth");
  const id = parseReportId(form.get("id"));
  if (id === null) redirect("/report?error=input");
  if (!env.DATABASE_URL) redirect("/report?error=db");
  try {
    await deleteReport(createDb(env.DATABASE_URL), id);
  } catch (error) {
    console.log(JSON.stringify({ event: "report", deleted: false, error: error instanceof Error ? error.message : String(error) }));
    redirect("/report?error=db");
  }
  redirect("/report?deleted=1");
}
