// HUD: 체력/스킬, 생존 인원, 자기장, 미니맵, 킬피드, 증강(상자 뽑기 + 3택1), 착지 지도
import * as C from '../shared/constants.js';
import { WEAPONS, RARITIES, skillAt, GRADE_CD } from '../shared/items.js';
import { AUG_BY_ID, AUG_TIERS } from '../shared/augments.js';
import { IMG, lookOf } from './assets.js';

const $ = (id) => document.getElementById(id);

const SLOTS = [
  { k: 'basic', key: '우클릭' },
  { k: 'q', key: 'Q' },
  { k: 'w', key: 'W' },
  { k: 'e', key: 'E' },
  { k: 'r', key: 'R' },
  { k: 'd', key: 'D', spell: true },
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
    this.minimap = $('minimap');
    this.lastPrompt = '';
    this.offerId = 0;
    this.rollUntil = 0;
    this.buildSlots();
    $('landmap').addEventListener('mousedown', (e) => this.landClick(e));
  }

  buildSlots() {
    const wrap = $('skills');
    wrap.innerHTML = '';
    for (const s of SLOTS) {
      const d = document.createElement('div');
      d.className = `slot slot-${s.k}${s.spell ? ' spell' : ''}`;
      d.innerHTML = `<div class="slot-icon"></div><div class="slot-cd"></div><div class="slot-cdtext"></div><div class="slot-key">${s.key}</div><div class="slot-tip"><b></b><span></span></div>`;
      wrap.appendChild(d);
      this.slotEls[s.k] = d;
    }
  }

  reset(game) {
    this.game = game;
    this.uiVer = -1;
    this.offerId = 0;
    this.rollUntil = 0;
    this.faceOf = '';
    this.augKey = '';
    $('killfeed').innerHTML = '';
    $('announce').innerHTML = '';
    $('augs').innerHTML = '';
    ['deathscreen', 'spectate', 'offer', 'roll'].forEach((id) => $(id).classList.add('hidden'));
    this.el.classList.remove('hidden', 'dead');
  }

  hide() {
    this.el.classList.add('hidden');
  }

  // 직업·등급이 바뀌면 스킬 아이콘/설명 갱신
  refreshGear(ui) {
    const w = WEAPONS[ui.gear.weapon.type];
    const g = ui.grade || { q: 0, w: 0, e: 0 };
    const set = (k, icon, name, desc, color, grade = -1, extra = '') => {
      const el = this.slotEls[k];
      el.querySelector('.slot-icon').textContent = icon;
      el.querySelector('.slot-tip b').textContent = grade > 0 ? `${name} · ${RARITIES[grade].name} 강화` : name;
      el.querySelector('.slot-tip span').innerHTML = `${desc}${extra}`;
      el.style.setProperty('--slot-color', color);
      el.style.setProperty('--grade', grade >= 0 ? RARITIES[grade].color : 'transparent');
      el.classList.toggle('graded', grade >= 3);
    };
    set('basic', w.icon, w.basic.name, w.basic.desc + (w.passive ? `<i class="tip-up got" style="--rc:${w.color}">패시브 ${w.passive.name}: ${w.passive.desc}</i>` : ''), w.color);
    for (const k of ['q', 'w', 'e']) {
      const sk = skillAt(w, k, g[k]);
      let up = '';
      for (const lv of [3, 4]) {
        const u = w[k].up && w[k].up[lv];
        if (u) up += `<i class="tip-up${g[k] >= lv ? ' got' : ''}" style="--rc:${RARITIES[lv].color}">${lv === 3 ? '각성' : '초월'} 증강: ${u.upDesc}</i>`;
      }
      set(k, w[k].icon || k.toUpperCase(), w[k].name, `<em>${w[k].hint || ''}</em>${sk.desc} · ${Math.round(sk.cd * GRADE_CD[g[k]] * 10) / 10}초`, w.color, g[k], up);
    }
    set('d', '⤳', '구르기', `커서 방향으로 굴러 피함. ${C.ROLL.iframe}초 무적`, '#9fe8ff');
    set('r', w.r.icon || '★', w.r.name, `<em>${w.r.hint || ''}</em>${w.r.desc}`, '#ffd45a');
    // 내 증강 목록
    const key = ui.augs.join(',');
    if (key !== this.augKey) {
      this.augKey = key;
      $('augs').innerHTML = ui.augs
        .map((id) => {
          const a = AUG_BY_ID[id];
          if (!a) return '';
          const tc = AUG_TIERS[a.tier].color;
          return `<div class="aug-chip" style="--tc:${tc}"><i>${a.icon}</i>${a.name}<div class="tip">${a.desc}</div></div>`;
        })
        .join('');
    }
  }

  drawFace(game) {
    const w = this.game && this.game.ui ? this.game.ui.gear.weapon.type : 'greatsword';
    if (this.faceOf === w) return;
    const img = IMG[`faces/${lookOf(w).char}.png`];
    if (!img || !img.width) return;
    this.faceOf = w;
    const g = $('face').getContext('2d');
    g.imageSmoothingEnabled = false;
    g.clearRect(0, 0, 76, 76);
    g.drawImage(img, 0, 0, 76, 76);
  }

  update(game, v, dt) {
    if (v.landing) {
      this.updateLanding(game, v);
      return;
    }
    $('landing').classList.add('hidden');
    const me = game.me;
    if (!me) return;
    if (game.ui && game.ui.v !== this.uiVer) {
      this.uiVer = game.ui.v;
      this.refreshGear(game.ui);
      this.drawFace(game);
    }
    // 매 프레임: 쿨타임 (부드럽게)
    const cds = { q: [me.cd[0], me.cdm[0]], w: [me.cd[1], me.cdm[1]], e: [me.cd[2], me.cdm[2]], d: [me.cd[3], me.cdm[3]] };
    for (const [k, [cd, max]] of Object.entries(cds)) {
      const el = this.slotEls[k];
      el.style.setProperty('--cd', (cd > 0 && max > 0 ? cd / max : 0).toFixed(3));
      el.querySelector('.slot-cdtext').textContent = cd > 0 ? (cd < 1 ? cd.toFixed(1) : Math.ceil(cd)) : '';
    }
    const ultEl = this.slotEls.r;
    ultEl.style.setProperty('--cd', ((100 - me.ult) / 100).toFixed(3));
    ultEl.classList.toggle('ready', me.ult >= 100);
    ultEl.querySelector('.slot-cdtext').textContent = me.ult < 100 ? `${Math.floor(me.ult)}%` : '';
    this.updateOffer(game, me);

    this.acc += dt;
    if (this.acc < 0.08) return;
    this.acc = 0;

    const meP = v.players.find((p) => p.me);
    const shield = meP ? meP.shield : 0;
    $('hpfill').style.width = `${(100 * me.hp) / me.mhp}%`;
    $('shieldfill').style.width = `${Math.min(100, (100 * shield) / me.mhp)}%`;
    $('hptext').textContent = `${me.hp} / ${me.mhp}`;
    $('xpfill').style.width = me.lv >= C.LEVEL_MAX ? '100%' : `${(100 * me.xp) / me.xn}%`;
    $('lvtext').textContent = `LV ${me.lv}`;

    $('alive').textContent = `👤 ${v.alive} 생존`;
    $('mykills').textContent = `⚔ ${me.k}`;
    const z = v.zone;
    const zi = $('zoneinfo');
    if (z.stage === 'warn') {
      zi.textContent = `🌀 ${z.phase + 1}단계 · ${fmtTime(z.st)} 뒤 줄어듦`;
      zi.classList.add('warn');
    } else if (z.stage === 'shrink') {
      zi.textContent = `🌀 ${z.phase + 1}단계 줄어드는 중 ${fmtTime(z.st)}`;
      zi.classList.add('warn');
    } else {
      const next = C.ZONE_PHASES[z.phase + 1];
      zi.textContent = next ? `🌀 다음 자기장 ${fmtTime(next.at - v.serverTime)}` : '🌀 최종 자기장';
      zi.classList.remove('warn');
    }

    this.el.classList.toggle('dead', !me.al);
    // 관전 중
    const spec = $('spectate');
    if (!me.al && game.spectating) {
      spec.classList.remove('hidden');
      $('spec-name').textContent = me.sp ? game.nameOf(me.sp) : '-';
    } else spec.classList.add('hidden');

    this.updatePrompt(game, v);
    $('ping').textContent = game.t.local ? '연습 모드' : `${game.ping}ms`;
    $('ping').classList.toggle('bad', !game.t.local && game.ping > 200);
    this.r.drawMinimap(this.minimap, v);
  }

  updatePrompt(game, v) {
    const me = v.players.find((p) => p.me);
    const pr = $('prompt');
    let html = '';
    if (me) {
      let bd = 120 * 120;
      for (const c of v.chests) {
        if (c.open) continue;
        const d = (c.x - me.x) ** 2 + (c.y - me.y) ** 2;
        if (d < bd) {
          bd = d;
          const name = c.kind === 'bounty' ? '💰 현상금 주머니' : c.kind === 'big' ? '큰 상자' : '상자';
          html = `<kbd>우클릭</kbd> ${name} 열기<small>움직이면 끊김</small>`;
        }
      }
    }
    if (html !== this.lastPrompt) {
      this.lastPrompt = html;
      pr.innerHTML = html;
    }
    pr.classList.toggle('hidden', !html);
  }

  // ---------------- 상자 등급 뽑기 (슬롯머신) ----------------
  chestRoll(tier, kind) {
    const strip = $('reel-strip');
    const n = 26 + Math.floor(Math.random() * 4);
    const cells = [];
    for (let i = 0; i < n; i++) {
      // 앞쪽은 무작위, 끝 근처에 프리즘을 살짝 스쳐 지나가게 (아깝다!)
      let t = Math.random() < 0.55 ? 0 : Math.random() < 0.7 ? 1 : 2;
      if (i === n - 2) t = tier === 2 ? 1 : 2;
      if (i === n - 1) t = tier;
      if (i === n) t = tier === 2 ? 0 : 2;
      cells.push(t);
    }
    cells.push(tier === 2 ? 1 : 2);
    strip.innerHTML = cells.map((t) => `<div class="reel-cell t${t}">${AUG_TIERS[t].name}</div>`).join('');
    const roll = $('roll');
    roll.classList.remove('hidden', 'done');
    $('roll-title').textContent = kind === 'bounty' ? '💰 현상금 주머니!' : kind === 'big' ? '큰 상자 여는 중...' : '상자 여는 중...';
    $('roll-title').style.color = '#fff3d6';
    const target = (n - 1) * 100 - 100; // 마지막 칸이 가운데 표시 칸에 오게
    strip.style.transition = 'none';
    strip.style.transform = 'translateX(0)';
    void strip.offsetWidth;
    const dur = tier === 2 ? 1.6 : 1.1;
    strip.style.transition = `transform ${dur}s cubic-bezier(.12,.75,.18,1)`;
    strip.style.transform = `translateX(${-target}px)`;
    this.rollUntil = performance.now() + dur * 1000 + 250;
    clearTimeout(this.rollTimer);
    this.rollTimer = setTimeout(() => {
      roll.classList.add('done');
      $('roll-title').textContent = `${AUG_TIERS[tier].name} 등급!`;
      $('roll-title').style.color = AUG_TIERS[tier].color;
      if (tier === 2) this.r.shake(10);
    }, dur * 1000);
    clearTimeout(this.rollHide);
    this.rollHide = setTimeout(() => roll.classList.add('hidden'), dur * 1000 + 900);
  }

  // ---------------- 증강 3택1 ----------------
  updateOffer(game, me) {
    const box = $('offer');
    const of = me.al ? me.of : null;
    if (!of || performance.now() < this.rollUntil) {
      if (!of) this.offerId = 0;
      box.classList.add('hidden');
      return;
    }
    if (of.id !== this.offerId) {
      this.offerId = of.id;
      const tc = AUG_TIERS[of.r];
      $('offer-title').innerHTML = `<span style="color:${tc.color}">${tc.name}</span> 증강 선택${of.n > 1 ? ` <small>(+${of.n - 1}개 대기)</small>` : ''}`;
      const cards = $('offer-cards');
      cards.innerHTML = '';
      of.ids.forEach((id, i) => {
        const a = AUG_BY_ID[id];
        const c = document.createElement('div');
        c.className = `acard t${a.tier}`;
        c.style.setProperty('--tc', AUG_TIERS[a.tier].color);
        c.innerHTML = `<kbd class="ak">${i + 1}</kbd><div class="ai">${a.icon}</div><div class="an">${a.name}</div><div class="ad">${a.desc}</div>`;
        c.onmousedown = (e) => {
          e.stopPropagation();
          this.pick(game, i + 1);
        };
        cards.appendChild(c);
      });
    }
    box.classList.remove('hidden');
    $('roll').classList.add('hidden');
    $('offer-bar').style.width = `${Math.max(0, (100 * of.t) / C.OFFER_TIME)}%`;
  }

  pick(game, i) {
    if (!game.pickAugment(i)) return false;
    const cards = $('offer-cards').children;
    for (let k = 0; k < cards.length; k++) cards[k].classList.toggle('picked', k === i - 1);
    return true;
  }

  // ---------------- 착지 지도 ----------------
  updateLanding(game, v) {
    $('landing').classList.remove('hidden');
    $('land-timer').textContent = Math.max(0, Math.ceil(v.landing.t));
    const mc = $('landmap');
    this.r.drawMinimap(mc, v, { pois: true });
    const L = v.landing;
    if (L.chosen) {
      const g = mc.getContext('2d');
      const S = mc.width;
      const k = (S / 2 - 4) / (v.map.R + 120);
      const x = S / 2 + L.lx * k;
      const y = S / 2 + L.ly * k;
      const b = Math.sin(v.time * 6) * 3;
      g.fillStyle = 'rgba(0,0,0,0.35)';
      g.beginPath();
      g.ellipse(x, y + 2, 8, 3, 0, 0, Math.PI * 2);
      g.fill();
      g.fillStyle = '#ff4d5e';
      g.strokeStyle = '#2a1a10';
      g.lineWidth = 2;
      g.beginPath();
      g.moveTo(x, y);
      g.lineTo(x - 8, y - 14 + b);
      g.arc(x, y - 18 + b, 9, Math.PI * 0.8, Math.PI * 0.2);
      g.closePath();
      g.fill();
      g.stroke();
      g.fillStyle = '#fff';
      g.beginPath();
      g.arc(x, y - 18 + b, 3.5, 0, Math.PI * 2);
      g.fill();
    }
  }

  landClick(e) {
    const game = this.game;
    if (!game || !game.landing) return;
    const mc = $('landmap');
    const rect = mc.getBoundingClientRect();
    const S = mc.width;
    const px = ((e.clientX - rect.left) / rect.width) * S;
    const py = ((e.clientY - rect.top) / rect.height) * S;
    const k = (S / 2 - 4) / (game.map.R + 120);
    game.chooseLanding((px - S / 2) / k, (py - S / 2) / k);
  }

  killfeed(game, e) {
    const k = e.k ? game.nameOf(e.k) : '';
    const vname = game.nameOf(e.v);
    const el = document.createElement('div');
    el.className = 'kf';
    if (e.k === game.meId || e.v === game.meId) el.classList.add('mine');
    el.innerHTML = k ? `<b>${escapeHtml(k)}</b> <span>⚔</span> ${escapeHtml(vname)}` : `${escapeHtml(vname)} <span>${e.z ? '🌀 자기장' : '☠'}</span>`;
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
