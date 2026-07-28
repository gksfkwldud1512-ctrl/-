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
export type MaterialType = "raw" | "auxiliary"; // 원재료 | 부자재

export const mixtures = pgTable("mixtures", {
  id: uuid("id").primaryKey().defaultRandom(),
  productName: text("product_name").notNull(),
  manufacturer: text("manufacturer"), // 제조사(공급자), MSDS 1장에서 자동추출 시도 + 검토화면에서 수정
  materialType: text("material_type").$type<MaterialType>().notNull().default("raw"),
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

export type PlacementExamStatus = "pending_review" | "confirmed";

export type HazardGrade = {
  hazard: string; // 유해인자명 (또는 "사부담(채용검진)" 등 검진 구분)
  grade: string; // A | B | C1 | C2 | CN | D1 | D2 | R
};

export const placementExams = pgTable("placement_exams", {
  id: uuid("id").primaryKey().defaultRandom(),
  name: text("name").notNull(),
  age: integer("age"),
  gender: text("gender"),
  // 주민등록번호는 뒷자리를 마스킹한 형태로만 저장한다 (예: 910223-1******).
  residentNumberMasked: text("resident_number_masked"),
  department: text("department"),
  workProcess: text("work_process"),
  examDate: text("exam_date"), // 배치전검진일, YYYY-MM-DD
  nextExamDate: text("next_exam_date"), // 배치후 검진만료(차기 건강진단 예정일), YYYY-MM-DD
  healthGradeWorst: text("health_grade_worst"), // 유해인자별 등급 중 가장 나쁜 등급 (대표 표시용)
  hazardGrades: jsonb("hazard_grades").$type<HazardGrade[]>().notNull().default([]),
  opinionText: text("opinion_text"), // 검진소견 + 사후관리조치 원문
  pdfBlobUrl: text("pdf_blob_url").notNull(),
  pdfFilename: text("pdf_filename").notNull(),
  status: text("status").$type<PlacementExamStatus>().notNull().default("pending_review"),
  uploadedAt: timestamp("uploaded_at").defaultNow().notNull(),
  confirmedAt: timestamp("confirmed_at"),
});
