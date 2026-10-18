// ตารางบน Google Sheets: แถวแรกคือชื่อคอลัมน์ ทุกเซลล์เก็บเป็นข้อความ
// (ตั้ง number format เป็น '@' เพื่อไม่ให้ Sheets แปลง "00123" เป็นตัวเลข หรือ ISO time เป็นวันที่)

export type Row = Record<string, string>;

export class SheetTable {
  private headerChecked = false;

  constructor(
    private readonly book: () => GoogleAppsScript.Spreadsheet.Spreadsheet,
    private readonly name: string,
    private readonly columns: readonly string[],
  ) {}

  readAll(): Row[] {
    const sheet = this.book().getSheetByName(this.name);
    if (!sheet || sheet.getLastRow() < 2) return [];
    const [header, ...rows] = sheet.getDataRange().getValues();
    return rows.map((values) => this.toRow(header, values));
  }

  /** อ่านจากแถวล่างสุดขึ้นไปทีละชุด หยุดเมื่อ visit คืน false */
  scanBackwards(visit: (row: Row) => boolean, chunkSize = 1000): void {
    const sheet = this.book().getSheetByName(this.name);
    if (!sheet || sheet.getLastRow() < 2) return;
    const width = sheet.getLastColumn();
    const header = sheet.getRange(1, 1, 1, width).getValues()[0];
    for (let end = sheet.getLastRow(); end >= 2; end -= chunkSize) {
      const start = Math.max(2, end - chunkSize + 1);
      const values = sheet.getRange(start, 1, end - start + 1, width).getValues();
      for (let i = values.length - 1; i >= 0; i--) {
        if (!visit(this.toRow(header, values[i]))) return;
      }
    }
  }

  /** คอลัมน์ที่ยังไม่มีในชีต (เพิ่มในเวอร์ชันหลัง) ได้ค่า '' */
  private toRow(header: unknown[], values: unknown[]): Row {
    const row: Row = {};
    for (const column of this.columns) row[column] = '';
    header.forEach((name, i) => {
      row[String(name)] = toText(values[i]);
    });
    return row;
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

  /** ลบทุกแถวที่ keyColumn ตรงกัน (ผู้เรียกต้องถือ lock) */
  deleteWhere(keyColumn: string, value: string): void {
    const sheet = this.book().getSheetByName(this.name);
    if (!sheet || sheet.getLastRow() < 2) return;
    const keyIndex = this.columns.indexOf(keyColumn);
    const keys = sheet.getRange(2, keyIndex + 1, sheet.getLastRow() - 1, 1).getValues();
    for (let i = keys.length - 1; i >= 0; i--) {
      if (toText(keys[i][0]) === value) sheet.deleteRow(i + 2);
    }
  }

  append(row: Row): void {
    const sheet = this.ensureSheet();
    sheet
      .getRange(sheet.getLastRow() + 1, 1, 1, this.columns.length)
      .setValues([this.columns.map((column) => row[column] ?? '')]);
  }

  /** ลบข้อมูลเดิมทั้งหมดแล้วเขียนใหม่ในครั้งเดียว (ผู้เรียกต้องถือ lock) */
  replaceAll(rows: Row[]): void {
    const sheet = this.ensureSheet();
    const lastRow = sheet.getLastRow();
    if (lastRow >= 2) {
      sheet.getRange(2, 1, lastRow - 1, sheet.getLastColumn()).clearContent();
    }
    if (rows.length === 0) return;
    if (sheet.getMaxRows() < rows.length + 1) {
      sheet.insertRowsAfter(sheet.getMaxRows(), rows.length + 1 - sheet.getMaxRows());
    }
    const range = sheet.getRange(2, 1, rows.length, this.columns.length);
    range.setNumberFormat('@');
    range.setValues(rows.map((row) => this.columns.map((column) => row[column] ?? '')));
  }

  private ensureSheet(): GoogleAppsScript.Spreadsheet.Sheet {
    const book = this.book();
    const existing = book.getSheetByName(this.name);
    if (existing) {
      if (!this.headerChecked) {
        this.addMissingColumns(existing);
        this.headerChecked = true;
      }
      return existing;
    }
    const sheet = book.insertSheet(this.name);
    sheet.getRange(1, 1, sheet.getMaxRows(), this.columns.length).setNumberFormat('@');
    sheet.getRange(1, 1, 1, this.columns.length).setValues([[...this.columns]]).setFontWeight('bold');
    sheet.setFrozenRows(1);
    this.headerChecked = true;
    return sheet;
  }

  /**
   * ชีตที่สร้างโดยเวอร์ชันก่อนอาจยังไม่มีคอลัมน์ใหม่ เพิ่มหัวคอลัมน์ต่อท้ายให้
   * คอลัมน์ใหม่ต้องต่อท้ายรายการ columns เสมอ ลำดับในชีตจึงตรงกับที่ upsert/append เขียน
   */
  private addMissingColumns(sheet: GoogleAppsScript.Spreadsheet.Sheet): void {
    const width = sheet.getLastColumn();
    const header = sheet.getRange(1, 1, 1, width).getValues()[0].map(String);
    const missing = this.columns.filter((column) => !header.includes(column));
    if (missing.length === 0) return;
    if (sheet.getMaxColumns() < width + missing.length) {
      sheet.insertColumnsAfter(sheet.getMaxColumns(), width + missing.length - sheet.getMaxColumns());
    }
    sheet.getRange(1, width + 1, sheet.getMaxRows(), missing.length).setNumberFormat('@');
    sheet.getRange(1, width + 1, 1, missing.length).setValues([missing]).setFontWeight('bold');
  }
}

function toText(value: unknown): string {
  if (value instanceof Date) return value.toISOString();
  return value === null || value === undefined ? '' : String(value);
}
