// 도트 에셋 로더 + 스프라이트 정의 (Ninja Adventure, CC0 — client/assets/LICENSE-ninja-adventure.txt)
// 단일 HTML 데모에서는 빌드 도구가 window.__STYX_ASSETS__ 에 data URL을 넣어 둔다.
import { COSMETIC_MAP } from '../shared/cosmetics.js';

// 묶음 빌드(단일 HTML)에서는 import.meta.url 이 없으므로 상대 경로로 대신함
let BASE = './assets/';
try {
  BASE = new URL('./assets/', import.meta.url).href;
} catch {
  // 단일 HTML: window.__STYX_ASSETS__ 를 씀
}

// 무기별 손에 든 그림 [파일, 그릴 배율]
export const WEAPON_LOOK = {
  dagger: { held: 'weapons/Ninjaku.png', scale: 1, icon: 'weapons/Ninjaku.png' },
  shuriken: { held: 'proj/Shuriken.png', scale: 0.6, icon: 'proj/Shuriken.png' },
  scroll: { held: 'weapons/ScrollFire.png', scale: 0.6, icon: 'weapons/ScrollFire.png' },
};

// 닌자 스킨 (shared/cosmetics.js 의 skin.sheet)
export const SKIN_SHEETS = ['NinjaBlue', 'NinjaRed', 'NinjaGreen', 'NinjaGray', 'NinjaYellow', 'NinjaDark', 'NinjaEskimo', 'NinjaMasked', 'NinjaLeaf', 'NinjaWater', 'NinjaFire', 'NinjaThunder'];

// 몬스터 종류(idx) → 시트, 그릴 배율. strip = 보스(가로 띠, 아래만 봄): [프레임 너비, 프레임 수]
export const MON_LOOK = [
  { sheet: 'mon/Slime.png', scale: 1 }, // 슬라임
  { sheet: 'mon/Skull.png', scale: 1 }, // 해골 궁수
  { sheet: 'mon/Cyclope.png', scale: 2 }, // 외눈 거인
  { sheet: 'mon/Beast.png', scale: 2 }, // 야수
  { sheet: 'mon/Beast.png', scale: 3 }, // 수호자
  { sheet: 'boss/Frog.png', strip: [40, 5], foot: 4 }, // 거대 두꺼비
  { sheet: 'boss/Spirit.png', strip: [50, 5], foot: 4 }, // 푸른 혼령
  { sheet: 'boss/Cyclop.png', strip: [50, 6], foot: 3 }, // 외눈 악마
  { sheet: 'boss/Slime.png', strip: [62, 5], foot: 3 }, // 왕 슬라임
  { sheet: 'boss/Tengu.png', strip: [82, 6], foot: 6 }, // 대텐구
];

// 가로 띠 애니메이션: [파일, 프레임 너비, 프레임 수]
export const FX = {
  slash1: ['fx/slash1.png', 26, 5],
  arc: ['fx/arc.png', 38, 6],
  slash3: ['fx/slash3.png', 38, 6],
  circular: ['fx/circular.png', 54, 7],
  explosion: ['fx/explosion.png', 40, 9],
  flam: ['fx/flam.png', 25, 8],
  ice: ['fx/ice.png', 32, 10],
  thunder: ['fx/thunder.png', 20, 8],
  rock: ['fx/rock.png', 30, 14],
  rockspike: ['fx/rockspike.png', 60, 9],
  smoke: ['fx/smoke.png', 32, 6],
  dust: ['fx/smokering.png', 30, 8],
  circle: ['fx/circle.png', 32, 4],
  circlew: ['fx/circlew.png', 32, 4],
  shield: ['fx/shield.png', 24, 6],
  spark: ['fx/spark.png', 30, 9],
  aura: ['fx/aura.png', 25, 5],
  boost: ['fx/boost.png', 53, 8],
};

