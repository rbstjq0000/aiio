// 이동/충돌. 서버 시뮬레이션과 클라이언트 이동 예측이 같은 함수를 사용해야
// 예측 오차가 생기지 않는다.
import { KB_DAMP } from './constants.js';

// 대시/돌진 시작 (서버/예측 공용): 넉백은 대부분 상쇄
export function startDash(b, dx, dy, time, dist) {
  b.dashT = time;
  b.dashSpd = dist / time;
  b.ddx = dx;
  b.ddy = dy;
  b.kbx *= 0.3;
  b.kby *= 0.3;
}

// 정적 장애물(기둥)과 맵 경계 충돌 해소. 부딪혔으면 true
export function resolveStatic(u, obstacles, R) {
  let hit = false;
  for (let i = 0; i < obstacles.length; i++) {
    const o = obstacles[i];
    const dx = u.x - o.x;
    const dy = u.y - o.y;
    const minD = u.r + o.r;
    const d2 = dx * dx + dy * dy;
    if (d2 < minD * minD) {
      const d = Math.sqrt(d2) || 0.0001;
      const push = minD - d;
      u.x += (dx / d) * push;
      u.y += (dy / d) * push;
      hit = true;
    }
  }
  const d = Math.sqrt(u.x * u.x + u.y * u.y);
  const maxD = R - u.r;
  if (d > maxD) {
    u.x *= maxD / d;
    u.y *= maxD / d;
    hit = true;
  }
  return hit;
}

// 한 틱 이동: 입력 이동 + 대시 + 넉백 + 충돌
// b: { x, y, r, kbx, kby, dashT, dashSpd, ddx, ddy }
export function stepBody(b, mx, my, speed, dt, obstacles, R) {
  const len = Math.sqrt(mx * mx + my * my);
  if (len > 1) {
    mx /= len;
    my /= len;
  }
  if (b.dashT > 0) {
    const t = Math.min(dt, b.dashT);
    const sp = b.dashSpd;
    b.x += b.ddx * sp * t;
    b.y += b.ddy * sp * t;
    b.dashT -= dt;
    const rest = dt - t;
    if (rest > 0) {
      b.x += mx * speed * rest;
      b.y += my * speed * rest;
    }
  } else {
    b.x += mx * speed * dt;
    b.y += my * speed * dt;
  }
  if (b.kbx !== 0 || b.kby !== 0) {
    b.x += b.kbx * dt;
    b.y += b.kby * dt;
    const f = Math.exp(-KB_DAMP * dt);
    b.kbx *= f;
    b.kby *= f;
    if (Math.abs(b.kbx) < 3 && Math.abs(b.kby) < 3) {
      b.kbx = 0;
      b.kby = 0;
    }
  }
  return resolveStatic(b, obstacles, R);
}

// 유닛끼리 겹침 밀어내기 (서버 전용). 대시 중인 유닛은 통과
export function separateUnits(units) {
  const n = units.length;
  for (let i = 0; i < n; i++) {
    const a = units[i];
    if (!a.alive || a.dashT > 0) continue;
    for (let j = i + 1; j < n; j++) {
      const b = units[j];
      if (!b.alive || b.dashT > 0) continue;
      const dx = b.x - a.x;
      const dy = b.y - a.y;
      const minD = a.r + b.r;
      if (dx > minD || dx < -minD || dy > minD || dy < -minD) continue;
      const d2 = dx * dx + dy * dy;
      if (d2 >= minD * minD) continue;
      const d = Math.sqrt(d2) || 0.0001;
      const overlap = (minD - d) * 0.5;
      const ma = a.mass || 1;
      const mb = b.mass || 1;
      const ka = mb / (ma + mb);
      const kb = ma / (ma + mb);
      const nx = dx / d;
      const ny = dy / d;
      a.x -= nx * overlap * ka * 1.6;
      a.y -= ny * overlap * ka * 1.6;
      b.x += nx * overlap * kb * 1.6;
      b.y += ny * overlap * kb * 1.6;
    }
  }
}
