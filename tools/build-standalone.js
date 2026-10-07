// 서버 없이 열리는 단일 HTML 데모 빌드 (봇과 대전하는 연습 모드)
// 사용: npm run build:demo  →  dist/styx-demo.html
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { build } from 'esbuild';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const res = await build({
  entryPoints: [path.join(root, 'client/main.js')],
  bundle: true,
  format: 'iife',
  minify: true,
  write: false,
  target: 'es2020',
  legalComments: 'none',
});
const js = res.outputFiles[0].text;
// 도트 에셋(이미지·글꼴)을 data URL로 넣어 파일 하나로 열리게
const assetDir = path.join(root, 'client/assets');
const MIME = { '.png': 'image/png', '.ttf': 'font/ttf' };
const assets = {};
(function walk(dir) {
  for (const f of fs.readdirSync(dir)) {
    const full = path.join(dir, f);
    if (fs.statSync(full).isDirectory()) walk(full);
    else if (MIME[path.extname(f)]) assets[path.relative(assetDir, full).split(path.sep).join('/')] = `data:${MIME[path.extname(f)]};base64,${fs.readFileSync(full).toString('base64')}`;
  }
})(assetDir);
const css = fs
  .readFileSync(path.join(root, 'client/style.css'), 'utf8')
  .replace(/url\('\.\/assets\/([^']+)'\)/g, (m, f) => (assets[f] ? `url('${assets[f]}')` : m));
let html = fs.readFileSync(path.join(root, 'client/index.html'), 'utf8');
html = html.replace('<link rel="stylesheet" href="./style.css">', () => `<style>\n${css}\n</style>`);
html = html.replace('<script type="module" src="./main.js"></script>', () => `<script>window.__STYX_STANDALONE__=true;window.__STYX_ASSETS__=${JSON.stringify(assets)};</script>\n<script>\n${js.replace(/<\/script/g, '<\\/script')}\n</script>`);
fs.mkdirSync(path.join(root, 'dist'), { recursive: true });
const out = path.join(root, 'dist/styx-demo.html');
fs.writeFileSync(out, html);
console.log(`빌드 완료: dist/styx-demo.html (${(html.length / 1024).toFixed(0)} KB)`);

// 아티팩트용: 문서 뼈대(doctype/html/head/body)는 게시할 때 씌워지므로 내용만 남김
const art = html
  .replace(/<!doctype html>\s*/i, '')
  .replace(/<html[^>]*>\s*/i, '')
  .replace(/<\/html>\s*/i, '')
  .replace(/<head>\s*/i, '')
  .replace(/<\/head>\s*/i, '')
  .replace(/<body>\s*/i, '')
  .replace(/<\/body>\s*/i, '')
  .replace(/<meta charset="utf-8">\s*/i, '')
  .replace(/<meta name="viewport"[^>]*>\s*/i, '');
fs.writeFileSync(path.join(root, 'dist/styx-artifact.html'), art);
