// 증강: 상자를 열면 같은 등급의 증강 3개 중 하나를 고름 (롤 아레나 방식)
// 등급: 0 실버 / 1 골드 / 2 프리즘
// 효과는 두 가지 방식으로 적용됨
//   stats: 장착 즉시 능력치에 더해짐 (sim.recomputeStats)
//   hook 이름(flag): 전투 코드(combat.js)가 p.aug[이름]으로 확인해서 발동
export const AUG_TIERS = [
  { id: 'silver', name: '실버', color: '#c9d4e0' },
  { id: 'gold', name: '골드', color: '#ffcf4a' },
  { id: 'prism', name: '프리즘', color: '#ff7ef2' },
];

export const AUGMENTS = [
  // ---------------- 실버: 무난한 능력치 ----------------
  { id: 'tough', tier: 0, icon: '❤', name: '단련', desc: '최대 체력 +15%', stats: { hp: 0.15 } },
  { id: 'swift', tier: 0, icon: '👟', name: '날렵함', desc: '이동 속도 +8%', stats: { speed: 0.08 } },
  { id: 'sharp', tier: 0, icon: '🗡', name: '예리함', desc: '기본 공격 피해 +18%', stats: { basicDmg: 0.18 } },
  { id: 'focus', tier: 0, icon: '⏳', name: '집중', desc: '스킬 쿨타임 -12%', stats: { cdr: 0.12 } },
  { id: 'leech', tier: 0, icon: '🩸', name: '흡혈', desc: '준 피해의 8%만큼 회복', stats: { lifesteal: 0.08 } },
  { id: 'roller', tier: 0, icon: '🌀', name: '구르기 장인', desc: '구르기(D) 쿨타임 -40%', stats: { rollCdr: 0.4 } },
  { id: 'lucky', tier: 0, icon: '🎯', name: '급소 노리기', desc: '치명타 확률 +20% (1.75배 피해)', stats: { crit: 0.2 } },
  { id: 'regen', tier: 0, icon: '🌿', name: '재생', desc: '항상 초당 최대 체력 1.5% 회복', stats: { regen: 0.015 } },
  { id: 'hasty', tier: 0, icon: '⚡', name: '속사', desc: '기본 공격 속도 +20%', stats: { atkSpeed: 0.2 } },
  { id: 'ultcharge', tier: 0, icon: '★', name: '궁극 충전', desc: '궁극기 게이지가 1.6배 빨리 참', stats: { ultGain: 0.6 } },

  // ---------------- 골드: 플레이가 바뀌는 효과 ----------------
  { id: 'executioner', tier: 1, icon: '⚔', name: '처형자', desc: '체력 35% 이하인 적에게 주는 피해 +30%', flag: 'executioner' },
  { id: 'chain', tier: 1, icon: '⚡', name: '연쇄 번개', desc: '기본 공격 3번째마다 번개가 근처 적 3명에게 튐 (각 90)', flag: 'chain' },
  { id: 'firetrail', tier: 1, icon: '🔥', name: '불꽃 발자국', desc: '구르면 지나간 자리에 2초간 불길 (0.5초마다 35)', flag: 'firetrail' },
  { id: 'thorns', tier: 1, icon: '🌵', name: '가시 갑옷', desc: '기본 공격으로 받은 피해의 35%를 되돌려줌', flag: 'thorns' },
  { id: 'secondwind', tier: 1, icon: '🛡', name: '두 번째 바람', desc: '체력이 30% 아래로 떨어지면 최대 체력 30% 보호막 (40초마다)', flag: 'secondwind' },
  { id: 'shurikens', tier: 1, icon: '✴', name: '마법 수리검', desc: '스킬로 적을 맞히면 그 적에게 유도 수리검 2개 (각 45)', flag: 'shurikens' },
  { id: 'giant', tier: 1, icon: '🗿', name: '거인화', desc: '몸 크기 +25%, 최대 체력 +30%, 이동 -5%', stats: { hp: 0.3, speed: -0.05, size: 0.25 } },
  { id: 'qawaken', tier: 1, icon: 'Q', name: 'Q 각성', desc: 'Q 스킬이 영웅 강화 형태로 바뀜', grade: { q: 3 } },
  { id: 'wawaken', tier: 1, icon: 'W', name: 'W 각성', desc: 'W 스킬이 영웅 강화 형태로 바뀜', grade: { w: 3 } },
  { id: 'eawaken', tier: 1, icon: 'E', name: 'E 각성', desc: 'E 스킬이 영웅 강화 형태로 바뀜', grade: { e: 3 } },
  { id: 'hunter', tier: 1, icon: '🏹', name: '사냥꾼', desc: '처치할 때마다 영구적으로 피해 +4% (최대 10번)', flag: 'hunter' },

  // ---------------- 프리즘: 판을 뒤집는 효과 ----------------
  { id: 'doublecast', tier: 2, icon: '✌', name: '이중 시전', desc: 'Q가 0.35초 뒤 한 번 더 시전됨', flag: 'doublecast' },
  { id: 'undying', tier: 2, icon: '👼', name: '불사', desc: '죽을 피해를 받으면 대신 2초 무적 + 체력 30% (판당 1번)', flag: 'undying' },
  { id: 'berserk', tier: 2, icon: '😡', name: '광전사', desc: '기본 공격 속도 +45%, 이동 +10%, 흡혈 10%', stats: { atkSpeed: 0.45, speed: 0.1, lifesteal: 0.1 } },
  { id: 'reset', tier: 2, icon: '♻', name: '처형인의 칼날', desc: '적 플레이어를 처치하면 모든 스킬 쿨타임 초기화 + 궁극기 50%', flag: 'reset' },
  { id: 'meteor', tier: 2, icon: '☄', name: '운석 낙하', desc: '5초마다 가장 가까운 적 발밑에 운석 (180)', flag: 'meteor' },
  { id: 'vampire', tier: 2, icon: '🧛', name: '흡혈귀', desc: '흡혈 20%, 넘치는 회복은 보호막으로 (최대 300)', stats: { lifesteal: 0.2 }, flag: 'overheal' },
  { id: 'qmaster', tier: 2, icon: 'Q', name: 'Q 초월', desc: 'Q 스킬이 전설 강화 형태로 바뀌고 쿨타임 -25%', grade: { q: 4 }, stats: { qcdr: 0.25 } },
  { id: 'rmaster', tier: 2, icon: 'R', name: '궁극 초월', desc: '궁극기 게이지 2배, 궁극기 피해 +30%', stats: { ultGain: 1, ultDmg: 0.3 } },
  { id: 'gambler', tier: 2, icon: '🎰', name: '도박사', desc: '앞으로 여는 상자의 등급이 한 단계 높게 나올 확률 +50%, 지금 바로 무작위 골드 증강 1개 추가', flag: 'gambler' },
];

export const AUG_BY_ID = Object.fromEntries(AUGMENTS.map((a) => [a.id, a]));

// 상자 등급 확률: [실버, 골드, 프리즘]
export const CHEST_ODDS = {
  small: [0.68, 0.27, 0.05],
  big: [0.3, 0.5, 0.2],
  bounty: [0.1, 0.5, 0.4],
};

export function rollTier(rng, kind, luck = 0) {
  const o = CHEST_ODDS[kind] || CHEST_ODDS.small;
  let r = rng();
  let tier = r < o[0] ? 0 : r < o[0] + o[1] ? 1 : 2;
  // 도박사: 한 단계 올라갈 확률
  if (tier < 2 && luck > 0 && rng() < luck) tier++;
  return tier;
}

// 아직 없는 증강 중 같은 등급에서 3개
export function pickOffer(rng, tier, owned, n = 3) {
  let pool = AUGMENTS.filter((a) => a.tier === tier && !owned.includes(a.id));
  if (pool.length < n) pool = AUGMENTS.filter((a) => !owned.includes(a.id));
  const out = [];
  while (out.length < n && pool.length) out.push(pool.splice(Math.floor(rng() * pool.length), 1)[0].id);
  return out;
}
