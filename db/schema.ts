import { integer, real, sqliteTable, text } from "drizzle-orm/sqlite-core";

export const observations = sqliteTable("observations", {
  id: integer("id").primaryKey({ autoIncrement: true }),
  observedAt: text("observed_at").notNull(),
  location: text("location").notNull(),
  label: text("label").notNull(),
  summitVisible: integer("summit_visible", { mode: "boolean" }).notNull(),
  confidence: real("confidence"),
  note: text("note").notNull(),
});