// 투사체: [파일, 프레임 너비, 프레임 수, 그림의 기본 방향(라디안, null = 빙글빙글 돎)]
export const PROJ = {
  arrow: ['proj/Arrow.png', 16, 1, -Math.PI / 4],
  pierce: ['proj/Arrow.png', 16, 1, -Math.PI / 4],
  fireball: ['proj/Fireball.png', 16, 4, 0],
  icebolt: ['proj/IceSpike.png', 16, 9, 0],
  lance: ['proj/IceSpike.png', 16, 9, 0],
  dagger: ['proj/Kunai.png', 16, 1, -Math.PI / 4],
  javelin: ['proj/BigKunai.png', 35, 1, 0],
  bone: ['proj/SpriteSheetRock.png', 16, 4, 0],
  orbshot: ['proj/EnergyBall.png', 16, 4, 0],
  shuriken: ['proj/Shuriken.png', 15, 1, null],
  bigshuriken: ['proj/BigShuriken.png', 23, 2, null],
  bolt: ['proj/EnergyBall.png', 16, 4, 0],
};

// 타일셋 안 스프라이트 [파일, x, y, w, h]
const NAT = 'tiles/TilesetNature.png';
const HOUSE = 'tiles/TilesetHouse.png';
export const SPR = {
  treeG: [NAT, 0, 0, 32, 32],
  pine: [NAT, 32, 0, 32, 32],
  dead: [NAT, 64, 0, 32, 32],
  oak: [NAT, 96, 0, 32, 32],
  pink: [NAT, 224, 0, 32, 32],
  treeG2: [NAT, 256, 0, 32, 32],
  treeG3: [NAT, 288, 0, 32, 32],
  bigPink: [NAT, 0, 288, 48, 48],
  bigGreen: [NAT, 48, 288, 48, 48],
  rockB: [NAT, 208, 128, 32, 32],
  rockG: [NAT, 256, 128, 32, 32],
  srockB: [NAT, 240, 144, 16, 16],
  srockG: [NAT, 288, 144, 16, 16],
  stumpS: [NAT, 64, 128, 16, 16],
  stumpB: [NAT, 0, 128, 32, 32],
  bush0: [NAT, 0, 160, 16, 16],
  bush1: [NAT, 16, 160, 16, 16],
  bush2: [NAT, 32, 160, 16, 16],
  tuft: [NAT, 48, 160, 16, 16],
  flower0: [NAT, 0, 176, 16, 16],
  flower1: [NAT, 16, 176, 16, 16],
  flower2: [NAT, 32, 176, 16, 16],
  flower3: [NAT, 48, 176, 16, 16],
  flower6: [NAT, 96, 176, 16, 16],
  // 지역별 나무·바위
  snowPine: [NAT, 128, 0, 32, 32],
  snowPine2: [NAT, 160, 0, 32, 32],
  snowBush: [NAT, 192, 0, 32, 32],
  bigWhite: [NAT, 96, 288, 48, 48],
  bigAutumn: [NAT, 144, 288, 48, 48],
  bigDead: [NAT, 0, 80, 64, 48],
  bamboo: [NAT, 176, 128, 16, 48],
  snowRock: [NAT, 32, 192, 32, 32],
  // 건물·장식 (TilesetHouse, TilesetElement)
  houseO: [HOUSE, 0, 0, 64, 48],
  houseB: [HOUSE, 64, 0, 64, 48],
  houseOB: [HOUSE, 128, 0, 64, 48],
  temple: [HOUSE, 192, 0, 64, 48],
  shop: [HOUSE, 256, 0, 48, 48],
  shopG: [HOUSE, 304, 0, 64, 48],
  stoneHouse: [HOUSE, 368, 0, 48, 48],
  inn: [HOUSE, 416, 0, 48, 48],
  lodge: [HOUSE, 464, 16, 64, 48],
  igloo: [HOUSE, 0, 176, 48, 48],
  igloo2: [HOUSE, 96, 176, 48, 48],
  tent: [HOUSE, 0, 120, 48, 40],
  hut: [HOUSE, 48, 128, 48, 32],
  torii: [HOUSE, 4, 80, 44, 36],
  dojo: [HOUSE, 64, 64, 32, 16],
  statueOrb: [HOUSE, 48, 240, 32, 32],
  statue: [HOUSE, 80, 240, 32, 32],
  statueFrog: [HOUSE, 48, 272, 32, 32],
  statueOrbM: [HOUSE, 48, 304, 32, 32],
  statueM: [HOUSE, 80, 304, 32, 32],
  lantern: ['tiles/TilesetElement.png', 96, 48, 16, 32],
  chestS0: ['items/LittleTreasureChest.png', 0, 0, 16, 16],
  chestS1: ['items/LittleTreasureChest.png', 16, 0, 16, 16],
  chestB0: ['items/BigTreasureChest.png', 0, 0, 16, 14],
  chestB1: ['items/BigTreasureChest.png', 16, 0, 16, 14],
  coin: ['items/GoldCoin.png', 0, 0, 7, 7],
  shadow: ['fx/shadow.png', 0, 0, 12, 7],
};

