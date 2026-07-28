import { put } from "@vercel/blob";

export async function uploadPdfToBlob(filename: string, buffer: Buffer): Promise<string> {
  const safeName = filename.replace(/[^\w.\-가-힣]/g, "_");
  const blob = await put(`msds/${Date.now()}-${safeName}`, buffer, {
    access: "public",
    contentType: "application/pdf",
    addRandomSuffix: true,
  });
  return blob.url;
}
