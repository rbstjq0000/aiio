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
  // 스킨: 닌자 외형 (Ninja Adventure). sheet = client/assets/skins/<sheet>.png
  { id: 'skin_blue', type: 'skin', name: '푸른 닌자', rarity: 0, price: 0, cur: 'free', sheet: 'NinjaBlue' },
  { id: 'skin_red', type: 'skin', name: '붉은 닌자', rarity: 0, price: 0, cur: 'free', sheet: 'NinjaRed' },
  { id: 'skin_green', type: 'skin', name: '초록 닌자', rarity: 0, price: 0, cur: 'free', sheet: 'NinjaGreen' },
  { id: 'skin_gray', type: 'skin', name: '잿빛 닌자', rarity: 0, price: 0, cur: 'free', sheet: 'NinjaGray' },
  { id: 'skin_yellow', type: 'skin', name: '노란 닌자', rarity: 1, price: 600, cur: 'obol', sheet: 'NinjaYellow' },
  { id: 'skin_dark', type: 'skin', name: '어둠 닌자', rarity: 1, price: 900, cur: 'obol', sheet: 'NinjaDark' },
  { id: 'skin_eskimo', type: 'skin', name: '설원 닌자', rarity: 1, price: 1200, cur: 'obol', sheet: 'NinjaEskimo' },
  { id: 'skin_masked', type: 'skin', name: '가면 닌자', rarity: 2, price: 1600, cur: 'obol', sheet: 'NinjaMasked' },
  { id: 'skin_leaf', type: 'skin', name: '잎새 닌자', rarity: 2, price: 250, cur: 'gem', sheet: 'NinjaLeaf' },
  { id: 'skin_water', type: 'skin', name: '물결 닌자', rarity: 2, price: 300, cur: 'gem', sheet: 'NinjaWater' },
  { id: 'skin_fire', type: 'skin', name: '화염 닌자', rarity: 3, price: 450, cur: 'gem', sheet: 'NinjaFire' },
  { id: 'skin_thunder', type: 'skin', name: '번개 닌자', rarity: 3, price: 450, cur: 'gem', sheet: 'NinjaThunder' },

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
  { id: 'title_rookie', type: 'title', name: '초보 닌자', rarity: 0, price: 0, cur: 'free', text: '초보 닌자' },
  { id: 'title_hunter', type: 'title', name: '몬스터 사냥꾼', rarity: 1, cur: 'achv', achv: { stat: 'monsterKills', goal: 300, label: '몬스터 300마리 처치' }, text: '몬스터 사냥꾼' },
  { id: 'title_slayer', type: 'title', name: '그림자 사신', rarity: 2, cur: 'achv', achv: { stat: 'kills', goal: 50, label: '플레이어 50명 처치' }, text: '그림자 사신' },
  { id: 'title_lord', type: 'title', name: '섬의 지배자', rarity: 3, cur: 'achv', achv: { stat: 'wins', goal: 10, label: '10회 우승' }, text: '섬의 지배자' },
  { id: 'title_favored', type: 'title', name: '전설의 닌자', rarity: 2, price: 200, cur: 'gem', text: '전설의 닌자' },
];

export const COSMETIC_MAP = Object.fromEntries(COSMETICS.map((c) => [c.id, c]));

export const DEFAULT_COSMETICS = {
  skin: 'skin_blue',
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
    if (type === 'skin' || rng() < 0.55) {
      const list = COSMETICS.filter((c) => c.type === type);
      out[type] = list[Math.floor(rng() * list.length)].id;
    }
  }
  return out;
}
