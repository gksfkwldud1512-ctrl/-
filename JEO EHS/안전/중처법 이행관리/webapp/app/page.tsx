import { loadComplianceData } from "@/lib/complianceData";
import { loadRiskAssessmentData, computeRiskAssessmentRate } from "@/lib/riskAssessment";
import { ComplianceDashboard } from "@/components/ComplianceDashboard";

export const dynamic = "force-dynamic";

export default async function Home() {
  const [data, riskAssessmentData] = await Promise.all([loadComplianceData(), loadRiskAssessmentData()]);
  const initialRiskAssessmentRate = computeRiskAssessmentRate(riskAssessmentData);
  return <ComplianceDashboard initialData={data} initialRiskAssessmentRate={initialRiskAssessmentRate} />;
}
