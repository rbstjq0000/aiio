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

// 매치: 16인 배틀로얄, 목숨 1개, 약 10분 (맵이 커서 초반은 천천히 성장)
export const MAX_PLAYERS = 16;
export const LOBBY_COUNTDOWN = 15;
export const LANDING_TIME = 5; // 시작 전 지도에서 내 시작 지점을 보여 주는 시간
export const MATCH_TIME = 600;
// 자기장 단계: at초에 예고, warn초 뒤부터 shrink초 동안 줄어듦. frac = 처음 맵 대비 반지름, dps = 초당 최대체력 비율
export const ZONE_PHASES = [
  { at: 90, warn: 25, shrink: 45, frac: 0.66, dps: 0.02 },
  { at: 215, warn: 20, shrink: 40, frac: 0.44, dps: 0.03 },
  { at: 330, warn: 20, shrink: 35, frac: 0.26, dps: 0.05 },
  { at: 440, warn: 15, shrink: 35, frac: 0.12, dps: 0.08 },
  { at: 535, warn: 10, shrink: 40, frac: 0.0, dps: 0.12 },
];
// 에픽 몬스터: 작은 에픽은 1:30에 깨어나 잡히면 2:30 뒤 다시, 큰 에픽(중앙)은 4:00에 한 번
export const EPIC_WAKE = 90;
export const EPIC_RESPAWN = 150;
export const TITAN_WAKE = 240;

// 플레이어
export const PLAYER_R = 18;
export const BASE_HP = 1400; // 1:1 다 맞아도 약 7초 (판단할 시간이 있게). 레벨은 없음: 힘 = 무기 등급 + 증강
export const BASE_SPEED = 200;
export const SPAWN_PROTECT = 3; // 착지 직후 무적
// 체력 회복: 항상 초당 0.8% + 4초간 피해를 안 받으면 초당 4% 추가
export const REGEN_BASE = 0.008;
export const REGEN_DELAY = 4;
export const REGEN_RATE = 0.04;
export const KILL_HEAL = 0.3;
// 전투에서 벗어나면 (3초 동안 때리지도 맞지도 않음) 이동 +20%: 도망·이동이 편하게
export const CALM_TIME = 3;
export const CALM_SPEED = 0.2;
// 현상금: 연속 처치가 쌓이면 지도에 표시, 죽으면 주머니(좋은 무기 상자)가 터짐
export const BOUNTY_MIN = 2;
// 치명타 배율 (증강으로 확률을 얻음)
export const CRIT_MULT = 1.75;
// 티밍: 최근 6초 안에 같이 때린 사람은 어시스트 (강화석 + 회복)
export const ASSIST_TIME = 6;
export const ASSIST_STONES = 3;
// 2초 안에 3명 이상에게 맞는 중이면 받는 피해 -15% (1:3에서 바로 녹지 않게)
export const GANG_N = 3;
export const GANG_DR = 0.15;
export const PVP_DMG = 1.5; // 플레이어끼리 주는 피해 배율 (교전 시간 약 6~10초)
// 증강 카드 건너뛰기 → 강화석
export const SKIP_STONES = 3;
// 상자 무기를 분해(또는 바꿔 들 때 원래 무기)하면 주는 강화석 (등급별)
export const DISMANTLE_STONES = [2, 4, 7, 11, 16, 24];

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
export const CHEST_OPEN = 0.6; // 상자 여는 시간 (움직이거나 플레이어에게 맞으면 끊김)
export const INTERACT_RANGE = 90;

// 입력 누름 횟수 카운터 인덱스: [좌클릭 공격, Q, W, E, R, D, F, 상호작용(우클릭으로 상자/장비)]
export const PRESS = { atk: 0, q: 1, w: 2, e: 3, r: 4, d: 5, f: 6, act: 7 };
export const PRESS_N = 8;
// D 구르기: 커서 방향으로 짧게 굴러 피함 (모든 직업 공통)
export const ROLL = { dist: 210, time: 0.2, iframe: 0.25, cd: 7 };

// 강화석 구슬 (몬스터가 떨어뜨림, 가까이 가면 빨려옴)
export const XP_ORB_MAGNET = 140;
export const XP_ORB_PICK = 26;
export const XP_ORB_LIFE = 40;

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
