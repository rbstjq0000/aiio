// 진입점: 메뉴 / 상점 / 로비 / 게임 / 탈락·결과 화면 연결
import { WEAPONS, WEAPON_IDS, RARITIES, weaponId, skillDesc } from '../shared/items.js';
import { COSMETICS, COSMETIC_MAP, COSMETIC_TYPES, RARITY_LABEL, RARITY_COLOR } from '../shared/cosmetics.js';
import { AUG_BY_ID, AUG_TIERS } from '../shared/augments.js';
import { computeRewards, MAX_PLAYERS } from '../shared/constants.js';
import { PixelRenderer } from './pixel.js';
import { Input } from './input.js';
import { Hud, escapeHtml } from './hud.js';
import { GameClient } from './game.js';
import { WSTransport, LocalTransport } from './net.js';
import { Profile, STREAK_REWARDS, GEM_PACKS } from './profile.js';
import { loadAssets, IMG, FLOOR, SPR, WEAPON_LOOK } from './assets.js';

const $ = (id) => document.getElementById(id);
const STANDALONE = !!window.__STYX_STANDALONE__ || location.protocol === 'file:';
const ADS_ENABLED = new URLSearchParams(location.search).has('ads');

const profile = new Profile();
const canvas = $('game');
const renderer = new PixelRenderer(canvas);
const input = new Input(canvas);
const hud = new Hud(renderer);
let client = null;
let transport = null;
let lastMode = null;
let lastEnd = null;
let applied = false; // 이번 판 보상을 이미 받았는지 (탈락 순간 or 종료 때 한 번)

renderer.settings.shake = profile.d.settings.shake;
const assetsReady = loadAssets();

// ---------------- 공통 ----------------
function toast(msg, ms = 2600) {
  const el = document.createElement('div');
  el.textContent = msg;
  $('toast').appendChild(el);
  setTimeout(() => el.remove(), ms);
}

