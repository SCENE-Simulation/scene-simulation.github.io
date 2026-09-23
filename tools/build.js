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
  // integrity: 받은 CSS 가 이 해시와 다르면 브라우저가 쓰지 않는다 (CDN 쪽 파일이 바뀌어도 사이트가 오염되지 않게). 버전을 올리면 해시도 다시
  '<link rel="stylesheet" href="https://cdn.jsdelivr.net/gh/orioncactus/pretendard@v1.3.9/dist/web/variable/pretendardvariable-dynamic-subset.css" integrity="sha384-2nNKoOPayicGa+aRguOQuiZP+RqQ4G3jalfDeOgftkKD7zBM2gJXTwcFqCZltdv0" crossorigin="anonymous">');
// 제목 · 설명 · 링크 미리보기(디시 · 카톡 등 og 태그) · 파비콘(분홍 바탕 "센", 따로 파일 없이 SVG 한 줄 — 없으면 방문마다 favicon.ico 404)
// og:image(대표 그림)는 아직 없음 — 정해지면 1200×630 그림을 img/ 에 두고 og:image · twitter:card=summary_large_image 로
var SITE_DESC = '리센느 포토카드 · 굿즈 컬렉션 북, 포토카드 뽑기 시뮬레이터, 유튜브 조회수 예측기와 예측 게임을 모은 사이트';
var FAVICON = "data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 64 64'%3E%3Crect width='64' height='64' rx='14' fill='%23e96387'/%3E"
  + "%3Ctext x='32' y='45' font-size='34' font-weight='800' text-anchor='middle' fill='%23fff' font-family='sans-serif'%3E%EC%84%BC%3C/text%3E%3C/svg%3E";
rep('<title>빵뽑기 27종 시뮬레이터</title>',
  '<title>센둥이 시뮬레이터</title>\n<meta name="description" content="' + SITE_DESC + '">\n<meta name="theme-color" content="#1c1c1e">\n' +
  '<link rel="icon" href="' + FAVICON + '">\n' +
  '<meta property="og:type" content="website">\n<meta property="og:site_name" content="센둥이 시뮬레이터">\n<meta property="og:title" content="센둥이 시뮬레이터">\n' +
  '<meta property="og:description" content="' + SITE_DESC + '">\n<meta property="og:url" content="https://scene-simulation.github.io/">\n<meta property="og:locale" content="ko_KR">\n' +
  '<meta name="twitter:card" content="summary">');

// 테마 덮어쓰기
rep('</style>\n</head>', fs.readFileSync(__dirname + '/theme.css', 'utf8') + '\n</style>\n</head>');

// 사이드바 + 헤더 + 홈 화면
rep('<body>\n<div class="wrap">', fs.readFileSync(__dirname + '/shell-top.html', 'utf8') + '\n<div class="wrap" id="v-app" hidden>');

// 페이지별 섹션 헤더 (시뮬레이터 본문은 gacha.js 가 채운다)
rep('<div id="page-sim" hidden>',
  '<div id="page-sim" hidden>\n<div class="sec"><div class="sec-t"><svg viewBox="0 0 24 24"><use href="#i-toy"/></svg>장난감<span class="cr">›</span><span class="lt">포토카드 뽑기 시뮬레이션</span></div></div>\n' +
  '<p class="sec-d">콜라보 포토카드를 한 장씩 뽑아 모든 종류를 모을 때까지 드는 비용을 시뮬레이션합니다. 뽑기 화면에서 직접 뽑고, 분석 화면에서 그래프로 내 운과 기대 비용을 확인할 수 있습니다.</p>');
rep('<div id="page-col">',
  '<div id="page-col">\n<div class="sec"><div class="sec-t"><svg viewBox="0 0 24 24"><use href="#i-book"/></svg>포카 컬렉션 북<span class="cr">›</span>2026 포카<span class="cr">›</span><span class="lt">CU 리센느 405빵 콜라보</span></div>' +
  // [공유하기]: 지금 수집 기록으로 이미지 카드 (source.html 의 SG405.share → share.js)
  '<button type="button" class="gs shr-btn" data-shr405 title="지금 수집 기록으로 이미지 카드 만들기"><svg viewBox="0 0 24 24" aria-hidden="true" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="18" cy="5" r="3"/><circle cx="6" cy="12" r="3"/><circle cx="18" cy="19" r="3"/><path d="M8.6 13.5l6.8 4M15.4 6.5l-6.8 4"/></svg>공유하기</button></div>\n' +
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
  // share.js 는 공유 카드(그 순간 기준으로 고정된 PNG 이미지). views.js 가 그릴 때 window.SGShare 를 보므로 먼저
  '<script>\n' + fs.readFileSync(__dirname + '/share.js', 'utf8') + '\n</script>\n' +
  // views-engine.js 는 예측 계산(수집기 collect-views.js 와 같이 씀), views.js 는 화면
  '<script>\n' + fs.readFileSync(__dirname + '/views-engine.js', 'utf8') + '\n</script>\n' +
  '<script>\n' + fs.readFileSync(__dirname + '/views.js', 'utf8') + '\n</script>\n' +
  // 예측의 신: views.js 가 넘겨주는 window.SGV(기록 · 즐겨찾기)를 쓰므로 그 뒤
  '<script>\n' + fs.readFileSync(__dirname + '/oracle.js', 'utf8') + '\n</script>\n' +
  // 기록 백업 · 복원 페이지 (window.SG.pages 에 붙으므로 shell.js 앞)
  '<script>\n' + fs.readFileSync(__dirname + '/backup.js', 'utf8') + '\n</script>\n' +
  '<script>\n' + fs.readFileSync(__dirname + '/shell.js', 'utf8') + '\n</script>\n</body>');

