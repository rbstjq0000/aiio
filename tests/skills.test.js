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

// 쌍단검(제드) W 그림자 + Q: 그림자에서도 수리검이 나감, W 다시 누르면 자리 바꿈
{
  const { g, a, d } = duel('daggers', 600);
  d.y = 300;
  aimAt(a, 0, 400); // 그림자를 아래쪽에 보냄
  cast(g, a, 'w');
  const sh = g.areas.find((x) => x.kind === 'shadow');
  assert.ok(sh, '그림자 생성');
  run(g, 0.3);
  aimAt(a, d.x, d.y);
  const hp0 = d.hp;
  const hits = [];
  cast(g, a, 'q');
  for (let t = 0; t < 0.8; t += DT) {
    g.step(DT);
    for (const e of g.events) if (e.e === 'hit' && e.id === d.id) hits.push(e.a);
    g.clearEvents();
  }
  assert.ok(hits.length >= 2, `수리검 적중 ${hits.length}회`);
  const sx = sh.x;
  const sy = sh.y;
  cast(g, a, 'w');
  assert.ok(Math.hypot(a.x - sx, a.y - sy) < 30, '그림자와 자리 바꿈');
  ok(`제드 그림자: 수리검 ${hits.length}발 적중 + W 재사용으로 자리 바꿈 (${Math.round(hp0 - d.hp)} 피해)`);
}

// 쌍단검(제드) R 죽음의 표식: 3초 뒤 그동안 준 피해의 일부가 터짐
{
  const { g, a, d } = duel('daggers', 300);
  aimAt(a, d.x, d.y);
  cast(g, a, 'r');
  assert.ok(d.st.mark, '표식');
  assert.ok(a.st.iframeT > 0, '잠깐 무적');
  a.input.at = d.id;
  a.input.atk = true;
  let popped = false;
  for (let t = 0; t < 3.3; t += DT) {
    g.step(DT);
    for (const e of g.events) if (e.e === 'markpop') popped = true;
    g.clearEvents();
  }
  assert.ok(popped, '표식 폭발');
  ok('제드 죽음의 표식: 순간이동 + 무적 + 3초 뒤 폭발');
}

// 대검(다리우스) 출혈 중첩 + R 단두대: 처치하면 궁 게이지 100%로 다시 사용 가능
{
  const { g, a, d } = duel('greatsword', 90);
  a.input.at = d.id;
  a.input.atk = true;
  for (let t = 0; t < 2.5; t += DT) g.step(DT);
  assert.ok(d.st.bleed && d.st.bleed.n >= 3, `출혈 ${d.st.bleed && d.st.bleed.n}중첩`);
  a.input.atk = false;
  run(g, 0.6);
  d.hp = 300;
  a.ult = 100;
  aimAt(a, d.x, d.y);
  cast(g, a, 'r');
  assert.ok(!d.alive, `단두대 실패 hp ${d.hp}`);
  assert.equal(a.ult, 100);
  ok('다리우스 출혈 중첩 + 단두대 처치 시 궁 초기화');
}

// 화염(브랜드) E: 불타는 적이면 주변으로 번짐 / R: 적 사이를 튕김
{
  const { g, a, d } = duel('firestaff', 400);
  const b = g.addPlayer({ name: 'B', weapon: 'greatsword' });
  b.x = 450;
  b.y = 120;
  b.invulnT = 0;
  g.rebuildUnits();
  d.st.burnT = 1;
  const hb = b.hp;
  aimAt(a, d.x, d.y);
  cast(g, a, 'e');
  assert.ok(b.hp < hb, '불이 옆 적에게 번짐');
  a.ult = 100;
  const h1 = d.hp;
  const h2 = b.hp;
  run(g, 0.4);
  cast(g, a, 'r');
  run(g, 3);
  assert.ok(d.hp < h1 && b.hp < h2, '불길의 폭주가 두 적을 모두 맞힘');
  ok('브랜드 화염 확산 번짐 + 불길의 폭주 튕김');
}

