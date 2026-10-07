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
import { COMMON_DEPARTMENT } from "@/lib/constants";
import { extractRevisionInfoFromLines } from "@/lib/parsing/msdsRevision";
import { extractPpeTextFromLines } from "@/lib/parsing/ppe";
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
  const pdfjsLib = await loadPdfjs();
  const rows = await db.select().from(mixtures);
  console.log(`총 ${rows.length}건 검사`);

  let rawFixed = 0;
  let metaFixed = 0;
  let fetchFailed = 0;

  for (const m of rows) {
    if (m.materialType === "raw" && m.department !== COMMON_DEPARTMENT) {
      await db.update(mixtures).set({ department: COMMON_DEPARTMENT, workProcess: null }).where(eq(mixtures.id, m.id));
      rawFixed++;
    }

    const needsMeta = !m.revisionDate || !m.reviewCycleYears || !m.ppeText;
    if (!needsMeta) continue;

    try {
      const res = await fetch(m.pdfBlobUrl);
      if (!res.ok) throw new Error(`fetch ${res.status}`);
      const buffer = Buffer.from(await res.arrayBuffer());
      const lines = await extractLines(pdfjsLib, buffer);
      const revisionInfo = extractRevisionInfoFromLines(lines);
      const ppeText = extractPpeTextFromLines(lines);

      const patch: Partial<typeof mixtures.$inferInsert> = {};
      if (!m.revisionDate && revisionInfo.revisionDate) patch.revisionDate = revisionInfo.revisionDate;
      if (!m.reviewCycleYears && revisionInfo.reviewCycleYears) patch.reviewCycleYears = revisionInfo.reviewCycleYears;
      if (!m.ppeText && ppeText) patch.ppeText = ppeText;

      if (Object.keys(patch).length > 0) {
        await db.update(mixtures).set(patch).where(eq(mixtures.id, m.id));
        metaFixed++;
        console.log(`[보정] ${m.productName}:`, patch);
      }
    } catch (err) {
      fetchFailed++;
      console.error(`[실패] ${m.productName} (${m.id}):`, err instanceof Error ? err.message : err);
    }
  }

  console.log(`\n완료 — 원재료 부서 보정 ${rawFixed}건, 개정정보/보호구 보정 ${metaFixed}건, PDF 재파싱 실패 ${fetchFailed}건`);
  process.exit(0);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
