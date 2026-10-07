// 봇 AI: 빈자리를 채워 언제 들어와도 16인 판이 되게 함
// 사냥 → 상자/장비 → 오브 쟁탈 → 교전/후퇴
import { dist2 } from './math.js';
import { PRESS } from './constants.js';
import { WEAPONS, canTake } from './items.js';
import { MONSTERS } from './monsters.js';

export const BOT_NAMES = [
  '그림자여우', 'Noctis', '망자의왕', 'Kairos', '하늘조각', 'Rinne', '불멸의토끼', 'Ashen',
  'StyxRider', '명계여행자', 'Orphe', 'Lunar', '피의서약', 'Echo', '검은나비', 'Vesper',
  'Nyx_kr', '영혼수집가', 'Moira', '저승배달부', 'Ignis', '은빛화살', 'Pyre', '심연', 'Selene',
  '번개도령', 'Erebus', '고양이전사', 'Atlas', '새벽별', 'Kuro', '달빛검객', 'Zephyr', '불꽃망령',
];

// 무기별 교전 거리와 스킬 사용 조건
const AI = {
  dagger: { pref: 55, reach: 82, q: { min: 60, max: 740, aim: true }, w: { min: 200, max: 650, ground: true }, e: { max: 170 }, r: { max: 520, exec: true } },
  shuriken: { pref: 470, reach: 690, q: { min: 120, max: 880, aim: true }, w: { max: 560, aim: true }, e: { max: 200, escape: true }, r: { max: 680, aim: true } },
  scroll: { pref: 520, reach: 725, q: { max: 920, aim: true }, w: { max: 980, aim: true }, e: { max: 200, escape: true }, r: { max: 590, ground: true } },
};

const PROJ_SPEED = { shuriken: 1250, scroll: 860 };
// 스킬 투사체 속도 (조준 예측용)
const SKILL_SPEED = { dagger: 1400, shuriken: 1500, scroll: 1300 };

export function makeBotBrain(rng, skill) {
  return {
    skill,
    aimErr: 0.4 - skill * 0.34,
    aggro: 0.25 + rng() * 0.5 + skill * 0.25,
    thinkT: rng() * 0.3,
    mode: 'wander',
    target: 0,
    goal: null,
    wx: 0,
    wy: 0,
    wanderT: 0,
    strafe: rng() < 0.5 ? 1 : -1,
    strafeT: 1,
    dodgeT: 0,
    tid: 0,
    tvx: 0,
    tvy: 0,
    tlx: 0,
    tly: 0,
    tlt: 0,
    lastX: 0,
    lastY: 0,
    stuckT: 0.5,
    unstickT: 0,
    unstickA: 0,
    actCd: 0,
    avoidId: 0,
    avoidT: 0,
  };
}

function press(p, key) {
  p.input.p[PRESS[key]]++;
}

// 목표 지점까지 이동 방향: 벽이 없으면 직선, 있으면 A* 경로를 따라감
function navDir(game, p, b, tx, ty) {
  const nav = game.nav;
  if (!nav || nav.clearLine(p.x, p.y, tx, ty)) {
    b.path = null;
    return [tx - p.x, ty - p.y];
  }
  b.pathT = (b.pathT || 0) - 1;
  if (!b.path || b.pathT <= 0 || (b.pathGoal && (b.pathGoal[0] - tx) ** 2 + (b.pathGoal[1] - ty) ** 2 > 90 * 90)) {
    b.path = nav.find(p.x, p.y, tx, ty);
    b.pathGoal = [tx, ty];
    b.pathT = 25;
  }
  const path = b.path;
  if (!path || !path.length) return [tx - p.x, ty - p.y];
  while (path.length > 1 && (path[0][0] - p.x) ** 2 + (path[0][1] - p.y) ** 2 < 34 * 34) path.shift();
  // 다음 지점이 이미 보이면 건너뜀
  if (path.length > 1 && nav.clearLine(p.x, p.y, path[1][0], path[1][1])) path.shift();
  return [path[0][0] - p.x, path[0][1] - p.y];
}

