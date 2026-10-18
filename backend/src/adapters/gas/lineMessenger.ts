import type { Messenger } from '../ports';

const API = 'https://api.line.me/v2/bot';

/** ส่งข้อความผ่าน LINE Messaging API ด้วย channel access token ของ LINE OA */
export function createLineMessenger(channelAccessToken: () => string): Messenger {
  const headers = () => ({ Authorization: `Bearer ${channelAccessToken()}` });

  return {
    pushText(to: string, text: string): void {
      const res = UrlFetchApp.fetch(`${API}/message/push`, {
        method: 'post',
        contentType: 'application/json',
        headers: headers(),
        payload: JSON.stringify({ to, messages: [{ type: 'text', text: text.slice(0, 5000) }] }),
        muteHttpExceptions: true,
      });
      const status = res.getResponseCode();
      if (status !== 200) {
        throw new Error(`LINE push failed: HTTP ${status} ${res.getContentText().slice(0, 200)}`);
      }
    },

    getGroupName(groupId: string): string | null {
      const res = UrlFetchApp.fetch(`${API}/group/${encodeURIComponent(groupId)}/summary`, {
        headers: headers(),
        muteHttpExceptions: true,
      });
      if (res.getResponseCode() !== 200) return null;
      return (JSON.parse(res.getContentText()) as { groupName?: string }).groupName ?? null;
    },
  };
}
