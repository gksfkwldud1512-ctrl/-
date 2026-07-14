import {
  pgTable,
  uuid,
  text,
  boolean,
  timestamp,
  jsonb,
  numeric,
  integer,
  uniqueIndex,
} from "drizzle-orm/pg-core";

export type ThresholdOperator = ">=" | ">";

export type ParsedThreshold = {
  category: string; // 유독물질 | 사고대비물질 | 금지물질 | 제한물질
  subcategory: string | null; // 인체급성유해성 등 (Type A only)
  operator: ThresholdOperator;
  percent: number;
  raw: string; // 원문 블록 (검토용)
};

export type CategoryRefCodes = Record<string, string>;

export const referenceSubstances = pgTable(
  "reference_substances",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    casNo: text("cas_no").notNull(),
    nameEn: text("name_en"),
    nameKr: text("name_kr"),
    existingCode: text("existing_code"), // '기존' 컬럼 (KE-xxxxx)
    hazardClassRaw: text("hazard_class_raw"), // '급성·만성·생태' 컬럼
    sourceCategories: text("source_categories").array().notNull().default([]),
    categoryRefCodes: jsonb("category_ref_codes")
      .$type<CategoryRefCodes>()
      .notNull()
      .default({}),
    thresholdRaw: text("threshold_raw"), // 원문 '유해특성분류 및 혼합물 함량기준(%)'
    thresholds: jsonb("thresholds")
      .$type<ParsedThreshold[]>()
      .notNull()
      .default([]),
    registrationNo: text("registration_no"), // '등록대상기존화학물질'
    existingSubstanceYn: boolean("existing_substance_yn"),
    createdAt: timestamp("created_at").defaultNow().notNull(),
  },
  (t) => [uniqueIndex("reference_substances_cas_no_key").on(t.casNo)]
);

export type MixtureStatus = "pending_review" | "confirmed";
export type OverallVerdict = "hazardous" | "not_hazardous";

export const mixtures = pgTable("mixtures", {
  id: uuid("id").primaryKey().defaultRandom(),
  productName: text("product_name").notNull(),
  pdfBlobUrl: text("pdf_blob_url").notNull(),
  pdfFilename: text("pdf_filename").notNull(),
  status: text("status").$type<MixtureStatus>().notNull().default("pending_review"),
  overallVerdict: text("overall_verdict").$type<OverallVerdict | null>(),
  uploadedAt: timestamp("uploaded_at").defaultNow().notNull(),
  confirmedAt: timestamp("confirmed_at"),
});

export type MatchStatus =
  | "no_cas"
  | "no_match"
  | "matched_below_threshold"
  | "matched_hazardous";

export const mixtureIngredients = pgTable("mixture_ingredients", {
  id: uuid("id").primaryKey().defaultRandom(),
  mixtureId: uuid("mixture_id")
    .notNull()
    .references(() => mixtures.id, { onDelete: "cascade" }),
  rowOrder: integer("row_order").notNull(),
  ingredientName: text("ingredient_name").notNull(),
  casNo: text("cas_no"),
  contentPercentRaw: text("content_percent_raw"),
  contentPercentMin: numeric("content_percent_min", { mode: "number" }),
  contentPercentMax: numeric("content_percent_max", { mode: "number" }),
  matchedReferenceId: uuid("matched_reference_id").references(
    () => referenceSubstances.id
  ),
  matchStatus: text("match_status").$type<MatchStatus>().notNull().default("no_cas"),
  appliedThresholds: jsonb("applied_thresholds")
    .$type<ParsedThreshold[]>()
    .notNull()
    .default([]),
  createdAt: timestamp("created_at").defaultNow().notNull(),
});
