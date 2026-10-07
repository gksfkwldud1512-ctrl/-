/**
 * 일부 MSDS PDF는 볼드체를 "같은 글자(구)를 여러 번 겹쳐 그리는" 방식으로 구현한다
 * (예: "노출방지" 라벨이 "노출방지노출방지노출방지노출방지노출방지"처럼 5회 반복 렌더링됨).
 * 실제 화면에서는 겹쳐 보여 정상으로 보이지만, PDF 텍스트 레이어를 그대로 추출하면
 * 반복 문자열이 그대로 딸려 나온다. 표시용 원문 추출(예: 8장 보호구)에서 이를 제거한다.
 *
 * 숫자/기호로만 이루어진 토큰(예: 함유량 "1010", 날짜)은 실수로 뭉개지지 않도록 건드리지 않는다.
 */

const LETTER_RE = /[가-힣a-zA-Z]/;
const HANGUL_OR_LATIN_CHAR_RE = /^[가-힣a-zA-Z]$/;

/** 문자열 하나에서 "N글자 단위가 연속으로 2회 이상 반복되는" 구간을 한 번으로 접는다. */
function collapseRepeatedRunsInLine(text: string): string {
  let out = "";
  let i = 0;
  const n = text.length;

  while (i < n) {
    let collapsed = false;

    // 단위 길이 1은 한글/영문 단일 글자가 3회 이상 연속될 때만(우연의 일치 방지를 위해 더 엄격하게).
    const single = text[i];
    if (HANGUL_OR_LATIN_CHAR_RE.test(single)) {
      let repeats = 1;
      while (i + repeats < n && text[i + repeats] === single) repeats++;
      if (repeats >= 3) {
        out += single;
        i += repeats;
        collapsed = true;
      }
    }

    if (!collapsed) {
      for (let unitLen = 2; unitLen <= 10 && i + unitLen * 2 <= n; unitLen++) {
        const unit = text.slice(i, i + unitLen);
        if (!LETTER_RE.test(unit)) continue;
        let repeats = 1;
        while (text.slice(i + repeats * unitLen, i + (repeats + 1) * unitLen) === unit) repeats++;
        if (repeats >= 2) {
          out += unit;
          i += repeats * unitLen;
          collapsed = true;
          break;
        }
      }
    }

    if (!collapsed) {
      out += text[i];
      i++;
    }
  }
  return out;
}

/** 여러 줄로 된 텍스트 블록 전체에 반복 제거를 적용한다(빈 줄/공백은 그대로 둠). */
export function dedupeRepeatedRuns(text: string): string {
  return text
    .split("\n")
    .map((line) => (line.trim() === "" ? line : collapseRepeatedRunsInLine(line)))
    .join("\n");
}
