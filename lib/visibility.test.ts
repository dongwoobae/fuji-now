import { describe, expect, it } from "vitest";
import { estimateGrade, GRADE_RULES as r, isVisibilityGrade, resolveGrade } from "./visibility";

const clearSky = { low: 0, mid: 0, high: 0 };
const lake = (overrides: Partial<{ low: number; mid: number; high: number; precipitation: number }> = {}) => ({
  ...clearSky,
  precipitation: 0,
  ...overrides,
});

describe("estimateGrade", () => {
  it("is perfect under a clear sky", () => {
    expect(estimateGrade(lake(), clearSky)).toBe("perfect");
  });

  it("drops to clear on thin cloud or a hazy high layer", () => {
    expect(estimateGrade(lake({ low: r.clearCover }), clearSky)).toBe("clear");
    expect(estimateGrade(lake(), { ...clearSky, high: r.clearHighCover })).toBe("clear");
  });

  it("uses the cloudiest of lake low, summit low and summit mid", () => {
    expect(estimateGrade(lake({ low: r.cloudyCover }), clearSky)).toBe("cloudy");
    expect(estimateGrade(lake(), { ...clearSky, low: r.obscuredCover })).toBe("obscured");
    expect(estimateGrade(lake(), { ...clearSky, mid: r.badCover })).toBe("bad");
  });

  it("ignores mid cloud over the lake, which sits above the line of sight", () => {
    expect(estimateGrade(lake({ mid: 100 }), clearSky)).toBe("perfect");
  });

  it("lets precipitation at the lake override clear clouds", () => {
    expect(estimateGrade(lake({ precipitation: r.obscuredPrecipitation }), clearSky)).toBe("obscured");
    expect(estimateGrade(lake({ precipitation: r.badPrecipitation }), clearSky)).toBe("bad");
  });

  it("keeps each step just below its threshold", () => {
    expect(estimateGrade(lake({ low: r.clearCover - 1 }), clearSky)).toBe("perfect");
    expect(estimateGrade(lake({ low: r.cloudyCover - 1 }), clearSky)).toBe("clear");
    expect(estimateGrade(lake({ low: r.obscuredCover - 1 }), clearSky)).toBe("cloudy");
    expect(estimateGrade(lake({ low: r.badCover - 1 }), clearSky)).toBe("obscured");
  });
});

describe("resolveGrade", () => {
  it("prefers a human report over the model estimate", () => {
    expect(resolveGrade("bad", "perfect")).toBe("bad");
    expect(resolveGrade(null, "cloudy")).toBe("cloudy");
    expect(resolveGrade(null, null)).toBeNull();
  });
});

describe("isVisibilityGrade", () => {
  it("accepts only the five grades", () => {
    expect(isVisibilityGrade("clear")).toBe(true);
    expect(isVisibilityGrade("visible")).toBe(false);
    expect(isVisibilityGrade(3)).toBe(false);
  });
});
