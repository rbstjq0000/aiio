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
function ringWithGates(out, r, gates) {
  const g = gates.map(([c, w]) => [((c - w / 2) % TAU + TAU) % TAU, ((c + w / 2) % TAU + TAU) % TAU]).sort((a, b) => a[0] - b[0]);
  for (let i = 0; i < g.length; i++) {
    const start = g[i][1];
    let end = g[(i + 1) % g.length][0];
    if (end <= start) end += TAU;
    arcWall(out, r, start, end);
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

function buildRuins() {
  const R = 2300;
  const rng = makeRng(20261005);
  const walls = [];
  // 중앙 성소 (반지름 560, 문 4개)
  ringWithGates(walls, 560, [0, 1, 2, 3].map((i) => [Math.PI / 4 + (i * Math.PI) / 2, 0.42]));
  // 중간 고리 (반지름 1180, 문 6개)
  ringWithGates(walls, 1180, [0, 1, 2, 3, 4, 5].map((i) => [Math.PI / 6 + (i * Math.PI) / 3, 0.2]));
  // 중간 지대를 3구역으로 나누는 방사형 벽
  for (let i = 0; i < 3; i++) {
    const a = (i * TAU) / 3;
    const [x1, y1] = polar(600, a);
    const [x2, y2] = polar(1140, a);
    walls.push([Math.round(x1), Math.round(y1), Math.round(x2), Math.round(y2), WALL]);
  }
  // 바깥 지대의 방 6개
  const rooms = [];
  for (let i = 0; i < 6; i++) {
    const a = (i * TAU) / 6;
    const [cx, cy] = polar(1760, a);
    room(walls, cx, cy, a, 300, 380);
    rooms.push({ x: cx, y: cy, a });
  }
  // 바깥 지대 짧은 벽(엄폐물) 몇 개
  for (let i = 0; i < 6; i++) {
    const a = ((i + 0.5) * TAU) / 6;
    for (const off of [-0.12, 0.12]) {
      const [x1, y1] = polar(1420, a + off);
      const [x2, y2] = polar(1600, a + off * 1.3);
      walls.push([Math.round(x1), Math.round(y1), Math.round(x2), Math.round(y2), WALL]);
    }
  }

  const altars = [0, 1, 2].map((i) => {
    const [x, y] = polar(880, (i * TAU) / 3 + Math.PI / 3);
    return { x: Math.round(x), y: Math.round(y) };
  });

  const camps = [];
  const chests = [];
  // 방마다: 캠프 1 + 상자 1
  rooms.forEach((rm, i) => {
    const [ix, iy] = polar(1760 - 60, rm.a);
    camps.push({ x: Math.round(ix), y: Math.round(iy), type: i % 2 ? 'ranged' : 'large' });
    const [cx, cy] = polar(1760 + 90, rm.a);
    chests.push({ x: Math.round(cx), y: Math.round(cy) });
  });
  // 방 사이: 작은 캠프 + 엘리트(3곳)
  for (let i = 0; i < 6; i++) {
    const a = ((i + 0.5) * TAU) / 6;
    const [x, y] = polar(1880, a);
    camps.push({ x: Math.round(x), y: Math.round(y), type: 'small' });
    if (i % 2 === 0) {
      const [ex, ey] = polar(2120, a);
      camps.push({ x: Math.round(ex), y: Math.round(ey), type: 'elite' });
    }
    const [cx, cy] = polar(1500, a);
    chests.push({ x: Math.round(cx), y: Math.round(cy) });
  }
  // 중간 지대: 구역마다 캠프 2 + 상자 2
  for (let i = 0; i < 3; i++) {
    const base = (i * TAU) / 3 + Math.PI / 3;
    for (const off of [-0.42, 0.42]) {
      const [x, y] = polar(940, base + off);
      camps.push({ x: Math.round(x), y: Math.round(y), type: off < 0 ? 'small' : 'ranged' });
    }
    for (const off of [-0.25, 0.25]) {
      const [x, y] = polar(1080, base + off);
      chests.push({ x: Math.round(x), y: Math.round(y) });
    }
  }
  // 성소 안: 상자 2
  chests.push({ x: 0, y: -180 }, { x: 0, y: 180 });

  // 기둥/바위: 벽·제단·캠프·상자와 겹치지 않게
  const pillars = [];
  const clear = (x, y, r) => {
    if (x * x + y * y > (R - r - 80) ** 2) return false;
    for (const w of walls) if (segPointDist2(w[0], w[1], w[2], w[3], x, y) < (r + w[4] / 2 + 70) ** 2) return false;
    for (const p of pillars) if (dist2(x, y, p.x, p.y) < (r + p.r + 80) ** 2) return false;
    for (const q of [...altars, ...camps, ...chests]) if (dist2(x, y, q.x, q.y) < (r + 140) ** 2) return false;
    return true;
  };
  // 성소 기둥 링
  for (let i = 0; i < 8; i++) {
    const [x, y] = polar(330, (i * TAU) / 8 + Math.PI / 8);
    if (clear(x, y, 24)) pillars.push({ x: Math.round(x), y: Math.round(y), r: 24, k: i % 2 ? 1 : 2 });
  }
  for (let tries = 0; tries < 3000 && pillars.length < 70; tries++) {
    const a = rng() * TAU;
    const d = 650 + Math.sqrt(rng()) * (R - 700);
    const [x, y] = polar(d, a);
    const r = rng.range(22, 52);
    if (clear(x, y, r)) pillars.push({ x: Math.round(x), y: Math.round(y), r: Math.round(r), k: rng() < 0.15 ? 2 : rng() < 0.5 ? 1 : 0 });
  }

  // 시작 위치: 바깥 지대 둘레
  const spawns = [];
  for (let i = 0; i < 16; i++) {
    const [x, y] = polar(2000, (i * TAU) / 16 + TAU / 32);
    spawns.push([Math.round(x), Math.round(y)]);
  }

  return { id: 'ruins', name: '명계 폐허', R, walls, pillars, altars, camps, chests, spawns, zone: { x: 0, y: 0 } };
}

export const MAPS = {
  ruins: buildRuins(),
};
export const MAP_IDS = Object.keys(MAPS);
export const DEFAULT_MAP = 'ruins';
