import type { DocumentContent } from '../../../../shared/api';
import type { FileCategory, FileStore, SpreadsheetTab, TemplateImage } from '../ports';
import { ensureWithdrawalTemplate, renderTemplateToPdf, replaceWithdrawalTemplate } from './withdrawalTemplate';

const SOURCE_MIME_TYPES: Record<string, string> = {
  '.xlsx': 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
  '.xls': 'application/vnd.ms-excel',
  '.csv': 'text/csv',
};

const FOLDER_MIME_TYPE = 'application/vnd.google-apps.folder';
const ROOT_FOLDER_NAME = 'ฝากถอนออนไลน์ - เอกสาร';
const CATEGORY_FOLDER_NAMES: Record<FileCategory, string> = {
  payoutDocuments: 'เอกสารบัญชีรับเงิน',
  signatures: 'ลายมือชื่อ',
  slips: 'สลิป',
  pdfs: 'PDF คำขอถอนเงิน',
};

/**
 * ที่เก็บไฟล์บน Google Drive (Drive advanced service v3 ที่เปิดไว้ใน appsscript.json)
 * scope drive.file เข้าถึงได้เฉพาะไฟล์ที่ระบบสร้างเอง ระบบจึงสร้างโฟลเดอร์เองครั้งแรก
 * แล้วจำ ID ไว้ใน Script Properties ไฟล์ทุกไฟล์ไม่แชร์ให้ใคร
 */
export function createDriveFileStore(): FileStore {
  return {
    readSpreadsheetRows(fileName: string, contentBase64: string): string[][] | null {
      const extension = Object.keys(SOURCE_MIME_TYPES).find((ext) =>
        fileName.toLowerCase().endsWith(ext),
      );
      if (!extension) return null;
      const drive = requireDrive();

      const blob = Utilities.newBlob(
        Utilities.base64Decode(contentBase64),
        SOURCE_MIME_TYPES[extension],
        fileName,
      );

      // แปลงเป็น Google Sheets ชั่วคราว อ่านค่าตามที่แสดง แล้วลบทิ้งทันที
      let tempFileId: string | undefined;
      try {
        const created = drive.Files.create(
          {
            name: `นำเข้าชั่วคราว ${new Date().toISOString()}`,
            mimeType: 'application/vnd.google-apps.spreadsheet',
          },
          blob,
        );
        tempFileId = created.id;
        if (!tempFileId) return null;
        const sheet = SpreadsheetApp.openById(tempFileId).getSheets()[0];
        if (!sheet || sheet.getLastRow() === 0) return [];
        return sheet.getDataRange().getDisplayValues();
      } catch (err) {
        console.error(err);
        return null;
      } finally {
        if (tempFileId) drive.Files.remove(tempFileId);
      }
    },

    saveFile(category: FileCategory, fileName: string, mimeType: string, contentBase64: string): string {
      const drive = requireDrive();
      const blob = Utilities.newBlob(Utilities.base64Decode(contentBase64), mimeType, fileName);
      const created = drive.Files.create(
        { name: fileName, mimeType, parents: [categoryFolderId(category)] },
        blob,
        { fields: 'id' },
      );
      if (!created.id) throw new Error('Drive did not return a file id');
      return created.id;
    },

    renderWithdrawalPdf(fileName: string, texts: Record<string, string>, images: Record<string, TemplateImage>): string {
      const drive = requireDrive();
      const templateId = ensureWithdrawalTemplate(drive, rootFolderId());
      const pdf = renderTemplateToPdf(drive, templateId, categoryFolderId('pdfs'), texts, images);
      return this.saveFile('pdfs', fileName, 'application/pdf', pdf);
    },

    withdrawalTemplateUrl(): string {
      return `https://docs.google.com/document/d/${ensureWithdrawalTemplate(requireDrive(), rootFolderId())}/edit`;
    },

    resetWithdrawalTemplate(): string {
      return `https://docs.google.com/document/d/${replaceWithdrawalTemplate(requireDrive(), rootFolderId())}/edit`;
    },

    buildSpreadsheet(fileName: string, tabs: SpreadsheetTab[]): DocumentContent {
      const drive = requireDrive();
      const temp = drive.Files.create({
        name: `ชั่วคราว ${fileName}`,
        mimeType: 'application/vnd.google-apps.spreadsheet',
      });
      if (!temp.id) throw new Error('Drive did not return a spreadsheet id');
      try {
        const book = SpreadsheetApp.openById(temp.id);
        tabs.forEach((tab, index) => {
          const sheet = index === 0 ? book.getSheets()[0].setName(tab.name) : book.insertSheet(tab.name);
          writeTab(sheet, tab);
        });
        SpreadsheetApp.flush();
        const res = UrlFetchApp.fetch(
          `https://docs.google.com/spreadsheets/d/${encodeURIComponent(temp.id)}/export?format=xlsx`,
          { headers: { Authorization: `Bearer ${ScriptApp.getOAuthToken()}` }, muteHttpExceptions: true },
        );
        if (res.getResponseCode() !== 200) {
          throw new Error(`Spreadsheet export failed: HTTP ${res.getResponseCode()}`);
        }
        return {
          fileName,
          mimeType: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
          contentBase64: Utilities.base64Encode(res.getBlob().getBytes()),
        };
      } finally {
        drive.Files.remove(temp.id);
      }
    },

    deleteFile(fileId: string): void {
      const drive = requireDrive();
      try {
        // ย้ายไปถังขยะ Drive ลบถาวรเองหลัง 30 วัน
        drive.Files.update({ trashed: true }, fileId);
      } catch (err) {
        let exists = true;
        try {
          exists = !drive.Files.get(fileId, { fields: 'trashed' }).trashed;
        } catch {
          exists = false;
        }
        if (exists) throw err;
      }
    },

    readFile(fileId: string): DocumentContent | null {
      const drive = requireDrive();
      let meta: GoogleAppsScript.Drive_v3.Drive.V3.Schema.File;
      try {
        meta = drive.Files.get(fileId, { fields: 'name,mimeType,trashed' });
      } catch {
        return null;
      }
      if (meta.trashed) return null;
      const res = UrlFetchApp.fetch(
        `https://www.googleapis.com/drive/v3/files/${encodeURIComponent(fileId)}?alt=media`,
        { headers: { Authorization: `Bearer ${ScriptApp.getOAuthToken()}` }, muteHttpExceptions: true },
      );
      if (res.getResponseCode() !== 200) return null;
      return {
        fileName: meta.name ?? fileId,
        mimeType: meta.mimeType ?? 'application/octet-stream',
        contentBase64: Utilities.base64Encode(res.getBlob().getBytes()),
      };
    },
  };
}