// ===== 이용자 기록 보호: 카드 목록 검사 (tools/cards.lock.json) =====
// 도감 기록 · 포토카드 위시 · 미니게임 기록은 카드를 "몇 번째 카드"(순번)로 저장한다. 카드 순서를 바꾸거나 중간에 끼워 넣거나 빼면
// 이미 저장된 모든 이용자 기록이 다른 카드로 옮겨 붙는다. 컬렉션 id(col:<id>) · 굿즈 상품 id(보유 수량 · 위시 키)도 바꾸면 기록을 못 읽는다.
// → 빌드 때 지금 목록을 cards.lock.json 과 비교해, 잠긴 카드가 빠지거나 자리가 바뀌면 빌드를 멈춘다.
//   맨 뒤에 추가하는 것 · 새 컬렉션은 통과하고 잠금 파일에 더해진다. 같은 자리에서 이름만(또는 그림만) 고친 것도 통과(둘 다 바뀌면 다른 카드로 봄).
//   정말 의도한 변경이면 CARDS_LOCK_ACCEPT=1 로 빌드하면 잠금 파일을 지금 목록으로 새로 쓴다 (이용자 기록이 옮겨 붙는 것을 감수할 때만)
(function cardLock(){
  const vm = require('vm'), LOCK = __dirname + '/cards.lock.json';
  const cur = { collections: {}, goods: {} };
  const m405 = /var CNAME=(\[[^\]]*\]);/.exec(fs.readFileSync(src, 'utf8'));
  if (!m405) throw new Error('카드 목록 검사: source.html 에서 CNAME 을 못 찾음');
  cur.collections.cu405 = vm.runInNewContext(m405[1]).map(function(n){ return { n: n }; });
  const regs = [];
  vm.runInNewContext(fs.readFileSync(__dirname + '/collections.js', 'utf8'), { window: { SGCollection: function(c){ regs.push(c); } } });
  regs.forEach(function(c){ cur.collections[c.id] = c.cards.map(function(x){ return { n: x.n, img: x.img || '' }; }); });
  const gm = /var GCOLS = (\[[\s\S]*?\n  \]);/.exec(fs.readFileSync(__dirname + '/pages.js', 'utf8'));
  if (!gm) throw new Error('카드 목록 검사: pages.js 에서 GCOLS 를 못 찾음');
  vm.runInNewContext('(' + gm[1] + ')').forEach(function(c){ cur.goods[c.id] = c.items.map(function(x){ return x.id; }); });

  const lock = fs.existsSync(LOCK) ? JSON.parse(fs.readFileSync(LOCK, 'utf8')) : null, bad = [];
  if (lock){
    Object.keys(lock.collections || {}).forEach(function(id){
      const now = cur.collections[id];
      if (!now) return bad.push('포카 컬렉션 "' + id + '" 가 사라졌습니다 — id 를 바꾸거나 지우면 이용자 기록(col:' + id + ')을 못 읽습니다');
      lock.collections[id].forEach(function(L, i){
        const C = now[i];
        if (!C) bad.push('"' + id + '" ' + (i + 1) + '번 카드(' + L.n + ')가 빠졌습니다 — 카드는 지우지 말고 맨 뒤에만 추가');
        else if (C.n !== L.n && !(L.img && C.img === L.img)) bad.push('"' + id + '" ' + (i + 1) + '번 카드가 "' + L.n + '" → "' + C.n + '" (순서를 바꾸거나 중간에 끼워 넣으면 기록이 다른 카드로 옮겨 붙습니다)');
      });
    });
    Object.keys(lock.goods || {}).forEach(function(id){
      const now = cur.goods[id];
      if (!now) return bad.push('굿즈 컬렉션 "' + id + '" 가 사라졌습니다');
      lock.goods[id].forEach(function(g){ if (now.indexOf(g) < 0) bad.push('굿즈 "' + id + '" 의 상품 id "' + g + '" 가 사라졌습니다 — 보유 수량 · 위시 저장 키'); });
    });
  }
  if (bad.length && !process.env.CARDS_LOCK_ACCEPT)
    throw new Error('\n카드 목록 검사 실패 — 이용자 기록 보호 (tools/cards.lock.json):\n  - ' + bad.join('\n  - ')
      + '\n  카드는 맨 뒤에만 추가하고, 순서 · id 는 바꾸지 마세요. 정말 의도한 변경이면 CARDS_LOCK_ACCEPT=1 로 다시 빌드.');
  // 새로 쓴다: 잠긴 것은 지금 값(이름 고침 반영), 뒤에 추가된 카드 · 새 컬렉션 · 새 상품도 잠금에 더함. 굿즈는 예전 id 를 남긴다(순서 상관없음)
  const next = { _about: '이용자 기록 보호용 잠금 — build.js 가 관리. 카드 순번 · 컬렉션 id · 굿즈 상품 id 가 바뀌면 빌드를 멈춘다', collections: cur.collections, goods: {} };
  Object.keys(cur.goods).forEach(function(id){
    const old = (lock && lock.goods && lock.goods[id]) || [];
    next.goods[id] = old.concat(cur.goods[id].filter(function(g){ return old.indexOf(g) < 0; }));
  });
  const txt = JSON.stringify(next, null, 1) + '\n';
  if (!lock || fs.readFileSync(LOCK, 'utf8') !== txt){ fs.writeFileSync(LOCK, txt); console.log('cards.lock.json ' + (lock ? '갱신' : '새로 만듦') + (bad.length ? ' (CARDS_LOCK_ACCEPT)' : '')); }
})();

fs.writeFileSync(out, h);
console.log('wrote', out, h.length);
