// สัญญา (contract) ระหว่างหน้าบ้านกับหลังบ้าน ใช้ร่วมกันทั้งสองฝั่ง

export type ApiRequest = {
  action: string;
  auth?: ApiAuth;
  payload?: unknown;
};

/** สมาชิกส่ง LIFF ID token ส่วนเจ้าหน้าที่ส่ง session token (ticket 02) */
export type ApiAuth = { idToken: string } | { sessionToken: string };

export type ApiError = { code: ErrorCode; message: string };

export type ApiResponse<T> = { ok: true; data: T } | { ok: false; error: ApiError };

export type ErrorCode =
  | 'BAD_REQUEST'
  | 'UNKNOWN_ACTION'
  | 'UNAUTHENTICATED'
  | 'INTERNAL';

export type PingResult = { serverTime: string };

export type MeResult =
  | { bound: false; displayName: string }
  | { bound: true; displayName: string; memberCode: string };
