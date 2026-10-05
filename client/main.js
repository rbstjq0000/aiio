// 진입점: 메뉴 / 상점 / 로비 / 게임 / 결과 화면 연결
import { WEAPONS, WEAPON_IDS, RARITIES, SPELLS, SPELL_IDS, DEFAULT_SPELLS } from '../shared/items.js';
import { COSMETICS, COSMETIC_MAP, COSMETIC_TYPES, RARITY_LABEL, RARITY_COLOR } from '../shared/cosmetics.js';
import { MAX_PLAYERS } from '../shared/constants.js';
import { Renderer } from './render.js';
import { Input } from './input.js';
import { Hud, escapeHtml } from './hud.js';
import { GameClient } from './game.js';
import { WSTransport, LocalTransport } from './net.js';
import { Profile, STREAK_REWARDS, GEM_PACKS } from './profile.js';
import { play, unlockAudio, setVolume } from './audio.js';

const $ = (id) => document.getElementById(id);
const STANDALONE = !!window.__STYX_STANDALONE__ || location.protocol === 'file:';
const ADS_ENABLED = new URLSearchParams(location.search).has('ads');

const profile = new Profile();
const canvas = $('game');
const renderer = new Renderer(canvas);
const input = new Input(canvas);
const hud = new Hud(renderer);
let client = null;
let transport = null;
let lastMode = null;
let lastEnd = null;

setVolume(profile.d.settings.volume);
renderer.settings.shake = profile.d.settings.shake;

// ---------------- 공통 ----------------
function toast(msg, ms = 2600) {
  const el = document.createElement('div');
  el.textContent = msg;
  $('toast').appendChild(el);
  setTimeout(() => el.remove(), ms);
}

function openModal(id) {
  $(id).classList.remove('hidden');
  play('ui');
}

function closeModal(id) {
  $(id).classList.add('hidden');
}

document.querySelectorAll('[data-close]').forEach((b) => b.addEventListener('click', () => closeModal(b.dataset.close)));
document.querySelectorAll('.overlay').forEach((o) =>
  o.addEventListener('mousedown', (e) => {
    if (e.target === o && !['lobby', 'end', 'adbreak'].includes(o.id)) o.classList.add('hidden');
  }),
);
addEventListener('pointerdown', unlockAudio, { once: false });

// 메뉴 배경: 떠오르는 영혼 불씨
const bg = $('menubg');
const bgCtx = bg.getContext('2d');
const embers = Array.from({ length: 90 }, () => ({ x: Math.random(), y: Math.random(), s: 0.5 + Math.random() * 2.5, v: 0.02 + Math.random() * 0.05, h: Math.random() < 0.7 ? 165 : 30 }));
function drawMenuBg(t) {
  if ($('menu').classList.contains('hidden')) return requestAnimationFrame(drawMenuBg);
  const w = (bg.width = innerWidth);
  const h = (bg.height = innerHeight);
  const g = bgCtx.createRadialGradient(w / 2, h * 1.1, 0, w / 2, h * 1.1, h * 1.2);
  g.addColorStop(0, '#3a1430');
  g.addColorStop(0.45, '#150f26');
  g.addColorStop(1, '#07060d');
  bgCtx.fillStyle = g;
  bgCtx.fillRect(0, 0, w, h);
  bgCtx.globalCompositeOperation = 'lighter';
  for (const e of embers) {
    e.y -= e.v / 60;
    e.x += Math.sin(t / 1000 + e.s * 3) * 0.0004;
    if (e.y < -0.05) {
      e.y = 1.05;
      e.x = Math.random();
    }
    const a = 0.25 + 0.35 * Math.sin(t / 400 + e.s * 10);
    bgCtx.fillStyle = `hsla(${e.h},100%,70%,${a})`;
    bgCtx.beginPath();
    bgCtx.arc(e.x * w, e.y * h, e.s, 0, Math.PI * 2);
    bgCtx.fill();
  }
  bgCtx.globalCompositeOperation = 'source-over';
  requestAnimationFrame(drawMenuBg);
}
requestAnimationFrame(drawMenuBg);

