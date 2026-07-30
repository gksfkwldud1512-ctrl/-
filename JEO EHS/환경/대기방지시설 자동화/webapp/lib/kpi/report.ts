import fs from "node:fs";
import path from "node:path";
import JSZip from "jszip";
import PptxGenJS from "pptxgenjs";
import { FISCAL_MONTHS, type KpiSummary, type MonthlyPoint } from "./parseDetails";
import { computeIntensity } from "./intensity";
import { getSafetyPyramidImageBuffer } from "./safetyPyramid";

// 올해 목표값 — 회계연도가 바뀌면 여기 숫자만 갱신하면 된다.
export const INTENSITY_TARGETS = {
  energy: 1406.3, // GJ/MUSD
  waste: 5.2, // ton/MUSD
  water: 423.35, // ㎥/MUSD
};
export const TOTAL_TARGETS = {
  energy: 12390, // GJ
  waste: 59, // ton
  water: 3017, // ㎥
};

// 회사 공식 PPT 양식("PowerPoint Template_7 June.pptx")의 색상을 그대로 사용한다.
const NAVY = "1F497D"; // theme dk2
const NAVY_DARK = "16375C";
const RED = "C0504D"; // theme accent2 — 실적/초과 강조색
const BLUE = "4F81BD"; // theme accent1 — 목표선
const BLACK = "000000"; // theme dk1/tx1 — 본문 슬라이드 제목 텍스트 색
// 회사 로고에 쓰인 주황색 — 강도 지표 차트 제목/막대, 표 헤더 배경에 공통으로 사용한다.
const JE_ORANGE = "F58220";
// 강도 지표 3개 차트를 서로 구분하기 위한 전용 색(제목 텍스트 + 실적 막대에 공통 사용).
const ENERGY_COLOR = JE_ORANGE;
const WASTE_COLOR = "E8B98C"; // 엷은 살색
const WATER_COLOR = "A9744F"; // 엷은 고동색

const KO_MONTH: Record<string, string> = {
  Apr: "4월", May: "5월", Jun: "6월", Jul: "7월", Aug: "8월", Sep: "9월",
  Oct: "10월", Nov: "11월", Dec: "12월", Jan: "1월", Feb: "2월", Mar: "3월",
};

const LOGO_DATA = `image/png;base64,${fs
  .readFileSync(path.join(process.cwd(), "lib/kpi/assets_logo.png"))
  .toString("base64")}`;
// 공식 양식의 제목 옆 오렌지 알약(pill) 그래픽 — 실제 슬라이드에서 그대로 추출한 이미지다.
// (제목 텍스트 자체는 검정이고, 이 그래픽이 왼쪽에 붙어서 "주황색 포인트"를 만든다.)
const TITLE_PILL_DATA = `image/png;base64,${fs
  .readFileSync(path.join(process.cwd(), "lib/kpi/title_pill.png"))
  .toString("base64")}`;

// 회사 공식 PPT 양식과 동일한 슬라이드 크기(10 x 5.625in, screen16x9).
const PAGE_W = 10;
const PAGE_H = 5.625;
const MARGIN = 0.225;
const CONTENT_W = PAGE_W - MARGIN * 2;

function monthValueMap(points: MonthlyPoint[], fiscalYear: string): Map<string, number> {
  const map = new Map<string, number>();
  for (const p of points) {
    if (p.fiscalYear === fiscalYear) map.set(p.month, p.value);
  }
  return map;
}

function addFooter(slide: PptxGenJS.Slide, pageNo: number) {
  // 공식 양식(slideLayout9)에서 로고는 우측 하단에 원본 비율(1.366 x 0.608in) 그대로, 모서리에
  // 딱 붙여 배치되어 있다 — 우리 로고 파일(assets_logo.png)이 그 템플릿에 쓰인 것과 동일 파일이라
  // 위치/크기를 그대로 맞췄다.
  const logoW = 1.366;
  const logoH = 0.608;
  slide.addImage({ data: LOGO_DATA, x: PAGE_W - logoW, y: PAGE_H - logoH, w: logoW, h: logoH });
  // 공식 양식과 동일하게 영문("Page N" / "Confidential")과 검정색을 그대로 사용한다.
  slide.addText(`Page ${pageNo}`, {
    x: MARGIN, y: 5.325, w: 1, h: 0.225, fontSize: 8, color: BLACK, align: "left", fontFace: "Helvetica",
  });
  slide.addText("Confidential", {
    x: PAGE_W / 2 - 0.5625, y: 5.325, w: 1.125, h: 0.225, fontSize: 8, color: BLACK, align: "center", fontFace: "Helvetica",
  });
}

