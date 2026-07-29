import fs from "node:fs";
import path from "node:path";
import PptxGenJS from "pptxgenjs";
import { FISCAL_MONTHS, type KpiSummary, type MonthlyPoint } from "./parseDetails";
import { computeIntensity } from "./intensity";

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

// 회사 EHS 보고서 양식(250519_EHS Weekly meeting_JEO.pptx)의 테마 색상을 그대로 사용한다.
const NAVY = "1F497D"; // theme dk2
const NAVY_DARK = "16375C";
const RED = "C0504D"; // theme accent2 — 실적/초과 강조색
const BLUE = "4F81BD"; // theme accent1 — 목표선

const KO_MONTH: Record<string, string> = {
  Apr: "4월", May: "5월", Jun: "6월", Jul: "7월", Aug: "8월", Sep: "9월",
  Oct: "10월", Nov: "11월", Dec: "12월", Jan: "1월", Feb: "2월", Mar: "3월",
};
const KO_MONTHS = FISCAL_MONTHS.map((m) => KO_MONTH[m]);

const LOGO_DATA = `image/png;base64,${fs
  .readFileSync(path.join(process.cwd(), "lib/kpi/assets_logo.png"))
  .toString("base64")}`;

// 회사 양식과 동일한 와이드스크린 크기(13.333 x 7.5in).
const PAGE_W = 13.333;
const MARGIN = 0.3;
const CONTENT_W = PAGE_W - MARGIN * 2;

function monthValueMap(points: MonthlyPoint[], fiscalYear: string): Map<string, number> {
  const map = new Map<string, number>();
  for (const p of points) {
    if (p.fiscalYear === fiscalYear) map.set(p.month, p.value);
  }
  return map;
}

function addFooter(slide: PptxGenJS.Slide, pageNo: number) {
  slide.addImage({ data: LOGO_DATA, x: MARGIN, y: 7.02, w: 0.9, h: 0.4 });
  slide.addText("대외비", {
    x: PAGE_W / 2 - 0.75, y: 7.1, w: 1.5, h: 0.3, fontSize: 9, color: "888888", align: "center", fontFace: "Helvetica",
  });
  slide.addText(`페이지 ${pageNo}`, {
    x: PAGE_W - MARGIN - 1, y: 7.1, w: 1, h: 0.3, fontSize: 9, color: "888888", align: "right", fontFace: "Helvetica",
  });
}

function addTitle(slide: PptxGenJS.Slide, text: string, subtitle?: string) {
  slide.addText(text, {
    x: MARGIN, y: 0.25, w: CONTENT_W, h: 0.5,
    fontSize: 22, bold: true, color: NAVY, fontFace: "Helvetica",
  });
  if (subtitle) {
    slide.addText(subtitle, { x: MARGIN, y: 0.72, w: CONTENT_W, h: 0.3, fontSize: 12, color: "666666", fontFace: "Helvetica" });
  }
}

function buildIntensityLineChart(
  pres: PptxGenJS,
  slide: PptxGenJS.Slide,
  x: number,
  colW: number,
  title: string,
  unit: string,
  map: Map<string, number>,
  target: number,
  decimals: number
) {
  slide.addText(title, {
    x, y: 1.05, w: colW, h: 0.3, fontSize: 11, bold: true, color: NAVY, fontFace: "Helvetica", align: "center",
  });
  slide.addText(`단위: ${unit}`, {
    x, y: 1.32, w: colW, h: 0.25, fontSize: 8, color: "888888", fontFace: "Helvetica", align: "center",
  });

  const numFmt = decimals === 0 ? "#,##0" : `#,##0.${"0".repeat(decimals)}`;

  slide.addChart(
    pres.ChartType.line,
    [
      { name: "실적", labels: KO_MONTHS, values: FISCAL_MONTHS.map((m) => map.get(m) ?? 0) },
      { name: "목표", labels: KO_MONTHS, values: FISCAL_MONTHS.map(() => target) },
    ],
    {
      x, y: 1.65, w: colW, h: 4.3,
      chartColors: [RED, BLUE],
      lineDash: "dash",
      lineSize: 1.75,
      lineDataSymbolSize: 4,
      showLegend: true, legendPos: "b", legendFontSize: 8,
      catAxisLabelFontSize: 7, valAxisLabelFontSize: 7,
      catAxisLineColor: "cccccc", valAxisLineColor: "cccccc",
      valAxisLabelFormatCode: numFmt,
      // 배경 눈금선은 아주 얇고 희미하게 — 회사 양식(majorGridlines lumMod15/lumOff85)과 동일한 느낌.
      valGridLine: { color: "E6E6E6", size: 0.75, style: "solid" },
      catGridLine: { style: "none" },
    }
  );

  addFooter(slide, 1);
}

