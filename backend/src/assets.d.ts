// build.mjs แปลงไฟล์รูปเป็น base64 ตอน build
declare module '*.jpg' {
  const contentBase64: string;
  export default contentBase64;
}