function addTitle(slide: PptxGenJS.Slide, text: string, subtitle?: string) {
  // 공식 양식(slideLayout9)의 제목 줄 구성을 그대로 재현: 왼쪽에 오렌지 알약 그래픽,
  // 그 오른쪽에 검정 Helvetica 제목 텍스트(18~20pt 이내). 제목 텍스트 자체는 검정이다 —
  // 오렌지는 텍스트 색이 아니라 옆의 그래픽 요소다.
  const pillW = 1.233;
  const pillH = 0.267;
  const pillY = 0.44;
  slide.addImage({ data: TITLE_PILL_DATA, x: 0, y: pillY, w: pillW, h: pillH });

  const titleX = pillW + 0.15;
  slide.addText(text, {
    x: titleX, y: pillY, w: PAGE_W - MARGIN - titleX, h: pillH,
    fontSize: 20, bold: true, color: BLACK, fontFace: "Helvetica", valign: "middle",
  });
  if (subtitle) {
    slide.addText(subtitle, { x: MARGIN, y: pillY + pillH + 0.08, w: CONTENT_W, h: 0.225, fontSize: 10, color: "666666", fontFace: "Helvetica" });
  }
}

function buildIntensityLineChart(
  pres: PptxGenJS,
  slide: PptxGenJS.Slide,
  x: number,
  y: number,
  w: number,
  h: number,
  title: string,
  unit: string,
  map: Map<string, number>,
  target: number,
  decimals: number,
  accentColor: string
) {
  const titleH = 0.2;
  slide.addText(`${title} (${unit})`, {
    x, y, w, h: titleH, fontSize: 8, bold: true, color: accentColor, fontFace: "Helvetica", align: "left",
  });

  const numFmt = decimals === 0 ? "#,##0" : `#,##0.${"0".repeat(decimals)}`;
  const chartY = y + titleH;
  const chartH = h - titleH;

  // 에너지/폐기물/용수 구성내역 차트(buildBreakdownSlide)와 동일하게 4월~내년 3월 전체 12개월을
  // 항상 축에 표시한다. 다만 실적 막대는 아직 값이 없는 달(예: 6월 이후)은 0으로 채우지 않고
  // null로 비워서 막대 자체가 나타나지 않도록 한다.
  const labelsToShow = FISCAL_MONTHS.map((m) => KO_MONTH[m]);
  const actualValues = FISCAL_MONTHS.map((m) => (map.has(m) ? (map.get(m) as number) : (null as unknown as number)));

  // 콤보차트(addChart에 배열을 넘기는 방식)는 pptxgenjs 4.0.1의 알려진 결함(1. BAR/LINE에 불필요한
  // 3번째 axId, 2. 슬라이드마다 phantom Content_Types 항목, 3. c:marker/c:size에 정수가 아닌 값을
  // 넣으면 스키마 위반)이 겹치면 실제 PowerPoint가 열지 못했다 — 전부 patch-package로 고치고
  // lineDataSymbolSize를 정수로 맞춘 뒤로는 콤보차트도 정상적으로 열리는 것을 Open XML SDK
  // 검증기(OpenXmlValidator)와 실제 PowerPoint로 재확인했다.
  slide.addChart(
    [
      {
        type: pres.ChartType.bar,
        data: [{ name: "실적", labels: [...labelsToShow], values: actualValues }],
        options: {
          chartColors: [accentColor],
          showValue: true,
          dataLabelPosition: "outEnd",
          dataLabelColor: "333333",
          dataLabelFontSize: 5,
          dataLabelFormatCode: numFmt,
        },
      },
      {
        type: pres.ChartType.line,
        data: [{ name: "목표", labels: [...labelsToShow], values: FISCAL_MONTHS.map(() => target) }],
        options: { chartColors: [NAVY], lineDash: "dash" },
      },
    ],
    // NOTE: pptxgenjs 콤보차트는 내부적으로 `data || options` 순서로 옵션을 찾기 때문에
    // 옵션 객체를 반드시 2번째 인자(data 자리)에 넘겨야 한다.
    {
      x, y: chartY, w, h: chartH,
      lineSize: 1,
      // OOXML c:marker/c:size는 정수(byte)만 허용한다 — 3.5처럼 소수를 넣으면 스키마 위반으로
      // 실제 PowerPoint가 "읽을 수 없음"으로 거부한다(LibreOffice/python-pptx는 관대해서 통과시킴).
      lineDataSymbolSize: 4,
      displayBlanksAs: "gap",
      showLegend: true, legendPos: "r", legendFontSize: 6,
      catAxisLabelFontSize: 5, valAxisLabelFontSize: 5,
      catAxisLineColor: "cccccc", valAxisLineColor: "cccccc",
      valAxisLabelFormatCode: numFmt,
      // 배경 눈금선은 아주 얇고 희미하게 — 회사 양식(majorGridlines lumMod15/lumOff85)과 동일한 느낌.
      valGridLine: { color: "E6E6E6", size: 0.75, style: "solid" },
      catGridLine: { style: "none" },
      // 차트 전체에 얇은 검정 테두리를 두른다.
      chartArea: { border: { pt: 0.75, color: "000000" } },
    } as unknown as PptxGenJS.OptsChartData[]
  );

  // 목표선은 값이 전부 같은 수평 점선이라 매 지점마다 라벨을 달지 않고, 차트 우측 상단에
  // 목표 수치를 한 번만 표시한다.
  slide.addText(`목표 ${target.toLocaleString("en-US", { minimumFractionDigits: decimals, maximumFractionDigits: decimals })}`, {
    x: x + w - 1.5, y: chartY + 0.03, w: 1.4, h: 0.16, fontSize: 6, bold: true, color: NAVY, fontFace: "Helvetica", align: "right",
  });
}

