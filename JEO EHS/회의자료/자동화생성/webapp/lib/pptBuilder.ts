import fs from "node:fs";
import path from "node:path";
import JSZip from "jszip";
import PptxGenJS from "pptxgenjs";
import { filledItems, type MeetingData, type MeetingItem, type MeetingStatus } from "./meetingData";

// 실제 사내 템플릿(회의자료/260727_EHS Weekly meeting_JEO.pptx)을 LibreOffice로 렌더링하고
// XML(EMU 좌표)을 직접 뜯어서 얻은 값들 그대로 재현한다 — 임의로 배치하지 않았다.
const PAGE_W = 13.333;
const PAGE_H = 7.5;
const MARGIN = 0.333;

const BLACK = "000000";
const JE_ORANGE = "F58220"; // 표지 제목 색(육안 확인)
const STATUS_COLOR = "F79646"; // 템플릿에서 그대로 추출한 "(On going)" 텍스트 색
const HEADER_BG = "E7E2D9"; // "New Issues"/"Ongoing Tasks" 헤더 바 배경(템플릿에서 추출)
const GREEN = "2E7D32";
const GRAY = "808080";

const STATUS_TEXT: Record<MeetingStatus, string> = { 진행중: "On going", 완료: "Completed", 예정: "Planned" };
const STATUS_HEX: Record<MeetingStatus, string> = { 진행중: STATUS_COLOR, 완료: GREEN, 예정: GRAY };

function loadAsset(name: string): string {
  const ext = path.extname(name).slice(1);
  const data = fs.readFileSync(path.join(process.cwd(), "lib/assets", name)).toString("base64");
  return `image/${ext};base64,${data}`;
}

const LOGO_LARGE = loadAsset("logo_large.png");
const LOGO_SMALL = loadAsset("logo_small.png");
const PILL_LARGE = loadAsset("pill_large.png");
const PILL_SMALL = loadAsset("pill_small.png");
const SUNBURST = loadAsset("sunburst.png");

function addFooter(slide: PptxGenJS.Slide, pageNo: number | null) {
  slide.addImage({ data: LOGO_SMALL, x: 11.51, y: 6.69, w: 1.822, h: 0.81 });
  if (pageNo !== null) {
    slide.addText(`Page  ${pageNo}`, { x: MARGIN, y: 7.222, w: 1, h: 0.27, fontSize: 10, color: BLACK, fontFace: "Arial" });
  }
  slide.addText("Confidential", { x: PAGE_W / 2 - 0.75, y: 7.222, w: 1.5, h: 0.27, align: "center", fontSize: 10, color: BLACK, fontFace: "Arial" });
}

/** 슬라이드2("EHS related reporting")·상세 슬라이드에 공통으로 쓰는 오렌지 알약 + 제목. */
function addTitle(slide: PptxGenJS.Slide, text: string, color: string = BLACK) {
  const pillY = 0.597;
  const pillH = 0.356;
  const pillW = 1.68;
  slide.addImage({ data: PILL_SMALL, x: 0, y: pillY, w: pillW, h: pillH });
  const titleX = pillW + 0.15;
  slide.addText(text, {
    x: titleX, y: pillY - 0.06, w: PAGE_W - MARGIN - titleX, h: pillH + 0.12,
    fontSize: 24, bold: true, color, fontFace: "Arial", valign: "middle",
  });
}

