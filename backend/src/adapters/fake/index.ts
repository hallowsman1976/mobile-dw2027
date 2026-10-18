// ตัวปลอมในหน่วยความจำของตัวกลางทั้ง 6 ใช้ในการทดสอบเท่านั้น
import type { Deps, LineBinding, LineUser } from '../ports';

export type FakeWorld = {
  deps: Deps;
  /** token → ผู้ใช้ LINE ที่ token นั้นยืนยันได้ */
  lineTokens: Map<string, LineUser>;
  bindings: LineBinding[];
  setNow(date: Date): void;
};

export function createFakeWorld(): FakeWorld {
  const lineTokens = new Map<string, LineUser>();
  const bindings: LineBinding[] = [];
  let now = new Date('2026-01-05T09:00:00+07:00');

  const deps: Deps = {
    data: {
      findActiveBindingByLineUserId: (lineUserId) =>
        bindings.find((b) => b.lineUserId === lineUserId) ?? null,
    },
    files: {},
    lineIdentity: {
      verifyIdToken: (idToken) => lineTokens.get(idToken) ?? null,
    },
    slips: {},
    messenger: {},
    clock: { now: () => now },
  };

  return {
    deps,
    lineTokens,
    bindings,
    setNow: (date) => {
      now = date;
    },
  };
}
