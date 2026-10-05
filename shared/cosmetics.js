// 치장품 카탈로그. 전투 능력에는 영향 없음 (외형만)
// cur: free(기본) / obol(무료 재화) / gem(유료 재화 영혼석) / achv(업적 해금)
export const COSMETIC_TYPES = {
  skin: '스킨',
  trail: '대시 잔상',
  slash: '스킬 이펙트',
  killfx: '처치 효과',
  title: '칭호',
};

export const COSMETICS = [
  // 스킨: 몸 색, 테두리, 중심, 눈, 장식
  { id: 'skin_shade', type: 'skin', name: '기본 망령', rarity: 0, price: 0, cur: 'free', body: '#7fd0ff', rim: '#e6fbff', core: '#ffffff', eye: '#10233a', acc: null },
  { id: 'skin_ember', type: 'skin', name: '잿불 영혼', rarity: 1, price: 800, cur: 'obol', body: '#ff7a3d', rim: '#ffd29a', core: '#fff1c4', eye: '#3a0d00', acc: 'flame' },
  { id: 'skin_verdant', type: 'skin', name: '엘리시움의 숨결', rarity: 1, price: 1200, cur: 'obol', body: '#4fdc8c', rim: '#d9ffe8', core: '#ffffff', eye: '#0b3320', acc: 'leaf' },
  { id: 'skin_abyss', type: 'skin', name: '심연의 그림자', rarity: 2, price: 1500, cur: 'obol', body: '#3b1f6b', rim: '#b18cff', core: '#14081f', eye: '#ff4df0', acc: 'void' },
  { id: 'skin_frost', type: 'skin', name: '서리 왕관', rarity: 2, price: 300, cur: 'gem', body: '#a8e9ff', rim: '#ffffff', core: '#e8fbff', eye: '#0a3550', acc: 'crown' },
  { id: 'skin_bloodmoon', type: 'skin', name: '핏빛 달', rarity: 2, price: 450, cur: 'gem', body: '#b3122e', rim: '#ff8095', core: '#ffd0d8', eye: '#ffe14d', acc: 'moon' },
  { id: 'skin_gold', type: 'skin', name: '황금 영웅', rarity: 3, price: 600, cur: 'gem', body: '#ffbe2e', rim: '#fff3c2', core: '#ffffff', eye: '#4a2a00', acc: 'laurel' },
  { id: 'skin_star', type: 'skin', name: '별에서 온 아이', rarity: 3, price: 900, cur: 'gem', body: '#1b1f4d', rim: '#9ab8ff', core: '#ffffff', eye: '#ffffff', acc: 'stars' },

  // 대시 잔상
  { id: 'trail_none', type: 'trail', name: '기본 잔상', rarity: 0, price: 0, cur: 'free', color: '#bfe9ff', style: 'ghost' },
  { id: 'trail_flame', type: 'trail', name: '불꽃', rarity: 1, price: 600, cur: 'obol', color: '#ff7a2e', style: 'flame' },
  { id: 'trail_spark', type: 'trail', name: '전류', rarity: 1, price: 900, cur: 'obol', color: '#7fe7ff', style: 'spark' },
  { id: 'trail_void', type: 'trail', name: '공허', rarity: 2, price: 1500, cur: 'obol', color: '#a259ff', style: 'void' },
  { id: 'trail_petal', type: 'trail', name: '벚꽃잎', rarity: 2, price: 250, cur: 'gem', color: '#ffb3d1', style: 'petal' },
  { id: 'trail_stardust', type: 'trail', name: '별가루', rarity: 2, price: 350, cur: 'gem', color: '#fff1a8', style: 'star' },
  { id: 'trail_rainbow', type: 'trail', name: '무지개', rarity: 3, price: 500, cur: 'gem', color: '#ff4d4d', style: 'rainbow' },

  // 스킬 이펙트 (베기/투사체 색)
  { id: 'slash_default', type: 'slash', name: '기본', rarity: 0, price: 0, cur: 'free', color: '#ffffff', color2: '#bfe9ff' },
  { id: 'slash_hellfire', type: 'slash', name: '지옥불', rarity: 1, price: 700, cur: 'obol', color: '#ff5a1f', color2: '#ffd45a' },
  { id: 'slash_venom', type: 'slash', name: '맹독', rarity: 1, price: 800, cur: 'obol', color: '#7dff4d', color2: '#d5ff9a' },
  { id: 'slash_arcane', type: 'slash', name: '비전', rarity: 2, price: 1000, cur: 'obol', color: '#9d5cff', color2: '#e0c8ff' },
  { id: 'slash_holy', type: 'slash', name: '신성', rarity: 2, price: 300, cur: 'gem', color: '#ffd95a', color2: '#ffffff' },
  { id: 'slash_prism', type: 'slash', name: '프리즘', rarity: 3, price: 550, cur: 'gem', color: '#ff5ad9', color2: '#5ae1ff', prism: true },

  // 처치 효과 (내가 처치한 적이 사라질 때 모두에게 보임)
  { id: 'kill_soul', type: 'killfx', name: '영혼 해방', rarity: 0, price: 0, cur: 'free', color: '#bfe9ff', style: 'soul' },
  { id: 'kill_thunder', type: 'killfx', name: '천벌', rarity: 2, price: 1200, cur: 'obol', color: '#ffe14d', style: 'thunder' },
  { id: 'kill_fireworks', type: 'killfx', name: '축포', rarity: 2, price: 1500, cur: 'obol', color: '#ff7ad9', style: 'fireworks' },
  { id: 'kill_bloom', type: 'killfx', name: '꽃의 장례', rarity: 2, price: 400, cur: 'gem', color: '#ff9ccf', style: 'bloom' },
  { id: 'kill_blackhole', type: 'killfx', name: '블랙홀', rarity: 3, price: 700, cur: 'gem', color: '#a259ff', style: 'blackhole' },

  // 칭호 (이름 아래 표시)
  { id: 'title_none', type: 'title', name: '(없음)', rarity: 0, price: 0, cur: 'free', text: '' },
  { id: 'title_rookie', type: 'title', name: '명계 신입', rarity: 0, price: 0, cur: 'free', text: '명계 신입' },
  { id: 'title_hunter', type: 'title', name: '망령 사냥꾼', rarity: 1, cur: 'achv', achv: { stat: 'monsterKills', goal: 300, label: '몬스터 300마리 처치' }, text: '망령 사냥꾼' },
  { id: 'title_slayer', type: 'title', name: '영혼 수확자', rarity: 2, cur: 'achv', achv: { stat: 'kills', goal: 50, label: '플레이어 50명 처치' }, text: '영혼 수확자' },
  { id: 'title_lord', type: 'title', name: '스틱스의 지배자', rarity: 3, cur: 'achv', achv: { stat: 'wins', goal: 10, label: '10회 우승' }, text: '스틱스의 지배자' },
  { id: 'title_favored', type: 'title', name: '신들의 총애', rarity: 2, price: 200, cur: 'gem', text: '신들의 총애' },
];