// ---------------- 캐릭터 미리보기 ----------------
// Renderer의 캐릭터 그리기 함수를 작은 캔버스에 재사용
function makePreview(c) {
  const pv = Object.create(Renderer.prototype);
  pv.ctx = c.getContext('2d');
  pv.flash = new Map();
  pv.recoils = new Map();
  pv.settings = {};
  pv.particles = [];
  return pv;
}

function drawCharacter(c, cos, weapon, t, scale = 2.4) {
  const pv = c._pv || (c._pv = makePreview(c));
  const ctx = pv.ctx;
  ctx.setTransform(1, 0, 0, 1, 0, 0);
  ctx.clearRect(0, 0, c.width, c.height);
  ctx.translate(c.width / 2, c.height / 2 + 6);
  ctx.scale(scale, scale);
  pv.drawPlayer({ id: 0, x: 0, y: 0, aim: Math.sin(t / 900) * 0.6 - 0.3, flags: 0, act: 0, actT: 0, w: weapon, wr: 0, orbs: 0, cos, me: false, hp: 1, maxHp: 1 }, { time: t / 1000 });
}

function previewLoop(t) {
  if (!$('menu').classList.contains('hidden')) drawCharacter($('preview'), profile.d.equipped, profile.d.weapon, t);
  requestAnimationFrame(previewLoop);
}
requestAnimationFrame(previewLoop);

// ---------------- 메뉴 ----------------
function renderWallet() {
  $('obols').textContent = profile.d.obols.toLocaleString();
  $('gems').textContent = profile.d.gems.toLocaleString();
  document.querySelectorAll('.w-obols').forEach((e) => (e.textContent = profile.d.obols.toLocaleString()));
  document.querySelectorAll('.w-gems').forEach((e) => (e.textContent = profile.d.gems.toLocaleString()));
}

function renderAccount() {
  const d = profile.d;
  const need = profile.xpForLevel(d.level);
  $('account').innerHTML = `계정 <b>Lv.${d.level}</b> · ${d.stats.games}판 · 우승 <b>${d.stats.wins}</b><div class="xpmini"><i style="width:${(100 * d.xp) / need}%"></i></div>`;
}

function renderWeapons() {
  const box = $('weapons');
  box.innerHTML = '';
  for (const id of WEAPON_IDS) {
    const w = WEAPONS[id];
    const b = document.createElement('button');
    b.className = `wcard${profile.d.weapon === id ? ' sel' : ''}`;
    b.style.setProperty('--wc', w.color);
    b.innerHTML = `<div class="wi">${w.icon}</div><div class="wn">${w.name}</div><div class="wr">${w.role}</div>`;
    b.title = `우클릭 ${w.basic.name}: ${w.basic.desc}\nQ ${w.q.name}: ${w.q.hint}\nW ${w.w.name}: ${w.w.hint}\nE ${w.e.name}: ${w.e.hint}\nR ${w.r.name}: ${w.r.hint}`;
    b.onclick = () => {
      profile.d.weapon = id;
      profile.save();
      renderWeapons();
      play('ui');
    };
    box.appendChild(b);
  }
}

function renderSpells() {
  const box = $('spells');
  box.innerHTML = '';
  const sel = profile.d.spells || (profile.d.spells = DEFAULT_SPELLS.slice());
  for (const id of SPELL_IDS) {
    const sp = SPELLS[id];
    const b = document.createElement('button');
    const idx = sel.indexOf(id);
    b.className = `spell-btn${idx >= 0 ? ' sel' : ''}`;
    b.title = `${sp.desc} · ${sp.cd}초`;
    b.innerHTML = `<i>${sp.icon}</i>${sp.name}${idx >= 0 ? `<b>${idx ? 'F' : 'D'}</b>` : ''}`;
    b.onclick = () => {
      const i = sel.indexOf(id);
      if (i >= 0) return;
      sel.shift();
      sel.push(id);
      profile.save();
      renderSpells();
      play('ui');
    };
    box.appendChild(b);
  }
}

