import type { FileStore } from '../ports';

const SOURCE_MIME_TYPES: Record<string, string> = {
  '.xlsx': 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
  '.xls': 'application/vnd.ms-excel',
  '.csv': 'text/csv',
};

/** ที่เก็บไฟล์บน Google Drive (ใช้ Drive advanced service v3 ที่เปิดไว้ใน appsscript.json) */
export function createDriveFileStore(): FileStore {
  return {
    readSpreadsheetRows(fileName: string, contentBase64: string): string[][] | null {
      const extension = Object.keys(SOURCE_MIME_TYPES).find((ext) =>
        fileName.toLowerCase().endsWith(ext),
      );
      if (!extension || !Drive?.Files) return null;

      const blob = Utilities.newBlob(
        Utilities.base64Decode(contentBase64),
        SOURCE_MIME_TYPES[extension],
        fileName,
      );

      // แปลงเป็น Google Sheets ชั่วคราว อ่านค่าตามที่แสดง แล้วลบทิ้งทันที
      let tempFileId: string | undefined;
      try {
        const created = Drive.Files.create(
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
        if (tempFileId) Drive.Files.remove(tempFileId);
      }
    },
  };
}
