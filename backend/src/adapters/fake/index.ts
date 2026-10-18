// ตัวปลอมในหน่วยความจำของตัวกลางทั้งหมด ใช้ในการทดสอบเท่านั้น
import type { DocumentContent, Holiday, LineGroup } from '../../../../shared/api';
import type {
  AuditEntry,
  BindingThrottle,
  DepositAccount,
  Deps,
  FileCategory,
  LineBinding,
  LineUser,
  MemberRequest,
  PayoutAccount,
  SlipReading,
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
  payoutAccounts: PayoutAccount[];
  requests: MemberRequest[];
  holidays: Holiday[];
  settings: Map<string, string>;
  lineGroups: LineGroup[];
  /** fileId → ไฟล์ที่บันทึกไว้ */
  files: Map<string, DocumentContent & { category: FileCategory }>;
  /** ข้อความที่ส่งผ่าน LINE ตามลำดับ */
  sentMessages: { to: string; text: string }[];
  /** ตั้งเป็น true เพื่อจำลองว่า LINE ส่งข้อความไม่สำเร็จ */
  messengerDown: boolean;
  groupNames: Map<string, string>;
  /** contentBase64 ของสลิป → ผลที่ SlipOK ปลอมอ่านได้ ไม่มีใน map = อ่านไม่ได้ */
  slipReadings: Map<string, SlipReading>;
  /** จำนวนครั้งที่เรียก SlipOK ปลอม */
  slipCalls: number;
  cache: Map<string, string>;
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
  const payoutAccounts: PayoutAccount[] = [];
  const requests: MemberRequest[] = [];
  const holidays: Holiday[] = [];
  const settings = new Map<string, string>();
  const lineGroups: LineGroup[] = [];
  const files = new Map<string, DocumentContent & { category: FileCategory }>();
  const sentMessages: { to: string; text: string }[] = [];
  const groupNames = new Map<string, string>();
  const slipReadings = new Map<string, SlipReading>();
  const cache = new Map<string, string>();
  let fileCounter = 0;
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
      getCache: (key) => cache.get(key) ?? null,
      putCache: (key, value) => {
        cache.set(key, value);
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
      listPayoutAccounts: () => payoutAccounts.map((a) => ({ ...a })),
      savePayoutAccount: (account) => {
        const index = payoutAccounts.findIndex((a) => a.id === account.id);
        if (index >= 0) payoutAccounts[index] = { ...account };
        else payoutAccounts.push({ ...account });
      },
      listRequests: () => requests.map((r) => ({ ...r })),
      saveRequest: (request) => {
        const index = requests.findIndex((r) => r.id === request.id);
        if (index >= 0) requests[index] = { ...request };
        else requests.push({ ...request });
      },
      listHolidays: () => holidays.map((h) => ({ ...h })),
      saveHoliday: (holiday) => {
        const index = holidays.findIndex((h) => h.date === holiday.date);
        if (index >= 0) holidays[index] = { ...holiday };
        else holidays.push({ ...holiday });
      },
      deleteHoliday: (date) => {
        const index = holidays.findIndex((h) => h.date === date);
        if (index >= 0) holidays.splice(index, 1);
      },
      getSetting: (key) => settings.get(key) ?? '',
      setSetting: (key, value) => {
        settings.set(key, value);
      },
      listLineGroups: () => lineGroups.map((g) => ({ ...g })),
      saveLineGroup: (group) => {
        const index = lineGroups.findIndex((g) => g.groupId === group.groupId);
        if (index >= 0) lineGroups[index] = { ...group };
        else lineGroups.push({ ...group });
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
      saveFile: (category, fileName, mimeType, contentBase64) => {
        const fileId = `file-${++fileCounter}`;
        files.set(fileId, { category, fileName, mimeType, contentBase64 });
        return fileId;
      },
      buildSpreadsheet: (fileName, sheets) => ({
        fileName,
        mimeType: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
        contentBase64: Buffer.from(JSON.stringify(sheets), 'utf8').toString('base64'),
      }),
      readFile: (fileId) => {
        const file = files.get(fileId);
        return file ? { fileName: file.fileName, mimeType: file.mimeType, contentBase64: file.contentBase64 } : null;
      },
    },
    lineIdentity: {
      verifyIdToken: (idToken) => lineTokens.get(idToken) ?? null,
    },
    slips: {
      read: (imageBase64) => {
        world.slipCalls += 1;
        const reading = slipReadings.get(imageBase64);
        return reading ? { ...reading } : null;
      },
    },
    messenger: {
      pushText: (to, text) => {
        if (world.messengerDown) throw new Error('LINE push failed: HTTP 500');
        sentMessages.push({ to, text });
      },
      getGroupName: (groupId) => groupNames.get(groupId) ?? null,
    },
    clock: { now: () => now },
    random: {
      uuid: () => `00000000-0000-4000-8000-${String(++uuidCounter).padStart(12, '0')}`,
    },
  };

  const world: FakeWorld = {
    deps,
    lineTokens,
    bindings,
    staff,
    sessions,
    depositAccounts,
    auditLog,
    bindingThrottles,
    payoutAccounts,
    requests,
    holidays,
    settings,
    lineGroups,
    files,
    sentMessages,
    messengerDown: false,
    groupNames,
    slipReadings,
    slipCalls: 0,
    cache,
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
  return world;
}
