// Google Docs ต้นแบบใบถอนเงิน และการสร้าง PDF จากต้นแบบ
// scope drive.file เปิดได้เฉพาะไฟล์ที่ระบบสร้าง ระบบจึงสร้างต้นแบบเอง แล้วให้เจ้าหน้าที่แก้รูปแบบใน Google Docs
// ต้นแบบเริ่มต้นจัดตามแบบฟอร์ม "ใบถอนเงินออนไลน์" ของสหกรณ์
import COOP_LOGO_JPEG from '../../../assets/coop-logo.jpg';
import type { TemplateImage } from '../ports';

const TEMPLATE_PROPERTY = 'WITHDRAWAL_TEMPLATE_DOC_ID';
const TEMPLATE_NAME = 'ต้นแบบใบถอนเงินออนไลน์ (แก้รูปแบบได้)';

// A4 ขอบ 0.5 นิ้ว ให้ทั้งฟอร์มและเอกสารแนบอยู่ในหน้าเดียว
const PAGE_WIDTH = 595.28;
const PAGE_HEIGHT = 841.89;
const MARGIN = 36;
const FONT = 'Sarabun';
const BODY_SIZE = 12;
const DOTS = '....................';

type Drive = GoogleAppsScript.Drive;
type Line = { text: string; bold?: boolean; align?: GoogleAppsScript.Document.HorizontalAlignment; size?: number };

/** คืน ID ของต้นแบบ สร้างต้นแบบเริ่มต้นในโฟลเดอร์ของระบบถ้ายังไม่มีหรือถูกลบ */
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
  return createTemplate(drive, folderId);
}

/**
 * สร้างต้นแบบเริ่มต้นใหม่แล้วใช้แทนของเดิม ต้นแบบเดิมเปลี่ยนชื่อเป็น "เลิกใช้" แต่ไม่ลบ
 * เผื่อต้องคัดลอกรูปแบบที่แก้ไว้กลับมา
 */
export function replaceWithdrawalTemplate(drive: Drive, folderId: string): string {
  const existing = PropertiesService.getScriptProperties().getProperty(TEMPLATE_PROPERTY);
  if (existing) {
    try {
      drive.Files.update({ name: `ต้นแบบใบถอนเงินเดิม (เลิกใช้ ${new Date().toISOString().slice(0, 10)})` }, existing);
    } catch {
      // ต้นแบบเดิมถูกลบไปแล้ว
    }
  }
  return createTemplate(drive, folderId);
}

function createTemplate(drive: Drive, folderId: string): string {
  const created = drive.Files.create({
    name: TEMPLATE_NAME,
    mimeType: 'application/vnd.google-apps.document',
    parents: [folderId],
  });
  if (!created.id) throw new Error('Could not create withdrawal template');
  buildDefaultTemplate(DocumentApp.openById(created.id));
  PropertiesService.getScriptProperties().setProperty(TEMPLATE_PROPERTY, created.id);
  return created.id;
}

