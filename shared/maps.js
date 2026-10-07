// 맵 정의. 새 맵은 MAPS에 항목 하나를 추가하면 된다.
// 맵 데이터 형식:
//   R        원형 경계 반지름
//   walls    [x1, y1, x2, y2, 두께] 선분 벽 (이동·투사체 차단)
//   pillars  { x, y, r, k }  원형 장애물 (k: 0 바위, 1 기둥, 2 화로)
//   altars   { x, y }        오브 제단 3곳
//   camps    { x, y, type }  정글 캠프 (CAMP_TYPES)
//   chests   { x, y, kind, camp? }  camp = 캠프 번호 (그 캠프 몹을 다 잡아야 열림)
//   lairs    { x, y, kind, boss }   에픽 몬스터 둥지
//   spawns   [x, y]          시작 위치 후보
//   zone     { x, y }        마지막 안전지대 중심
import { makeRng, TAU, dist2, segPointDist2 } from './math.js';

// 정글 캠프 종류: 구성 몬스터, 다시 생기는 시간(초)
export const CAMP_TYPES = {
  small: { mobs: ['shade', 'shade', 'shade'], respawn: 40, name: '망령 무리' },
  ranged: { mobs: ['archer', 'archer', 'shade'], respawn: 50, name: '해골 궁수대' },
  large: { mobs: ['brute', 'shade', 'shade'], respawn: 60, name: '지옥 거한' },
  elite: { mobs: ['elite'], respawn: 90, name: '망령 기사' },
};

const WALL = 28;

function polar(r, a) {
  return [Math.cos(a) * r, Math.sin(a) * r];
}

// 원호 벽: 각도 a0~a1 구간을 짧은 선분으로
function arcWall(out, r, a0, a1, step = 0.16) {
  const n = Math.max(1, Math.ceil((a1 - a0) / step));
  for (let i = 0; i < n; i++) {
    const [x1, y1] = polar(r, a0 + ((a1 - a0) * i) / n);
    const [x2, y2] = polar(r, a0 + ((a1 - a0) * (i + 1)) / n);
    out.push([Math.round(x1), Math.round(y1), Math.round(x2), Math.round(y2), WALL]);
  }
}

// 원형 벽에 문(gaps: [중심각, 폭(라디안)])을 뚫어서 추가
function ringWithGates(out, r, gates, step = 0.16) {
  const g = gates.map(([c, w]) => [((c - w / 2) % TAU + TAU) % TAU, ((c + w / 2) % TAU + TAU) % TAU]).sort((a, b) => a[0] - b[0]);
  for (let i = 0; i < g.length; i++) {
    const start = g[i][1];
    let end = g[(i + 1) % g.length][0];
    if (end <= start) end += TAU;
    arcWall(out, r, start, end, step);
  }
}

// 방: 중심(cx,cy), 바깥 방향 각도 a, 크기 w×h, 문은 안쪽/바깥쪽 벽 가운데
function room(out, cx, cy, a, w, h, door = 130) {
  const ca = Math.cos(a);
  const sa = Math.sin(a);
  const P = (lx, ly) => [Math.round(cx + lx * ca - ly * sa), Math.round(cy + lx * sa + ly * ca)];
  const seg = (p, q) => out.push([p[0], p[1], q[0], q[1], WALL]);
  const hw = w / 2;
  const hh = h / 2;
  // 옆벽 (문 없음)
  seg(P(-hw, -hh), P(hw, -hh));
  seg(P(-hw, hh), P(hw, hh));
  // 앞뒤 벽 (가운데 문)
  for (const x of [-hw, hw]) {
    seg(P(x, -hh), P(x, -door / 2));
    seg(P(x, door / 2), P(x, hh));
  }
}