// 바닥 텍스처로 쓸 16px 타일 [x, y] (TilesetFloor)
export const FLOOR = {
  grass: [0, 192],
  grassVar: [[16, 192], [32, 192], [48, 192], [64, 192], [32, 176], [48, 176]],
  dirt: [16, 128],
  sand: [16, 16],
};

const files = new Set();
for (const k in WEAPON_LOOK) files.add(WEAPON_LOOK[k].held);
for (const n of SKIN_SHEETS) {
  files.add(`skins/${n}.png`);
  files.add(`skins/f_${n}.png`);
}
for (const m of MON_LOOK) files.add(m.sheet);
for (const k in FX) files.add(FX[k][0]);
for (const k in PROJ) files.add(PROJ[k][0]);
for (const k in SPR) files.add(SPR[k][0]);
files.add('tiles/TilesetFloor.png');

export const IMG = {};
let loaded = null;

export function loadAssets() {
  if (loaded) return loaded;
  const inline = (typeof window !== 'undefined' && window.__STYX_ASSETS__) || {};
  loaded = Promise.all(
    [...files].map(
      (f) =>
        new Promise((res) => {
          const i = new Image();
          i.onload = () => res();
          i.onerror = () => {
            console.warn('에셋을 못 불러옴', f);
            res();
          };
          i.src = inline[f] || BASE + f;
          IMG[f] = i;
        }),
    ),
  );
  return loaded;
}

export function assetFiles() {
  return [...files];
}

// 단색 실루엣 (피격 번쩍임·공격 준비 붉은빛) 캐시
const tintCache = new Map();
export function tintOf(file, color = '#ffffff') {
  const key = `${file}|${color}`;
  let c = tintCache.get(key);
  if (c) return c;
  const img = IMG[file];
  if (!img || !img.complete || !img.width) return null;
  c = document.createElement('canvas');
  c.width = img.width;
  c.height = img.height;
  const g = c.getContext('2d');
  g.drawImage(img, 0, 0);
  g.globalCompositeOperation = 'source-in';
  g.fillStyle = color;
  g.fillRect(0, 0, c.width, c.height);
  tintCache.set(key, c);
  return c;
}

export const whiteOf = (file) => tintOf(file, '#ffffff');

// 스킨 → 캐릭터 시트 파일
export function sheetOf(cos) {
  const c = cos && COSMETIC_MAP[cos.skin];
  return `skins/${(c && c.sheet) || 'NinjaBlue'}.png`;
}
export function faceOf(cos) {
  const c = cos && COSMETIC_MAP[cos.skin];
  return `skins/f_${(c && c.sheet) || 'NinjaBlue'}.png`;
}
