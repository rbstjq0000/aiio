// 통신 계층: 서버(WebSocket) 또는 브라우저 안 연습 게임(LocalTransport)
// 둘 다 같은 메시지 형식을 쓰므로 게임 화면 코드는 차이를 모른다.
import { Game } from '../shared/sim.js';
import * as C from '../shared/constants.js';

export class WSTransport {
  constructor(url) {
    this.url = url;
    this.onmsg = null;
    this.onclose = null;
    this.ws = null;
    this.local = false;
  }

  connect() {
    return new Promise((resolve, reject) => {
      let ws;
      try {
        ws = new WebSocket(this.url);
      } catch (e) {
        reject(e);
        return;
      }
      this.ws = ws;
      const timer = setTimeout(() => reject(new Error('timeout')), 5000);
      ws.onopen = () => {
        clearTimeout(timer);
        resolve();
      };
      ws.onerror = () => {
        clearTimeout(timer);
        reject(new Error('connect failed'));
      };
      ws.onmessage = (e) => {
        if (this.onmsg) this.onmsg(JSON.parse(e.data));
      };
      ws.onclose = () => {
        if (this.onclose) this.onclose();
      };
    });
  }

  send(m) {
    if (this.ws && this.ws.readyState === 1) this.ws.send(JSON.stringify(m));
  }

  close() {
    this.onclose = null;
    if (this.ws) this.ws.close();
  }
}

// 브라우저 안에서 서버 역할: 봇과 함께하는 연습/데모 모드
export class LocalTransport {
  constructor({ botLevel = 1, fillTo = C.MAX_PLAYERS, countdown = 3 } = {}) {
    this.botLevel = botLevel;
    this.fillTo = fillTo;
    this.countdown = countdown;
    this.onmsg = null;
    this.onclose = null;
    this.game = null;
    this.pid = 0;
    this.uiVer = -1;
    this.timer = null;
    this.local = true;
  }

  connect() {
    return Promise.resolve();
  }

  deliver(m) {
    queueMicrotask(() => this.onmsg && this.onmsg(m));
  }

  send(m) {
    switch (m.t) {
      case 'join':
        this.startLobby(m);
        break;
      case 'in':
        if (this.game) this.game.setInput(this.pid, m);
        break;
      case 'spec':
        if (this.game) this.game.spectate(this.pid, m.d === -1 ? -1 : 1);
        break;
      case 'ping':
        this.deliver({ t: 'pong', c: m.c });
        break;
      case 'leave':
        this.close();
        break;
      default:
        break;
    }
  }

  startLobby(m) {
    let left = this.countdown;
    const push = () => this.deliver({ t: 'lobby', code: null, players: [m.name || '나'], count: 1, max: this.fillTo, countdown: Math.ceil(left), host: true, local: true });
    push();
    const iv = setInterval(() => {
      left -= 1;
      if (left <= 0) {
        clearInterval(iv);
        this.startGame(m);
      } else push();
    }, 1000);
    this.lobbyTimer = iv;
  }

  startGame(m) {
    const g = new Game({ mode: 'practice', fillTo: this.fillTo, botLevel: this.botLevel });
    const p = g.addPlayer({ name: m.name || '나', weapon: m.weapon, cosmetics: m.cos, spells: m.spells });
    this.pid = p.id;
    g.start();
    this.game = g;
    this.deliver({ t: 'start', you: p.id, map: g.mapInfo(), roster: g.roster(), mode: 'practice' });
    let last = performance.now();
    let acc = 0;
    this.timer = setInterval(() => {
      const now = performance.now();
      acc += Math.min(0.25, (now - last) / 1000);
      last = now;
      while (acc >= C.DT) {
        acc -= C.DT;
        this.stepOnce();
        if (!this.game) return;
      }
    }, 1000 / 60);
  }

  stepOnce() {
    const g = this.game;
    g.step(C.DT);
    const snap = g.snapshotFor(this.pid, this.uiVer);
    if (snap.me && snap.me.ui) this.uiVer = snap.me.ui.v;
    this.deliver(snap);
    g.clearEvents();
    if (g.state === 'ended') {
      const r = g.results.find((x) => x.id === this.pid);
      const rewards = r ? C.computeRewards({ placement: r.placement, total: g.results.length, kills: r.kills, orbs: r.orbs, won: r.placement === 1 }) : null;
      this.deliver({ t: 'end', results: g.results, you: this.pid, winner: g.winner, reason: g.endReason, rewards });
      clearInterval(this.timer);
      this.timer = null;
      this.game = null;
    }
  }

  close() {
    clearInterval(this.timer);
    clearInterval(this.lobbyTimer);
    this.timer = null;
    this.game = null;
  }
}
