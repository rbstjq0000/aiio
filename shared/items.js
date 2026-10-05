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

// 롤 챔피언들의 메커니즘을 참고한 6개 직업 (이름·그림은 사용하지 않음)
// up[3] = 영웅 등급, up[4] = 전설 등급에서 붙는 고유 강화 (수치를 덮어씀, upDesc가 설명)
export const WEAPONS = {
  greatsword: {
    id: 'greatsword',
    name: '대검',
    icon: '⚔',
    role: '근접 브루저',
    color: '#ff8a4d',
    range: 100,
    basic: {
      name: '베기',
      type: 'melee',
      moveMult: 0.35,
      comboWindow: 0.45,
      combo: [
        { dmg: 64, range: 100, arc: 2.3, windup: 0.08, dur: 0.38, lunge: 35, knock: 80 },
        { dmg: 64, range: 100, arc: 2.3, windup: 0.08, dur: 0.38, lunge: 35, knock: 80 },
        { dmg: 100, range: 112, arc: 2.9, windup: 0.13, dur: 0.55, lunge: 70, knock: 420 },
      ],
    },
    q: {
      name: '회오리 도끼', icon: '🌀', type: 'ring', delay: 0.3, r: 185, dmg: 110, outer: { r0: 115, mult: 1.5 }, heal: 60, dur: 0.35, moveMult: 0.5, cd: 8,
      hint: '0.3초 뒤 주변을 휩씀. 바깥쪽 고리에 맞으면 1.5배 + 체력 회복',
      up: { 3: { dot: { dmg: 50, t: 3 }, upDesc: '출혈: 3초간 50 추가 피해' }, 4: { twice: true, upDesc: '한 번 더 회전 (60% 피해)' } },
    },
    w: {
      name: '결정타', icon: '💥', type: 'empower', haste: 0.3, hasteT: 1.5, bonus: 90, slow: { amt: 0.4, t: 1 }, window: 4, cd: 7,
      hint: '이동 속도가 빨라지고, 다음 기본 공격이 강해짐',
      up: { 3: { stun: 0.5, upDesc: '강화 공격이 0.5초 기절' }, 4: { resetOnKill: true, bonus: 115, upDesc: '피해 증가, 처치하면 쿨타임 초기화' } },
    },
    e: {
      name: '포획', icon: '🪝', type: 'pull', windup: 0.25, dur: 0.4, range: 290, arc: 1.2, dmg: 40, slow: { amt: 0.4, t: 1 }, moveMult: 0.3, cd: 11,
      hint: '앞쪽 부채꼴의 적을 내 앞으로 끌어당김',
      up: { 3: { range: 370, upDesc: '사거리 +80' }, 4: { stun: 0.4, upDesc: '끌려온 적 0.4초 기절' } },
    },
    r: { name: '대지 가르기', icon: '⛰', type: 'line', windup: 0.5, len: 560, width: 96, dmg: 320, stun: 1.0, dur: 0.75, moveMult: 0, hint: '0.5초 뒤 앞으로 땅을 가르는 충격파, 기절' },
  },
  daggers: {
    id: 'daggers',
    name: '쌍단검',
    icon: '🗡',
    role: '암살자',
    color: '#b28cff',
    range: 78,
    basic: {
      name: '연속 찌르기',
      type: 'melee',
      moveMult: 0.7,
      comboWindow: 0.3,
      combo: [
        { dmg: 42, range: 78, arc: 1.7, windup: 0.05, dur: 0.27, lunge: 20, knock: 30 },
        { dmg: 42, range: 78, arc: 1.7, windup: 0.05, dur: 0.27, lunge: 20, knock: 30 },
      ],
    },
    q: {
      name: '수리검', icon: '✴', type: 'proj', windup: 0.08, dur: 0.22, speed: 1400, range: 720, dmg: 105, r: 10, pierce: 99, cd: 6,
      hint: '일직선으로 꿰뚫는 수리검',
      up: { 3: { fan: 3, spread: 0.32, upDesc: '수리검 3개를 부채꼴로' }, 4: { refund: { e: 2 }, upDesc: '적중 시 순보 쿨타임 2초 감소' } },
    },
    w: {
      name: '독 단검', icon: '🧪', type: 'proj', windup: 0.1, dur: 0.25, speed: 950, range: 620, dmg: 75, r: 9, dot: { dmg: 130, t: 4 }, slow: { amt: 0.25, t: 3 }, cd: 8,
      hint: '맞으면 4초 동안 중독되고 느려짐',
      up: { 3: { slow: { amt: 0.4, t: 3 }, upDesc: '둔화 40%' }, 4: { dot: { dmg: 240, t: 4 }, upDesc: '독 피해 거의 2배' } },
    },
    e: {
      name: '순보', icon: '💨', type: 'blinkskill', range: 420, land: { r: 120, dmg: 70 }, cd: 9,
      hint: '지정 위치로 순간이동, 도착 지점 주변에 피해',
      up: { 3: { land: { r: 140, dmg: 90, slow: { amt: 0.3, t: 1.2 } }, upDesc: '도착 피해 증가 + 둔화' }, 4: { refundHit: 0.6, upDesc: '도착 피해가 적중하면 쿨타임 60% 돌려받음' } },
    },
    r: { name: '처형', icon: '☠', type: 'execute', range: 380, dmg: 170, missing: 0.3, threshold: 0.18, ultRefund: 60, hint: '근처 적 등 뒤로 이동해 처형. 체력 18% 이하가 되면 즉사, 처치 시 궁 게이지 60% 반환' },
  },
  longbow: {
    id: 'longbow',
    name: '장궁',
    icon: '🏹',
    role: '원거리 딜러',
    color: '#8cff6b',
    range: 760,
    basic: { name: '사격', type: 'proj', windup: 0.1, dur: 0.5, moveMult: 0.85, speed: 1200, range: 760, dmg: 65, r: 7, knock: 60 },
    q: {
      name: '신비한 화살', icon: '➶', type: 'proj', windup: 0.12, dur: 0.3, speed: 1750, range: 950, dmg: 130, r: 9, refundAll: 1, cd: 5,
      hint: '빠르고 가는 화살. 맞히면 모든 스킬 쿨타임 1초 감소',
      up: { 3: { slow: { amt: 0.25, t: 1.5 }, dmg: 150, upDesc: '피해 증가 + 둔화' }, 4: { pierce: 1, upDesc: '첫 적을 꿰뚫고 하나 더 맞힘' } },
    },
    w: {
      name: '일제 사격', icon: '🎯', type: 'fan', windup: 0.12, dur: 0.3, count: 7, spread: 0.9, speed: 1100, range: 620, dmg: 45, r: 7, slow: { amt: 0.25, t: 1.5 }, cd: 8,
      hint: '부채꼴로 화살 7발, 맞은 적 둔화',
      up: { 3: { count: 9, spread: 1.05, upDesc: '화살 9발' }, 4: { slow: { amt: 0.45, t: 1.5 }, dmg: 55, upDesc: '둔화 45% + 피해 증가' } },
    },
    e: {
      name: '비전 이동', icon: '✨', type: 'blinkskill', range: 360, bolt: { range: 650, dmg: 90 }, cd: 11,
      hint: '짧게 순간이동하고 가장 가까운 적에게 유도탄 발사',
      up: { 3: { bolt: { range: 800, dmg: 130 }, upDesc: '유도탄 피해·사거리 증가' }, 4: { cd: 6.5, upDesc: '쿨타임 6.5초' } },
    },
    r: { name: '정조준 화살', icon: '🏹', type: 'proj', windup: 0.45, dur: 0.6, moveMult: 0.3, speed: 1500, range: 1800, dmg: 280, r: 22, stunByDist: true, hint: '맵을 가로지르는 거대한 화살. 멀리서 맞을수록 오래 기절(최대 1초)' },
  },
  firestaff: {
    id: 'firestaff',
    name: '화염 지팡이',
    icon: '🔥',
    role: '광역 마법사',
    color: '#ff5a1f',
    range: 650,
    basic: { name: '불씨', type: 'proj', windup: 0.12, dur: 0.55, moveMult: 0.75, speed: 820, range: 650, dmg: 67, r: 10, dot: { dmg: 35, t: 2 }, knock: 40 },
    q: {
      name: '화염구', icon: '☄', type: 'proj', windup: 0.15, dur: 0.3, speed: 1100, range: 780, dmg: 130, r: 13, dot: { dmg: 50, t: 2 }, burnStun: 0.8, cd: 7,
      hint: '이미 불타는 적이 맞으면 0.8초 기절 (먼저 다른 불로 지져 놓기)',
      up: { 3: { dot: { dmg: 80, t: 3 }, upDesc: '화상 강화' }, 4: { burnStun: 1.0, splash: 110, upDesc: '기절 1초 + 주변 폭발' } },
    },
    w: {
      name: '불기둥', icon: '🔥', type: 'ground', range: 680, r: 120, delay: 0.65, ticks: 1, dmg: 170, dot: { dmg: 40, t: 2 }, burnBonus: 0.3, cd: 9, dur: 0.25,
      hint: '0.65초 뒤 불기둥. 불타는 적에게 30% 추가 피해',
      up: { 3: { r: 150, upDesc: '범위 확대' }, 4: { burnBonus: 0.6, upDesc: '불타는 적 추가 피해 60%' } },
    },
    e: {
      name: '화염 도약', icon: '🦅', type: 'blinkskill', range: 300, burn: { r: 80, t: 2, every: 0.5, dmg: 30 }, cd: 11,
      hint: '순간이동, 출발 지점에 불바닥',
      up: { 3: { range: 380, upDesc: '거리 +80' }, 4: { land: { r: 130, dmg: 60 }, upDesc: '도착 지점에 폭발' } },
    },
    r: { name: '운석', icon: '🌋', type: 'ground', range: 720, r: 190, delay: 1.0, ticks: 1, dmg: 420, after: { t: 3, every: 0.5, dmg: 45 }, dur: 0.3, hint: '1초 뒤 큰 운석, 불바닥이 남음' },
  },
  froststaff: {
    id: 'froststaff',
    name: '서리 지팡이',
    icon: '❄',
    role: '군중 제어',
    color: '#8fe3ff',
    range: 650,
    basic: { name: '얼음 화살', type: 'proj', windup: 0.1, dur: 0.5, moveMult: 0.75, speed: 880, range: 650, dmg: 86, r: 9, chill: 0.06, knock: 30 },
    q: {
      name: '서리 속박', icon: '⛓', type: 'proj', windup: 0.2, dur: 0.4, speed: 1150, range: 850, dmg: 170, r: 14, root: 0.8, cd: 8,
      hint: '첫 적중 대상을 0.8초 속박',
      up: { 3: { range: 1000, r: 18, upDesc: '사거리·폭 증가' }, 4: { pierce: 1, rootAll: true, upDesc: '두 명까지 꿰뚫고 모두 속박' } },
    },
    w: {
      name: '서리 고리', icon: '❅', type: 'ring', delay: 0.4, r: 170, dmg: 130, root: 0.6, cd: 11, dur: 0.35, moveMult: 0.3,
      hint: '0.4초 뒤 내 주변 적 속박',
      up: { 3: { r: 210, upDesc: '범위 확대' }, 4: { shieldSelf: 160, upDesc: '시전 시 보호막 160' } },
    },
    e: {
      name: '얼음 미끄럼', icon: '⛸', type: 'dashstrike', dist: 260, time: 0.2, dmg: 0, width: 0, cd: 10,
      hint: '빠르게 미끄러져 이동',
      up: { 3: { shield: 120, upDesc: '보호막 120' }, 4: { cd: 6, upDesc: '쿨타임 6초' } },
    },
    r: { name: '눈보라', icon: '🌨', type: 'field', range: 620, r: 230, t: 4, every: 0.5, dmg: 52, slow: { amt: 0.35, t: 0.6 }, freezeAfter: 2, freeze: 1, dur: 0.3, hint: '4초간 눈보라. 2초 넘게 머물면 빙결' },
  },
  spear: {
    id: 'spear',
    name: '창',
    icon: '🔱',
    role: '돌격',
    color: '#ffe066',
    range: 150,
    basic: {
      name: '찌르기',
      type: 'melee',
      moveMult: 0.45,
      comboWindow: 0.35,
      combo: [{ dmg: 80, range: 150, arc: 0.55, windup: 0.09, dur: 0.48, lunge: 30, knock: 90 }],
    },
    q: {
      name: '용의 일격', icon: '🐉', type: 'line', windup: 0.22, len: 340, width: 56, dmg: 140, dur: 0.38, moveMult: 0.2, flagDash: true, cd: 7,
      hint: '앞을 찌름. 찌르는 방향에 내 깃발이 있으면 깃발까지 돌진하며 적을 띄움(0.6초 기절)',
      up: { 3: { len: 400, upDesc: '사거리 +60' }, 4: { dmg: 190, slow: { amt: 0.3, t: 1.5 }, upDesc: '피해 증가 + 둔화' } },
    },
    w: {
      name: '휩쓸기', icon: '🌪', type: 'nova', windup: 0.1, dur: 0.32, r: 150, dmg: 110, knock: 420, cd: 8, moveMult: 0.4,
      hint: '주변을 휩쓸어 밀쳐냄. 벽에 박으면 기절',
      up: { 3: { r: 190, upDesc: '범위 확대' }, 4: { shieldSelf: 150, upDesc: '보호막 150' } },
    },
    e: {
      name: '군기', icon: '🚩', type: 'flag', range: 520, r: 90, dmg: 80, t: 6, cd: 10,
      hint: '깃발을 던져 꽂음(6초). Q로 깃발까지 돌진 가능',
      up: { 3: { slow: { amt: 0.4, t: 1.5 }, upDesc: '깃발 꽂힌 곳 둔화' }, 4: { cd: 6, upDesc: '쿨타임 6초' } },
    },
    r: { name: '투창', icon: '🔱', type: 'proj', windup: 0.3, dur: 0.45, moveMult: 0.3, speed: 1350, range: 900, dmg: 330, r: 13, root: 1.0, knock: 150, hint: '0.3초 준비 후 투창, 첫 적중 1초 속박' },
  },
};
export const WEAPON_IDS = Object.keys(WEAPONS);

