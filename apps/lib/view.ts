/** แสดงข้อความในการ์ดหลัก ใช้ textContent เสมอเพื่อไม่ให้ข้อมูลจากภายนอกกลายเป็น HTML */
export function showStatus(lines: string[], options: { error?: boolean; retry?: boolean } = {}): void {
  const card = document.getElementById('status');
  if (!card) return;
  card.replaceChildren(
    ...lines.map((line) => {
      const p = document.createElement('p');
      p.textContent = line;
      if (options.error) p.className = 'error';
      return p;
    }),
  );
  if (options.retry) {
    const button = document.createElement('button');
    button.textContent = 'ลองใหม่';
    button.addEventListener('click', () => location.reload());
    card.append(button);
  }
}

export function requireEnv(name: string, value: string | undefined): string {
  if (!value) throw new Error(`ยังไม่ได้ตั้งค่า ${name} ในไฟล์ .env`);
  return value;
}