function renderQuests() {
  const box = $('quests');
  box.innerHTML = '';
  for (const q of profile.quests()) {
    const done = q.progress >= q.goal;
    const el = document.createElement('div');
    el.className = `quest${q.claimed ? ' done' : ''}`;
    el.innerHTML = `<div class="qh"><span>${q.name}</span><span class="qr">◎ ${q.reward}</span></div><div class="qbar"><i style="width:${(100 * q.progress) / q.goal}%"></i></div><small class="muted">${q.progress} / ${q.goal}</small>`;
    if (done && !q.claimed) {
      const b = document.createElement('button');
      b.textContent = '보상 받기';
      b.onclick = () => {
        const got = profile.claimQuest(q.id);
        if (got) {
          toast(`퀘스트 완료! 오볼 +${got}`);
          play('chest');
        }
        renderMenu();
      };
      el.appendChild(b);
    }
    box.appendChild(el);
  }
  const s = profile.d.streak;
  $('streak').innerHTML = STREAK_REWARDS.map((r, i) => `<span class="${i < s.count ? 'on' : ''} ${r.gems ? 'gemday' : ''}" title="${i + 1}일차">${r.gems ? `◆${r.gems}` : `◎${r.obols}`}</span>`).join('');
}

function renderMenu() {
  renderWallet();
  renderAccount();
  renderWeapons();
  renderSpells();
  renderQuests();
}

$('name').value = profile.d.name || '';
$('name').addEventListener('input', () => {
  profile.d.name = $('name').value;
  profile.save();
});
if (STANDALONE) {
  $('standalone-note').classList.remove('hidden');
  $('queue-info').textContent = '오프라인 데모 · 봇 15명과 대전';
}
if (ADS_ENABLED) $('ad-menu').classList.remove('hidden');

const streak = profile.checkStreak();
if (streak) setTimeout(() => toast(`연속 접속 ${streak.day}일차 보상: ${streak.reward.gems ? `영혼석 +${streak.reward.gems}` : `오볼 +${streak.reward.obols}`}`, 4000), 600);
renderMenu();

// 서버 상태 (다음 판 정보)
async function pollStatus() {
  if (STANDALONE || $('menu').classList.contains('hidden')) return;
  try {
    const r = await fetch('/api/status');
    const s = await r.json();
    const parts = [];
    if (s.countdown != null) parts.push(`다음 판 ${s.countdown}초 · 대기 ${s.waiting}명`);
    else parts.push('16인 · 빈자리는 봇');
    if (s.playing) parts.push(`플레이 중 ${s.playing}명`);
    $('queue-info').textContent = parts.join(' · ');
  } catch {
    // 서버 없음
  }
}
setInterval(pollStatus, 3000);
pollStatus();

// ---------------- 게임 시작 ----------------
function joinMsg(mode, extra = {}) {
  const name = ($('name').value || '').trim() || `영혼${Math.floor(Math.random() * 900 + 100)}`;
  return { t: 'join', mode, name, weapon: profile.d.weapon, spells: profile.d.spells || DEFAULT_SPELLS, cos: profile.d.equipped, ...extra };
}

async function connect(kind, msg, opts = {}) {
  unlockAudio();
  if (transport) transport.close();
  if (kind === 'local') transport = new LocalTransport({ botLevel: opts.botLevel ?? 1 });
  else {
    const proto = location.protocol === 'https:' ? 'wss' : 'ws';
    transport = new WSTransport(`${proto}://${location.host}/ws`);
  }
  client = new GameClient({
    transport,
    renderer,
    input,
    hud,
    onLobby: showLobby,
    onStart: onGameStart,
    onEnd: onGameEnd,
    onError: (m) => {
      toast(m);
      backToMenu();
    },
  });
  transport.onmsg = (m) => client.handle(m);
  transport.onclose = () => {
    if (client && client.running) {
      toast('서버 연결이 끊어졌습니다.');
      backToMenu();
    }
  };
  try {
    await transport.connect();
  } catch {
    toast('서버에 연결할 수 없어 연습 모드로 시작합니다.');
    return connect('local', { ...msg, mode: 'practice' }, opts);
  }
  lastMode = { kind, msg, opts };
  transport.send(msg);
}

function startQuick() {
  if (STANDALONE) connect('local', joinMsg('practice'), { botLevel: Number($('difficulty').value) });
  else connect('ws', joinMsg('public'));
}

