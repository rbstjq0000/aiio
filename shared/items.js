// 장비 데이터: 무기(스킬 4개) / 갑옷(E) / 신발(Space). 수치는 docs/COMBAT_DESIGN.md 기준
export const RARITIES = [
  { id: 'common', name: '일반', mult: 1.0, color: '#c9c9d6' },
  { id: 'uncommon', name: '고급', mult: 1.04, color: '#5fd35f' },
  { id: 'rare', name: '희귀', mult: 1.08, color: '#4da3ff' },
  { id: 'epic', name: '영웅', mult: 1.12, color: '#c56bff' },
  { id: 'legend', name: '전설', mult: 1.17, color: '#ffb340' },
];

// 스킬 type 목록 (combat.js에서 실행)
// melee: 부채꼴 근접 (combo)
// proj: 투사체
// spin: 일정 시간 주변 반복 타격
// leap: 지점으로 도약 후 착지 범위 피해
// line: 직선 지연 충격파
// dashstrike: 돌진하며 지나간 적 타격
// cone: 즉시 부채꼴
// ground: 지점 지연 범위 (ticks로 여러 번)
// field: 지속 장판 (tick)
// ring: 내 주변 지연 범위
// nova: 즉시 내 주변 범위
// execute: 적 등 뒤로 순간이동 + 처형
// backflip: 뒤로 도약 + 투사체

