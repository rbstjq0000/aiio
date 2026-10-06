// 입력 (롤과 같은 방식)
//   우클릭: 땅 = 이동(누르고 있으면 계속 따라감) / 적 = 그 적을 쫓아가며 기본 공격 / 상자·장비 = 가서 열기·줍기
//   A + 좌클릭: 적 = 그 적 공격 / 빈 곳 = 근처 적 자동 공격(공격 이동)
//   QWER 스킬(마우스 방향), D 구르기(커서 방향), S 멈춤
// 누름은 카운터로 보내서 틱 사이에 누른 것도 놓치지 않음
import { PRESS, PRESS_N } from '../shared/constants.js';

const KEYMAP = { KeyQ: 'q', KeyW: 'w', KeyE: 'e', KeyR: 'r', KeyD: 'd' };

export class Input {
  constructor(canvas) {
    this.canvas = canvas;
    this.mouseX = innerWidth / 2;
    this.mouseY = innerHeight / 2;
    this.moveHeld = false;
    this.attackMode = false; // A를 누른 뒤 다음 좌클릭까지
    this.counters = new Array(PRESS_N).fill(0);
    this.onPress = null; // (key) => void
    this.onMoveClick = null; // (screenX, screenY) => void  우클릭
    this.onAttackClick = null; // (screenX, screenY) => void  A + 좌클릭
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
      if (e.code === 'KeyA') this.attackMode = true;
      if (e.code === 'Escape') this.attackMode = false;
      if (e.code === 'KeyS') {
        this.stopPressed = true; // S = 제자리 멈춤 (공격 대상도 해제)
        this.attackMode = false;
      }
    });
    addEventListener('blur', () => {
      this.moveHeld = false;
      this.attackMode = false;
    });
    canvas.addEventListener('mousemove', (e) => {
      this.mouseX = e.clientX;
      this.mouseY = e.clientY;
    });
    canvas.addEventListener('mousedown', (e) => {
      if (!this.enabled) return;
      this.mouseX = e.clientX;
      this.mouseY = e.clientY;
      if (e.button === 2) {
        this.attackMode = false;
        this.moveHeld = true;
        if (this.onMoveClick) this.onMoveClick(e.clientX, e.clientY);
      } else if (e.button === 0 && this.attackMode) {
        this.attackMode = false;
        if (this.onAttackClick) this.onAttackClick(e.clientX, e.clientY);
      }
    });
    addEventListener('mouseup', (e) => {
      if (e.button === 2) this.moveHeld = false;
    });
    canvas.addEventListener('contextmenu', (e) => e.preventDefault());
  }

  press(k) {
    // onPress가 false를 돌려주면 게임이 직접 처리 (예: 사거리 밖 대상 스킬 → 걸어가서 사용)
    if (this.onPress && this.onPress(k) === false) return;
    this.counters[PRESS[k]]++;
  }

  reset() {
    this.moveHeld = false;
    this.attackMode = false;
    this.stopPressed = false;
  }
}
