// 서버 스모크 테스트: 서버를 띄우고 클라이언트 2명이 공개 매칭 → 시작 → 스냅샷 수신
import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import WebSocket from 'ws';

const PORT = 18000 + Math.floor(Math.random() * 1000);
const srv = spawn(process.execPath, ['server/index.js'], { env: { ...process.env, PORT: String(PORT), LOBBY_COUNTDOWN: '1' }, stdio: ['ignore', 'pipe', 'inherit'] });
await new Promise((res) => srv.stdout.once('data', res));

function connect(name) {
  return new Promise((res) => {
    const ws = new WebSocket(`ws://localhost:${PORT}/ws`);
    const c = { ws, msgs: [], snaps: 0, start: null, me: null };
    ws.on('message', (d) => {
      const m = JSON.parse(d);
      if (m.t === 'start') c.start = m;
      else if (m.t === 'snap') {
        c.snaps++;
        if (m.me) c.me = m.me;
      } else c.msgs.push(m);
    });
    ws.on('open', () => {
      ws.send(JSON.stringify({ t: 'join', mode: 'public', name, weapon: 'longbow' }));
      res(c);
    });
  });
}

try {
  const a = await connect('테스터A');
  const b = await connect('<b>해킹</b>');
  // 큰 맵은 길찾기 격자를 만드는 데 시간이 걸려 시작 메시지를 최대 10초 기다림
  for (let i = 0; i < 100 && !(a.start && b.start); i++) await new Promise((r) => setTimeout(r, 100));
  assert.ok(a.start && b.start, '게임 시작 메시지 수신');
  assert.equal(a.start.roster.length, 16, '봇으로 16명 채움');
  assert.ok(!a.start.roster.some((r) => r[1].includes('<')), '이름 정리됨');
  // 입력 전송
  for (let i = 1; i <= 30; i++) {
    a.ws.send(JSON.stringify({ t: 'in', s: i, mx: 1, my: 0, a: 0, k: true, cx: 0, cy: 0, p: [i, 0, 0, 0, 0, 0, 0] }));
    await new Promise((r) => setTimeout(r, 33));
  }
  await new Promise((r) => setTimeout(r, 300));
  assert.ok(a.snaps > 40, `스냅샷 수신 (${a.snaps})`);
  assert.ok(a.me && a.me.ack >= 25, `입력 확인 번호 (${a.me && a.me.ack})`);
  const res = await fetch(`http://localhost:${PORT}/api/status`);
  assert.equal(res.status, 200);
  const page = await fetch(`http://localhost:${PORT}/`);
  assert.equal(page.status, 200);
  const bad = await fetch(`http://localhost:${PORT}/../package.json`);
  assert.equal(bad.status, 404);
  a.ws.close();
  b.ws.close();
  console.log(`server.test 통과 (스냅샷 ${a.snaps}개, ack ${a.me.ack})`);
} finally {
  srv.kill();
}
