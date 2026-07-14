import fs from "node:fs";
import path from "node:path";
import { pathToFileURL } from "node:url";
import { DOMMatrix, Path2D } from "@napi-rs/canvas";

// pdfjs-dist(legacy 빌드)는 Node 환경에서 DOMMatrix/Path2D를 optional peer인
// @napi-rs/canvas로부터 동적으로 require해서 폴리필하는데, Vercel의 파일 트레이싱은
// 그 동적 require를 정적으로 감지하지 못해 배포본에 해당 패키지가 누락되고
// "DOMMatrix is not defined" 런타임 에러가 발생한다. 여기서 정적으로 직접 import해
// 트레이싱이 인식하게 하고, 필요하면 전역에 직접 폴리필한다.
if (typeof globalThis.DOMMatrix === "undefined") {
  // @ts-expect-error Node 런타임 폴리필용
  globalThis.DOMMatrix = DOMMatrix;
}
if (typeof globalThis.Path2D === "undefined") {
  // @ts-expect-error Node 런타임 폴리필용
  globalThis.Path2D = Path2D;
}

const pdfjsLib = await import("pdfjs-dist/legacy/build/pdf.mjs");

export type PdfTextItem = { page: number; str: string; x: number; y: number; width: number };
export type PdfLine = { page: number; y: number; text: string };

function resolveStandardFontDataUrl(): string | undefined {
  // 표준(비내장) 폰트의 글리프 폭 메트릭 참조용. Vercel 배포본에도 node_modules가
  // 포함되므로 process.cwd() 기준 경로로 충분하다. 없으면 그냥 생략(경고만 발생, 추출은 동작).
  const dir = path.join(process.cwd(), "node_modules", "pdfjs-dist", "standard_fonts");
  if (!fs.existsSync(dir)) return undefined;
  return pathToFileURL(dir + path.sep).toString();
}

/** PDF에서 페이지별 텍스트 조각(위치 포함)을 모두 추출한다. */
export async function extractPdfTextItems(fileBuffer: Buffer): Promise<PdfTextItem[]> {
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
      items.push({
        page: pageNum,
        str,
        x: item.transform[4],
        y: item.transform[5],
        width: item.width,
      });
    }
  }
  return items;
}

/**
 * 위치 정보를 가진 텍스트 조각들을 같은 y좌표(줄)끼리 묶고 x좌표 순으로 정렬해
 * 사람이 읽는 순서에 가까운 줄 단위 텍스트로 재구성한다.
 * PDF 텍스트 스트림 추출 시 표 셀 순서가 뒤섞이는 문제를 좌표 기반으로 보완하기 위함.
 */
export function groupIntoLines(items: PdfTextItem[], yTolerance = 2): PdfLine[] {
  const byPage = new Map<number, PdfTextItem[]>();
  for (const item of items) {
    if (!byPage.has(item.page)) byPage.set(item.page, []);
    byPage.get(item.page)!.push(item);
  }

  const lines: PdfLine[] = [];
  for (const [page, pageItems] of byPage) {
    const sorted = [...pageItems].sort((a, b) => b.y - a.y || a.x - b.x);
    let anchorY: number | null = null;
    let current: PdfTextItem[] = [];

    const flush = () => {
      if (current.length === 0) return;
      const sortedByX = [...current].sort((a, b) => a.x - b.x);
      // 텍스트 조각 사이의 실제 간격(gap)을 보고 공백 삽입 여부를 판단한다.
      // 항상 공백을 넣으면 같은 단어/숫자가 여러 조각으로 쪼개져 추출될 때
      // (예: "7439-89-6"이 "7439"와 "-89-6"으로 나뉘는 경우) "7439 -89-6"처럼
      // CAS 정규식이 깨지는 문제가 생긴다.
      const GAP_THRESHOLD = 1.5;
      let text = "";
      let prevEndX: number | null = null;
      for (const item of sortedByX) {
        if (prevEndX !== null && item.x - prevEndX > GAP_THRESHOLD) {
          text += " ";
        }
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
