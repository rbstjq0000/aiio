// 장비 데이터: 무기(좌클릭 + QWER) / 갑옷·신발(능력치) / 보조 주문(D·F). 수치는 docs/COMBAT_DESIGN.md 기준
export const RARITIES = [
  { id: 'common', name: '일반', mult: 1.0, color: '#c9c9d6' },
  { id: 'uncommon', name: '고급', mult: 1.04, color: '#5fd35f' },
  { id: 'rare', name: '희귀', mult: 1.08, color: '#4da3ff' },
  { id: 'epic', name: '영웅', mult: 1.12, color: '#c56bff' },
  { id: 'legend', name: '전설', mult: 1.17, color: '#ffb340' },
];

// 스킬 type 목록 (combat.js에서 실행)
// melee 부채꼴 근접(combo) / proj 투사체 / fan 부채꼴 다발 투사체 / spin 주변 반복 타격
// leap 지점 도약 후 착지 범위 / line 직선 지연 충격파 / dashstrike 돌진(지나간 적 타격)
// cone 즉시 부채꼴 / ground 지점 지연 범위 / field 지속 장판 / ring 내 주변 지연 범위
// nova 즉시 내 주변 범위 / execute 적 등 뒤로 순간이동 / backflip 뒤로 도약 + 투사체
// blinkskill 지점 순간이동(+출발지 장판)

