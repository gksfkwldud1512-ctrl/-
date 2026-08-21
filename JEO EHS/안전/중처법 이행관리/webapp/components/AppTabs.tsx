"use client";

import { useState } from "react";
import type { ComplianceData } from "@/lib/complianceData";
import type { EducationData } from "@/lib/education";
import { ComplianceDashboard } from "./ComplianceDashboard";
import { EducationTracker } from "./EducationTracker";

const TABS = [
  { id: "compliance", label: "중처법 이행현황" },
  { id: "education", label: "법정교육 관리" },
] as const;

type TabId = (typeof TABS)[number]["id"];

export function AppTabs({
  initialComplianceData,
  initialRiskAssessmentRate,
  initialEducationData,
}: {
  initialComplianceData: ComplianceData;
  initialRiskAssessmentRate: number;
  initialEducationData: EducationData;
}) {
  const [tab, setTab] = useState<TabId>("compliance");

  return (
    <div className="mx-auto flex w-full max-w-6xl flex-1 flex-col">
      <nav className="sticky top-0 z-10 flex gap-1 border-b border-zinc-200 bg-zinc-50 px-6 pt-4">
        {TABS.map((t) => (
          <button
            key={t.id}
            type="button"
            onClick={() => setTab(t.id)}
            className={`rounded-t-md px-4 py-2 text-sm font-medium transition ${
              tab === t.id
                ? "border border-b-0 border-zinc-200 bg-white text-orange-600"
                : "text-zinc-500 hover:text-zinc-700"
            }`}
          >
            {t.label}
          </button>
        ))}
      </nav>

      <div className={tab === "compliance" ? "" : "hidden"}>
        <ComplianceDashboard initialData={initialComplianceData} initialRiskAssessmentRate={initialRiskAssessmentRate} />
      </div>
      <div className={tab === "education" ? "flex-1 px-6 py-10" : "hidden"}>
        <EducationTracker initialData={initialEducationData} />
      </div>
    </div>
  );
}
