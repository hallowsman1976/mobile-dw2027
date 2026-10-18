// ตัวปลอมในหน่วยความจำของตัวกลางทั้งหมด ใช้ในการทดสอบเท่านั้น
import type {
  AuditEntry,
  BindingThrottle,
  DepositAccount,
  Deps,
  LineBinding,
  LineUser,
  StaffAccount,
  StaffSession,
} from '../ports';

export type FakeWorld = {
  deps: Deps;
  /** token → ผู้ใช้ LINE ที่ token นั้นยืนยันได้ */
  lineTokens: Map<string, LineUser>;
  bindings: LineBinding[];
  staff: Map<string, StaffAccount>;
  sessions: Map<string, StaffSession>;
  depositAccounts: DepositAccount[];
  auditLog: AuditEntry[];
  bindingThrottles: Map<string, BindingThrottle>;
  /** เพิ่มการผูกบัญชีที่ใช้งานอยู่ ค่าที่ไม่ระบุเป็นค่าของการผูกใหม่ที่ยังไม่ตั้ง PIN */
  addBinding(binding: Partial<LineBinding> & Pick<LineBinding, 'memberCode' | 'lineUserId'>): LineBinding;
  setNow(date: Date): void;
  advanceMinutes(minutes: number): void;
};

/**
 * ไฟล์ตารางปลอม: ตัวที่เก็บไฟล์ปลอมถอด base64 เป็น JSON ของ string[][]
 * ใช้คู่กับ action importAccounts ในการทดสอบ
 */
export function fakeSpreadsheetBase64(rows: string[][]): string {
  return Buffer.from(JSON.stringify(rows), 'utf8').toString('base64');
}

export function createFakeWorld(): FakeWorld {
  const lineTokens = new Map<string, LineUser>();
  const bindings: LineBinding[] = [];
  const staff = new Map<string, StaffAccount>();
  const sessions = new Map<string, StaffSession>();
  const depositAccounts: DepositAccount[] = [];
  const auditLog: AuditEntry[] = [];
  const bindingThrottles = new Map<string, BindingThrottle>();
  let now = new Date('2026-01-05T09:00:00+07:00');
  let uuidCounter = 0;

  const deps: Deps = {
    data: {
      withLock: (fn) => fn(),
      findActiveBindingByLineUserId: (lineUserId) => {
        const b = bindings.find((x) => x.lineUserId === lineUserId && !x.unboundAt);
        return b ? { ...b } : null;
      },
      findActiveBindingByMemberCode: (memberCode) => {
        const b = bindings.find((x) => x.memberCode === memberCode && !x.unboundAt);
        return b ? { ...b } : null;
      },
      saveBinding: (binding) => {
        const index = bindings.findIndex((b) => b.id === binding.id);
        if (index >= 0) bindings[index] = { ...binding };
        else bindings.push({ ...binding });
      },
      getBindingThrottle: (lineUserId) => {
        const t = bindingThrottles.get(lineUserId);
        return t ? { ...t } : null;
      },
      putBindingThrottle: (lineUserId, throttle) => {
        bindingThrottles.set(lineUserId, { ...throttle });
      },
      listDepositAccounts: () => depositAccounts.map((a) => ({ ...a })),
      replaceDepositAccounts: (accounts) => {
        depositAccounts.splice(0, depositAccounts.length, ...accounts.map((a) => ({ ...a })));
      },
      appendAuditLog: (entry) => {
        auditLog.push({ ...entry });
      },
      listStaff: () => [...staff.values()].map((s) => ({ ...s, roles: [...s.roles] })),
      findStaff: (username) => {
        const s = staff.get(username);
        return s ? { ...s, roles: [...s.roles] } : null;
      },
      saveStaff: (s) => {
        staff.set(s.username, { ...s, roles: [...s.roles] });
      },
      putSession: (tokenHash, session) => {
        sessions.set(tokenHash, { ...session });
      },
      getSession: (tokenHash) => sessions.get(tokenHash) ?? null,
      deleteSession: (tokenHash) => {
        sessions.delete(tokenHash);
      },
    },
    files: {
      readSpreadsheetRows: (_fileName, contentBase64) => {
        try {
          return JSON.parse(Buffer.from(contentBase64, 'base64').toString('utf8')) as string[][];
        } catch {
          return null;
        }
      },
    },
    lineIdentity: {
      verifyIdToken: (idToken) => lineTokens.get(idToken) ?? null,
    },
    slips: {},
    messenger: {},
    clock: { now: () => now },
    random: {
      uuid: () => `00000000-0000-4000-8000-${String(++uuidCounter).padStart(12, '0')}`,
    },
  };

  return {
    deps,
    lineTokens,
    bindings,
    staff,
    sessions,
    depositAccounts,
    auditLog,
    bindingThrottles,
    addBinding: (partial) => {
      const binding: LineBinding = {
        id: `binding-${bindings.length + 1}`,
        pinHash: '',
        pinSalt: '',
        pinFailedAttempts: 0,
        pinLocked: false,
        consentVersion: 'test',
        consentAt: now.toISOString(),
        boundAt: now.toISOString(),
        unboundAt: '',
        unboundBy: '',
        ...partial,
      };
      bindings.push(binding);
      return binding;
    },
    setNow: (date) => {
      now = date;
    },
    advanceMinutes: (minutes) => {
      now = new Date(now.getTime() + minutes * 60_000);
    },
  };
}
