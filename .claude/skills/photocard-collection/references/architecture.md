# 센둥이 시뮬레이터 구조

사이트: https://scene-simulation.github.io/ (GitHub Pages, 저장소 `SCENE-Simulation/scene-simulation.github.io`)

## 빌드

`index.html` 하나로 배포된다. 직접 고치지 말고 **항상 빌드**한다.

```bash
node tools/build.js tools/source.html index.html
```

`tools/build.js` 가 아래를 합친다.

| 파일 | 역할 |
|---|---|
| `tools/source.html` | CU 405빵 도감 + 빵뽑기 시뮬레이터 (예전 아티팩트 원본, 전용 코드) |
| `tools/theme.css` | 사이트 전체 디자인 (다크 · Pretendard · 글래스, SCENE-FLIX 참고) |
| `tools/shell-top.html` | 아이콘 정의, 사이드바, 헤더, 홈 화면 |
| `tools/shell-bottom.html` | 모바일 하단 탭 바 |
| `tools/collection.js` | **포토카드 컬렉션 엔진** (설정 → 페이지 생성) |
| `tools/collections.js` | 컬렉션 설정 목록. 여기에 추가하면 페이지가 생긴다 |
| `tools/pages.js` | 굿즈 컬렉션, 전체보기, 위시리스트, 홈 통합 현황 |
| `tools/shell.js` | 화면 전환(라우팅), 정렬, 난이도 기준 설명 |

## 화면 주소

`?tab=<id>` 로 화면을 고른다: `home`, `cu405`, `gacha`, `goods2026`, `allcards`, `allgoods`, `wish`,
그리고 엔진으로 만든 컬렉션은 그 `id`.

## 저장

모두 방문자 브라우저(localStorage)에 저장된다. 서버는 없다.

| 키 | 내용 |
|---|---|
| `bread27:collection` | CU 405빵 기록 |
| `col:<id>` | 엔진 컬렉션 기록 (기록 목록 + 칭호) |
| `col:<id>:cols` | 카드 크기(열 수) |
| `sendungi:wish` | 위시리스트 |
| `sendungi:goods` | 굿즈 보유 수량 |

엔진 컬렉션은 **기록(entries) 하나만 저장**하고 보유 수량·금액·원장은 거기서 계산한다.
그래서 기록을 고치거나 지우면 숫자가 저절로 맞는다.

## 공통 규칙

- 변경은 **저장 버튼**을 눌러야 확정된다. 저장 전 변경은 로그에 "저장 전"으로 표시되고,
  넣었다 뺀 기록은 저장할 때 서로 상쇄된다.
- 카드·굿즈 이미지 위의 하트는 위시리스트와 연결된다(`pc:<컬렉션id>:<번호>`, `gd:<상품id>`).
- 디자인 토큰은 `tools/theme.css` 맨 위 `:root` 에 있다. 새 색을 쓰지 말고 기존 토큰을 쓴다.
- 문구는 한국어, 존댓말. 숫자는 천 단위 쉼표.

## 굿즈 컬렉션

굿즈는 `tools/pages.js` 의 `GOODS` (연도별 상품 목록)와 `GCOLL` (연도별 컬렉션 이름)에 있다.
상품 형식: `{ id, name, price, parts, date, img }`
