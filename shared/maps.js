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

// 숲의 섬 (배틀로얄): 원형 섬, 가운데 마을 폐허, 사방에 유적·연못·숲, 수풀에 숨을 수 있음
// 장애물 종류 k: 0 회색 바위, 1 갈색 바위, 2 둥근 나무, 3 침엽수, 4 분홍 나무, 5 연못, 6 그루터기
function buildIsland() {
  const R = 2400;
  const rng = makeRng(77001);
  const walls = [];
  const deg = (d) => (d * Math.PI) / 180;
  const pillars = [];
  const bushes = [];
  const chests = [];
  const camps = [];
  const pois = [];

  // 가운데 마을: 방 4개 (문은 바깥쪽), 큰 상자
  for (let i = 0; i < 4; i++) {
    const a = deg(45 + i * 90);
    const [cx, cy] = polar(330, a);
    room(walls, cx, cy, a, 260, 300, 110);
    chests.push({ x: Math.round(cx), y: Math.round(cy), kind: 'big' });
  }
  pois.push({ x: 0, y: 0, name: '버려진 마을' });
  // 유적 6곳: 고리 모양 벽(문 2개) + 큰 상자 1, 작은 상자 2, 근처 몬스터 캠프
  const ruinNames = ['북쪽 사원', '바위 언덕', '달빛 유적', '남쪽 신전', '안개 숲', '거인의 무덤'];
  for (let i = 0; i < 6; i++) {
    const a = deg(-90 + i * 60);
    const [cx, cy] = polar(1450, a);
    // 고리 벽: 두 문을 남기고 원호로
    const gates = [a + Math.PI, a + Math.PI / 2];
    const out = [];
    const r0 = 190;
    for (let k = 0; k < 12; k++) {
      const t0 = (k / 12) * TAU;
      const t1 = ((k + 1) / 12) * TAU;
      const mid = (t0 + t1) / 2;
      if (gates.some((g) => Math.abs(Math.atan2(Math.sin(mid - g), Math.cos(mid - g))) < 0.34)) continue;
      out.push([Math.round(cx + Math.cos(t0) * r0), Math.round(cy + Math.sin(t0) * r0), Math.round(cx + Math.cos(t1) * r0), Math.round(cy + Math.sin(t1) * r0), WALL]);
    }
    walls.push(...out);
    chests.push({ x: Math.round(cx), y: Math.round(cy), kind: 'big' });
    for (const off of [-0.3, 0.3]) {
      const [x, y] = polar(1450 + 260, a + off);
      chests.push({ x: Math.round(x), y: Math.round(y), kind: 'small' });
    }
    const [mx, my] = polar(1050, a + 0.28);
    camps.push({ x: Math.round(mx), y: Math.round(my), type: i % 3 === 0 ? 'large' : i % 3 === 1 ? 'ranged' : 'small' });
    pois.push({ x: Math.round(cx), y: Math.round(cy), name: ruinNames[i] });
  }
  // 바깥 둘레: 작은 상자와 캠프
  for (let i = 0; i < 12; i++) {
    const a = deg(i * 30 + 15);
    const [x, y] = polar(2050, a);
    chests.push({ x: Math.round(x), y: Math.round(y), kind: 'small' });
    if (i % 2 === 0) {
      const [mx, my] = polar(1850, a + 0.12);
      camps.push({ x: Math.round(mx), y: Math.round(my), type: i % 4 === 0 ? 'small' : 'ranged' });
    }
  }
  for (let i = 0; i < 6; i++) {
    const a = deg(i * 60 + 30);
    const [x, y] = polar(820, a);
    chests.push({ x: Math.round(x), y: Math.round(y), kind: 'small' });
  }
  // 엘리트 캠프 3곳 (큰 보상)
  for (const d of [0, 120, 240]) {
    const [x, y] = polar(780, deg(d));
    camps.push({ x: Math.round(x), y: Math.round(y), type: 'elite' });
  }

  const reserved = () => [...chests, ...camps, ...pois];
  const clear = (x, y, r, gap = 60) => {
    if (x * x + y * y > (R - r - 70) ** 2) return false;
    for (const w of walls) if (segPointDist2(w[0], w[1], w[2], w[3], x, y) < (r + w[4] / 2 + gap) ** 2) return false;
    for (const p of pillars) if (dist2(x, y, p.x, p.y) < (r + p.r + gap) ** 2) return false;
    for (const q of reserved()) if (dist2(x, y, q.x, q.y) < (r + 130) ** 2) return false;
    return true;
  };
  // 연못
  for (let tries = 0, n = 0; tries < 300 && n < 7; tries++) {
    const a = rng() * TAU;
    const d = 500 + rng() * 1700;
    const r = Math.round(rng.range(80, 150));
    const [x, y] = polar(d, a);
    if (!clear(x, y, r, 140)) continue;
    pillars.push({ x: Math.round(x), y: Math.round(y), r, k: 5 });
    n++;
  }
  // 숲: 무리 지어 나무
  for (let g = 0; g < 26; g++) {
    const a = rng() * TAU;
    const d = 450 + Math.sqrt(rng()) * 1850;
    const [gx, gy] = polar(d, a);
    const kind = rng() < 0.55 ? 2 : rng() < 0.6 ? 3 : 4;
    const n = 3 + Math.floor(rng() * 5);
    for (let i = 0; i < n * 3 && i < 40; i++) {
      const x = gx + rng.range(-200, 200);
      const y = gy + rng.range(-200, 200);
      const r = Math.round(rng.range(20, 26));
      if (!clear(x, y, r, 34)) continue;
      pillars.push({ x: Math.round(x), y: Math.round(y), r, k: kind });
    }
  }
  // 바위와 그루터기
  for (let tries = 0, n = 0; tries < 900 && n < 70; tries++) {
    const a = rng() * TAU;
    const d = 300 + Math.sqrt(rng()) * 2000;
    const [x, y] = polar(d, a);
    const big = rng() < 0.35;
    const r = big ? Math.round(rng.range(28, 38)) : Math.round(rng.range(14, 20));
    if (!clear(x, y, r, 70)) continue;
    pillars.push({ x: Math.round(x), y: Math.round(y), r, k: big ? (rng() < 0.5 ? 0 : 1) : rng() < 0.5 ? 6 : 0 });
    n++;
  }
  // 수풀 (지나갈 수 있음, 안에 있으면 멀리서 안 보임)
  for (let tries = 0, n = 0; tries < 900 && n < 60; tries++) {
    const a = rng() * TAU;
    const d = 300 + Math.sqrt(rng()) * 2000;
    const [x, y] = polar(d, a);
    const r = Math.round(rng.range(40, 70));
    if (!clear(x, y, r, 20)) continue;
    if (bushes.some((b) => dist2(x, y, b.x, b.y) < (r + b.r + 60) ** 2)) continue;
    bushes.push({ x: Math.round(x), y: Math.round(y), r });
    n++;
  }

  const spawns = [];
  for (let i = 0; i < 16; i++) {
    const [x, y] = polar(2150, deg(i * 22.5));
    spawns.push([Math.round(x), Math.round(y)]);
  }
  return { id: 'island', name: '숲의 섬', R, walls, pillars, bushes, altars: [], camps, chests, pois, spawns, zone: { x: 0, y: 0 }, decor: { seed: 77001 } };
}

export const MAPS = {
  island: buildIsland(),
};
export const MAP_IDS = Object.keys(MAPS);
export const DEFAULT_MAP = 'island';
