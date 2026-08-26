import { NextResponse } from "next/server";
import { loadFacilitySpecs, saveFacilitySpecs, type FacilitySpec, type FacilitySpecs } from "@/lib/kpi/facilitySpecs";

export async function GET() {
  const specs = await loadFacilitySpecs();
  return NextResponse.json(specs);
}

function toSpec(v: unknown): FacilitySpec | null {
  if (!v || typeof v !== "object") return null;
  const o = v as Record<string, unknown>;
  return {
    quantity: typeof o.quantity === "number" && Number.isFinite(o.quantity) ? o.quantity : undefined,
    model: typeof o.model === "string" ? o.model : undefined,
    waterUsage: typeof o.waterUsage === "string" ? o.waterUsage : undefined,
    note: typeof o.note === "string" ? o.note : undefined,
  };
}

export async function POST(request: Request) {
  const body = await request.json().catch(() => null);
  if (!body || typeof body !== "object") {
    return NextResponse.json({ error: "요청 본문이 올바르지 않습니다." }, { status: 400 });
  }

  const clean: FacilitySpecs = {};
  for (const [name, raw] of Object.entries(body as Record<string, unknown>)) {
    const spec = toSpec(raw);
    if (spec) clean[name] = spec;
  }

  await saveFacilitySpecs(clean);
  return NextResponse.json(clean);
}
