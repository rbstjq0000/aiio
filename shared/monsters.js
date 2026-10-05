// 몬스터 정의 + AI (PvE 사냥 대상)
import { angleDiff, dist2 } from './math.js';

export const MONSTERS = {
  shade: { idx: 0, name: '망령', hp: 220, r: 15, speed: 160, dmg: 45, xp: 18, mass: 0.7, aggro: 420, atkRange: 36, windup: 0.28, atkCd: 1.0, kbRes: 0.8 },
  archer: { idx: 1, name: '해골 궁수', hp: 180, r: 15, speed: 130, dmg: 55, xp: 22, mass: 0.8, aggro: 520, atkRange: 470, windup: 0.45, atkCd: 1.8, kbRes: 0.9, keep: 260, projSpeed: 620 },
  brute: { idx: 2, name: '지옥 거한', hp: 900, r: 26, speed: 120, dmg: 110, xp: 63, mass: 3, aggro: 420, atkRange: 110, windup: 0.7, atkCd: 2.2, kbRes: 0.45, slamR: 105 },
  elite: { idx: 3, name: '망령 기사', hp: 1300, r: 24, speed: 150, dmg: 100, xp: 144, mass: 4, aggro: 460, atkRange: 100, windup: 0.6, atkCd: 1.8, kbRes: 0.35, slamR: 95, leash: 500 },
  guardian: { idx: 4, name: '오브 수호자', hp: 4500, r: 38, speed: 115, dmg: 110, xp: 450, mass: 14, aggro: 380, atkRange: 140, windup: 0.85, atkCd: 2.2, kbRes: 0.15, slamR: 140, ringEvery: 4.5, ringDmg: 60, leash: 300 },
};
export const MONSTER_TYPES = Object.keys(MONSTERS);
export const MONSTER_BY_IDX = MONSTER_TYPES.map((k) => MONSTERS[k]);

// 상태 코드 (스냅샷용): 0 대기, 1 이동, 2 공격 준비(경고), 3 공격 후딜
export const MSTATE = { idle: 0, move: 1, windup: 2, recover: 3 };

// 몬스터 AI 한 틱. game은 Game 인스턴스, combat 함수들을 game이 제공
export function updateMonster(game, m, dt) {
  const def = MONSTERS[m.type];
  m.atkT -= dt;
  m.stateT -= dt;

  if (m.st.stunT > 0 || m.st.rootT > 0) {
    // 기절/속박 중엔 준비 중이던 공격 취소
    if (m.state === MSTATE.windup && m.st.stunT > 0) {
      m.state = MSTATE.idle;
      if (m.tele) game.removeArea(m.tele);
      m.tele = null;
    }
    if (m.st.stunT > 0) return;
  }

  // 타겟 갱신 (0.4초마다)
  m.thinkT -= dt;
  if (m.thinkT <= 0) {
    m.thinkT = 0.4;
    const tgt = m.target ? game.players.get(m.target) : null;
    const homeX = m.homeX;
    const homeY = m.homeY;
    const leash = m.leash || def.leash || 900;
    if (tgt && (!tgt.alive || dist2(tgt.x, tgt.y, homeX, homeY) > (leash + 300) ** 2)) {
      m.target = null;
    }
    if (!m.target) {
      let best = null;
      let bestD = def.aggro * def.aggro;
      for (const p of game.players.values()) {
        if (!p.alive || p.invulnT > 0 || p.invisT > 0) continue;
        const d = dist2(p.x, p.y, m.x, m.y);
        if (d < bestD) {
          bestD = d;
          best = p;
        }
      }
      if (best) m.target = best.id;
    }
  }

  const tgt = m.target ? game.players.get(m.target) : null;

  // 공격 준비 중 → 시간이 되면 공격
  if (m.state === MSTATE.windup) {
    if (tgt && m.type !== 'brute' && m.type !== 'elite' && m.type !== 'guardian') {
      m.aim = Math.atan2(tgt.y - m.y, tgt.x - m.x) * 0.2 + m.aim * 0.8;
    }
    if (m.stateT <= 0) {
      performMonsterAttack(game, m, def, tgt);
      m.state = MSTATE.recover;
      m.stateT = 0.35;
      m.atkT = def.atkCd * (0.85 + game.rng() * 0.3);
    }
    return;
  }
  if (m.state === MSTATE.recover) {
    if (m.stateT <= 0) m.state = MSTATE.idle;
    return;
  }

  let mx = 0;
  let my = 0;
  if (tgt) {
    const dx = tgt.x - m.x;
    const dy = tgt.y - m.y;
    const d = Math.sqrt(dx * dx + dy * dy) || 1;
    m.aim = Math.atan2(dy, dx);
    const reach = def.atkRange + tgt.r;
    if (m.type === 'archer') {
      if (d < def.keep) {
        mx = -dx / d;
        my = -dy / d;
      } else if (d > def.atkRange * 0.9) {
        mx = dx / d;
        my = dy / d;
      } else {
        // 옆으로 비틀거리며 이동
        const side = (m.id % 2 ? 1 : -1) * 0.6;
        mx = (-dy / d) * side;
        my = (dx / d) * side;
      }
      if (d < def.atkRange && m.atkT <= 0) startWindup(game, m, def, tgt);
    } else {
      if (d > reach * 0.8) {
        mx = dx / d;
        my = dy / d;
      }
      if (d < reach && m.atkT <= 0) startWindup(game, m, def, tgt);
    }
    // 캠프 몬스터·수호자는 자기 자리를 크게 벗어나지 않음 (롤 정글처럼 끌고 가면 돌아감)
    if (m.leash) {
      const hd2 = dist2(m.x, m.y, m.homeX, m.homeY);
      if (hd2 > m.leash * m.leash) {
        if (hd2 > (m.leash + 200) ** 2) m.target = 0;
        const hx = m.homeX - m.x;
        const hy = m.homeY - m.y;
        const hd = Math.sqrt(hd2);
        mx = hx / hd;
        my = hy / hd;
      }
      m.ringT -= dt;
      if (def.ringEvery && m.ringT <= 0 && d < 520) {
        m.ringT = def.ringEvery;
        guardianRing(game, m, def);
      }
    }
  } else {
    // 배회
    m.wanderT -= dt;
    if (m.wanderT <= 0) {
      m.wanderT = 1.5 + game.rng() * 2.5;
      const a = game.rng() * Math.PI * 2;
      const hd = Math.sqrt(dist2(m.x, m.y, m.homeX, m.homeY));
      if (hd > 220) {
        m.wanderA = Math.atan2(m.homeY - m.y, m.homeX - m.x);
      } else {
        m.wanderA = game.rng() < 0.4 ? null : a;
      }
    }
    if (m.wanderA != null) {
      mx = Math.cos(m.wanderA) * 0.4;
      my = Math.sin(m.wanderA) * 0.4;
      m.aim = m.wanderA;
    }
  }

  const speed = def.speed * game.slowMult(m);
  m.mx = mx;
  m.my = my;
  m.moveSpeed = speed;
  // 이번 틱에 공격 준비를 시작했으면 상태를 덮어쓰지 않음
  if (m.state !== MSTATE.windup) m.state = mx || my ? MSTATE.move : MSTATE.idle;
}

