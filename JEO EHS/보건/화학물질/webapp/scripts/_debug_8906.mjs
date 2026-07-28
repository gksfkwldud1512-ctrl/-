import fs from "node:fs";
import { DOMMatrix, Path2D } from "@napi-rs/canvas";
if (typeof globalThis.DOMMatrix === "undefined") globalThis.DOMMatrix = DOMMatrix;
if (typeof globalThis.Path2D === "undefined") globalThis.Path2D = Path2D;
const pdfjsLib = await import("pdfjs-dist/legacy/build/pdf.mjs");

const path = "C:/Users/82108/AppData/Local/Temp/claude/C--Users-82108-Desktop-----/2c9f3479-46e4-4def-b3fd-de908b6ad5c6/scratchpad/89.06.04_GHS.pdf";
const buf = fs.readFileSync(path);
const data = new Uint8Array(buf);
const doc = await pdfjsLib.getDocument({ data, useWorkerFetch: false }).promise;
console.log("페이지 수:", doc.numPages);
for (let pageNum = 1; pageNum <= doc.numPages; pageNum++) {
  const page = await doc.getPage(pageNum);
  const content = await page.getTextContent();
  const totalChars = content.items.map(it => "str" in it ? it.str : "").join("").length;
  console.log(`page ${pageNum}: text items=${content.items.length}, total chars=${totalChars}`);
}
