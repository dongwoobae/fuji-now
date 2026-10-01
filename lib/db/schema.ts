import { boolean, index, integer, pgEnum, pgTable, primaryKey, real, serial, smallint, text, timestamp } from "drizzle-orm/pg-core";
import { VISIBILITY_GRADES } from "../visibility";

export const gradeEnum = pgEnum("visibility_grade", VISIBILITY_GRADES);

// live: 매시 기록 작업이 받은 값. backfill: Open-Meteo 과거 예보 API로 나중에 채운 값.
export const WEATHER_SOURCES = ["live", "backfill"] as const;

// 지점은 호수 id 다섯과 "summit"이다(lib/lakes.ts의 FORECAST_POINTS). 지점을 늘릴 때 마이그레이션이 필요 없게 text로 둔다.
// 운량은 % 정수, 강수는 mm다. 원시 운량을 함께 남겨 등급 기준을 바꾸면 과거 등급을 다시 계산할 수 있게 한다.
const layers = {
  lowCloudCover: smallint("low_cloud_cover").notNull(),
  midCloudCover: smallint("mid_cloud_cover").notNull(),
  highCloudCover: smallint("high_cloud_cover").notNull(),
  precipitation: real("precipitation").notNull(),
  // 정상 지점은 등급이 없다.
  grade: gradeEnum("grade"),
  daylight: boolean("daylight").notNull(),
};

// 그 시각 실제에 가장 가까운 값: 매시 정각 직후에 받은 MSM의 해당 시각 값. 사람 실측이 없을 때 통계가 쓰는 모델 추정이다.
export const weatherHourly = pgTable(
  "weather_hourly",
  {
    point: text("point").notNull(),
    time: timestamp("time", { withTimezone: true }).notNull(),
    ...layers,
    fetchedAt: timestamp("fetched_at", { withTimezone: true }).notNull(),
    source: text("source", { enum: WEATHER_SOURCES }).notNull().default("live"),
  },
  (t) => [primaryKey({ columns: [t.point, t.time] }), index("weather_hourly_time_idx").on(t.time)],
);

// 같은 대상 시각을 리드타임(받은 시각부터 몇 시간 뒤인지)별로 남긴다. 예보가 얼마나 맞는지 나중에 weather_hourly·human_report와 비교한다.
export const forecast = pgTable(
  "forecast",
  {
    point: text("point").notNull(),
    targetTime: timestamp("target_time", { withTimezone: true }).notNull(),
    leadHours: integer("lead_hours").notNull(),
    ...layers,
    fetchedAt: timestamp("fetched_at", { withTimezone: true }).notNull(),
  },
  (t) => [primaryKey({ columns: [t.point, t.targetTime, t.leadHours] }), index("forecast_target_time_idx").on(t.targetTime)],
);

// 사람 실측. 같은 시각에 있으면 모델 추정보다 우선한다(lib/db/stats.ts의 집계 SQL).
export const humanReport = pgTable(
  "human_report",
  {
    id: serial("id").primaryKey(),
    place: text("place").notNull(),
    observedAt: timestamp("observed_at", { withTimezone: true }).notNull(),
    grade: gradeEnum("grade").notNull(),
    note: text("note"),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [index("human_report_place_observed_at_idx").on(t.place, t.observedAt)],
);

export type WeatherHourlyRow = typeof weatherHourly.$inferInsert;
export type ForecastRow = typeof forecast.$inferInsert;
export type HumanReport = typeof humanReport.$inferSelect;
