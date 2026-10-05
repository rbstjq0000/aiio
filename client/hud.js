// HUD: 체력/경험치, 스킬 쿨타임, 장비, 미니맵, 킬피드, 오브 현황, 알림
import * as C from '../shared/constants.js';
import { WEAPONS, ARMORS, BOOTS, RARITIES, ORBS, itemDef, itemName, KIND_NAMES } from '../shared/items.js';

const $ = (id) => document.getElementById(id);

const SLOTS = [
  { k: 'basic', key: '좌클릭' },
  { k: 's1', key: '우클릭' },
  { k: 's2', key: 'Q' },
  { k: 'ult', key: 'R' },
  { k: 'e', key: 'E' },
  { k: 'space', key: 'Space' },
];

function fmtTime(s) {
  s = Math.max(0, Math.ceil(s));
  return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}`;
}

export class Hud {
  constructor(renderer) {
    this.r = renderer;
    this.el = $('hud');
    this.slotEls = {};
    this.uiVer = -1;
    this.acc = 0;
    this.announceT = 0;
    this.feed = [];
    this.minimap = $('minimap');
    this.lastPrompt = '';
    this.buildSlots();
  }

  buildSlots() {
    const wrap = $('skills');
    wrap.innerHTML = '';
    for (const s of SLOTS) {
      const d = document.createElement('div');
      d.className = `slot slot-${s.k}`;
      d.innerHTML = `<div class="slot-icon"></div><div class="slot-cd"></div><div class="slot-cdtext"></div><div class="slot-key">${s.key}</div><div class="slot-tip"><b></b><span></span></div>`;
      wrap.appendChild(d);
      this.slotEls[s.k] = d;
    }
  }

  reset(game) {
    this.uiVer = -1;
    this.feed = [];
    $('killfeed').innerHTML = '';
    $('announce').innerHTML = '';
    $('deathscreen').classList.add('hidden');
    this.el.classList.remove('hidden');
  }

  hide() {
    this.el.classList.add('hidden');
  }

  // 장비가 바뀌면 스킬 아이콘/설명 갱신
  refreshGear(ui) {
    const w = WEAPONS[ui.gear.weapon.type];
    const a = ARMORS[ui.gear.armor.type];
    const b = BOOTS[ui.gear.boots.type];
    const set = (k, icon, name, desc, color) => {
      const el = this.slotEls[k];
      el.querySelector('.slot-icon').textContent = icon;
      el.querySelector('.slot-tip b').textContent = name;
      el.querySelector('.slot-tip span').textContent = desc;
      el.style.setProperty('--slot-color', color);
    };
    set('basic', w.icon, w.basic.name, w.basic.desc, w.color);
    set('s1', '✦', w.s1.name, `${w.s1.desc} · ${w.s1.cd}초`, w.color);
    set('s2', '✧', w.s2.name, `${w.s2.desc} · ${w.s2.cd}초`, w.color);
    set('ult', '★', w.ult.name, w.ult.desc, '#ffd45a');
    set('e', a.icon, a.skill.name, `${a.skill.desc} · ${a.skill.cd}초`, '#9fe8ff');
    set('space', b.icon, b.skill.name, `${b.skill.desc} · ${b.skill.cd}초`, '#ffe9a8');
    const gear = $('gear');
    gear.innerHTML = '';
    for (const kind of ['weapon', 'armor', 'boots']) {
      const it = ui.gear[kind];
      const d = itemDef(it);
      const rc = RARITIES[it.rarity];
      const el = document.createElement('div');
      el.className = 'gear-item';
      el.style.setProperty('--rc', rc.color);
      el.innerHTML = `<span class="gi-icon">${d.icon}</span><span class="gi-text"><small>${KIND_NAMES[kind]}</small>${rc.name} ${d.name}</span>`;
      gear.appendChild(el);
    }
  }

  update(game, v, dt) {
    const me = game.me;
    if (!me) return;
    if (game.ui && game.ui.v !== this.uiVer) {
      this.uiVer = game.ui.v;
      this.refreshGear(game.ui);
    }
    // 매 프레임: 쿨타임 오버레이 (부드럽게)
    const cds = { s1: [me.cd[0], me.cdm[0]], s2: [me.cd[1], me.cdm[1]], e: [me.cd[2], me.cdm[2]], space: [me.cd[3], me.cdm[3]] };
    for (const [k, [cd, max]] of Object.entries(cds)) {
      const el = this.slotEls[k];
      const frac = cd > 0 && max > 0 ? cd / max : 0;
      el.style.setProperty('--cd', frac.toFixed(3));
      el.classList.toggle('cooling', cd > 0);
      el.querySelector('.slot-cdtext').textContent = cd > 0 ? (cd < 1 ? cd.toFixed(1) : Math.ceil(cd)) : '';
    }
    const ultEl = this.slotEls.ult;
    ultEl.style.setProperty('--cd', ((100 - me.ult) / 100).toFixed(3));
    ultEl.classList.toggle('cooling', me.ult < 100);
    ultEl.classList.toggle('ready', me.ult >= 100);
    ultEl.querySelector('.slot-cdtext').textContent = me.ult < 100 ? `${Math.floor(me.ult)}%` : '';

    this.acc += dt;
    if (this.acc < 0.08) return;
    this.acc = 0;

    // 체력 / 보호막 / 경험치
    const meP = v.players.find((p) => p.me);
    const shield = meP ? meP.shield : 0;
    $('hpfill').style.width = `${(100 * me.hp) / me.mhp}%`;
    $('shieldfill').style.width = `${Math.min(100, (100 * shield) / me.mhp)}%`;
    $('hptext').textContent = `${me.hp} / ${me.mhp}`;
    $('xpfill').style.width = me.lv >= C.LEVEL_MAX ? '100%' : `${(100 * me.xp) / me.xn}%`;
    $('lvtext').textContent = `Lv.${me.lv}`;

    // 시간 / 단계
    const t = v.serverTime;
    $('timer').textContent = fmtTime(C.MATCH_TIME - t);
    let phase = '';
    const next = C.ORB_TIMES.find((x) => x > t);
    if (next) phase = `다음 오브 ${fmtTime(next - t)}`;
    else if (t < C.ZONE_START) phase = `스틱스 강 범람 ${fmtTime(C.ZONE_START - t)}`;
    else phase = '스틱스 강 범람 중';
    $('phase').textContent = phase;
    $('orbstatus').innerHTML = v.altars
      .map((al) => {
        const o = ORBS[al.i];
        const label = { idle: '대기', warn: '곧 등장', guarded: `수호자 ${al.ghp}%`, dropped: '바닥', taken: '보유 중' }[al.state];
        return `<span class="orb-pill" style="--oc:${o.color}"><i></i>${label}</span>`;
      })
      .join('');

    // 내 점수
    $('mystats').innerHTML = `<b>${me.k}</b> 처치 · <b>${me.d}</b> 사망 · 오브 점수 <b class="gold">${me.os}</b>`;
    const sc = v.scores || [];
    $('leader').innerHTML = sc.length
      ? `<div class="lb-title">오브 점수 순위</div>${sc.map((s, i) => `<div class="lb-row${s[0] === game.meId ? ' me' : ''}"><span>${i + 1}. ${escapeHtml(game.nameOf(s[0]))}</span><b>${s[1]}</b></div>`).join('')}`
      : '<div class="lb-title">오브를 들고 있으면 점수가 쌓입니다</div>';

    // 내가 오브 보유 / 승천 의식
    const rt = $('ritual');
    if (me.rt >= 0) {
      rt.classList.remove('hidden');
      rt.textContent = `승천까지 ${me.rt.toFixed(1)}초 — 버티세요!`;
    } else if (me.ob.length) {
      rt.classList.remove('hidden');
      rt.innerHTML = `오브 ${me.ob.length}/3 보유 중 · 위치가 공개됩니다 · ${me.ob.map((i) => `<span style="color:${ORBS[i].color}">●</span>`).join('')}`;
    } else rt.classList.add('hidden');

    // 사망 화면
    const ds = $('deathscreen');
    if (!me.al) {
      ds.classList.remove('hidden');
      $('death-timer').textContent = me.rs.toFixed(1);
      const spec = me.sp ? game.nameOf(me.sp) : '';
      $('death-spec').textContent = spec ? `관전 중: ${spec}` : '';
    } else ds.classList.add('hidden');

    // 상호작용 안내 (F)
    this.updatePrompt(game, v);

    $('ping').textContent = game.t.local ? '연습 모드' : `${game.ping}ms`;
    $('ping').classList.toggle('bad', !game.t.local && game.ping > 200);

    this.r.drawMinimap(this.minimap, v);
  }

  updatePrompt(game, v) {
    const me = v.players.find((p) => p.me);
    const pr = $('prompt');
    if (!me || !game.ui) {
      pr.classList.add('hidden');
      return;
    }
    let best = null;
    let bd = C.INTERACT_RANGE * C.INTERACT_RANGE;
    for (const it of v.items) {
      const d = (it.x - me.x) ** 2 + (it.y - me.y) ** 2;
      if (d < bd) {
        bd = d;
        best = it;
      }
    }
    let html = '';
    if (best) {
      const cur = game.ui.gear[best.kind];
      const rc = RARITIES[best.rarity];
      const better = best.rarity > cur.rarity ? '<em class="up">▲</em>' : best.rarity < cur.rarity ? '<em class="down">▼</em>' : '';
      html = `<kbd>F</kbd> 장착: <b style="color:${rc.color}">${rc.name} ${best.name}</b> ${better}<small>현재: ${itemName(cur)}</small>`;
      if (best.kind === 'weapon' && best.type !== cur.type) html += `<small>무기가 바뀌면 스킬 구성이 바뀝니다</small>`;
    } else {
      for (const c of v.chests) {
        if (c.open) continue;
        const d = (c.x - me.x) ** 2 + (c.y - me.y) ** 2;
        if (d < bd) {
          bd = d;
          html = '<kbd>F</kbd> 상자 열기 <small>1초 동안 멈춰 있어야 함 · 맞으면 끊김</small>';
        }
      }
    }
    if (html !== this.lastPrompt) {
      this.lastPrompt = html;
      pr.innerHTML = html;
    }
    pr.classList.toggle('hidden', !html);
  }

  killfeed(game, e) {
    const k = e.k ? game.nameOf(e.k) : '';
    const vname = game.nameOf(e.v);
    const el = document.createElement('div');
    el.className = 'kf';
    if (e.k === game.meId || e.v === game.meId) el.classList.add('mine');
    el.innerHTML = k ? `<b>${escapeHtml(k)}</b> <span>⚔</span> ${escapeHtml(vname)}` : `${escapeHtml(vname)} <span>${e.z ? '☠ 스틱스 강' : '☠'}</span>`;
    const box = $('killfeed');
    box.prepend(el);
    while (box.children.length > 6) box.lastChild.remove();
    setTimeout(() => el.classList.add('fade'), 5000);
    setTimeout(() => el.remove(), 6000);
  }

  announce(text, color = '#fff', dur = 2) {
    const box = $('announce');
    const el = document.createElement('div');
    el.className = 'ann';
    el.style.color = color;
    el.textContent = text;
    box.appendChild(el);
    while (box.children.length > 3) box.firstChild.remove();
    setTimeout(() => el.classList.add('fade'), dur * 1000);
    setTimeout(() => el.remove(), dur * 1000 + 600);
  }
}

export function escapeHtml(s) {
  return String(s).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]);
}