export const SKILL_KEYS = ['q', 'w', 'e', 'r'];

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
      moveMult: 0.35,
      comboWindow: 0.45,
      combo: [
        { dmg: 60, range: 100, arc: 2.3, windup: 0.08, dur: 0.38, lunge: 35, knock: 80 },
        { dmg: 60, range: 100, arc: 2.3, windup: 0.08, dur: 0.38, lunge: 35, knock: 80 },
        { dmg: 95, range: 112, arc: 2.9, windup: 0.13, dur: 0.55, lunge: 70, knock: 420 },
      ],
    },
    q: { name: '회오리 베기', type: 'spin', r: 140, hits: 3, dmg: 70, dur: 0.6, cd: 7, moveMult: 0.75, knock: 140 },
    w: { name: '도약 강타', type: 'leap', range: 320, air: 0.35, r: 110, dmg: 150, stun: 0.6, cd: 11 },
    e: { name: '돌진', type: 'dashstrike', dist: 260, time: 0.18, dmg: 60, width: 44, knock: 320, shield: 120, cd: 9 },
    r: { name: '대지 가르기', type: 'line', windup: 0.5, len: 520, width: 90, dmg: 320, stun: 1.0, dur: 0.75, moveMult: 0 },
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
      moveMult: 0.7,
      comboWindow: 0.3,
      combo: [
        { dmg: 40, range: 78, arc: 1.7, windup: 0.05, dur: 0.27, lunge: 20, knock: 30 },
        { dmg: 40, range: 78, arc: 1.7, windup: 0.05, dur: 0.27, lunge: 20, knock: 30 },
      ],
    },
    q: { name: '그림자 습격', type: 'dashstrike', dist: 240, time: 0.15, dmg: 95, width: 42, cd: 7, knock: 0 },
    w: { name: '독 단검', type: 'proj', windup: 0.1, dur: 0.25, speed: 950, range: 600, dmg: 75, r: 9, dot: { dmg: 130, t: 4 }, slow: { amt: 0.2, t: 4 }, cd: 8 },
    e: { name: '칼춤', type: 'nova', windup: 0.08, dur: 0.3, r: 115, dmg: 90, slow: { amt: 0.3, t: 1.5 }, cd: 8, moveMult: 0.8 },
    r: { name: '처형', type: 'execute', range: 320, dmg: 200, missing: 0.25 },
  },
  longbow: {
    id: 'longbow',
    name: '장궁',
    icon: '🏹',
    role: '원거리 딜러',
    color: '#8cff6b',
    range: 760,
    basic: { name: '사격', type: 'proj', windup: 0.1, dur: 0.5, moveMult: 0.75, speed: 1200, range: 760, dmg: 75, r: 7, knock: 60 },
    q: { name: '관통 사격', type: 'proj', windup: 0.55, dur: 0.7, moveMult: 0.35, speed: 1600, range: 950, dmg: 260, r: 11, pierce: 99, knock: 200, cd: 8 },
    w: { name: '산탄 사격', type: 'fan', windup: 0.1, dur: 0.3, count: 5, spread: 0.7, speed: 1050, range: 420, dmg: 45, r: 7, knock: 90, cd: 7 },
    e: { name: '후퇴 사격', type: 'backflip', dist: 220, time: 0.2, proj: { speed: 1150, range: 700, dmg: 95, r: 8, slow: { amt: 0.3, t: 1.5 } }, cd: 9 },
    r: { name: '화살비', type: 'ground', range: 700, r: 170, delay: 0.6, ticks: 6, every: 0.25, dmg: 85, slow: { amt: 0.3, t: 0.6 }, dur: 0.3 },
  },
  firestaff: {
    id: 'firestaff',
    name: '화염 지팡이',
    icon: '🔥',
    role: '광역 마법사',
    color: '#ff5a1f',
    range: 650,
    basic: { name: '화염구', type: 'proj', windup: 0.12, dur: 0.55, moveMult: 0.75, speed: 820, range: 650, dmg: 85, r: 10, dot: { dmg: 40, t: 2 }, knock: 40 },
    q: { name: '화염 기둥', type: 'ground', range: 650, r: 100, delay: 0.6, ticks: 1, dmg: 225, stun: 0.5, cd: 9, dur: 0.25 },
    w: { name: '불길', type: 'cone', windup: 0.12, dur: 0.3, range: 300, arc: 1.15, dmg: 155, dot: { dmg: 85, t: 2 }, cd: 7, moveMult: 0.5 },
    e: { name: '화염 도약', type: 'blinkskill', range: 280, burn: { r: 80, t: 2, every: 0.5, dmg: 35 }, cd: 11 },
    r: { name: '운석', type: 'ground', range: 700, r: 180, delay: 1.0, ticks: 1, dmg: 505, after: { t: 3, every: 0.5, dmg: 55 }, dur: 0.3 },
  },
  froststaff: {
    id: 'froststaff',
    name: '서리 지팡이',
    icon: '❄',
    role: '군중 제어',
    color: '#8fe3ff',
    range: 650,
    basic: { name: '얼음 화살', type: 'proj', windup: 0.1, dur: 0.5, moveMult: 0.75, speed: 880, range: 650, dmg: 80, r: 9, chill: 0.08, knock: 30 },
    q: { name: '얼음 창', type: 'proj', windup: 0.15, dur: 0.35, speed: 1100, range: 700, dmg: 185, r: 13, pierce: 99, slow: { amt: 0.3, t: 1.5 }, cd: 7 },
    w: { name: '서리 고리', type: 'ring', delay: 0.4, r: 170, dmg: 140, root: 0.7, cd: 11, dur: 0.35, moveMult: 0.3 },
    e: { name: '얼음 미끄럼', type: 'dashstrike', dist: 240, time: 0.2, dmg: 5, width: 0, cd: 10 },
    r: { name: '눈보라', type: 'field', range: 600, r: 220, t: 4, every: 0.5, dmg: 55, slow: { amt: 0.35, t: 0.6 }, freezeAfter: 2, freeze: 1, dur: 0.3 },
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
      moveMult: 0.45,
      comboWindow: 0.35,
      combo: [{ dmg: 75, range: 150, arc: 0.55, windup: 0.09, dur: 0.48, lunge: 30, knock: 90 }],
    },
    q: { name: '꿰뚫기', type: 'line', windup: 0.22, len: 300, width: 52, dmg: 140, dur: 0.38, moveMult: 0.2, cd: 6 },
    w: { name: '휩쓸기', type: 'nova', windup: 0.1, dur: 0.32, r: 150, dmg: 100, knock: 420, cd: 8, moveMult: 0.4 },
    e: { name: '돌진 찌르기', type: 'dashstrike', dist: 280, time: 0.2, dmg: 100, width: 48, knock: 460, cd: 10 },
    r: { name: '투창', type: 'proj', windup: 0.3, dur: 0.45, moveMult: 0.3, speed: 1350, range: 900, dmg: 305, r: 13, root: 1.0, knock: 150 },
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
      if (!sk.dmg) return `${sk.dist} 빠르게 이동`;
      return `${sk.dist} 돌진, 지나간 적에게 ${sk.dmg}${sk.knock ? ' + 넉백(벽꿍)' : ''}${sk.shield ? ` + 보호막 ${sk.shield}` : ''}`;
    case 'cone':
      return `앞 부채꼴(${sk.range}) ${sk.dmg}${extra(sk)}`;
    case 'ground':
      return `${sk.delay}초 뒤 반경 ${sk.r}에 ${sk.ticks > 1 ? `${sk.ticks}회 × ${sk.dmg}` : sk.dmg}${extra(sk)}${sk.after ? ` + ${sk.after.t}초 불바닥(0.5초마다 ${sk.after.dmg})` : ''}`;
    case 'field':
      return `${sk.t}초간 반경 ${sk.r}: ${sk.every}초마다 ${sk.dmg} + 둔화 ${pct(sk.slow.amt)}, ${sk.freezeAfter}초 머물면 빙결 ${sk.freeze}초`;
    case 'ring':
      return `${sk.delay}초 뒤 주변 반경 ${sk.r}에 ${sk.dmg}${extra(sk)}`;
    case 'nova':
      return `주변 반경 ${sk.r}에 ${sk.dmg}${sk.knock ? ' + 넉백' : ''}${extra(sk)}`;
    case 'execute':
      return `${sk.range} 안의 적 등 뒤로 순간이동, ${sk.dmg} + 잃은 체력의 ${pct(sk.missing)}`;
    case 'fan':
      return `${sk.count}발 부채꼴 사격, 발당 ${sk.dmg}, 사거리 ${sk.range}`;
    case 'blinkskill':
      return `최대 ${sk.range} 순간이동, 출발 지점에 ${sk.burn.t}초 불바닥 (0.5초마다 ${sk.burn.dmg})`;
    case 'backflip':
      return `뒤로 ${sk.dist} 도약 + 화살 ${sk.proj.dmg}${extra(sk.proj)}`;
    default:
      return '';
  }
}
for (const w of Object.values(WEAPONS)) {
  for (const k of ['basic', ...SKILL_KEYS]) w[k].desc = skillDesc(w[k], k === 'basic');
}

