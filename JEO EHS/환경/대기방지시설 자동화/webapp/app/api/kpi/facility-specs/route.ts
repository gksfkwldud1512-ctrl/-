import { NextResponse } from "next/server";
import { loadFacilitySpecs, saveFacilitySpecs, type FacilitySpec, type FacilitySpecs, type FixtureEntry } from "@/lib/kpi/facilitySpecs";
import { FIXTURE_TYPES, type FixtureType } from "@/lib/kpi/fixturePresets";

export async function GET() {
  const specs = await loadFacilitySpecs();
  return NextResponse.json(specs);
}

function isFixtureType(v: unknown): v is FixtureType {
  return typeof v === "string" && (FIXTURE_TYPES as string[]).includes(v);
}

function toFixture(v: unknown): FixtureEntry | null {
  if (!v || typeof v !== "object") return null;
  const o = v as Record<string, unknown>;
  if (typeof o.id !== "string" || !isFixtureType(o.type)) return null;
  if (typeof o.quantity !== "number" || !Number.isFinite(o.quantity)) return null;
  if (typeof o.unitUsageL !== "number" || !Number.isFinite(o.unitUsageL)) return null;
  return {
    id: o.id,
    type: o.type,
    customTypeName: typeof o.customTypeName === "string" ? o.customTypeName : undefined,
    quantity: o.quantity,
    unitUsageL: o.unitUsageL,
    usesPerDayPerUnit:
      typeof o.usesPerDayPerUnit === "number" && Number.isFinite(o.usesPerDayPerUnit) ? o.usesPerDayPerUnit : undefined,
    note: typeof o.note === "string" ? o.note : undefined,
  };
}

function toSpec(v: unknown): FacilitySpec | null {
  if (!v || typeof v !== "object") return null;
  const o = v as Record<string, unknown>;
  const fixtures = Array.isArray(o.fixtures) ? o.fixtures.map(toFixture).filter((f): f is FixtureEntry => !!f) : undefined;
  return {
    quantity: typeof o.quantity === "number" && Number.isFinite(o.quantity) ? o.quantity : undefined,
    model: typeof o.model === "string" ? o.model : undefined,
    waterUsage: typeof o.waterUsage === "string" ? o.waterUsage : undefined,
    note: typeof o.note === "string" ? o.note : undefined,
    fixtures: fixtures && fixtures.length > 0 ? fixtures : undefined,
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
