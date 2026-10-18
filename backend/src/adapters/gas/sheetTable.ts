// ตารางบน Google Sheets: แถวแรกคือชื่อคอลัมน์ ทุกเซลล์เก็บเป็นข้อความ
// (ตั้ง number format เป็น '@' เพื่อไม่ให้ Sheets แปลง "00123" เป็นตัวเลข หรือ ISO time เป็นวันที่)

export type Row = Record<string, string>;

export class SheetTable {
  constructor(
    private readonly book: () => GoogleAppsScript.Spreadsheet.Spreadsheet,
    private readonly name: string,
    private readonly columns: readonly string[],
  ) {}

  readAll(): Row[] {
    const sheet = this.book().getSheetByName(this.name);
    if (!sheet || sheet.getLastRow() < 2) return [];
    const [header, ...rows] = sheet.getDataRange().getValues();
    return rows.map((values) => {
      const row: Row = {};
      header.forEach((name, i) => {
        row[String(name)] = toText(values[i]);
      });
      return row;
    });
  }

  /** แทนที่แถวแรกที่ keyColumn ตรงกัน หรือเพิ่มแถวใหม่ถ้าไม่มี (ผู้เรียกต้องถือ lock) */
  upsert(keyColumn: string, row: Row): void {
    const sheet = this.ensureSheet();
    const values = [this.columns.map((column) => row[column] ?? '')];
    const keyIndex = this.columns.indexOf(keyColumn);
    const lastRow = sheet.getLastRow();
    if (lastRow >= 2) {
      const keys = sheet.getRange(2, keyIndex + 1, lastRow - 1, 1).getValues();
      const found = keys.findIndex(([value]) => toText(value) === row[keyColumn]);
      if (found >= 0) {
        sheet.getRange(found + 2, 1, 1, this.columns.length).setValues(values);
        return;
      }
    }
    sheet.getRange(lastRow + 1, 1, 1, this.columns.length).setValues(values);
  }

  private ensureSheet(): GoogleAppsScript.Spreadsheet.Sheet {
    const book = this.book();
    const existing = book.getSheetByName(this.name);
    if (existing) return existing;
    const sheet = book.insertSheet(this.name);
    sheet.getRange(1, 1, sheet.getMaxRows(), this.columns.length).setNumberFormat('@');
    sheet.getRange(1, 1, 1, this.columns.length).setValues([[...this.columns]]).setFontWeight('bold');
    sheet.setFrozenRows(1);
    return sheet;
  }
}

function toText(value: unknown): string {
  if (value instanceof Date) return value.toISOString();
  return value === null || value === undefined ? '' : String(value);
}