function buildIntensitySlide(pres: PptxGenJS, summary: KpiSummary, fiscalYear: string) {
  const slide = pres.addSlide();
  addTitle(slide, `${fiscalYear} 환경 강도 지표 (Environment Intensity KPI)`, "실적 · 목표 월별 추이 — 점선 그래프");

  const energyIntensity = monthValueMap(computeIntensity(summary.series.energy, summary.series.salesUSD), fiscalYear);
  const wasteIntensity = monthValueMap(computeIntensity(summary.series.waste, summary.series.salesUSD), fiscalYear);
  const waterIntensity = monthValueMap(computeIntensity(summary.series.water, summary.series.salesUSD), fiscalYear);

  const colW = (CONTENT_W - MARGIN * 2) / 3;
  const x0 = MARGIN;
  const x1 = MARGIN + colW + MARGIN;
  const x2 = MARGIN + (colW + MARGIN) * 2;

  buildIntensityLineChart(pres, slide, x0, colW, "에너지 강도", "GJ/MUSD", energyIntensity, INTENSITY_TARGETS.energy, 1);
  buildIntensityLineChart(pres, slide, x1, colW, "폐기물 강도", "ton/MUSD", wasteIntensity, INTENSITY_TARGETS.waste, 2);
  buildIntensityLineChart(pres, slide, x2, colW, "용수 강도", "㎥/MUSD", waterIntensity, INTENSITY_TARGETS.water, 1);
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
  addTitle(slide, `${fiscalYear} ${title} 월별 구성 내역`, `단위: ${unit} · 하단 표의 "목표"는 월 목표치입니다`);

  // 항목이 너무 많으면 범례/막대가 어지러워지므로 값이 큰 순서로 표시한다.
  const measureNames = Object.entries(breakdown)
    .map(([name, points]) => {
      const sum = points.filter((p) => p.fiscalYear === fiscalYear).reduce((acc, p) => acc + p.value, 0);
      return { name, sum };
    })
    .filter((m) => m.sum > 0)
    .sort((a, b) => b.sum - a.sum)
    .map((m) => m.name);

  const barSeries: PptxGenJS.OptsChartData[] = measureNames.map((name) => ({
    name,
    labels: [...KO_MONTHS],
    values: FISCAL_MONTHS.map((m) => monthValueMap(breakdown[name], fiscalYear).get(m) ?? 0),
  }));

  // dataviz 참조 팔레트의 카테고리 8색을 순환 배정(항목이 8개보다 많으면 반복).
  const PALETTE = ["2a78d6", "eb6834", "1baf7a", "eda100", "e87ba4", "008300", "4a3aa7", "e34948"];
  const barColors = measureNames.map((_, i) => PALETTE[i % PALETTE.length]);

  const numFmt = decimals === 0 ? "#,##0" : `#,##0.${"0".repeat(decimals)}`;

  // NOTE: pptxgenjs(4.0.1/3.12.0 둘 다 확인)의 콤보(막대+선) 차트가 내부적으로
  // plotArea 기본옵션 처리 버그로 항상 예외를 던져서, 목표는 그래프 위 선 대신
  // 아래 "합계/목표" 비교 표로 대체했다 — 값 비교는 이 표가 오히려 더 정확하다.
  slide.addChart(pres.ChartType.bar, barSeries, {
    x: MARGIN, y: 1.3, w: CONTENT_W, h: 4.5,
    barGrouping: "stacked",
    chartColors: barColors,
    showLegend: true, legendPos: "b", legendFontSize: 9,
    catAxisLabelFontSize: 9, valAxisLabelFontSize: 9,
    catAxisLineColor: "cccccc", valAxisLineColor: "cccccc",
    // 배경 눈금선은 아주 얇고 희미하게(회사 양식과 동일한 톤).
    valGridLine: { color: "E6E6E6", size: 0.75, style: "solid" },
    catGridLine: { style: "none" },
    // 막대 안에 실제 값을 표시한다.
    showValue: true,
    dataLabelPosition: "ctr",
    dataLabelColor: "FFFFFF",
    dataLabelFontSize: 7,
    dataLabelFormatCode: numFmt,
  });

  const totalByMonth = new Map<string, number>();
  for (const name of measureNames) {
    const m = monthValueMap(breakdown[name], fiscalYear);
    for (const month of FISCAL_MONTHS) {
      totalByMonth.set(month, (totalByMonth.get(month) ?? 0) + (m.get(month) ?? 0));
    }
  }

  const rows: PptxGenJS.TableRow[] = [
    [
      { text: "", options: { fill: { color: NAVY }, fontSize: 9 } },
      ...FISCAL_MONTHS.map((m) => ({ text: KO_MONTH[m], options: { bold: true, fill: { color: NAVY }, color: "FFFFFF", fontSize: 9, align: "center" as const } })),
    ],
    [
      { text: "월 합계", options: { bold: true, fontSize: 9 } },
      ...FISCAL_MONTHS.map((m) => {
        const v = totalByMonth.get(m) ?? 0;
        const overTarget = v > target;
        return { text: v.toFixed(decimals), options: { fontSize: 9, align: "center" as const, color: overTarget ? RED : "1a2a3a", bold: overTarget } };
      }),
    ],
    [
      { text: "목표", options: { bold: true, fontSize: 9, color: RED } },
      ...FISCAL_MONTHS.map(() => ({ text: target.toFixed(decimals), options: { fontSize: 9, align: "center" as const, color: RED } })),
    ],
  ];

  const totalColW = 1.0 * (CONTENT_W / 9.4);
  const monthColW = 0.7 * (CONTENT_W / 9.4);
  slide.addTable(rows, {
    x: MARGIN, y: 6.0, w: CONTENT_W,
    colW: [totalColW, ...FISCAL_MONTHS.map(() => monthColW)],
    border: { type: "solid", color: "DDDDDD", pt: 0.5 },
    valign: "middle",
  });

  addFooter(slide, pageNo);
}

export function buildKpiReportPptx(summary: KpiSummary, fiscalYear: string): Promise<Buffer> {
  const pres = new PptxGenJS();
  pres.defineLayout({ name: "EHS_WIDE", width: PAGE_W, height: 7.5 });
  pres.layout = "EHS_WIDE";

  buildIntensitySlide(pres, summary, fiscalYear);
  buildBreakdownSlide(pres, 2, "에너지 사용량", "GJ", summary.breakdown.energy, fiscalYear, TOTAL_TARGETS.energy, 0);
  buildBreakdownSlide(pres, 3, "폐기물 발생량", "ton", summary.breakdown.waste, fiscalYear, TOTAL_TARGETS.waste, 2);
  buildBreakdownSlide(pres, 4, "용수 사용량", "㎥", summary.breakdown.water, fiscalYear, TOTAL_TARGETS.water, 0);

  return pres.write({ outputType: "nodebuffer" }) as Promise<Buffer>;
}
