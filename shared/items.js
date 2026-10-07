// 무기 데이터: 단도 · 표창 · 두루마리 (서로 물고 물리는 상성)
//   단도 → 두루마리 (파고들면 시전이 느린 술사는 못 버팀)
//   표창 → 단도     (멀리서 깎고 둔화·공중제비로 거리 유지)
//   두루마리 → 표창 (속박·눈보라로 사수를 묶음)
// 스킬셋은 무기마다 고정. 등급이 오를수록 특수효과가 하나씩 붙음
//   고급 = 평타 강화, 희귀 = Q 강화, 영웅 = W 강화, 전설 = E 강화, 신화 = R 변신
export const RARITIES = [
  { id: 'common', name: '일반', mult: 1.0, cd: 1.0, color: '#c9c9d6' },
  { id: 'uncommon', name: '고급', mult: 1.04, cd: 1.0, color: '#5fd35f' },
  { id: 'rare', name: '희귀', mult: 1.08, cd: 0.95, color: '#4da3ff' },
  { id: 'epic', name: '영웅', mult: 1.12, cd: 0.9, color: '#c56bff' },
  { id: 'legend', name: '전설', mult: 1.16, cd: 0.85, color: '#ffa53d' },
  { id: 'mythic', name: '신화', mult: 1.2, cd: 0.8, color: '#ff3d5a' },
];
export const MYTHIC = 5;
// 등급별로 강화되는 칸
export const TIER_SLOT = [null, 'basic', 'q', 'w', 'e', 'r'];
// 강화석: 이만큼 모이면 들고 있는 무기 등급 +1 (전설까지. 신화는 큰 에픽 보물에서만)
export const STONE_COST = [8, 14, 22, 32];

// 스킬 type 목록 (combat.js에서 실행)
// melee 부채꼴 근접(combo) / proj 투사체 / fan 부채꼴 다발 투사체 / nova 즉시 내 주변 범위
// ground 지점 지연 범위 / field 지속 장판 / blinkskill 지점 순간이동 / backflip 뒤로 도약 + 투사체
// shadow 그림자 분신 / mark 적 뒤로 순간이동 + 표식
export const SKILL_KEYS = ['q', 'w', 'e', 'r'];