function openModal(id) {
  $(id).classList.remove('hidden');
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

// ---------------- 메뉴 배경: 도트 풀밭 + 흩날리는 꽃잎 ----------------
const bg = $('menubg');
const bgCtx = bg.getContext('2d');
const petals = Array.from({ length: 50 }, () => ({ x: Math.random(), y: Math.random(), s: 1 + Math.floor(Math.random() * 2), v: 0.02 + Math.random() * 0.04, p: Math.random() * 6 }));
let bgTile = null;
function drawMenuBg(t) {
  if ($('menu').classList.contains('hidden')) return requestAnimationFrame(drawMenuBg);
  const S = 3;
  const w = Math.ceil(innerWidth / S);
  const h = Math.ceil(innerHeight / S);
  if (bg.width !== w || bg.height !== h) {
    bg.width = w;
    bg.height = h;
    bg.style.width = `${w * S}px`;
    bg.style.height = `${h * S}px`;
    bgTile = null;
  }
  const floor = IMG['tiles/TilesetFloor.png'];
  if (!bgTile && floor && floor.width) {
    const c = document.createElement('canvas');
    c.width = c.height = 64;
    const g = c.getContext('2d');
    for (let i = 0; i < 16; i++) {
      const v = (i * 7) % 5 === 0 ? FLOOR.grassVar[i % FLOOR.grassVar.length] : FLOOR.grass;
      g.drawImage(floor, v[0], v[1], 16, 16, (i % 4) * 16, Math.floor(i / 4) * 16, 16, 16);
    }
    bgTile = bgCtx.createPattern(c, 'repeat');
  }
  bgCtx.imageSmoothingEnabled = false;
  bgCtx.fillStyle = bgTile || '#5d8a3a';
  bgCtx.fillRect(0, 0, w, h);
  bgCtx.fillStyle = 'rgba(20,30,16,0.45)';
  bgCtx.fillRect(0, 0, w, h);
  // 가장자리 나무
  if (IMG[SPR.treeG[0]] && IMG[SPR.treeG[0]].width) {
    for (let i = 0; i < Math.ceil(w / 28) + 1; i++) {
      for (const [y, name] of [[-14, i % 2 ? 'treeG' : 'pine'], [h - 22, i % 3 ? 'treeG2' : 'pink']]) {
        const s = SPR[name];
        bgCtx.drawImage(IMG[s[0]], s[1], s[2], s[3], s[4], i * 28 - 8 + (y > 0 ? 10 : 0), y, s[3], s[4]);
      }
    }
  }
  bgCtx.fillStyle = '#ffd1e8';
  for (const p of petals) {
    p.y += p.v / 60;
    p.x += Math.sin(t / 900 + p.p) * 0.0006 + 0.0003;
    if (p.y > 1.02) {
      p.y = -0.02;
      p.x = Math.random();
    }
    bgCtx.fillRect(Math.floor((p.x % 1) * w), Math.floor(p.y * h), p.s, p.s);
  }
  requestAnimationFrame(drawMenuBg);
}
requestAnimationFrame(drawMenuBg);

// ---------------- 캐릭터 미리보기 (도트 스프라이트) ----------------
// 닌자 그리기: 스킨 시트 + 손에 든 무기 아이콘
function drawSprite(c, weapon, t, opts = {}) {
  const g = c.getContext('2d');
  g.imageSmoothingEnabled = false;
  g.clearRect(0, 0, c.width, c.height);
  const skin = COSMETIC_MAP[opts.skin || profile.d.equipped.skin] || COSMETIC_MAP.skin_blue;
  const img = IMG[`skins/${skin.sheet}.png`];
  if (!img || !img.width) return;
  const s = Math.floor(c.width / 16) - (opts.pad ? 1 : 0);
  // 아래 → 오른쪽 → 위 → 왼쪽으로 돌면서 걷기
  const dirs = [0, 3, 1, 2];
  const col = opts.still ? 0 : dirs[Math.floor(t / 1600) % 4];
  const row = opts.still ? 0 : Math.floor(t / 130) % 4;
  const ox = Math.floor((c.width - 16 * s) / 2);
  const oy = Math.floor((c.height - 16 * s) / 2);
  const sh = IMG['fx/shadow.png'];
  if (sh && sh.width) g.drawImage(sh, ox + 2 * s, oy + 13 * s, 12 * s, 7 * s);
  g.drawImage(img, col * 16, row * 16, 16, 16, ox, oy, 16 * s, 16 * s);
  if (weapon && !opts.noWeapon) {
    const wl = WEAPON_LOOK[weapon];
    const wi = wl && IMG[wl.icon];
    if (wi && wi.width) {
      const k = (s * (weapon === 'dagger' ? 1 : 0.7)) | 0 || 1;
      g.drawImage(wi, ox + 11 * s, oy + 6 * s, wi.width * k, wi.height * k);
    }
  }
}

function previewLoop(t) {
  if (!$('menu').classList.contains('hidden')) {
    drawSprite($('preview'), profile.d.weapon, t);
    document.querySelectorAll('.wcard canvas').forEach((c) => drawSprite(c, c.dataset.w, t, { still: c.dataset.w !== profile.d.weapon }));
  }
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
    b.innerHTML = `<canvas width="48" height="48" data-w="${id}"></canvas><div class="wn">${w.icon} ${w.name}</div><div class="wr">${w.role}</div>`;
    b.title = `우클릭 ${w.basic.name}: ${skillDesc(w.basic, true)}\nQ ${w.q.name}: ${w.q.hint}\nW ${w.w.name}: ${w.w.hint}\nE ${w.e.name}: ${w.e.hint}\nR ${w.r.name}: ${w.r.hint}`;
    b.onclick = () => {
      profile.d.weapon = id;
      profile.save();
      renderWeapons();
    };
    box.appendChild(b);
  }
  const w = WEAPONS[profile.d.weapon] || WEAPONS.dagger;
  const beats = WEAPONS[w.beats];
  const lost = Object.values(WEAPONS).find((x) => x.beats === w.id);
  $('class-info').innerHTML = `<b style="color:${w.color}">${w.icon} ${w.name}</b><br>${w.role}<br>Q ${w.q.name} · W ${w.w.name}<br>E ${w.e.name} · R ${w.r.name}<br><span style="color:#7ed957">강함 → ${beats.name}</span> · <span style="color:#ff8a8a">약함 ← ${lost.name}</span>`;
}

