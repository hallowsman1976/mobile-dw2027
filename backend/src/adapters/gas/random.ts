import type { Random } from '../ports';

// Utilities.getUuid สร้าง UUID v4 จากตัวสุ่มของ Google ซึ่งปลอดภัยกว่า Math.random
export const gasRandom: Random = {
  uuid: () => Utilities.getUuid(),
};
