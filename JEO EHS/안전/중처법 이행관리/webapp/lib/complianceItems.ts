// 중대재해 처벌 등에 관한 법률 시행령(중대산업재해, 근로자 대상)에 규정된 법정 이행항목 13개.
// 국가법령정보센터 시행령 원문(제4조·제5조)을 직접 확인해서 그대로 옮긴 것 — 법 개정 전까지 고정값.
// 중대시민재해(원료·제조물 관련, 제8~9조)는 이번 기능 범위에서 제외한다(사용자 확정).
export type ComplianceCategory = {
  id: string;
  article: string;
  title: string;
  summary: string;
  checkCycle: string | null;
  evidenceExamples: string[];
  /** false면 "해당없음"으로 표시하고 이행율 집계·증빙 요구 대상에서 제외한다. */
  applicable: boolean;
};

export const COMPLIANCE_CATEGORIES: ComplianceCategory[] = [
  {
    id: "art4-1",
    article: "시행령 제4조 1호",
    title: "안전보건 목표·경영방침 수립",
    summary: "사업 또는 사업장의 안전·보건에 관한 목표와 경영방침을 설정할 것.",
    checkCycle: null,
    evidenceExamples: ["안전보건 목표 문서", "경영방침 선언문", "종사자 협의 기록"],
    applicable: true,
  },
  {
    id: "art4-2",
    article: "시행령 제4조 2호",
    title: "안전보건 전담 조직 설치",
    summary:
      "산업안전보건법 제17~19조·제22조에 따라 두어야 하는 인력이 총 3명 이상이고, 상시근로자 500명 이상이거나 시공능력 순위 200위 이내 건설사업자인 경우 안전·보건 업무를 총괄·관리하는 전담 조직을 둘 것.",
    checkCycle: null,
    evidenceExamples: ["조직도·직책 문서", "전담 조직 인원 현황", "업무분장 규정"],
    // 우리 사업장은 상시근로자 500명 미만 — 해당없음(목록에는 남겨두되 이행율 집계에서 제외).
    applicable: false,
  },
  {
    id: "art4-3",
    article: "시행령 제4조 3호",
    title: "유해·위험요인 확인 및 개선",
    summary:
      "사업장 특성에 따른 유해·위험요인을 확인해 개선하는 업무절차를 마련하고, 반기 1회 이상 점검할 것(산업안전보건법 제36조 위험성평가 절차로 갈음 가능).",
    checkCycle: "반기 1회 이상",
    evidenceExamples: ["점검절차 매뉴얼", "반기 점검기록·결과보고서", "위험성평가 문서"],
    applicable: true,
  },
  {
    id: "art4-4",
    article: "시행령 제4조 4호",
    title: "안전보건 예산 편성 및 집행",
    summary:
      "재해 예방에 필요한 인력·시설·장비 구비(가), 유해·위험요인 개선(나), 그 밖에 고용노동부장관 고시사항(다)을 이행하는 데 필요한 예산을 편성하고 집행할 것.",
    checkCycle: null,
    evidenceExamples: ["예산 편성계획서", "집행내역서·영수증", "인력/시설/장비 구비 증빙"],
    applicable: true,
  },
  {
    id: "art4-5",
    article: "시행령 제4조 5호",
    title: "안전보건관리책임자등 권한·평가",
    summary:
      "안전보건관리책임자·관리감독자·안전보건총괄책임자에게 업무 수행에 필요한 권한과 예산을 주고, 반기 1회 이상 평가·관리할 것.",
    checkCycle: "반기 1회 이상 평가",
    evidenceExamples: ["업무권한 위임장", "예산배정 기록", "평가기준·평가결과"],
    applicable: true,
  },
  {
    id: "art4-6",
    article: "시행령 제4조 6호",
    title: "안전·보건 인력 배치",
    summary: "산업안전보건법에 따라 정해진 수 이상의 안전관리자·보건관리자·안전보건관리담당자·산업보건의를 배치할 것.",
    checkCycle: null,
    evidenceExamples: ["안전·보건관리자 선임 현황", "자격증 사본", "선임 공고문"],
    applicable: true,
  },
  {
    id: "art4-7",
    article: "시행령 제4조 7호",
    title: "종사자 의견 청취 절차",
    summary:
      "안전·보건에 관한 종사자 의견을 듣는 절차를 마련하고, 그 절차에 따라 의견을 들어 개선방안을 이행하는지 반기 1회 이상 점검할 것(산업안전보건위원회·협의체로 갈음 가능).",
    checkCycle: "반기 1회 이상",
    evidenceExamples: ["안전보건위원회·협의체 회의록", "작업 전 미팅 기록", "의견 제출·반영 현황"],
    applicable: true,
  },
  {
    id: "art4-8",
    article: "시행령 제4조 8호",
    title: "중대산업재해 대응 매뉴얼",
    summary:
      "중대산업재해 발생·급박한 위험 시 작업중지·대피·위험요인 제거(가), 구호조치(나), 추가 피해방지 조치(다)에 관한 매뉴얼을 마련하고 반기 1회 이상 점검할 것.",
    checkCycle: "반기 1회 이상",
    evidenceExamples: ["재해대응 매뉴얼 문서", "대피조치 계획", "위험요인별 대책서"],
    applicable: true,
  },
  {
    id: "art4-9",
    article: "시행령 제4조 9호",
    title: "도급·용역·위탁 시 안전보건 확보",
    summary:
      "제3자에게 도급·용역·위탁 시 수급업체의 안전보건 확보를 위한 평가기준·절차(가), 관리비용 기준(나), 건설·조선업의 공사·건조기간 기준(다)을 마련하고 반기 1회 이상 점검할 것.",
    checkCycle: "반기 1회 이상",
    evidenceExamples: ["협력사 평가기준·절차 문서", "관리비용 기준 규정", "반기 점검기록"],
    applicable: true,
  },
  {
    id: "art5-1",
    article: "시행령 제5조 2항 1호",
    title: "안전·보건 관계법령 의무이행 점검",
    summary: "사업장에 적용되는 안전·보건 관계법령상 의무 이행 여부를 반기 1회 이상 점검(위탁 가능)하고, 직접 점검하지 않은 경우 결과를 보고받을 것.",
    checkCycle: "반기 1회 이상",
    evidenceExamples: ["점검계획서·점검표", "점검결과 보고서(위탁점검 시 결과통보서)"],
    applicable: true,
  },
  {
    id: "art5-2",
    article: "시행령 제5조 2항 2호",
    title: "관계법령 미이행 확인 시 조치",
    summary: "점검·보고 결과 안전·보건 관계법령상 의무가 이행되지 않은 사실이 확인되면 인력 배치·예산 추가 편성·집행 등 필요한 조치를 할 것.",
    checkCycle: null,
    evidenceExamples: ["시정조치 내역", "추가 예산·인력 배정 기록"],
    applicable: true,
  },
  {
    id: "art5-3",
    article: "시행령 제5조 2항 3호",
    title: "유해·위험작업 안전보건교육 점검",
    summary: "의무적으로 실시해야 하는 유해·위험 작업에 관한 안전·보건교육이 실시되었는지 반기 1회 이상 점검하고, 직접 점검하지 않은 경우 결과를 보고받을 것.",
    checkCycle: "반기 1회 이상",
    evidenceExamples: ["교육계획서", "점검기록", "교육 이수증·출석부"],
    applicable: true,
  },
  {
    id: "art5-4",
    article: "시행령 제5조 2항 4호",
    title: "미실시 교육에 대한 조치",
    summary: "점검·보고 결과 실시되지 않은 교육이 확인되면 지체 없이 이행 지시, 예산 확보 등 교육 실시에 필요한 조치를 할 것.",
    checkCycle: null,
    evidenceExamples: ["재교육 실시 지시 공문", "추가 예산확보 기록"],
    applicable: true,
  },
];

export function getComplianceCategory(id: string): ComplianceCategory | undefined {
  return COMPLIANCE_CATEGORIES.find((c) => c.id === id);
}
