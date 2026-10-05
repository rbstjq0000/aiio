// 키보드/마우스 입력. 누름은 카운터로 보내서 패킷 손실·틱 사이 입력도 놓치지 않음
import { PRESS } from '../shared/constants.js';

const KEYMAP = {
  KeyQ: 's2',
  KeyR: 'ult',
  KeyE: 'e',
  Space: 'space',
  KeyF: 'f',
};

export class Input {
  constructor(canvas) {
    this.canvas = canvas;
    this.keys = new Set();
    this.mouseX = innerWidth / 2;
    this.mouseY = innerHeight / 2;
    this.lmb = false;
    this.counters = [0, 0, 0, 0, 0, 0, 0];
    this.onPress = null; // (key) => void, 즉시 피드백용
    this.onKey = null; // 일반 키 (Tab, Esc 등)
    this.enabled = false;

    addEventListener('keydown', (e) => {
      if (!this.enabled) return;
      if (e.target && (e.target.tagName === 'INPUT' || e.target.tagName === 'TEXTAREA')) return;
      if (e.code === 'Tab' || e.code === 'Space') e.preventDefault();
      if (this.onKey && this.onKey(e)) return;
      if (e.repeat) return;
      this.keys.add(e.code);
      const k = KEYMAP[e.code];
      if (k) this.press(k);
    });
    addEventListener('keyup', (e) => this.keys.delete(e.code));
    addEventListener('blur', () => {
      this.keys.clear();
      this.lmb = false;
    });
    canvas.addEventListener('mousemove', (e) => {
      this.mouseX = e.clientX;
      this.mouseY = e.clientY;
    });
    canvas.addEventListener('mousedown', (e) => {
      if (!this.enabled) return;
      this.mouseX = e.clientX;
      this.mouseY = e.clientY;
      if (e.button === 0) {
        this.lmb = true;
        this.press('atk');
      } else if (e.button === 2) this.press('s1');
    });
    addEventListener('mouseup', (e) => {
      if (e.button === 0) this.lmb = false;
    });
    canvas.addEventListener('contextmenu', (e) => e.preventDefault());
  }

  press(k) {
    this.counters[PRESS[k]]++;
    if (this.onPress) this.onPress(k);
  }

  move() {
    let mx = 0;
    let my = 0;
    const k = this.keys;
    if (k.has('KeyW') || k.has('ArrowUp')) my -= 1;
    if (k.has('KeyS') || k.has('ArrowDown')) my += 1;
    if (k.has('KeyA') || k.has('ArrowLeft')) mx -= 1;
    if (k.has('KeyD') || k.has('ArrowRight')) mx += 1;
    const l = Math.hypot(mx, my);
    return l > 0 ? [mx / l, my / l] : [0, 0];
  }

  reset() {
    this.keys.clear();
    this.lmb = false;
  }
}