function buildCoverSlide(pres: PptxGenJS, meetingDate: string) {
  const slide = pres.addSlide();
  slide.addImage({ data: SUNBURST, x: 9.055, y: -0.019, w: 4.277, h: 7.518 });
  slide.addImage({ data: LOGO_LARGE, x: 0, y: 5.781, w: 3.865, h: 1.719 });

  slide.addText("EHS Weekly Meeting", {
    x: 1.015, y: 1.351, w: 9.643, h: 1.13, fontSize: 40, bold: true, color: JE_ORANGE, fontFace: "Arial",
  });
  slide.addText(meetingDate, {
    x: 1.015, y: 2.35, w: 9.643, h: 0.35, fontSize: 16, color: "666666", fontFace: "Arial",
  });
  slide.addText(
    [
      { text: "Contents", options: { bold: true, fontSize: 16, color: BLACK, breakLine: true } },
      { text: "", options: { breakLine: true, fontSize: 8 } },
      { text: "Ⅰ. Work in progress", options: { fontSize: 14, bold: true, color: BLACK } },
    ],
    { x: 1.015, y: 2.767, w: 7.408, h: 3.595, fontFace: "Arial" }
  );
  slide.addText("Confidential", { x: PAGE_W / 2 - 0.75, y: 7.222, w: 1.5, h: 0.27, align: "center", fontSize: 10, color: BLACK, fontFace: "Arial" });
}

/**
 * New Issues 또는 Ongoing Tasks 한 컬럼의 본문을 하나의 addText(런 배열)로 그린다.
 *
 * 글자 크기·줄간격은 원본 템플릿을 XML까지 직접 뜯어서 확인한 실제 값 그대로다: 제목+상태 14pt
 * bold, 설명 불릿 12pt, 줄간격 150%(lineSpacingMultiple: 1.5). 원본은 제목과 상태 태그를 색이
 * 다른 두 런으로 한 문단에 넣지만, **pptxgenjs로 그렇게 만들면 실제 PowerPoint가 파일을 거부하는
 * 버그가 있다**(런 배열에서 breakLine 없이 이어지는 런 2개가 서로 다른 포맷이면 `<a:pPr>`가
 * `<a:p>` 안 잘못된 위치에 들어감 — OpenXmlValidator로 직접 확인). 그래서 "1. 제목 - 상태"를
 * 하나의 런(한 가지 색)으로 합쳐서 안전하게 만들되, 상태에 따라 그 줄 전체를 색칠해서 원본의
 * 색 구분 느낌은 유지한다.
 *
 * 항목 사이 간격(paraSpaceBefore)은 고정값이 아니라, 이 컬럼에 실제 들어갈 줄 수를 계산해서
 * 남는 공간에 맞춰 동적으로 정한다 — 항목이 적으면 여백이 자연스럽게 남고, 7개까지 꽉 채우면
 * 로고 바로 위까지 내용이 이어지도록.
 */
const TITLE_SIZE = 14;
const DESC_SIZE = 12;
const LINE_MULT = 1.5;

function countDescLines(description: string): string[] {
  return description.split("\n").map((l) => l.trim()).filter(Boolean);
}

// 폰트의 실제 렌더링 줄 높이는 "글자 크기 × 줄간격 배수"보다 크다(글꼴 자체의 ascent/descent
// 여유분 때문) — 처음엔 이 보정을 안 넣었다가 실제 LibreOffice 렌더링에서 계산보다 훨씬 크게
// 넘치는 걸 보고 보정 계수를 추가했다. 1.5(150% 줄간격) 기준 실측치에 맞춰 보정.
const LINE_HEIGHT_FACTOR = 1.35;

