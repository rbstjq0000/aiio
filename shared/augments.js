// 증강: 최대 3칸. 6계열 × 4종, 같은 계열 2개·3개를 모으면 세트 효과 (TFT식)
// 들고 있는 무기의 계열(무기 공명)은 세트 개수를 1 올려 줌 (그 계열 증강이 1개 이상 있을 때)
// 얻는 곳: 적 처치(상대 증강 중 하나), 에픽 보물. 상자는 무기만 줌
// 등급(실버·골드·프리즘)은 같은 증강의 수치 배율
export const AUG_TIERS = [
  { id: 'silver', name: '실버', color: '#c9d4e0', mult: 1 },
  { id: 'gold', name: '골드', color: '#ffcf4a', mult: 1.4 },
  { id: 'prism', name: '프리즘', color: '#ff7ef2', mult: 1.8 },
];
export const AUG_SLOTS = 3;

export const FAMILIES = [
  { id: 'fire', name: '화염', icon: '🔥', color: '#ff7a3d', set2: '화상 피해 +50%', set3: '불타는 적이 죽으면 폭발 (주변 160에 150)' },
  { id: 'storm', name: '번개', icon: '⚡', color: '#ffe14d', set2: '번개가 1명 더 튐, 스킬 쿨 -8%', set3: '3초마다 가까운 적에게 번개 (120)' },
  { id: 'shadow', name: '그림자', icon: '🌑', color: '#b28cff', set2: '등 뒤에서 때리면 치명타', set3: '처치하면 2초간 투명 + 이동 +30%' },
  { id: 'steel', name: '강철', icon: '🛡', color: '#9fb4c8', set2: '받는 피해 -10%', set3: '10초마다 최대 체력 15% 보호막' },
  { id: 'blood', name: '피', icon: '🩸', color: '#ff4d6b', set2: '체력이 낮을수록 공격 속도 증가 (최대 +40%)', set3: '처치하면 체력 50% 회복' },
  { id: 'wind', name: '바람', icon: '🍃', color: '#7ed957', set2: '구르기 2번 연속 사용 가능', set3: '구르고 나면 1.5초간 이동 +40%' },
];
export const FAMILY_BY_ID = Object.fromEntries(FAMILIES.map((f) => [f.id, f]));
export const FAMILY_IDS = FAMILIES.map((f) => f.id);

