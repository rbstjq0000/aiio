// 게스트 프로필: 이 브라우저(localStorage)에 저장. 로그인 연동 후 서버 계정으로 옮김
import { COSMETICS, COSMETIC_MAP, DEFAULT_COSMETICS } from '../shared/cosmetics.js';

const KEY = 'styx_profile_v1';

export const QUEST_POOL = [
  { id: 'play3', name: '3판 플레이', goal: 3, stat: 'games', reward: 60 },
  { id: 'kill8', name: '플레이어 8명 처치', goal: 8, stat: 'kills', reward: 80 },
  { id: 'chest10', name: '상자 10개 열기', goal: 10, stat: 'chests', reward: 60 },
  { id: 'top5', name: '5위 안에 2번 들기', goal: 2, stat: 'top5', reward: 90 },
  { id: 'aug15', name: '증강 15개 고르기', goal: 15, stat: 'augs', reward: 70 },
  { id: 'top3', name: '3위 안에 들기', goal: 1, stat: 'top3', reward: 100 },
  { id: 'win1', name: '1위 하기', goal: 1, stat: 'wins', reward: 150 },
  { id: 'mon60', name: '몬스터 60마리 처치', goal: 60, stat: 'monsterKills', reward: 50 },
];

// 연속 접속 보상: 7일차는 유료 재화 맛보기
export const STREAK_REWARDS = [{ obols: 30 }, { obols: 40 }, { obols: 50 }, { obols: 60 }, { obols: 80 }, { obols: 100 }, { gems: 20 }];

// 유료 재화 패키지 (결제 연동 전 표시용)
export const GEM_PACKS = [
  { gems: 100, price: '₩1,200' },
  { gems: 550, price: '₩5,900', bonus: '+10%' },
  { gems: 1150, price: '₩11,900', bonus: '+15%' },
  { gems: 3000, price: '₩29,000', bonus: '+20%' },
];

function today() {
  const d = new Date();
  return `${d.getFullYear()}-${d.getMonth() + 1}-${d.getDate()}`;
}

function hashStr(s) {
  let h = 2166136261;
  for (let i = 0; i < s.length; i++) h = Math.imul(h ^ s.charCodeAt(i), 16777619);
  return h >>> 0;
}

function freshProfile() {
  return {
    v: 1,
    id: Math.random().toString(36).slice(2, 10),
    name: '',
    weapon: 'greatsword',
    obols: 300,
    gems: 0,
    owned: COSMETICS.filter((c) => c.cur === 'free').map((c) => c.id),
    equipped: { ...DEFAULT_COSMETICS },
    stats: { games: 0, wins: 0, top3: 0, kills: 0, deaths: 0, orbTakes: 0, chests: 0, monsterKills: 0, score: 0, bestScore: 0 },
    level: 1,
    xp: 0,
    daily: { date: '', quests: [] },
    streak: { last: '', count: 0 },
    settings: { volume: 0.6, shake: true },
    games: 0,
  };
}

export class Profile {
  constructor() {
    this.data = freshProfile();
    try {
      const raw = localStorage.getItem(KEY);
      if (raw) this.data = { ...this.data, ...JSON.parse(raw) };
    } catch {
      // 저장소를 쓸 수 없는 환경이면 이번 세션만 유지
    }
    this.ensureDaily();
  }

  save() {
    try {
      localStorage.setItem(KEY, JSON.stringify(this.data));
    } catch {
      // 무시
    }
  }

  get d() {
    return this.data;
  }

  xpForLevel(l) {
    return 100 + l * 60;
  }

  ensureDaily() {
    const t = today();
    if (this.data.daily.date !== t) {
      const pool = QUEST_POOL.slice();
      let h = hashStr(t + this.data.id);
      const picks = [];
      while (picks.length < 3) {
        const i = h % pool.length;
        picks.push(pool.splice(i, 1)[0]);
        h = Math.imul(h, 2654435761) >>> 0;
      }
      this.data.daily = { date: t, quests: picks.map((q) => ({ id: q.id, progress: 0, claimed: false })) };
      this.save();
    }
  }

  quests() {
    return this.data.daily.quests.filter((q) => QUEST_POOL.some((p) => p.id === q.id)).map((q) => ({ ...QUEST_POOL.find((p) => p.id === q.id), ...q }));
  }

  claimQuest(id) {
    const q = this.data.daily.quests.find((x) => x.id === id);
    const def = QUEST_POOL.find((p) => p.id === id);
    if (!q || q.claimed || q.progress < def.goal) return 0;
    q.claimed = true;
    this.data.obols += def.reward;
    this.save();
    return def.reward;
  }

  // 오늘 처음 접속했으면 연속 접속 보상
  checkStreak() {
    const t = today();
    const s = this.data.streak;
    if (s.last === t) return null;
    const y = new Date();
    y.setDate(y.getDate() - 1);
    const yest = `${y.getFullYear()}-${y.getMonth() + 1}-${y.getDate()}`;
    s.count = s.last === yest ? (s.count % 7) + 1 : 1;
    s.last = t;
    const reward = STREAK_REWARDS[s.count - 1];
    this.data.obols += reward.obols || 0;
    this.data.gems += reward.gems || 0;
    this.save();
    return { day: s.count, reward };
  }

  isOwned(c) {
    if (c.cur === 'free') return true;
    if (c.cur === 'achv') return (this.data.stats[c.achv.stat] || 0) >= c.achv.goal;
    return this.data.owned.includes(c.id);
  }

  buy(id) {
    const c = COSMETIC_MAP[id];
    if (!c || this.isOwned(c)) return false;
    const wallet = c.cur === 'gem' ? 'gems' : 'obols';
    if (c.cur !== 'gem' && c.cur !== 'obol') return false;
    if (this.data[wallet] < c.price) return false;
    this.data[wallet] -= c.price;
    this.data.owned.push(id);
    this.save();
    return true;
  }

  equip(id) {
    const c = COSMETIC_MAP[id];
    if (!c || !this.isOwned(c)) return false;
    this.data.equipped[c.type] = id;
    this.save();
    return true;
  }

  // 판 결과 반영. 반환: 계정 레벨업 여부 등
  applyMatch(r, rewards, total) {
    const d = this.data;
    const st = d.stats;
    st.games++;
    st.kills += r.kills;
    st.deaths += r.deaths;
    st.orbTakes += r.orbTakes || 0;
    st.chests += r.chests;
    st.monsterKills += r.monsterKills;
    st.score += r.score || 0;
    st.bestScore = Math.max(st.bestScore, r.score || 0);
    if (r.placement === 1) st.wins++;
    if (r.placement <= 3) st.top3++;
    d.games++;
    d.obols += rewards.obols;
    d.xp += rewards.xp;
    let levels = 0;
    while (d.xp >= this.xpForLevel(d.level)) {
      d.xp -= this.xpForLevel(d.level);
      d.level++;
      d.obols += 50;
      levels++;
    }
    const delta = { games: 1, kills: r.kills, chests: r.chests, augs: r.augs ? r.augs.length : 0, top5: r.placement <= 5 ? 1 : 0, top3: r.placement <= 3 ? 1 : 0, wins: r.placement === 1 ? 1 : 0, monsterKills: r.monsterKills };
    for (const q of d.daily.quests) {
      const def = QUEST_POOL.find((p) => p.id === q.id);
      if (!def) continue;
      q.progress = Math.min(def.goal, q.progress + (delta[def.stat] || 0));
    }
    this.save();
    return { levels };
  }
}