$('btn-play').onclick = startQuick;
$('btn-practice').onclick = () => connect('local', joinMsg('practice'), { botLevel: Number($('difficulty').value) });
$('btn-create').onclick = () => {
  if (STANDALONE) return toast('방 만들기는 서버를 배포해야 쓸 수 있습니다.');
  connect('ws', joinMsg('create'));
};
$('btn-join').onclick = () => {
  if (STANDALONE) return toast('방 참가는 서버를 배포해야 쓸 수 있습니다.');
  openModal('joinroom');
  $('room-code').focus();
};
$('room-join-go').onclick = () => {
  const code = $('room-code').value.trim().toUpperCase();
  if (code.length !== 4) return toast('4자리 방 코드를 입력하세요.');
  closeModal('joinroom');
  connect('ws', joinMsg('code', { code }));
};

const TIPS = [
  '오브를 들고 있으면 위치가 모두에게 보입니다. 혼자 다니지 마세요.',
  '바닥에 빨간 예고가 보이면 클릭으로 빠져나가거나 E·점멸로 피하세요.',
  '정글 캠프는 잡으면 일정 시간 뒤 다시 생깁니다. 동선을 짜서 돌아보세요.',
  'Q·W·E 스킬 각인이 모두 희귀 이상이면 R도 함께 강해집니다.',
  '기절·속박은 최대 1초, 이후 1.5초는 면역입니다.',
  '상자를 열 때는 1초 동안 멈춰야 합니다. 맞으면 끊깁니다.',
  '넉백으로 적을 기둥에 박으면 추가 피해와 기절!',
  '정화(보조 주문)는 기절 중에도 쓸 수 있습니다.',
  '죽으면 오브를 모두 떨어뜨리고 가장 높은 스킬이 한 단계 강등됩니다.',
];

function showLobby(m) {
  $('menu').classList.add('hidden');
  $('lobby').classList.remove('hidden');
  $('lobby-title').textContent = m.local ? '연습 모드' : m.code ? '비공개 방' : '빠른 대전';
  $('lobby-countdown').textContent = m.countdown != null ? m.countdown : '대기';
  $('lobby-sub').textContent = m.local ? '봇 15명과 대전' : `${m.count} / ${m.max}명 · 빈자리는 봇이 채웁니다`;
  const code = $('lobby-code');
  if (m.code) {
    code.classList.remove('hidden');
    code.textContent = m.code;
    code.title = '클릭해서 복사';
    code.onclick = () => navigator.clipboard?.writeText(m.code).then(() => toast('방 코드를 복사했습니다'));
  } else code.classList.add('hidden');
  $('lobby-players').innerHTML = (m.players || []).map((n) => `<span>${escapeHtml(n)}</span>`).join('');
  const host = $('lobby-host');
  if (m.code && m.host) {
    host.classList.remove('hidden');
    $('lobby-bots').checked = m.fillBots;
    $('lobby-botlevel').value = String(m.botLevel);
  } else host.classList.add('hidden');
  if (!$('lobby-tip').textContent) $('lobby-tip').textContent = `팁: ${TIPS[Math.floor(Math.random() * TIPS.length)]}`;
}
$('lobby-start').onclick = () => transport && transport.send({ t: 'start' });
const sendCfg = () => transport && transport.send({ t: 'roomcfg', fillBots: $('lobby-bots').checked, botLevel: Number($('lobby-botlevel').value) });
$('lobby-bots').onchange = sendCfg;
$('lobby-botlevel').onchange = sendCfg;
$('lobby-leave').onclick = backToMenu;

function onGameStart() {
  $('lobby').classList.add('hidden');
  $('lobby-tip').textContent = '';
  $('menu').classList.add('hidden');
  $('menubg').classList.add('hidden');
  $('end').classList.add('hidden');
  input.enabled = true;
  input.reset();
  play('horn', 0.8);
}

function backToMenu() {
  if (client) client.stop();
  if (transport) {
    transport.send({ t: 'leave' });
    transport.close();
  }
  client = null;
  transport = null;
  input.enabled = false;
  hud.hide();
  ['lobby', 'end', 'pause'].forEach(closeModal);
  $('menu').classList.remove('hidden');
  $('menubg').classList.remove('hidden');
  renderMenu();
}