// 숲의 섬 (배틀로얄): 16명이 해안의 고정된 시작 지점에서 출발한다.
// 공정함: 맵 전체가 8방향 회전 + 좌우 대칭이라 16개 시작 지점 모두 주변 구성이 똑같다.
//   부채꼴 8개(45°) × 각 부채꼴 안에 시작 지점 2개(가운데 축 기준 거울상)
// 바깥 → 안쪽:
//   해안 은신처(r 2700~) — 절벽으로 이웃과 나뉜 내 구역: 작은 캠프 + 상자 (초반엔 혼자 성장)
//   길목 캠프(r 2420, 부채꼴 축) — 같은 부채꼴 이웃과 처음 마주치는 곳
//   유적(r 2050, 부채꼴 경계) — 옆 부채꼴과 함께 쓰는 큰 상자
//   에픽 둥지(r 1650, 부채꼴 축) — 이웃 둘이 막타를 다툼
//   엘리트 캠프(r 1150, 부채꼴 경계) — 큰 상자
//   중앙 투기장(r 0~560) — 대텐구 (4:00)
// 장애물 종류 k: 0 회색 바위, 1 갈색 바위, 2 둥근 나무, 3 침엽수, 4 분홍 나무, 5 연못, 6 그루터기
// 부채꼴 i는 각도 i×45° ~ (i+1)×45° (화면 기준 0° = 동쪽, 90° = 남쪽). 부채꼴마다 나무 그림만 다름 (충돌 크기는 같음)
const SECTOR_TREE = [2, 4, 3, 2, 4, 3, 2, 4];
// 유적은 부채꼴 경계(i×45°)에 있음
const RUINS = ['동쪽 사원', '남동쪽 신전', '남쪽 사원', '남서쪽 신전', '서쪽 사원', '북서쪽 신전', '북쪽 사원', '북동쪽 신전'];
function buildIsland() {
  const R = 3400;
  const rng = makeRng(77001);
  const walls = [];
  const pillars = [];
  const bushes = [];
  const chests = [];
  const camps = [];
  const pois = [];
  const lairs = [];
  const spawns = [];
  const deg = (d) => (d * Math.PI) / 180;
  const P = (r, a) => polar(r, a).map(Math.round);
  const SEC = deg(45);
  // 캠프 + 그 캠프에 묶인 상자 (몹을 다 잡아야 열림). 상자는 캠프보다 바깥쪽(중심 반대)에
  const camp = (r, a, type, kind = 'small') => {
    const [x, y] = P(r, a);
    camps.push({ x, y, type });
    const [cx, cy] = P(r + 85, a);
    chests.push({ x: cx, y: cy, kind, camp: camps.length - 1 });
  };
  const wallSeg = (r0, a0, r1, a1) => {
    const [x1, y1] = P(r0, a0);
    const [x2, y2] = P(r1, a1);
    walls.push([x1, y1, x2, y2, WALL]);
  };
  // 반지름 방향 절벽 (r0 → r1, 각도 a), 짧은 선분으로
  const radialWall = (a, r0, r1) => {
    for (let r = r0; r < r1; r += 140) wallSeg(r, a, Math.min(r1, r + 140), a);
  };

  // 중앙 투기장: 고리 벽(문 8개, 부채꼴 축 방향) + 대텐구
  ringWithGates(
    walls,
    560,
    Array.from({ length: 8 }, (_, i) => [deg(22.5) + i * SEC, 0.32]),
  );
  lairs.push({ x: 0, y: 0, kind: 'titan', boss: 'tengu' });
  pois.push({ x: 0, y: 0, name: '대텐구의 투기장' });
  const bosses = ['frog', 'spirit', 'cyclop', 'slime'];
  const lairNames = { frog: '두꺼비 늪', spirit: '혼령의 샘', cyclop: '악마의 바위', slime: '슬라임 동굴' };

  for (let i = 0; i < 8; i++) {
    const b = i * SEC; // 부채꼴 경계
    const ax = b + SEC / 2; // 부채꼴 축
    // 투기장 안쪽: 축마다 작은 상자
    const [ix, iy] = P(400, ax);
    chests.push({ x: ix, y: iy, kind: 'small' });
    // 엘리트 캠프 (경계, 큰 상자)
    camp(1150, b, 'elite', 'big');
    // 에픽 둥지 (축). 마주 보는 둥지는 같은 보스
    const boss = bosses[i % 4];
    const [lx, ly] = P(1650, ax);
    lairs.push({ x: lx, y: ly, kind: 'epic', boss });
    pois.push({ x: lx, y: ly, name: lairNames[boss], lair: 1 });
    // 유적 (경계): 고리 벽, 문은 바깥쪽 양옆(두 부채꼴 쪽) + 안쪽
    const [rx, ry] = P(2050, b);
    const r0 = 190;
    const gates = [b + Math.PI, b + Math.PI / 2, b - Math.PI / 2];
    for (let k = 0; k < 12; k++) {
      const t0 = (k / 12) * TAU;
      const t1 = ((k + 1) / 12) * TAU;
      const mid = (t0 + t1) / 2;
      if (gates.some((g) => Math.abs(Math.atan2(Math.sin(mid - g), Math.cos(mid - g))) < 0.3)) continue;
      walls.push([Math.round(rx + Math.cos(t0) * r0), Math.round(ry + Math.sin(t0) * r0), Math.round(rx + Math.cos(t1) * r0), Math.round(ry + Math.sin(t1) * r0), WALL]);
    }
    chests.push({ x: rx, y: ry, kind: 'big' });
    pois.push({ x: rx, y: ry, name: RUINS[i] });
    // 안쪽 성벽 (r 1400): 반쪽 부채꼴마다 한 토막, 경계·축 쪽은 열려 있음 → 안쪽으로 가는 문 16개
    for (const [t0, t1] of [[deg(5), deg(17)], [deg(28), deg(40)]]) {
      const n = 3;
      for (let k = 0; k < n; k++) wallSeg(1400, b + t0 + ((t1 - t0) * k) / n, 1400, b + t0 + ((t1 - t0) * (k + 1)) / n);
    }
    // 길목 캠프 (축): 같은 부채꼴의 두 사람이 처음 만나는 곳
    camp(2420, ax, 'large');
    // 해안 절벽: 축(같은 부채꼴 두 사람 사이)과 경계(옆 부채꼴과 사이)
    radialWall(ax, 2620, R + 40);
    radialWall(b, 2380, R + 40);
    // 시작 지점 2곳 (축 기준 거울상) + 각자의 은신처
    for (const sgn of [-1, 1]) {
      const sa = ax + sgn * deg(11.25);
      spawns.push(P(3020, sa));
      // 은신처: 작은 캠프(작은 상자) + 상자 하나 + 수풀
      camp(2780, ax + sgn * deg(6), 'small');
      const [cx, cy] = P(3150, ax + sgn * deg(16));
      chests.push({ x: cx, y: cy, kind: 'small' });
    }
  }

  // 장식(나무·바위·연못·수풀)은 반쪽 부채꼴(경계 → 축, 22.5°) 하나만 만들고
  // 16번 돌리고 뒤집어서 똑같이 깐다. 나무 종류(그림)만 부채꼴마다 다름
  const reserved = () => [...chests, ...camps, ...pois, ...lairs, ...spawns.map(([x, y]) => ({ x, y, spawn: 1 }))];
  const place = (d, t) => {
    // 반쪽 부채꼴 좌표 → 16개 복사본 좌표
    const out = [];
    for (let i = 0; i < 8; i++) for (const sgn of [1, -1]) out.push({ sec: i, a: i * SEC + (sgn > 0 ? t : SEC - t), d });
    return out;
  };
  const clearAt = (x, y, r, gap) => {
    if (x * x + y * y > (R - r - 90) ** 2) return false;
    for (const w of walls) if (segPointDist2(w[0], w[1], w[2], w[3], x, y) < (r + w[4] / 2 + gap) ** 2) return false;
    for (const p of pillars) if (dist2(x, y, p.x, p.y) < (r + p.r + gap) ** 2) return false;
    for (const q of reserved()) if (dist2(x, y, q.x, q.y) < (r + (q.boss ? 300 : q.spawn ? 160 : 120)) ** 2) return false;
    return true;
  };
  // 한 점을 16곳에 모두 놓을 수 있을 때만 놓음 (대칭 유지)
  const tryPut = (d, t, r, gap, make) => {
    const spots = place(d, t).map((s) => ({ ...s, x: Math.cos(s.a) * s.d, y: Math.sin(s.a) * s.d }));
    // 축이나 경계 바로 위면 거울상끼리 겹침
    if (Math.min(t, deg(22.5) - t) * d < r + 30) return false;
    if (!spots.every((s) => clearAt(s.x, s.y, r, gap))) return false;
    for (const s of spots) make(s);
    return true;
  };
  const T = () => rng() * deg(22.5);
  // 연못: 반쪽마다 1개
  for (let tries = 0, n = 0; tries < 400 && n < 1; tries++) {
    const r = Math.round(rng.range(100, 140));
    if (tryPut(Math.round(rng.range(900, 2300)), T(), r, 140, (s) => pillars.push({ x: Math.round(s.x), y: Math.round(s.y), r, k: 5 }))) n++;
  }
  // 숲: 반쪽마다 나무 무리 5개
  for (let g = 0; g < 5; g++) {
    const gd = rng.range(700, 3100);
    const gt = T();
    const n = 5 + Math.floor(rng() * 5);
    for (let i = 0, put = 0; i < 40 && put < n; i++) {
      const d = gd + rng.range(-200, 200);
      const t = gt + rng.range(-180, 180) / Math.max(400, gd);
      if (t <= 0 || t >= deg(22.5)) continue;
      const r = Math.round(rng.range(20, 26));
      if (tryPut(d, t, r, 34, (s) => pillars.push({ x: Math.round(s.x), y: Math.round(s.y), r, k: SECTOR_TREE[s.sec] }))) put++;
    }
  }
  // 바위·그루터기: 반쪽마다 8개
  for (let tries = 0, n = 0; tries < 600 && n < 8; tries++) {
    const big = rng() < 0.4;
    const r = big ? Math.round(rng.range(28, 38)) : Math.round(rng.range(14, 20));
    const k = big ? (rng() < 0.5 ? 0 : 1) : rng() < 0.5 ? 6 : 0;
    if (tryPut(Math.round(rng.range(650, 3200)), T(), r, 70, (s) => pillars.push({ x: Math.round(s.x), y: Math.round(s.y), r, k }))) n++;
  }
  // 수풀: 반쪽마다 7개 (지나갈 수 있음, 안에 있으면 멀리서 안 보임)
  for (let tries = 0, n = 0; tries < 800 && n < 7; tries++) {
    const r = Math.round(rng.range(44, 70));
    const d = Math.round(rng.range(650, 3200));
    const t = T();
    const ok = place(d, t).every((s) => {
      const x = Math.cos(s.a) * d;
      const y = Math.sin(s.a) * d;
      return bushes.every((b) => dist2(x, y, b.x, b.y) > (r + b.r + 60) ** 2);
    });
    if (ok && tryPut(d, t, r, 20, (s) => bushes.push({ x: Math.round(s.x), y: Math.round(s.y), r }))) n++;
  }
  return { id: 'island', name: '숲의 섬', R, walls, pillars, bushes, altars: [], camps, chests, pois, lairs, spawns, zone: { x: 0, y: 0 }, decor: { seed: 77001 }, fixedSpawns: true };
}

export const MAPS = {
  island: buildIsland(),
};
export const MAP_IDS = Object.keys(MAPS);
export const DEFAULT_MAP = 'island';