/**
 * 슬라이드 1번(강도 지표): 왼쪽에 사용자가 매달 업로드하는 안전 피라미드 캡처 이미지,
 * 오른쪽에 에너지·폐기물·용수 강도 차트를 세로로 쌓아 보여준다.
 */
function buildIntensitySlide(
  pres: PptxGenJS,
  summary: KpiSummary,
  fiscalYear: string,
  safetyPyramidImageDataUrl: string | null
) {
  const slide = pres.addSlide();
  addTitle(slide, "EHS KPI_환경강도지표", `${fiscalYear} · 실적(막대) · 목표(점선) 월별 추이`);

  const contentTop = 1.49;
  const contentBottom = 5.2;

  // 왼쪽: 안전 피라미드
  const leftW = 4.3;
  slide.addText("안전 피라미드 실적", {
    x: MARGIN, y: contentTop, w: leftW, h: 0.2, fontSize: 8, bold: true, color: NAVY, fontFace: "Helvetica",
  });
  if (safetyPyramidImageDataUrl) {
    slide.addImage({
      data: safetyPyramidImageDataUrl,
      x: MARGIN, y: contentTop + 0.22, w: leftW, h: contentBottom - (contentTop + 0.22),
      sizing: { type: "contain", w: leftW, h: contentBottom - (contentTop + 0.22) },
    });
  } else {
    slide.addText("웹페이지 안전환경 KPI 화면에서 안전 피라미드 이미지를 업로드하면 여기에 표시됩니다.", {
      x: MARGIN, y: contentTop + 0.6, w: leftW, h: 0.6, fontSize: 8, color: "999999", fontFace: "Helvetica", align: "center",
    });
  }

  // 오른쪽: 에너지 → 폐기물 → 용수 강도를 위에서 아래로 세로 배치.
  const rightX = MARGIN + leftW + 0.25;
  const rightW = PAGE_W - MARGIN - rightX;
  const gap = 0.08;
  const rowH = (contentBottom - contentTop - gap * 2) / 3;

  const energyIntensity = monthValueMap(computeIntensity(summary.series.energy, summary.series.salesUSD), fiscalYear);
  const wasteIntensity = monthValueMap(computeIntensity(summary.series.waste, summary.series.salesUSD), fiscalYear);
  const waterIntensity = monthValueMap(computeIntensity(summary.series.water, summary.series.salesUSD), fiscalYear);

  buildIntensityLineChart(pres, slide, rightX, contentTop, rightW, rowH, "에너지 강도", "GJ/MUSD", energyIntensity, INTENSITY_TARGETS.energy, 1, ENERGY_COLOR);
  buildIntensityLineChart(pres, slide, rightX, contentTop + (rowH + gap), rightW, rowH, "폐기물 강도", "ton/MUSD", wasteIntensity, INTENSITY_TARGETS.waste, 2, WASTE_COLOR);
  buildIntensityLineChart(pres, slide, rightX, contentTop + (rowH + gap) * 2, rightW, rowH, "용수 강도", "㎥/MUSD", waterIntensity, INTENSITY_TARGETS.water, 1, WATER_COLOR);

  addFooter(slide, 1);
}