function startWindup(game, m, def, tgt) {
  m.state = MSTATE.windup;
  m.stateT = def.windup;
  if (m.type === 'brute' || m.type === 'elite' || m.type === 'guardian') {
    // 바닥 경고 표시 (플레이어가 보고 피할 수 있게)
    const a = Math.atan2(tgt.y - m.y, tgt.x - m.x);
    const off = m.type === 'guardian' ? 50 : 40;
    m.tele = game.addArea({
      kind: 'slam',
      x: m.x + Math.cos(a) * off,
      y: m.y + Math.sin(a) * off,
      r: def.slamR,
      delay: def.windup,
      dur: def.windup + 0.05,
      owner: m.id,
      team: -1,
      dmg: def.dmg * game.monsterDmgMult(),
      knock: 520,
    });
    m.aim = a;
  }
}

function performMonsterAttack(game, m, def, tgt) {
  if (m.type === 'shade') {
    // 앞쪽 짧은 할퀴기
    for (const p of game.players.values()) {
      if (!p.alive) continue;
      const dx = p.x - m.x;
      const dy = p.y - m.y;
      const d2 = dx * dx + dy * dy;
      const reach = def.atkRange + p.r + 6;
      if (d2 > reach * reach) continue;
      if (Math.abs(angleDiff(m.aim, Math.atan2(dy, dx))) > 1.2) continue;
      game.dealDamage(m, p, def.dmg * game.monsterDmgMult(), { kind: 'monster' });
      game.knock(p, m.x, m.y, 220);
    }
    game.emit({ e: 'mswing', id: m.id, x: m.x, y: m.y, a: m.aim });
  } else if (m.type === 'archer') {
    if (!tgt) return;
    game.spawnProj(m, {
      x: m.x,
      y: m.y,
      angle: m.aim,
      speed: def.projSpeed,
      range: 620,
      dmg: def.dmg * game.monsterDmgMult(),
      r: 8,
      pkind: 'bone',
      knock: 120,
    });
  }
  // brute/guardian은 slam 장판이 피해를 줌
  m.tele = null;
}

function guardianRing(game, m, def) {
  const n = 10;
  const off = game.rng() * Math.PI;
  for (let i = 0; i < n; i++) {
    const a = off + (i / n) * Math.PI * 2;
    game.spawnProj(m, {
      x: m.x,
      y: m.y,
      angle: a,
      speed: 360,
      range: 560,
      dmg: def.ringDmg * game.monsterDmgMult(),
      r: 10,
      pkind: 'orbshot',
      knock: 150,
    });
  }
  game.emit({ e: 'ring', x: m.x, y: m.y, id: m.id });
}
