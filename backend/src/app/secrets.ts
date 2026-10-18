// การเก็บรหัสผ่านและ PIN: SHA-256 ผสม salt ของแต่ละคน วนแฮช 10,000 รอบ (spec: การยืนยันตัวตน)
import { sha256, toHex, utf8 } from './sha256';

const ITERATIONS = 10_000;

export function hashSecret(secret: string, salt: string): string {
  const secretBytes = utf8(secret);
  let digest = sha256(utf8(salt + secret));
  for (let i = 1; i < ITERATIONS; i++) {
    const next = new Uint8Array(digest.length + secretBytes.length);
    next.set(digest);
    next.set(secretBytes, digest.length);
    digest = sha256(next);
  }
  return toHex(digest);
}

export function verifySecret(secret: string, salt: string, expectedHash: string): boolean {
  return constantTimeEqual(hashSecret(secret, salt), expectedHash);
}

/** แฮชของ session token ใช้เป็น key ตอนเก็บ เพื่อไม่ให้ token จริงอยู่ในที่เก็บข้อมูล */
export function hashToken(token: string): string {
  return toHex(sha256(utf8(token)));
}

function constantTimeEqual(a: string, b: string): boolean {
  if (a.length !== b.length) return false;
  let diff = 0;
  for (let i = 0; i < a.length; i++) diff |= a.charCodeAt(i) ^ b.charCodeAt(i);
  return diff === 0;
}
