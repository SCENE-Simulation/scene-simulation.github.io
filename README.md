# 센둥이 시뮬레이터

리센느 빵카드 27종 뽑기 시뮬레이터와 실물 컬랙션 북.

- **뽑기 시뮬레이터** — 빵을 뜯어 27종을 모을 때까지 드는 비용을 시뮬레이션합니다.
- **실물 컬랙션 북** — 실제로 산 빵과 모은 카드를 기록합니다. 기록은 브라우저(localStorage)에 저장됩니다.
- **유튜브 조회수 예측기** — 준비 중

사이트: https://scene-simulation.github.io/

## 수정 방법

`index.html`은 `tools/`의 파일로 만들어집니다.

- `tools/source.html` — 원본 시뮬레이터
- `tools/theme.css` — 디자인
- `tools/shell-top.html`, `tools/shell-bottom.html`, `tools/shell.js` — 사이드바, 홈 화면, 메뉴 이동

```
node tools/build.js tools/source.html index.html
```

MADE BY 비효율주의자 OF 여자 아이돌 컨텐츠 마이너갤러리
