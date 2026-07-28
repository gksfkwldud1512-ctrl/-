import { NextResponse } from "next/server";
import { uploadPdfToBlob } from "@/lib/blob";
import { parseMsdsDocument } from "@/lib/parsing/section3";
import { createDraftMixture } from "@/lib/db/repo";
import type { MaterialType } from "@/lib/db/schema";

export const maxDuration = 60;

export async function POST(request: Request) {
  const formData = await request.formData();
  const file = formData.get("file");
  const productNameField = formData.get("productName");
  const materialTypeField = formData.get("materialType");

  if (!(file instanceof File)) {
    return NextResponse.json({ error: "PDF 파일이 필요합니다." }, { status: 400 });
  }
  if (file.type !== "application/pdf" && !file.name.toLowerCase().endsWith(".pdf")) {
    return NextResponse.json({ error: "PDF 파일만 업로드할 수 있습니다." }, { status: 400 });
  }

  const arrayBuffer = await file.arrayBuffer();
  const buffer = Buffer.from(arrayBuffer);

  const pdfBlobUrl = await uploadPdfToBlob(file.name, buffer);

  let draftIngredients: Awaited<ReturnType<typeof parseMsdsDocument>>["ingredients"] = [];
  let manufacturer: string | null = null;
  try {
    const parsed = await parseMsdsDocument(buffer);
    draftIngredients = parsed.ingredients;
    manufacturer = parsed.manufacturer;
  } catch (err) {
    console.error("MSDS PDF 파싱 실패, 빈 초안으로 진행:", err);
  }

  const productName =
    typeof productNameField === "string" && productNameField.trim() !== ""
      ? productNameField.trim()
      : file.name.replace(/\.pdf$/i, "");

  const materialType: MaterialType = materialTypeField === "auxiliary" ? "auxiliary" : "raw";

  const mixture = await createDraftMixture({
    productName,
    manufacturer,
    materialType,
    pdfBlobUrl,
    pdfFilename: file.name,
    draftIngredients,
  });

  return NextResponse.json({ mixtureId: mixture.id });
}
