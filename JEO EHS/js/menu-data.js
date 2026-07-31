// EH&S 포털 메뉴 구성 데이터
//
// [배포된 항목 추가] 아래 categories 안의 해당 대분류 items 배열에
// { name, url, flow } 형태로 한 줄 추가하면 사이드바/홈카드/종합화면에 동시 반영됩니다.
// flow는 종합화면(입력→처리→출력 카드)에 쓰이며 생략 가능합니다.
//
// [아직 배포 전인 항목 추가] items 대신 같은 카테고리의 plannedItems 배열에
// { name, flow }(url 없이) 형태로 추가하면 종합화면에는 "설계 단계" 카드로 보이되
// 사이드바/홈카드에는 나타나지 않습니다. 나중에 배포되면 items로 옮기고 url만 채우면 됩니다.
const EHS_MENU = [
  {
    key: "safety",
    label: "안전",
    icon: "🦺",
    items: [
      {
        name: "중처법 이행관리",
        url: "https://jungcheobub-webapp.vercel.app",
        flow: {
          stack: "Next.js · Vercel Blob(비공개)",
          statusTone: "live",
          statusLabel: "운영중",
          access: "공개",
          input: ["법정 이행항목별 세부 이행점검 항목 입력", "증빙 파일(PDF/이미지) 첨부"],
          processing: [
            "중대재해처벌법 시행령 제4·5조(중대산업재해) 법정 13개 항목 고정 정의 (lib/complianceItems.ts)",
            "증빙 파일 1개 이상 첨부돼야만 완료 처리(서버에서 강제) — API에서 재검증",
            "항목별 이행율 = 완료 세부항목/전체, 종합 이행율 = 적용대상 항목 단순평균 (lib/complianceData.ts)"
          ],
          output: ["항목별 원형(도넛) 진행률 차트", "종합 이행율 게이지", "반기점검 기한 초과 경고 배지"]
        }
      }
    ],
    plannedItems: [
      {
        name: "위험성평가",
        flow: { statusTone: "design", statusLabel: "계획됨 — 아직 착수 전" }
      },
      {
        name: "안전검사",
        flow: { statusTone: "design", statusLabel: "계획됨 — 아직 착수 전" }
      },
      {
        name: "안전교육",
        flow: { statusTone: "design", statusLabel: "계획됨 — 아직 착수 전" }
      }
    ]
  },
  {
    key: "health",
    label: "보건",
    icon: "🩺",
    items: [
      {
        name: "화학물질관리",
        url: "https://webapp-one-eta-66.vercel.app",
        flow: {
          stack: "Next.js · Neon Postgres · Vercel Blob",
          statusTone: "live",
          statusLabel: "운영중",
          access: "공개",
          input: ["MSDS PDF 업로드"],
          processing: [
            "pdfjs-dist 좌표기반 텍스트 추출 (lib/parsing/pdfText.ts)",
            "구성성분표 파싱 — CAS번호 앵커링 (section3.ts)",
            "검토화면에서 사용자가 수정",
            "확정 시 기준물질 DB와 CAS 매칭 (repo.ts: confirmMixture)"
          ],
          output: ["유해화학물질 해당여부 판정", "성분별 상세", "원본 PDF 다운로드"]
        }
      },
      {
        name: "배치전검진",
        url: "https://webapp-one-eta-66.vercel.app/placement-exam",
        // 비밀번호 로그인 쿠키가 iframe(제3자 쿠키)에서 브라우저에 의해 차단되어 로그인이
        // 계속 풀리는 문제 때문에, 이 항목만 새 탭에서 열도록 한다.
        openInNewTab: true,
        flow: {
          stack: "Next.js · Neon Postgres · Vercel Blob",
          statusTone: "live",
          statusLabel: "운영중",
          access: "비밀번호 보호",
          input: ["배치전(1차) 건강진단결과통보서 PDF 업로드"],
          processing: [
            "좌표기반 텍스트 라인 추출",
            "정규식 파싱 — 성명/주민번호/부서/검진일/차기검진일/유해인자별 건강구분 (placementExam.ts)",
            "검토화면에서 사용자가 수정",
            "확정 저장"
          ],
          output: [
            "성명·부서·검진일·건강구분(대표등급) 목록",
            "상세: 유해인자별 등급 전체 + 소견 전문"
          ]
        }
      }
    ],
    plannedItems: [
      {
        name: "일반특수검진",
        flow: { statusTone: "design", statusLabel: "계획됨 — 아직 착수 전" }
      },
      {
        name: "종합검진",
        flow: { statusTone: "design", statusLabel: "계획됨 — 아직 착수 전" }
      }
    ]
  },
  {
    key: "environment",
    label: "환경",
    icon: "🌱",
    items: [
      {
        name: "대기방지시설 운영기록부",
        url: "https://daegi-bangji-webapp.vercel.app",
        flow: {
          stack: "Next.js · localStorage · 상태없는 API 라우트",
          statusTone: "live",
          statusLabel: "운영중",
          access: "공개",
          input: [
            "연/월 선택",
            "월간 근무일 캘린더 클릭 (휴무/보일러1호기/2호기)",
            "설비별(8개) 전력계 첫날·마지막날 값"
          ],
          processing: [
            "설비 10개 고정 메타데이터 (lib/facilities.ts)",
            "근무일 기준 가동시간·전력검침량 안분계산 (lib/calc.ts)",
            "API 라우트가 요청받은 데이터로 즉시 엑셀 생성 (/api/xlsx/*)"
          ],
          output: [
            "SEMS 업로드용 \"배출구가동시간목록양식\" xlsx 다운로드",
            "SEMS 업로드용 \"시설운전사항목록양식\" xlsx 다운로드",
            "서버 저장 없음 — 다운로드 즉시 종료"
          ]
        }
      },
      {
        name: "안전환경 KPI",
        url: "https://daegi-bangji-webapp.vercel.app/kpi",
        flow: {
          stack: "Next.js · Vercel Blob(비공개)",
          statusTone: "live",
          statusLabel: "운영중",
          access: "공개 (매출 데이터 포함 — 추후 보호 검토 필요)",
          input: ["SPHERA/E MASTER DETAILS 내보내기 파일(.xlsx) 업로드"],
          processing: [
            "MEASURES LEVEL0/LEVEL1로 에너지·폐기물·용수·Scope1·Scope2·매출 식별 (parseDetails.ts)",
            "월별 합산 후 비공개 Blob에 최신본으로 저장(업로드마다 전체 대체)",
            "강도 = 월별 사용량 ÷ (월별 매출액/100만) 계산 (intensity.ts)"
          ],
          output: [
            "에너지·폐기물·용수 강도 표 3종 + Scope1·Scope2 배출량 표",
            "에너지·폐기물·용수 항목별 월별 사용량 표"
          ]
        }
      }
    ],
    plannedItems: [
      {
        name: "시설 목록",
        flow: { statusTone: "design", statusLabel: "계획됨 — 아직 착수 전" }
      }
    ]
  },
  {
    key: "meeting",
    label: "회의자료 자동화",
    icon: "📋",
    items: [
      {
        name: "자동화생성",
        url: "https://meeting-report-webapp.vercel.app",
        flow: {
          stack: "Next.js · Vercel Blob(비공개) · Vercel AI Gateway",
          statusTone: "live",
          statusLabel: "운영중",
          access: "공개",
          input: ["신규 이슈 7개 + 진행중인 업무 7개(제목/설명, 한국어)"],
          processing: [
            "AI Gateway로 한국어 → 영어 일괄 번역 (lib/translate.ts)",
            "회사 실제 회의자료 양식(EHS Weekly meeting)에서 로고·색상·좌표 그대로 추출해 재현 (lib/pptBuilder.ts)",
            "표지 → 개요(신규이슈/진행중업무 목록) → 진행중인 업무 항목별 상세 슬라이드 자동 생성"
          ],
          output: ["EHS Weekly Meeting 양식 영어 PPT 다운로드"]
        }
      }
    ],
    plannedItems: []
  }
];
