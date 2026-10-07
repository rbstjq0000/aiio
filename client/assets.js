// 도트 에셋 로더 + 스프라이트 정의 (Ninja Adventure, CC0 — client/assets/LICENSE-ninja-adventure.txt)
// 단일 HTML 데모에서는 빌드 도구가 window.__STYX_ASSETS__ 에 data URL을 넣어 둔다.
import { WEAPON_IDS } from '../shared/items.js';

// 묶음 빌드(단일 HTML)에서는 import.meta.url 이 없으므로 상대 경로로 대신함
let BASE = './assets/';
try {
  BASE = new URL('./assets/', import.meta.url).href;
} catch {
  // 단일 HTML: window.__STYX_ASSETS__ 를 씀
}

// 직업별 캐릭터 · 손에 든 무기
export const CLASS_LOOK = {
  greatsword: { char: 'KnightGold', weapon: 'BigSword', proj: null },
  daggers: { char: 'NinjaDark', weapon: 'Sai', proj: 'Kunai' },
  longbow: { char: 'Hunter', weapon: 'Bow', proj: 'Arrow' },
  firestaff: { char: 'NinjaMageOrange', weapon: 'MagicWand', proj: 'Fireball' },
  froststaff: { char: 'NinjaEskimo', weapon: 'Stick', proj: 'IceSpike' },
  spear: { char: 'SamuraiRed', weapon: 'Lance', proj: 'BigKunai' },
};

// 몬스터 종류(idx) → 시트, 그릴 배율
export const MON_LOOK = [
  { sheet: 'Slime', scale: 1 }, // 망령
  { sheet: 'Skull', scale: 1 }, // 해골 궁수
  { sheet: 'Cyclope', scale: 2 }, // 거한
  { sheet: 'Beast', scale: 2 }, // 기사
  { sheet: 'Beast', scale: 3 }, // 수호자
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

// 투사체: [파일, 프레임 너비, 프레임 수, 그림의 기본 방향(라디안)]
export const PROJ = {
  arrow: ['proj/Arrow.png', 16, 1, -Math.PI / 4],
  pierce: ['proj/Arrow.png', 16, 1, -Math.PI / 4],
  fireball: ['proj/Fireball.png', 16, 4, null],
  icebolt: ['proj/IceSpike.png', 16, 9, 0],
  lance: ['proj/IceSpike.png', 16, 9, 0],
  dagger: ['proj/Kunai.png', 16, 1, -Math.PI / 4],
  javelin: ['proj/BigKunai.png', 35, 1, 0],
  bone: ['proj/SpriteSheetRock.png', 16, 4, null],
  orbshot: ['proj/EnergyBall.png', 16, 4, null],
  shuriken: ['proj/ShurikenMagic.png', 16, 2, null],
};

// 타일셋 안 스프라이트 [파일, x, y, w, h]
const NAT = 'tiles/TilesetNature.png';
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
  chestS0: ['items/LittleTreasureChest.png', 0, 0, 16, 16],
  chestS1: ['items/LittleTreasureChest.png', 16, 0, 16, 16],
  chestB0: ['items/BigTreasureChest.png', 0, 0, 16, 14],
  chestB1: ['items/BigTreasureChest.png', 16, 0, 16, 14],
  coin: ['items/GoldCoin.png', 0, 0, 7, 7],
  shadow: ['chars/Shadow.png', 0, 0, 12, 7],
};

// 바닥 텍스처로 쓸 16px 타일 [x, y] (TilesetFloor)
export const FLOOR = {
  grass: [0, 192],
  grassVar: [[16, 192], [32, 192], [48, 192], [64, 192], [32, 176], [48, 176]],
  dirt: [16, 128],
  sand: [16, 16],
};

const files = new Set();
for (const k in CLASS_LOOK) {
  files.add(`chars/${CLASS_LOOK[k].char}.png`);
  files.add(`weapons/${CLASS_LOOK[k].weapon}.png`);
  files.add(`faces/${CLASS_LOOK[k].char}.png`);
}
for (const m of MON_LOOK) files.add(`mon/${m.sheet}.png`);
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

export function lookOf(weaponIdx) {
  return CLASS_LOOK[typeof weaponIdx === 'number' ? WEAPON_IDS[weaponIdx] : weaponIdx] || CLASS_LOOK.greatsword;
}
