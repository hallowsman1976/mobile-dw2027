/// <reference types="vite/client" />

interface ImportMetaEnv {
  readonly VITE_LIFF_ID?: string;
  readonly VITE_GAS_URL?: string;
  /** เบอร์โทรสหกรณ์ที่แสดงในหน้าติดต่อสหกรณ์ */
  readonly VITE_COOP_PHONE?: string;
  /** ตอนพัฒนาบนเครื่องเท่านั้น: ใช้ token นี้แทน LIFF กับหลังบ้านจำลอง */
  readonly VITE_DEV_ID_TOKEN?: string;
}

interface ImportMeta {
  readonly env: ImportMetaEnv;
}
