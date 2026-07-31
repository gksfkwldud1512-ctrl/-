---
name: pptx-automation
description: Checklist and known-fixes for generating .pptx files with pptxgenjs (or similar from-scratch generators) so the output actually opens in real Microsoft PowerPoint, not just LibreOffice/python-pptx. Use before writing PPT-generation code and before declaring a PPT automation task done.
---

# PPT 자동화 체크리스트 (pptxgenjs 기반)

이 프로젝트(환경 KPI 보고서 등)에서 실제로 겪었던 "LibreOffice/python-pptx는 열리는데 진짜 PowerPoint는 거부"하는 문제들과 그 해결책을 정리한 것. 새로 PPT 생성 코드를 짜기 전에 먼저 읽을 것.

## 핵심 교훈: LibreOffice/python-pptx 통과는 검증이 아니다

두 도구 모두 zip의 central directory를 먼저 읽기 때문에 local-file-header 순서나 일부 스펙 위반에 관대하다. **실제 PowerPoint는 훨씬 깐깐하다.** 따라서:

- "LibreOffice에서 열림" / "python-pptx로 파싱 성공" = 검증 아님
- 검증은 **실제 PowerPoint로 열어보거나 사용자 확인**을 받아야만 유효함
- 자동화 스크립트로 zip 구조/XML/관계 그래프를 아무리 감사해도 이 문제는 못 잡는다 (OPC 스펙 자체는 위반이 아니기 때문)

## 진짜 원인은 대부분 이거였다: Microsoft Open XML SDK Validator로 자체 검증할 것

2026-07-29에 이 문제로 약 15번의 왕복(수정→배포→사용자가 실제 PowerPoint로 열어서 확인) 끝에 찾은 진짜 원인은 위의 zip 재정렬이 아니라 **`lineDataSymbolSize: 3.5`처럼 OOXML의 정수(byte) 전용 속성에 소수를 넣은 것**이었다 (`c:marker/c:size`는 `ST_MarkerSize`, unsigned byte 타입). `3.5`는 유효한 byte가 아니라서 `<c:size val="3.5"/>`가 그대로 생성됐고, 이건 LibreOffice/python-pptx 둘 다 무시하고 통과시키지만 실제 PowerPoint는 파싱 단계에서 하드하게 거부한다.

**이걸 훨씬 빨리 찾을 수 있었던 방법**: 이 컴퓨터에 `winget install Microsoft.DotNet.SDK.8`로 .NET SDK를 설치하고, `dotnet add package DocumentFormat.OpenXml`로 마이크로소프트의 공식 Open XML SDK를 받아서 `OpenXmlValidator`를 직접 돌리면 된다 — 이게 진짜 PowerPoint와 거의 동일한 스키마 검증기다:

```csharp
using DocumentFormat.OpenXml.Packaging;
using DocumentFormat.OpenXml.Validation;

using var doc = PresentationDocument.Open(path, false);
var validator = new OpenXmlValidator(DocumentFormat.OpenXml.FileFormatVersions.Microsoft365);
foreach (var e in validator.Validate(doc))
    Console.WriteLine($"{e.Description} | Part={e.Part?.Uri} | Path={e.Path?.XPath}");
```

**주의**: 에러가 0개가 아니어도 괜찮을 수 있다 — 실제로 정상적으로 열리는 파일도 아래 3가지 "무해한" 경고를 항상 띄운다(모두 pptxgenjs가 만드는 presentation.xml/line차트 구조의 사소한 순서 위반으로, 실제 PowerPoint가 관대하게 넘어감):
  - `presentation.xml`: `notesMasterIdLst`가 `notesSz`보다 뒤에 와야 하는데 앞에 옴
  - LINE 차트: `c:lineChart`에 `grouping`이 없어서 `varyColors`가 예상 밖의 위치
  - LINE 차트: `c:ser`에 `invertIfNegative`가 들어감(BAR 전용인데 LINE에도 붙음)

**따라서 판단 기준은 "에러 개수가 0인가"가 아니라 "타입/값 위반(Byte에 소수, 등) 같은 하드 에러가 있는가"다.** 알려진 무해한 3종류를 빼고 남는 게 있으면 그게 진짜 원인이다. Byte/정수 타입 속성(`lineDataSymbolSize` 등 `*Size` 계열 옵션들)에 정수가 아닌 값을 넣지 않았는지 항상 먼저 의심할 것.

**추가로 확인된 하드 에러 유형: `addText` 런(run) 배열에서 같은 문단(줄) 안에 서로 다른 포맷의 런 2개 이상.** `slide.addText([{text:"A", options:{color:"000000"}}, {text:"B", options:{color:"FF0000"}}], opts)`처럼 breakLine 없이(=같은 줄) 색상 등 포맷이 다른 런을 이어 붙이면, pptxgenjs가 그 문단의 `<a:pPr>`를 `<a:p>` 안 잘못된 위치에 끼워 넣어 "unexpected child element pPr" 스키마 위반이 난다(LibreOffice는 관대해서 통과, 실제 PowerPoint는 거부). **서로 다른 포맷의 런은 항상 각자 `breakLine: true`로 별도 문단이 되게 만들 것** — 같은 줄에 다른 색 텍스트를 섞어야 하면(예: "제목 (상태태그)") 상태 태그를 다음 줄로 내리는 등 레이아웃을 바꿔서 회피한다.

## 체크리스트 (코드 작성 전)

