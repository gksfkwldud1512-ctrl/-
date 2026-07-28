import { NextResponse } from "next/server";
import { confirmPlacementExam } from "@/lib/db/repoPlacementExam";

export async function POST(request: Request, props: { params: Promise<{ id: string }> }) {
  const { id } = await props.params;
  await confirmPlacementExam(id);
  return NextResponse.json({ ok: true });
}
