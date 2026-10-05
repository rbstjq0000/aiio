// 봇 길찾기: 맵을 격자로 나누고 A*로 경로를 찾는다 (벽·기둥 회피)
import { segPointDist2 } from './math.js';
import { wallBlocked } from './physics.js';

const CELL = 40;
const CLEAR = 24; // 유닛 반지름 + 여유

export class NavGrid {
  constructor(R, obstacles, walls) {
    this.R = R;
    this.walls = walls;
    this.obstacles = obstacles;
    this.n = Math.ceil((R * 2) / CELL);
    this.blocked = new Uint8Array(this.n * this.n);
    for (let gy = 0; gy < this.n; gy++) {
      for (let gx = 0; gx < this.n; gx++) {
        const [x, y] = this.center(gx, gy);
        let b = x * x + y * y > (R - CLEAR) ** 2;
        if (!b) for (const o of obstacles) if ((x - o.x) ** 2 + (y - o.y) ** 2 < (o.r + CLEAR) ** 2) b = true;
        if (!b) for (const w of walls) if (segPointDist2(w[0], w[1], w[2], w[3], x, y) < (w[4] / 2 + CLEAR) ** 2) b = true;
        this.blocked[gy * this.n + gx] = b ? 1 : 0;
      }
    }
  }

  center(gx, gy) {
    return [gx * CELL - this.R + CELL / 2, gy * CELL - this.R + CELL / 2];
  }

  cell(x, y) {
    const gx = Math.max(0, Math.min(this.n - 1, Math.floor((x + this.R) / CELL)));
    const gy = Math.max(0, Math.min(this.n - 1, Math.floor((y + this.R) / CELL)));
    return [gx, gy];
  }

  // 막힌 칸이면 가장 가까운 빈 칸으로
  freeCell(x, y) {
    let [gx, gy] = this.cell(x, y);
    if (!this.blocked[gy * this.n + gx]) return [gx, gy];
    for (let r = 1; r < 6; r++) {
      for (let dy = -r; dy <= r; dy++) {
        for (let dx = -r; dx <= r; dx++) {
          const nx = gx + dx;
          const ny = gy + dy;
          if (nx < 0 || ny < 0 || nx >= this.n || ny >= this.n) continue;
          if (!this.blocked[ny * this.n + nx]) return [nx, ny];
        }
      }
    }
    return [gx, gy];
  }

  // 두 지점 사이에 벽이 없으면 곧장 가도 됨
  clearLine(x1, y1, x2, y2) {
    return !wallBlocked(x1, y1, x2, y2, this.walls, CLEAR - 4);
  }

  // A*: 월드 좌표 경로 반환 (시작점 제외). 못 찾으면 null
  find(x1, y1, x2, y2, maxNodes = 4000) {
    const n = this.n;
    const [sx, sy] = this.freeCell(x1, y1);
    const [tx, ty] = this.freeCell(x2, y2);
    const start = sy * n + sx;
    const goal = ty * n + tx;
    if (start === goal) return [[x2, y2]];
    const g = new Map([[start, 0]]);
    const came = new Map();
    const open = [[this.h(sx, sy, tx, ty), start]];
    const closed = new Set();
    let expanded = 0;
    while (open.length && expanded < maxNodes) {
      let bi = 0;
      for (let i = 1; i < open.length; i++) if (open[i][0] < open[bi][0]) bi = i;
      const [, cur] = open[bi];
      open[bi] = open[open.length - 1];
      open.pop();
      if (closed.has(cur)) continue;
      if (cur === goal) return this.build(came, cur, x2, y2);
      closed.add(cur);
      expanded++;
      const cx = cur % n;
      const cy = (cur / n) | 0;
      const gc = g.get(cur);
      for (let dy = -1; dy <= 1; dy++) {
        for (let dx = -1; dx <= 1; dx++) {
          if (!dx && !dy) continue;
          const nx = cx + dx;
          const ny = cy + dy;
          if (nx < 0 || ny < 0 || nx >= n || ny >= n) continue;
          const ni = ny * n + nx;
          if (this.blocked[ni] || closed.has(ni)) continue;
          // 대각선은 모서리를 끼고 돌지 않게
          if (dx && dy && (this.blocked[cy * n + nx] || this.blocked[ny * n + cx])) continue;
          const ng = gc + (dx && dy ? 1.414 : 1);
          if (ng < (g.get(ni) ?? Infinity)) {
            g.set(ni, ng);
            came.set(ni, cur);
            open.push([ng + this.h(nx, ny, tx, ty), ni]);
          }
        }
      }
    }
    return null;
  }

  h(ax, ay, bx, by) {
    const dx = Math.abs(ax - bx);
    const dy = Math.abs(ay - by);
    return Math.max(dx, dy) + 0.414 * Math.min(dx, dy);
  }

  build(came, cur, x2, y2) {
    const pts = [];
    while (came.has(cur)) {
      const gx = cur % this.n;
      const gy = (cur / this.n) | 0;
      pts.push(this.center(gx, gy));
      cur = came.get(cur);
    }
    pts.reverse();
    if (pts.length) pts[pts.length - 1] = [x2, y2];
    // 직선으로 갈 수 있는 중간 지점은 생략
    const out = [];
    let i = 0;
    while (i < pts.length) {
      let j = pts.length - 1;
      const from = out.length ? out[out.length - 1] : pts[0];
      while (j > i && !this.clearLine(from[0], from[1], pts[j][0], pts[j][1])) j--;
      out.push(pts[j]);
      i = j + 1;
    }
    return out;
  }
}