function renderQuests() {
  const box = $('quests');
  box.innerHTML = '';
  for (const q of profile.quests()) {
    const done = q.progress >= q.goal;
    const el = document.createElement('div');
    el.className = `quest${q.claimed ? ' done' : ''}`;
    el.innerHTML = `<div class="qh"><span>${q.name}</span><span class="qr">● ${q.reward}</span></div><div class="qbar"><i style="width:${(100 * q.progress) / q.goal}%"></i></div><small class="muted">${q.progress} / ${q.goal}</small>`;
    if (done && !q.claimed) {
      const b = document.createElement('button');
      b.textContent = '보상 받기';
      b.onclick = () => {
        const got = profile.claimQuest(q.id);
        if (got) toast(`퀘스트 완료! 코인 +${got}`);
        renderMenu();
      };
      el.appendChild(b);
    }
    box.appendChild(el);
  }
  const s = profile.d.streak;
  $('streak').innerHTML = STREAK_REWARDS.map((r, i) => `<span class="${i < s.count ? 'on' : ''} ${r.gems ? 'gemday' : ''}" title="${i + 1}일차">${r.gems ? `◆${r.gems}` : `●${r.obols}`}</span>`).join('');
}

function renderMenu() {
  renderWallet();
  renderAccount();
  renderWeapons();
  renderQuests();
}

profile.d.weapon = weaponId(profile.d.weapon);
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
if (streak) setTimeout(() => toast(`연속 접속 ${streak.day}일차 보상: ${streak.reward.gems ? `보석 +${streak.reward.gems}` : `코인 +${streak.reward.obols}`}`, 4000), 600);
renderMenu();

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
  const name = ($('name').value || '').trim() || `닌자${Math.floor(Math.random() * 900 + 100)}`;
  return { t: 'join', mode, name, weapon: profile.d.weapon, cos: profile.d.equipped, ...extra };
}

