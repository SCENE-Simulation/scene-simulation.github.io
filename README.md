# 센둥이 시뮬레이터

리센느 빵카드 27종 뽑기 시뮬레이터와 실물 컬랙션 북.

- **장난감 › 빵뽑기 시뮬레이션** — 빵을 뜯어 27종을 모을 때까지 드는 비용을 시뮬레이션합니다.
- **컬렉션 북 › 2026 › CU 리센느 405빵 콜라보** — 실제로 산 빵과 모은 카드를 기록합니다. 기록은 브라우저(localStorage)에 저장됩니다.
- 준비 중: 나랑드 콜라보, 도미노 콜라보, 조회수 예측기

사이트: https://scene-simulation.github.io/

## 수정 방법

`index.html`은 `tools/`의 파일로 만들어집니다.

- `tools/source.html` — 원본 시뮬레이터
- `tools/theme.css` — 디자인
- `tools/shell-top.html`, `tools/shell-bottom.html`, `tools/shell.js` — 사이드바, 홈 화면, 메뉴 이동

```
node tools/build.js tools/source.html index.html
```


## 포토카드 컬렉션 추가하기

`tools/collections.js` 에 설정을 하나 넣으면 도감 페이지가 만들어지고 사이드바·홈·전체보기·위시리스트에 자동으로 붙습니다.
설정 형식은 `tools/collection.js` 맨 위 주석에 있습니다. Claude에게는 **"포카 페이지 만들어줘"** 라고 하면
`.claude/skills/photocard-collection` 스킬이 절차대로 진행합니다.

MADE BY 비효율주의자 OF 여자 아이돌 컨텐츠 마이너갤러리
