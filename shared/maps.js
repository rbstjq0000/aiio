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
//   해안 은신처(r 5400~) — 절벽으로 이웃과 나뉜 내 구역: 작은 캠프 + 상자 (초반엔 혼자 성장)
//   길목 캠프(r 4840, 부채꼴 축) — 같은 부채꼴 이웃과 처음 마주치는 곳
//   마을(r 4100, 부채꼴 축) — 지역마다 하나: 집 4채, 큰 상자 1 + 작은 상자 4
//   에픽 둥지(r 3300, 부채꼴 경계) — 옆 지역 사람들과 막타를 다툼
//   엘리트 캠프(r 2300, 부채꼴 경계) — 큰 상자
//   중앙 투기장(r 0~1120) — 대텐구 (4:00)
// 장애물 종류 k: 0 회색 바위, 1 갈색 바위, 2 둥근 나무, 3 침엽수, 4 분홍 나무, 5 연못, 6 그루터기
// 부채꼴 8개 = 지역 8개. 지형(충돌)은 모두 같고, 그림·바닥색·이름만 다르다 (공정함 유지)
// 부채꼴 i는 각도 i×45° ~ (i+1)×45° (화면 기준 0° = 동쪽, 90° = 남쪽)
export const THEMES = [
  { id: 'sakura', name: '벚꽃 골짜기', village: '벚꽃 마을', ground: [255, 200, 220, 0.16] },
  { id: 'bamboo', name: '대나무 숲', village: '대나무 사원', ground: [120, 190, 90, 0.18] },
  { id: 'snow', name: '설산', village: '설원 산장', ground: [236, 244, 255, 0.72] },
  { id: 'dead', name: '망자의 숲', village: '버려진 묘지', ground: [96, 88, 92, 0.42] },
  { id: 'autumn', name: '단풍 계곡', village: '단풍 여관', ground: [230, 150, 70, 0.24] },
  { id: 'pine', name: '소나무 산', village: '산적 야영지', ground: [70, 120, 70, 0.22] },
  { id: 'canyon', name: '바위 협곡', village: '사막 요새', ground: [222, 186, 120, 0.5] },
  { id: 'moss', name: '이끼 숲', village: '닌자 도장', ground: [90, 150, 80, 0.1] },
];
export function sectorOf(x, y) {
  const a = (Math.atan2(y, x) + TAU) % TAU;
  return Math.min(7, Math.floor(a / (TAU / 8)));
}
// 장애물 k: 0 회색 바위, 1 갈색 바위, 2 나무(지역마다 그림 다름), 5 연못, 6 그루터기,
//            7 집, 8 석상, 9 석등, 10 천막(은신처)
function buildIsland() {
  // 지형 배치 반지름 배율 (물체 크기는 그대로, 사이 간격만 넓힘)
  const K = 2;
  const L = (r) => Math.round(r * K);
  const R = L(3400);
  const rng = makeRng(77001);
  const walls = [];
  const pillars = [];
  const bushes = [];
  const chests = [];
  const camps = [];
  const pois = [];
  const lairs = [];
  const spawns = [];
  const props = []; // 충돌 없는 장식 { x, y, kind } (도리이 등)
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
    L(560),
    Array.from({ length: 8 }, (_, i) => [deg(22.5) + i * SEC, 0.32]),
  );
  lairs.push({ x: 0, y: 0, kind: 'titan', boss: 'tengu' });
  pois.push({ x: 0, y: 0, name: '대텐구의 도장' });
  // 투기장 문마다 도리이, 양옆에 석등
  for (let i = 0; i < 8; i++) {
    const ga = deg(22.5) + i * SEC;
    const [tx, ty] = P(L(560), ga);
    props.push({ x: tx, y: ty + 30, kind: 'torii' });
    for (const s2 of [-1, 1]) {
      const [lx2, ly2] = P(L(560) + 110, ga + s2 * 0.2);
      pillars.push({ x: lx2, y: ly2, r: 12, k: 9 });
    }
  }
  props.push({ x: 0, y: -230, kind: 'dojo' });
  const bosses = ['frog', 'spirit', 'cyclop', 'slime'];
  const lairNames = { frog: '두꺼비 늪', spirit: '혼령의 샘', cyclop: '악마의 바위', slime: '슬라임 동굴' };

  for (let i = 0; i < 8; i++) {
    const b = i * SEC; // 부채꼴 경계
    const ax = b + SEC / 2; // 부채꼴 축
    // 투기장 안쪽: 축마다 작은 상자
    const [ix, iy] = P(L(400), ax);
    chests.push({ x: ix, y: iy, kind: 'small' });
    // 엘리트 캠프 (경계, 큰 상자)
    camp(L(1150), b, 'elite', 'big');
    // 에픽 둥지 (경계): 옆 지역과 함께 다툼. 마주 보는 둥지는 같은 보스
    const boss = bosses[i % 4];
    const [lx, ly] = P(L(1650), b);
    lairs.push({ x: lx, y: ly, kind: 'epic', boss });
    pois.push({ x: lx, y: ly, name: lairNames[boss], lair: 1 });
    // 둥지 양옆 석상
    for (const s2 of [-1, 1]) {
      const [sx2, sy2] = P(L(1650) + 40, b + s2 * deg(7));
      pillars.push({ x: sx2, y: sy2, r: 24, k: 8 });
    }
    // 마을 (부채꼴 축 = 지역 한가운데): 집 4채가 광장을 둘러쌈. 광장 가운데 큰 상자, 집 앞마다 작은 상자
    const [rx, ry] = P(L(2050), ax);
    const ux = Math.cos(ax);
    const uy = Math.sin(ax);
    const at = (u, v) => [Math.round(rx + ux * u - uy * v), Math.round(ry + uy * u + ux * v)];
    for (const [u, v] of [[-260, -250], [-260, 250], [260, -250], [260, 250]]) {
      const [hx, hy] = at(u, v);
      pillars.push({ x: hx, y: hy, r: 70, k: 7, t: i });
      const [cx, cy] = at(u * 0.45, v * 0.45);
      chests.push({ x: cx, y: cy, kind: 'small' });
    }
    for (const [u, v] of [[0, -120], [0, 120]]) {
      const [lx2, ly2] = at(u, v);
      pillars.push({ x: lx2, y: ly2, r: 12, k: 9 });
    }
    chests.push({ x: rx, y: ry, kind: 'big' });
    pois.push({ x: rx, y: ry, name: THEMES[i].village });
    // 안쪽 성벽 (r 2800): 반쪽 부채꼴마다 한 토막, 경계·축 쪽은 열려 있음 → 안쪽으로 가는 문 16개
    for (const [t0, t1] of [[deg(5), deg(17)], [deg(28), deg(40)]]) {
      const n = 3;
      for (let k = 0; k < n; k++) wallSeg(L(1400), b + t0 + ((t1 - t0) * k) / n, L(1400), b + t0 + ((t1 - t0) * (k + 1)) / n);
    }
    // 길목 캠프 (축): 같은 부채꼴의 두 사람이 처음 만나는 곳
    camp(L(2420), ax, 'large');
    // 해안 절벽: 축(같은 부채꼴 두 사람 사이)과 경계(옆 부채꼴과 사이)
    radialWall(ax, L(2620), R + 40);
    radialWall(b, L(2380), R + 40);
    // 들판 캠프·상자: 반쪽 부채꼴마다 하나씩 (유적과 에픽 둥지 사이, 길목과 유적 사이)
    for (const sgn of [-1, 1]) {
      camp(L(1950), ax + sgn * deg(12), 'ranged');
      const [fx, fy] = P(L(2650), ax + sgn * deg(13));
      chests.push({ x: fx, y: fy, kind: 'small' });
      camp(L(1350), ax + sgn * deg(13), 'large');
    }
    // 시작 지점 2곳 (축 기준 거울상) + 각자의 은신처
    for (const sgn of [-1, 1]) {
      const sa = ax + sgn * deg(11.25);
      spawns.push(P(L(3020), sa));
      // 은신처 천막 (시작 지점 바로 바깥쪽)
      const [tx2, ty2] = P(L(3020) + 230, sa);
      pillars.push({ x: tx2, y: ty2, r: 42, k: 10 });
      // 은신처: 작은 캠프(작은 상자) + 상자 하나 + 수풀
      camp(L(2780), ax + sgn * deg(6), 'small');
      const [cx, cy] = P(L(3150), ax + sgn * deg(16));
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
  for (let tries = 0, n = 0; tries < 600 && n < 2; tries++) {
    const r = Math.round(rng.range(100, 140));
    if (tryPut(L(rng.range(900, 2300)), T(), r, 140, (s) => pillars.push({ x: Math.round(s.x), y: Math.round(s.y), r, k: 5 }))) n++;
  }
  // 숲: 반쪽마다 나무 무리 5개
  for (let g = 0; g < 15; g++) {
    const gd = L(rng.range(700, 3100));
    const gt = T();
    const n = 5 + Math.floor(rng() * 5);
    for (let i = 0, put = 0; i < 40 && put < n; i++) {
      const d = gd + rng.range(-200, 200);
      const t = gt + rng.range(-180, 180) / Math.max(400, gd);
      if (t <= 0 || t >= deg(22.5)) continue;
      const r = Math.round(rng.range(20, 26));
      if (tryPut(d, t, r, 34, (s) => pillars.push({ x: Math.round(s.x), y: Math.round(s.y), r, k: 2 }))) put++;
    }
  }
  // 바위·그루터기: 반쪽마다 8개
  for (let tries = 0, n = 0; tries < 1500 && n < 26; tries++) {
    const big = rng() < 0.4;
    const r = big ? Math.round(rng.range(28, 38)) : Math.round(rng.range(14, 20));
    const k = big ? (rng() < 0.5 ? 0 : 1) : rng() < 0.5 ? 6 : 0;
    if (tryPut(L(rng.range(650, 3200)), T(), r, 70, (s) => pillars.push({ x: Math.round(s.x), y: Math.round(s.y), r, k }))) n++;
  }
  // 수풀: 반쪽마다 7개 (지나갈 수 있음, 안에 있으면 멀리서 안 보임)
  for (let tries = 0, n = 0; tries < 2000 && n < 20; tries++) {
    const r = Math.round(rng.range(44, 70));
    const d = L(rng.range(650, 3200));
    const t = T();
    const ok = place(d, t).every((s) => {
      const x = Math.cos(s.a) * d;
      const y = Math.sin(s.a) * d;
      return bushes.every((b) => dist2(x, y, b.x, b.y) > (r + b.r + 60) ** 2);
    });
    if (ok && tryPut(d, t, r, 20, (s) => bushes.push({ x: Math.round(s.x), y: Math.round(s.y), r }))) n++;
  }
  return { id: 'island', name: '숲의 섬', R, walls, pillars, bushes, altars: [], camps, chests, pois, lairs, spawns, zone: { x: 0, y: 0 }, decor: { seed: 77001 }, props, fixedSpawns: true };
}

export const MAPS = {
  island: buildIsland(),
};
export const MAP_IDS = Object.keys(MAPS);
export const DEFAULT_MAP = 'island';
