CREATE TYPE "public"."visibility_grade" AS ENUM('perfect', 'clear', 'cloudy', 'obscured', 'bad');--> statement-breakpoint
CREATE TABLE "forecast" (
	"point" text NOT NULL,
	"target_time" timestamp with time zone NOT NULL,
	"lead_hours" integer NOT NULL,
	"low_cloud_cover" smallint NOT NULL,
	"mid_cloud_cover" smallint NOT NULL,
	"high_cloud_cover" smallint NOT NULL,
	"precipitation" real NOT NULL,
	"grade" "visibility_grade",
	"daylight" boolean NOT NULL,
	"fetched_at" timestamp with time zone NOT NULL,
	CONSTRAINT "forecast_point_target_time_lead_hours_pk" PRIMARY KEY("point","target_time","lead_hours")
);
--> statement-breakpoint
CREATE TABLE "human_report" (
	"id" serial PRIMARY KEY NOT NULL,
	"place" text NOT NULL,
	"observed_at" timestamp with time zone NOT NULL,
	"grade" "visibility_grade" NOT NULL,
	"note" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "weather_hourly" (
	"point" text NOT NULL,
	"time" timestamp with time zone NOT NULL,
	"low_cloud_cover" smallint NOT NULL,
	"mid_cloud_cover" smallint NOT NULL,
	"high_cloud_cover" smallint NOT NULL,
	"precipitation" real NOT NULL,
	"grade" "visibility_grade",
	"daylight" boolean NOT NULL,
	"fetched_at" timestamp with time zone NOT NULL,
	CONSTRAINT "weather_hourly_point_time_pk" PRIMARY KEY("point","time")
);
--> statement-breakpoint
CREATE INDEX "forecast_target_time_idx" ON "forecast" USING btree ("target_time");--> statement-breakpoint
CREATE INDEX "human_report_place_observed_at_idx" ON "human_report" USING btree ("place","observed_at");--> statement-breakpoint
CREATE INDEX "weather_hourly_time_idx" ON "weather_hourly" USING btree ("time");