async function connect(kind, msg, opts = {}) {
  await assetsReady;
  if (client) client.stop();
  if (transport) transport.close();
  if (kind === 'local') transport = new LocalTransport({ botLevel: opts.botLevel ?? 1 });
  else {
    const proto = location.protocol === 'https:' ? 'wss' : 'ws';
    transport = new WSTransport(`${proto}://${location.host}/ws`);
  }
  const tr = transport;
  client = new GameClient({
    transport,
    renderer,
    input,
    hud,
    onLobby: showLobby,
    onStart: onGameStart,
    onEnd: onGameEnd,
    onDeath,
    onError: (m) => {
      toast(m);
      backToMenu();
    },
  });
  client.autoAttack = profile.d.settings.autoAttack !== false;
  transport.onmsg = (m) => client && tr === transport && client.handle(m);
  transport.onclose = () => {
    if (client && client.running && !client.ended) {
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

// 다음 판: 같은 방식으로 바로 새 게임
function nextGame() {
  ['deathscreen', 'end', 'pause'].forEach((id) => $(id).classList.add('hidden'));
  if (!lastMode) return backToMenu();
  const { kind, msg, opts } = lastMode;
  connect(kind, { ...msg, weapon: profile.d.weapon, mode: msg.mode === 'create' || msg.mode === 'code' ? 'public' : msg.mode }, opts);
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
  '큰 상자와 현상금 주머니는 높은 등급 무기가 잘 나옵니다.',
  '단도는 3단 베기·돌진으로 술사에게 파고들고, 표창은 단죄로 단도를 밀어내고(벽에 박으면 기절!), 두루마리는 매혹·구슬로 사수를 잡아요.',
  '같은 계열 증강을 2·3개 모으면 세트 효과! 들고 있는 무기 계열은 +1로 쳐요.',
  '에픽 몬스터는 막타를 친 사람이 보물을 얻습니다. 체력 30%가 되면 모두에게 알려져요.',
  '테두리 색이 진한 닌자는 높은 등급 무기를 든 강한 적입니다.',
  '수풀 안에 있으면 멀리 있는 적에게 보이지 않아요. 공격하면 들킵니다.',
  '캠프 상자는 몹을 다 잡아야 열립니다. 몹은 강화석을 줘요.',
  '자기장 예고(흰 점선)가 뜨면 미리 안쪽으로 이동하세요.',
  '킬을 2번 이상 하면 현상금이 붙어 지도에 표시됩니다.',
  'Space 구르기는 짧게 무적입니다. 큰 스킬을 피하세요!',
  '증강 카드는 싸우면서 1·2·3 키로 골라도 됩니다.',
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
  applied = false;
  lastEnd = null;
  $('lobby').classList.add('hidden');
  $('lobby-tip').textContent = '';
  $('menu').classList.add('hidden');
  $('menubg').classList.add('hidden');
  $('end').classList.add('hidden');
  input.enabled = true;
  input.reset();
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

// 키: 1·2·3 증강 / F·G 상자 무기 (장착·분해) / ←→ 관전 / Esc 메뉴
input.onKey = (e) => {
  if (client && (e.code === 'KeyF' || e.code === 'KeyG') && hud.weaponChoice(client, e.code === 'KeyF' ? 1 : 2)) return true;
  if (client && /^Digit[123]$/.test(e.code)) {
    hud.pick(client, Number(e.code.slice(5)));
    return true;
  }
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

// ---------------- 보상 ----------------
function applyResult(r, total) {
  if (applied || !r) return null;
  applied = true;
  const rewards = computeRewards({ placement: r.placement, total, kills: r.kills, won: r.placement === 1 });
  const res = profile.applyMatch(r, rewards, total);
  return { rewards, levels: res.levels };
}

function rewardText(got) {
  if (!got) return '';
  return `코인 +${got.rewards.obols} · 계정 경험치 +${got.rewards.xp}${got.levels ? ` · 계정 레벨 업! (+${got.levels * 50} 코인)` : ''}`;
}

// ---------------- 탈락 ----------------
function onDeath(me) {
  input.reset();
  const total = MAX_PLAYERS;
  const got = applyResult({ placement: me.pl, kills: me.k, deaths: 1, chests: me.co || 0, monsterKills: me.mk || 0, augs: client && client.ui ? client.ui.augs.map((g) => g.id) : [] }, total);
  $('death-place').textContent = `#${me.pl}`;
  const killer = me.kb ? client.nameOf(me.kb) : '';
  $('death-sub').textContent = killer ? `${killer}에게 쓰러졌습니다` : '쓰러졌습니다';
  $('death-stats').innerHTML = [
    ['처치', me.k],
    ['상자', me.co || 0],
    ['증강', client && client.ui ? client.ui.augs.length : 0],
    ['무기', client && client.ui ? `${RARITIES[client.ui.gear.weapon.rarity].name}` : '-'],
    ['피해', (me.dmg || 0).toLocaleString()],
  ]
    .map(([k, v]) => `<div><b>${v}</b><small>${k}</small></div>`)
    .join('');
  $('death-rewards').textContent = rewardText(got);
  $('deathscreen').classList.remove('hidden');
  if (client) client.spectating = false;
  renderWallet();
}
$('death-next').onclick = nextGame;
$('spec-next').onclick = nextGame;
$('death-menu').onclick = backToMenu;
$('death-spec').onclick = () => {
  $('deathscreen').classList.add('hidden');
  if (client) client.spectating = true;
};

// ---------------- 결과 ----------------
function onGameEnd(m) {
  lastEnd = m;
  const me = m.results.find((r) => r.id === m.you);
  const winner = m.results.find((r) => r.id === m.winner);
  const won = me && me.placement === 1;
  // 탈락 화면을 보고 있으면 결과창은 띄우지 않음 (다음 판 버튼이 이미 있음)
  if (!won && !$('deathscreen').classList.contains('hidden')) return;
  input.enabled = false;
  $('deathscreen').classList.add('hidden');
  const title = $('end-title');
  title.textContent = won ? '🏆 우승!' : `#${me ? me.placement : '-'}`;
  title.classList.toggle('win', won);
  $('end-sub').textContent = won ? '최후의 닌자가 되었습니다!' : `우승: ${winner ? winner.name : '-'}`;
  const got = applyResult(me, m.results.length);
  if (me) {
    $('end-stats').innerHTML = [
      ['순위', `#${me.placement}`],
      ['처치', me.kills],
      ['어시스트', me.assists || 0],
      ['에픽', me.epicKills || 0],
      ['무기', `${RARITIES[me.rarity].name}\u00a0${WEAPONS[me.weapon].name}`],
      ['피해', me.dmg.toLocaleString()],
    ]
      .map(([k, v]) => `<div><b>${v}</b><small>${k}</small></div>`)
      .join('');
    $('end-augs').innerHTML = me.augs
      .map((id, i) => {
        const a = AUG_BY_ID[id];
        return a ? `<span class="aug-chip" style="--tc:${AUG_TIERS[(me.augTiers && me.augTiers[i]) || 0].color}"><i>${a.icon}</i>${a.name}</span>` : '';
      })
      .join('');
    $('end-rewards').textContent = got ? rewardText(got) : '';
    const qs = profile.quests().filter((q) => !q.claimed && q.progress >= q.goal);
    $('end-quests').textContent = qs.length ? `완료한 퀘스트 ${qs.length}개 — 메뉴에서 보상을 받으세요` : '';
  }
  $('end-table').innerHTML = `<table><tr><th>#</th><th>이름</th><th>무기</th><th>처치</th><th>증강</th></tr>${m.results
    .map((r) => `<tr class="${r.id === m.you ? 'me' : ''}"><td>${r.placement}</td><td>${escapeHtml(r.name)}</td><td style="color:${RARITIES[r.rarity].color}">${RARITIES[r.rarity].name} ${WEAPONS[r.weapon].name}</td><td>${r.kills}</td><td>${r.augs.map((id) => (AUG_BY_ID[id] ? AUG_BY_ID[id].icon : '')).join('')}</td></tr>`)
    .join('')}</table>`;
  $('end-ad').disabled = false;
  $('end-ad').textContent = '▶ 광고 보고 코인 2배';
  $('end-ad').classList.toggle('hidden', !got);
  $('end').classList.remove('hidden');
  renderWallet();
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
  if (!lastEnd) return;
  const me = lastEnd.results.find((r) => r.id === lastEnd.you);
  if (!me) return;
  const bonus = computeRewards({ placement: me.placement, total: lastEnd.results.length, kills: me.kills, won: me.placement === 1 }).obols;
  $('end-ad').disabled = true;
  showAd(() => {
    profile.d.obols += bonus;
    profile.save();
    $('end-ad').textContent = `코인 +${bonus} 추가 획득!`;
    renderWallet();
  });
};
$('end-again').onclick = nextGame;
$('end-menu').onclick = backToMenu;

// ---------------- 상점 ----------------
let storeTab = 'skin';
let storeMode = 'store';
const STORE_TYPES = Object.entries(COSMETIC_TYPES).filter(([t]) => t !== 'slash');

function previewCosmetic(c, cv, t) {
  const ctx = cv.getContext('2d');
  ctx.setTransform(1, 0, 0, 1, 0, 0);
  ctx.clearRect(0, 0, cv.width, cv.height);
  const w = cv.width;
  const h = cv.height;
  if (c.type === 'skin') return drawSprite(cv, profile.d.weapon, t, { skin: c.id, noWeapon: true });
  if (c.type === 'trail') {
    for (let i = 0; i < 9; i++) {
      const k = i / 8;
      ctx.fillStyle = c.style === 'rainbow' ? ['#ff4d4d', '#ffb340', '#ffe14d', '#5fd35f', '#4da3ff', '#c56bff'][i % 6] : c.color;
      ctx.globalAlpha = 0.2 + k * 0.8;
      const s = 8 + k * 14;
      ctx.fillRect(20 + k * (w - 60), h / 2 + Math.sin(t / 300 + i) * 8 - s / 2, s, s);
    }
  } else if (c.type === 'slash') {
    ctx.translate(w / 2 - 20, h / 2);
    const a = (t / 400) % (Math.PI * 2);
    ctx.fillStyle = c.color;
    ctx.beginPath();
    ctx.arc(0, 0, 60, a - 1.2, a + 1.2);
    ctx.arc(0, 0, 36, a + 1.2, a - 1.2, true);
    ctx.fill();
  } else if (c.type === 'killfx') {
    for (let i = 0; i < 14; i++) {
      const a = (i / 14) * Math.PI * 2 + t / 900;
      const d = 18 + ((t / 15 + i * 9) % 40);
      ctx.fillStyle = c.color;
      ctx.globalAlpha = 1 - d / 60;
      ctx.fillRect(w / 2 + Math.cos(a) * d - 4, h / 2 + Math.sin(a) * d - 4, 8, 8);
    }
  } else {
    ctx.fillStyle = '#ffcf4a';
    ctx.font = '800 18px "Noto Sans KR"';
    ctx.textAlign = 'center';
    ctx.fillText(c.text || '(없음)', w / 2, h / 2 + 6);
  }
  ctx.globalAlpha = 1;
}

function renderStore() {
  $('store-title').textContent = storeMode === 'store' ? '상점' : '보관함';
  const tabs = $('store-tabs');
  tabs.innerHTML = '';
  for (const [type, label] of STORE_TYPES) {
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
        renderStore();
      };
    } else if (c.cur === 'achv') {
      btn.className = 'locked';
      btn.textContent = `업적: ${c.achv.label} (${Math.min(profile.d.stats[c.achv.stat] || 0, c.achv.goal)}/${c.achv.goal})`;
    } else {
      btn.className = c.cur === 'gem' ? 'buy-gem' : 'buy-obol';
      btn.textContent = `${c.cur === 'gem' ? '◆' : '●'} ${c.price.toLocaleString()}`;
      btn.onclick = () => {
        if (profile.buy(c.id)) {
          profile.equip(c.id);
          toast(`${c.name} 구매 완료!`);
        } else {
          toast(c.cur === 'gem' ? '보석이 부족합니다.' : '코인이 부족합니다. 게임을 플레이해서 모으세요!');
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
  toast('체험용 보석 500개를 받았습니다 (실제 결제 아님)');
};
$('btn-login').onclick = () => openModal('login');
document.querySelectorAll('[data-oauth]').forEach((b) => (b.onclick = () => toast(`${b.dataset.oauth} 로그인은 서버 배포 후 연결됩니다.`)));

// ---------------- 도움말 / 설정 ----------------
$('btn-help').onclick = () => {
  $('help-weapons').innerHTML = WEAPON_IDS.map((id) => {
    const w = WEAPONS[id];
    const row = (k) => `<br>${k.toUpperCase()} ${w[k].icon || ''} <b>${w[k].name}</b> — ${w[k].hint || w[k].desc}`;
    const tiers = w.tiers.map((t, i) => (t ? `<br><span style="color:${RARITIES[i].color}">${RARITIES[i].name}</span>: ${t.desc}` : '')).join('');
    return `<div class="hw" style="border-color:${w.color}88"><b style="color:${w.color}">${w.icon} ${w.name}</b> · ${w.role} · <span style="color:#7ed957">${WEAPONS[w.beats].name}에게 강함</span>${w.passive ? `<br>패시브 ${w.passive.name}: ${w.passive.desc}` : ''}<br>우클릭: ${w.basic.name} — ${skillDesc(w.basic, true)}${['q', 'w', 'e', 'r'].map(row).join('')}<br><b>등급 효과</b>${tiers}</div>`;
  }).join('');
  openModal('help');
};
$('btn-settings').onclick = () => {
  $('set-shake').checked = profile.d.settings.shake;
  $('set-auto').checked = profile.d.settings.autoAttack !== false;
  openModal('settings');
};
$('set-auto').onchange = () => {
  profile.d.settings.autoAttack = $('set-auto').checked;
  profile.save();
  if (client) client.autoAttack = profile.d.settings.autoAttack;
};
$('set-shake').onchange = () => {
  profile.d.settings.shake = $('set-shake').checked;
  renderer.settings.shake = profile.d.settings.shake;
  profile.save();
};

// 자동화 테스트용 진입점
window.__styx = { startPractice: () => $('btn-practice').click(), client: () => client, profile, renderer };