export const WEAPONS = {
  dagger: {
    id: 'dagger',
    name: '단도',
    icon: '🗡',
    role: '근접 암살',
    color: '#b28cff',
    range: 80,
    hp: 1.16, // 근접은 붙기 전에 맞으니 체력이 더 많음
    speed: 1.08,
    family: 'shadow', // 무기 공명: 🌑그림자 증강
    beats: 'scroll',
    basic: {
      name: '연속 찌르기',
      type: 'melee',
      moveMult: 0.7,
      comboWindow: 0.3,
      combo: [
        { dmg: 48, range: 80, arc: 1.7, windup: 0.05, dur: 0.27, lunge: 20, knock: 0 },
        { dmg: 48, range: 80, arc: 1.7, windup: 0.05, dur: 0.27, lunge: 20, knock: 0 },
      ],
    },
    q: { name: '수리검', icon: '✴', type: 'proj', windup: 0.08, dur: 0.22, speed: 1400, range: 760, dmg: 130, r: 10, pierce: 99, fromShadows: true, cd: 6, hint: '나와 그림자들이 커서 쪽으로 관통 수리검을 던짐' },
    w: { name: '그림자 분신', icon: '👤', type: 'shadow', range: 650, t: 5, cd: 15, hint: '그림자를 보냄. 그림자도 Q·E를 따라 씀. 5초 안에 W를 다시 누르면 그림자와 자리를 바꿈' },
    e: { name: '그림자 베기', icon: '🌀', type: 'nova', windup: 0.05, dur: 0.2, r: 165, dmg: 120, fromShadows: true, shadowSlow: { amt: 0.35, t: 1.5 }, hitRefund: { w: 2 }, moveMult: 1, cd: 4.5, hint: '나와 그림자 주변을 벰. 그림자에 맞으면 둔화, 맞힐 때마다 W 쿨타임 2초 감소' },
    r: { name: '죽음의 표식', icon: '☠', type: 'mark', range: 520, dmg: 80, markT: 3, markPct: 0.6, t: 6, hint: '적 뒤로 순간이동(잠깐 무적)하고 표식. 3초 뒤 그동안 준 피해의 60%가 한 번 더 터짐' },
    passive: { name: '약자 멸시 · 그림자 탈출', desc: '체력 50% 미만인 적을 기본 공격하면 최대 체력의 8% 추가 피해 (대상마다 8초에 한 번). 기절·속박 시간 -40%', lowHp: 0.5, pct: 0.08, cd: 8, tenacity: 0.4 },
    tiers: [
      null,
      { o: { combo: [{ dmg: 44, range: 80, arc: 1.7, windup: 0.05, dur: 0.27, lunge: 20, knock: 0 }, { dmg: 44, range: 80, arc: 1.7, windup: 0.05, dur: 0.27, lunge: 20, knock: 0 }, { dmg: 72, range: 92, arc: 2.0, windup: 0.08, dur: 0.36, lunge: 45, knock: 70 }] }, desc: '평타 3번째 찌르기가 강해짐' },
      { o: { dmg: 140, slow: { amt: 0.25, t: 1.2 } }, desc: '수리검 피해 증가 + 둔화' },
      { o: { range: 780, cd: 12 }, desc: '분신 사거리 증가 + 쿨타임 12초' },
      { o: { dmg: 120, r: 190, hitRefund: { w: 3 } }, desc: '그림자 베기 범위·피해 증가, W 쿨 감소 3초' },
      { o: { markPct: 1.0, dmg: 140 }, desc: '표식 폭발이 그동안 준 피해의 100%' },
    ],
  },
  shuriken: {
    id: 'shuriken',
    name: '표창',
    icon: '✴',
    role: '원거리 견제',
    color: '#8cff6b',
    range: 700,
    hp: 0.96,
    speed: 1.04,
    family: 'wind', // 🍃바람
    beats: 'dagger',
    passive: { name: '바람 발걸음', desc: '기본 공격이 맞으면 1초간 이동 속도 +8% (치고 빠지기)', haste: 0.08, t: 1 },
    basic: { name: '표창 던지기', type: 'proj', windup: 0.1, dur: 0.5, moveMult: 0.85, speed: 1250, range: 700, dmg: 70, r: 8 },
    q: { name: '대형 표창', icon: '✦', type: 'proj', windup: 0.12, dur: 0.3, speed: 1500, range: 900, dmg: 140, r: 12, refundAll: 1, cd: 5, hint: '빠르고 큰 표창. 맞히면 모든 스킬 쿨타임 1초 감소' },
    w: { name: '표창 부채', icon: '🎯', type: 'fan', windup: 0.12, dur: 0.3, count: 7, spread: 0.9, speed: 1100, range: 600, dmg: 42, r: 8, slow: { amt: 0.3, t: 1.2 }, cd: 8, hint: '부채꼴로 표창 7개, 맞은 적 둔화' },
    e: { name: '공중제비', icon: '🤸', type: 'backflip', dist: 260, time: 0.22, proj: { speed: 1300, range: 650, dmg: 80, r: 9, slow: { amt: 0.3, t: 1 } }, cd: 9, hint: '뒤로 공중제비를 돌며 앞쪽으로 표창 (둔화)' },
    r: { name: '풍마수리검', icon: '🌀', type: 'proj', windup: 0.3, dur: 0.45, moveMult: 0.4, speed: 1050, range: 700, dmg: 160, r: 26, pierce: 99, ret: true, hint: '거대한 수리검이 날아갔다 돌아옴. 갈 때와 올 때 두 번 맞음' },
    tiers: [
      null,
      { o: { pierce: 1 }, desc: '평타 표창이 1명 관통' },
      { o: { dmg: 165, slow: { amt: 0.25, t: 1.5 } }, desc: '대형 표창 피해 증가 + 둔화' },
      { o: { count: 9, spread: 1.05 }, desc: '표창 9개' },
      { o: { cd: 6, proj: { speed: 1300, range: 650, dmg: 120, r: 9, slow: { amt: 0.4, t: 1 } } }, desc: '공중제비 쿨타임 6초 + 표창 강화' },
      { o: { fan: 3, spread: 0.55 }, desc: '풍마수리검이 3개로 갈라짐' },
    ],
  },
  scroll: {
    id: 'scroll',
    name: '두루마리',
    icon: '📜',
    role: '인술 · 묶고 광역',
    color: '#ff7a3d',
    range: 800,
    hp: 0.92, // 몸이 약한 대신 멀리서 묶음
    speed: 1.0,
    family: 'fire', // 🔥화염
    beats: 'shuriken',
    passive: { name: '잿불', desc: '내 화상에 걸린 적은 원거리 기본 공격 속도 -15%', atkSlow: 0.15 },
    basic: { name: '불씨', type: 'proj', windup: 0.12, dur: 0.55, moveMult: 0.7, speed: 900, range: 800, dmg: 64, r: 10, dot: { dmg: 32, t: 2 } },
    q: { name: '화염구', icon: '☄', type: 'proj', windup: 0.15, dur: 0.3, speed: 1300, range: 950, dmg: 135, r: 15, dot: { dmg: 50, t: 2 }, burnStun: 0.6, cd: 6, hint: '이미 불타는 적이 맞으면 0.6초 기절 (먼저 불씨로 지져 놓기)' },
    w: { name: '서리 속박', icon: '⛓', type: 'proj', windup: 0.2, dur: 0.4, speed: 1400, range: 1000, dmg: 140, r: 16, root: 0.9, cd: 8, hint: '첫 적중 대상을 0.9초 속박' },
    e: { name: '순간이동', icon: '✨', type: 'blinkskill', range: 320, cd: 15, hint: '커서 쪽으로 짧게 순간이동' },
    r: { name: '눈보라', icon: '🌨', type: 'field', range: 620, r: 230, t: 4, every: 0.5, dmg: 50, slow: { amt: 0.35, t: 0.6 }, freezeAfter: 2, freeze: 1, dur: 0.3, hint: '4초간 눈보라. 2초 넘게 머물면 빙결' },
    tiers: [
      null,
      { o: { dot: { dmg: 40, t: 2 } }, desc: '불씨 화상 강화' },
      { o: { burnStun: 0.8, splash: 110 }, desc: '화염구 기절 0.8초 + 주변 폭발' },
      { o: { pierce: 1, rootAll: true }, desc: '서리 속박이 2명까지 꿰뚫고 모두 속박' },
      { o: { cd: 10, burn: { r: 70, every: 0.5, dmg: 40, t: 2 } }, desc: '순간이동 쿨타임 10초 + 출발지 불바닥' },
      { o: { r: 300, freezeAfter: 1.5 }, desc: '눈보라 범위 확대 + 1.5초면 빙결' },
    ],
  },
};
export const WEAPON_IDS = Object.keys(WEAPONS);
export const DEFAULT_WEAPON = 'dagger';
// 예전 직업 이름 → 새 무기 (저장된 프로필 호환)
export function weaponId(id) {
  if (WEAPONS[id]) return id;
  if (id === 'longbow') return 'shuriken';
  if (id === 'firestaff' || id === 'froststaff') return 'scroll';
  return DEFAULT_WEAPON;
}

