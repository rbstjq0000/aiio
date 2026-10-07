// 설계 목표 검증 (docs/GAME_DESIGN.md): 무기 상성(가위바위보), 등급 격차, CC 규칙, 16인 매치 흐름
import assert from 'node:assert/strict';
import { Game } from '../shared/sim.js';
import * as C from '../shared/constants.js';
import { WEAPON_IDS, WEAPONS, RARITIES, MYTHIC } from '../shared/items.js';

const DT = C.DT;
const results = [];

// 1) 무기 상성: 같은 등급·같은 실력의 봇 둘을 빈 들판에서 싸움 붙임
//    단도 > 두루마리 > 표창 > 단도: 스킬 구성에서 오는 경향 (정확히 6:4는 아님, 극상성 금지)
function duelMatrix(n, rarity) {
  const out = {};
  for (let i = 0; i < WEAPON_IDS.length; i++) {
    for (let j = i + 1; j < WEAPON_IDS.length; j++) {
      const wa = WEAPON_IDS[i];
      const wb = WEAPON_IDS[j];
      const win = { [wa]: 0, [wb]: 0 };
      for (let k = 0; k < n; k++) {
        const g = new Game({ seed: 1000 + k * 7 + i * 131 + j * 17, fillTo: 2 });
        const a = g.addPlayer({ name: 'A', isBot: true, weapon: wa, skill: 0.7 });
        const b = g.addPlayer({ name: 'B', isBot: true, weapon: wb, skill: 0.7 });
        g.start();
        g.land();
        g.monsters.length = 0;
        g.camps.length = 0;
        g.lairs.length = 0;
        g.chests.length = 0;
        g.obstacles = [];
        g.obstacles.walls = [];
        g.walls = [];
        g.bushes = [];
        g.nav = null;
        for (const p of [a, b]) {
          p.gear.weapon.rarity = rarity;
          g.recomputeStats(p);
          p.hp = p.maxHp;
          p.invulnT = 0;
          p.brain.aggro = 1.2;
        }
        a.x = -300;
        a.y = 0;
        b.x = 300;
        b.y = 0;
        g.time = 400;
        g.zone.dps = 0;
        g.rebuildUnits();
        const t0 = g.time;
        while (a.alive && b.alive && g.time - t0 < 60) {
          g.step(DT);
          g.clearEvents();
        }
        if (a.alive !== b.alive) win[a.alive ? wa : wb]++;
      }
      out[`${wa}-${wb}`] = win;
    }
  }
  return out;
}
const N = +(process.env.DUELS || 150);
for (const rarity of [2]) {
  const m = duelMatrix(N, rarity);
  const line = [];
  for (const win of Object.values(m)) {
    const [x, y] = Object.keys(win);
    const [good, bad] = WEAPONS[x].beats === y ? [x, y] : [y, x];
    const rate = win[good] / (win[good] + win[bad]);
    line.push(`${WEAPONS[good].name} > ${WEAPONS[bad].name} ${win[good]}:${win[bad]}`);
    assert.ok(rate > 0.47 && rate < 0.75, `${RARITIES[rarity].name} ${good} vs ${bad} 승률 ${(rate * 100).toFixed(0)}%`);
  }
  results.push([`상성 (${RARITIES[rarity].name}, ${N}판씩)`, line.join(' · ')]);
}

// 2) 등급 격차: 일반 → 신화 (피해 배율 × 체력 배율)이 1.5배를 넘지 않음 (증강·상성이 뒤집을 여지)
const gap = RARITIES[MYTHIC].mult ** 2;
results.push(['일반 → 신화 격차', `${gap.toFixed(2)}배`]);
assert.ok(gap > 1.3 && gap <= 1.5);

// 3) CC 규칙: 최대 1초, 이후 1.5초 면역. 단도는 30% 짧게
{
  const g = new Game({ seed: 1, fillTo: 2 });
  const p = g.addPlayer({ name: 'A', weapon: 'scroll' });
  const q = g.addPlayer({ name: 'B', weapon: 'dagger' });
  g.start();
  g.land();
  g.rebuildUnits();
  p.invulnT = q.invulnT = 0;
  assert.equal(g.stun(p, 3), true);
  assert.equal(p.st.stunT, 1, '기절은 최대 1초');
  for (let i = 0; i < 35; i++) g.updateStatuses(DT);
  assert.equal(g.stun(p, 1), false, '기절 직후 면역');
  for (let i = 0; i < 50; i++) g.updateStatuses(DT);
  assert.equal(g.stun(p, 1), true, '면역 종료 후 다시 기절');
  g.root(q, 1);
  assert.ok(Math.abs(q.st.rootT - 0.6) < 1e-9, '단도 그림자 탈출');
  results.push(['CC 규칙', '최대 1초 / 이후 1.5초 면역 / 단도 -40%']);
}

// 4) 16인 매치: 약 10분, 상자·강화석·증강·에픽이 돌고 마지막 1명이 남음
const SEEDS = (process.env.SEEDS || '1').split(',').map(Number);
for (const seed of SEEDS) {
  const g = new Game({ seed, fillTo: 16 });
  g.start();
  const c = { kill: 0, chest: 0, aug: 0, epic: 0, upgrade: 0, legend: 0, assist: 0 };
  let firstKill = null;
  const alive = {};
  const t0 = performance.now();
  while (g.state === 'landing' || g.state === 'running') {
    g.step(DT);
    for (const e of g.events) {
      if (e.e === 'kill') {
        c.kill++;
        if (firstKill == null) firstKill = g.time;
      }
      if (e.e === 'chest' && !e.aug) c.chest++;
      if (e.e === 'aug') c.aug++;
      if (e.e === 'epicdown') c.epic++;
      if (e.e === 'upgrade') c.upgrade++;
      if (e.e === 'legend') c.legend++;
      if (e.e === 'assist') c.assist++;
    }
    g.clearEvents();
    for (const m of [120, 240, 360, 480]) if (alive[m] == null && g.state === 'running' && g.time >= m) alive[m] = g.aliveCount();
  }
  const ms = performance.now() - t0;
  assert.ok(g.results && g.results.length === 16);
  assert.equal(g.results[0].placement, 1);
  assert.ok(g.time > 500 && g.time < 660, `판 길이 ${g.time.toFixed(0)}초 (목표 약 10분)`);
  assert.ok(alive[120] >= 12, '초반 2분은 천천히 성장 (거의 다 살아 있음)');
  assert.ok(c.chest >= 30, `상자 ${c.chest}개`);
  assert.ok(c.epic >= 1, '에픽 몬스터가 한 번은 잡힘');
  assert.ok(c.aug >= 5, `증강 ${c.aug}개`);
  assert.ok(c.upgrade >= 3, '강화석으로 등급이 오름');
  const w = g.results[0];
  results.push([
    `매치 seed ${seed}`,
    `${Math.floor(g.time / 60)}:${String(Math.floor(g.time % 60)).padStart(2, '0')} 종료 · 우승 ${w.name}(${WEAPONS[w.weapon].name} ${RARITIES[w.rarity].name}, ${w.kills}킬, 증강 ${w.augs.length}) · 첫 킬 ${firstKill?.toFixed(0)}s · 생존 2분 ${alive[120]} / 4분 ${alive[240]} / 6분 ${alive[360]} / 8분 ${alive[480]} · ${JSON.stringify(c)} · ${(g.tick / (ms / 1000) / 30).toFixed(0)}배속`,
  ]);
}

for (const [k, v] of results) console.log(`- ${k}: ${v}`);
console.log('design.test 통과');
