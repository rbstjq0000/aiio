// 게임 전체 상수. 수치 근거는 docs/COMBAT_DESIGN.md
export const GAME_TITLE = 'STYX.io';

// 네트워크
export const TICK_RATE = 30;
export const DT = 1 / TICK_RATE;
export const INTERP_DELAY = 0.1;

// 화면: 모든 유저가 같은 넓이의 월드를 봄 (공정성)
export const VIEW_W = 1400;
export const VIEW_H = 790;
export const AOI_HALF_W = 1100;
export const AOI_HALF_H = 760;

// 매치
export const MAX_PLAYERS = 16;
export const LOBBY_COUNTDOWN = 15;
export const MATCH_TIME = 600;
export const ORB_TIMES = [120, 240, 360];
export const ORB_WARN = 30;
export const RITUAL_TIME = 15;
export const ZONE_START = 480;
export const ZONE_END = 600;
export const ZONE_MIN_FRAC = 0.22;
export const ZONE_DPS = 0.05; // 초당 최대체력 비율

// 플레이어
export const PLAYER_R = 18;
export const BASE_HP = 1000;
export const BASE_SPEED = 250;
export const LEVEL_MAX = 15;
export const LEVEL_BONUS = 0.015; // 레벨당 체력·피해 (15레벨 = ×1.21)
export const RESPAWN_BASE = 8;
export const RESPAWN_PER_MIN = 1.2;
export const RESPAWN_PER_LEVEL = 1;
export const RESPAWN_MAX = 30;
export const RESPAWN_PROTECT = 2;
export const SPAWN_PROTECT = 3;
export const REGEN_DELAY = 6;
export const REGEN_RATE = 0.02;
export const KILL_HEAL = 0.25;
// 오브 보유 효과: 페널티는 위치 공개(시야 공유)뿐, 대신 확실한 이득
export const ORB_HP_PER = 0.08; // 오브 1개당 최대 체력 +8%
export const ORB_SPEED_PER = 0.04; // 오브 1개당 이동 속도 +4%

// 전투 규칙
export const CC_MAX = 1;
export const CC_IMMUNE = 1.5;
export const SLOW_CAP = 0.4;
export const WALL_SLAM_DMG = 50;
export const WALL_SLAM_STUN = 0.5;
export const ULT_PER_DMG = 0.1; // 피해 10당 1%
export const ULT_PASSIVE = 1; // 초당 1%
export const KB_DAMP = 8;
export const KB_MAX = 1400;

// 상자/장비
export const CHEST_COUNT = 30;
export const CHEST_OPEN = 1.0;
export const CHEST_RESPAWN = 60;
export const INTERACT_RANGE = 70;

// 입력 누름 횟수 카운터 인덱스: [좌클릭 공격, Q, W, E, R, D, F, 상호작용(우클릭으로 상자/장비)]
export const PRESS = { atk: 0, q: 1, w: 2, e: 3, r: 4, d: 5, f: 6, act: 7 };
export const PRESS_N = 8;

// 경험치
export const XP_ORB_MAGNET = 140;
export const XP_ORB_PICK = 26;
export const XP_ORB_LIFE = 40;

// 목표: 2분 4레벨, 5분 8레벨, 9분 12레벨 (docs/COMBAT_DESIGN.md 5장)
export function xpForLevel(level) {
  return 35 + level * 21;
}

export function levelMult(level) {
  return 1 + LEVEL_BONUS * (level - 1);
}

// 롤식: 시간이 지날수록, 레벨이 높을수록 길어짐 (초반 8초 → 후반 최대 30초)
export function respawnDelay(time, level = 1) {
  return Math.min(RESPAWN_MAX, RESPAWN_BASE + (time / 60) * RESPAWN_PER_MIN + (level - 1) * RESPAWN_PER_LEVEL);
}

export function mapRadiusFor(n) {
  return Math.max(1500, Math.min(2700, 1100 + 100 * n));
}

// 판 종료 보상 (오볼 = 무료 재화)
export function computeRewards({ placement, total, kills, orbs = 0, won = false }) {
  let place = 0;
  if (won || placement === 1) place = 60;
  else if (placement === 2) place = 35;
  else if (placement === 3) place = 25;
  else if (placement <= 5) place = 12;
  else if (placement <= Math.ceil(total / 2)) place = 6;
  const obols = 10 + kills * 5 + orbs * 10 + place;
  const xp = 30 + kills * 10 + orbs * 20 + place * 2;
  return { obols, xp };
}
