/**
 * 모든 MSDS PDF의 구성성분표를 다시 파싱해 함유량을 점검/반영한다.
 * 실행: npx tsx --env-file=.env.local src/scripts/reextractContent.ts [--apply]
 * (--apply 없이 실행하면 DB와 달라지는 항목만 출력)
 */
/**
 * 모든 mixtures의 원본 PDF를 다시 받아 개정일자를 재파싱한다.
 * - 기본은 점검만(dry-run): 바뀔 항목을 출력하고 DB는 건드리지 않는다.
 * - --apply 를 주면 파싱에 성공한 건의 revisionDate를 덮어쓴다(파싱 실패 건은 기존 값 유지).
 *   reviewCycleYears는 비어 있을 때만 채운다. 개정일이 바뀌면 수동 '확인' 처리는 자동 해제된다.
 *
 * 실행: npx tsx --env-file=.env.local src/scripts/reparseRevisionDates.ts [--apply]
 */
/**
 * 기존 mixtures 레코드를 일괄 보정한다:
 * 1) materialType="raw"는 department를 COMMON_DEPARTMENT("공통")로 강제 통일
 * 2) revisionDate/reviewCycleYears/ppeText가 비어있는 건은 원본 PDF를 다시 받아 재파싱해 채운다
 *    (이미 값이 있는 필드는 덮어쓰지 않는다 — 검토화면에서 수기로 보정했을 수 있으므로 보수적으로 처리)
 *
 * 주의: src/lib/parsing/pdfText.ts는 pdfjs-dist를 top-level await로 동적 로드하는데,
 * 이는 이 프로젝트가 "type":"module"이 아니라서 Next.js 번들러 밖(plain tsx CLI)에서는
 * CJS 변환 오류가 난다. 그래서 여기서는 같은 추출 로직을 이 스크립트 안에 그대로 복제해 쓴다.
 *
 * 실행: npx tsx --env-file=.env.local src/scripts/backfillMixtureMeta.ts
 */
import fs from "node:fs";
import path from "node:path";
import { pathToFileURL } from "node:url";
import { db } from "@/lib/db/client";
import { mixtureIngredients, mixtures } from "@/lib/db/schema";
import { eq } from "drizzle-orm";
import { confirmMixture } from "@/lib/db/repo";
import { parsePercent } from "@/lib/parsing/percent";
import { extractSection3FromLines } from "@/lib/parsing/section3Lines";
import type { PdfLine, PdfTextItem } from "@/lib/parsing/pdfText";

async function loadPdfjs() {
  const { DOMMatrix, Path2D } = await import("@napi-rs/canvas");
  if (typeof globalThis.DOMMatrix === "undefined") {
    // @ts-expect-error Node 런타임 폴리필용
    globalThis.DOMMatrix = DOMMatrix;
  }
  if (typeof globalThis.Path2D === "undefined") {
    // @ts-expect-error Node 런타임 폴리필용
    globalThis.Path2D = Path2D;
  }
  return import("pdfjs-dist/legacy/build/pdf.mjs");
}

function resolveStandardFontDataUrl(): string | undefined {
  const dir = path.join(process.cwd(), "node_modules", "pdfjs-dist", "standard_fonts");
  if (!fs.existsSync(dir)) return undefined;
  return pathToFileURL(dir + path.sep).toString();
}

async function extractLines(pdfjsLib: Awaited<ReturnType<typeof loadPdfjs>>, fileBuffer: Buffer): Promise<PdfLine[]> {
  const data = new Uint8Array(fileBuffer);
  const loadingTask = pdfjsLib.getDocument({
    data,
    useWorkerFetch: false,
    standardFontDataUrl: resolveStandardFontDataUrl(),
  });
  const doc = await loadingTask.promise;
  const items: PdfTextItem[] = [];
  for (let pageNum = 1; pageNum <= doc.numPages; pageNum++) {
    const page = await doc.getPage(pageNum);
    const content = await page.getTextContent();
    for (const item of content.items) {
      if (!("str" in item)) continue;
      const str = item.str;
      if (str.trim() === "") continue;
      items.push({ page: pageNum, str, x: item.transform[4], y: item.transform[5], width: item.width });
    }
  }

  const byPage = new Map<number, PdfTextItem[]>();
  for (const item of items) {
    if (!byPage.has(item.page)) byPage.set(item.page, []);
    byPage.get(item.page)!.push(item);
  }
  const lines: PdfLine[] = [];
  const yTolerance = 2;
  for (const [page, pageItems] of byPage) {
    const sorted = [...pageItems].sort((a, b) => b.y - a.y || a.x - b.x);
    let anchorY: number | null = null;
    let current: PdfTextItem[] = [];
    const flush = () => {
      if (current.length === 0) return;
      const sortedByX = [...current].sort((a, b) => a.x - b.x);
      const GAP_THRESHOLD = 1.5;
      let text = "";
      let prevEndX: number | null = null;
      for (const item of sortedByX) {
        if (prevEndX !== null && item.x - prevEndX > GAP_THRESHOLD) text += " ";
        text += item.str;
        prevEndX = item.x + item.width;
      }
      text = text.replace(/\s+/g, " ").trim();
      if (text !== "") lines.push({ page, y: anchorY!, text });
    };
    for (const item of sorted) {
      if (anchorY === null || Math.abs(item.y - anchorY) <= yTolerance) {
        anchorY = anchorY ?? item.y;
        current.push(item);
      } else {
        flush();
        anchorY = item.y;
        current = [item];
      }
    }
    flush();
  }
  return lines;
}



