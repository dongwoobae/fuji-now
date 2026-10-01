import { describe, expect, it } from "vitest";
import { isReportAuthorized, parseReportForm, reportToken, toJstInputValue } from "./report";

const NOW = new Date("2026-10-01T03:30:00Z"); // 일본 12:30

function form(values: Record<string, string>) {
  const data = new FormData();
  for (const [key, value] of Object.entries(values)) data.set(key, value);
  return data;
}

const valid = { place: "kawaguchiko", grade: "cloudy", observedAt: "2026-10-01T12:20", note: "  정상에 구름  " };

describe("parseReportForm", () => {
  it("reads the time as Japan time and trims the note", () => {
    const result = parseReportForm(form(valid), NOW);
    expect(result).toEqual({
      ok: true,
      value: { place: "kawaguchiko", grade: "cloudy", observedAt: new Date("2026-10-01T03:20:00Z"), note: "정상에 구름" },
    });
  });

  it("stores an empty note as null", () => {
    const result = parseReportForm(form({ ...valid, note: "   " }), NOW);
    expect(result.ok && result.value.note).toBeNull();
  });

  it("rejects unknown places and grades", () => {
    expect(parseReportForm(form({ ...valid, place: "tokyo" }), NOW).ok).toBe(false);
    expect(parseReportForm(form({ ...valid, grade: "visible" }), NOW).ok).toBe(false);
  });

  it("rejects a time in the future beyond a small clock slack", () => {
    expect(parseReportForm(form({ ...valid, observedAt: "2026-10-01T12:39" }), NOW).ok).toBe(true);
    expect(parseReportForm(form({ ...valid, observedAt: "2026-10-01T12:41" }), NOW).ok).toBe(false);
  });

  it("rejects malformed times and missing fields", () => {
    expect(parseReportForm(form({ ...valid, observedAt: "2026-10-01" }), NOW).ok).toBe(false);
    const withoutGrade = form(valid);
    withoutGrade.delete("grade");
    expect(parseReportForm(withoutGrade, NOW).ok).toBe(false);
  });

  it("rejects a note over the limit", () => {
    expect(parseReportForm(form({ ...valid, note: "가".repeat(501) }), NOW).ok).toBe(false);
  });
});

describe("toJstInputValue", () => {
  it("formats the Japan time to the minute", () => {
    expect(toJstInputValue(NOW)).toBe("2026-10-01T12:30");
  });
});

describe("isReportAuthorized", () => {
  it("accepts only the token of the current code", async () => {
    const token = await reportToken("secret-code");
    expect(token).toMatch(/^[0-9a-f]{64}$/);
    expect(await isReportAuthorized(token, "secret-code")).toBe(true);
    expect(await isReportAuthorized(token, "rotated-code")).toBe(false);
    expect(await isReportAuthorized("secret-code", "secret-code")).toBe(false);
  });

  it("refuses everything when the code is not configured", async () => {
    expect(await isReportAuthorized(await reportToken(""), undefined)).toBe(false);
    expect(await isReportAuthorized(await reportToken(""), "")).toBe(false);
    expect(await isReportAuthorized(undefined, "secret-code")).toBe(false);
  });
});
