// 방 관리: 공개 매칭(카운트다운 + 봇 채우기), 비공개 방(코드), 게임 루프
import { Game } from '../shared/sim.js';
import * as C from '../shared/constants.js';
import { WEAPONS } from '../shared/items.js';
import { sanitizeCosmetics } from '../shared/cosmetics.js';

const CODE_CHARS = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
const COUNTDOWN = Number(process.env.LOBBY_COUNTDOWN || C.LOBBY_COUNTDOWN);

function makeCode(rooms) {
  for (;;) {
    let c = '';
    for (let i = 0; i < 4; i++) c += CODE_CHARS[Math.floor(Math.random() * CODE_CHARS.length)];
    if (!rooms.has(c)) return c;
  }
}

export function cleanName(name) {
  const n = String(name || '')
    .replace(/[<>&"'`\u0000-\u001f]/g, '')
    .trim()
    .slice(0, 14);
  return n || `영혼${Math.floor(Math.random() * 900 + 100)}`;
}

class Room {
  constructor(manager, { code = null, isPublic = true, botLevel = 1 }) {
    this.manager = manager;
    this.code = code;
    this.isPublic = isPublic;
    this.botLevel = botLevel;
    this.fillBots = true;
    this.clients = new Set();
    this.host = null;
    this.state = 'lobby';
    this.countdown = isPublic ? null : null;
    this.game = null;
    this.lobbyPushT = 0;
    this.endT = 0;
  }

  add(client) {
    this.clients.add(client);
    client.room = this;
    if (!this.host) this.host = client;
    if (this.isPublic && this.countdown == null) this.countdown = COUNTDOWN;
    if (this.isPublic && this.clients.size >= C.MAX_PLAYERS) this.countdown = Math.min(this.countdown, 3);
    this.pushLobby();
  }

  remove(client) {
    this.clients.delete(client);
    client.room = null;
    if (this.game && client.pid) this.game.removePlayer(client.pid);
    client.pid = 0;
    if (this.host === client) this.host = [...this.clients][0] || null;
    if (this.state === 'lobby') this.pushLobby();
    if (!this.clients.size) this.manager.closeRoom(this);
  }

  pushLobby() {
    const players = [...this.clients].map((c) => c.name);
    for (const c of this.clients) {
      c.send({
        t: 'lobby',
        code: this.isPublic ? null : this.code,
        players,
        count: this.clients.size,
        max: C.MAX_PLAYERS,
        countdown: this.countdown == null ? null : Math.ceil(this.countdown),
        host: c === this.host,
        fillBots: this.fillBots,
        botLevel: this.botLevel,
      });
    }
  }

  startGame() {
    const game = new Game({ mode: this.isPublic ? 'public' : 'private', fillTo: this.fillBots ? C.MAX_PLAYERS : this.clients.size, botLevel: this.botLevel });
    for (const c of this.clients) {
      const p = game.addPlayer({ name: c.name, weapon: c.weapon, cosmetics: c.cos });
      c.pid = p.id;
      c.uiVer = -1;
    }
    game.start();
    this.game = game;
    this.state = 'running';
    const map = game.mapInfo();
    const roster = game.roster();
    for (const c of this.clients) c.send({ t: 'start', you: c.pid, map, roster, mode: game.mode });
    if (this.isPublic && this.manager.publicRoom === this) this.manager.publicRoom = null;
  }

  tick(dt) {
    if (this.state === 'lobby') {
      if (this.countdown != null) {
        this.countdown -= dt;
        this.lobbyPushT -= dt;
        if (this.lobbyPushT <= 0) {
          this.lobbyPushT = 1;
          this.pushLobby();
        }
        if (this.countdown <= 0) this.startGame();
      }
      return;
    }
    if (this.state === 'running') {
      const g = this.game;
      g.step(dt);
      for (const c of this.clients) {
        if (!c.pid) continue;
        const snap = g.snapshotFor(c.pid, c.uiVer);
        if (snap.me && snap.me.ui) c.uiVer = snap.me.ui.v;
        c.send(snap);
      }
      g.clearEvents();
      if (g.state === 'ended') {
        this.state = 'ended';
        this.endT = 4;
        for (const c of this.clients) {
          const r = g.results.find((x) => x.id === c.pid);
          const rewards = r ? C.computeRewards({ placement: r.placement, total: g.results.length, kills: r.kills, orbs: r.orbs, won: r.placement === 1 }) : null;
          c.send({ t: 'end', results: g.results, you: c.pid, winner: g.winner, reason: g.endReason, rewards });
        }
      }
      return;
    }
    if (this.state === 'ended') {
      this.endT -= dt;
      if (this.endT <= 0) {
        for (const c of [...this.clients]) {
          c.room = null;
          c.pid = 0;
        }
        this.clients.clear();
        this.manager.closeRoom(this);
      }
    }
  }
}

export class RoomManager {
  constructor() {
    this.rooms = new Map();
    this.publicRoom = null;
    this.all = new Set();
  }

  join(client, msg) {
    if (client.room) client.room.remove(client);
    client.name = cleanName(msg.name);
    client.weapon = WEAPONS[msg.weapon] ? msg.weapon : 'greatsword';
    client.cos = sanitizeCosmetics(msg.cos);
    const mode = msg.mode;
    if (mode === 'create') {
      const room = new Room(this, { code: makeCode(this.rooms), isPublic: false });
      this.rooms.set(room.code, room);
      this.all.add(room);
      room.add(client);
    } else if (mode === 'code') {
      const code = String(msg.code || '').toUpperCase().trim();
      const room = this.rooms.get(code);
      if (!room || room.state !== 'lobby') return client.send({ t: 'err', msg: '방을 찾을 수 없거나 이미 시작했습니다.' });
      if (room.clients.size >= C.MAX_PLAYERS) return client.send({ t: 'err', msg: '방이 가득 찼습니다.' });
      room.add(client);
    } else {
      if (!this.publicRoom || this.publicRoom.state !== 'lobby' || this.publicRoom.clients.size >= C.MAX_PLAYERS) {
        this.publicRoom = new Room(this, { isPublic: true });
        this.all.add(this.publicRoom);
      }
      this.publicRoom.add(client);
    }
  }

  // 비공개 방장 명령
  hostCommand(client, msg) {
    const room = client.room;
    if (!room || room.isPublic || room.host !== client || room.state !== 'lobby') return;
    if (msg.t === 'start') room.startGame();
    else if (msg.t === 'roomcfg') {
      room.fillBots = !!msg.fillBots;
      room.botLevel = [0, 1, 2].includes(msg.botLevel) ? msg.botLevel : 1;
      room.pushLobby();
    }
  }

  leave(client) {
    if (client.room) client.room.remove(client);
  }

  closeRoom(room) {
    this.all.delete(room);
    if (room.code) this.rooms.delete(room.code);
    if (this.publicRoom === room) this.publicRoom = null;
  }

  tick(dt) {
    for (const room of [...this.all]) room.tick(dt);
  }

  // 메뉴에 보여줄 다음 공개 판 정보
  publicInfo() {
    const r = this.publicRoom;
    let playing = 0;
    for (const room of this.all) if (room.state === 'running') playing += room.clients.size;
    return { waiting: r ? r.clients.size : 0, countdown: r && r.countdown != null ? Math.ceil(r.countdown) : null, playing };
  }
}