export const WEAPONS = {
  greatsword: {
    id: 'greatsword',
    name: '대검',
    icon: '⚔',
    role: '근접 브루저',
    color: '#ff8a4d',
    range: 95,
    basic: {
      name: '베기',
      type: 'melee',
      moveMult: 0.5,
      comboWindow: 0.4,
      combo: [
        { dmg: 80, range: 95, arc: 2.2, windup: 0.12, dur: 0.55, lunge: 40, knock: 80 },
        { dmg: 80, range: 95, arc: 2.2, windup: 0.12, dur: 0.55, lunge: 40, knock: 80 },
        { dmg: 120, range: 108, arc: 2.8, windup: 0.18, dur: 0.75, lunge: 70, knock: 380 },
      ],
    },
    s1: { name: '회오리 베기', type: 'spin', r: 140, hits: 3, dmg: 70, dur: 0.6, cd: 6, moveMult: 0.6, knock: 120 },
    s2: { name: '도약 강타', type: 'leap', range: 320, air: 0.35, r: 110, dmg: 165, stun: 0.6, cd: 10 },
    ult: { name: '대지 가르기', type: 'line', windup: 0.5, len: 520, width: 90, dmg: 335, stun: 1.0, dur: 0.75, moveMult: 0 },
  },
  daggers: {
    id: 'daggers',
    name: '쌍단검',
    icon: '🗡',
    role: '암살자',
    color: '#b28cff',
    range: 75,
    basic: {
      name: '연속 찌르기',
      type: 'melee',
      moveMult: 0.75,
      comboWindow: 0.3,
      combo: [
        { dmg: 45, range: 75, arc: 1.7, windup: 0.06, dur: 0.3, lunge: 20, knock: 30 },
        { dmg: 45, range: 75, arc: 1.7, windup: 0.06, dur: 0.3, lunge: 20, knock: 30 },
      ],
    },
    s1: { name: '그림자 습격', type: 'dashstrike', dist: 220, time: 0.15, dmg: 105, width: 42, cd: 6, knock: 0 },
    s2: { name: '독 단검', type: 'proj', windup: 0.1, dur: 0.25, speed: 950, range: 600, dmg: 85, r: 9, dot: { dmg: 150, t: 4 }, slow: { amt: 0.2, t: 4 }, cd: 7 },
    ult: { name: '처형', type: 'execute', range: 300, dmg: 225, missing: 0.25 },
  },
  longbow: {
    id: 'longbow',
    name: '장궁',
    icon: '🏹',
    role: '원거리 딜러',
    color: '#8cff6b',
    range: 760,
    basic: { name: '사격', type: 'proj', windup: 0.12, dur: 0.55, moveMult: 0.7, speed: 1150, range: 760, dmg: 80, r: 7, knock: 60 },
    s1: { name: '관통 사격', type: 'proj', windup: 0.6, dur: 0.75, moveMult: 0.35, speed: 1600, range: 950, dmg: 250, r: 11, pierce: 99, knock: 200, cd: 7 },
    s2: { name: '후퇴 사격', type: 'backflip', dist: 200, time: 0.2, proj: { speed: 1100, range: 700, dmg: 95, r: 8, slow: { amt: 0.3, t: 1.5 } }, cd: 8 },
    ult: { name: '화살비', type: 'ground', range: 700, r: 170, delay: 0.6, ticks: 6, every: 0.25, dmg: 80, slow: { amt: 0.3, t: 0.6 }, dur: 0.3 },
  },
  firestaff: {
    id: 'firestaff',
    name: '화염 지팡이',
    icon: '🔥',
    role: '광역 마법사',
    color: '#ff5a1f',
    range: 650,
    basic: { name: '화염구', type: 'proj', windup: 0.15, dur: 0.6, moveMult: 0.7, speed: 800, range: 650, dmg: 85, r: 10, dot: { dmg: 45, t: 2 }, knock: 40 },
    s1: { name: '화염 기둥', type: 'ground', range: 650, r: 100, delay: 0.6, ticks: 1, dmg: 215, stun: 0.5, cd: 8, dur: 0.25 },
    s2: { name: '불길', type: 'cone', windup: 0.15, dur: 0.35, range: 300, arc: 1.15, dmg: 160, dot: { dmg: 85, t: 2 }, cd: 6, moveMult: 0.5 },
    ult: { name: '운석', type: 'ground', range: 700, r: 180, delay: 1.0, ticks: 1, dmg: 490, after: { t: 3, every: 0.5, dmg: 50 }, dur: 0.3 },
  },
  froststaff: {
    id: 'froststaff',
    name: '서리 지팡이',
    icon: '❄',
    role: '군중 제어',
    color: '#8fe3ff',
    range: 650,
    basic: { name: '얼음 화살', type: 'proj', windup: 0.12, dur: 0.55, moveMult: 0.7, speed: 850, range: 650, dmg: 90, r: 9, chill: 0.1, knock: 30 },
    s1: { name: '서리 고리', type: 'ring', delay: 0.35, r: 180, dmg: 155, root: 0.8, cd: 9, dur: 0.35, moveMult: 0.3 },
    s2: { name: '얼음 창', type: 'proj', windup: 0.15, dur: 0.35, speed: 1100, range: 700, dmg: 195, r: 13, pierce: 99, slow: { amt: 0.4, t: 1.5 }, cd: 6 },
    ult: { name: '눈보라', type: 'field', range: 600, r: 220, t: 4, every: 0.5, dmg: 55, slow: { amt: 0.4, t: 0.6 }, freezeAfter: 2, freeze: 1, dur: 0.3 },
  },
  spear: {
    id: 'spear',
    name: '창',
    icon: '🔱',
    role: '스커미셔',
    color: '#ffe066',
    range: 145,
    basic: {
      name: '찌르기',
      type: 'melee',
      moveMult: 0.55,
      comboWindow: 0.35,
      combo: [{ dmg: 95, range: 145, arc: 0.5, windup: 0.12, dur: 0.6, lunge: 30, knock: 90 }],
    },
    s1: { name: '돌진 찌르기', type: 'dashstrike', dist: 280, time: 0.2, dmg: 150, width: 48, knock: 460, cd: 7 },
    s2: { name: '휩쓸기', type: 'nova', windup: 0.12, dur: 0.35, r: 150, dmg: 120, knock: 400, cd: 6, moveMult: 0.4 },
    ult: { name: '투창', type: 'proj', windup: 0.3, dur: 0.45, moveMult: 0.3, speed: 1350, range: 900, dmg: 355, r: 13, root: 1.0, knock: 150 },
  },
};
export const WEAPON_IDS = Object.keys(WEAPONS);