// 갑옷·신발: 능력치 장비 (등급 배율이 효과에 곱해짐)
export const ARMORS = {
  cloth: { id: 'cloth', name: '천 로브', icon: '👘', hpMult: 1.0, speedMult: 1.0, skillDmg: 0.12, desc: '스킬 피해 +12%' },
  leather: { id: 'leather', name: '가죽 갑옷', icon: '🦺', hpMult: 1.15, speedMult: 1.0, skillDmg: 0, desc: '체력 +15%' },
  plate: { id: 'plate', name: '판금 갑옷', icon: '🛡', hpMult: 1.3, speedMult: 0.95, skillDmg: 0, desc: '체력 +30%, 이동 -5%' },
};
export const ARMOR_IDS = Object.keys(ARMORS);

export const BOOTS = {
  swift: { id: 'swift', name: '질풍 장화', icon: '👢', speed: 0.08, cdr: 0, dr: 0, desc: '이동 속도 +8%' },
  phase: { id: 'phase', name: '차원 장화', icon: '🌀', speed: 0.03, cdr: 0.1, dr: 0, desc: '이동 +3%, 스킬 쿨타임 -10%' },
  iron: { id: 'iron', name: '강철 장화', icon: '🥾', speed: 0.03, cdr: 0, dr: 0.06, desc: '이동 +3%, 받는 피해 -6%' },
};
export const BOOT_IDS = Object.keys(BOOTS);

