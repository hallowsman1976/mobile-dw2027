// หลังบ้านจำลองสำหรับพัฒนาหน้าบ้านบนเครื่อง: ใช้ตัวรับคำสั่งตัวจริงกับตัวกลางปลอมในหน่วยความจำ
// ข้อมูลหายเมื่อปิดเซิร์ฟเวอร์ ห้ามใช้กับข้อมูลจริง
import { createHash } from 'node:crypto';
import { createServer } from 'node:http';
import { createFakeWorld } from '../src/adapters/fake';
import { handleRequestBody } from '../src/app/handle';
import { bootstrapFirstAdministrator } from '../src/app/staff';

const PORT = Number(process.env.PORT ?? 8787);

const world = createFakeWorld();
world.deps.clock.now = () => new Date();
world.deps.random.uuid = () => crypto.randomUUID();
world.lineTokens.set('dev-line-token', { userId: 'U-dev', displayName: 'สมาชิกทดลอง' });
// หลังบ้านจริงแปลงไฟล์ผ่าน Google Drive ส่วนตัวจำลองอ่านได้เฉพาะ .csv
world.deps.files.readSpreadsheetRows = (fileName, contentBase64) =>
  fileName.toLowerCase().endsWith('.csv')
    ? parseCsv(Buffer.from(contentBase64, 'base64').toString('utf8').trimStart() /* ตัด BOM ที่ Excel ใส่ไว้ต้นไฟล์ */)
    : null;
// สมาชิกทดลอง: ผูกบัญชีด้วยรหัสสมาชิก 123 และเลขบัตร 1101700230708
world.depositAccounts.push(
  ...[
    { seq: '1', accountNumber: '001-1-00123-1', accountType: 'savings' as const },
    { seq: '2', accountNumber: '002-1-00123-5', accountType: 'specialSavings' as const },
  ].map((a) => ({
    ...a,
    memberCode: '00123',
    nationalId: '1101700230708',
    accountName: 'นายสมชาย ใจดี',
    lastContactDate: '15/03/2569',
    importedAt: new Date().toISOString(),
  })),
);
bootstrapFirstAdministrator(
  { username: 'admin', fullName: 'ผู้ดูแลระบบ ทดลอง', password: 'admin-password-1' },
  world.deps,
);
// ผู้ดูแลระบบทดลองมีทุกบทบาท เพื่อทดลองหน้าจอได้ครบ
world.staff.get('admin')!.roles = ['reviewer', 'approver', 'systemAdministrator'];
// กลุ่ม LINE ทดลองที่ "เชิญ" LINE OA เข้าไปแล้ว และข้อความ LINE แสดงใน console แทนการส่งจริง
const devGroupId = `C${'0'.repeat(32)}`;
world.lineGroups.push({ groupId: devGroupId, groupName: 'เจ้าหน้าที่สหกรณ์ (ทดลอง)', joinedAt: new Date().toISOString() });
world.deps.messenger.pushText = (to, text) => console.log(`[LINE → ${to}]\n${text}\n`);
// SlipOK จำลอง: ทุกสลิปคือการโอน 1,500 บาทเข้าบัญชีสหกรณ์ 987-6-54321-0 เมื่อ 10 นาทีก่อนอัปโหลดครั้งแรก
// สลิปไฟล์เดียวกันได้เลขอ้างอิงเดียวกัน จึงทดลองสลิปซ้ำได้
world.settings.set('coopReceivingAccount', '9876543210');
const devSlipTimes = new Map<string, string>();
world.deps.slips.read = (imageBase64) => {
  const transRef = `DEV${createHash('sha256').update(imageBase64).digest('hex').slice(0, 12).toUpperCase()}`;
  if (!devSlipTimes.has(transRef)) devSlipTimes.set(transRef, new Date(Date.now() - 10 * 60_000).toISOString());
  return {
    transRef,
    transferredAt: devSlipTimes.get(transRef)!,
    amount: 1500,
    receiverBankCode: '006',
    receiverAccount: 'xxx-x-x4321-x',
    receiverName: 'สหกรณ์ออมทรัพย์สาธารณสุขจังหวัดมุกดาหาร จำกัด',
  };
};
// PDF ใบถอนเงินจำลอง: หลังบ้านจริงสร้างจาก Google Docs ส่วนตัวจำลองสร้าง PDF ตัวอักษรอังกฤษเท่านั้น
world.deps.files.renderWithdrawalPdf = (fileName, texts) => {
  const lines = [
    'DEV PDF - the real system renders the Google Docs template in Thai',
    ...['requestNumber', 'memberCode', 'accountNumber', 'amount', 'payoutAccountNumber', 'payoutBranch', 'contactPhone', 'processingDate'].map(
      (key) => `${key}: ${texts[key] ?? ''}`,
    ),
  ];
  return world.deps.files.saveFile('pdfs', fileName, 'application/pdf', devPdf(lines));
};

