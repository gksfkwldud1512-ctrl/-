/**
 * 이미 저장된 mixtures.ppeText에 남아있는 "볼드체 라벨 반복 렌더링" 잔재를 제거한다.
 * PDF를 다시 받을 필요 없이 저장된 텍스트에 dedupeRepeatedRuns를 다시 적용하기만 하면 된다.
 * 실행: npx tsx --env-file=.env.local src/scripts/cleanupPpeText.ts
 */
import { db } from "@/lib/db/client";
import { mixtures } from "@/lib/db/schema";
import { eq, isNotNull } from "drizzle-orm";
import { dedupeRepeatedRuns } from "@/lib/parsing/textClean";

async function main() {
  const rows = await db.select().from(mixtures).where(isNotNull(mixtures.ppeText));
  console.log(`ppeText 보유 ${rows.length}건 검사`);

  let changed = 0;
  for (const m of rows) {
    if (!m.ppeText) continue;
    const cleaned = dedupeRepeatedRuns(m.ppeText);
    if (cleaned !== m.ppeText) {
      await db.update(mixtures).set({ ppeText: cleaned }).where(eq(mixtures.id, m.id));
      changed++;
      console.log(`[정리] ${m.productName}`);
    }
  }
  console.log(`\n완료 — ${changed}건 정리됨`);
  process.exit(0);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
