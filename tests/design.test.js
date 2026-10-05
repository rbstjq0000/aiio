// 설계 목표 검증 (docs/COMBAT_DESIGN.md 0장)
import assert from 'node:assert/strict';
import { Game, PRESS } from '../shared/sim.js';
import * as C from '../shared/constants.js';
import { WEAPON_IDS, WEAPONS, RARITIES } from '../shared/items.js';

const DT = C.DT;
const results = [];

// 1) 같은 레벨·장비에서 1,000 체력을 몇 초에 깎는가 (모든 공격이 맞는다고 가정)
const PREF = { greatsword: 70, daggers: 55, longbow: 420, firestaff: 380, froststaff: 360, spear: 120 };
function killTime(weapon) {
  const g = new Game({ seed: 7, fillTo: 2 });
  const a = g.addPlayer({ name: 'A', weapon });
  const d = g.addPlayer({ name: 'D', weapon: 'greatsword' });
  g.start();
  g.monsters.length = 0;
  g.obstacles.length = 0;
  g.rebuildUnits();
  a.x = 0;
  a.y = 0;
  d.x = PREF[weapon];
  d.y = 0;
  a.invulnT = d.invulnT = 0;
  a.ult = 0;
  const t0 = g.time;
  while (d.alive && g.time - t0 < 30) {
    const inp = a.input;
    inp.aim = Math.atan2(d.y - a.y, d.x - a.x);
    inp.cx = d.x;
    inp.cy = d.y;
    inp.atk = true;
    // 근접 무기는 붙어 있도록 이동
    const dist = Math.hypot(d.x - a.x, d.y - a.y);
    inp.mx = dist > PREF[weapon] + 10 ? (d.x - a.x) / dist : 0;
    inp.my = dist > PREF[weapon] + 10 ? (d.y - a.y) / dist : 0;
    for (const k of ['s1', 's2']) if (a.cd[k] <= 0 && !a.act) inp.p[PRESS[k]]++;
    d.input.mx = 0;
    d.input.my = 0;
    g.step(DT);
    g.clearEvents();
    d.st.stunT = 0;
  }
  return g.time - t0;
}
const ttk = {};
for (const w of WEAPON_IDS) ttk[w] = killTime(w);
results.push(['무기별 1,000 체력 처치 시간 (목표 ~5초)', Object.entries(ttk).map(([w, t]) => `${WEAPONS[w].name} ${t.toFixed(1)}s`).join(', ')]);
// 근접 5초 ±0.5, 원거리·CC 무기는 사거리 이점 대신 5~6.2초
const RANGED = new Set(['longbow', 'firestaff', 'froststaff']);
for (const [w, t] of Object.entries(ttk)) {
  const [lo, hi] = RANGED.has(w) ? [5, 6.2] : [4.5, 5.5];
  assert.ok(t >= lo && t <= hi, `${w} 처치 시간 ${t.toFixed(2)}초가 목표(${lo}~${hi}초) 밖`);
}

// 2) 최대 성장 격차: (피해 배율 × 체력 배율)
const maxMult = C.levelMult(C.LEVEL_MAX) * RARITIES[4].mult;
const gap = maxMult * maxMult;
results.push(['최대 성장 격차 (목표 ~2배)', `${gap.toFixed(2)}배`]);
assert.ok(gap > 1.8 && gap < 2.2);

// 3) CC 규칙: 최대 1초, 이후 1.5초 면역
{
  const g = new Game({ seed: 1, fillTo: 2 });
  const p = g.addPlayer({ name: 'A' });
  g.addPlayer({ name: 'B' });
  g.start();
  g.rebuildUnits();
  p.invulnT = 0;
  assert.equal(g.stun(p, 3), true);
  assert.equal(p.st.stunT, 1, '기절은 최대 1초');
  for (let i = 0; i < 35; i++) g.updateStatuses(DT);
  assert.equal(g.stun(p, 1), false, '기절 직후 면역');
  for (let i = 0; i < 50; i++) g.updateStatuses(DT);
  assert.equal(g.stun(p, 1), true, '면역 종료 후 다시 기절');
  results.push(['CC 규칙', '최대 1초 / 이후 1.5초 면역 확인']);
}

// 4) 16인 봇 매치 흐름
const SEEDS = (process.env.SEEDS || '1,2,3').split(',').map(Number);
for (const seed of SEEDS) {
  const g = new Game({ seed, fillTo: 16 });
  g.start();
  const lv = {};
  let firstKill = null;
  const orbTaken = [];
  let kills = 0;
  let max2 = 0;
  let rituals = 0;
  let maxHeld = 0;
  const t0 = performance.now();
  while (g.state === 'running') {
    g.step(DT);
    for (const e of g.events) {
      if (e.e === 'kill') {
        kills++;
        if (firstKill == null) firstKill = g.time;
      }
      if (e.e === 'orbtake') {
        orbTaken.push(`${Math.round(g.time)}s`);
        if (e.n >= 2) max2++;
        maxHeld = Math.max(maxHeld, e.n);
      }
      if (e.e === 'ritual') rituals++;
    }
    g.clearEvents();
    for (const m of [120, 300, 540]) {
      if (lv[m] == null && g.time >= m) {
        const ps = [...g.players.values()];
        lv[m] = (ps.reduce((s, p) => s + p.level, 0) / ps.length).toFixed(1);
      }
    }
  }
  const ms = performance.now() - t0;
  assert.ok(g.results && g.results.length === 16);
  const w = g.results[0];
  results.push([
    `매치 seed ${seed}`,
    `${Math.floor(g.time / 60)}:${String(Math.floor(g.time % 60)).padStart(2, '0')} 종료(${g.endReason}) · 우승 ${w.name}(${WEAPONS[w.weapon].name}, 점수 ${w.score}, 2등 ${g.results[1].score}) · 처치 ${kills}회, 첫 킬 ${firstKill?.toFixed(0)}s · 평균 레벨 2분 ${lv[120]} / 5분 ${lv[300]} / 9분 ${lv[540] ?? '-'} · 오브 획득 ${orbTaken.length}회 (2개 이상 보유 ${max2}회, 최대 ${maxHeld}개, 승천 시도 ${rituals}회) · ${(g.tick / (ms / 1000) / 30).toFixed(0)}배속`,
  ]);
}

for (const [k, v] of results) console.log(`- ${k}: ${v}`);
console.log('design.test 통과');