// Esc: 일시 메뉴
input.onKey = (e) => {
  if ((e.code === 'ArrowLeft' || e.code === 'ArrowRight') && transport) {
    transport.send({ t: 'spec', d: e.code === 'ArrowLeft' ? -1 : 1 });
    return true;
  }
  if (e.code === 'Escape') {
    $('pause').classList.toggle('hidden');
    return true;
  }
  return false;
};
$('pause-resume').onclick = () => closeModal('pause');
$('pause-quit').onclick = backToMenu;

// ---------------- 결과 ----------------
function onGameEnd(m) {
  input.enabled = false;
  lastEnd = m;
  const me = m.results.find((r) => r.id === m.you);
  const winner = m.results.find((r) => r.id === m.winner);
  const won = me && me.placement === 1;
  const title = $('end-title');
  title.textContent = won ? '승천!' : `${me ? me.placement : '-'}위`;
  title.classList.toggle('win', won);
  const how = m.reason === 'ritual' ? '승천 의식 성공' : '시간 종료 · 오브 점수';
  $('end-sub').textContent = won ? `지상으로 올라갑니다 (${how})` : `우승: ${winner ? winner.name : '-'} (${how})`;
  if (me) {
    $('end-stats').innerHTML = [
      ['처치', me.kills],
      ['사망', me.deaths],
      ['오브 점수', me.score],
      ['오브 획득', me.orbTakes],
      ['레벨', me.level],
      ['가한 피해', me.dmg.toLocaleString()],
    ]
      .map(([k, v]) => `<div><b>${v}</b><small class="muted">${k}</small></div>`)
      .join('');
    const res = profile.applyMatch(me, m.rewards, m.results.length);
    $('end-rewards').textContent = `오볼 +${m.rewards.obols} · 계정 경험치 +${m.rewards.xp}${res.levels ? ` · 계정 레벨 업! (+${res.levels * 50} 오볼)` : ''}`;
    const qs = profile.quests().filter((q) => !q.claimed && q.progress >= q.goal);
    $('end-quests').textContent = qs.length ? `완료한 퀘스트 ${qs.length}개 — 메뉴에서 보상을 받으세요` : '';
  }
  $('end-table').innerHTML = `<table><tr><th>#</th><th>이름</th><th>무기</th><th>점수</th><th>처치</th><th>사망</th></tr>${m.results
    .map((r) => `<tr class="${r.id === m.you ? 'me' : ''}"><td>${r.placement}</td><td>${escapeHtml(r.name)}</td><td>${WEAPONS[r.weapon].icon}</td><td>${r.score}</td><td>${r.kills}</td><td>${r.deaths}</td></tr>`)
    .join('')}</table>`;
  $('end-ad').disabled = false;
  $('end-ad').textContent = '▶ 광고 보고 오볼 2배';
  $('end').classList.remove('hidden');
  play(won ? 'win' : 'lose');
  renderWallet();
  // 판 사이 광고: 3판에 1번, 첫 3판은 없음
  if (ADS_ENABLED && profile.d.games > 3 && profile.d.games % 3 === 0) showAd(() => {});
}

function showAd(done) {
  openModal('adbreak');
  let n = 3;
  $('ad-count').textContent = n;
  const iv = setInterval(() => {
    n--;
    $('ad-count').textContent = n;
    if (n <= 0) {
      clearInterval(iv);
      closeModal('adbreak');
      done();
    }
  }, 1000);
}

$('end-ad').onclick = () => {
  if (!lastEnd || !lastEnd.rewards) return;
  $('end-ad').disabled = true;
  showAd(() => {
    profile.d.obols += lastEnd.rewards.obols;
    profile.save();
    $('end-ad').textContent = `오볼 +${lastEnd.rewards.obols} 추가 획득!`;
    renderWallet();
    play('chest');
  });
};
$('end-again').onclick = () => {
  if (!lastMode) return backToMenu();
  const { kind, msg, opts } = lastMode;
  $('end').classList.add('hidden');
  connect(kind, { ...msg, mode: msg.mode === 'create' || msg.mode === 'code' ? 'public' : msg.mode }, opts);
};
$('end-menu').onclick = backToMenu;

// ---------------- 상점 ----------------
let storeTab = 'skin';
let storeMode = 'store';

