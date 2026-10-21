import { describe, expect, it } from "vitest";
import { estimateGrade, GRADE_RULES as r, type SummitLayers } from "./visibility";

const clearSky = { low: 0, mid: 0, high: 0 };
const lake = (overrides: Partial<{ low: number; mid: number; high: number; precipitation: number }> = {}) => ({
  ...clearSky,
  precipitation: 0,
  ...overrides,
});
const top = (overrides: Partial<SummitLayers> = {}): SummitLayers => ({ ...clearSky, humidity700: null, ...overrides });

describe("estimateGrade", () => {
  it("is perfect under a clear sky", () => {
    expect(estimateGrade(lake(), top())).toBe("perfect");
  });

  it("drops to clear on thin cloud or a hazy high layer", () => {
    expect(estimateGrade(lake({ low: r.clearCover }), top())).toBe("clear");
    expect(estimateGrade(lake(), top({ high: r.clearHighCover }))).toBe("clear");
  });

  it("uses the cloudiest of lake low, summit low and summit mid", () => {
    expect(estimateGrade(lake({ low: r.cloudyCover }), top())).toBe("cloudy");
    expect(estimateGrade(lake(), top({ low: 100 }))).toBe("bad");
    expect(estimateGrade(lake({ low: 15 }), top({ mid: 80 }))).toBe("obscured");
  });

  it("weighs summit cloud below lake cloud", () => {
    expect(estimateGrade(lake({ low: 35 }), top())).toBe("obscured");
    expect(estimateGrade(lake(), top({ low: 35 }))).toBe("cloudy");
    expect(estimateGrade(lake(), top({ low: 70 }))).toBe("obscured");
    expect(estimateGrade(lake(), top({ low: 75 }))).toBe("bad");
    expect(estimateGrade(lake(), top({ mid: 40 }))).toBe("cloudy");
  });

  it("never reaches bad from summit mid cloud alone", () => {
    expect(estimateGrade(lake(), top({ mid: 100 }))).toBe("obscured");
  });

  it("caps the summit low term at the cloudy line when the summit level is dry", () => {
    const dry = r.summitDryHumidity - 1;
    // 2026-10-21 11시: 호수 하층 11, 정상 하층 77, 700hPa 습도 36
    expect(estimateGrade(lake({ low: 11 }), top({ low: 77, humidity700: 36 }))).toBe("cloudy");
    expect(estimateGrade(lake(), top({ low: 100, humidity700: 0 }))).toBe("cloudy");
    // 상한보다 작은 정상 하층 항은 그대로다
    expect(estimateGrade(lake(), top({ low: 7, humidity700: dry }))).toBe("clear");
    // 자르는 것은 정상 하층뿐이다
    expect(estimateGrade(lake({ low: 35 }), top({ low: 100, humidity700: dry }))).toBe("obscured");
    expect(estimateGrade(lake(), top({ mid: 100, humidity700: dry }))).toBe("obscured");
    expect(estimateGrade(lake({ precipitation: r.badPrecipitation }), top({ humidity700: dry }))).toBe("bad");
  });

  it("does not cap when the summit level is humid or the humidity is missing", () => {
    expect(estimateGrade(lake(), top({ low: 77, humidity700: r.summitDryHumidity }))).toBe("bad");
    expect(estimateGrade(lake(), top({ low: 77, humidity700: null }))).toBe("bad");
  });

  it("ignores mid cloud over the lake, which sits above the line of sight", () => {
    expect(estimateGrade(lake({ mid: 100 }), top())).toBe("perfect");
  });

  it("lets precipitation at the lake override clear clouds", () => {
    expect(estimateGrade(lake({ precipitation: r.obscuredPrecipitation }), top())).toBe("obscured");
    expect(estimateGrade(lake({ precipitation: r.badPrecipitation }), top())).toBe("bad");
  });

  it("keeps each step just below its threshold", () => {
    expect(estimateGrade(lake({ low: r.clearCover - 1 }), top())).toBe("perfect");
    expect(estimateGrade(lake({ low: r.cloudyCover - 1 }), top())).toBe("clear");
    expect(estimateGrade(lake({ low: r.obscuredCover - 1 }), top())).toBe("cloudy");
    expect(estimateGrade(lake({ low: r.badCover - 1 }), top())).toBe("obscured");
  });
});