/** เขียนตาราง: คอลัมน์ข้อความตั้งเป็น '@' (เลขที่ขึ้นต้นด้วย 0 ไม่หาย) คอลัมน์ตัวเลขแสดงทศนิยม 2 ตำแหน่ง */
function writeTab(sheet: GoogleAppsScript.Spreadsheet.Sheet, tab: SpreadsheetTab): void {
  const width = Math.max(...tab.rows.map((row) => row.length));
  if (width === 0 || tab.rows.length === 0) return;
  const rows = tab.rows.map((row) => [...row, ...new Array(width - row.length).fill('')]);
  for (let column = 0; column < width; column++) {
    const numeric = rows.slice(1).some((row) => typeof row[column] === 'number');
    sheet.getRange(1, column + 1, rows.length, 1).setNumberFormat(numeric ? '#,##0.00' : '@');
  }
  sheet.getRange(1, 1, rows.length, width).setValues(rows);
  sheet.getRange(1, 1, 1, width).setFontWeight('bold');
  sheet.setFrozenRows(1);
  sheet.autoResizeColumns(1, width);
}

function requireDrive(): GoogleAppsScript.Drive {
  if (!Drive?.Files) throw new Error('Drive advanced service is not enabled');
  return Drive;
}

/** โฟลเดอร์ของแต่ละหมวด สร้างครั้งแรกที่ใช้ แล้วจำ ID ไว้ */
function categoryFolderId(category: FileCategory): string {
  return ensureFolder(`DRIVE_FOLDER_${category}`, CATEGORY_FOLDER_NAMES[category], rootFolderId());
}

function rootFolderId(): string {
  return ensureFolder('DRIVE_ROOT_FOLDER_ID', ROOT_FOLDER_NAME);
}

function ensureFolder(propertyKey: string, name: string, parentId?: string): string {
  const props = PropertiesService.getScriptProperties();
  const existing = props.getProperty(propertyKey);
  if (existing) return existing;
  const folder = requireDrive().Files.create({
    name,
    mimeType: FOLDER_MIME_TYPE,
    parents: parentId ? [parentId] : undefined,
  });
  if (!folder.id) throw new Error(`Could not create Drive folder ${name}`);
  props.setProperty(propertyKey, folder.id);
  return folder.id;
}
