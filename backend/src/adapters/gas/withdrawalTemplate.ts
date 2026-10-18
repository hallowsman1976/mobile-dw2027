// Google Docs ต้นแบบใบถอนเงิน และการสร้าง PDF จากต้นแบบ
// scope drive.file เปิดได้เฉพาะไฟล์ที่ระบบสร้าง ระบบจึงสร้างต้นแบบเอง แล้วให้เจ้าหน้าที่แก้รูปแบบใน Google Docs

const TEMPLATE_PROPERTY = 'WITHDRAWAL_TEMPLATE_DOC_ID';
const SIGNATURE_WIDTH = 170;

type Drive = GoogleAppsScript.Drive;

/** คืน ID ของต้นแบบ สร้างต้นแบบชั่วคราวในโฟลเดอร์ของระบบถ้ายังไม่มีหรือถูกลบ */
export function ensureWithdrawalTemplate(drive: Drive, folderId: string): string {
  const props = PropertiesService.getScriptProperties();
  const existing = props.getProperty(TEMPLATE_PROPERTY);
  if (existing) {
    try {
      if (!drive.Files.get(existing, { fields: 'trashed' }).trashed) return existing;
    } catch {
      // ถูกลบไปแล้ว สร้างใหม่ด้านล่าง
    }
  }
  const created = drive.Files.create({
    name: 'ต้นแบบใบถอนเงิน (แก้รูปแบบได้)',
    mimeType: 'application/vnd.google-apps.document',
    parents: [folderId],
  });
  if (!created.id) throw new Error('Could not create withdrawal template');
  buildDefaultTemplate(DocumentApp.openById(created.id));
  props.setProperty(TEMPLATE_PROPERTY, created.id);
  return created.id;
}

/** คัดลอกต้นแบบ แทนตัวแปร แล้ว export เป็น PDF คืนเนื้อ PDF แบบ base64 */
export function renderTemplateToPdf(
  drive: Drive,
  templateId: string,
  workFolderId: string,
  texts: Record<string, string>,
  images: Record<string, string>,
): string {
  const copy = drive.Files.copy({ name: `ชั่วคราว ${new Date().toISOString()}`, parents: [workFolderId] }, templateId);
  if (!copy.id) throw new Error('Could not copy withdrawal template');
  try {
    const doc = DocumentApp.openById(copy.id);
    const sections = [doc.getBody(), doc.getHeader(), doc.getFooter()].filter(
      (section): section is GoogleAppsScript.Document.Body => Boolean(section),
    );
    for (const section of sections) {
      for (const [key, value] of Object.entries(texts)) {
        // replaceText ใช้ regex ของ Java ต้อง escape $ และ \ ในข้อความที่แทน
        section.replaceText(`\\{\\{${key}\\}\\}`, value.replace(/[\\$]/g, '\\$&'));
      }
    }
    const body = doc.getBody();
    for (const [key, base64] of Object.entries(images)) {
      insertImages(body, key, Utilities.newBlob(Utilities.base64Decode(base64), 'image/png', key));
    }
    doc.saveAndClose();

    const res = UrlFetchApp.fetch(
      `https://www.googleapis.com/drive/v3/files/${encodeURIComponent(copy.id)}/export?mimeType=application/pdf`,
      { headers: { Authorization: `Bearer ${ScriptApp.getOAuthToken()}` }, muteHttpExceptions: true },
    );
    if (res.getResponseCode() !== 200) throw new Error(`PDF export failed: HTTP ${res.getResponseCode()}`);
    return Utilities.base64Encode(res.getBlob().getBytes());
  } finally {
    drive.Files.remove(copy.id);
  }
}

