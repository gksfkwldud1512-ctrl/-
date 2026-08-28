import { loadComplianceData } from "@/lib/complianceData";
import { loadRiskAssessmentData, computeRiskAssessmentRate } from "@/lib/riskAssessment";
import { loadEducationData } from "@/lib/education";
import { AppTabs } from "@/components/AppTabs";

export const dynamic = "force-dynamic";

export default async function Home() {
  const [data, riskAssessmentData, educationData] = await Promise.all([
    loadComplianceData(),
    loadRiskAssessmentData(),
    loadEducationData(),
  ]);
  const initialRiskAssessmentRate = computeRiskAssessmentRate(riskAssessmentData);
  return (
    <AppTabs
      initialComplianceData={data}
      initialRiskAssessmentRate={initialRiskAssessmentRate}
      initialEducationData={educationData}
    />
  );
}