function buildColumnRuns(items: { order: number; item: MeetingItem }[], showStatus: boolean, columnHeight: number): PptxGenJS.TextProps[] {
  const perItemDescLines = items.map(({ item }) => countDescLines(item.description));
  const estimateHeight = (titleSize: number, descSize: number) => {
    const titleLineH = (titleSize * LINE_MULT * LINE_HEIGHT_FACTOR) / 72;
    const descLineH = (descSize * LINE_MULT * LINE_HEIGHT_FACTOR) / 72;
    return items.length * titleLineH + perItemDescLines.reduce((sum, lines) => sum + lines.length * descLineH, 0);
  };

  // 실제 사용 가능한 높이의 97%까지 채우는 걸 목표로 잡는다(로고 바로 위까지 닿도록, 약간의 여유만).
  const targetHeight = columnHeight * 0.97;

  // 기본 크기(원본 템플릿 그대로: 제목 14pt/설명 12pt)로 다 넣었을 때 이미 넘치면(설명이 아주 긴
  // 극단적인 경우 대비 안전장치), 넘치지 않을 때까지 비율을 유지하며 축소한다.
  let scale = 1;
  const baseHeight = estimateHeight(TITLE_SIZE, DESC_SIZE);
  if (baseHeight > targetHeight) {
    scale = Math.max(0.55, targetHeight / baseHeight);
  }
  const titleSize = Math.round(TITLE_SIZE * scale * 2) / 2;
  const descSize = Math.round(DESC_SIZE * scale * 2) / 2;
  const totalContentHeight = estimateHeight(titleSize, descSize);

  const gapCount = Math.max(items.length - 1, 0);
  const rawGapIn = gapCount > 0 ? (targetHeight - totalContentHeight) / gapCount : 0;
  const gapPt = Math.max(4, Math.min(18, rawGapIn * 72)); // 너무 좁거나(겹침) 너무 넓지(어색함) 않게 상한/하한.

  const runs: PptxGenJS.TextProps[] = [];
  items.forEach(({ order, item }, idx) => {
    const titleColor = showStatus ? STATUS_HEX[item.status] : BLACK;
    const titleText = showStatus ? `${order}. ${item.title} - ${STATUS_TEXT[item.status]}` : `${order}. ${item.title}`;
    runs.push({
      text: titleText,
      options: {
        bold: true, fontSize: titleSize, color: titleColor, fontFace: "Arial", breakLine: true,
        lineSpacingMultiple: LINE_MULT, paraSpaceBefore: idx > 0 ? gapPt : 0,
      },
    });
    perItemDescLines[idx].forEach((line) => {
      runs.push({
        text: line,
        options: { fontSize: descSize, color: BLACK, fontFace: "Arial", breakLine: true, bullet: { code: "2022" }, lineSpacingMultiple: LINE_MULT },
      });
    });
  });
  return runs;
}

function buildOverviewSlide(pres: PptxGenJS, data: MeetingData) {
  const slide = pres.addSlide();
  addTitle(slide, "EHS related reporting");
  // 두 런을 한 문단(같은 줄)에 서로 다른 포맷으로 넣으면 pptxgenjs가 pPr을 잘못 배치하는 버그가
  // 있어(위 buildColumnRuns 설명 참고) 강조 없는 단순 텍스트로 대체했다.
  slide.addText("Yellow text = Updated", {
    x: 10.6, y: 0.65, w: 2.4, h: 0.3, fontSize: 10, color: "666666", fontFace: "Arial", align: "right",
  });

  const newIssues = filledItems(data.newIssues);
  const ongoingTasks = filledItems(data.ongoingTasks);

  // 헤더 바
  slide.addShape(pres.ShapeType.rect, { x: MARGIN, y: 1.101, w: 6.032, h: 0.359, fill: { color: HEADER_BG }, line: { type: "none" } });
  slide.addText("New Issues", { x: MARGIN + 0.1, y: 1.101, w: 5.9, h: 0.359, fontSize: 16, bold: true, color: BLACK, fontFace: "Arial", valign: "middle" });
  slide.addShape(pres.ShapeType.rect, { x: 6.667, y: 1.101, w: 6.032, h: 0.359, fill: { color: HEADER_BG }, line: { type: "none" } });
  slide.addText("Ongoing Tasks", { x: 6.767, y: 1.101, w: 5.9, h: 0.359, fontSize: 16, bold: true, color: BLACK, fontFace: "Arial", valign: "middle" });

  // 로고(y=6.69) 바로 위까지 내용이 닿도록, 컬럼별 시작 y를 기준으로 사용 가능한 높이를 계산해서
  // buildColumnRuns에 넘긴다 — 항목이 7개까지 꽉 차면 그 높이에 맞춰 항목 사이 간격이 자동으로
  // 늘어나서 로고 바로 위까지 채워지고, 항목이 적으면 자연스럽게 여백이 남는다.
  const contentBottom = 6.65;
  const newIssuesTop = 1.515;
  const ongoingTasksTop = 1.459;
  if (newIssues.length > 0) {
    slide.addText(buildColumnRuns(newIssues, false, contentBottom - newIssuesTop), { x: MARGIN, y: newIssuesTop, w: 6.665, h: contentBottom - newIssuesTop, valign: "top" });
  } else {
    slide.addText("등록된 신규 이슈가 없습니다.", { x: MARGIN, y: 1.6, w: 6.665, h: 0.4, fontSize: 11, color: "999999", fontFace: "Arial" });
  }
  if (ongoingTasks.length > 0) {
    slide.addText(buildColumnRuns(ongoingTasks, true, contentBottom - ongoingTasksTop), { x: 6.624, y: ongoingTasksTop, w: 6.527, h: contentBottom - ongoingTasksTop, valign: "top" });
  } else {
    slide.addText("등록된 진행중인 업무가 없습니다.", { x: 6.624, y: 1.6, w: 6.527, h: 0.4, fontSize: 11, color: "999999", fontFace: "Arial" });
  }

  addFooter(slide, 2);
  return { newIssues, ongoingTasks };
}