// 등급이 반영된 스킬 정의 (영웅 3, 전설 4에서 고유 강화가 덮어씀)
export function skillAt(w, key, grade = 0) {
  const sk = w[key];
  if (!sk.up) return sk;
  let out = sk;
  for (const g of [3, 4]) if (grade >= g && sk.up[g]) out = { ...out, ...sk.up[g] };
  return out;
}

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
      return `${sk.delay}초 뒤 주변 반경 ${sk.r}에 ${sk.dmg}${sk.outer ? ` (바깥쪽 ×${sk.outer.mult})` : ''}${extra(sk)}${sk.heal ? `, 적중당 회복 ${sk.heal}` : ''}`;
    case 'nova':
      return `주변 반경 ${sk.r}에 ${sk.dmg}${sk.knock ? ' + 넉백' : ''}${extra(sk)}`;
    case 'execute':
      return `${sk.range} 안의 적 등 뒤로 순간이동, ${sk.dmg} + 잃은 체력의 ${pct(sk.missing)}${sk.threshold ? `, 체력 ${pct(sk.threshold)} 이하면 즉사` : ''}`;
    case 'fan':
      return `${sk.count}발 부채꼴 사격, 발당 ${sk.dmg}${extra(sk)}, 사거리 ${sk.range}`;
    case 'blinkskill':
      return `최대 ${sk.range} 순간이동${sk.burn ? `, 출발 지점 불바닥(0.5초마다 ${sk.burn.dmg})` : ''}${sk.land ? `, 도착 주변 ${sk.land.dmg}` : ''}${sk.bolt ? `, 유도탄 ${sk.bolt.dmg}` : ''}`;
    case 'empower':
      return `${sk.hasteT}초간 이동 +${pct(sk.haste)}, 다음 기본 공격 +${sk.bonus}${extra(sk)}`;
    case 'pull':
      return `앞 부채꼴(${sk.range}) ${sk.dmg} + 끌어당김${extra(sk)}`;
    case 'flag':
      return `깃발 투척(${sk.range}) ${sk.dmg}, ${sk.t}초 유지${extra(sk)}`;
    case 'backflip':
      return `뒤로 ${sk.dist} 도약 + 화살 ${sk.proj.dmg}${extra(sk.proj)}`;
    default:
      return '';
  }
}
for (const w of Object.values(WEAPONS)) {
  for (const k of ['basic', ...SKILL_KEYS]) {
    w[k].desc = skillDesc(w[k], k === 'basic');
    if (w[k].up) for (const g of [3, 4]) if (w[k].up[g]) w[k].up[g].desc = skillDesc(skillAt(w, k, g), false);
  }
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
// 각인 사용 결과: 더 높은 등급이면 그 등급으로, 같은 등급이면 한 단계 합성 상승, 낮으면 사용 불가(-1)
export function runeResult(grade, rarity) {
  if (rarity > grade) return rarity;
  if (rarity === grade && grade < RARITIES.length - 1) return grade + 1;
  return -1;
}
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
  const kind = r < 0.62 ? 'skill' : r < 0.81 ? 'armor' : 'boots';
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
