# 월별 카드 대사 분석 보고서 (BOS ↔ 나이스 + 이지샵)

2026-09 분석(`~/Downloads/2026년09월_카드대사_분석(BOS_나이스).xlsx`)에 쓴 스크립트.

## 사용법
1. 작업 폴더(예: `C:/temp/recon`)에 `in/` 폴더를 만들고 넣기
   - `in/bos.xlsx` : BOS 판매전표 상세조회 (해당 월)
   - `in/nice_dec.xlsx` : 나이스 통합거래조회 (암호 해제본 — 비밀번호 01 또는 1)
2. 이지샵 자료는 `data/daily/YYYY-MM-*.json`의 cardSources.easyshop 사용 (`analyze.js`의 `'2026-09'` 월 문자열 수정)
3. 실행 (webapp 폴더에서)
   ```
   node scripts/card-recon-report/report.js "<webapp 경로>" "<작업 폴더>" "<출력 xlsx 경로>"
   ```
   `report.js`는 같은 폴더의 `analyze.js`·`load.js`를 `<작업 폴더>`에서 require하므로 세 파일을 작업 폴더에 함께 복사해서 실행.

## 시트
요약 / 청구·입금없음 분류 / 결제누락·금액불일치 / 입금일없는카드 / 나이스에만있음 / BOS에만있음(전체)

## 업체 분류 상수 (report.js)
- SUBSIDY: 유가보조금 카드 업체 (data/statement_nonfuel_only.json과 같은 업체)
- MONTHLY: 법인 주유카드 + 월말 일괄결제 업체 (풀무원 8470, 풀무원외상6576)