function buildTaskDetailSlide(pres: PptxGenJS, pageNo: number, order: number, item: MeetingItem) {
  const slide = pres.addSlide();
  // 슬라이드2와 동일하게 "N. 제목 - 상태"를 제목 자리에 그대로 쓰고, 상태에 따라 색을 입힌다.
  addTitle(slide, `${order}. ${item.title} - ${STATUS_TEXT[item.status]}`, STATUS_HEX[item.status]);

  const descLines = item.description.split("\n").map((l) => l.trim()).filter(Boolean);
  const runs: PptxGenJS.TextProps[] = descLines.length > 0
    ? descLines.map((line) => ({ text: line, options: { fontSize: 16, color: BLACK, fontFace: "Arial", breakLine: true, bullet: { code: "2022" }, lineSpacingMultiple: LINE_MULT } }))
    : [{ text: "(설명 없음)", options: { fontSize: 16, color: "999999", fontFace: "Arial" } }];
  slide.addText(runs, { x: MARGIN, y: 1.2, w: PAGE_W - MARGIN * 2, h: 5.4, valign: "top" });

  addFooter(slide, pageNo);
}

async function reorderForPowerPoint(buffer: Buffer): Promise<Buffer> {
  const zip = await JSZip.loadAsync(buffer);
  const priority = ["[Content_Types].xml", "_rels/.rels"];
  const allPaths = Object.keys(zip.files).filter((p) => !zip.files[p].dir);
  const orderedPaths = [...priority.filter((p) => allPaths.includes(p)), ...allPaths.filter((p) => !priority.includes(p))];
  const out = new JSZip();
  for (const p of orderedPaths) {
    out.file(p, await zip.files[p].async("nodebuffer"), { createFolders: false });
  }
  return out.generateAsync({ type: "nodebuffer", compression: "DEFLATE" });
}

export async function buildMeetingPptx(data: MeetingData): Promise<Buffer> {
  const pres = new PptxGenJS();
  pres.defineLayout({ name: "EHS_MEETING", width: PAGE_W, height: PAGE_H });
  pres.layout = "EHS_MEETING";

  buildCoverSlide(pres, data.meetingDate);
  const { ongoingTasks } = buildOverviewSlide(pres, data);
  ongoingTasks.forEach(({ order, item }, idx) => {
    buildTaskDetailSlide(pres, 3 + idx, order, item);
  });

  const raw = (await pres.write({ outputType: "nodebuffer" })) as Buffer;
  return reorderForPowerPoint(raw);
}