async function main() {
  const apply = process.argv.includes("--apply");
  const verdictChanges: string[] = [];
  const pdfjsLib = await loadPdfjs();
  const rows = await db.select().from(mixtures);
  const allIng = await db.select().from(mixtureIngredients);
  let diff = 0, same = 0, missing = 0, extra = 0, nullNew = 0;
  for (const m of rows) {
    const lines = await (async () => { try { const res = await fetch(m.pdfBlobUrl); return await extractLines(pdfjsLib, Buffer.from(await res.arrayBuffer())); } catch { return []; } })();
    if (lines.length === 0) { console.log(`[텍스트없음] ${m.productName}`); continue; }
    const fresh = extractSection3FromLines(lines);
    const dbIng = allIng.filter((i) => i.mixtureId === m.id);
    const out: string[] = [];
    for (const f of fresh) {
      const d = dbIng.find((i) => i.casNo === f.casNo);
      if (!d) { extra++; out.push(`   +PDF에만: ${f.casNo} ${f.contentPercentRaw ?? "-"}`); continue; }
      if ((d.contentPercentRaw ?? "") === (f.contentPercentRaw ?? "")) { same++; continue; }
      diff++; if (!f.contentPercentRaw) nullNew++;
      out.push(`   ${f.casNo}: DB=${d.contentPercentRaw ?? "-"}  ->  신규=${f.contentPercentRaw ?? "-"}  (${d.ingredientName.slice(0, 14)})`);
    }
    for (const d of dbIng) if (!fresh.some((f) => f.casNo === d.casNo)) { missing++; out.push(`   -DB에만: ${d.casNo} ${d.contentPercentRaw ?? "-"}`); }
    if (apply && out.length) {
      for (const f of fresh) {
        const d = dbIng.find((i) => i.casNo === f.casNo);
        if (!d || !f.contentPercentRaw || (d.contentPercentRaw ?? "") === f.contentPercentRaw) continue;
        const p = parsePercent(f.contentPercentRaw);
        await db.update(mixtureIngredients).set({ contentPercentRaw: f.contentPercentRaw, contentPercentMin: p.min, contentPercentMax: p.max }).where(eq(mixtureIngredients.id, d.id));
      }
      if (m.status === "confirmed") {
        await confirmMixture(m.id);
        await db.update(mixtures).set({ confirmedAt: m.confirmedAt }).where(eq(mixtures.id, m.id));
        const after = await db.select().from(mixtureIngredients).where(eq(mixtureIngredients.mixtureId, m.id));
        for (const d of dbIng) {
          const a = after.find((x) => x.id === d.id)!;
          const cats = (r: typeof d) => r.categoryVerdicts.filter((v) => v.matched).map((v) => v.category).sort().join(",");
          if (a.matchStatus !== d.matchStatus || cats(a) !== cats(d)) {
            verdictChanges.push(`${m.productName} | ${d.casNo} | 화관법 ${d.matchStatus} -> ${a.matchStatus} | 산안법 [${cats(d)}] -> [${cats(a)}] | 함유량 ${d.contentPercentRaw} -> ${a.contentPercentRaw}`);
          }
        }
      }
    }
    if (out.length) console.log(`## ${m.productName}\n` + out.join("\n"));
  }
  console.log(`\n동일 ${same}, 값변경 ${diff} (신규 공란 ${nullNew}), PDF에만 ${extra}, DB에만 ${missing}`);
  if (verdictChanges.length) console.log(["", "=== 판정 변경 ===", ...verdictChanges].join("\n"));
  process.exit(0);
}
main();