/** คัดลอกต้นแบบ แทนตัวแปร แล้ว export เป็น PDF คืนเนื้อ PDF แบบ base64 */
export function renderTemplateToPdf(
  drive: Drive,
  templateId: string,
  workFolderId: string,
  texts: Record<string, string>,
  images: Record<string, TemplateImage>,
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
    for (const [key, image] of Object.entries(images)) {
      insertImages(body, key, image);
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

/** แทน {{key}} ทุกตำแหน่งด้วยรูป ย่อให้อยู่ในกรอบ maxWidth × maxHeight โดยคงสัดส่วน */
function insertImages(body: GoogleAppsScript.Document.Body, key: string, image: TemplateImage): void {
  const pattern = `\\{\\{${key}\\}\\}`;
  for (let found = body.findText(pattern); found; found = body.findText(pattern)) {
    const text = found.getElement().asText();
    text.deleteText(found.getStartOffset(), found.getEndOffsetInclusive());
    const paragraph = text.getParent() as GoogleAppsScript.Document.Paragraph;
    const blob = Utilities.newBlob(Utilities.base64Decode(image.contentBase64), image.mimeType, key);
    const inserted = paragraph.insertInlineImage(paragraph.getChildIndex(text) + 1, blob);
    fit(inserted, image.maxWidth, image.maxHeight);
  }
}

function fit(image: GoogleAppsScript.Document.InlineImage, maxWidth: number, maxHeight: number): void {
  const scale = Math.min(maxWidth / image.getWidth(), maxHeight / image.getHeight());
  image.setWidth(Math.round(image.getWidth() * scale)).setHeight(Math.round(image.getHeight() * scale));
}

function buildDefaultTemplate(doc: GoogleAppsScript.Document.Document): void {
  const { HorizontalAlignment: Align, Attribute } = DocumentApp;
  const body = doc.getBody();
  body.clear();
  body
    .setPageWidth(PAGE_WIDTH)
    .setPageHeight(PAGE_HEIGHT)
    .setMarginTop(MARGIN)
    .setMarginBottom(MARGIN)
    .setMarginLeft(MARGIN)
    .setMarginRight(MARGIN);
  body.setAttributes({ [Attribute.FONT_FAMILY]: FONT, [Attribute.FONT_SIZE]: BODY_SIZE });
  const contentWidth = PAGE_WIDTH - 2 * MARGIN;

  // หัวกระดาษ: ตราสหกรณ์ | ชื่อสหกรณ์และชื่อแบบฟอร์ม | เลขที่คำขอ
  const header = body.insertTable(0, [['', '', '']]);
  borderless(header);
  const logoCell = header.getCell(0, 0).setWidth(70);
  const logo = logoCell
    .getChild(0)
    .asParagraph()
    .appendInlineImage(Utilities.newBlob(Utilities.base64Decode(COOP_LOGO_JPEG), 'image/jpeg', 'logo'));
  fit(logo, 60, 60);
  const titleCell = header.getCell(0, 1).setWidth(contentWidth - 70 - 120).setVerticalAlignment(DocumentApp.VerticalAlignment.CENTER);
  const coopName = 'สหกรณ์ออมทรัพย์สาธารณสุขจังหวัดมุกดาหาร จำกัด ';
  const formName = 'ใบถอนเงินออนไลน์';
  const title = titleCell.getChild(0).asParagraph();
  title.setText(coopName + formName);
  title
    .editAsText()
    .setFontSize(15)
    .setBold(coopName.length, coopName.length + formName.length - 1, true);
  fill(header.getCell(0, 2).setWidth(120).setVerticalAlignment(DocumentApp.VerticalAlignment.CENTER), [
    { text: 'เลขที่คำขอ', size: 9, align: Align.RIGHT },
    { text: '{{requestNumber}}', size: 10, align: Align.RIGHT },
  ]);

  paragraph(body, 'เลขที่บัญชี {{accountNumber}}     ชื่อบัญชี {{accountName}}     วันที่ {{submittedDate}}');
  paragraph(body, 'ประเภทบัญชี   {{savingsMark}} ออมทรัพย์        {{specialSavingsMark}} ออมทรัพย์พิเศษ        รหัสสมาชิก {{memberCode}}');
  paragraph(body, 'จำนวนเงินที่ถอน (ตัวอักษร) {{amountText}}     จำนวนเงินที่ถอน (ตัวเลข) {{amount}} บาท');

  // ส่วนกลาง 3 คอลัมน์: บัญชีที่โอนเข้า | ลายมือชื่อสมาชิก | สำหรับเจ้าหน้าที่สหกรณ์
  const middle = body.appendTable([['', '', '']]);
  middle.setBorderWidth(1);
  fill(middle.getCell(0, 0).setWidth(contentWidth * 0.4), [
    { text: 'โดยโอนเข้าบัญชี', bold: true },
    { text: 'ธนาคาร {{payoutBank}}' },
    { text: 'ชื่อบัญชี {{payoutAccountName}}' },
    { text: 'เลขที่บัญชี {{payoutAccountNumber}}' },
    { text: 'สาขา {{payoutBranch}}' },
    { text: 'หมายเลขโทรศัพท์ติดต่อกลับ {{contactPhone}}' },
  ]);
  fill(middle.getCell(0, 1).setWidth(contentWidth * 0.33), [
    { text: '{{ownerSignature}}', align: Align.CENTER },
    { text: 'ลายมือชื่อเจ้าของบัญชี', align: Align.CENTER },
    { text: '{{recipientSignature}}', align: Align.CENTER },
    { text: 'ลายมือชื่อผู้รับเงิน', align: Align.CENTER },
    { text: 'ข้าพเจ้าได้รับเงินครบถ้วนและถูกต้องแล้ว', align: Align.CENTER, size: 10 },
  ]);
  fill(middle.getCell(0, 2).setWidth(contentWidth * 0.27), [
    { text: 'สำหรับเจ้าหน้าที่สหกรณ์', bold: true, align: Align.CENTER },
    { text: ' ', align: Align.CENTER },
    { text: DOTS + DOTS, align: Align.CENTER },
    { text: '({{reviewedBy}})', align: Align.CENTER, size: 10 },
    { text: 'เจ้าหน้าที่', align: Align.CENTER },
    { text: ' ', align: Align.CENTER },
    { text: DOTS + DOTS, align: Align.CENTER },
    { text: '({{approvedBy}})', align: Align.CENTER, size: 10 },
    { text: 'ผู้จัดการ', align: Align.CENTER },
    { text: 'อนุมัติ {{approvedDate}} ดำเนินการ {{processingDate}}', align: Align.CENTER, size: 9 },
  ]);

  // เอกสารแนบ: บัตรประชาชน | สมุดบัญชีสหกรณ์ / หมายเหตุ | สมุดบัญชีธนาคาร
  const attachments = body.appendTable([
    ['', ''],
    ['', ''],
  ]);
  attachments.setBorderWidth(1);
  fill(attachments.getCell(0, 0).setWidth(contentWidth * 0.3), [
    { text: 'แนบบัตรประชาชน', bold: true, align: Align.CENTER, size: 10 },
    { text: '{{idCardImage}}', align: Align.CENTER },
  ]);
  fill(attachments.getCell(0, 1).setWidth(contentWidth * 0.7), [
    { text: 'แนบสมุดบัญชีสหกรณ์', bold: true, align: Align.CENTER, size: 10 },
    { text: '{{depositBookImage}}', align: Align.CENTER },
  ]);
  fill(attachments.getCell(1, 0), [
    { text: 'หมายเหตุ :', bold: true, size: 10 },
    {
      text: 'สมาชิกเมื่ออัปโหลดข้อมูล กรุณาโทรสอบทานข้อมูลเพื่อความถูกต้องและชัดเจนในการทำธุรกรรม หมายเลขโทรศัพท์ 088-5578567, 042-633587, 090-9881933',
      size: 10,
    },
  ]);
  fill(attachments.getCell(1, 1), [
    { text: 'แนบสมุดบัญชีเงินฝากธนาคาร', bold: true, align: Align.CENTER, size: 10 },
    { text: '{{payoutBookImage}}', align: Align.CENTER },
  ]);

  // Docs บังคับให้มีย่อหน้าว่างท้ายเอกสาร ทำให้เล็กที่สุดเพื่อไม่ให้ล้นไปหน้าสอง
  const last = body.getChild(body.getNumChildren() - 1);
  if (last.getType() === DocumentApp.ElementType.PARAGRAPH) last.asParagraph().editAsText().setFontSize(1);
  doc.saveAndClose();
}

function paragraph(body: GoogleAppsScript.Document.Body, text: string): void {
  body.appendParagraph(text).setSpacingBefore(4).setSpacingAfter(4);
}

/** ใส่ข้อความหลายบรรทัดในช่องตาราง บรรทัดแรกใช้ย่อหน้าที่ช่องมีอยู่แล้ว */
function fill(cell: GoogleAppsScript.Document.TableCell, lines: Line[]): void {
  lines.forEach((line, index) => {
    let p: GoogleAppsScript.Document.Paragraph;
    if (index === 0) {
      p = cell.getChild(0).asParagraph();
      p.setText(line.text);
    } else {
      p = cell.appendParagraph(line.text);
    }
    p.setAlignment(line.align ?? DocumentApp.HorizontalAlignment.LEFT).setSpacingBefore(1).setSpacingAfter(1);
    const text = p.editAsText();
    text.setBold(Boolean(line.bold)).setFontSize(line.size ?? BODY_SIZE);
  });
}

function borderless(table: GoogleAppsScript.Document.Table): void {
  table.setBorderWidth(0);
}