function previewCosmetic(c, cv, t) {
  const ctx = cv.getContext('2d');
  if (c.type === 'skin') return drawCharacter(cv, { ...profile.d.equipped, skin: c.id }, profile.d.weapon, t, 2.2);
  ctx.setTransform(1, 0, 0, 1, 0, 0);
  ctx.clearRect(0, 0, cv.width, cv.height);
  const w = cv.width;
  const h = cv.height;
  ctx.globalCompositeOperation = 'lighter';
  if (c.type === 'trail') {
    for (let i = 0; i < 9; i++) {
      const k = i / 8;
      const col = c.style === 'rainbow' ? ['#ff4d4d', '#ffb340', '#ffe14d', '#5fd35f', '#4da3ff', '#c56bff'][i % 6] : c.color;
      ctx.globalAlpha = 0.2 + k * 0.8;
      ctx.fillStyle = col;
      ctx.beginPath();
      ctx.arc(20 + k * (w - 40), h / 2 + Math.sin(t / 300 + i) * 6, 6 + k * 8, 0, Math.PI * 2);
      ctx.fill();
    }
  } else if (c.type === 'slash') {
    ctx.translate(w / 2 - 20, h / 2);
    const a = (t / 400) % (Math.PI * 2);
    const g = ctx.createRadialGradient(0, 0, 20, 0, 0, 60);
    g.addColorStop(0, c.color2 + '00');
    g.addColorStop(0.7, c.color + 'cc');
    g.addColorStop(1, c.color2);
    ctx.fillStyle = g;
    ctx.beginPath();
    ctx.arc(0, 0, 60, a - 1.2, a + 1.2);
    ctx.arc(0, 0, 32, a + 1.2, a - 1.2, true);
    ctx.fill();
  } else if (c.type === 'killfx') {
    for (let i = 0; i < 14; i++) {
      const a = (i / 14) * Math.PI * 2 + t / 900;
      const d = 18 + ((t / 15 + i * 9) % 40);
      ctx.fillStyle = c.color;
      ctx.globalAlpha = 1 - d / 60;
      ctx.beginPath();
      ctx.arc(w / 2 + Math.cos(a) * d, h / 2 + Math.sin(a) * d, 4, 0, Math.PI * 2);
      ctx.fill();
    }
  } else {
    ctx.globalCompositeOperation = 'source-over';
    ctx.fillStyle = '#c9a8ff';
    ctx.font = '800 16px "Noto Sans KR"';
    ctx.textAlign = 'center';
    ctx.fillText(c.text || '(없음)', w / 2, h / 2 + 6);
  }
  ctx.globalAlpha = 1;
  ctx.globalCompositeOperation = 'source-over';
}

function renderStore() {
  $('store-title').textContent = storeMode === 'store' ? '상점' : '보관함';
  const tabs = $('store-tabs');
  tabs.innerHTML = '';
  for (const [type, label] of Object.entries(COSMETIC_TYPES)) {
    const b = document.createElement('button');
    b.textContent = label;
    b.className = storeTab === type ? 'on' : '';
    b.onclick = () => {
      storeTab = type;
      renderStore();
    };
    tabs.appendChild(b);
  }
  const grid = $('store-grid');
  grid.innerHTML = '';
  const list = COSMETICS.filter((c) => c.type === storeTab && (storeMode === 'store' || profile.isOwned(c)));
  for (const c of list) {
    const owned = profile.isOwned(c);
    const equipped = profile.d.equipped[c.type] === c.id;
    const el = document.createElement('div');
    el.className = 'sitem';
    el.innerHTML = `<canvas width="220" height="220"></canvas><div class="sn">${c.name}</div><div class="sr" style="color:${RARITY_COLOR[c.rarity || 0]}">${RARITY_LABEL[c.rarity || 0]}</div>`;
    const btn = document.createElement('button');
    if (equipped) {
      btn.className = 'equipped';
      btn.textContent = '장착 중';
    } else if (owned) {
      btn.className = 'equip';
      btn.textContent = '장착';
      btn.onclick = () => {
        profile.equip(c.id);
        play('pickup');
        renderStore();
      };
    } else if (c.cur === 'achv') {
      btn.className = 'locked';
      btn.textContent = `업적: ${c.achv.label} (${Math.min(profile.d.stats[c.achv.stat] || 0, c.achv.goal)}/${c.achv.goal})`;
    } else {
      btn.className = c.cur === 'gem' ? 'buy-gem' : 'buy-obol';
      btn.textContent = `${c.cur === 'gem' ? '◆' : '◎'} ${c.price.toLocaleString()}`;
      btn.onclick = () => {
        if (profile.buy(c.id)) {
          profile.equip(c.id);
          toast(`${c.name} 구매 완료!`);
          play('chest');
        } else {
          toast(c.cur === 'gem' ? '영혼석이 부족합니다.' : '오볼이 부족합니다. 게임을 플레이해서 모으세요!');
          if (c.cur === 'gem') openModal('gemshop');
        }
        renderStore();
        renderWallet();
      };
    }
    el.appendChild(btn);
    grid.appendChild(el);
  }
  renderWallet();
}