// v: 기본 수치 (등급 배율이 곱해짐). short: 카드에 쓰는 한 줄 요약
export const AUGMENTS = [
  // 🔥 화염
  { id: 'firetrail', fam: 'fire', icon: '👣', name: '불꽃 발자국', v: 35, short: '구르면 불길', desc: (v) => `구른 자리에 2초간 불길 (0.5초마다 ${v})` },
  { id: 'meteor', fam: 'fire', icon: '☄', name: '운석 낙하', v: 160, short: '6초마다 운석', desc: (v) => `6초마다 가장 가까운 적 발밑에 운석 (${v})` },
  { id: 'ignite', fam: 'fire', icon: '🕯', name: '불씨 손길', v: 40, short: '평타가 화상', desc: (v) => `기본 공격이 2초간 ${v} 화상을 입힘` },
  { id: 'scorch', fam: 'fire', icon: '🔥', name: '화상 강화', v: 0.4, short: '화상 피해 증가', desc: (v) => `내가 입히는 화상 피해 +${Math.round(v * 100)}%` },
  // ⚡ 번개
  { id: 'chain', fam: 'storm', icon: '⚡', name: '연쇄 번개', v: 85, short: '평타 3번째 번개', desc: (v) => `기본 공격 3번째마다 번개가 근처 적 3명에게 튐 (각 ${v})` },
  { id: 'hasty', fam: 'storm', icon: '⏩', name: '속사', v: 0.2, short: '공격 속도 증가', desc: (v) => `기본 공격 속도 +${Math.round(v * 100)}%` },
  { id: 'thunder', fam: 'storm', icon: '🌩', name: '뇌격', v: 70, short: '스킬 적중 시 번개', desc: (v) => `스킬로 적을 맞히면 번개가 떨어짐 (${v}, 대상마다 1초)` },
  { id: 'overload', fam: 'storm', icon: '🔋', name: '과부하', v: 0.12, short: '스킬 쿨 감소', desc: (v) => `스킬 쿨타임 -${Math.round(v * 100)}%` },
  // 🌑 그림자
  { id: 'executioner', fam: 'shadow', icon: '⚔', name: '처형자', v: 0.25, short: '약한 적에게 강함', desc: (v) => `체력 35% 이하인 적에게 주는 피해 +${Math.round(v * 100)}%` },
  { id: 'shurikens', fam: 'shadow', icon: '✴', name: '마법 수리검', v: 45, short: '스킬 적중 시 수리검', desc: (v) => `스킬로 적을 맞히면 유도 수리검 2개 (각 ${v})` },
  { id: 'shadowstep', fam: 'shadow', icon: '👻', name: '그림자 걸음', v: 1.2, short: '구르면 투명', desc: (v) => `구르면 ${Math.round(v * 10) / 10}초간 투명 (공격하면 풀림)` },
  { id: 'vital', fam: 'shadow', icon: '🎯', name: '급소 노리기', v: 0.18, short: '치명타 확률', desc: (v) => `치명타 확률 +${Math.round(v * 100)}% (1.75배 피해)` },
  // 🛡 강철
  { id: 'tough', fam: 'steel', icon: '❤', name: '단련', v: 0.16, short: '최대 체력 증가', desc: (v) => `최대 체력 +${Math.round(v * 100)}%` },
  { id: 'thorns', fam: 'steel', icon: '🌵', name: '가시 갑옷', v: 0.3, short: '평타 피해 반사', desc: (v) => `기본 공격으로 받은 피해의 ${Math.round(v * 100)}%를 되돌려줌` },
  { id: 'secondwind', fam: 'steel', icon: '💨', name: '두 번째 바람', v: 0.28, short: '위기 때 보호막', desc: (v) => `체력이 30% 아래로 떨어지면 최대 체력 ${Math.round(v * 100)}% 보호막 (40초마다)` },
  { id: 'giant', fam: 'steel', icon: '🗿', name: '거인화', v: 0.25, short: '커지고 단단해짐', desc: (v) => `몸 크기 +25%, 최대 체력 +${Math.round(v * 100)}%, 이동 -5%` },
  // 🩸 피
  { id: 'leech', fam: 'blood', icon: '🩸', name: '흡혈', v: 0.09, short: '피해만큼 회복', desc: (v) => `준 피해의 ${Math.round(v * 100)}%만큼 회복` },
  { id: 'berserk', fam: 'blood', icon: '😡', name: '광전사', v: 0.25, short: '공속 + 이속', desc: (v) => `기본 공격 속도 +${Math.round(v * 100)}%, 이동 +6%` },
  { id: 'vampire', fam: 'blood', icon: '🧛', name: '흡혈귀', v: 0.07, short: '흡혈 + 보호막', desc: (v) => `흡혈 ${Math.round(v * 100)}%, 넘치는 회복은 보호막으로 (최대 300)` },
  { id: 'hunter', fam: 'blood', icon: '🏹', name: '사냥꾼', v: 0.04, short: '처치마다 강해짐', desc: (v) => `플레이어를 처치할 때마다 피해 +${Math.round(v * 1000) / 10}% (최대 8번)` },
  // 🍃 바람
  { id: 'swift', fam: 'wind', icon: '👟', name: '날렵함', v: 0.09, short: '이동 속도', desc: (v) => `이동 속도 +${Math.round(v * 100)}%` },
  { id: 'roller', fam: 'wind', icon: '🌀', name: '구르기 장인', v: 0.35, short: '구르기 쿨 감소', desc: (v) => `구르기 쿨타임 -${Math.round(v * 100)}%` },
  { id: 'gust', fam: 'wind', icon: '🌬', name: '질풍', v: 0.3, short: '스킬 후 빨라짐', desc: (v) => `스킬을 쓰면 1초간 이동 +${Math.round(v * 100)}%` },
  { id: 'phantom', fam: 'wind', icon: '✨', name: '잔상', v: 0.2, short: '구르기 무적 증가', desc: (v) => `구르기 무적 시간 +${Math.round(v * 100) / 100}초` },
];
export const AUG_BY_ID = Object.fromEntries(AUGMENTS.map((a) => [a.id, a]));

// 증강 하나의 실제 수치
export function augValue(id, tier) {
  const a = AUG_BY_ID[id];
  return a ? a.v * AUG_TIERS[tier].mult : 0;
}

export function augDesc(id, tier) {
  const a = AUG_BY_ID[id];
  if (!a) return '';
  const v = augValue(id, tier);
  // 피해 같은 큰 수는 정수로, 비율은 그대로 (설명 함수가 %로 바꿈)
  return a.desc(v >= 2 ? Math.round(v) : Math.round(v * 1000) / 1000);
}

// 계열별 개수 (무기 공명 포함)와 켜진 세트
export function familyCounts(augs, weaponFamily) {
  const n = {};
  for (const g of augs) {
    const a = AUG_BY_ID[g.id];
    if (a) n[a.fam] = (n[a.fam] || 0) + 1;
  }
  if (weaponFamily && n[weaponFamily]) n[weaponFamily] += 1;
  return n;
}

// 아직 없는 증강 중 n개 (같은 계열이 몰리지 않게 섞음)
export function randomAugs(rng, owned, n = 3) {
  const pool = AUGMENTS.filter((a) => !owned.includes(a.id));
  const out = [];
  while (out.length < n && pool.length) out.push(pool.splice(Math.floor(rng() * pool.length), 1)[0].id);
  return out;
}

// 증강 등급: 실버/골드/프리즘 확률
export const OFFER_ODDS = {
  kill: [0.7, 0.27, 0.03],
  epic: [0, 0.75, 0.25],
  titan: [0, 0.2, 0.8],
};

export function rollAugTier(rng, kind) {
  const o = OFFER_ODDS[kind] || OFFER_ODDS.kill;
  const r = rng();
  return r < o[0] ? 0 : r < o[0] + o[1] ? 1 : 2;
}
