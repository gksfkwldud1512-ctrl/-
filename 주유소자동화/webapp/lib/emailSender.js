'use strict';
const nodemailer = require('nodemailer');
const path = require('path');

async function sendEmail(settings, toEmail, vendorName, filePath, month) {
  const transporter = nodemailer.createTransport({
    host: 'smtp.naver.com',
    port: 465,
    secure: true,
    auth: {
      user: settings.smtpUser,
      pass: settings.smtpPass,
    },
  });

  const mon = month || '5';
  const subject = `[미소주유소] 2026년 ${mon}월 거래명세서 - ${vendorName}`;
  const text = [
    `안녕하세요, ${vendorName} 담당자님.`,
    '',
    '(주)미소주유소 거래명세서를 첨부파일로 보내드립니다.',
    '확인 후 문의사항이 있으시면 연락 주시기 바랍니다.',
    '',
    '감사합니다.',
    '(주)미소주유소 드림',
  ].join('\n');

  await transporter.sendMail({
    from: `"미소주유소" <${settings.smtpUser}>`,
    to: toEmail,
    subject,
    text,
    attachments: [{
      filename: path.basename(filePath),
      path: filePath,
    }],
  });
}

module.exports = { sendEmail };