const pct = (v) => `${Math.round(v * 100)}%`;
const extra = (sk) => {
  let t = '';
  if (sk.dot) t += ` + ${sk.dot.t}초간 ${sk.dot.dmg} 지속 피해`;
  if (sk.slow) t += ` + 둔화 ${pct(sk.slow.amt)}`;
  if (sk.chill) t += ` + 둔화 ${pct(sk.chill)} 중첩(최대 30%)`;
  if (sk.stun) t += ` + 기절 ${sk.stun}초`;
  if (sk.root) t += ` + 속박 ${sk.root}초`;
  return t;
};

// 스킬 설명을 수치 데이터에서 생성 (설명과 실제 수치가 어긋나지 않게)
export function skillDesc(sk, isBasic = false) {
  switch (sk.type) {
    case 'melee':
      if (sk.combo.length === 1) return `${sk.combo[0].dur}초마다 ${sk.combo[0].dmg}, 사거리 ${sk.combo[0].range}`;
      return `${sk.combo.length}연타 ${sk.combo.map((c) => c.dmg).join(' / ')}, 사거리 ${sk.combo[0].range}`;
    case 'proj':
      return `${isBasic ? `${sk.dur}초마다 ` : sk.windup >= 0.3 ? `${sk.windup}초 준비 후 ` : ''}${sk.pierce ? '관통 ' : ''}투사체 ${sk.dmg}${extra(sk)}, 사거리 ${sk.range}`;
    case 'spin':
      return `${sk.dur}초간 주변 반경 ${sk.r}에 ${sk.hits}회 × ${sk.dmg}`;
    case 'leap':
      return `최대 ${sk.range} 도약, 착지 반경 ${sk.r}에 ${sk.dmg}${extra(sk)}`;
    case 'line':
      return `${sk.windup}초 준비 후 길이 ${sk.len} 충격파 ${sk.dmg}${extra(sk)}`;
    case 'dashstrike':
      return `${sk.dist} 돌진, 지나간 적에게 ${sk.dmg}${sk.knock ? ' + 넉백(벽꿍)' : ''}`;
    case 'cone':
      return `앞 부채꼴(${sk.range}) ${sk.dmg}${extra(sk)}`;
    case 'ground':
      return `${sk.delay}초 뒤 반경 ${sk.r}에 ${sk.ticks > 1 ? `${sk.ticks}회 × ${sk.dmg}` : sk.dmg}${extra(sk)}${sk.after ? ` + ${sk.after.t}초 불바닥(0.5초마다 ${sk.after.dmg})` : ''}`;
    case 'field':
      return `${sk.t}초간 반경 ${sk.r}: ${sk.every}초마다 ${sk.dmg} + 둔화 ${pct(sk.slow.amt)}, ${sk.freezeAfter}초 머물면 빙결 ${sk.freeze}초`;
    case 'ring':
      return `${sk.delay}초 뒤 주변 반경 ${sk.r}에 ${sk.dmg}${extra(sk)}`;
    case 'nova':
      return `주변 반경 ${sk.r}에 ${sk.dmg} + 넉백`;
    case 'execute':
      return `${sk.range} 안의 적 등 뒤로 순간이동, ${sk.dmg} + 잃은 체력의 ${pct(sk.missing)}`;
    case 'backflip':
      return `뒤로 ${sk.dist} 도약 + 화살 ${sk.proj.dmg}${extra(sk.proj)}`;
    default:
      return '';
  }
}
for (const w of Object.values(WEAPONS)) {
  for (const k of ['basic', 's1', 's2', 'ult']) w[k].desc = skillDesc(w[k], k === 'basic');
}

