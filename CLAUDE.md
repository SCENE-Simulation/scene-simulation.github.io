# 센둥이 시뮬레이터

리센느 포토카드 뽑기 시뮬레이터 + 포토카드 컬렉션 북. GitHub Pages 사이트.

## 저장소가 2개다 (중요)

이 프로젝트는 **공개/비공개 저장소 두 개**로 나뉘어 있고, 두 폴더가 나란히 있어야 동작한다.

| 폴더 | 저장소 | 공개 | 내용 |
|---|---|---|---|
| `scene-simulation.github.io/` (여기) | `SCENE-Simulation/scene-simulation.github.io` | 공개 | 사이트 소스 |
| `../scene-workspace/` | `SCENE-Simulation/scene-workspace` | **비공개** | 스킬, 작업 로그 |

GitHub Pages가 무료 플랜에서 비공개 저장소를 지원하지 않아, 사이트 소스만 공개로 두고
노하우에 해당하는 스킬과 작업 로그는 비공개 저장소로 분리했다.

`.claude/skills` 는 실제 폴더가 아니라 `../scene-workspace/skills` 를 가리키는
**디렉터리 정션**이다. `.gitignore` 에 `.claude/skills/` 가 있어 이 공개 저장소에는 커밋되지 않는다.

- 새 스킬을 만들거나 고칠 때는 **`../scene-workspace/skills/` 쪽이 실체**다. 거기서 커밋한다.
- 이 저장소에 스킬 파일을 추가하지 말 것. 공개된다.

## 작업 규칙

집 PC와 외부 작업용 PC 두 대에서 번갈아 작업한다. **저장소 2개 모두** 받고 올려야 한다.

작업 시작 전 — 양쪽 pull:

```powershell
cd $HOME\projects\scene-simulation.github.io; git pull
cd $HOME\projects\scene-workspace;            git pull
```

작업 끝난 후 — 양쪽 commit & push:

```powershell
cd $HOME\projects\scene-simulation.github.io; git add -A; git commit -m "내용"; git push
cd $HOME\projects\scene-workspace;            git add -A; git commit -m "내용"; git push
```

한쪽을 빠뜨리면 다른 PC에서 충돌이 난다.

## 작업 로그

작업이 끝나면 `../scene-workspace/worklog/YYYY-MM-DD.md` 에 기록한다.
다른 PC에서 이어받을 때 필요하므로 **"다음에 할 일"을 반드시 남긴다.**
비공개 저장소이므로 파일 경로나 시행착오를 적어도 된다. 단 토큰·비밀번호는 어디에도 적지 않는다.

## 빌드

`index.html` 은 `tools/` 의 파일들로부터 생성된다. 직접 수정하지 말 것.

```
node tools/build.js tools/source.html index.html
```

- `tools/source.html` — 원본 페이지 (405빵 카드 데이터 · 컬렉션 북)
- `tools/theme.css` — 디자인
- `tools/shell-top.html`, `tools/shell-bottom.html`, `tools/shell.js` — 사이드바·홈·메뉴
- `tools/collection.js` — 포토카드 도감 엔진 (설정 형식은 이 파일 맨 위 주석)
- `tools/collections.js` — 도감 설정 모음. 뽑기형(random) 구매 방식이 있는 콜라보는 시뮬레이터에도 자동으로 나온다
- `tools/gacha.js` — 포토카드 뽑기 시뮬레이터 (뽑기 · 분석 · 뽑기 미니게임). 405빵 카드 데이터는 `source.html` 이 `window.SG405` 로 넘겨준다
- `tools/views.js` — 조회수 예측기 화면. 기록이 비어 있으면 예시 데이터를 만들어 "예시"로 표시한다
- `tools/views-engine.js` — 조회수 예측 계산식. 사이트와 수집기가 같이 쓴다 (브라우저 `window.VE`, Node `require`)

## 조회수 수집기 (GitHub Actions)

- `.github/workflows/collect-views.yml` 이 매시 17분에 `tools/collect-views.js` 를 실행한다
- YouTube Data API v3 키는 저장소 Secret `YT_API_KEY`. **키를 코드·로그·작업 로그 어디에도 적지 않는다**
- 기록은 **`data` 브랜치의 `views.json`** 에 쌓인다 (main 은 건드리지 않음 → 사이트가 매시간 다시 배포되지 않는다).
  사이트는 raw.githubusercontent.com 에서 읽고, 못 읽으면 main 의 `data/views.json`(빈 자리)을 읽는다
- 기록 형식과 간격은 `collect-views.js` 맨 위 주석. 예측 시점(6시간·24시간·7일)에 예측을 계산해 `pred` 로 고정 저장한다
- 채널 **동영상 탭(UULF… 재생목록)만** 모은다 (쇼츠·라이브 제외)
- 게시 **15일 뒤**부터는 ④ **1일 추세**(최근 하루 증가 g × 하루마다 줄어드는 비율 r)로 다음 **100만 단위**까지 며칠인지 계산하고
  `ms` 로 고정 저장(`e` 닿을 때, `w` 몇 주 차), 닿으면 `hit` 기록. 보여 줄 때는 **1주 ~ 8주**, 8주 안에 닿으면 "유력". 일부러 단순하게 둔다
  화면은 15일 지난 영상을 100만 단위 모드로 보여 주고(그래프는 1주 단위, 8주까지), 순위 줄 탭 **[예측 조회수 | 100만 단위 돌파]** 중 100만 탭은 조회수 90만 이상 영상의 다음 100만 진행 막대·넘는 때 목록
- 조회수 예측기 화면 색은 **빨강 계열**(사이트 나머지의 분홍과 다름). 변수는 theme.css 의 `#v-views{--vg…}`
- 손으로 돌리기: `gh workflow run collect-views.yml` (전체 목록 다시 읽기: `-f full=true`)

## 커밋 신원

공개 저장소이므로 실제 이메일을 쓰지 않는다.

```
user.name   dogns754-boop
user.email  331373950+dogns754-boop@users.noreply.github.com
```
