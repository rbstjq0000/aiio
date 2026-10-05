// 브라우저 화면 점검: 메뉴 → 연습 모드 → 전투 화면 스크린샷 + 콘솔 오류 수집
// 사용: node tests/screens.mjs [url] [outdir]
import { chromium } from 'playwright';
import fs from 'node:fs';

const url = process.argv[2] || 'http://localhost:8080/';
const out = process.argv[3] || 'screens';
fs.mkdirSync(out, { recursive: true });

const browser = await chromium.launch({ executablePath: process.env.CHROME || undefined });
const page = await browser.newPage({ viewport: { width: 1440, height: 860 } });
const errors = [];
page.on('pageerror', (e) => errors.push(`pageerror: ${e.message}`));
page.on('console', (m) => {
  if (m.type() === 'error') errors.push(`console: ${m.text()}`);
});

await page.goto(url);
await page.waitForTimeout(1200);
await page.screenshot({ path: `${out}/1-menu.png` });

await page.click('#btn-store');
await page.waitForTimeout(500);
await page.screenshot({ path: `${out}/2-store.png` });
await page.click('[data-close=store]');

await page.fill('#name', '테스터');
await page.click('#btn-practice');
await page.waitForTimeout(1500);
await page.screenshot({ path: `${out}/3-lobby.png` });
await page.waitForTimeout(3500);

// 이동 + 공격 + 스킬
await page.mouse.move(900, 400);
await page.keyboard.down('KeyD');
await page.waitForTimeout(800);
await page.keyboard.up('KeyD');
await page.mouse.down();
await page.waitForTimeout(600);
await page.mouse.up();
await page.mouse.click(900, 400, { button: 'right' });
await page.keyboard.press('KeyQ');
await page.waitForTimeout(250);
await page.screenshot({ path: `${out}/4-combat.png` });
await page.keyboard.press('Space');
await page.waitForTimeout(150);
await page.screenshot({ path: `${out}/5-dash.png` });

// 시간을 빨리 돌려 오브 단계 확인 (연습 모드 게임 객체에 직접 접근)
await page.evaluate(() => {
  const c = window.__styx.client();
  const g = c.t.game;
  for (let i = 0; i < 30 * 125; i++) g.step(1 / 30), g.clearEvents();
});
await page.waitForTimeout(1500);
await page.screenshot({ path: `${out}/6-orbphase.png` });

await page.evaluate(() => {
  const g = window.__styx.client().t.game;
  while (g && g.state === 'running') g.step(1 / 30), g.clearEvents();
});
await page.waitForTimeout(1200);
await page.screenshot({ path: `${out}/7-end.png` });

const stats = await page.evaluate(() => {
  const c = window.__styx.client();
  if (!c) return {};
  return { snaps: c.snaps.length, me: c.me && { hp: c.me.hp, lv: c.me.lv, al: c.me.al }, fps: null };
});
console.log(JSON.stringify(stats));
console.log(errors.length ? errors.join('\n') : '콘솔 오류 없음');
await browser.close();
