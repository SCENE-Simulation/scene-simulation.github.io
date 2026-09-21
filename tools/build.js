// 원본 아티팩트(빵뽑기 27종 시뮬레이터)를 센둥이 시뮬레이터 사이트(index.html)로 변환
const fs = require('fs');
const [src, out] = process.argv.slice(2);
let h = fs.readFileSync(src, 'utf8');

function rep(from, to) {
  if (!h.includes(from)) throw new Error('not found: ' + from.slice(0, 60));
  h = h.replace(from, to);
}

// 글꼴: 픽셀 글꼴 → Pretendard / JetBrains Mono
h = h.split('"Do Hyeon"').join('"Pretendard Variable"');
h = h.split('"Press Start 2P",monospace').join('"JetBrains Mono",monospace');
h = h.split("'Press Start 2P',monospace").join("'JetBrains Mono',monospace");
rep('<link rel="stylesheet" href="https://fonts.googleapis.com/css2?family=Do+Hyeon&family=Press+Start+2P&display=swap">',
  '<link rel="stylesheet" href="https://fonts.googleapis.com/css2?family=Noto+Sans+KR:wght@400;500;700&family=JetBrains+Mono:wght@500;700&display=swap">\n' +
  '<link rel="stylesheet" href="https://cdn.jsdelivr.net/gh/orioncactus/pretendard@v1.3.9/dist/web/variable/pretendardvariable-dynamic-subset.css">');
rep('<title>빵뽑기 27종 시뮬레이터</title>',
  '<title>센둥이 시뮬레이터</title>\n<meta name="description" content="리센느 포토카드 뽑기 시뮬레이터와 실물 컬렉션 북">\n<meta name="theme-color" content="#1c1c1e">');

// 테마 덮어쓰기
rep('</style>\n</head>', fs.readFileSync(__dirname + '/theme.css', 'utf8') + '\n</style>\n</head>');

// 사이드바 + 헤더 + 홈 화면
rep('<body>\n<div class="wrap">', fs.readFileSync(__dirname + '/shell-top.html', 'utf8') + '\n<div class="wrap" id="v-app" hidden>');

// 페이지별 섹션 헤더 (시뮬레이터 본문은 gacha.js 가 채운다)
rep('<div id="page-sim" hidden>',
  '<div id="page-sim" hidden>\n<div class="sec"><div class="sec-t"><svg viewBox="0 0 24 24"><use href="#i-toy"/></svg>장난감<span class="cr">›</span><span class="lt">포토카드 뽑기 시뮬레이션</span></div></div>\n' +
  '<p class="sec-d">콜라보 포토카드를 한 장씩 뽑아 모든 종류를 모을 때까지 드는 비용을 시뮬레이션합니다. 뽑기 화면에서 직접 뽑고, 분석 화면에서 그래프로 내 운과 기대 비용을 확인할 수 있습니다.</p>');
rep('<div id="page-col">',
  '<div id="page-col">\n<div class="sec"><div class="sec-t"><svg viewBox="0 0 24 24"><use href="#i-book"/></svg>포카 컬렉션 북<span class="cr">›</span>2026 포카<span class="cr">›</span><span class="lt">CU 리센느 405빵 콜라보</span></div></div>\n' +
  '<p class="sec-d" data-desc="cu405"></p>\n' +
  '<div class="cmeta" data-col="cu405"></div>\n' +
  '<div class="xt" data-col="cu405"></div>');

// 본문 닫기 + 모바일 하단 탭 바
rep('</div>\n<div class="mask" id="mask" hidden>',
  '</div>\n' + fs.readFileSync(__dirname + '/shell-bottom.html', 'utf8') + '\n<div class="mask" id="mask" hidden>');

// 새 페이지(굿즈 · 통합 보기 · 위시리스트) + 포토카드 뽑기 시뮬레이터 + 라우팅 스크립트
// gacha.js 는 collections.js 에 등록된 콜라보를 뽑기 목록에 넣으므로 그 뒤에 온다
rep('</body>',
  '<script>\n' + fs.readFileSync(__dirname + '/collection.js', 'utf8') + '\n</script>\n' +
  '<script>\n' + fs.readFileSync(__dirname + '/collections.js', 'utf8') + '\n</script>\n' +
  '<script>\n' + fs.readFileSync(__dirname + '/gacha.js', 'utf8') + '\n</script>\n' +
  '<script>\n' + fs.readFileSync(__dirname + '/pages.js', 'utf8') + '\n</script>\n' +
  // 조회수 예측기: pages.js 가 만든 window.SG 에 페이지를 붙이므로 그 뒤, shell.js 앞에 온다
  // views-engine.js 는 예측 계산(수집기 collect-views.js 와 같이 씀), views.js 는 화면
  '<script>\n' + fs.readFileSync(__dirname + '/views-engine.js', 'utf8') + '\n</script>\n' +
  '<script>\n' + fs.readFileSync(__dirname + '/views.js', 'utf8') + '\n</script>\n' +
  '<script>\n' + fs.readFileSync(__dirname + '/shell.js', 'utf8') + '\n</script>\n</body>');

fs.writeFileSync(out, h);
console.log('wrote', out, h.length);