export function botThink(game, p, dt) {
  const b = p.brain;
  const rng = game.rng;
  if (b.dodgeT > 0) b.dodgeT -= dt;
  if (b.actCd > 0) b.actCd -= dt;
  b.strafeT -= dt;
  if (b.strafeT <= 0) {
    b.strafeT = 0.7 + rng() * 1.3;
    if (rng() < 0.6) b.strafe = -b.strafe;
  }
  b.thinkT -= dt;
  if (b.thinkT <= 0) {
    b.thinkT = 0.12 + (1 - b.skill) * 0.2;
    decide(game, p, b);
  }
  act(game, p, b, dt);
}

// 시간별 목표 생존 인원: 8분 판이 되도록 (2분 ≈ 14명, 4분 ≈ 10명, 6분 ≈ 5명)
function desiredAlive(game) {
  const k = Math.min(1, Math.max(0, game.time / 590));
  return game.startCount * (1 - k ** 1.5);
}

// 상대와 나의 전투력 비교 (체력 × 무기 등급 × 증강 수)
function power(u) {
  return u.hp * (1 + 0.06 * u.gear.weapon.rarity) * (1 + 0.08 * u.augs.length);
}

function decide(game, p, b) {
  const hpR = p.hp / p.maxHp;
  const z = game.zone;
  b.goal = null;

  // 자기장: 밖이거나, 곧 줄어들 원 밖이면 안쪽으로
  const outNow = z.dps > 0 && dist2(p.x, p.y, z.x, z.y) > (z.r * 0.88) ** 2;
  const outNext = z.stage !== 'wait' && dist2(p.x, p.y, z.tx, z.ty) > (z.tr * 0.85) ** 2;
  if (outNow || (outNext && (z.stage === 'shrink' || z.stageT < 12))) {
    b.mode = 'goto';
    b.goal = outNext ? [z.tx, z.ty] : [z.x, z.y];
    return;
  }

  // 가까운 적 플레이어
  let enemy = null;
  let ed2 = Infinity;
  for (const q of game.players.values()) {
    if (!q.alive || q === p || q.invulnT > 0) continue;
    if (q.st.invisT > 0 && dist2(p.x, p.y, q.x, q.y) > 140 * 140) continue;
    const d = dist2(p.x, p.y, q.x, q.y);
    if (d < ed2) {
      ed2 = d;
      enemy = q;
    }
  }
  const ed = Math.sqrt(ed2);

  // 판 흐름 조절: 생존 인원이 목표 곡선보다 적으면 봇끼리는 먼저 싸움을 걸지 않음 (사람은 영향 없음)
  const pace = game.aliveCount() > desiredAlive(game);
  let attacker = game.time - p.lastHitByT < 3 ? game.players.get(p.lastHitBy) : null;
  if (attacker && attacker.isBot && (game.time < 60 || !pace) && !(attacker.brain.mode === 'fight' && attacker.brain.target === p.id)) {
    b.avoidId = attacker.id;
    b.avoidT = 2.5;
    attacker = null;
  }
  if (attacker && attacker.alive && dist2(p.x, p.y, attacker.x, attacker.y) < 600 * 600) enemy = attacker;
  const defending = !!attacker && enemy === attacker;

  // 시간이 갈수록 호전적으로: 초반엔 파밍 위주, 후반(자기장 3단계 이후)엔 적극적으로 싸움
  const ramp = Math.min(1, Math.max(0, (game.time - 45) / 280));
  const engage = (game.time < 45 ? 0 : 90 + ramp * 470) * (0.7 + b.aggro * 0.6);
  // 이미 둘 이상이 노리는 상대에겐 끼어들지 않음 (한 명을 우르르 몰려가 잡는 것 방지)
  let ganged = 0;
  if (enemy) for (const q of game.players.values()) if (q !== p && q.isBot && q.alive && q.brain.mode === 'fight' && q.brain.target === enemy.id) ganged++;
  const allowed = defending || !enemy || !enemy.isBot || pace;
  if (enemy && allowed && (ed < engage || defending) && p.invulnT <= 0 && (ganged < 1 || defending)) {
    const courage = defending ? 0.85 + b.aggro * 0.5 : (0.35 + ramp * 0.25) + b.aggro * 0.5;
    const melee = AI[p.gear.weapon.type].pref < 200;
    const brave = power(p) * courage * (melee && ed < 300 ? 1.3 : 1) > power(enemy) || enemy.hp < enemy.maxHp * 0.25;
    if (brave) {
      b.mode = 'fight';
      b.target = enemy.id;
      return;
    }
    if (hpR < 0.55 || defending) {
      b.mode = 'flee';
      b.target = enemy.id;
      return;
    }
  }
  // 에픽 보물은 근처에 적이 있어도 노림 (뺏고 뺏기는 싸움)
  for (const c of game.chests) {
    if (c.open || (c.kind !== 'epic' && c.kind !== 'titan')) continue;
    if (dist2(p.x, p.y, c.x, c.y) > 900 * 900) continue;
    b.mode = 'chest';
    b.goal = [c.x, c.y];
    return;
  }
  // 바닥의 더 좋은 무기
  if (!enemy || ed > 400) {
    let item = null;
    let i2 = 700 * 700;
    for (const it of game.items) {
      if (!canTake(p.gear.weapon, it) || it.rarity <= p.gear.weapon.rarity) continue;
      const d = dist2(p.x, p.y, it.x, it.y);
      if (d < i2) {
        i2 = d;
        item = it;
      }
    }
    if (item) {
      b.mode = 'item';
      b.goal = [item.x, item.y];
      b.itemId = item.id;
      return;
    }
  }
  // 상자 (근처에 적이 없을 때, 잠긴 캠프 상자는 몹부터)
  if (!enemy || ed > 450) {
    let chest = null;
    let c2 = 900 * 900;
    for (const c of game.chests) {
      if (c.open || game.chestLocked(c)) continue;
      if (z.dps > 0 && dist2(c.x, c.y, z.x, z.y) > z.r * z.r) continue;
      const d = dist2(p.x, p.y, c.x, c.y);
      if (d < c2) {
        c2 = d;
        chest = c;
      }
    }
    if (chest) {
      b.mode = 'chest';
      b.goal = [chest.x, chest.y];
      return;
    }
  }

  // 사냥 (다른 플레이어가 잡고 있는 몬스터는 초반에 피함)
  let mon = null;
  let md = 900 * 900;
  const rar = p.gear.weapon.rarity;
  for (const m of game.monsters) {
    if (!m.alive) continue;
    const def = MONSTERS[m.type];
    if (m.type === 'elite' && (rar < 1 || hpR < 0.6)) continue;
    // 에픽 몬스터: 무기가 어느 정도 좋고 체력이 넉넉할 때 (큰 에픽은 더 세야)
    if (def.epic && (hpR < 0.65 || rar < (def.titan ? 3 : 2) || game.time < 100)) continue;
    let d = dist2(p.x, p.y, m.x, m.y);
    if (m.type === 'elite') d *= 0.7;
    if (def.epic) d *= 0.5;
    if (d >= md) continue;
    if (game.time < 90) {
      let crowded = false;
      for (const q of game.players.values()) {
        if (q !== p && q.alive && dist2(q.x, q.y, m.x, m.y) < 230 * 230) {
          crowded = true;
          break;
        }
      }
      if (crowded) continue;
    }
    md = d;
    mon = m;
  }
  if (mon) {
    b.mode = 'farm';
    b.target = mon.id;
    return;
  }
  b.mode = 'wander';
}

