// 직업 스킬 메커니즘 검증: 끌어당기기, 깃발 돌진, 처형, 강화 공격, 유도탄, 합성, 오브 무적 등
import assert from 'node:assert/strict';
import { Game, PRESS } from '../shared/sim.js';
import * as C from '../shared/constants.js';
import { runeResult, makeItem } from '../shared/items.js';

const DT = C.DT;

// 몬스터·장애물 없는 빈 공간에 A(공격자)와 D(허수아비)를 세움
function duel(weapon, dx = 300, grade = 0) {
  const g = new Game({ seed: 3, fillTo: 2 });
  const a = g.addPlayer({ name: 'A', weapon });
  const d = g.addPlayer({ name: 'D', weapon: 'greatsword' });
  g.start();
  g.monsters.length = 0;
  g.rebuildUnits();
  a.x = 0;
  a.y = 0;
  d.x = dx;
  d.y = 0;
  a.invulnT = d.invulnT = 0;
  a.grade = { q: grade, w: grade, e: grade };
  a.ult = 100;
  return { g, a, d };
}
function aimAt(a, x, y) {
  a.input.aim = Math.atan2(y - a.y, x - a.x);
  a.input.cx = x;
  a.input.cy = y;
}
function cast(g, a, key) {
  a.input.p[PRESS[key]]++;
  g.step(DT);
}
function run(g, sec) {
  for (let t = 0; t < sec; t += DT) g.step(DT);
}
const results = [];
const ok = (name) => results.push(name);

// 대검 E 포획: 앞의 적을 끌어당김
{
  const { g, a, d } = duel('greatsword', 260);
  aimAt(a, d.x, d.y);
  cast(g, a, 'e');
  run(g, 0.6);
  assert.ok(d.x < 120, `포획 후 거리 ${d.x.toFixed(0)}`);
  ok('대검 포획: 260 → ' + Math.round(d.x));
}

// 대검 W 결정타: 다음 기본 공격 강화 + 둔화, 1회 소모
{
  const { g, a, d } = duel('greatsword', 80);
  aimAt(a, d.x, d.y);
  cast(g, a, 'w');
  assert.ok(a.st.empT > 0 && a.st.hasteT > 0);
  const hp0 = d.hp;
  a.input.p[PRESS.atk]++;
  run(g, 0.3);
  assert.ok(hp0 - d.hp > 140, `강화 공격 피해 ${(hp0 - d.hp).toFixed(0)}`);
  assert.ok(a.st.emp === null && d.st.slows.length > 0);
  ok(`대검 결정타: 강화 기본 공격 ${Math.round(hp0 - d.hp)}`);
}

// 대검 Q 회오리: 바깥 고리가 안쪽보다 강하고 회복
{
  const near = duel('greatsword', 60);
  aimAt(near.a, near.d.x, near.d.y);
  cast(near.g, near.a, 'q');
  run(near.g, 0.5);
  const far = duel('greatsword', 160);
  far.a.hp = 500;
  aimAt(far.a, far.d.x, far.d.y);
  cast(far.g, far.a, 'q');
  run(far.g, 0.5);
  const inner = near.d.maxHp - near.d.hp;
  const outer = far.d.maxHp - far.d.hp;
  assert.ok(outer > inner * 1.3, `바깥 ${outer} 안쪽 ${inner}`);
  assert.ok(far.a.hp > 500);
  ok(`대검 회오리: 안쪽 ${Math.round(inner)} / 바깥 ${Math.round(outer)} + 회복`);
}

// 창 E 깃발 → Q 깃발 돌진 + 기절
{
  const { g, a, d } = duel('spear', 420);
  aimAt(a, d.x, d.y);
  cast(g, a, 'e');
  run(g, 0.4);
  assert.ok(g.areas.some((x) => x.kind === 'flag' && x.fired));
  aimAt(a, d.x, d.y);
  cast(g, a, 'q');
  let stunned = false;
  for (let t = 0; t < 0.6; t += DT) {
    g.step(DT);
    if (d.st.stunT > 0) stunned = true;
  }
  assert.ok(a.x > 300, `돌진 후 위치 ${a.x.toFixed(0)}`);
  assert.ok(stunned, '깃발 돌진 기절');
  assert.ok(!g.areas.some((x) => x.kind === 'flag'), '깃발 소모');
  ok(`창 깃발 돌진: ${Math.round(a.x)}까지 이동 + 기절`);
}