export const COSMETIC_MAP = Object.fromEntries(COSMETICS.map((c) => [c.id, c]));

export const DEFAULT_COSMETICS = {
  skin: 'skin_shade',
  trail: 'trail_none',
  slash: 'slash_default',
  killfx: 'kill_soul',
  title: 'title_none',
};

export const RARITY_LABEL = ['기본', '희귀', '영웅', '전설'];
export const RARITY_COLOR = ['#c9c9d6', '#4da3ff', '#c56bff', '#ffb340'];

export function sanitizeCosmetics(cos) {
  const out = { ...DEFAULT_COSMETICS };
  if (cos && typeof cos === 'object') {
    for (const type of Object.keys(DEFAULT_COSMETICS)) {
      const id = cos[type];
      const c = typeof id === 'string' ? COSMETIC_MAP[id] : null;
      if (c && c.type === type) out[type] = id;
    }
  }
  return out;
}

// 봇도 치장품을 착용 → 다른 유저 눈에 띄어 구매 욕구 자극
export function randomCosmetics(rng) {
  const out = { ...DEFAULT_COSMETICS };
  for (const type of Object.keys(DEFAULT_COSMETICS)) {
    if (type === 'title') continue;
    if (rng() < 0.55) {
      const list = COSMETICS.filter((c) => c.type === type);
      out[type] = list[Math.floor(rng() * list.length)].id;
    }
  }
  return out;
}