function act(game, p, b, dt) {
  const inp = p.input;
  const rng = game.rng;
  const out = { mx: 0, my: 0, aim: null, atk: false, dash: false, dashX: 0, dashY: 0 };
  const hpR = p.hp / p.maxHp;

  if (b.mode === 'fight' || b.mode === 'farm') {
    const t = game.byId.get(b.target);
    if (t && t.alive) combat(game, p, b, t, out, dt);
    else b.mode = 'wander';
  } else if (b.mode === 'flee') {
    const t = game.byId.get(b.target);
    if (t && t.alive) {
      const dx = p.x - t.x;
      const dy = p.y - t.y;
      const d = Math.sqrt(dx * dx + dy * dy) || 1;
      out.mx = dx / d - (p.x / game.R) * 0.5;
      out.my = dy / d - (p.y / game.R) * 0.5;
      out.aim = Math.atan2(-dy, -dx);
      if (d < 200 && rng() < 0.1 + b.skill * 0.15) {
        out.dash = true;
        out.dashX = dx / d;
        out.dashY = dy / d;
      }
      const ai = AI[p.gear.weapon.type];
      if (ai.reach > 300 && d < ai.reach) out.atk = true;
    } else b.mode = 'wander';
  } else if (b.mode === 'goto' || b.mode === 'item' || b.mode === 'chest') {
    if (b.goal) {
      const dx = b.goal[0] - p.x;
      const dy = b.goal[1] - p.y;
      const d = Math.sqrt(dx * dx + dy * dy);
      if (b.mode === 'chest' && d < 52) {
        out.mx = 0;
        out.my = 0;
        if (!p.channel) {
          p.input.ti = 0;
          press(p, 'act');
        }
      } else if (b.mode === 'item' && d < 60) {
        p.input.ti = b.itemId;
        press(p, 'act');
        b.mode = 'wander';
        b.thinkT = 0.3;
      } else {
        [out.mx, out.my] = navDir(game, p, b, b.goal[0], b.goal[1]);
      }
    }
  }
  if (b.mode === 'wander') {
    b.wanderT -= dt;
    if (b.wanderT <= 0 || dist2(p.x, p.y, b.wx, b.wy) < 60 * 60) {
      b.wanderT = 3 + rng() * 3;
      // 안전지대 안의 정글 캠프나 무작위 지점으로
      const z = game.zone;
      const zr = Math.min(z.r, game.R) * 0.8;
      const inside = game.camps.filter((c) => dist2(c.x, c.y, z.x, z.y) < zr * zr);
      const c = inside.length && rng() < 0.6 ? inside[Math.floor(rng() * inside.length)] : null;
      const a = rng() * Math.PI * 2;
      const d = Math.sqrt(rng()) * zr;
      b.wx = c ? c.x + (rng() - 0.5) * 200 : z.x + Math.cos(a) * d;
      b.wy = c ? c.y + (rng() - 0.5) * 200 : z.y + Math.sin(a) * d;
    }
    [out.mx, out.my] = navDir(game, p, b, b.wx, b.wy);
  }

  // 기절·속박 → 정화
  // 교전 중 방벽

  if (b.avoidT > 0) {
    b.avoidT -= dt;
    const a = game.players.get(b.avoidId);
    if (a && a.alive) {
      const dx = p.x - a.x;
      const dy = p.y - a.y;
      const d = Math.sqrt(dx * dx + dy * dy) || 1;
      if (d < 260) {
        out.mx += (dx / d) * 1.5;
        out.my += (dy / d) * 1.5;
        if (b.mode === 'farm') out.atk = false;
      }
    }
  }

  dodge(game, p, b, out);

  let mx = out.mx;
  let my = out.my;
  const ml = Math.sqrt(mx * mx + my * my);
  if (ml > 0.001) {
    mx /= ml;
    my /= ml;
    const av = avoidObstacles(game, p, mx, my);
    mx = av[0];
    my = av[1];
  }
  b.stuckT -= dt;
  if (b.stuckT <= 0) {
    b.stuckT = 0.5;
    const moved = Math.sqrt(dist2(p.x, p.y, b.lastX, b.lastY));
    if (ml > 0.1 && moved < 22 && !p.act && !p.channel) {
      b.unstickT = 0.45;
      b.unstickA = Math.atan2(my, mx) + (rng() < 0.5 ? 1 : -1) * (Math.PI / 2);
    }
    b.lastX = p.x;
    b.lastY = p.y;
  }
  if (b.unstickT > 0) {
    b.unstickT -= dt;
    mx = Math.cos(b.unstickA);
    my = Math.sin(b.unstickA);
  }

  inp.mx = mx;
  inp.my = my;
  if (out.aim != null) inp.aim = out.aim;
  else if (ml > 0.001) inp.aim = Math.atan2(my, mx);
  inp.atk = out.atk;
  // 사람처럼 대상을 지정해 기본 공격 (롤식)
  inp.at = out.atk && b.target ? b.target : out.atk && b.tid ? b.tid : 0;
  // 회피/추격 이동기: 무기 E가 이동기일 때만
  if (out.dash) {
    const ex = WEAPONS[p.gear.weapon.type].e;
    const mobileE = ex.type === 'dashstrike' || ex.type === 'blinkskill' || ex.type === 'backflip';
    if (mobileE && p.cd.e <= 0 && !p.act) {
      inp.aim = Math.atan2(out.dashY, out.dashX);
      inp.cx = p.x + out.dashX * 250;
      inp.cy = p.y + out.dashY * 250;
      press(p, 'e');
    } else if (p.cd.d <= 0 && (b.skill > 0.4 || b.mode === 'flee')) {
      inp.cx = p.x + out.dashX * 250;
      inp.cy = p.y + out.dashY * 250;
      press(p, 'd');
    }
  }
}

