import { DOCUMENT_MAX_BYTES, type UploadedFile } from '../../shared/api';

const MAX_IMAGE_SIDE = 1600;
const JPEG_QUALITY = 0.82;

/**
 * เตรียมไฟล์ก่อนส่ง: รูปถ่ายจากมือถือย่อด้านยาวเหลือ 1600px และแปลงเป็น JPEG
 * (เหลือหลักร้อย KB อ่านเอกสารได้ชัด และส่งผ่าน Apps Script ได้เร็ว) ส่วน PDF ส่งตามเดิม
 * คืนข้อความ error ภาษาไทยถ้าไฟล์ใช้ไม่ได้
 */
export async function prepareUpload(file: File, maxBytes = DOCUMENT_MAX_BYTES): Promise<UploadedFile | string> {
  if (file.type === 'application/pdf') {
    if (file.size > maxBytes) return `ไฟล์ ${file.name} ใหญ่เกิน ${maxBytes / 1024 / 1024}MB`;
    return { fileName: file.name, mimeType: file.type, contentBase64: await blobToBase64(file) };
  }
  if (!file.type.startsWith('image/')) return `ไฟล์ ${file.name} ต้องเป็นรูปภาพหรือ PDF`;

  const blob = await resizeImage(file).catch(() => null);
  if (!blob) return `เปิดรูป ${file.name} ไม่ได้ ลองถ่ายใหม่หรือใช้ไฟล์ JPG/PNG`;
  if (blob.size > maxBytes) return `ไฟล์ ${file.name} ใหญ่เกิน ${maxBytes / 1024 / 1024}MB`;
  return {
    fileName: file.name.replace(/\.[^.]+$/, '') + '.jpg',
    mimeType: 'image/jpeg',
    contentBase64: await blobToBase64(blob),
  };
}

async function resizeImage(file: File): Promise<Blob> {
  const url = URL.createObjectURL(file);
  try {
    const image = await new Promise<HTMLImageElement>((resolve, reject) => {
      const img = new Image();
      img.onload = () => resolve(img);
      img.onerror = reject;
      img.src = url;
    });
    const scale = Math.min(1, MAX_IMAGE_SIDE / Math.max(image.naturalWidth, image.naturalHeight));
    const canvas = document.createElement('canvas');
    canvas.width = Math.round(image.naturalWidth * scale);
    canvas.height = Math.round(image.naturalHeight * scale);
    const context = canvas.getContext('2d');
    if (!context) throw new Error('no canvas');
    context.fillStyle = '#ffffff';
    context.fillRect(0, 0, canvas.width, canvas.height);
    context.drawImage(image, 0, 0, canvas.width, canvas.height);
    return await new Promise<Blob>((resolve, reject) =>
      canvas.toBlob((blob) => (blob ? resolve(blob) : reject(new Error('toBlob failed'))), 'image/jpeg', JPEG_QUALITY),
    );
  } finally {
    URL.revokeObjectURL(url);
  }
}

export function blobToBase64(blob: Blob): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(String(reader.result).replace(/^data:[^,]*,/, ''));
    reader.onerror = () => reject(reader.error);
    reader.readAsDataURL(blob);
  });
}

export function base64ToBlob(contentBase64: string, mimeType: string): Blob {
  const binary = atob(contentBase64);
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i);
  return new Blob([bytes], { type: mimeType });
}
