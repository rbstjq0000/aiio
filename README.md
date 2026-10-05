# STYX.io (가제)

명계의 오브 3개를 두고 16명이 싸우는 10분짜리 배틀 io 게임.
하데스의 손맛, 롤·알비온식 장비/스킬, 스타 유즈맵 배틀로얄의 사냥과 쟁탈을 섞었습니다.

- 기획서: [docs/GAME_DESIGN.md](docs/GAME_DESIGN.md) — 메뉴, 수익 모델, 에셋 전략, 핑 대책, 로드맵
- 전투·승리 설계서: [docs/COMBAT_DESIGN.md](docs/COMBAT_DESIGN.md) — 확정 수치, 무기 6종 스킬표

## 실행

Node.js 20 이상이 필요합니다.

```bash
npm install
npm start            # http://localhost:8080 (멀티플레이 서버 + 게임 페이지)
```

| 명령 | 하는 일 |
|---|---|
| `npm start` | 서버 실행. `PORT` 환경변수로 포트 변경 |
| `npm run dev` | 파일이 바뀌면 서버 자동 재시작 |
| `npm test` | 설계 목표(교전 시간·성장 격차) + 직업 스킬 동작 + 서버 연결 테스트 |
| `npm run build:demo` | 서버 없이 열리는 단일 HTML 데모 → `dist/styx-demo.html` |
| `npm run gen:doc` | 무기 수치표를 코드에서 다시 생성해 설계서에 반영 |

광고 자리를 미리 보려면 주소 끝에 `?ads`를 붙이세요.

## 폴더 구조

```
shared/    게임 규칙. 서버와 브라우저(연습 모드)가 같은 코드를 실행
  sim.js        게임 루프: 맵, 오브, 부활, 상자/장비, 스틱스 강, 스냅샷
  combat.js     스킬 실행, 피해, CC, 투사체, 장판
  items.js      무기 스킬·패시브·등급·갑옷·신발·오브 데이터 (밸런스 수정은 여기서)
  maps.js       맵 데이터 (벽, 정글 캠프, 상자, 제단). 새 맵은 MAPS에 추가
  nav.js        길찾기 (봇 + 클릭 이동이 벽을 돌아가게)
  monsters.js   몬스터 데이터와 AI
  bot.js        봇 AI
  constants.js  매치 시간, 체력, 경험치 곡선 등
  cosmetics.js  치장품 카탈로그와 가격
server/    WebSocket 서버: 공개 매칭, 비공개 방, 30틱 게임 루프
client/    메뉴, 상점, 렌더러, 이펙트, 사운드, HUD, 이동 예측
tests/     design.test.js(설계 검증), skills.test.js(스킬 동작), server.test.js, screens.mjs(브라우저 스크린샷)
tools/     데모 빌드, 설계서 표 생성
```

## 밸런스를 바꿀 때

1. `shared/items.js`의 숫자를 고친다 (스킬 설명은 숫자에서 자동 생성됨)
2. `npm test`로 설계 목표(교전 5초, 성장 격차 2배 등)를 아직 지키는지 확인
3. `npm run gen:doc`로 설계서 표 갱신

## 아직 안 된 것

- 로그인(Google/Discord), 계정 DB, 결제, 광고 SDK 연동: 지금은 버튼과 화면만 있음
- 치장품 소유 검증: 지금은 브라우저 저장소 기준이라 조작 가능 → 계정 서버에서 검증 필요
- 모바일 터치 조작, 팀전, 지역 서버