// 등급이 반영된 스킬 정의 (등급 효과를 차례로 덮어씀)
export function skillAt(w, key, grade = 0) {
  let out = w[key];
  for (let g = 1; g <= grade && g < w.tiers.length; g++) {
    const t = w.tiers[g];
    if (t && TIER_SLOT[g] === key) out = { ...out, ...t.o };
  }
  return out;
}

const pct = (v) => `${Math.round(v * 100)}%`;
const extra = (sk) => {
  let t = '';
  if (sk.dot) t += ` + ${sk.dot.t}초간 ${sk.dot.dmg} 화상`;
  if (sk.slow) t += ` + 둔화 ${pct(sk.slow.amt)}`;
  if (sk.stun) t += ` + 기절 ${sk.stun}초`;
  if (sk.root) t += ` + 속박 ${sk.root}초`;
  return t;
};

// 스킬 설명을 수치 데이터에서 생성 (설명과 실제 수치가 어긋나지 않게)
export function skillDesc(sk, isBasic = false) {
  switch (sk.type) {
    case 'melee':
      return `${sk.combo.length}연타 ${sk.combo.map((c) => c.dmg).join(' / ')}, 사거리 ${sk.combo[0].range}`;
    case 'proj':
      return `${isBasic ? `${sk.dur}초마다 ` : ''}${sk.fan ? `${sk.fan}갈래 ` : ''}${sk.pierce ? '관통 ' : ''}${sk.ret ? '왕복 ' : ''}투사체 ${sk.dmg}${extra(sk)}, 사거리 ${sk.range}`;
    case 'fan':
      return `${sk.count}발 부채꼴, 발당 ${sk.dmg}${extra(sk)}, 사거리 ${sk.range}`;
    case 'nova':
      return `주변 반경 ${sk.r}에 ${sk.dmg}${extra(sk)}`;
    case 'field':
      return `${sk.t}초간 반경 ${sk.r}: ${sk.every}초마다 ${sk.dmg} + 둔화 ${pct(sk.slow.amt)}, ${sk.freezeAfter}초 머물면 빙결 ${sk.freeze}초`;
    case 'blinkskill':
      return `최대 ${sk.range} 순간이동${sk.burn ? `, 출발 지점 불바닥(0.5초마다 ${sk.burn.dmg})` : ''}`;
    case 'backflip':
      return `뒤로 ${sk.dist} 도약 + 표창 ${sk.proj.dmg}${extra(sk.proj)}`;
    case 'shadow':
      return `최대 ${sk.range}에 그림자 (${sk.t}초), 다시 누르면 자리 바꿈`;
    case 'mark':
      return `${sk.range} 안의 적 뒤로 순간이동, ${sk.dmg} + ${sk.markT}초 뒤 그동안 준 피해의 ${pct(sk.markPct)}`;
    default:
      return '';
  }
}

