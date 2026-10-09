'use strict';
const fs = require('fs');
const XLSX = require('xlsx');
const officeCrypto = require('officecrypto-tool');

// 다운로드 시 자동으로 걸리는 암호(나이스정보통신 매출자료, BOS 통합거래조회 등)
// 사용자가 저장 시 항상 이 비밀번호로 통일하기로 함
const DEFAULT_XLSX_PASSWORD = '1';
// 기본 비밀번호로 안 열리면 차례로 시도 (나이스 통합거래조회를 "01"로 저장한 경우가 있음)
const FALLBACK_XLSX_PASSWORDS = ['01'];

// 암호 걸린 엑셀(BOS 통합거래조회, 나이스정보통신 매출자료 등)도 자동으로 풀어서
// 워크북을 반환. 암호가 없는 평문 파일은 기존과 동일하게 그대로 읽음(하위 호환).
async function readWorkbookAuto(filePath, password = DEFAULT_XLSX_PASSWORD) {
  const buf = fs.readFileSync(filePath);

  if (!officeCrypto.isEncrypted(buf)) {
    return XLSX.readFile(filePath);
  }

  for (const pw of [password, ...FALLBACK_XLSX_PASSWORDS.filter(p => p !== password)]) {
    try {
      const decrypted = await officeCrypto.decrypt(buf, { password: pw });
      return XLSX.read(decrypted, { type: 'buffer' });
    } catch (_) { /* 다음 비밀번호 시도 */ }
  }
  throw new Error('비밀번호로 파일을 열 수 없습니다. 파일이 손상되었거나 비밀번호가 다릅니다.');
}

module.exports = { readWorkbookAuto, DEFAULT_XLSX_PASSWORD };
