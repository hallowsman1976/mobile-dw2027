// หลังบ้านจำลองสำหรับพัฒนาหน้าบ้านบนเครื่อง: ใช้ตัวรับคำสั่งตัวจริงกับตัวกลางปลอมในหน่วยความจำ
// ข้อมูลหายเมื่อปิดเซิร์ฟเวอร์ ห้ามใช้กับข้อมูลจริง
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
