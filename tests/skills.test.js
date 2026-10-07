// 무기 스킬·배틀로얄 규칙 검증: 단도·표창·두루마리 스킬, 무기 등급·줍기, 강화석, 증강 3칸·세트·빼앗기,
// 에픽 몬스터·보물, 어시스트·다수 피격, 착지·자기장·현상금
import assert from 'node:assert/strict';
import { Game, PRESS } from '../shared/sim.js';
import * as C from '../shared/constants.js';
import { WEAPONS, RARITIES, STONE_COST, MYTHIC, skillAt, canTake, rollWeaponRarity } from '../shared/items.js';
import { AUG_BY_ID, familyCounts, augValue } from '../shared/augments.js';
import { makeRng } from '../shared/math.js';
import { MAPS } from '../shared/maps.js';

const DT = C.DT;

// 몬스터·장애물 없는 빈 공간에 A(공격자)와 D(허수아비)를 세움
function duel(weapon, dx = 300, rarity = 0) {
  const g = new Game({ seed: 3, fillTo: 3 });
  const a = g.addPlayer({ name: 'A', weapon });
  const d = g.addPlayer({ name: 'D', weapon: 'dagger' });
  const e = g.addPlayer({ name: 'E', weapon: 'dagger' }); // 판이 끝나지 않게 멀리 세워 둠
  g.start();
  g.land();
  g.monsters.length = 0;
  g.lairs.length = 0;
  g.obstacles = [];
  g.obstacles.walls = [];
  g.walls = [];
  g.rebuildUnits();
  a.x = 0;
  a.y = 0;
  d.x = dx;
  d.y = 0;
  e.x = -1500;
  e.y = 1500;
  a.invulnT = d.invulnT = 0;
  a.gear.weapon.rarity = rarity;
  g.recomputeStats(a);
  a.hp = a.maxHp;
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
function hitsOn(g, id, sec) {
  const hits = [];
  for (let t = 0; t < sec; t += DT) {
    g.step(DT);
    for (const e of g.events) if (e.e === 'hit' && e.id === id) hits.push(e.a);
    g.clearEvents();
  }
  return hits;
}
const results = [];
const ok = (name) => results.push(name);

// ---------------- 무기 ----------------
// 단도 W 그림자 + Q: 그림자에서도 수리검이 나감, W 다시 누르면 자리 바꿈
{
  const { g, a, d } = duel('dagger', 600);
  d.y = 300;
  aimAt(a, 0, 400);
  cast(g, a, 'w');
  const sh = g.areas.find((x) => x.kind === 'shadow');
  assert.ok(sh, '그림자 생성');
  run(g, 0.3);
  aimAt(a, d.x, d.y);
  cast(g, a, 'q');
  const hits = hitsOn(g, d.id, 0.8);
  assert.ok(hits.length >= 2, `수리검 적중 ${hits.length}회`);
  const sx = sh.x;
  const sy = sh.y;
  cast(g, a, 'w');
  assert.ok(Math.hypot(a.x - sx, a.y - sy) < 30, '그림자와 자리 바꿈');
  ok(`단도 그림자 분신: 수리검 ${hits.length}발 + W 다시 눌러 자리 바꿈`);
}

// 단도 R 죽음의 표식: 순간이동 + 무적 + 3초 뒤 폭발
{
  const { g, a, d } = duel('dagger', 300);
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
  ok('단도 죽음의 표식: 순간이동 + 무적 + 3초 뒤 폭발');
}

// 표창 R 풍마수리검: 갔다가 돌아오며 같은 적을 두 번 맞힘 / 신화는 3갈래
{
  const { g, a, d } = duel('shuriken', 350);
  aimAt(a, d.x, d.y);
  cast(g, a, 'r');
  const hits = hitsOn(g, d.id, 2.5);
  assert.equal(hits.length, 2, `왕복 적중 ${hits.length}회`);
  assert.ok(!g.projs.some((q) => q.ret), '주인에게 돌아와 사라짐');
  const m = duel('shuriken', 350, MYTHIC);
  aimAt(m.a, m.d.x, m.d.y);
  cast(m.g, m.a, 'r');
  for (let i = 0; i < 30 && !m.g.projs.some((q) => q.ret); i++) m.g.step(DT);
  assert.ok(m.g.projs.filter((q) => q.ret).length === 3, '신화: 3갈래');
  ok('표창 풍마수리검: 왕복 2번 적중, 신화는 3갈래');
}

// 표창 E 공중제비: 뒤로 도약 + 앞으로 둔화 표창 / Q 적중 시 쿨 감소
{
  const { g, a, d } = duel('shuriken', 400);
  aimAt(a, d.x, d.y);
  cast(g, a, 'e');
  run(g, 0.6);
  assert.ok(a.x < -150, `뒤로 이동 ${Math.round(a.x)}`);
  assert.ok(d.st.slows.length > 0, '표창 둔화');
  a.cd.w = 5;
  aimAt(a, d.x, d.y);
  cast(g, a, 'q');
  run(g, 0.6);
  assert.ok(a.cd.w < 5 - 1 - 0.3, `W 쿨 ${a.cd.w.toFixed(2)}`);
  ok('표창 공중제비(뒤로 + 둔화) · 대형 표창 적중 시 쿨 감소');
}

// 두루마리: 불타는 적만 화염구 기절 / 서리 속박 / 눈보라 빙결
{
  const { g, a, d } = duel('scroll', 400);
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
  run(g, 2);
  d.st.ccImmT = 0;
  aimAt(a, d.x, d.y);
  cast(g, a, 'w');
  let rooted = false;
  for (let t = 0; t < 0.9; t += DT) {
    g.step(DT);
    if (d.st.rootT > 0) rooted = true;
  }
  assert.ok(rooted, '서리 속박');
  run(g, 2);
  d.st.ccImmT = 0;
  a.ult = 100;
  aimAt(a, d.x, d.y);
  cast(g, a, 'r');
  let frozen = false;
  for (let t = 0; t < 3; t += DT) {
    d.input.mx = 0;
    d.input.my = 0;
    g.step(DT);
    for (const e of g.events) if (e.e === 'freeze') frozen = true;
    g.clearEvents();
  }
  assert.ok(frozen, '눈보라에 2초 머물면 빙결');
  ok('두루마리: 화염구(불타는 적 기절) · 서리 속박 · 눈보라 빙결');
}

// 무기 등급: 수치 배율과 등급 효과 (고급 = 평타, 희귀 = Q, ..., 신화 = R)
{
  const w = WEAPONS.dagger;
  assert.equal(skillAt(w, 'basic', 0).combo.length, 2);
  assert.equal(skillAt(w, 'basic', 1).combo.length, 3);
  assert.equal(skillAt(w, 'q', 1).dmg, w.q.dmg);
  assert.ok(skillAt(w, 'q', 2).dmg > w.q.dmg);
  assert.equal(skillAt(w, 'r', 4).markPct, w.r.markPct);
  assert.equal(skillAt(w, 'r', 5).markPct, 1);
  const lo = duel('scroll', 900, 0);
  const hi = duel('scroll', 900, 4);
  assert.ok(hi.a.maxHp > lo.a.maxHp * 1.15 && hi.a.cdMult < lo.a.cdMult);
  assert.ok(RARITIES[5].mult / RARITIES[0].mult <= 1.2 + 1e-9, '등급 격차 최대 ×1.2');
  ok(`무기 등급: 일반 → 전설 체력 ${lo.a.maxHp} → ${hi.a.maxHp}, 등급마다 스킬 하나씩 강화`);
}

// ---------------- 상자·무기 줍기·강화석 ----------------
// 상자를 열면 연 사람에게만 무기 창: 장착(들던 무기는 강화석) 또는 분해(강화석). 바닥에는 안 떨어짐
{
  const { g, a, d } = duel('dagger', 900);
  const c = g.addChest(a.x + 40, a.y, 'big');
  a.input.ti = c.id;
  a.input.p[PRESS.act]++;
  run(g, C.CHEST_OPEN + 0.3);
  assert.ok(c.open, '상자 열림');
  assert.equal(g.items.length, 0, '바닥에 안 떨어짐');
  assert.ok(a.wOffer, '연 사람에게 무기 창');
  assert.ok(!d.wOffer && !g.snapshotFor(d.id).me.wo, '다른 사람은 모름');
  assert.ok(g.snapshotFor(a.id).me.wo, '스냅샷에 내 무기 창');
  a.wOffer.type = 'scroll';
  a.wOffer.rarity = 2;
  const s0 = a.stones;
  a.input.wo = a.wOffer.id;
  a.input.wk = 1;
  g.step(DT);
  assert.equal(a.gear.weapon.type, 'scroll');
  assert.equal(a.gear.weapon.rarity, 2);
  assert.ok(!a.wOffer);
  assert.equal(a.stones, s0 + C.DISMANTLE_STONES[0], '들던 무기는 강화석으로');
  // 같은 무기 낮은 등급은 장착 불가 → 분해만
  g.offerWeapon(a, 'scroll', 1);
  a.input.wo = a.wOffer.id;
  a.input.wk = 1;
  g.step(DT);
  assert.ok(a.wOffer, '낮은 등급은 장착 안 됨');
  const s1 = a.stones;
  a.input.wk = 2;
  g.step(DT);
  assert.ok(!a.wOffer && a.stones === s1 + C.DISMANTLE_STONES[1], '분해 → 강화석');
  // 같은 무기는 더 높은 등급일 때만 (합성 없음)
  assert.equal(canTake({ type: 'scroll', rarity: 2 }, { type: 'scroll', rarity: 2 }), false);
  assert.equal(canTake({ type: 'scroll', rarity: 2 }, { type: 'scroll', rarity: 3 }), true);
  assert.equal(canTake({ type: 'scroll', rarity: 4 }, { type: 'dagger', rarity: 0 }), true);
  // 상자 등급: 시간이 갈수록 좋아짐, 상자에선 신화가 안 나옴
  const rng = makeRng(4);
  const avg = (time, kind) => {
    let s = 0;
    for (let i = 0; i < 3000; i++) {
      const r = rollWeaponRarity(rng, time, kind);
      assert.ok(r < MYTHIC);
      s += r;
    }
    return s / 3000;
  };
  assert.ok(avg(0, 'small') < avg(400, 'small') && avg(0, 'small') < avg(0, 'big'));
  ok('상자 → 연 사람에게만 무기 창: 장착(들던 무기는 강화석) 또는 분해 (같은 무기는 더 높은 등급만)');
}

// 캠프 상자는 캠프 몹을 다 잡아야 열림
{
  const g = new Game({ seed: 4, fillTo: 1 });
  const p = g.addPlayer({ name: 'A' });
  g.start();
  g.land();
  run(g, 0.1);
  const c = g.chests.find((q) => q.camp && g.camps.find((k) => k.id === q.camp).alive);
  const camp = g.camps.find((q) => q.id === c.camp);
  assert.ok(g.chestLocked(c), '잠김');
  p.x = c.x + 30;
  p.y = c.y;
  p.invulnT = 0;
  p.input.ti = c.id;
  p.input.p[PRESS.act]++;
  run(g, 1);
  assert.ok(!c.open, '잠긴 상자는 안 열림');
  for (const id of camp.mobs) {
    const m = g.byId.get(id);
    if (m && m.alive) g.dealDamage(p, m, m.hp + 10, { kind: 'skill', pre: true });
  }
  run(g, 0.2);
  assert.ok(!g.chestLocked(c), '몹을 다 잡으면 열림');
  ok('캠프 상자: 몹을 다 잡아야 열림');
}

// 강화석: 일반 몹 → 다 모이면 무기 등급 +1 (전설까지)
{
  const { g, a } = duel('dagger', 900);
  g.gainStones(a, STONE_COST[0] - 1);
  assert.equal(a.gear.weapon.rarity, 0);
  g.gainStones(a, 1);
  assert.equal(a.gear.weapon.rarity, 1);
  g.gainStones(a, 999);
  assert.equal(a.gear.weapon.rarity, MYTHIC - 1, '강화석으로는 전설까지');
  ok(`강화석: ${STONE_COST.join(' / ')}개로 한 단계씩, 전설까지`);
}

// ---------------- 증강 ----------------
// 처치하면 상대 증강 중에서 고름 (빼앗기), 칸이 꽉 차면 바꿀 칸을 골라야 함, 건너뛰면 강화석
{
  const { g, a, d } = duel('dagger', 100);
  g.applyAugment(d, { id: 'chain', tier: 1 });
  g.applyAugment(d, { id: 'vital', tier: 0 });
  g.applyAugment(a, { id: 'tough', tier: 0 });
  g.applyAugment(a, { id: 'swift', tier: 0 });
  g.applyAugment(a, { id: 'leech', tier: 0 });
  d.kills = 0;
  g.dealDamage(a, d, d.hp + 10, { kind: 'skill', pre: true });
  assert.equal(a.offers.length, 1);
  const o = a.offers[0];
  assert.equal(o.cards.filter((c) => c.stolen).length, 2, '상대 증강 2개가 카드로');
  assert.equal(o.cards.length, 3);
  // 칸이 꽉 참: 바꿀 칸 없이 고르면 기다림
  a.input.po = o.id;
  a.input.pk = 1;
  a.input.pr = 0;
  g.step(DT);
  assert.equal(a.offers.length, 1, '바꿀 칸을 고를 때까지 대기');
  a.input.pr = 2;
  g.step(DT);
  assert.equal(a.offers.length, 0);
  assert.equal(a.augs.length, 3);
  assert.equal(a.augs[1].id, o.cards[0].id, '2번 칸이 바뀜');
  const s0 = a.stones;
  g.offerAugment(a, 'epic', [{ id: 'meteor', tier: 1 }]);
  a.input.po = a.offers[0].id;
  a.input.pk = 4;
  g.step(DT);
  assert.equal(a.stones, s0 + C.SKIP_STONES, '건너뛰기 → 강화석');
  ok('처치 보상: 상대 증강 빼앗기 + 3칸 교체 + 건너뛰기');
}

// 세트 효과와 무기 공명
{
  const { g, a } = duel('shuriken', 900);
  // 표창의 공명 계열은 바람: 바람 증강 1개 = 2세트
  g.applyAugment(a, { id: 'swift', tier: 0 });
  assert.equal(a.fam.wind, 2, '무기 공명 +1');
  run(g, 0.1);
  assert.equal(a.rolls, 2, '바람 2세트: 구르기 2번');
  a.input.p[PRESS.d]++;
  g.step(DT);
  a.input.p[PRESS.d]++;
  g.step(DT);
  assert.equal(a.rolls, 0, '연속 두 번 구름');
  // 강철 2세트: 받는 피해 -10%
  const b = duel('scroll', 900);
  g.applyAugment(b.a, { id: 'tough', tier: 0 });
  g.applyAugment(b.a, { id: 'thorns', tier: 0 });
  assert.ok(b.a.dr >= 0.1 - 1e-9);
  // 화염 2세트: 화상 피해 +50%
  const fc = familyCounts([{ id: 'ignite', tier: 0 }], 'fire');
  assert.equal(fc.fire, 2);
  assert.ok(augValue('meteor', 2) > augValue('meteor', 0) * 1.7);
  ok('세트: 무기 공명 +1 · 바람 2세트 구르기 2번 · 강철 2세트 피해 감소');
}

// ---------------- 에픽 몬스터 ----------------
// 1:30에 깨어남 → 잡으면 보물상자 (3초, 다른 플레이어에게 맞으면 끊김) → 열면 증강
{
  const g = new Game({ seed: 8, fillTo: 2 });
  const a = g.addPlayer({ name: 'A', weapon: 'scroll' });
  const b = g.addPlayer({ name: 'B', weapon: 'dagger' });
  g.start();
  g.land();
  const l = g.lairs.find((q) => q.kind === 'epic');
  assert.equal(l.state, 'sleep');
  g.time = C.EPIC_WAKE - 0.5;
  l.t = 0.5;
  run(g, 1);
  assert.notEqual(l.state, 'sleep', '깨어남');
  const m = g.byId.get(l.mob);
  a.x = m.x + 200;
  a.y = m.y;
  a.invulnT = 99;
  g.dealDamage(a, m, m.hp + 10, { kind: 'skill', pre: true });
  assert.equal(l.state, 'dead');
  const c = g.chests.find((q) => q.kind === 'epic');
  assert.ok(c, '에픽 보물');
  a.invulnT = 0;
  a.x = c.x + 30;
  a.y = c.y;
  b.x = c.x - 200;
  b.y = c.y;
  b.invulnT = 0;
  a.input.ti = c.id;
  a.input.p[PRESS.act]++;
  run(g, 1);
  assert.ok(a.channel, '여는 중');
  g.dealDamage(b, a, 10, { kind: 'basic', pre: true });
  assert.ok(!a.channel, '맞으면 끊김');
  a.input.p[PRESS.act]++;
  run(g, 3.3);
  assert.ok(c.open, '3초 뒤 열림');
  assert.equal(a.offers.length, 1);
  assert.equal(a.offers[0].kind, 'epic');
  assert.ok(a.offers[0].cards.every((x) => x.tier >= 1), '골드 이상');
  ok('에픽 몬스터: 깨어남 → 보물상자(3초, 맞으면 끊김) → 골드 이상 증강');
}

// 정글 몬스터: 먼저 때리기 전엔 공격하지 않음, 멀리 끌고 가면 돌아가며 회복
{
  const g = new Game({ seed: 4, fillTo: 1 });
  const p = g.addPlayer({ name: 'A' });
  g.start();
  g.land();
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

// ---------------- 티밍·도망 ----------------
// 어시스트: 같이 때린 사람은 강화석 / 3명에게 동시에 맞으면 받는 피해 감소 / 전투에서 벗어나면 빨라짐
{
  const g = new Game({ seed: 9, fillTo: 4 });
  const [a, b, c, d] = [0, 1, 2, 3].map((i) => g.addPlayer({ name: `P${i}`, weapon: 'dagger' }));
  g.start();
  g.land();
  for (const p of [a, b, c, d]) {
    p.invulnT = 0;
    p.x = 0;
    p.y = 0;
  }
  const hp0 = d.hp;
  g.dealDamage(a, d, 100, { kind: 'skill', pre: true });
  const one = hp0 - d.hp;
  g.dealDamage(b, d, 100, { kind: 'skill', pre: true });
  const h2 = d.hp;
  g.dealDamage(c, d, 100, { kind: 'skill', pre: true });
  const three = h2 - d.hp;
  assert.ok(three < one * 0.9, `다수 피격 감소 ${one.toFixed(0)} → ${three.toFixed(0)}`);
  const s0 = b.stones;
  g.dealDamage(a, d, d.hp + 999, { kind: 'skill', pre: true, true: true });
  assert.equal(b.stones, s0 + C.ASSIST_STONES, '어시스트 강화석');
  const calm = g.playerSpeed(c, false);
  c.lastDmgT = g.time;
  const fight = g.playerSpeed(c, false);
  assert.ok(calm > fight * 1.15, '전투에서 벗어나면 빨라짐');
  ok('티밍: 어시스트 강화석 · 3명에게 맞으면 피해 -15% · 전투 이탈 이동 +20%');
}

// 현상금: 2킬 이상 쌓은 사람이 죽으면 현상금 주머니 + 목숨 1개 + 마지막 1명 우승
{
  const g = new Game({ seed: 5, fillTo: 3 });
  const a = g.addPlayer({ name: 'A' });
  const b = g.addPlayer({ name: 'B' });
  const c = g.addPlayer({ name: 'C' });
  g.start();
  g.land();
  b.kills = 3;
  a.invulnT = b.invulnT = c.invulnT = 0;
  const n0 = g.chests.length;
  g.dealDamage(a, b, b.hp + 10, { kind: 'skill', pre: true });
  assert.ok(!b.alive);
  assert.equal(b.placement, 3);
  assert.equal(a.kills, 1);
  assert.ok(g.chests.slice(n0).some((q) => q.kind === 'bounty'), '현상금 주머니');
  assert.ok(g.items.some((q) => q.type === b.gear.weapon.type), '죽으면 무기를 떨어뜨림');
  run(g, 10);
  assert.ok(!b.alive, '부활하지 않음');
  g.dealDamage(a, c, c.hp + 10, { kind: 'skill', pre: true });
  assert.equal(g.state, 'ended');
  assert.equal(g.results[0].id, a.id);
  assert.equal(g.results[1].id, c.id);
  ok('현상금 주머니 + 무기 떨어뜨림 + 목숨 1개 + 마지막 1명 우승');
}

// 고정 시작 지점: 16곳에 한 명씩, 착지 전에는 시간이 흐르지 않음. 맵은 8방향 회전·좌우 대칭
{
  const g = new Game({ seed: 6, fillTo: 16 });
  const a = g.addPlayer({ name: 'A' });
  g.start();
  assert.equal(g.state, 'landing');
  assert.ok(a.spawn, '시작 지점을 받음');
  assert.deepEqual(g.snapshotFor(a.id).me.lx, a.spawn[0], '착지 화면에 내 시작 지점');
  for (let t = 0; t < C.LANDING_TIME + 0.1; t += DT) g.step(DT);
  assert.equal(g.state, 'running');
  assert.ok(Math.hypot(a.x - a.spawn[0], a.y - a.spawn[1]) < 200, `시작 위치 ${Math.round(a.x)},${Math.round(a.y)}`);
  assert.ok(a.invulnT > 0, '착지 직후 잠깐 무적');
  const spots = new Set([...g.players.values()].map((p) => p.spawn.join(',')));
  assert.equal(spots.size, 16, '모두 다른 시작 지점');
  // 대칭: 모든 시작 지점에서 본 상자·캠프·둥지까지의 거리 목록이 똑같음
  const m = MAPS.island;
  const sig = ([sx, sy]) =>
    [...m.chests.map((c) => 'c' + c.kind), ...m.camps.map((c) => 'k' + c.type), ...m.lairs.map((l) => 'l' + l.kind)]
      .map((k, i) => {
        const q = [...m.chests, ...m.camps, ...m.lairs][i];
        return `${k}:${Math.round(Math.hypot(q.x - sx, q.y - sy) / 25)}`;
      })
      .sort()
      .join('|');
  const s0 = sig(m.spawns[0]);
  for (const sp of m.spawns) {
    // 반올림 오차 허용: 서로 다른 항목이 전체의 5% 이하
    const A = s0.split('|');
    const B = sig(sp).split('|');
    let diff = 0;
    for (let i = 0; i < A.length; i++) if (A[i] !== B[i]) diff++;
    assert.ok(diff <= A.length * 0.05, `시작 지점 ${sp} 주변 구성이 다름 (${diff})`);
  }
  ok('고정 시작 지점 16곳 · 맵 대칭 (어디서 시작해도 같은 거리에 같은 자원)');
}

// 자기장: 단계가 지나면 원이 줄고 바깥은 피해
{
  const { g, a } = duel('dagger', 900);
  g.time = C.ZONE_PHASES[0].at;
  run(g, C.ZONE_PHASES[0].warn + C.ZONE_PHASES[0].shrink + 1);
  assert.ok(g.zone.r < g.R, `자기장 반지름 ${Math.round(g.zone.r)}`);
  a.x = g.zone.x + g.zone.r + 200;
  a.y = g.zone.y;
  a.invulnT = 0;
  const hp0 = a.hp;
  a.lastDmgT = g.time;
  run(g, 2);
  assert.ok(a.hp < hp0, '자기장 밖 피해');
  ok('자기장 축소 + 바깥 피해');
}

// 가만히 있어도 체력이 조금씩 참
{
  const { g, a } = duel('dagger', 900);
  a.hp = 500;
  a.lastDmgT = g.time;
  run(g, 2);
  assert.ok(a.hp > 500 + 10 && a.hp < 500 + 40, `전투 중 회복 ${a.hp - 500}`);
  run(g, 6);
  assert.ok(a.hp > 600);
  ok('체력 회복: 전투 중에도 조금씩, 4초 뒤 빠르게');
}

// 롤식 대상 지정 기본 공격: 원거리는 움직이는 대상을 따라가 맞고, 근접은 반 걸음 물러나도 맞음
{
  const { g, a, d } = duel('shuriken', 600);
  aimAt(a, 0, 600);
  a.input.at = d.id;
  a.input.atk = true;
  const hp0 = d.hp;
  for (let t = 0; t < 1.2; t += DT) {
    d.y += 120 * DT;
    g.step(DT);
  }
  assert.ok(d.hp < hp0, '원거리 대상 지정 공격 적중');
  ok('대상 지정 기본 공격(원거리): 커서와 무관하게 대상을 맞힘');
}
{
  const { g, a, d } = duel('dagger', 90);
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

// D 구르기: 커서 방향으로 이동 + 잠깐 무적 + 쿨타임
{
  const { g, a, d } = duel('shuriken', 400);
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
  assert.ok(a.cd.d > 6 && a.rolls === 0, '구르기 쿨타임');
  ok('구르기(Space·D): 커서 방향 이동 + 무적 + 쿨타임');
}

void AUG_BY_ID;
for (const r of results) console.log(`- ${r}`);
console.log('skills.test 통과');