1. **콤보차트(배열 addChart) 절대 금지**
   `slide.addChart([...], opts)`처럼 여러 `{type, data, options}`를 배열로 넘기는 방식(막대+선 오버레이, 점선 스타일이 다른 두 선 등)은 생성 시 에러 없이 파일이 만들어지지만 실제 PowerPoint가 "내용에 문제가 있습니다"로 거부한다. 대안:
   - 같은 차트 타입 안에서 시리즈 여러 개 (색상만 다르게)
   - 목표선처럼 다른 타입이 꼭 필요하면 차트 아래 비교 표로 대체
   - 그래도 꼭 필요하면 아래 "템플릿 주입" 방식 사용

2. **zip 엔트리 순서 재정렬 (가장 흔한 실제 원인)**
   pptxgenjs(JSZip)가 만드는 zip은 `[Content_Types].xml`, `_rels/.rels`가 파일 앞쪽이 아니라 한참 뒤(추가 순서상)에 들어간다. OPC 스펙 위반은 아니지만 실제 PowerPoint 리더가 이 순서에 민감하다. 생성 직후 아래처럼 재포장할 것:

   ```ts
   import JSZip from "jszip";

   async function reorderForPowerPoint(buffer: Buffer): Promise<Buffer> {
     const zip = await JSZip.loadAsync(buffer);
     const priority = ["[Content_Types].xml", "_rels/.rels"];
     const allPaths = Object.keys(zip.files).filter((p) => !zip.files[p].dir);
     const orderedPaths = [
       ...priority.filter((p) => allPaths.includes(p)),
       ...allPaths.filter((p) => !priority.includes(p)),
     ];
     const out = new JSZip();
     for (const p of orderedPaths) {
       out.file(p, await zip.files[p].async("nodebuffer"), { createFolders: false });
     }
     return out.generateAsync({ type: "nodebuffer", compression: "DEFLATE" });
   }
   ```

   실제 구현 참고: [report.ts](../../../환경/대기방지시설 자동화/webapp/lib/kpi/report.ts) 의 `reorderForPowerPoint()`.

3. **다운로드 응답에 명시적 `Content-Length` 헤더**
   chunked로 서빙하면 사내 프록시 등에서 손상될 가능성이 있다 (방어적 조치, 확정 원인은 아니었음). API route에서 버퍼 길이를 명시적으로 헤더에 넣을 것.

4. **pptxgenjs 자체 버그 패치 유지**
   `patch-package`로 다음 두 개를 고정해둔 상태 (postinstall에서 자동 적용됨, 프로젝트에 `patches/` 디렉터리 존재 여부 확인):
   - BAR/LINE 차트에서 3번째 `<c:axId>`가 불필요하게 남는 버그 (BAR3D에만 적용돼야 함)
   - 슬라이드마다 `[Content_Types].xml`에 `slideMaster{N}.xml` 오버라이드가 중복 생성되는 버그
   이 패치들은 근본 원인은 아니었지만 그 자체로 스펙 위반이라 유지할 가치가 있다.

5. **정말 콤보/오버레이 차트가 필요하면 템플릿 주입 방식으로 전환**
   pptxgenjs로 처음부터 생성하지 말고, 실제 PowerPoint에서 미리 만들어둔 차트가 있는 `.pptx`를 템플릿으로 삼아 데이터만 갈아끼우는 방식(`pptx-automizer` 등)을 검토. 이러면 차트 XML 자체를 PowerPoint가 저장한 걸 재사용하게 되어 이런 클래스의 문제를 원천 차단한다.

## 디버깅 순서 (파일이 PowerPoint에서 안 열릴 때)

새 증상이 나오면 이 순서로 확인 — **1번을 제일 먼저, 사용자에게 매번 다시 열어보라고 하기 전에**:

1. **OpenXmlValidator를 직접 돌려서 하드 에러(타입/값 위반)가 있는지 확인한다** (위 섹션 참고). 사용자에게 열어봐 달라고 요청하는 건 이걸로 못 잡는 진짜 애매한 경우에만.
2. LibreOffice/python-pptx에서는 열리는가? → 열린다면 스펙 위반이 아니라 PowerPoint 리더 특유의 까다로움일 가능성이 높음 (하지만 이것만으로 "정상"이라고 결론 내리지 말 것 — 1번이 먼저)
3. zip 엔트리 순서 확인 (`python -c "import zipfile; print(zipfile.ZipFile('x.pptx').namelist()[:5])"` 등으로 `[Content_Types].xml` 위치 확인)
4. 최소 재현 파일로 좁히기: 차트/표/이미지를 하나씩 빼면서 최소 슬라이드 1장짜리 파일을 만들어 어느 요소가 문제인지 이분 탐색 — 단, OpenXmlValidator가 있으면 이 단계는 거의 필요 없다

## 완료 선언 기준

PPT 생성 기능을 "완료"로 보고하기 전에:
- [ ] **OpenXmlValidator로 검증했고, 알려진 무해한 3종 경고를 제외하면 에러가 0개다**
- [ ] 실제 PowerPoint(데스크톱 앱)로 직접 열어봤거나, 사용자가 열어서 확인했다
- [ ] 콤보차트(배열 addChart)를 쓰지 않았다
- [ ] zip 재정렬(`reorderForPowerPoint`) 후처리를 거쳤다
- [ ] LibreOffice/python-pptx 통과만으로 완료라고 말하지 않았다