function buildBreakdownSlide(
  pres: PptxGenJS,
  pageNo: number,
  title: string,
  unit: string,
  breakdown: Record<string, MonthlyPoint[]>,
  fiscalYear: string,
  target: number,
  decimals: number
) {
  const slide = pres.addSlide();
  addTitle(slide, title, `${fiscalYear} · 단위: ${unit} · 하단 표의 "목표"는 월 목표치입니다`);

  // 항목이 너무 많으면 범례/막대가 어지러워지므로 값이 큰 순서로 표시한다.
  const measureNames = Object.entries(breakdown)
    .map(([name, points]) => {
      const sum = points.filter((p) => p.fiscalYear === fiscalYear).reduce((acc, p) => acc + p.value, 0);
      return { name, sum };
    })
    .filter((m) => m.sum > 0)
    .sort((a, b) => b.sum - a.sum)
    .map((m) => m.name);

  const KO_MONTHS = FISCAL_MONTHS.map((m) => KO_MONTH[m]);

  const barSeries: PptxGenJS.OptsChartData[] = measureNames.map((name) => ({
    name,
    labels: [...KO_MONTHS],
    values: FISCAL_MONTHS.map((m) => monthValueMap(breakdown[name], fiscalYear).get(m) ?? 0),
  }));

  // dataviz 참조 팔레트의 카테고리 8색을 순환 배정(항목이 8개보다 많으면 반복).
  const PALETTE = ["2a78d6", "eb6834", "1baf7a", "eda100", "e87ba4", "008300", "4a3aa7", "e34948"];
  const barColors = measureNames.map((_, i) => PALETTE[i % PALETTE.length]);

  const numFmt = decimals === 0 ? "#,##0" : `#,##0.${"0".repeat(decimals)}`;

  // 누적 막대(월별 실적) + 목표선(실선, 일자)을 콤보 차트로 함께 표시한다.
  slide.addChart(
    [
      {
        type: pres.ChartType.bar,
        data: barSeries,
        options: {
          barGrouping: "stacked",
          chartColors: barColors,
          // 막대 안에 실제 값을 표시한다.
          showValue: true,
          dataLabelPosition: "ctr",
          dataLabelColor: "FFFFFF",
          dataLabelFontSize: 6,
          dataLabelFormatCode: numFmt,
        },
      },
      {
        type: pres.ChartType.line,
        data: [{ name: "목표", labels: [...KO_MONTHS], values: FISCAL_MONTHS.map(() => target) }],
        options: {
          chartColors: [RED],
          lineDataSymbol: "circle",
          lineDataSymbolSize: 4,
          lineDash: "solid",
        },
      },
    ],
    // NOTE: pptxgenjs 콤보차트는 내부적으로 `data || options` 순서로 옵션을 찾기 때문에
    // 옵션 객체를 반드시 2번째 인자(data 자리)에 넘겨야 한다.
    {
      x: MARGIN, y: 1.22, w: CONTENT_W, h: 3.2,
      lineSize: 1.5,
      showLegend: true, legendPos: "b", legendFontSize: 7,
      catAxisLabelFontSize: 7, valAxisLabelFontSize: 7,
      catAxisLineColor: "cccccc", valAxisLineColor: "cccccc",
      // 배경 눈금선은 아주 얇고 희미하게(회사 양식과 동일한 톤).
      valGridLine: { color: "E6E6E6", size: 0.75, style: "solid" },
      catGridLine: { style: "none" },
      // 차트 전체에 얇은 검정 테두리를 두른다.
      chartArea: { border: { pt: 0.75, color: "000000" } },
    } as unknown as PptxGenJS.OptsChartData[]
  );

  const fmtComma = (v: number) => v.toLocaleString("en-US", { minimumFractionDigits: decimals, maximumFractionDigits: decimals });

  const totalByMonth = new Map<string, number>();
  for (const name of measureNames) {
    const m = monthValueMap(breakdown[name], fiscalYear);
    for (const month of FISCAL_MONTHS) {
      totalByMonth.set(month, (totalByMonth.get(month) ?? 0) + (m.get(month) ?? 0));
    }
  }

  const rows: PptxGenJS.TableRow[] = [
    [
      { text: "", options: { fill: { color: JE_ORANGE }, fontSize: 7 } },
      ...FISCAL_MONTHS.map((m) => ({ text: KO_MONTH[m], options: { bold: true, fill: { color: JE_ORANGE }, color: "FFFFFF", fontSize: 7, align: "center" as const } })),
    ],
    [
      { text: "월 합계", options: { bold: true, fontSize: 7 } },
      ...FISCAL_MONTHS.map((m) => {
        const v = totalByMonth.get(m) ?? 0;
        const overTarget = v > target;
        return { text: fmtComma(v), options: { fontSize: 7, align: "center" as const, color: overTarget ? RED : "1a2a3a", bold: overTarget } };
      }),
    ],
    [
      { text: "목표", options: { bold: true, fontSize: 7, color: RED } },
      // 목표는 매달 동일한 값이라 12칸을 하나로 병합해서 한 번만 보여준다.
      { text: fmtComma(target), options: { fontSize: 7, align: "center" as const, color: RED, colspan: FISCAL_MONTHS.length } },
    ],
  ];

  const totalColW = 1.0 * (CONTENT_W / 9.4);
  const monthColW = 0.7 * (CONTENT_W / 9.4);
  slide.addTable(rows, {
    x: MARGIN, y: 4.55, w: CONTENT_W,
    colW: [totalColW, ...FISCAL_MONTHS.map(() => monthColW)],
    border: { type: "solid", color: "DDDDDD", pt: 0.5 },
    valign: "middle",
  });

  addFooter(slide, pageNo);
}

