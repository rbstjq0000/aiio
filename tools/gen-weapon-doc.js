// shared/items.js 데이터로 docs/COMBAT_DESIGN.md의 무기/갑옷/신발 표를 다시 만든다.
// 문서와 코드 수치가 어긋나지 않게: `node tools/gen-weapon-doc.js`
import fs from 'node:fs';
import { WEAPONS, ARMORS, BOOTS, SPELLS, GRADE_CD, RARITIES } from '../shared/items.js';

const KEYS = [
  ['basic', '좌클릭'],
  ['q', 'Q'],
  ['w', 'W'],
  ['e', 'E'],
  ['r', 'R'],
];

function dps(w) {
  const b = w.basic;
  if (b.type === 'melee') {
    const dmg = b.combo.reduce((s, c) => s + c.dmg, 0);
    const t = b.combo.reduce((s, c) => s + c.dur, 0);
    return Math.round(dmg / t);
  }
  return Math.round((b.dmg + (b.dot ? b.dot.dmg / 2 : 0)) / b.dur);
}

let md = '<!-- gen:weapons start -->\n';
md += '> 이 표는 `node tools/gen-weapon-doc.js`로 shared/items.js에서 자동 생성됨. 직접 고치지 말 것.\n>\n';
md += '> 기준: 같은 레벨·장비에서 1,000 체력을 근접 무기 약 5초, 원거리·CC 무기 5.5~6초에 처치 (tests/design.test.js가 검증)\n\n';
for (const w of Object.values(WEAPONS)) {
  md += `### ${w.icon} ${w.name} (${w.role}) — 기본 공격 DPS 약 ${dps(w)}\n`;
  md += '| 키 | 스킬 | 효과 | 쿨타임 |\n|---|---|---|---|\n';
  for (const [k, label] of KEYS) {
    const sk = w[k];
    const cd = k === 'basic' ? '—' : k === 'r' ? '궁극기 게이지' : `${sk.cd}초`;
    md += `| ${label} | ${sk.name} | ${sk.desc} | ${cd} |\n`;
  }
  md += '\n';
}
md += '### 스킬 등급 (스킬 각인)\n| 등급 | 피해 배율 | 쿨타임 배율 |\n|---|---|---|\n';
RARITIES.forEach((r, i) => (md += `| ${r.name} | ×${r.mult} | ×${GRADE_CD[i]} |\n`));
md += '\n### 갑옷 · 신발 (능력치, 등급 배율이 효과에 곱해짐)\n| 장비 | 효과 |\n|---|---|\n';
for (const a of Object.values(ARMORS)) md += `| ${a.icon} ${a.name} | ${a.desc} |\n`;
for (const b of Object.values(BOOTS)) md += `| ${b.icon} ${b.name} | ${b.desc} |\n`;
md += '\n### 보조 주문 (D·F, 대기실에서 2개 선택)\n| 주문 | 효과 | 쿨타임 |\n|---|---|---|\n';
for (const sp of Object.values(SPELLS)) md += `| ${sp.icon} ${sp.name} | ${sp.desc} | ${sp.cd}초 |\n`;
md += '<!-- gen:weapons end -->';

const path = new URL('../docs/COMBAT_DESIGN.md', import.meta.url);
let doc = fs.readFileSync(path, 'utf8');
const s = doc.indexOf('<!-- gen:weapons start -->');
const e = doc.indexOf('<!-- gen:weapons end -->');
if (s < 0 || e < 0) throw new Error('문서에 gen:weapons 표시가 없음');
doc = doc.slice(0, s) + md + doc.slice(e + '<!-- gen:weapons end -->'.length);
fs.writeFileSync(path, doc);
console.log('docs/COMBAT_DESIGN.md 무기 표 갱신 완료');