export const ARMORS = {
  cloth: { id: 'cloth', name: '천 로브', icon: '👘', hpMult: 1.0, speedMult: 1.0, skillDmg: 0.12, skill: { name: '정화', type: 'purify', immune: 1.5, shield: 150, cd: 14, desc: 'CC 해제 + 1.5초 CC 면역 + 보호막 150' }, desc: '스킬 피해 +12%' },
  leather: { id: 'leather', name: '가죽 갑옷', icon: '🦺', hpMult: 1.15, speedMult: 1.0, skillDmg: 0, skill: { name: '그림자', type: 'shadow', t: 2, speed: 0.25, cd: 16, desc: '2초 은신 + 이동 +25%' }, desc: '체력 +15%' },
  plate: { id: 'plate', name: '판금 갑옷', icon: '🛡', hpMult: 1.3, speedMult: 0.95, skillDmg: 0, skill: { name: '방벽', type: 'bulwark', t: 2, dr: 0.5, cd: 14, desc: '2초간 받는 피해 -50%, 넉백 면역' }, desc: '체력 +30%, 이동 -5%' },
};
export const ARMOR_IDS = Object.keys(ARMORS);

export const BOOTS = {
  swift: { id: 'swift', name: '질풍 장화', icon: '👢', skill: { name: '대시', type: 'dash', dist: 220, time: 0.16, iframe: 0.16, cd: 4, desc: '220 대시 (0.16초 무적)' } },
  phase: { id: 'phase', name: '차원 장화', icon: '🌀', skill: { name: '점멸', type: 'blink', dist: 260, cd: 8, desc: '즉시 260 순간이동' } },
  herald: { id: 'herald', name: '전령 장화', icon: '🪽', skill: { name: '질주', type: 'sprint', t: 2, speed: 0.6, cd: 10, desc: '2초간 이동 +60%, 둔화 해제' } },
};
export const BOOT_IDS = Object.keys(BOOTS);

export const SLOT_KINDS = ['weapon', 'armor', 'boots'];
export const KIND_DEFS = { weapon: WEAPONS, armor: ARMORS, boots: BOOTS };
export const KIND_IDS = { weapon: WEAPON_IDS, armor: ARMOR_IDS, boots: BOOT_IDS };
export const KIND_NAMES = { weapon: '무기', armor: '갑옷', boots: '신발' };

export function itemDef(item) {
  return item ? KIND_DEFS[item.kind][item.type] : null;
}

export function itemName(item) {
  const d = itemDef(item);
  return d ? `${RARITIES[item.rarity].name} ${d.name}` : '';
}

export function makeItem(kind, type, rarity = 0) {
  return { kind, type, rarity };
}

// 경과 시간에 따라 좋은 등급이 나올 확률이 올라감
export function rollRarity(rng, time, bonus = 0) {
  const k = Math.min(1, time / 480) + bonus;
  const w = [Math.max(0.05, 0.55 - 0.45 * k), 0.3, 0.1 + 0.2 * k, 0.04 + 0.16 * k, 0.01 + 0.08 * k];
  let total = 0;
  for (const v of w) total += v;
  let r = rng() * total;
  for (let i = 0; i < w.length; i++) {
    r -= w[i];
    if (r <= 0) return i;
  }
  return 0;
}

export function rollItem(rng, time, bonus = 0) {
  const r = rng();
  const kind = r < 0.4 ? 'weapon' : r < 0.7 ? 'armor' : 'boots';
  const ids = KIND_IDS[kind];
  return makeItem(kind, ids[Math.floor(rng() * ids.length)], rollRarity(rng, time, bonus));
}

// 오브
export const ORBS = [
  { id: 'ares', name: '아레스의 오브', color: '#ff3b3b', desc: '주는 피해 +15%' },
  { id: 'poseidon', name: '포세이돈의 오브', color: '#2fa8ff', desc: '받는 피해 -15%' },
  { id: 'zeus', name: '제우스의 오브', color: '#ffe14d', desc: '스킬 쿨타임 -20%' },
];