// 등급별 설명 (툴팁·도감용)
export function skillInfo(w, key, grade) {
  const sk = skillAt(w, key, grade);
  return { ...sk, desc: skillDesc(sk, key === 'basic') };
}

export function makeWeapon(type, rarity = 0) {
  return { kind: 'weapon', type: weaponId(type), rarity };
}

export function weaponName(item) {
  return `${RARITIES[item.rarity].name} ${WEAPONS[item.type].name}`;
}

// 바닥의 무기를 주울 수 있는지: 다른 무기면 교체, 같은 무기면 더 높은 등급일 때만
export function canTake(cur, item) {
  return item.type !== cur.type || item.rarity > cur.rarity;
}

// 상자에서 나오는 무기 등급: 시간이 갈수록 좋아짐. 큰 상자는 한 단계 좋은 분포
export function rollWeaponRarity(rng, time, kind = 'small') {
  const k = Math.min(1, time / 420);
  // [일반, 고급, 희귀, 영웅, 전설]
  let w = [0.5 - 0.35 * k, 0.32 - 0.05 * k, 0.13 + 0.15 * k, 0.04 + 0.16 * k, 0.01 + 0.06 * k];
  if (kind === 'big') w = [0.08, 0.3, 0.32, 0.2 + 0.08 * k, 0.1 + 0.08 * k];
  if (kind === 'bounty') w = [0, 0.1, 0.35, 0.35, 0.2];
  let total = 0;
  for (const v of w) total += v;
  let r = rng() * total;
  for (let i = 0; i < w.length; i++) {
    r -= w[i];
    if (r <= 0) return i;
  }
  return 0;
}