// 보조 주문 (롤의 소환사 주문): 대기실에서 2개 선택, D·F
export const SPELLS = {
  flash: { id: 'flash', name: '점멸', icon: '✦', type: 'blink', dist: 260, cd: 22, desc: '마우스 방향으로 즉시 260 순간이동' },
  ghost: { id: 'ghost', name: '질주', icon: '»', type: 'sprint', t: 2.5, speed: 0.5, cd: 20, desc: '2.5초간 이동 +50%, 둔화 해제' },
  cleanse: { id: 'cleanse', name: '정화', icon: '◇', type: 'purify', immune: 1.5, shield: 150, cd: 20, desc: 'CC 해제 + 1.5초 CC 면역 + 보호막 150' },
  barrier: { id: 'barrier', name: '방벽', icon: '⬡', type: 'bulwark', t: 2, dr: 0.5, cd: 22, desc: '2초간 받는 피해 -50%, 넉백 면역' },
  shadow: { id: 'shadow', name: '은신', icon: '◐', type: 'shadow', t: 2, speed: 0.25, cd: 24, desc: '2초 은신 + 이동 +25% (공격하면 풀림)' },
};
export const SPELL_IDS = Object.keys(SPELLS);
export const DEFAULT_SPELLS = ['flash', 'cleanse'];

// 스킬 각인: 상자에서 나오며 내 직업의 Q/W/E 스킬 등급을 올림 (무기 자체는 판 중에 바뀌지 않음)
export const SKILL_RUNES = {
  q: { id: 'q', name: 'Q 스킬 각인', icon: 'Q' },
  w: { id: 'w', name: 'W 스킬 각인', icon: 'W' },
  e: { id: 'e', name: 'E 스킬 각인', icon: 'E' },
};
// 스킬 등급 효과: 피해는 RARITIES.mult, 쿨타임은 아래 배율
export const GRADE_CD = [1, 1, 0.95, 0.9, 0.85];
// Q·W·E가 모두 희귀(2) 이상이면 R은 셋 중 가장 낮은 등급 (세트 효과)
export function ultGrade(g) {
  const m = Math.min(g.q, g.w, g.e);
  return m >= 2 ? m : 0;
}

export const SLOT_KINDS = ['skill', 'armor', 'boots'];
export const KIND_DEFS = { skill: SKILL_RUNES, weapon: WEAPONS, armor: ARMORS, boots: BOOTS };
export const KIND_IDS = { skill: ['q', 'w', 'e'], weapon: WEAPON_IDS, armor: ARMOR_IDS, boots: BOOT_IDS };
export const KIND_NAMES = { skill: '스킬 각인', weapon: '무기', armor: '갑옷', boots: '신발' };

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
  const kind = r < 0.55 ? 'skill' : r < 0.78 ? 'armor' : 'boots';
  const ids = KIND_IDS[kind];
  const rarity = rollRarity(rng, time, bonus);
  // 스킬은 기본이 일반 등급이라 각인은 고급부터
  return makeItem(kind, ids[Math.floor(rng() * ids.length)], kind === 'skill' ? Math.max(1, rarity) : rarity);
}

// 오브
export const ORBS = [
  { id: 'ares', name: '아레스의 오브', color: '#ff3b3b', desc: '주는 피해 +25%' },
  { id: 'poseidon', name: '포세이돈의 오브', color: '#2fa8ff', desc: '받는 피해 -25%' },
  { id: 'zeus', name: '제우스의 오브', color: '#ffe14d', desc: '스킬 쿨타임 -30%, 궁극기 게이지 2배' },
];
