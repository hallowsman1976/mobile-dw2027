import type { Clock } from '../ports';

// เขตเวลาของโปรเจกต์กำหนดเป็น Asia/Bangkok ใน appsscript.json
export const gasClock: Clock = {
  now: () => new Date(),
};
