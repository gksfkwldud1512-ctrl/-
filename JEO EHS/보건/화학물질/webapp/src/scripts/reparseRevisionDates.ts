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
import { mixtures } from "@/lib/db/schema";
import { eq } from "drizzle-orm";
import { extractRevisionInfoFromLines } from "@/lib/parsing/msdsRevision";
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
  const pdfjsLib = await loadPdfjs();
  const rows = await db.select().from(mixtures);
  let same = 0, filled = 0, changed = 0, stillMissing = 0, failed = 0;

  for (const m of rows) {
    try {
      const res = await fetch(m.pdfBlobUrl);
      if (!res.ok) throw new Error(`fetch ${res.status}`);
      const lines = await extractLines(pdfjsLib, Buffer.from(await res.arrayBuffer()));
      const info = extractRevisionInfoFromLines(lines);
      if (!info.revisionDate) {
        stillMissing++;
        console.log(`[미검출] ${m.productName} (기존: ${m.revisionDate ?? "없음"})`);
        continue;
      }
      if (info.revisionDate === m.revisionDate) { same++; continue; }
      if (m.revisionDate) { changed++; console.log(`[변경] ${m.productName}: ${m.revisionDate} -> ${info.revisionDate}`); }
      else { filled++; console.log(`[신규] ${m.productName}: ${info.revisionDate}`); }
      if (apply) {
        const patch: Partial<typeof mixtures.$inferInsert> = { revisionDate: info.revisionDate };
        if (!m.reviewCycleYears && info.reviewCycleYears) patch.reviewCycleYears = info.reviewCycleYears;
        await db.update(mixtures).set(patch).where(eq(mixtures.id, m.id));
      }
    } catch (err) {
      failed++;
      console.error(`[실패] ${m.productName}:`, err instanceof Error ? err.message : err);
    }
  }
  console.log(`
${apply ? "적용 완료" : "DRY-RUN"} — 총 ${rows.length}건: 동일 ${same}, 신규 채움 ${filled}, 값 변경 ${changed}, 미검출 ${stillMissing}, 실패 ${failed}`);
  process.exit(0);
}
main().catch((e) => { console.error(e); process.exit(1); });