// 쌍단검 R 처형: 처형선 아래면 즉사, 처치 시 궁 게이지 반환
{
  const { g, a, d } = duel('daggers', 200);
  d.hp = 380;
  aimAt(a, d.x, d.y);
  cast(g, a, 'r');
  assert.ok(!d.alive, `처형 실패 hp ${d.hp}`);
  assert.equal(a.ult, 60);
  ok('쌍단검 처형: 즉사 + 궁 게이지 60% 반환');
}

// 쌍단검 Q 영웅: 수리검 3개지만 한 대상에겐 한 번만
{
  const { g, a, d } = duel('daggers', 150, 3);
  aimAt(a, d.x, d.y);
  const hits = [];
  cast(g, a, 'q');
  for (let t = 0; t < 0.5; t += DT) {
    g.step(DT);
    for (const e of g.events) if (e.e === 'hit' && e.id === d.id) hits.push(e.a);
    g.clearEvents();
  }
  assert.equal(hits.length, 1, `수리검 적중 횟수 ${hits.length}`);
  ok('쌍단검 수리검(영웅): 3발 중 한 대상 1회 적중');
}

// 장궁 E 비전 이동: 유도탄이 휘어서 맞음
{
  const { g, a, d } = duel('longbow', 500);
  d.y = 250;
  aimAt(a, -200, 0);
  const hp0 = d.hp;
  cast(g, a, 'e');
  run(g, 1.2);
  assert.ok(d.hp < hp0, '유도탄 적중');
  ok('장궁 비전 이동: 반대로 이동해도 유도탄 적중');
}

// 장궁 Q 적중 시 다른 스킬 쿨 1초 감소
{
  const { g, a, d } = duel('longbow', 500);
  a.cd.w = 5;
  aimAt(a, d.x, d.y);
  cast(g, a, 'q');
  run(g, 0.6);
  assert.ok(a.cd.w < 5 - 1 - 0.3, `W 쿨 ${a.cd.w.toFixed(2)}`);
  ok('장궁 신비한 화살: 적중 시 쿨 감소');
}

// 화염 Q: 불타는 적만 기절
{
  const { g, a, d } = duel('firestaff', 400);
  aimAt(a, d.x, d.y);
  cast(g, a, 'q');
  let stun1 = false;
  for (let t = 0; t < 0.8; t += DT) {
    g.step(DT);
    if (d.st.stunT > 0) stun1 = true;
  }
  assert.ok(!stun1, '처음엔 기절 안 함');
  a.cd.q = 0;
  d.st.ccImmT = 0;
  assert.ok(d.st.burnT > 0, '화상 상태');
  cast(g, a, 'q');
  let stun2 = false;
  for (let t = 0; t < 0.8; t += DT) {
    g.step(DT);
    if (d.st.stunT > 0) stun2 = true;
  }
  assert.ok(stun2, '불타는 적 기절');
  ok('화염구: 불타는 적만 기절');
}

// 서리 Q 속박
{
  const { g, a, d } = duel('froststaff', 400);
  aimAt(a, d.x, d.y);
  cast(g, a, 'q');
  let rooted = false;
  for (let t = 0; t < 0.9; t += DT) {
    g.step(DT);
    if (d.st.rootT > 0) rooted = true;
  }
  assert.ok(rooted);
  ok('서리 속박: 속박 확인');
}

// 각인 합성 규칙
assert.equal(runeResult(1, 1), 2);
assert.equal(runeResult(1, 3), 3);
assert.equal(runeResult(2, 1), -1);
assert.equal(runeResult(4, 4), -1);
{
  const { g, a } = duel('greatsword', 900);
  a.grade.q = 2;
  const gi = g.dropItem(makeItem('skill', 'q', 2), a.x, a.y);
  g.equip(a, gi);
  assert.equal(a.grade.q, 3);
  ok('각인 합성: 희귀 + 희귀 → 영웅');
}

// 오브를 주우면 2초 무적
{
  const { g, a } = duel('greatsword', 900);
  g.groundOrbs.push({ i: 0, x: a.x, y: a.y, t: 5, taken: false });
  g.altars[0].state = 'dropped';
  g.step(DT);
  assert.equal(a.orbs.length, 1);
  assert.ok(a.invulnT > 1.8);
  ok('오브 획득: 2초 무적');
}

// 가만히 있어도 체력이 조금씩 참
{
  const { g, a } = duel('greatsword', 900);
  a.hp = 500;
  a.lastDmgT = g.time;
  run(g, 2);
  assert.ok(a.hp > 500 + 10 && a.hp < 500 + 40, `전투 중 회복 ${a.hp - 500}`);
  run(g, 6);
  assert.ok(a.hp > 600);
  ok("체력 회복: 전투 중에도 조금씩, 4초 뒤 빠르게");
}

for (const r of results) console.log(`- ${r}`);
console.log('skills.test 통과');