function storeLoop(t) {
  if (!$('store').classList.contains('hidden')) {
    const items = COSMETICS.filter((c) => c.type === storeTab && (storeMode === 'store' || profile.isOwned(c)));
    $('store-grid')
      .querySelectorAll('canvas')
      .forEach((cv, i) => items[i] && previewCosmetic(items[i], cv, t));
  }
  requestAnimationFrame(storeLoop);
}
requestAnimationFrame(storeLoop);

$('btn-store').onclick = () => {
  storeMode = 'store';
  renderStore();
  openModal('store');
};
$('btn-locker').onclick = () => {
  storeMode = 'locker';
  renderStore();
  openModal('store');
};
$('btn-gems').onclick = () => {
  $('gem-packs').innerHTML = GEM_PACKS.map((p) => `<button data-pack="${p.gems}"><b>◆ ${p.gems.toLocaleString()}</b><span>${p.price}</span>${p.bonus ? `<em>보너스 ${p.bonus}</em>` : ''}</button>`).join('');
  $('gem-packs')
    .querySelectorAll('button')
    .forEach((b) => (b.onclick = () => toast('결제는 서버 배포와 결제 연동 후 열립니다.')));
  openModal('gemshop');
};
$('gem-trial').onclick = () => {
  profile.d.gems += 500;
  profile.save();
  renderWallet();
  if (!$('store').classList.contains('hidden')) renderStore();
  toast('체험용 영혼석 500개를 받았습니다 (실제 결제 아님)');
  play('chest');
};
$('btn-login').onclick = () => openModal('login');
document.querySelectorAll('[data-oauth]').forEach((b) => (b.onclick = () => toast(`${b.dataset.oauth} 로그인은 서버 배포 후 연결됩니다.`)));

// ---------------- 도움말 / 설정 ----------------
$('btn-help').onclick = () => {
  $('help-weapons').innerHTML = WEAPON_IDS.map((id) => {
    const w = WEAPONS[id];
    const row = (k) => {
      const sk = w[k];
      const up = sk.up ? `<br><small style="opacity:.75">　영웅: ${sk.up[3].upDesc} · 전설: ${sk.up[4].upDesc}</small>` : '';
      return `<br>${k.toUpperCase()} ${sk.icon || ''} <b>${sk.name}</b> — ${sk.hint || sk.desc}${up}`;
    };
    return `<div class="hw" style="border-color:${w.color}55"><b style="color:${w.color}">${w.icon} ${w.name}</b> · ${w.role}<br>우클릭: ${w.basic.name} — ${w.basic.desc}${['q', 'w', 'e', 'r'].map(row).join('')}</div>`;
  }).join('');
  openModal('help');
};
$('btn-settings').onclick = () => {
  $('set-volume').value = profile.d.settings.volume;
  $('set-shake').checked = profile.d.settings.shake;
  openModal('settings');
};
$('set-volume').oninput = () => {
  profile.d.settings.volume = Number($('set-volume').value);
  setVolume(profile.d.settings.volume);
  profile.save();
};
$('set-shake').onchange = () => {
  profile.d.settings.shake = $('set-shake').checked;
  renderer.settings.shake = profile.d.settings.shake;
  profile.save();
};

// 자동화 테스트용 진입점
window.__styx = { startPractice: () => $('btn-practice').click(), client: () => client, profile };