function combat(game, p, b, t, out, dt) {
  const rng = game.rng;
  const dx = t.x - p.x;
  const dy = t.y - p.y;
  const d = Math.sqrt(dx * dx + dy * dy) || 1;
  const nx = dx / d;
  const ny = dy / d;
  if (b.tid !== t.id) {
    b.tid = t.id;
    b.tvx = 0;
    b.tvy = 0;
    b.tlx = t.x;
    b.tly = t.y;
    b.tlt = game.time;
  } else {
    const dtt = game.time - b.tlt;
    if (dtt >= 0.1) {
      b.tvx = b.tvx * 0.5 + ((t.x - b.tlx) / dtt) * 0.5;
      b.tvy = b.tvy * 0.5 + ((t.y - b.tly) / dtt) * 0.5;
      b.tlx = t.x;
      b.tly = t.y;
      b.tlt = game.time;
    }
  }
  const w = p.gear.weapon.type;
  const ai = AI[w];
  const reach = ai.reach + t.r;
  let mx = 0;
  let my = 0;
  if (d > ai.pref + 25) {
    const [vx, vy] = navDir(game, p, b, t.x, t.y);
    const l = Math.sqrt(vx * vx + vy * vy) || 1;
    mx = vx / l;
    my = vy / l;
  } else if (d < ai.pref - 40 && ai.pref > 200) {
    mx = -nx;
    my = -ny;
  }
  if (t.isPlayer && d < reach + 100) {
    mx += -ny * b.strafe * 0.75;
    my += nx * b.strafe * 0.75;
  }
  if (!t.isPlayer && ai.pref > 200 && d < 170) {
    mx = -nx;
    my = -ny;
  }
  const ps = PROJ_SPEED[w];
  const lead = ps ? (d / ps) * b.skill : 0;
  const ax = t.x + b.tvx * lead;
  const ay = t.y + b.tvy * lead;
  out.aim = Math.atan2(ay - p.y, ax - p.x) + (rng() - 0.5) * b.aimErr;
  out.mx = mx;
  out.my = my;
  if (d < reach) out.atk = true;

  // 단도: 그림자가 적에게 더 가까우면 W를 다시 눌러 자리 바꾸기 (파고들기)
  if (w === 'dagger' && t.isPlayer && !p.act) {
    for (const a of game.areas) {
      if (!a.alive || a.kind !== 'shadow' || a.owner !== p.id || a.swapped || a.slot !== 'w') continue;
      if (Math.sqrt(dist2(a.x, a.y, t.x, t.y)) + 120 < d && rng() < 0.15 + b.skill * 0.3) {
        press(p, 'w');
        b.actCd = 0.2;
        return;
      }
    }
  }
  if (b.actCd > 0 || p.act || p.dashT > 0) return;
  const k = 0.6 * b.skill;
  const px = t.x + b.tvx * k + (rng() - 0.5) * 70 * (1 - b.skill);
  const py = t.y + b.tvy * k + (rng() - 0.5) * 70 * (1 - b.skill);
  const tryUse = (key) => {
    const c = ai[key];
    if (!c) return false;
    if (key === 'r' ? p.ult < 100 : p.cd[key] > 0) return false;
    if (c.min && d < c.min) return false;
    if (c.max && d > c.max + t.r) return false;
    if (c.ground || c.exec) {
      p.input.cx = px;
      p.input.cy = py;
    }
    if (c.escape) return false;
    if (c.aim && SKILL_SPEED[w] && key !== 'basic') {
      const ld = (d / SKILL_SPEED[w]) * b.skill;
      out.aim = Math.atan2(t.y + b.tvy * ld - p.y, t.x + b.tvx * ld - p.x) + (rng() - 0.5) * b.aimErr * 0.6;
    }
    if (key === 'r' && !t.isPlayer && !MONSTERS[t.type].epic && t.type !== 'elite') return false;
    press(p, key);
    b.actCd = 0.25;
    return true;
  };
  if (rng() < 0.25 + b.skill * 0.35) {
    if (tryUse('r') || tryUse('w') || tryUse('q') || tryUse('e')) return;
  }
  // 근접 무기: 대시로 거리 좁히기
  if (t.isPlayer && ai.pref < 200 && d > 160 && d < 320 && p.hp > p.maxHp * 0.45 && rng() < (0.03 + 0.05 * b.skill) * (dt * 30)) {
    out.dash = true;
    out.dashX = nx;
    out.dashY = ny;
  }
}

