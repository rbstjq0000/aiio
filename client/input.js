// 입력: 좌클릭 이동(누르고 있으면 계속 따라감), 우클릭 기본 공격, QWER 스킬, DF 주문
// 누름은 카운터로 보내서 틱 사이에 누른 것도 놓치지 않음
import { PRESS, PRESS_N } from '../shared/constants.js';

const KEYMAP = { KeyQ: 'q', KeyW: 'w', KeyE: 'e', KeyR: 'r', KeyD: 'd', KeyF: 'f' };

export class Input {
  constructor(canvas) {
    this.canvas = canvas;
    this.mouseX = innerWidth / 2;
    this.mouseY = innerHeight / 2;
    this.atkHeld = false;
    this.moveHeld = false;
    this.counters = new Array(PRESS_N).fill(0);
    this.onPress = null; // (key) => void
    this.onMoveClick = null; // (screenX, screenY) => void
    this.onKey = null;
    this.enabled = false;
    this.stopPressed = false;

    addEventListener('keydown', (e) => {
      if (!this.enabled) return;
      if (e.target && (e.target.tagName === 'INPUT' || e.target.tagName === 'TEXTAREA')) return;
      if (e.code === 'Tab' || e.code === 'Space') e.preventDefault();
      if (this.onKey && this.onKey(e)) return;
      if (e.repeat) return;
      const k = KEYMAP[e.code];
      if (k) this.press(k);
      if (e.code === 'KeyS') this.stopPressed = true; // 롤처럼 S = 제자리 멈춤
    });
    addEventListener('blur', () => {
      this.atkHeld = false;
      this.moveHeld = false;
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
        this.moveHeld = true;
        if (this.onMoveClick) this.onMoveClick(e.clientX, e.clientY);
      } else if (e.button === 2) {
        this.atkHeld = true;
        this.press('atk');
      }
    });
    addEventListener('mouseup', (e) => {
      if (e.button === 0) this.moveHeld = false;
      if (e.button === 2) this.atkHeld = false;
    });
    canvas.addEventListener('contextmenu', (e) => e.preventDefault());
  }

  press(k) {
    this.counters[PRESS[k]]++;
    if (this.onPress) this.onPress(k);
  }

  reset() {
    this.atkHeld = false;
    this.moveHeld = false;
    this.stopPressed = false;
  }
}
