// HUD: 무기(등급)·체력·강화석·스킬, 증강 3칸(세트), 증강 카드(교체·건너뛰기), 상자 뽑기, 미니맵, 킬피드, 착지 지도
import * as C from '../shared/constants.js';
import { WEAPONS, RARITIES, STONE_COST, MYTHIC, TIER_SLOT, skillInfo, canTake } from '../shared/items.js';
import { AUG_BY_ID, AUG_TIERS, AUG_SLOTS, FAMILIES, FAMILY_BY_ID, augDesc } from '../shared/augments.js';
import { IMG, faceOf } from './assets.js';

const $ = (id) => document.getElementById(id);

const SLOTS = [
  { k: 'basic', key: '우클릭' },
  { k: 'q', key: 'Q' },
  { k: 'w', key: 'W' },
  { k: 'e', key: 'E' },
  { k: 'r', key: 'R' },
  { k: 'd', key: 'D', spell: true },
];
const SLOT_NAME = { basic: '평타', q: 'Q', w: 'W', e: 'E', r: 'R' };

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
    this.pendingPick = 0;
    this.buildSlots();
    $('offer-skip').addEventListener('mousedown', (e) => {
      e.stopPropagation();
      if (this.game) this.pick(this.game, 4);
    });
    $('rep-cancel').addEventListener('mousedown', (e) => {
      e.stopPropagation();
      this.cancelReplace();
    });
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
    this.pendingPick = 0;
    this.faceKey = '';
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

  // 무기·등급·증강이 바뀌면 다시 그림
  refreshGear(game, ui) {
    const wp = ui.gear.weapon;
    const w = WEAPONS[wp.type];
    const g = wp.rarity;
    const rc = RARITIES[g];
    const set = (k, icon, name, desc, color, extra = '') => {
      const el = this.slotEls[k];
      el.querySelector('.slot-icon').textContent = icon;
      el.querySelector('.slot-tip b').textContent = name;
      el.querySelector('.slot-tip span').innerHTML = `${desc}${extra}`;
      el.style.setProperty('--slot-color', color);
    };
    // 등급 효과: 그 칸이 강화되는 등급 표시
    const tierNote = (k) => {
      const lv = TIER_SLOT.indexOf(k);
      if (lv < 1) return '';
      const t = w.tiers[lv];
      return `<i class="tip-up${g >= lv ? ' got' : ''}" style="--rc:${RARITIES[lv].color}">${RARITIES[lv].name}: ${t.desc}</i>`;
    };
    const basic = skillInfo(w, 'basic', g);
    set('basic', w.icon, `${w.basic.name}`, `${basic.desc}${w.passive ? `<br>패시브 ${w.passive.name}: ${w.passive.desc}` : ''}`, w.color, tierNote('basic'));
    for (const k of ['q', 'w', 'e', 'r']) {
      const sk = skillInfo(w, k, g);
      const cd = sk.cd ? ` · ${Math.round(sk.cd * (game.me ? 1 : 1) * 10) / 10}초` : ' · 게이지 100%';
      set(k, w[k].icon || k.toUpperCase(), `${k.toUpperCase()} ${w[k].name}`, `<em>${w[k].hint || ''}</em>${sk.desc}${cd}`, k === 'r' ? '#ffd45a' : w.color, tierNote(k));
    }
    set('d', '⤳', '구르기', `커서 방향으로 굴러 피함. ${C.ROLL.iframe}초 무적`, '#9fe8ff');
    // 무기 배지
    $('wb-name').innerHTML = `<b style="color:${rc.color}">${rc.name}</b> ${w.icon} ${w.name}`;
    $('weapon').style.setProperty('--rc', rc.color);
    const beats = WEAPONS[w.beats];
    const lost = Object.values(WEAPONS).find((x) => x.beats === w.id);
    $('weapon-tip').innerHTML = `<b style="color:${w.color}">${w.icon} ${w.name}</b> · ${w.role}<br><span class="good">강함 → ${beats.icon} ${beats.name} (피해 +${Math.round(C.COUNTER_BONUS * 100)}%)</span> · <span class="bad">약함 ← ${lost.icon} ${lost.name}</span><br>무기 공명: ${FAMILY_BY_ID[w.family].icon} ${FAMILY_BY_ID[w.family].name} 증강 세트 +1${w.tiers
      .map((t, i) => (t ? `<i class="tip-up${g >= i ? ' got' : ''}" style="--rc:${RARITIES[i].color}">${RARITIES[i].name} (${SLOT_NAME[TIER_SLOT[i]]}): ${t.desc}</i>` : ''))
      .join('')}`;
    // 얼굴 (스킨)
    const cos = game.roster.get(game.meId) && game.roster.get(game.meId).cos;
    const fk = `${faceOf(cos)}|${g}`;
    if (fk !== this.faceKey) {
      const img = IMG[faceOf(cos)];
      if (img && img.width) {
        this.faceKey = fk;
        const c = $('face').getContext('2d');
        c.imageSmoothingEnabled = false;
        c.clearRect(0, 0, 76, 76);
        c.drawImage(img, 0, 0, 76, 76);
      }
    }
    // 증강 3칸 + 세트 진행
    const key = JSON.stringify([ui.augs, ui.fam, wp.type]);
    if (key !== this.augKey) {
      this.augKey = key;
      let html = '';
      for (let i = 0; i < AUG_SLOTS; i++) {
        const gA = ui.augs[i];
        const a = gA && AUG_BY_ID[gA.id];
        if (!a) {
          html += `<div class="aug-chip empty"><i>＋</i>빈 칸<div class="tip">적을 처치하거나 에픽 몬스터 보물을 열면 증강을 얻습니다</div></div>`;
          continue;
        }
        const f = FAMILY_BY_ID[a.fam];
        html += `<div class="aug-chip" style="--tc:${AUG_TIERS[gA.tier].color};--fc:${f.color}"><i>${a.icon}</i>${a.name}<span class="fam">${f.icon}</span><div class="tip"><b style="color:${AUG_TIERS[gA.tier].color}">${AUG_TIERS[gA.tier].name}</b> · ${f.icon} ${f.name}<br>${augDesc(gA.id, gA.tier)}</div></div>`;
      }
      // 켜진(또는 가까운) 세트
      const sets = FAMILIES.filter((f) => (ui.fam[f.id] || 0) >= 1)
        .map((f) => {
          const n = ui.fam[f.id];
          const on2 = n >= 2;
          const on3 = n >= 3;
          return `<div class="set-row${on2 ? ' on' : ''}" style="--fc:${f.color}"><span>${f.icon} ${f.name} ${Math.min(3, n)}/3</span><div class="tip"><i class="${on2 ? 'got' : ''}">2세트: ${f.set2}</i><i class="${on3 ? 'got' : ''}">3세트: ${f.set3}</i>${f.id === w.family ? '<i>무기 공명 +1 포함</i>' : ''}</div></div>`;
        })
        .join('');
      $('augs').innerHTML = html + sets;
    }
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
      this.refreshGear(game, game.ui);
    }
    // 매 프레임: 쿨타임 (부드럽게)
    const cds = { q: [me.cd[0], me.cdm[0]], w: [me.cd[1], me.cdm[1]], e: [me.cd[2], me.cdm[2]] };
    for (const [k, [cd, max]] of Object.entries(cds)) {
      const el = this.slotEls[k];
      el.style.setProperty('--cd', (cd > 0 && max > 0 ? cd / max : 0).toFixed(3));
      el.querySelector('.slot-cdtext').textContent = cd > 0 ? (cd < 1 ? cd.toFixed(1) : Math.ceil(cd)) : '';
    }
    // 구르기: 충전 수
    const d = this.slotEls.d;
    const rl = me.rl ?? 1;
    d.style.setProperty('--cd', (rl <= 0 && me.cdm[3] > 0 ? me.cd[3] / me.cdm[3] : 0).toFixed(3));
    d.querySelector('.slot-cdtext').textContent = rl <= 0 ? Math.ceil(me.cd[3]) : rl > 1 ? `×${rl}` : '';
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
    const rar = game.ui ? game.ui.gear.weapon.rarity : 0;
    const cost = STONE_COST[rar];
    if (rar >= MYTHIC - 1 || !cost) {
      $('stonefill').style.width = '100%';
      $('stonetext').textContent = `💎 ${me.sn ?? 0} · 강화 최대`;
    } else {
      $('stonefill').style.width = `${Math.min(100, (100 * (me.sn || 0)) / cost)}%`;
      $('stonetext').textContent = `💎 ${me.sn || 0} / ${cost} → ${RARITIES[rar + 1].name}`;
    }

    $('alive').textContent = `👤 ${v.alive} 생존`;
    $('mykills').textContent = `⚔ ${me.k}${me.as ? ` · 🤝${me.as}` : ''}`;
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
    this.el.classList.toggle('calm', !!me.calm && me.al);
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
    if (me && game.ui) {
      let bd = 120 * 120;
      const cur = game.ui.gear.weapon;
      for (const g of v.items) {
        const d = (g.x - me.x) ** 2 + (g.y - me.y) ** 2;
        if (d >= bd) continue;
        bd = d;
        const rc = RARITIES[g.rarity];
        const ok = canTake(cur, g);
        const how = g.type !== cur.type ? '바꿔 들기' : '등급 올리기';
        html = ok ? `<kbd>우클릭</kbd> <b style="color:${rc.color}">${rc.name} ${WEAPONS[g.type].icon} ${WEAPONS[g.type].name}</b> ${how}<small>지금: ${RARITIES[cur.rarity].name} ${WEAPONS[cur.type].name}</small>` : `<b style="color:${rc.color}">${rc.name} ${WEAPONS[g.type].name}</b><small>이미 같거나 더 좋은 무기</small>`;
      }
      for (const c of v.chests) {
        if (c.open) continue;
        const d = (c.x - me.x) ** 2 + (c.y - me.y) ** 2;
        if (d >= bd) continue;
        bd = d;
        const name = { bounty: '💰 현상금 주머니', big: '큰 상자', epic: '💜 에픽 보물', titan: '💖 대텐구의 보물', small: '상자' }[c.kind];
        html = c.locked ? `🔒 ${name}<small>캠프 몬스터를 다 잡으면 열려요</small>` : `<kbd>우클릭</kbd> ${name} 열기<small>${c.kind === 'epic' || c.kind === 'titan' ? '3초 · 맞으면 끊김' : '움직이거나 맞으면 끊김'}</small>`;
      }
    }
    if (html !== this.lastPrompt) {
      this.lastPrompt = html;
      pr.innerHTML = html;
    }
    pr.classList.toggle('hidden', !html);
  }

  // ---------------- 상자 등급 뽑기 (슬롯머신) ----------------
  // 무기 상자: 일반~전설 / 에픽 보물: 실버·골드·프리즘
  chestRoll(tier, kind, isAug, wtype) {
    const names = isAug ? AUG_TIERS.map((t) => t.name) : RARITIES.map((t) => t.name);
    const top = isAug ? 2 : 4;
    const strip = $('reel-strip');
    const n = 26 + Math.floor(Math.random() * 4);
    const cells = [];
    for (let i = 0; i < n; i++) {
      // 앞쪽은 무작위, 바로 옆 칸에 더 좋은 등급이 스쳐 지나가게 (아깝다!)
      let t = Math.floor(Math.random() * (top + 1) * Math.random());
      if (i === n - 2) t = Math.min(top, tier + 1);
      if (i === n - 1) t = tier;
      cells.push(t);
    }
    cells.push(Math.min(top, tier + 1));
    const cls = (t) => (isAug ? `a${t}` : `r${t}`);
    strip.innerHTML = cells.map((t) => `<div class="reel-cell ${cls(t)}">${names[t]}</div>`).join('');
    const roll = $('roll');
    roll.classList.remove('hidden', 'done');
    $('roll-title').textContent = { bounty: '💰 현상금 주머니!', big: '큰 상자 여는 중...', epic: '💜 에픽 보물!', titan: '💖 대텐구의 보물!', small: '상자 여는 중...' }[kind] || '상자 여는 중...';
    $('roll-title').style.color = '#fff3d6';
    const target = (n - 1) * 100 - 100; // 마지막 칸이 가운데 표시 칸에 오게
    strip.style.transition = 'none';
    strip.style.transform = 'translateX(0)';
    void strip.offsetWidth;
    const great = isAug ? tier === 2 : tier >= 3;
    const dur = great ? 1.6 : 1.1;
    strip.style.transition = `transform ${dur}s cubic-bezier(.12,.75,.18,1)`;
    strip.style.transform = `translateX(${-target}px)`;
    this.rollUntil = performance.now() + dur * 1000 + 250;
    clearTimeout(this.rollTimer);
    this.rollTimer = setTimeout(() => {
      roll.classList.add('done');
      const col = isAug ? AUG_TIERS[tier].color : RARITIES[tier].color;
      $('roll-title').textContent = isAug ? `${names[tier]} 증강!` : `${names[tier]} ${WEAPONS[wtype].icon} ${WEAPONS[wtype].name}!`;
      $('roll-title').style.color = col;
      if (great) this.r.shake(10);
    }, dur * 1000);
    clearTimeout(this.rollHide);
    this.rollHide = setTimeout(() => roll.classList.add('hidden'), dur * 1000 + 900);
  }

  // ---------------- 증강 3택1 (+ 칸이 꽉 차면 교체) ----------------
  updateOffer(game, me) {
    const box = $('offer');
    const of = me.al ? me.of : null;
    if (!of || performance.now() < this.rollUntil) {
      if (!of) {
        this.offerId = 0;
        this.pendingPick = 0;
      }
      box.classList.add('hidden');
      return;
    }
    if (of.id !== this.offerId) {
      this.offerId = of.id;
      this.pendingPick = 0;
      $('offer-replace').classList.add('hidden');
      const title = { kill: '⚔ 처치 보상', epic: '💜 에픽 보물', titan: '💖 대텐구의 보물' }[of.k] || '증강';
      $('offer-title').innerHTML = `${title} — 증강 선택${of.n > 1 ? ` <small>(+${of.n - 1}개 대기)</small>` : ''}`;
      const owned = game.ui ? game.ui.augs : [];
      const fam = game.ui ? game.ui.fam : {};
      const cards = $('offer-cards');
      cards.innerHTML = '';
      of.c.forEach((card, i) => {
        const a = AUG_BY_ID[card.id];
        const f = FAMILY_BY_ID[a.fam];
        const tc = AUG_TIERS[card.tier];
        const have = owned.find((g) => g.id === card.id);
        const n = (fam[a.fam] || 0) + (have ? 0 : 1);
        const tag = have ? '<span class="tag up">등급 올리기</span>' : n >= 2 ? `<span class="tag set">${f.icon} ${Math.min(3, n)}세트!</span>` : '';
        const el = document.createElement('div');
        el.className = `acard t${card.tier}`;
        el.style.setProperty('--tc', tc.color);
        el.style.setProperty('--fc', f.color);
        el.innerHTML = `<kbd class="ak">${i + 1}</kbd>${card.stolen ? '<span class="stolen">빼앗기</span>' : ''}<div class="ai">${a.icon}</div><div class="an">${a.name}</div><div class="af">${f.icon} ${f.name} · ${tc.name}</div><div class="as">${a.short}</div><div class="ad">${augDesc(card.id, card.tier)}</div>${tag}`;
        el.onmousedown = (e) => {
          e.stopPropagation();
          this.pick(game, i + 1);
        };
        cards.appendChild(el);
      });
    }
    box.classList.remove('hidden');
    $('roll').classList.add('hidden');
  }

  // 카드 고르기. 칸이 꽉 찼으면 바꿀 칸을 먼저 고르게 함
  pick(game, i) {
    const of = game.me && game.me.of;
    if (!of) return false;
    if (this.pendingPick) {
      // 교체 단계: 숫자 = 바꿀 칸
      if (i >= 1 && i <= AUG_SLOTS) {
        game.pickAugment(this.pendingPick, i);
        this.pendingPick = 0;
        $('offer-replace').classList.add('hidden');
      }
      return true;
    }
    if (i === 4) return game.pickAugment(4);
    if (i < 1 || i > of.c.length) return false;
    const owned = game.ui ? game.ui.augs : [];
    const card = of.c[i - 1];
    const cards = $('offer-cards').children;
    for (let k = 0; k < cards.length; k++) cards[k].classList.toggle('picked', k === i - 1);
    if (owned.length >= AUG_SLOTS && !owned.some((g) => g.id === card.id)) {
      this.pendingPick = i;
      const box = $('rep-slots');
      box.innerHTML = '';
      owned.forEach((g, k) => {
        const a = AUG_BY_ID[g.id];
        const b = document.createElement('button');
        b.className = 'rep-btn';
        b.style.setProperty('--tc', AUG_TIERS[g.tier].color);
        b.innerHTML = `<kbd>${k + 1}</kbd> ${a.icon} ${a.name} <small>${FAMILY_BY_ID[a.fam].icon}</small>`;
        b.onmousedown = (e) => {
          e.stopPropagation();
          this.pick(game, k + 1);
        };
        box.appendChild(b);
      });
      $('offer-replace').classList.remove('hidden');
      return true;
    }
    return game.pickAugment(i);
  }

  cancelReplace() {
    this.pendingPick = 0;
    $('offer-replace').classList.add('hidden');
    const cards = $('offer-cards').children;
    for (let k = 0; k < cards.length; k++) cards[k].classList.remove('picked');
  }

  // ---------------- 착지 지도 ----------------
  updateLanding(game, v) {
    $('landing').classList.remove('hidden');
    $('land-timer').textContent = Math.max(0, Math.ceil(v.landing.t));
    const mc = $('landmap');
    this.r.drawMinimap(mc, v, { pois: true, timers: false });
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