function devPdf(lines: string[]): string {
  const ascii = (s: string) => s.replace(/[^\x20-\x7e]/g, '?').replace(/[()\\]/g, '\\$&');
  const stream = `BT /F1 14 Tf 50 780 Td 20 TL ${lines.map((l) => `(${ascii(l)}) Tj T*`).join(' ')} ET`;
  const objects = [
    '<< /Type /Catalog /Pages 2 0 R >>',
    '<< /Type /Pages /Kids [3 0 R] /Count 1 >>',
    '<< /Type /Page /Parent 2 0 R /MediaBox [0 0 595 842] /Contents 4 0 R /Resources << /Font << /F1 5 0 R >> >> >>',
    `<< /Length ${stream.length} >>\nstream\n${stream}\nendstream`,
    '<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica >>',
  ];
  let pdf = '%PDF-1.4\n';
  const offsets = objects.map((body, i) => {
    const offset = pdf.length;
    pdf += `${i + 1} 0 obj\n${body}\nendobj\n`;
    return offset;
  });
  const xref = pdf.length;
  pdf += `xref\n0 ${objects.length + 1}\n0000000000 65535 f \n${offsets.map((o) => `${String(o).padStart(10, '0')} 00000 n \n`).join('')}`;
  pdf += `trailer\n<< /Size ${objects.length + 1} /Root 1 0 R >>\nstartxref\n${xref}\n%%EOF`;
  return Buffer.from(pdf, 'latin1').toString('base64');
}
// หลังบ้านจริงสร้าง .xlsx ผ่าน Google Sheets ส่วนตัวจำลองสร้าง .csv ที่รวมทุกแท็บแทน
world.deps.files.buildSpreadsheet = (fileName, sheets) => {
  const csv = sheets
    .flatMap((sheet) => [[`# ${sheet.name}`], ...sheet.rows, []])
    .map((row) => row.map((cell) => `"${String(cell).replace(/"/g, '""')}"`).join(','))
    .join('\r\n');
  return {
    fileName: fileName.replace(/\.xlsx$/, '.csv'),
    mimeType: 'text/csv',
    contentBase64: Buffer.from(String.fromCharCode(0xfeff) + csv, 'utf8').toString('base64'),
  };
};

function parseCsv(text: string): string[][] {
  const rows: string[][] = [];
  let row: string[] = [];
  let cell = '';
  let quoted = false;
  for (let i = 0; i < text.length; i++) {
    const char = text[i];
    if (quoted) {
      if (char === '"' && text[i + 1] === '"') {
        cell += '"';
        i++;
      } else if (char === '"') {
        quoted = false;
      } else {
        cell += char;
      }
    } else if (char === '"') {
      quoted = true;
    } else if (char === ',') {
      row.push(cell);
      cell = '';
    } else if (char === '\n' || char === '\r') {
      if (char === '\r' && text[i + 1] === '\n') i++;
      row.push(cell);
      rows.push(row);
      row = [];
      cell = '';
    } else {
      cell += char;
    }
  }
  if (cell || row.length) rows.push([...row, cell]);
  return rows;
}

createServer((req, res) => {
  res.setHeader('Access-Control-Allow-Origin', '*');
  if (req.method !== 'POST') {
    res.writeHead(200, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify({ ok: true, data: { service: 'dev-api' } }));
    return;
  }
  let body = '';
  req.setEncoding('utf8');
  req.on('data', (chunk) => (body += chunk));
  req.on('end', () => {
    const result = handleRequestBody(body, world.deps);
    res.writeHead(200, { 'Content-Type': 'application/json; charset=utf-8' });
    res.end(JSON.stringify(result));
  });
}).listen(PORT, () => {
  console.log(`dev API: http://localhost:${PORT}`);
  console.log('เจ้าหน้าที่: admin / admin-password-1');
  console.log('สมาชิก (LIFF token): dev-line-token');
});
