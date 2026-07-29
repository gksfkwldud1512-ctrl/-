import fs from "node:fs";
const { parseKpiDetailsWorkbook } = await import("../lib/kpi/parseDetails.ts");
const buf = fs.readFileSync("C:/Users/82108/Desktop/JEO EHS/환경/DETAILS (E MASTER & SPHERA ONLY).xlsx");
const summary = await parseKpiDetailsWorkbook(buf, "DETAILS.xlsx");
for (const key of ["energy", "waste", "water"]) {
  console.log(`\n=== ${key} ===`);
  Object.keys(summary.breakdown[key]).forEach(n => console.log(" -", n));
}