function dodge(game, p, b, out) {
  for (const a of game.areas) {
    if (a.fired || a.team === p.team) continue;
    if (!game.inArea(a, { x: p.x, y: p.y, r: p.r + 12 })) continue;
    const left = a.delay - a.t;
    if (left > 0.7 || left < 0) continue;
    let ex;
    let ey;
    if (a.kind === 'line') {
      ex = -Math.sin(a.ang);
      ey = Math.cos(a.ang);
      const side = (p.x - a.x) * ex + (p.y - a.y) * ey;
      if (side < 0) {
        ex = -ex;
        ey = -ey;
      }
    } else {
      const d = Math.sqrt(dist2(p.x, p.y, a.x, a.y)) || 1;
      ex = (p.x - a.x) / d;
      ey = (p.y - a.y) / d;
    }
    out.mx = ex;
    out.my = ey;
    if (left < 0.35 && b.dodgeT <= 0 && game.rng() < b.skill * 0.6 + 0.1) {
      out.dash = true;
      out.dashX = ex;
      out.dashY = ey;
      b.dodgeT = 0.6;
    }
    return;
  }
  if (b.dodgeT > 0) return;
  for (const q of game.projs) {
    if (!q.alive || q.team === p.team) continue;
    const rx = p.x - q.x;
    const ry = p.y - q.y;
    if (rx * rx + ry * ry > 320 * 320) continue;
    const vv = q.vx * q.vx + q.vy * q.vy;
    if (vv < 1) continue;
    const tc = (rx * q.vx + ry * q.vy) / vv;
    if (tc < 0 || tc > 0.28) continue;
    const cx = q.x + q.vx * tc - p.x;
    const cy = q.y + q.vy * tc - p.y;
    if (cx * cx + cy * cy > (p.r + q.r + 10) ** 2) continue;
    b.dodgeT = 0.5;
    if (q.dmg > 100 || game.rng() < b.skill * 0.5) {
      const sp = Math.sqrt(vv);
      let px = -q.vy / sp;
      let py = q.vx / sp;
      if (px * cx + py * cy > 0) {
        px = -px;
        py = -py;
      }
      if (game.rng() < b.skill) {
        out.dash = true;
        out.dashX = px;
        out.dashY = py;
      }
      out.mx = px;
      out.my = py;
    }
    return;
  }
}

function avoidObstacles(game, p, mx, my) {
  let ax = mx;
  let ay = my;
  for (const o of game.obstacles) {
    const ox = o.x - p.x;
    const oy = o.y - p.y;
    const range = o.r + p.r + 70;
    if (ox * ox + oy * oy > range * range) continue;
    const ahead = ox * mx + oy * my;
    if (ahead <= 0) continue;
    const perp = ox * -my + oy * mx;
    if (Math.abs(perp) > o.r + p.r + 6) continue;
    const side = perp > 0 ? -1 : 1;
    ax += -my * side * 1.2;
    ay += mx * side * 1.2;
  }
  const l = Math.sqrt(ax * ax + ay * ay) || 1;
  return [ax / l, ay / l];
}
