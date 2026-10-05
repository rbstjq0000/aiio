// 맵 정의. 새 맵은 MAPS에 항목 하나를 추가하면 된다.
// 맵 데이터 형식:
//   R        원형 경계 반지름
//   walls    [x1, y1, x2, y2, 두께] 선분 벽 (이동·투사체 차단)
//   pillars  { x, y, r, k }  원형 장애물 (k: 0 바위, 1 기둥, 2 화로)
//   altars   { x, y }        오브 제단 3곳
//   camps    { x, y, type }  정글 캠프 (CAMP_TYPES)
//   chests   { x, y }
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

// 명계 폐허: 3겹 동심원 구조
//   성소(중앙) ─ 문 4개 ─ 제단 지대(오브 3곳, 방사형 벽으로 3구역) ─ 문 6개 ─ 바깥 폐허(방 6개, 엄폐벽, 엘리트 은신처)
function buildRuins() {
  const R = 3000;
  const SANCTUM = 720;
  const MID = 1550;
  const rng = makeRng(20261005);
  const walls = [];
  const deg = (d) => (d * Math.PI) / 180;
  ringWithGates(walls, SANCTUM, [45, 135, 225, 315].map((d) => [deg(d), 0.36]));
  ringWithGates(walls, MID, [30, 90, 150, 210, 270, 330].map((d) => [deg(d), 0.17]), 0.14);
  // 제단 지대를 3구역으로 나누는 방사형 벽
  for (const d of [0, 120, 240]) {
    const [x1, y1] = polar(SANCTUM + 40, deg(d));
    const [x2, y2] = polar(MID - 40, deg(d));
    walls.push([Math.round(x1), Math.round(y1), Math.round(x2), Math.round(y2), WALL]);
  }
  // 바깥 폐허: 방 6개 (안쪽·바깥쪽 벽에 문)
  const rooms = [];
  for (let i = 0; i < 6; i++) {
    const a = deg(i * 60);
    const [cx, cy] = polar(2300, a);
    room(walls, cx, cy, a, 380, 480, 140);
    rooms.push({ x: cx, y: cy, a });
  }
  // 방 사이 엄폐벽 두 줄
  for (let i = 0; i < 6; i++) {
    const a = deg(30 + i * 60);
    for (const off of [-0.1, 0.1]) {
      const [x1, y1] = polar(1820, a + off);
      const [x2, y2] = polar(2060, a + off);
      walls.push([Math.round(x1), Math.round(y1), Math.round(x2), Math.round(y2), WALL]);
    }
  }
  // 엘리트 은신처: 바깥 가장자리 짧은 호 벽 (3곳)
  const elites = [];
  for (const d of [30, 150, 270]) {
    arcWall(walls, 2680, deg(d) - 0.2, deg(d) + 0.2, 0.1);
    const [x, y] = polar(2850, deg(d));
    elites.push({ x: Math.round(x), y: Math.round(y) });
  }

  const altars = [60, 180, 300].map((d) => {
    const [x, y] = polar(1150, deg(d));
    return { x: Math.round(x), y: Math.round(y) };
  });

  const camps = [];
  const chests = [];
  rooms.forEach((rm, i) => {
    const [ix, iy] = polar(2250, rm.a);
    camps.push({ x: Math.round(ix), y: Math.round(iy), type: i % 2 ? 'ranged' : 'large' });
    const [cx, cy] = polar(2420, rm.a);
    chests.push({ x: Math.round(cx), y: Math.round(cy) });
  });
  for (let i = 0; i < 6; i++) {
    const a = deg(30 + i * 60);
    const [x, y] = polar(2450, a);
    camps.push({ x: Math.round(x), y: Math.round(y), type: 'small' });
    const [cx, cy] = polar(1940, a);
    chests.push({ x: Math.round(cx), y: Math.round(cy) });
  }
  for (const e of elites) camps.push({ ...e, type: 'elite' });
  for (const d of [60, 180, 300]) {
    for (const off of [-0.42, 0.42]) {
      const [x, y] = polar(1200, deg(d) + off);
      camps.push({ x: Math.round(x), y: Math.round(y), type: off < 0 ? 'small' : 'ranged' });
    }
    for (const off of [-0.24, 0.24]) {
      const [x, y] = polar(1420, deg(d) + off);
      chests.push({ x: Math.round(x), y: Math.round(y) });
    }
  }
  chests.push({ x: 0, y: -230 }, { x: 0, y: 230 });

  const pillars = [];
  const clear = (x, y, r) => {
    if (x * x + y * y > (R - r - 90) ** 2) return false;
    for (const w of walls) if (segPointDist2(w[0], w[1], w[2], w[3], x, y) < (r + w[4] / 2 + 90) ** 2) return false;
    for (const p of pillars) if (dist2(x, y, p.x, p.y) < (r + p.r + 110) ** 2) return false;
    for (const q of [...altars, ...camps, ...chests]) if (dist2(x, y, q.x, q.y) < (r + 170) ** 2) return false;
    return true;
  };
  // 성소: 기둥 8개와 화로 4개를 대칭으로
  for (let i = 0; i < 8; i++) {
    const [x, y] = polar(470, deg(i * 45 + 22.5));
    pillars.push({ x: Math.round(x), y: Math.round(y), r: 26, k: i % 2 ? 1 : 2 });
  }
  // 제단 지대·바깥: 대칭(6방향)으로 배치해 깔끔하게
  const base = [];
  for (let tries = 0; tries < 400 && base.length < 9; tries++) {
    const a = rng() * deg(60);
    const d = SANCTUM + 150 + rng() * (R - SANCTUM - 300);
    const r = Math.round(rng.range(24, 46));
    const pts = [];
    let ok = true;
    for (let k = 0; k < 6; k++) {
      const [x, y] = polar(d, a + deg(k * 60));
      if (!clear(x, y, r)) ok = false;
      pts.push([x, y]);
    }
    if (!ok) continue;
    const kind = rng() < 0.2 ? 2 : rng() < 0.6 ? 1 : 0;
    for (const [x, y] of pts) pillars.push({ x: Math.round(x), y: Math.round(y), r, k: kind });
    base.push(1);
  }

  // 시작 위치 16곳: 바깥 둘레에서 캠프 어그로 범위(420) 밖, 벽과 떨어진 곳을 고르게
  const cand = [];
  for (const r of [2600, 2720, 2840]) {
    for (let d = 0; d < 360; d += 1.5) {
      const [x, y] = polar(r, deg(d));
      if (camps.some((c) => dist2(x, y, c.x, c.y) < 500 * 500)) continue;
      if (walls.some((w) => segPointDist2(w[0], w[1], w[2], w[3], x, y) < 70 * 70)) continue;
      if (pillars.some((p) => dist2(x, y, p.x, p.y) < (p.r + 60) ** 2)) continue;
      cand.push([Math.round(x), Math.round(y)]);
    }
  }
  // 가장 먼 점 고르기로 고르게 퍼뜨림
  const spawns = [cand[0]];
  while (spawns.length < 16 && spawns.length < cand.length) {
    let best = null;
    let bestD = -1;
    for (const c of cand) {
      let m = Infinity;
      for (const q of spawns) m = Math.min(m, dist2(c[0], c[1], q[0], q[1]));
      if (m > bestD) {
        bestD = m;
        best = c;
      }
    }
    spawns.push(best);
  }

  // 렌더링용 장식: 구역별 바닥
  const decor = {
    regions: [
      { r0: 0, r1: SANCTUM, style: 'sanctum' },
      { r0: SANCTUM, r1: MID, style: 'mid' },
      { r0: MID, r1: R, style: 'outer' },
    ],
  };

  return { id: 'ruins', name: '명계 폐허', R, walls, pillars, altars, camps, chests, spawns, zone: { x: 0, y: 0 }, decor };
}

export const MAPS = {
  ruins: buildRuins(),
};
export const MAP_IDS = Object.keys(MAPS);
export const DEFAULT_MAP = 'ruins';
