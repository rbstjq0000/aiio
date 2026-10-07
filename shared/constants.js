// 게임 전체 상수. 수치 근거는 docs/COMBAT_DESIGN.md
export const GAME_TITLE = '닌자 로얄';

// 네트워크
export const TICK_RATE = 30;
export const DT = 1 / TICK_RATE;
export const INTERP_DELAY = 0.1;

// 화면: 모든 유저가 같은 넓이의 월드를 봄 (공정성)
export const VIEW_W = 1400;
export const VIEW_H = 790;
export const AOI_HALF_W = 1100;
export const AOI_HALF_H = 760;
// 시야: 이 거리 안에서 벽에 가리지 않은 것만 보임 (서버가 안 보이는 적 정보는 보내지 않음)
export const VISION_R = 1000;

// 매치: 16인 배틀로얄, 목숨 1개, 약 8분
export const MAX_PLAYERS = 16;
export const LOBBY_COUNTDOWN = 15;
export const LANDING_TIME = 10; // 착지 지점 고르는 시간
export const MATCH_TIME = 480;
// 자기장 단계: at초에 예고, warn초 뒤부터 shrink초 동안 줄어듦. frac = 처음 맵 대비 반지름, dps = 초당 최대체력 비율
export const ZONE_PHASES = [
  { at: 50, warn: 25, shrink: 35, frac: 0.62, dps: 0.02 },
  { at: 140, warn: 20, shrink: 30, frac: 0.4, dps: 0.03 },
  { at: 230, warn: 20, shrink: 30, frac: 0.24, dps: 0.05 },
  { at: 335, warn: 15, shrink: 30, frac: 0.12, dps: 0.08 },
  { at: 425, warn: 10, shrink: 40, frac: 0.0, dps: 0.12 },
];

// 플레이어
export const PLAYER_R = 18;
export const BASE_HP = 1400; // 1:1 다 맞아도 약 7초 (롤 초반 교전처럼 판단할 시간이 있게)
export const BASE_SPEED = 200; // 기본 이동 속도 (250은 너무 빨라서 20% 낮춤)
export const LEVEL_MAX = 15;
export const LEVEL_BONUS = 0.015; // 레벨당 체력·피해 (15레벨 = ×1.21)
export const SPAWN_PROTECT = 3; // 착지 직후 무적
// 체력 회복: 항상 초당 0.8% + 4초간 피해를 안 받으면 초당 4% 추가 (풀피까지 약 20초)
export const REGEN_BASE = 0.008;
export const REGEN_DELAY = 4;
export const REGEN_RATE = 0.04;
export const KILL_HEAL = 0.3;
// 현상금: 연속 처치 수만큼 쌓이고, 죽으면 주머니(상자)가 터짐
export const BOUNTY_MIN = 2;
// 치명타 배율 (증강으로 확률을 얻음)
export const CRIT_MULT = 1.75;

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

// 상자 (열면 증강 3개 중 1개 선택)
export const CHEST_OPEN = 0.6; // 상자 여는 시간 (맞아도 안 끊김, 움직이면 끊김)
export const INTERACT_RANGE = 90;
export const OFFER_TIME = 12; // 증강 고르는 시간 (지나면 무작위)

// 입력 누름 횟수 카운터 인덱스: [좌클릭 공격, Q, W, E, R, D, F, 상호작용(우클릭으로 상자/장비)]
export const PRESS = { atk: 0, q: 1, w: 2, e: 3, r: 4, d: 5, f: 6, act: 7 };
export const PRESS_N = 8;
// D 구르기: 커서 방향으로 짧게 굴러 피함 (모든 직업 공통)
export const ROLL = { dist: 210, time: 0.2, iframe: 0.25, cd: 7 };

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

// 판 종료 보상 (코인 = 무료 재화)
export function computeRewards({ placement, total, kills, won = false }) {
  let place = 0;
  if (won || placement === 1) place = 60;
  else if (placement === 2) place = 35;
  else if (placement === 3) place = 25;
  else if (placement <= 5) place = 12;
  else if (placement <= Math.ceil(total / 2)) place = 6;
  const obols = 10 + kills * 5 + place;
  const xp = 30 + kills * 10 + place * 2;
  return { obols, xp };
}