/** แทน {{key}} ทุกตำแหน่งด้วยรูป วางรูปต่อจากข้อความในย่อหน้านั้น */
function insertImages(body: GoogleAppsScript.Document.Body, key: string, blob: GoogleAppsScript.Base.Blob): void {
  const pattern = `\\{\\{${key}\\}\\}`;
  for (let found = body.findText(pattern); found; found = body.findText(pattern)) {
    const text = found.getElement().asText();
    text.deleteText(found.getStartOffset(), found.getEndOffsetInclusive());
    const paragraph = text.getParent() as GoogleAppsScript.Document.Paragraph;
    const image = paragraph.insertInlineImage(paragraph.getChildIndex(text) + 1, blob);
    const ratio = SIGNATURE_WIDTH / image.getWidth();
    image.setWidth(SIGNATURE_WIDTH).setHeight(Math.round(image.getHeight() * ratio));
  }
}

function buildDefaultTemplate(doc: GoogleAppsScript.Document.Document): void {
  const body = doc.getBody();
  body.clear();
  body.setAttributes({
    [DocumentApp.Attribute.FONT_FAMILY]: 'Sarabun',
    [DocumentApp.Attribute.FONT_SIZE]: 14,
  });

  const center = (text: string, heading?: GoogleAppsScript.Document.ParagraphHeading) => {
    const p = body.appendParagraph(text).setAlignment(DocumentApp.HorizontalAlignment.CENTER);
    if (heading) p.setHeading(heading);
    return p;
  };
  const title = body.getParagraphs()[0];
  title.setText('ใบถอนเงินฝาก');
  title.setHeading(DocumentApp.ParagraphHeading.HEADING1).setAlignment(DocumentApp.HorizontalAlignment.CENTER);
  center('สหกรณ์ออมทรัพย์สาธารณสุขจังหวัดมุกดาหาร จำกัด');
  body
    .appendParagraph(
      'ต้นแบบชั่วคราว: แก้รูปแบบเอกสารนี้ได้ใน Google Docs โดยคงตัวแปรในวงเล็บปีกกาคู่ไว้ และวาง {{ownerSignature}} กับ {{recipientSignature}} ไว้ในบรรทัดของตัวเอง ลบย่อหน้านี้เมื่อได้รูปแบบจริงแล้ว',
    )
    .editAsText()
    .setFontSize(10)
    .setItalic(true)
    .setForegroundColor('#777777');
  body
    .appendParagraph('เลขที่คำขอ {{requestNumber}}    วันที่ยื่น {{submittedDate}}')
    .setAlignment(DocumentApp.HorizontalAlignment.RIGHT)
    .editAsText()
    .setItalic(false)
    .setForegroundColor('#000000')
    .setFontSize(14);

  body.appendTable([
    ['รหัสสมาชิก', '{{memberCode}}'],
    ['เลขที่บัญชีเงินฝาก', '{{accountNumber}}'],
    ['ชื่อบัญชี', '{{accountName}}'],
    ['ประเภทบัญชี', '{{accountType}}'],
    ['จำนวนเงินที่ถอน', '{{amount}} บาท'],
    ['จำนวนเงิน (ตัวอักษร)', '({{amountText}})'],
    ['โอนเข้าธนาคาร', '{{payoutBank}}'],
    ['เลขบัญชีรับเงิน', '{{payoutAccountNumber}}'],
    ['ชื่อบัญชีรับเงิน', '{{payoutAccountName}}'],
    ['วันทำการที่ดำเนินการ', '{{processingDate}}'],
  ]);

  body.appendParagraph('');
  const signatures = body.appendTable([['{{ownerSignature}}', '{{recipientSignature}}']]);
  const labels = ['ลายมือชื่อเจ้าของบัญชี', 'ลายมือชื่อผู้รับเงิน'];
  labels.forEach((label, column) => {
    const cell = signatures.getCell(0, column);
    cell.getChild(0).asParagraph().setAlignment(DocumentApp.HorizontalAlignment.CENTER);
    cell.appendParagraph(label).setAlignment(DocumentApp.HorizontalAlignment.CENTER);
  });

  body.appendParagraph('สำหรับเจ้าหน้าที่').setHeading(DocumentApp.ParagraphHeading.HEADING3);
  body.appendTable([
    ['ผู้ตรวจ', '{{reviewedBy}}'],
    ['ผู้อนุมัติ', '{{approvedBy}}'],
    ['วันที่อนุมัติ', '{{approvedDate}}'],
  ]);
  doc.saveAndClose();
}