// 창(자르반) W 보호막, R 격투장에 갇히면 못 나감
{
  const { g, a, d } = duel('spear', 300);
  cast(g, a, 'w');
  assert.ok(a.st.shield > 100, '황금 방패 보호막');
  a.ult = 100;
  run(g, 0.3);
  aimAt(a, d.x, d.y);
  cast(g, a, 'r');
  run(g, 0.6);
  for (let t = 0; t < 1.5; t += DT) {
    d.input.mx = 1;
    d.input.my = 0;
    g.step(DT);
  }
  assert.ok(Math.hypot(d.x - 300, d.y) < 320, `격투장 탈출함 ${Math.round(d.x)}`);
  ok('자르반 황금 방패 + 격투장 가두기');
}

// 정글 몬스터: 먼저 때리기 전엔 공격하지 않음, 멀리 끌고 가면 돌아가며 회복
{
  const g = new Game({ seed: 4, fillTo: 1 });
  const p = g.addPlayer({ name: 'A' });
  g.start();
  const camp = g.camps.find((c) => c.alive && c.type === 'large');
  p.x = camp.x + 120;
  p.y = camp.y;
  p.invulnT = 0;
  const hp0 = p.hp;
  for (let t = 0; t < 3; t += DT) g.step(DT);
  assert.ok(p.hp >= hp0 - 1, '가만히 있는 몬스터');
  const m = g.byId.get(camp.mobs[0]);
  g.dealDamage(p, m, 200, { kind: 'basic', pre: true });
  assert.equal(m.target, p.id);
  p.x = camp.x + 1500;
  for (let t = 0; t < 8; t += DT) g.step(DT);
  assert.ok(m.hp >= m.maxHp - 1 && !m.target, `집으로 돌아가 회복 ${Math.round(m.hp)}/${Math.round(m.maxHp)}`);
  ok('정글: 먼저 안 때리면 가만히 + 끌고 가면 돌아가 회복');
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

// 롤식 대상 지정 기본 공격: 원거리는 움직이는 대상을 따라가 맞고, 근접은 반 걸음 물러나도 맞음
{
  const { g, a, d } = duel('longbow', 600);
  aimAt(a, 0, 600); // 커서는 엉뚱한 방향
  a.input.at = d.id;
  a.input.atk = true;
  const hp0 = d.hp;
  for (let t = 0; t < 1.2; t += DT) {
    d.y += 120 * DT; // 옆으로 걷는 중
    g.step(DT);
  }
  assert.ok(d.hp < hp0, '원거리 대상 지정 공격 적중');
  ok('대상 지정 기본 공격(원거리): 커서와 무관하게 대상을 맞힘');
}
{
  const { g, a, d } = duel('greatsword', 110);
  aimAt(a, -300, 0);
  a.input.at = d.id;
  a.input.p[PRESS.atk]++;
  g.step(DT);
  d.x += 25;
  const hp0 = d.hp;
  run(g, 0.3);
  assert.ok(d.hp < hp0, '근접 대상 지정 공격 적중');
  ok('대상 지정 기본 공격(근접): 준비 중 물러나도 맞음');
}

// D 구르기: 커서 방향으로 이동 + 잠깐 무적
{
  const { g, a, d } = duel('longbow', 400);
  aimAt(a, 0, 500);
  const y0 = a.y;
  a.input.p[PRESS.d]++;
  g.step(DT);
  assert.ok(a.st.iframeT > 0, '구르기 무적');
  const hp0 = a.hp;
  g.dealDamage(d, a, 100, { kind: 'basic', pre: true });
  assert.equal(a.hp, hp0, '구르는 중엔 피해 무시');
  run(g, 0.3);
  assert.ok(a.y - y0 > 150, `구른 거리 ${Math.round(a.y - y0)}`);
  assert.ok(a.cd.d > 6, '구르기 쿨타임');
  ok('D 구르기: 커서 방향 이동 + 무적 + 쿨타임');
}

for (const r of results) console.log(`- ${r}`);
console.log('skills.test 통과');
