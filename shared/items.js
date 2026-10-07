// 무기 데이터: 단도 · 표창 · 두루마리. 롤에서 1:1 손싸움으로 유명한 셋의 스킬 구성을 빌려 옴 (이름·그림은 닌자식)
//   단도 = 3단 베기 돌진 검사, 표창 = 구르기·벽꿍 사수, 두루마리 = 구슬·매혹·3번 질주 술사
// 상성은 스킬이 하는 일에서만 나옴 (수치 보정 없음). 등급이 오를수록 특수효과가 하나씩 붙음
//   고급 = 평타 강화, 희귀 = Q 강화, 영웅 = W 강화, 전설 = E 강화, 신화 = R 강화
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
// melee 부채꼴 근접(combo) / proj 투사체 / nova 즉시 내 주변 범위 / dashstrike 돌진(+보호막)
// steps 3단 돌진 베기(다시 누르기) / bladeUlt 강화 → 다시 누르면 검기 / tumble 구르기 + 다음 평타 강화
// passive 누를 필요 없음 / hunt 강화 상태(평타 피해·구르면 은신) / foxfire 유도 여우불 / rush 3번 질주 + 유도탄
export const SKILL_KEYS = ['q', 'w', 'e', 'r'];

export const WEAPONS = {
  dagger: {
    id: 'dagger',
    name: '단도',
    icon: '🗡',
    role: '근접 · 3단 베기 돌진',
    color: '#b28cff',
    range: 85,
    hp: 1.22, // 근접은 붙기 전에 맞으니 체력이 더 많음
    speed: 1.08,
    family: 'shadow', // 무기 공명: 🌑그림자 증강
    beats: 'scroll',
    passive: { name: '칼날 기운', desc: '스킬을 쓸 때마다 칼날 기운 1개 (최대 3개). 기본 공격이 기운 하나를 써서 추가 피해', max: 3, bonus: 55 },
    basic: {
      name: '베기',
      type: 'melee',
      moveMult: 0.7,
      comboWindow: 0.3,
      combo: [
        { dmg: 52, range: 85, arc: 1.8, windup: 0.05, dur: 0.3, lunge: 18, knock: 0 },
        { dmg: 52, range: 85, arc: 1.8, windup: 0.05, dur: 0.3, lunge: 18, knock: 0 },
      ],
    },
    q: { name: '부서진 날개', icon: '🪶', type: 'steps', dist: 220, time: 0.16, r: 105, dmg: 95, r3: 135, stun3: 0.5, window: 4, gap: 0.3, cd: 7, hint: '커서 쪽으로 짧게 돌진하며 벰. 4초 안에 다시 눌러 3번까지, 3번째는 뛰어올라 내려찍어 기절. 평타 사이사이에 끼우면 빠름' },
    w: { name: '기 폭발', icon: '💥', type: 'nova', windup: 0.05, dur: 0.2, moveMult: 1, r: 130, dmg: 110, stun: 0.6, cd: 9, hint: '내 주변을 터뜨려 기절' },
    e: { name: '용맹', icon: '🛡', type: 'dashstrike', dist: 280, time: 0.2, dmg: 0, shield: 200, cd: 9, hint: '커서 쪽으로 돌진하며 보호막' },
    r: { name: '추방자의 검', icon: '⚔', type: 'bladeUlt', t: 8, buff: 0.2, wave: { count: 7, spread: 0.9, range: 620, speed: 1150, dmg: 120, missing: 0.45 }, hint: '8초간 피해 +20%. 그동안 R을 다시 누르면 부채꼴 검기 (체력이 적은 적일수록 더 아픔)' },
    tiers: [
      null,
      { o: { combo: [{ dmg: 48, range: 85, arc: 1.8, windup: 0.05, dur: 0.3, lunge: 18, knock: 0 }, { dmg: 48, range: 85, arc: 1.8, windup: 0.05, dur: 0.3, lunge: 18, knock: 0 }, { dmg: 78, range: 95, arc: 2.0, windup: 0.08, dur: 0.36, lunge: 40, knock: 60 }] }, desc: '평타 3번째 베기가 강해짐' },
      { o: { dmg: 115, r3: 165, stun3: 0.7 }, desc: '부서진 날개 피해 증가 + 3번째 범위·기절 증가' },
      { o: { r: 160, cd: 7 }, desc: '기 폭발 범위 증가 + 쿨타임 7초' },
      { o: { shield: 300, cd: 7 }, desc: '용맹 보호막 증가 + 쿨타임 7초' },
      { o: { t: 10, wave: { count: 9, spread: 1.0, range: 680, speed: 1150, dmg: 150, missing: 0.7 } }, desc: '추방자의 검 10초 + 검기 강화 (처형력 증가)' },
    ],
  },
  shuriken: {
    id: 'shuriken',
    name: '표창',
    icon: '✴',
    role: '원거리 · 구르기 사냥꾼',
    color: '#8cff6b',
    range: 640,
    hp: 1.0,
    speed: 1.04,
    family: 'wind', // 🍃바람
    beats: 'dagger',
    basic: { name: '표창 던지기', type: 'proj', windup: 0.1, dur: 0.5, moveMult: 0.85, speed: 1300, range: 640, dmg: 60, r: 8 },
    q: { name: '구르기 사격', icon: '🤸', type: 'tumble', dist: 170, time: 0.16, bonus: 40, window: 3, cd: 4, hint: '커서 쪽으로 구르고, 다음 기본 공격이 바로 나가며 강화됨' },
    w: { name: '은빛 표창', icon: '🥈', type: 'passive', every: 3, base: 20, pct: 0.05, hint: '(자동) 같은 적에게 기본 공격·스킬을 3번 연속 맞히면 최대 체력의 5% + 20 추가 피해' },
    e: { name: '단죄', icon: '🎯', type: 'proj', windup: 0.12, dur: 0.3, speed: 1500, range: 550, dmg: 80, r: 12, condemn: { dist: 220, stun: 1.2, dmg: 120 }, cd: 12, hint: '큰 표창으로 적을 멀리 밀어냄. 벽·나무·바위에 부딪히면 기절 + 추가 피해' },
    r: { name: '사냥의 시간', icon: '🌙', type: 'hunt', t: 8, bonus: 20, haste: 0.12, stealth: 1, hint: '8초간 기본 공격 피해 증가·이동 속도 증가. 그동안 구르기를 하면 1초 은신' },
    tiers: [
      null,
      { o: { dmg: 68 }, desc: '평타 피해 증가' },
      { o: { bonus: 60, cd: 3.5 }, desc: '구르기 사격 강화 피해 증가 + 쿨타임 3.5초' },
      { o: { pct: 0.07 }, desc: '은빛 표창 최대 체력 7%' },
      { o: { condemn: { dist: 260, stun: 1.5, dmg: 160 }, cd: 10 }, desc: '단죄 벽꿍 기절 1.5초 + 쿨타임 10초' },
      { o: { t: 11, bonus: 32, stealth: 1.5 }, desc: '사냥의 시간 11초 + 평타 피해 더 증가 + 은신 1.5초' },
    ],
  },
  scroll: {
    id: 'scroll',
    name: '두루마리',
    icon: '📜',
    role: '인술 · 구슬과 매혹',
    color: '#ff7a3d',
    range: 700,
    hp: 0.92, // 몸이 약한 대신 멀리서 견제하고 질주로 빠짐
    speed: 1.0,
    family: 'fire', // 🔥화염
    beats: 'shuriken',
    basic: { name: '여우 구슬탄', type: 'proj', windup: 0.12, dur: 0.55, moveMult: 0.7, speed: 1000, range: 700, dmg: 70, r: 10 },
    q: { name: '현혹의 구슬', icon: '🔮', type: 'proj', windup: 0.2, dur: 0.35, speed: 1100, range: 820, dmg: 115, r: 16, pierce: 99, ret: true, cd: 5, hint: '구슬이 날아갔다가 돌아옴. 갈 때와 올 때 모두 맞힘' },
    w: { name: '여우불', icon: '🔥', type: 'foxfire', count: 3, range: 620, dmg: 60, cd: 7, hint: '가까운 적에게 날아가는 여우불 3개' },
    e: { name: '매혹', icon: '💗', type: 'proj', windup: 0.15, dur: 0.3, speed: 1300, range: 900, dmg: 90, r: 14, charm: 1.3, cd: 10, hint: '처음 맞은 적이 1.3초간 홀려서 나에게 걸어옴 (아무것도 못 함)' },
    r: { name: '혼령 질주', icon: '🦊', type: 'rush', dashes: 3, window: 10, dist: 300, time: 0.18, gap: 0.6, bolts: 3, boltDmg: 60, boltRange: 600, hint: '커서 쪽으로 질주하며 주변 적에게 유도탄. 10초 안에 R을 다시 눌러 3번까지' },
    tiers: [
      null,
      { o: { dmg: 80 }, desc: '평타 피해 증가' },
      { o: { dmg: 160, r: 20 }, desc: '현혹의 구슬 피해·크기 증가' },
      { o: { count: 4 }, desc: '여우불 4개' },
      { o: { charm: 1.4, r: 18, cd: 12 }, desc: '매혹 1.4초 + 더 넓게' },
      { o: { dashes: 4, boltDmg: 80 }, desc: '혼령 질주 4번 + 유도탄 강화' },
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
  if (sk.charm) t += ` + 매혹 ${sk.charm}초`;
  if (sk.condemn) t += ` + 밀쳐내기 (벽꿍 기절 ${sk.condemn.stun}초 + ${sk.condemn.dmg})`;
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
    case 'steps':
      return `돌진 베기 ${sk.dmg} ×3 (3번째 범위 ${sk.r3}, 기절 ${sk.stun3}초)`;
    case 'dashstrike':
      return `${sk.dist} 돌진${sk.shield ? ` + 보호막 ${sk.shield}` : ''}${sk.dmg ? ` + ${sk.dmg}` : ''}`;
    case 'bladeUlt':
      return `${sk.t}초간 피해 +${pct(sk.buff)}, 검기 ${sk.wave.count}갈래 ${sk.wave.dmg} (잃은 체력 비례 최대 +${pct(sk.wave.missing * 2)})`;
    case 'tumble':
      return `${sk.dist} 구르기 + 다음 평타 +${sk.bonus}`;
    case 'passive':
      return `${sk.every}번째 연속 적중마다 ${sk.base} + 최대 체력 ${pct(sk.pct)}`;
    case 'hunt':
      return `${sk.t}초간 평타 +${sk.bonus}, 이동 +${pct(sk.haste)}, 구르면 ${sk.stealth}초 은신`;
    case 'foxfire':
      return `유도 여우불 ${sk.count}개, 발당 ${sk.dmg}, 사거리 ${sk.range}`;
    case 'rush':
      return `${sk.dist} 질주 ${sk.dashes}번, 매번 유도탄 ${sk.bolts}개 (${sk.boltDmg})`;
    case 'barrier':
      return `앞에 길이 ${sk.len} 장막 ${sk.t}초 (적 투사체를 막음)`;
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
