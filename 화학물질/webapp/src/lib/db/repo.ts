import { desc, eq, inArray } from "drizzle-orm";
import { db } from "./client";
import { mixtureIngredients, mixtures, referenceSubstances, type MatchStatus } from "./schema";
import { parsePercent } from "@/lib/parsing/percent";
import { determineIngredientVerdict, determineOverallVerdict, normalizeCas } from "@/lib/match/verdict";

export type DraftIngredientInput = {
  ingredientName: string;
  casNo: string | null;
  contentPercentRaw: string | null;
};

export async function getReferencesByIds(ids: string[]) {
  if (ids.length === 0) return [];
  return db.select().from(referenceSubstances).where(inArray(referenceSubstances.id, ids));
}

export async function listMixtures() {
  return db.select().from(mixtures).orderBy(desc(mixtures.uploadedAt));
}

export async function getMixtureWithIngredients(id: string) {
  const [mixture] = await db.select().from(mixtures).where(eq(mixtures.id, id));
  if (!mixture) return null;
  const ingredients = await db
    .select()
    .from(mixtureIngredients)
    .where(eq(mixtureIngredients.mixtureId, id))
    .orderBy(mixtureIngredients.rowOrder);
  return { mixture, ingredients };
}

function toIngredientRows(mixtureId: string, rows: DraftIngredientInput[]) {
  return rows.map((r, idx) => {
    const percent = parsePercent(r.contentPercentRaw);
    return {
      mixtureId,
      rowOrder: idx,
      ingredientName: r.ingredientName,
      casNo: r.casNo,
      contentPercentRaw: r.contentPercentRaw,
      contentPercentMin: percent.min,
      contentPercentMax: percent.max,
      matchStatus: "no_cas" as MatchStatus, // 실제 매칭은 confirm 시점에 수행
    };
  });
}

export async function createDraftMixture(input: {
  productName: string;
  pdfBlobUrl: string;
  pdfFilename: string;
  draftIngredients: DraftIngredientInput[];
}) {
  const [mixture] = await db
    .insert(mixtures)
    .values({
      productName: input.productName,
      pdfBlobUrl: input.pdfBlobUrl,
      pdfFilename: input.pdfFilename,
      status: "pending_review",
    })
    .returning();

  if (input.draftIngredients.length > 0) {
    await db.insert(mixtureIngredients).values(toIngredientRows(mixture.id, input.draftIngredients));
  }

  return mixture;
}

export async function replaceIngredients(
  mixtureId: string,
  rows: DraftIngredientInput[],
  productName?: string
) {
  await db.delete(mixtureIngredients).where(eq(mixtureIngredients.mixtureId, mixtureId));
  if (rows.length > 0) {
    await db.insert(mixtureIngredients).values(toIngredientRows(mixtureId, rows));
  }
  if (productName !== undefined && productName.trim() !== "") {
    await db.update(mixtures).set({ productName }).where(eq(mixtures.id, mixtureId));
  }
}

/** 검토 화면에서 확정된 성분 목록을 기준 데이터와 매칭해 최종 판정을 내리고 저장한다. */
export async function confirmMixture(mixtureId: string) {
  const result = await getMixtureWithIngredients(mixtureId);
  if (!result) throw new Error("존재하지 않는 혼합물입니다.");
  const { ingredients } = result;

  const casSet = Array.from(
    new Set(
      ingredients
        .map((i) => i.casNo)
        .filter((c): c is string => !!c && c.trim() !== "")
        .map(normalizeCas)
    )
  );
  const refs =
    casSet.length > 0
      ? await db.select().from(referenceSubstances).where(inArray(referenceSubstances.casNo, casSet))
      : [];
  const refMap = new Map(refs.map((r) => [r.casNo, r]));

  const statuses: MatchStatus[] = [];
  for (const ing of ingredients) {
    const percent = parsePercent(ing.contentPercentRaw);
    const verdict = determineIngredientVerdict(
      { casNo: ing.casNo, comparePercent: percent.compare },
      (cas) => {
        const ref = refMap.get(cas);
        if (!ref) return undefined;
        return { id: ref.id, thresholds: ref.thresholds };
      }
    );
    statuses.push(verdict.status);
    await db
      .update(mixtureIngredients)
      .set({
        contentPercentMin: percent.min,
        contentPercentMax: percent.max,
        matchStatus: verdict.status,
        matchedReferenceId: verdict.matchedReferenceId,
        appliedThresholds: verdict.appliedThresholds,
      })
      .where(eq(mixtureIngredients.id, ing.id));
  }

  const overallVerdict = determineOverallVerdict(statuses);
  await db
    .update(mixtures)
    .set({ status: "confirmed", overallVerdict, confirmedAt: new Date() })
    .where(eq(mixtures.id, mixtureId));

  return overallVerdict;
}