/**
 * 생성된 pptx(zip)를 실제 PowerPoint(Office 정품 저장 파일)와 더 가깝게 재포장한다.
 * pptxgenjs(JSZip)가 만드는 zip은:
 *   1) `[Content_Types].xml`/`_rels/.rels`가 맨 앞이 아니라 파일 추가 순서상 한참 뒤에 들어간다.
 *   2) `_rels/`, `docProps/`, `ppt/` 같은 "디렉터리 전용" 항목을 명시적으로 포함한다 —
 *      실제 Office가 저장한 파일에는 이런 디렉터리 전용 항목이 없다(경로만으로 충분하므로).
 * 둘 다 OPC 스펙 위반은 아니라서 LibreOffice/python-pptx는 문제없이 열지만, 실제 PowerPoint가
 * "내용에 문제가 있습니다" 복구 다이얼로그를 띄우는 것과 관련 있을 가능성이 있어 함께 정리한다.
 */
async function reorderForPowerPoint(buffer: Buffer): Promise<Buffer> {
  const zip = await JSZip.loadAsync(buffer);
  const priority = ["[Content_Types].xml", "_rels/.rels"];
  const allPaths = Object.keys(zip.files).filter((p) => !zip.files[p].dir); // 디렉터리 전용 항목 제외
  const orderedPaths = [...priority.filter((p) => allPaths.includes(p)), ...allPaths.filter((p) => !priority.includes(p))];

  const out = new JSZip();
  for (const p of orderedPaths) {
    out.file(p, await zip.files[p].async("nodebuffer"), { createFolders: false });
  }
  return out.generateAsync({ type: "nodebuffer", compression: "DEFLATE" });
}

/** 비공개 Blob에 저장된 안전 피라미드 이미지를 PPT에 넣을 수 있는 base64 데이터 URI로 가져온다. */
async function fetchSafetyPyramidImageDataUrl(): Promise<string | null> {
  const image = await getSafetyPyramidImageBuffer();
  if (!image) return null;
  return `${image.contentType};base64,${image.buffer.toString("base64")}`;
}

async function buildKpiReportPptxRaw(summary: KpiSummary, fiscalYear: string): Promise<Buffer> {
  const pres = new PptxGenJS();
  pres.defineLayout({ name: "EHS_WIDE", width: PAGE_W, height: PAGE_H });
  pres.layout = "EHS_WIDE";

  const safetyPyramidImageDataUrl = await fetchSafetyPyramidImageDataUrl();

  buildIntensitySlide(pres, summary, fiscalYear, safetyPyramidImageDataUrl);
  buildBreakdownSlide(pres, 2, "에너지 사용량", "GJ", summary.breakdown.energy, fiscalYear, TOTAL_TARGETS.energy, 0);
  buildBreakdownSlide(pres, 3, "폐기물 발생량", "ton", summary.breakdown.waste, fiscalYear, TOTAL_TARGETS.waste, 2);
  buildBreakdownSlide(pres, 4, "용수 사용량", "㎥", summary.breakdown.water, fiscalYear, TOTAL_TARGETS.water, 0);

  return (await pres.write({ outputType: "nodebuffer" })) as Buffer;
}

export async function buildKpiReportPptx(summary: KpiSummary, fiscalYear: string): Promise<Buffer> {
  const raw = await buildKpiReportPptxRaw(summary, fiscalYear);
  return reorderForPowerPoint(raw);
}
