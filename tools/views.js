// 조회수 예측기
// 유튜브 채널 영상의 조회수·좋아요·댓글 기록(스냅샷)으로 앞으로의 조회수를 세 가지 간단한 공식으로 예측하고,
// 과거 영상에 같은 공식을 적용해 본 결과로 오차 범위와 적중률을 보여 준다. 계산식은 views-engine.js.
//
// 데이터: data 브랜치의 views.json — tools/collect-views.js 가 GitHub Actions 에서 15분마다 쌓는다 (형식은 그 파일 맨 위 주석)
//   읽지 못하거나 영상이 없으면 화면 구성을 보여 주기 위한 예시 데이터를 만들어 쓰고, 예시라고 크게 표시한다.
(function(){
  var main = document.querySelector('main.mn');
  if (!main || !window.SG || !window.VE) return;

  var CHANNEL = { handle: '@helloiamwoninicetomeetyou', url: 'https://www.youtube.com/@helloiamwoninicetomeetyou' };
  // 계산은 views-engine.js (수집기와 같이 쓴다)
  var VE = window.VE, TARGETS = VE.TARGETS, MINPOOL = VE.MINPOOL, q = VE.q, mean = VE.mean, at = VE.at, age = VE.age, predictAll = VE.predictAll;

  function $(id){ return document.getElementById(id); }
  function esc(s){ return String(s).replace(/[&<>"']/g, function(c){ return { '&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;' }[c]; }); }
  function full(n){ return Math.round(n).toLocaleString('ko-KR'); }
  // 범위 양 끝이 같은 글자로 반올림되면 자릿수를 늘린다 (6.1만~6.1만 → 6.08만~6.14만)
  function fmtR(lo, hi){
    var a = fmt(lo), b = fmt(hi);
    if (a === b && lo >= 1e4 && hi < 1e6) return (lo / 1e4).toFixed(2) + '만~' + (hi / 1e4).toFixed(2) + '만';
    return a + '~' + b;
  }
  // 12,345 → 1.2만, 1,234,567 → 123만
  function fmt(n){
    n = Math.round(n);
    if (n >= 1e8) return (n / 1e8).toFixed(1).replace(/\.0$/, '') + '억';
    if (n >= 1e4) return (n / 1e4).toFixed(n >= 1e6 ? 0 : 1).replace(/\.0$/, '') + '만';
    return n.toLocaleString('ko-KR');
  }
  function pct(x, d){ return (x * 100).toFixed(d == null ? 0 : d) + '%'; }
  // 반올림해서 0% 이면 부호를 붙이지 않는다 ("−0%" 방지)
  function signPct(x){ var r = Math.round(Math.abs(x) * 100); return (r && x > 0 ? '+' : r && x < 0 ? '−' : '') + r + '%'; }
  function ageTxt(h){
    if (h < 1) return Math.max(1, Math.round(h * 60)) + '분';
    if (h < 48) return Math.floor(h) + '시간';
    var d = Math.floor(h / 24);
    return d + '일' + (d < 7 && h % 24 >= 1 ? ' ' + Math.floor(h % 24) + '시간' : '');
  }
  function hLab(h){ return h < 24 ? h + '시간' : h < 8760 ? (h / 24) + '일' : (h / 8760) + '년'; }
  function two(n){ return n < 10 ? '0' + n : '' + n; }
  function when(ms){ var d = new Date(ms); return (d.getMonth() + 1) + '/' + d.getDate() + ' ' + two(d.getHours()) + ':' + two(d.getMinutes()); }
  // ---------- 기록 읽기 ----------
  var DATA = null, VIDEOS = [];
  // 게시 t시간 뒤 예측에 쓸 과거 영상 (views-engine.js 의 poolFor 에 지금 영상 목록을 넘긴다)
  function poolFor(v, T, whenMs, t){ return VE.poolFor(VIDEOS, v, T, whenMs, t); }

  // ---------- 예측 방법 (계산은 views-engine.js, 여기는 화면에 보일 설명) ----------
  var METHODS = [
    { key: 'm1', no: '①', b: '1', name: '초기 속도 배수법', tab: '초기 속도', color: '#ecd25b',
      short: '지금 조회수가 과거 영상들처럼 늘어난다고 보고 예측합니다.',
      desc: '과거 영상들이 같은 시점 이후 몇 배로 늘었는지 보고, 지금 조회수에 그만큼 곱합니다.',
      uses: ['시간별 조회수', '과거 영상'],
      pro: '가장 단순하고 안정적', con: '초반이 유난히 빠르거나 느린 영상은 놓칠 수 있음' },
    { key: 'm2', no: '②', b: '2', name: '참여도 환산법', tab: '참여도', color: '#a080d0',
      short: '좋아요·댓글 반응으로 앞으로의 조회수를 가늠합니다.',
      desc: '과거 영상에서 좋아요·댓글 1개가 결국 조회수 몇 회로 이어졌는지 보고, 지금의 좋아요·댓글 수로 환산합니다.',
      uses: ['좋아요', '댓글', '과거 영상'],
      pro: '반응이 뜨거운 영상을 더 높게 봄', con: '좋아요·댓글이 적은 극초반엔 흔들림' },
    { key: 'm3', no: '③', b: '3', name: '추세 곡선법', tab: '추세 곡선', color: '#6fe0b3',
      short: '최근 하루 증가량이 영상이 오래될수록 조금씩 줄어든다고 보고 이어 갑니다. 다음 100만 단위 돌파 예측도 이 곡선으로 계산합니다.',
      desc: '다른 영상과 비교하지 않고, 최근 하루 동안 는 조회수를 기준으로 영상 나이가 늘수록 하루 증가가 천천히 줄어드는 곡선을 이어 붙입니다. 줄어드는 정도는 최근 7일 기록으로 재고, 모자라면 기본값을 씁니다. 조회수는 끝없이 오르지 않고 한쪽으로 수렴합니다.',
      uses: ['최근 하루 증가', '영상 나이', '1주일 추이'],
      pro: '과거 영상이 없어도 쓸 수 있고, 오래된 영상의 느린 증가에도 맞음', con: '갑자기 다시 뜨는 영상(역주행)은 늦게 따라감' }
  ];
  var ALL = { key: 'mix', no: '★', b: '★', name: '세 방법 종합', tab: '종합', color: '#ffb547',
    short: '세 방법 예측의 가운데 값입니다. 한 방법이 크게 빗나가도 영향을 덜 받습니다.' };


  // ---------- 트래킹: 정해진 시점(c)에 한 예측을 실제 T 조회수와 비교 ----------
  // 그 시점까지 있던 기록만 쓴다(그 뒤에 목표에 도달한 영상은 과거 영상으로 쓰지 않는다)
  var TRACK = {};
  function track(ti){
    if (TRACK[ti]) return TRACK[ti];
    var tg = TARGETS[ti], rows = [];
    VIDEOS.forEach(function(v){
      if (age(v) < tg.c || VE.since(v) > tg.c) return;               // 예측 시점 기록이 없는 영상(수집 전 영상)은 빼고
      var f = frozen(v, tg), pr, n;
      if (f !== undefined){ if (!f.pr) return; pr = f.pr; n = f.n; }   // 수집기가 저장한 예측이 있으면 그대로
      else {
        var pool = poolFor(v, tg.T, v.pub + tg.c * 3600e3, tg.c);
        pr = predictAll(v, tg.c, tg.T, pool); n = pool.length;
      }
      if (!pr.some(Boolean)) return;
      var done = age(v) >= tg.T, act = done ? at(v, tg.T, 1) : null;
      rows.push({ v: v, pr: pr, done: done, act: act, pool: n,
        res: pr.map(function(r){
          if (!r || !done) return null;
          // 범위 없이 낸 예측(과거 영상이 모자랄 때의 ③)은 적중 여부 없이 오차만 본다
          return { err: (r.p - act) / act, hit: r.lo != null ? act >= r.lo && act <= r.hi : null };
        }) });
    });
    rows.sort(function(a, b){ return b.v.pub - a.v.pub; });
    var sum = [0, 1, 2, 3].map(function(k){
      var d = rows.filter(function(r){ return r.res[k]; }), h = d.filter(function(r){ return r.res[k].hit != null; });
      return { n: d.length, hits: h.length, hit: h.length ? h.filter(function(r){ return r.res[k].hit; }).length / h.length : null,
        mape: d.length ? mean(d.map(function(r){ return Math.abs(r.res[k].err); })) : null };
    });
    return (TRACK[ti] = { rows: rows, sum: sum });
  }

  // ---------- 예시 데이터 (수집기를 연결하기 전 화면 확인용 — 실제 수치가 아님) ----------
  function demo(){
    var seed = 20260921;
    function rnd(){ seed |= 0; seed = seed + 0x6D2B79F5 | 0; var t = Math.imul(seed ^ seed >>> 15, 1 | seed); t = t + Math.imul(t ^ t >>> 7, 61 | t) ^ t; return ((t ^ t >>> 14) >>> 0) / 4294967296; }
    function gauss(){ return Math.sqrt(-2 * Math.log(rnd() + 1e-9)) * Math.cos(2 * Math.PI * rnd()); }
    var now = Date.now(), ages = [5.4, 31.2], vids = [];
    while (ages.length < 36) ages.push(ages[ages.length - 1] + 60 + rnd() * 50);
    ages.reverse().forEach(function(a, n){
      var rl = Math.min(0.08, Math.max(0.02, 0.045 + gauss() * 0.009)), rc = Math.min(0.008, Math.max(0.001, 0.0035 + gauss() * 0.0009));
      var S = 6e4 * Math.exp(gauss() * 0.5) * Math.pow(rl / 0.045, 0.9) * Math.pow(rc / 0.0035, 0.3);   // 반응이 좋은 영상이 더 멀리 간다
      var fast = 0.22 + rnd() * 0.3;                                                                     // 초반 몰림 정도
      function V(t){ return S * (fast * (1 - Math.exp(-t / 5)) + (1 - fast) * (0.75 * (1 - Math.exp(-t / 60)) + 0.25 * Math.log(1 + t / 48) / Math.log(16))); }
      var hrs = [], h;
      for (h = 1; h <= 48; h++) hrs.push(h);
      for (h = 54; h <= 168; h += 6) hrs.push(h);
      for (h = 192; h <= 720; h += 24) hrs.push(h);
      for (h = 888; h <= a; h += 168) hrs.push(h);
      hrs = hrs.filter(function(x){ return x <= a; });
      var last = [0, 0, 0], pt = 0;
      var snaps = hrs.map(function(t){
        var vv = last[0] + Math.max(0, (V(t) - V(pt)) * (1 + gauss() * 0.12)),   // 흔들림은 증가분에 준다(오래된 영상도 조금씩 는다)
            ll = Math.max(last[1], vv * rl * (1 + 0.4 * Math.exp(-t / 12)) * (1 + gauss() * 0.02)),
            cc = Math.max(last[2], vv * rc * (1 + Math.exp(-t / 8)) * (1 + gauss() * 0.03));
        last = [vv, ll, cc]; pt = t;
        return [t, Math.round(vv), Math.round(ll), Math.round(cc)];
      });
      vids.push({ id: 'demo' + two(n + 1), title: '예시 영상 ' + two(n + 1), published: new Date(now - a * 3600e3).toISOString(), snaps: snaps });
    });
    return { demo: true, channel: { handle: CHANNEL.handle, url: CHANNEL.url }, updated: new Date(now - (5.4 % 1) * 3600e3).toISOString(), videos: vids };
  }

  // ---------- 화면 ----------
  var el = document.createElement('section');
  el.id = 'v-views'; el.className = 'wrap page'; el.hidden = true;
  main.appendChild(el);
  window.SG.pages.views = el;
  window.SG.pages.vfav = el;                           // 영상 즐겨찾기(?tab=vfav): 같은 화면을 즐겨찾기 탭으로 연 별도 페이지
  var prevShow = window.SG.onShow;
  window.SG.onShow = function(tab){
    prevShow(tab);
    if (tab === 'views' || tab === 'vfav'){ setRv(tab === 'vfav' ? 'fav' : rv === 'fav' ? rvBack : rv); show(); }
  };

  var ALLM = METHODS.concat([ALL]);                    // 0~2 방법, 3 종합
  var ORDER = [3, 0, 1, 2];                            // 화면에 보이는 순서: 종합 먼저
  var sel = null, mi = 3, si = 1, loading = false;     // 고른 영상, 고른 방법(기본 종합), 성적표 목표(기본 7일)
  var rvBack = 'rank';                                 // 즐겨찾기 페이지에서 순위 줄 탭을 누르면 조회수 예측기의 그 탭으로
  var TABSEL = {};                                     // 순위 줄 탭(예측 조회수 · 100만 단위 돌파 · 명예의 전당 · 즐겨찾기)마다 마지막으로 본 영상 id
  var PRED = {};                                       // 영상·목표별 예측 (한 번 계산하면 재사용)

  // 화면 상태: 순위 기준 창(24시간/7일), 종류 거르기, 표 정렬·검색·보이는 줄 수, 그래프 모드, 펼친 줄
  var siFor = null;                                      // 성적표 탭(si)을 마지막으로 정해 준 영상 — 영상이 바뀔 때만 탭을 다시 고른다
  var rv = 'rank', rk = 24, ft = 'all', ts = 'gain', tq = '', tn = 20, cm = 'cum', OPEN = {}, VC = {}, lastCheck = 0, timer = null;
  // 즐겨찾기: 별표를 누른 영상 id → 누른 때. 위시리스트처럼 이 브라우저에만 저장 (막혀 있으면 이번 방문 동안만)
  var FKEY = 'sendungi:vfav', FAV = (function(){
    try { var o = JSON.parse(localStorage.getItem(FKEY) || '{}'); return o && typeof o === 'object' && !Array.isArray(o) ? o : {}; } catch (e){ return {}; }
  })();
  setTimeout(function(){ favSide(); }, 0);

  function show(){
    if (DATA){ render(); return; }
    if (loading) return;
    loading = true;
    el.innerHTML = head() + '<p class="gnote">기록을 불러오는 중…</p>';
    ready().then(render);
  }
  // 기록을 한 번만 읽는다 — 조회수 예측기와 예측의 신(oracle.js, window.SGV)이 같이 쓴다
  var READY = null;
  function ready(){
    return READY || (READY = load(0).then(function(d){ apply(d); if (!timer) timer = setInterval(tick, 30e3); }));
  }
  // 기록을 화면용으로 바꾼다. 다시 불러와도 고른 영상은 그대로
  function apply(d){
    var keep = sel && sel.id;
    DATA = d; PRED = {}; TRACK = {}; VC = {};
    VIDEOS = d.videos.filter(function(v){ return !v.gone; }).map(function(v, n){
      var s = (v.snaps || []).slice().sort(function(a, b){ return a[0] - b[0]; });
      // 마지막 관측값(now)은 기록 간격 때문에 snaps 에 안 들어갔을 수 있다 → 끝에 붙인다
      if (v.now && (!s.length || v.now[0] > s[s.length - 1][0] + 1e-6)) s.push(v.now);
      // 조회수만: snaps + 최근 74시간의 15분 간격 값(hr) → 15분별 증가를 촘촘하게
      var vs = s.map(function(p){ return [p[0], p[1]]; }).concat((v.hr || []).map(function(p){ return [p[0], p[1]]; }))
        .sort(function(a, b){ return a[0] - b[0]; }).filter(function(p, i, arr){ return !i || p[0] - arr[i - 1][0] > 0.05; });
      return { id: v.id, title: v.title, thumb: v.thumb || '', pub: Date.parse(v.published), hue: (n * 47) % 360,
        type: v.type || 'long', dur: v.dur || 0, pred: v.pred || null, ms: v.ms || [], seg: v.seg || [], snaps: s, vs: { snaps: vs } };
    }).filter(function(v){ return v.snaps.length; }).sort(function(a, b){ return b.pub - a.pub; });
    sel = VIDEOS.filter(function(v){ return v.id === keep; })[0] || VIDEOS[0] || null;
    SUBS.forEach(function(f){ f(); });                  // 새 기록 → 예측의 신 페이지도 다시 그림
  }
  var SUBS = [];
  // 기록은 data 브랜치에 쌓인다(수집기가 15분마다 올림). 못 읽으면 main 의 data/views.json, 둘 다 비었으면 예시 데이터
  var SOURCES = ['https://raw.githubusercontent.com/SCENE-Simulation/scene-simulation.github.io/data/views.json', 'data/views.json'];
  function load(i){
    if (i >= SOURCES.length) return Promise.resolve(demo());
    return fetch(SOURCES[i], { cache: 'no-store' })
      .then(function(r){ if (!r.ok) throw 0; return r.json(); })
      .then(function(d){ if (!d || !d.videos || !d.videos.filter(function(v){ return !v.gone; }).length) throw 0; return d; })
      .catch(function(){ return load(i + 1); });
  }
  // 다음 예약 수집(매시 2·17·32·47분, cron)과 새 기록 확인. 수집 예정 시각이 3분 넘게 지나면 5분마다 다시 읽는다
  var RUNS = [2, 17, 32, 47];
  function nextRun(){
    var u = Date.parse(DATA.updated), d = new Date(u);
    for (var k = 0; k < 8; k++){
      var hh = new Date(d); hh.setUTCMinutes(0, 0, 0); hh.setUTCHours(hh.getUTCHours() + Math.floor(k / 4));
      var t = hh.getTime() + RUNS[k % 4] * 60e3;
      if (t > u + 60e3) return t;
    }
    return u + 15 * 60e3;
  }
  function tick(){
    cntTick();
    // 예측의 신 페이지를 보는 중에도 새 기록을 확인한다 (그 페이지는 조회수 예측기 화면이 숨어 있음)
    if (DATA && !DATA.demo && el.hidden && SGV.active() && nextRun() - Date.now() < -3 * 60e3 && Date.now() - lastCheck > 5 * 60e3) recheck(false);
    var m = $('vx-next'); if (!m || !DATA || DATA.demo || el.hidden) return;
    var left = nextRun() - Date.now();
    m.textContent = left > 60e3 ? '다음 수집 약 ' + Math.ceil(left / 60e3) + '분 뒤' : '새 기록 기다리는 중';
    if (left < -3 * 60e3 && Date.now() - lastCheck > 5 * 60e3) recheck(false);
  }
  function recheck(byHand){
    lastCheck = Date.now();
    var b = $('vx-chk'); if (b) b.classList.add('ing');
    load(0).then(function(d){
      if (b) b.classList.remove('ing');
      if (d.demo || d.updated === DATA.updated){ if (byHand) toast('아직 새 기록이 없습니다'); return; }
      apply(d); render(); toast('새 기록을 반영했습니다 · ' + when(Date.parse(d.updated)));
    });
  }
  function toast(t){
    var x = $('vx-toast'); if (!x) return;
    x.textContent = t; x.hidden = false; clearTimeout(x._t); x._t = setTimeout(function(){ x.hidden = true; }, 3200);
  }
  // ---------- 예측의 신(oracle.js)에 넘기는 것: 기록 · 즐겨찾기 · 100만 단위 계산 ----------
  var SGV = window.SGV = {
    ready: ready,
    demo: function(){ return !!(DATA && DATA.demo); },
    videos: function(){ return VIDEOS; },
    favs: function(){ return VIDEOS.filter(function(v){ return !!FAV[v.id]; }); },   // 종류 거르기(ft)와 상관없이 전부
    views: function(v){ return av(v, age(v)); },                                      // 마지막 기록의 조회수
    lastMs: nowMs,                                                                    // 마지막 기록 시각
    plan: plan,                                                                       // ③ 추세 곡선 { g: 최근 하루 증가, ms: [{ M, days }] } | null
    // 실제로 M 을 넘은 때: 100만 단위 달성 기록(mlgRows)과 같은 계산 — 넘은 두 기록 사이를 곧게 이어 추정. ms0~ms1 = 그 두 기록 시각
    cross: function(v, M){
      var L = mlgRows(v), r = L && L.rows.filter(function(x){ return x.M === M; })[0];
      return r ? { ms: v.pub + r.h * 3600e3, ms0: v.pub + r.h0 * 3600e3, ms1: v.pub + r.h1 * 3600e3 } : null;
    },
    thumb: thumbSrc, fmt: fmt, fmtM: fmtM, full: full,
    onData: function(f){ SUBS.push(f); },
    active: function(){ return false; }                                               // oracle.js 가 "그 페이지가 보이는 중"으로 바꾼다
  };

  function head(){
    return '<div class="sec"><div class="sec-t">' + (rv === 'fav' ? '<svg viewBox="0 0 24 24"><use href="#i-star"/></svg>영상 즐겨찾기'
        : '<svg viewBox="0 0 24 24"><use href="#i-toy"/></svg>장난감<span class="cr">›</span><span class="lt">조회수 예측기</span>') + '</div></div>'
      + '<div class="vx-hero"><div class="vx-meta" id="vx-meta"></div>'
      + '<h2 class="vx-h">' + (rv === 'fav' ? '즐겨찾기한 영상들,' : '안원잘부 영상들,') + '<br>조회수가 <em>어디까지 오를까?</em></h2>'
      + '<p class="vx-d">15분마다 조회수를 수집하여, 24시간·7일·30일 뒤 조회수와 다음 100만 단위 돌파 시점을 예측하는 계산기입니다.<br>지난 예측이 맞았는지 오차율도 채점해 기록합니다.<br>예측기의 계산식은 비전문가가 만든 것이므로 재미로만 참고해 주세요.</p></div>';
  }
  function status(v){
    var a = age(v);
    if (a < VE.LATE) for (var k = 0; k < TARGETS.length; k++) if (a < TARGETS[k].T) return { t: TARGETS[k].name + ' 예측 중', live: true };
    return { t: a >= VE.LATE ? '100만 단위 추적' : '30일 지남', live: false };
  }
  // 썸네일: 수집한 주소 → 유튜브 기본 썸네일 → (예시 데이터) 색 카드
  function thumbSrc(v){ return v.thumb || (DATA.demo ? '' : 'https://i.ytimg.com/vi/' + encodeURIComponent(v.id) + '/mqdefault.jpg'); }
  function thumb(v){
    var src = thumbSrc(v);
    return src ? '<img src="' + esc(src) + '" alt="" loading="lazy">'
      : '<span class="vt-ph" style="--h:' + v.hue + '"><em>' + esc(v.title) + '</em></span>';
  }
  var PLAY = '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M8 5.5v13l10.5-6.5z" fill="currentColor"/></svg>';

  // 영상 v 의 목표 k 예측. 목표가 지났으면 그 목표의 예측 시점(c)에 했던 예측과 실제
  function hz(v, k){
    var key = v.id + '|' + k;
    if (PRED[key]) return PRED[key];
    var tg = TARGETS[k], a = age(v), done = a >= tg.T, t = done ? tg.c : a;
    var o = { tg: tg, done: done, t: t, act: done ? at(v, tg.T, 1) : null }, f = done ? frozen(v, tg) : undefined;
    if (done && o.act == null) o.err = '수집을 시작하기 전에 지난 시점이라 기록이 없습니다';
    else if (f !== undefined){ if (f.pr) o.pr = f.pr; else o.err = f.err; }
    else if (t < 1) o.err = '게시 1시간 뒤부터 예측합니다';
    else if (VE.since(v) > t) o.err = '수집을 시작하기 전에 ' + tg.from + '이 지나 예측할 수 없습니다';
    else {
      var pool = poolFor(v, tg.T, v.pub + t * 3600e3, t), pr = predictAll(v, t, tg.T, pool), m3 = VE.m3From(v);
      o.pool = pool.length;
      if (pr.some(Boolean)) o.pr = pr;
      else o.err = !done && m3 > t && m3 < tg.T ? '기록이 조금 더 쌓이면(약 ' + ageTxt(m3 - t) + ' 뒤) 추세 곡선 예측이 나옵니다'
        : '게시 직후부터 기록한 영상이 ' + MINPOOL + '개 이상 모이면 예측합니다 (지금 ' + pool.length + '개)';
    }
    return (PRED[key] = o);
  }
  // 수집기가 예측 시점(c)에 저장해 둔 예측. 있으면 다시 계산하지 않는다 → 공식을 고쳐도 지난 성적은 그대로
  //   v.pred[T] = { t, n, p: [[예측, 범위 아래, 범위 위] | null × 4(①②③종합)] }  또는  { none: 'early' | 'pool', n }
  function frozen(v, tg){
    var f = v.pred && v.pred[tg.T];
    if (!f) return undefined;
    if (!f.p) return { err: f.none === 'early' ? '수집을 시작하기 전에 ' + tg.from + '이 지나 예측하지 않았습니다'
      : '그때는 게시 직후부터 기록한 과거 영상이 부족해 예측하지 않았습니다 (' + (f.n || 0) + '개)' };
    return { pr: f.p.map(function(r){ return r ? { p: r[0], lo: r[1], hi: r[2] } : null; }), n: f.n };
  }

  // ---------- 상승 속도 ----------
  // 게시 후 t시간의 조회수 (최근 74시간은 15분 간격 값까지 써서 촘촘하게)
  function av(v, t){ return at(v.vs, t, 1); }
  // 최근 W시간 동안 는 조회수 { x, kind }
  //   real: 기록으로 잰 값 · est: 기록이 W시간보다 짧아 지금 속도로 늘려 잡은 값
  //   pred: 게시 W시간이 안 된 영상의 W시간째 예측 · sofar: 예측이 없어 지금까지의 조회수 · wait: 아직 잴 수 없음
  function velo(v, W){
    var key = v.id + '|' + W;
    if (VC[key]) return VC[key];
    var a = age(v), V = av(v, a), o;
    if (a < W){
      var h = hz(v, W === 24 ? 0 : 1), r = h.pr ? h.pr[3] : null;
      o = r ? { x: r.p, kind: 'pred' } : { x: V, kind: 'sofar' };
    } else {
      var b = av(v, a - W), s = v.vs.snaps[0][0];
      o = b != null ? { x: V - b, kind: 'real' } : a - s >= 1 ? { x: (V - av(v, s)) / (a - s) * W, kind: 'est' } : { x: null, kind: 'wait' };
    }
    return (VC[key] = o);
  }
  // 1주 뒤 예상 조회수 { x: 예상 누적, gain: 늘 양, kind: 'pred' | 'est' | 'wait' }
  //   30일 예측 중: 지금 → 24시간·7일·30일 종합 예측을 로그 시간으로 이은 곡선 위 1주 뒤, 그 뒤: ③ 추세 곡선의 1주 뒤
  //   예측이 없으면 ③ 추세 곡선의 1주 뒤 (추정 — 24시간 증가 × 7 직선은 며칠 된 영상에서 크게 부풀어 버림)
  function week1(v){
    var key = v.id + '|w1';
    if (VC[key]) return VC[key];
    var a = age(v), V = av(v, a), T = a + 168, o = null;
    if (a >= VE.LATE){ var p = plan(v); if (p) o = { x: p.wk[0], kind: 'pred' }; }
    else {
      var pts = [[a, V]];
      TARGETS.forEach(function(tg, k){ if (tg.T <= a) return; var r = hz(v, k).pr, x = r && r[3] ? r[3].p : null; if (x && x > pts[pts.length - 1][1]) pts.push([tg.T, x]); });
      for (var i = 1; i < pts.length && !o; i++) if (pts[i][0] >= T){
        var p0 = pts[i - 1], p1 = pts[i], f = (Math.log(1 + T) - Math.log(1 + p0[0])) / (Math.log(1 + p1[0]) - Math.log(1 + p0[0]));
        o = { x: p0[1] + f * (p1[1] - p0[1]), kind: 'pred' };
      }
    }
    if (!o){ var p4 = plan(v); if (p4) o = { x: p4.wk[0], kind: 'est' }; }                          // 예측이 없으면 ③ 추세 곡선의 1주 뒤 (추정)
    return (VC[key] = o ? { x: o.x, gain: o.x - V, kind: o.kind } : { x: null, gain: null, kind: 'wait' });
  }
  // 100만 단위 돌파 목록: 조회수 90만 이상인 영상(나이 상관없음). 다음 100만까지 며칠 — ③ 추세 곡선(하루 증가 × 하루마다 줄어드는 비율)으로만
  function board(){
    var key = 'board|' + ft;
    if (VC[key]) return VC[key];
    return (VC[key] = list().map(function(v){
      var a = age(v), V = av(v, a); if (!(V >= 9e5)) return null;
      var M = (Math.floor(V / VE.MSTEP) + 1) * VE.MSTEP, eta = null, why = 'wait';        // why: 못 구한 까닭 (wait 기록 부족, far 지금 추세로는 못 닿음)
      var p = plan(v), m = p && p.ms[0]; if (m){ if (m.days != null) eta = m.days; else why = 'far'; }
      return { v: v, V: V, M: M, eta: eta, why: why };
    }).filter(Boolean).sort(function(x, y){ return (x.eta == null ? 1e9 : x.eta) - (y.eta == null ? 1e9 : y.eta) || y.V - x.V; }));
  }
  function in8(x){ return x.eta != null && x.eta <= VE.WEEKS * 7; }
  var KIND = { est: '추정', pred: '예측', sofar: '진행 중', wait: '수집 중' };
  function kindTag(o){ return KIND[o.kind] ? '<i class="vk vk-' + o.kind + '">' + KIND[o.kind] + '</i>' : ''; }

  function fmtM(M){ return M >= 1e8 ? fmt(M) : Math.round(M / 1e4).toLocaleString('ko-KR') + '만'; }
  // 다음 100만 단위에 닿는 때 { M, h: 마지막 기록부터 몇 시간 뒤 | null(못 닿음), how, far: 8주보다 멂, p: ③ }
  //   ③ 추세 곡선(plan)으로 본다 → 현황 칸 카운터 · 위쪽 알약 · 그래프의 돌파 점 · 표 펼친 줄 · 100만 목록이 같은 값.
  //   ③ 을 아직 못 구하면(최근 기록 3시간 전) 예측 곡선(지금 → 24시간·7일·30일 종합 예측, 로그 시간으로 잇기) 위에서 찾는다
  function milestone(v){
    var key = v.id + '|ms';
    if (VC[key]) return VC[key];
    var a = age(v), V = av(v, a), M = (Math.floor(V / VE.MSTEP) + 1) * VE.MSTEP, p = plan(v), m = p && p.ms[0], pts = [[a, V]], o = null;
    if (m) return (VC[key] = { M: m.M, h: m.days == null ? null : m.days * 24, how: 'lt', far: m.days == null || m.days > VE.FAR, p: p });
    TARGETS.forEach(function(tg, k){
      if (tg.T <= a) return;
      var r = hz(v, k).pr, x = r && r[3] ? r[3].p : null;
      if (x && x > pts[pts.length - 1][1]) pts.push([tg.T, x]);
    });
    for (var i = 1; i < pts.length && !o; i++) if (pts[i][1] >= M){
      var p0 = pts[i - 1], p1 = pts[i], f = (M - p0[1]) / (p1[1] - p0[1]);
      o = { M: M, h: Math.exp(Math.log(1 + p0[0]) + f * (Math.log(1 + p1[0]) - Math.log(1 + p0[0]))) - 1 - a, how: 'pred', far: false };
    }
    return (VC[key] = o || { M: M, h: null, how: 'none' });
  }
  function soon(v){ var m = milestone(v); return m.h != null && m.h <= 48 ? m : null; }       // 48시간 안이면 "곧"
  function fmtDur(s){
    if (!s) return '';
    var h = Math.floor(s / 3600), m = Math.floor(s % 3600 / 60), x = s % 60;
    return h ? h + '시간' + (m ? ' ' + m + '분' : '') : m ? m + '분' + (x ? ' ' + x + '초' : '') : x + '초';
  }
  function ymd(ms){ var d = new Date(ms); return String(d.getFullYear()).slice(2) + '.' + two(d.getMonth() + 1) + '.' + two(d.getDate()) + ' ' + two(d.getHours()) + ':' + two(d.getMinutes()); }
  function setRv(to){
    if (to === rv) return false;
    if (sel) TABSEL[rv] = sel.id;
    if (to === 'fav') rvBack = rv;
    rv = to;
    if (!DATA) return true;
    var back = VIDEOS.filter(function(x){ return x.id === TABSEL[rv]; })[0], next;
    if (rv === 'ms'){ var MB = board().map(function(x){ return x.v; }); next = MB.indexOf(back) >= 0 ? back : MB.indexOf(sel) >= 0 ? sel : MB[0]; }
    else if (rv === 'hof'){ var HL = hall(), HA = HL.top.concat(HL.next).map(function(x){ return x.v; }); next = HA.indexOf(back) >= 0 ? back : HA.indexOf(sel) >= 0 ? sel : HA[0] || VIDEOS[0]; }
    else if (rv === 'fav'){ var FA = favList().sort(byGain); next = FA.indexOf(back) >= 0 ? back : FA.indexOf(sel) >= 0 ? sel : FA[0] || sel; }
    else next = back || VIDEOS[0];
    if (next) sel = next;
    return true;
  }
  // 다른 페이지로 (사이드바 메뉴를 누른 것과 같게: 주소 바꾸고 shell 이 페이지를 다시 보여 줌)
  function goTab(t){ history.pushState(null, '', '?tab=' + t); window.dispatchEvent(new PopStateEvent('popstate')); }
  function list(){
    return VIDEOS.filter(function(v){ return ft === 'all' || v.type === ft; });
  }
  function byGain(a, b){
    var x = velo(a, rk).x, y = velo(b, rk).x;
    return (y == null ? -1 : y) - (x == null ? -1 : x);
  }

  // ---------- 100만 단위 돌파 (③ 추세 곡선 — 오래될수록 하루 증가가 줄어 한쪽으로 수렴, 1주 ~ 8주로 보여 줌, 계산은 views-engine.js) ----------
  // 색: ③ 추세 곡선과 같은 민트. 누적·예측 그래프의 돌파 점 · 100만 단위 모드 상세(카드 · 100만 그래프) · 100만 목록이 같이 쓴다
  var MSC = '#6fe0b3';
  // 30일 예측이 끝난 영상: 상세 화면을 100만 단위 모드로 (100만 목록 · 추이 · 구간 채점은 나이와 상관없음)
  function late(v){ return age(v) >= VE.LATE; }
  // ③ 추세 곡선. 최근 기록이 3시간 이상이면 계산한다 (현황 칸 카운터 · 100만 목록 · 100만 추이가 쓴다)
  function plan(v){
    var key = v.id + '|plan';
    if (!(key in VC)) VC[key] = VE.msPlan(v.vs, age(v), 3);
    return VC[key];
  }
  function nowMs(v){ return v.pub + age(v) * 3600e3; }
  // 날짜: 올해가 아니면 연도를 붙인다 (27.3/5)
  // 해가 다르면 연도를 앞에 ("28년 2/24"). 예전 "28.2/24" 는 소수처럼 읽혔다
  function dY(ms, ref){ var d = new Date(ms); return (d.getFullYear() !== new Date(ref).getFullYear() ? String(d.getFullYear()).slice(2) + '년 ' : '') + (d.getMonth() + 1) + '/' + d.getDate(); }
  function dday(v, h){ return dY(nowMs(v) + h * 3600e3, nowMs(v)); }
  // 100만 목록 달성까지 (숫자 먼저): 3일 안은 N시간 N분, 2주 안은 N일 N시간, 그 뒤는 N주 N일 / 그때 날짜 + 오전·오후
  function etaHM(d){
    var mn = Math.max(1, Math.round(d * 1440)), hh = Math.round(d * 24), dd = Math.round(d);
    if (mn < 72 * 60) return (mn >= 60 ? Math.floor(mn / 60) + '시간' + (mn % 60 ? ' ' : '') : '') + (mn % 60 ? mn % 60 + '분' : '');
    if (hh < 14 * 24) return Math.floor(hh / 24) + '일' + (hh % 24 ? ' ' + hh % 24 + '시간' : '');
    return Math.floor(dd / 7) + '주' + (dd % 7 ? ' ' + dd % 7 + '일' : '');
  }
  function ddayAP(v, h){ var t = nowMs(v) + h * 3600e3; return dday(v, h) + ' ' + (new Date(t).getHours() < 12 ? '오전' : '오후'); }
  // 달성까지 남은 때: 하루 안은 N시간, 7일까지는 N일, 그 뒤는 N주 (올림)
  function daysTxt(d){ return d == null ? '못 닿음' : d < 1 ? Math.max(1, Math.ceil(d * 24)) + '시간' : d <= 7 ? Math.ceil(d) + '일' : Math.ceil(d / 7) + '주'; }
  // 100만 단위 추이: ③ 추세 곡선으로 본 앞으로 1주 동안 늘 조회수가 채널 영상 중 몇 번째인지 (상위 20% 강함 · 50% 중간 · 그 아래 약함)
  function ltTrend(v){
    var key = v.id + '|ltr';
    if (key in VC) return VC[key];
    var P = plan(v); if (!P) return (VC[key] = null);
    var gain = function(p){ return p.wk[0] - p.V; }, x = gain(P);
    var xs = VIDEOS.map(function(o){ return plan(o); }).filter(Boolean).map(gain);
    var r = xs.filter(function(y){ return y > x; }).length + 1, lv = TREND.filter(function(t){ return r / xs.length <= t.max; })[0];
    return (VC[key] = { x: x, rank: r, n: xs.length, lv: lv });
  }
  function dropTxt(r){ var x = Math.round((1 - r) * 1000) / 10; return x > 0 ? '하루마다 −' + x + '%' : '지금 속도 그대로'; }
  // 게시일 기준 주차: 게시 후 0~7일 = 1주 차, 7~14일 = 2주 차 … 시간이 가면 주차가 계속 넘어간다.
  //   막대와 그래프(1주)는 지금 주차부터 WKN 개 주를 보여 준다
  var WKN = 6;
  function wkOf(days){ return Math.floor(days / 7) + 1; }
  function msWeek(v, m){ return m.days == null ? null : wkOf(age(v) / 24 + m.days); }        // 이 100만 단위를 넘는 주차
  function pubWeeks(v, p){                                                                  // [{ k: 주차, d: 그 주 끝까지 며칠, x: 그때 예상 조회수 }]
    var ad = age(v) / 24, out = [];
    for (var k = wkOf(ad); out.length < WKN; k++){ var d = 7 * k - ad; out.push({ k: k, d: d, x: VE.dayProject(p, d) }); }
    return out;
  }
  // 주차 막대: 그 주가 끝날 때까지 다음 100만까지 남은 조회수를 얼마나 채우는지 (100% = 돌파). 넘는 주를 강조
  function wkBars(v, p, m, big){
    var gap = m.M - p.V, wk = pubWeeks(v, p), mw = msWeek(v, m);
    return (big ? '<span class="wk-lg"><span title="남은 조회수를 그 주가 끝날 때까지 몇 % 채우는지 (100 = 돌파)">주차별 진행률 (%)</span><span class="wk-lk"><span><i></i>돌파하는 주</span><span><i class="wkgd"></i>달성</span></span></span>' : '')
      + '<span class="wk' + (big ? ' big' : '') + '" role="img" aria-label="주차별 진행률 ' + wk.map(function(o){ return o.k + '주 차 ' + Math.min(100, Math.round((o.x - p.V) / gap * 100)) + '%'; }).join(', ') + '">'
      + wk.map(function(o){
          var f = Math.max(0, Math.min(1, (o.x - p.V) / gap));
          return '<i class="' + (o.k === mw ? 'lw' : f >= 1 ? 'wkgd' : '') + '" style="--h:' + Math.max(4, f * 100).toFixed(0) + '%" title="' + o.k + '주 차 끝(' + dday(v, o.d * 24) + ') ' + fmt(o.x) + ' (' + Math.round(f * 100) + '%)">'
            + (big ? '<em>' + Math.round(f * 100) + '</em>' : '') + '</i>';
        }).join('') + '</span>'
      + (big ? '<span class="wk-x">' + wk.map(function(o){ return '<span>' + o.k + '주</span>'; }).join('') + '</span>' : '');
  }

  // 상세(30일 예측이 끝난 영상): 다음 100만 단위 세 개 (초기 예측 결과·구간 기록은 그래프 아래 예측 성적표에)
  function renderLate(){
    var v = sel, p = plan(v);
    $('vd-md').innerHTML = '<i style="background:' + MSC + '"></i><span>' + METHODS[2].short + '</span>'
      + (p ? '<em>최근 하루 +' + fmt(p.g) + '회 · ' + dropTxt(p.r)
        + (p.src === 'data' ? ' (최근 ' + Math.min(7, Math.floor(p.days)) + '일 기록)' : ' (기록 2일이 쌓이기 전이라 기본 곡선)') + '</em>' : '');
    $('vd-hs').innerHTML = p ? p.ms.map(function(m){ return msCard(v, p, m); }).join('')
      : '<div class="vh na" style="grid-column:1/-1"><div class="vh-h"><div><b>100만 단위 돌파</b></div><span class="vh-tag">예측 준비 중</span></div>'
        + '<small class="vh-n">최근 기록이 3시간 이상 쌓이면 예측합니다.</small></div>';
    $('vd-ex').innerHTML = '';
    chart();
  }
  function msCard(v, p, m){
    var ok = VE.likely(m);
    return '<div class="vh ms" style="--mc:' + MSC + '">'
      + '<div class="vh-h"><div><b>' + fmtM(m.M) + ' 돌파</b><small>' + fmt(m.M - p.V) + ' <i class="ko">남음</i></small></div>'
      + '<span class="vh-tag ' + (ok ? 'hit' : '') + '">' + (ok ? msWeek(v, m) + '주 차' : m.days == null ? '지금 추세로는 못 닿음' : '8주 넘게') + '</span></div>'
      + '<div class="vh-v">' + (m.days == null ? '—' : Math.ceil(m.days) + '<small>일 뒤 · ' + dday(v, m.days * 24) + ' 무렵</small>') + '</div>'
      + '<div class="vh-up">하루 +' + fmt(p.g) + ' · ' + dropTxt(p.r) + '</div>'
      + wkBars(v, p, m, true) + '</div>';
  }
  // ---------- 100만 단위 구간 채점 (수집기가 고정한 seg: 구간마다 100만·50만·20만 남은 지점에서 한 도달 예측) ----------
  //   오차 = (예측 − 실제) ÷ 그 지점부터 실제로 걸린 시간. 범위 안 = 실제가 예측 범위(r ± 3%p) 안.
  //   8주보다 멀거나 못 닿는다고 본 예측(far)은 참고 — 평균에서 뺀다
  var SEGS = ['100만 남음', '50만 남음', '20만 남음'];
  function ampm(ms){ var h = new Date(ms).getHours(); return (h < 12 ? '오전 ' : '오후 ') + (h % 12 || 12) + '시'; }
  function segRes(s, c){
    if (s.hit == null || !(s.hit > c.t)) return null;                                   // 아직 안 닿음
    if (c.e == null) return { none: true, inR: false };                                  // 못 닿는다고 봤는데 닿음
    return { err: (c.e - s.hit) / (s.hit - c.t), days: (c.e - s.hit) / 24,
      inR: s.hit >= c.lo - 0.01 && (c.hi == null || s.hit <= c.hi + 0.01) };
  }
  function segAll(){
    if (VC.seg) return VC.seg;
    var rows = [];
    VIDEOS.forEach(function(v){ (v.seg || []).forEach(function(s){
      if (!s.c || !s.c.length) return;
      rows.push({ v: v, s: s, when: v.pub + (s.hit != null ? s.hit : Math.max.apply(null, s.c.map(function(c){ return c.t; }))) * 3600e3 });
    }); });
    rows.sort(function(x, y){ return y.when - x.when; });
    var sum = [0, 1, 2].map(function(k){
      var sc = [], far = 0, wait = 0;
      rows.forEach(function(x){ x.s.c.forEach(function(c){
        if (c.k !== k) return;
        var r = segRes(x.s, c);
        if (!r) wait++; else if (c.far) far++; else sc.push(r);
      }); });
      var e = sc.filter(function(r){ return !r.none; });
      return { n: sc.length, far: far, wait: wait, mape: e.length ? mean(e.map(function(r){ return Math.abs(r.err); })) : null,
        hit: sc.length ? sc.filter(function(r){ return r.inR; }).length / sc.length : null };
    });
    return (VC.seg = { rows: rows, sum: sum });
  }
  // 지점 칸: 넘은 날 · 예측한 도달 · 범위 · 결과(오차)
  function segCell(v, s, k){
    var c = (s.c || []).filter(function(x){ return x.k === k; })[0];
    if (!c){                                                                             // 아직 안 지났거나, 지날 때 예측을 못 함(수집 전)
      var yet = s.hit == null && av(v, age(v)) < s.M - VE.MSTEP + VE.SEGK[k];
      return '<div class="sg-c none"><small>' + SEGS[k] + '</small><b>—</b><span class="sg-rg">' + (yet ? '이 지점을 지나면 예측' : '예측 없음 (수집 전)') + '</span></div>';
    }
    var D = function(t){ var d = new Date(v.pub + t * 3600e3); return (d.getFullYear() !== new Date(v.pub + c.t * 3600e3).getFullYear() ? d.getFullYear() + '년 ' : '') + (d.getMonth() + 1) + '/' + d.getDate(); }, r = segRes(s, c);
    var DH = function(t){ var h = Math.round(t); return D(h) + ' ' + ampm(v.pub + h * 3600e3); };        // 정시로 반올림한 날짜 + 오전·오후 N시
    var rg = c.lo == null ? '' : c.hi == null ? D(c.lo) + ' ~ 못 닿을 수도' : D(c.lo) === D(c.hi) ? '' : D(c.lo) + ' ~ ' + D(c.hi);
    var res = !r ? '<span class="sg-e">진행 중</span>'
      : r.none ? '<span class="sg-e miss">✗ 못 닿는다고 봤지만 닿음</span>'
      : '<span class="sg-e ' + (r.inR ? 'hit' : 'miss') + '">' + (Math.abs(r.days) < 0.05 ? '±0' : (r.days > 0 ? '+' : '−') + Math.abs(Math.round(r.days * 10) / 10)) + '일 (' + signPct(r.err) + ') ' + (r.inR ? '✓' : '✗') + '</span>';
    return '<div class="sg-c' + (c.far ? ' far' : '') + '"><small>' + SEGS[k] + ' · ' + D(c.t) + (c.far ? '<i class="sg-far">참고</i>' : '') + '</small>'
      + '<b>' + (c.e == null ? '못 닿음' : '예측 ' + DH(c.e)) + '</b>'
      + (rg ? '<span class="sg-rg">범위 ' + rg + '</span>' : '') + res + '</div>';
  }
  // 구간 한 줄: (영상) · 1,300만 → 1,400만 · 닿은 때 또는 남은 조회수 / 세 지점 칸
  function segRow(v, s, mine){
    var done = s.hit != null, at0 = v.pub + (done ? s.hit : 0) * 3600e3;
    var st = done ? '<span class="sg-done">✓ ' + dY(at0, nowMs(v)) + ' ' + hm(at0) + ' 도달</span>' + (s.est ? ' <small>(추정)</small>' : '')
      : '진행 중 · ' + fmt(Math.max(0, s.M - av(v, age(v)))) + ' 남음';
    return '<div class="sg-r' + (!mine && v === sel ? ' on' : '') + '"><div class="sg-h">'
      + (mine ? '' : '<button type="button" class="vs-v" data-vid="' + esc(v.id) + '" data-go="1"><span class="vs-th">' + thumb(v) + '</span>' + esc(v.title) + '</button>')
      + '<span class="sg-m">' + fmtM(s.M - VE.MSTEP) + ' → <b>' + fmtM(s.M) + '</b></span><span class="sg-st' + (done ? ' done' : '') + '">' + st + '</span></div>'
      + '<div class="sg-cs">' + [0, 1, 2].map(function(k){ return segCell(v, s, k); }).join('') + '</div></div>';
  }

  // 그래프(100만 단위 모드): 최근 2주(기록이 더 짧으면 기록 시작)부터 → 지금 → 앞으로 (③ 추세 곡선). 가로 눈금은 [1일 | 1주]
  //   1일: 14일 뒤까지 · 1주: 게시일 기준 주차 칸, 지금 주차부터 WKN(6)개 주가 끝날 때까지.
  //   넘은 때가 기록 전이면(수집 전에 넘은 영상) 첫 기록부터
  //   1시간: 예측 대신 최근 7일의 1시간 단위 증가 막대 (30일 예측 중인 영상의 "1시간" 탭과 같은 barChart)
  var mu = 'w', MU = { h: { tab: '1시간' }, d: { tab: '1일', n: 14, step: 24, u: '일' }, w: { tab: '1주' } };
  function msTabs(){
    return ['h', 'd', 'w'].map(function(k){ return '<button type="button" data-mu="' + k + '" class="' + (mu === k ? 'on' : '') + '" aria-selected="' + (mu === k) + '">' + MU[k].tab + '</button>'; }).join('');
  }
  function msStart(v, a){
    var V = av(v, a), M0 = Math.floor(V / VE.MSTEP) * VE.MSTEP, s0 = VE.since(v.vs), sn = v.vs.snaps;
    if (!(M0 > 0)) return { h: s0, M: null };                                         // 아직 100만 전
    for (var i = 0; i < sn.length; i++) if (sn[i][1] >= M0){
      if (!i || sn[i - 1][0] < s0) return { h: s0, M: M0, before: true };
      var p0 = sn[i - 1], p1 = sn[i], f = (M0 - p0[1]) / (p1[1] - p0[1] || 1);
      return { h: p0[0] + (p1[0] - p0[0]) * f, M: M0 };
    }
    return { h: s0, M: M0, before: true };
  }
  function msChart(){
    var v = sel, a = age(v), p = plan(v), box = $('vd-chart'), U = MU[mu];
    var W = Math.max(320, Math.min(860, (box.clientWidth || 760) - 28)), H = 300, L = 62, R = 16, Tp = 24, B = 30;
    if (mu === 'h'){
      var HU = UNITS.h;
      box.innerHTML = chHead('조회수 증가', HU.tab + ' 단위 · ' + barRange(v, 'h', HU.span), msTabs())
        + '<div class="vt-hc">' + barChart(v, 'h', HU.span, W, 240) + '</div>'
        + '<p class="gnote">유튜브가 조회수를 한꺼번에 갱신할 때가 있어 막대가 가끔 튈 수 있습니다.</p>';
      return;
    }
    var kNow = wkOf(a / 24), kEnd = kNow + WKN - 1;
    // 가로축: 최근 2주 전(기록이 더 짧으면 기록 시작)이 왼쪽 끝(한 번 표시), 오른쪽은 1일 = 14일 뒤 · 1주 = 지금 주차부터 6개 주 끝.
    //   시간이 갈수록 실제 선이 오른쪽으로 자라는 그래프. 눈금은 12개(실제 날짜).
    //   수집 시작 전 구간(기록 없음)이 하루 넘게 길면 그 구간은 왼쪽 좁은 칸(GAPW)으로 접고 ⋯ 표시 — 시작점만 보이고 중간은 생략
    var s = Math.max(VE.since(v.vs), a - 336), sTxt = s > VE.since(v.vs) + 1e-6 ? '2주 전부터' : '기록 시작', end = mu === 'w' ? kEnd * 168 : a + U.n * U.step, fut = [], t0 = v.pub + s * 3600e3;
    var s0 = VE.since(v.vs), gapW = s0 > s + 24 ? 46 : 0, sB = gapW ? Math.max(s, s0 - 6) : s;      // sB: 접힌 칸 오른쪽 = 기록 시작 조금 앞
    var endTxt = mu === 'w' ? kEnd + '주 차 끝(' + md(v.pub + end * 3600e3) + ')' : md(v.pub + end * 3600e3);
    var pts = v.vs.snaps.filter(function(q){ return q[0] > s + 1e-6 && q[0] <= a + 1e-6; }), sv = av(v, s);
    if (sv != null) pts.unshift([s, sv]);
    if (p){
      var span = (end - a) / 24;
      for (var dd = 0; dd < span; dd += mu === 'd' ? 0.25 : 1) fut.push([a + dd * 24, VE.dayProject(p, dd)]);
      fut.push([end, VE.dayProject(p, span)]);
    }
    var ys = pts.map(function(q){ return q[1]; }).concat(fut.map(function(q){ return q[1]; }));
    var y0 = Math.min.apply(null, ys), y1 = Math.max.apply(null, ys), M1 = p && p.ms[0].M, showM1 = M1 && M1 <= y1 + (y1 - y0) * 0.35;
    if (showM1) y1 = Math.max(y1, M1);
    var pad = (y1 - y0) * 0.08 || y1 * 0.02; y0 = Math.max(0, y0 - pad); y1 += pad;
    // 가로 위치: 접힌 칸(s~sB)은 gapW 픽셀에, 나머지(sB~end)는 남은 폭에 고르게
    var PW = W - L - R - gapW;
    function X(h){ return h <= sB ? L + (gapW ? (h - s) / (sB - s) * gapW : 0) : L + gapW + (h - sB) / (end - sB) * PW; }
    function Hx(x){ return x <= L + gapW ? (gapW ? s + Math.max(0, (x - L) / gapW) * (sB - s) : s) : sB + Math.max(0, Math.min(1, (x - L - gapW) / PW)) * (end - sB); }
    function Y(y){ return Tp + (1 - (y - y0) / (y1 - y0)) * (H - Tp - B); }
    var svg = '<svg viewBox="0 0 ' + W + ' ' + H + '" role="img" aria-label="' + U.tab + ' 단위 100만 돌파 예상">'
      + '<defs><pattern id="vg-h3" width="7" height="7" patternUnits="userSpaceOnUse" patternTransform="rotate(45)"><rect width="7" height="7" fill="rgba(255,255,255,.015)"/><line x1="0" y1="0" x2="0" y2="7" stroke="rgba(255,255,255,.07)" stroke-width="2"/></pattern></defs>';
    // 수집을 시작하기 전 구간: 접힌 칸이면 빗금 + ⋯ + 축 끊김 표시(//), 아니면 빗금 + "기록 없음"
    if (gapW){
      var gx = L + gapW;
      svg += '<rect x="' + L + '" y="' + Tp + '" width="' + gapW + '" height="' + (H - Tp - B) + '" fill="url(#vg-h3)"/>'
        + '<text x="' + (L + gapW / 2).toFixed(1) + '" y="' + (H - 9) + '" text-anchor="middle" font-size="12" font-weight="800" fill="#8e8e93">⋯</text>'
        + '<line x1="' + (gx - 4) + '" x2="' + (gx + 4) + '" y1="' + (H - B + 5) + '" y2="' + (H - B - 5) + '" stroke="#8e8e93" stroke-width="1.5"/>'
        + '<line x1="' + (gx + 1) + '" x2="' + (gx + 9) + '" y1="' + (H - B + 5) + '" y2="' + (H - B - 5) + '" stroke="#8e8e93" stroke-width="1.5"/>'
        + '<line x1="' + gx + '" x2="' + gx + '" y1="' + Tp + '" y2="' + (H - B - 6) + '" stroke="rgba(255,255,255,.12)" stroke-dasharray="3 4"/>';
    } else if (s0 > s + 1e-6){
      var hx0 = X(s), hx1 = X(Math.min(s0, a)), hw = hx1 - hx0;
      svg += '<rect x="' + hx0.toFixed(1) + '" y="' + Tp + '" width="' + hw.toFixed(1) + '" height="' + (H - Tp - B) + '" fill="url(#vg-h3)"/>'
        + (hw > 120 ? '<text x="' + (hx0 + hw / 2).toFixed(1) + '" y="' + (Tp + (H - Tp - B) / 2 - 4).toFixed(1) + '" text-anchor="middle" font-size="12" font-weight="700" fill="#8e8e93">수집 시작 전 · 기록 없음</text>'
          + '<text x="' + (hx0 + hw / 2).toFixed(1) + '" y="' + (Tp + (H - Tp - B) / 2 + 14).toFixed(1) + '" text-anchor="middle" font-size="11" fill="#6e6e73">' + md(v.pub + s0 * 3600e3) + '부터 기록</text>'
          : hw > 40 ? '<text x="' + (hx0 + hw / 2).toFixed(1) + '" y="' + (Tp + (H - Tp - B) / 2 + 4).toFixed(1) + '" text-anchor="middle" font-size="11" fill="#8e8e93">기록 없음</text>' : '');
    }
    var gs = niceStep((y1 - y0) / 4);
    for (var y = Math.ceil(y0 / gs) * gs; y <= y1; y += gs)
      svg += '<line x1="' + L + '" x2="' + (W - R) + '" y1="' + Y(y).toFixed(1) + '" y2="' + Y(y).toFixed(1) + '" stroke="rgba(255,255,255,.06)"/>'
        + '<text x="' + (L - 7) + '" y="' + (Y(y) + 4).toFixed(1) + '" text-anchor="end" font-size="10.5" fill="#8e8e93">' + fmt(y) + '</text>';
    // 가로 눈금 12개: 왼쪽 끝부터 끝까지 고르게, 실제 날짜. 앞으로의 날짜는 굵게. 왼쪽 끝은 "2주 전부터"(또는 "기록 시작")라고 한 번 적는다
    var NT = 12;
    for (var ti = 0; ti < NT; ti++){
      var th = gapW ? (ti ? sB + (end - sB) * (ti - 1) / (NT - 2) : s) : s + (end - s) * ti / (NT - 1), tx = X(th), tms = v.pub + th * 3600e3;
      svg += (ti && ti < NT - 1 ? '<line x1="' + tx.toFixed(1) + '" x2="' + tx.toFixed(1) + '" y1="' + Tp + '" y2="' + (H - B) + '" stroke="rgba(255,255,255,.06)"/>' : '')
        + '<text x="' + tx.toFixed(1) + '" y="' + (H - 9) + '" text-anchor="' + (ti ? ti === NT - 1 ? 'end' : ti === 1 && gapW ? 'start' : 'middle' : 'start') + '" font-size="10.5" font-weight="' + (th > a ? 700 : ti ? 500 : 700) + '" fill="' + (ti ? th > a ? '#aeaeb2' : '#8e8e93' : '#ff9e9a') + '">' + md(tms) + '</text>';
    }
    svg += '<line x1="' + L + '" x2="' + L + '" y1="' + Tp + '" y2="' + (H - B) + '" stroke="#ff9e9a" stroke-opacity=".5" stroke-dasharray="2 4"/>'
      + '<text x="' + (L + 4) + '" y="' + (Tp - 8) + '" font-size="10.5" font-weight="700" fill="#ff9e9a">' + sTxt + '</text>';
    for (var M = Math.ceil(y0 / VE.MSTEP) * VE.MSTEP; M <= y1; M += VE.MSTEP)
      svg += '<line x1="' + L + '" x2="' + (W - R) + '" y1="' + Y(M).toFixed(1) + '" y2="' + Y(M).toFixed(1) + '" stroke="' + MSC + '" stroke-opacity=".55" stroke-dasharray="6 5"/>'
        + '<text x="' + (L + 6) + '" y="' + (Y(M) - 6).toFixed(1) + '" font-size="11" font-weight="800" fill="' + MSC + '">' + fmtM(M) + ' 돌파선</text>';
    if (p){
      svg += '<path d="' + fut.map(function(q, i){ return (i ? 'L' : 'M') + X(q[0]).toFixed(1) + ' ' + Y(q[1]).toFixed(1); }).join(' ') + '" fill="none" stroke="' + MSC + '" stroke-width="2.4" stroke-dasharray="7 5" stroke-linecap="round"/>';
      p.ms.forEach(function(o){
        if (o.days == null || o.days * 24 > end - a || o.M > y1) return;
        var cx = X(a + o.days * 24), cy = Y(o.M);
        svg += '<circle cx="' + cx.toFixed(1) + '" cy="' + cy.toFixed(1) + '" r="5.5" fill="' + MSC + '" stroke="#1c1c1e" stroke-width="2"/>'
          + '<text x="' + cx.toFixed(1) + '" y="' + (cy + 18).toFixed(1) + '" text-anchor="middle" font-size="11" font-weight="700" fill="#d3f6e7">' + (mu === 'w' ? msWeek(v, o) + '주 차' : daysTxt(o.days) + ' 안') + '</text>';
      });
      if (M1 && !showM1) svg += '<text x="' + (W - R - 4) + '" y="' + (Tp - 8) + '" text-anchor="end" font-size="11" font-weight="700" fill="' + MSC + '">다음 ' + fmtM(M1) + '까지 ' + fmt(M1 - p.V) + ' — ' + endTxt + '까지는 어려움</text>';
    }
    if (pts.length > 1) svg += '<path d="' + pts.map(function(q, i){ return (i ? 'L' : 'M') + X(q[0]).toFixed(1) + ' ' + Y(q[1]).toFixed(1); }).join(' ') + '" fill="none" stroke="#ff4d4f" stroke-width="2.6" stroke-linejoin="round" stroke-linecap="round"/>';
    // 시작점: 왼쪽 끝에 기록이 있으면 점으로
    if (sv != null) svg += '<circle cx="' + X(s).toFixed(1) + '" cy="' + Y(sv).toFixed(1) + '" r="4" fill="#1c1c1e" stroke="#ff9e9a" stroke-width="2"/>';
    var V = av(v, a);
    svg += '<line x1="' + X(a).toFixed(1) + '" x2="' + X(a).toFixed(1) + '" y1="' + Tp + '" y2="' + (H - B) + '" stroke="#ff4d4f" stroke-opacity=".5" stroke-dasharray="2 4"/>'
      + '<text x="' + X(a).toFixed(1) + '" y="' + (Tp - 8) + '" text-anchor="middle" font-size="10.5" font-weight="700" fill="#ff9e9a">지금</text>'
      + '<circle cx="' + X(a).toFixed(1) + '" cy="' + Y(V).toFixed(1) + '" r="5.5" fill="#ff4d4f" stroke="#1c1c1e" stroke-width="2"/>'
      + '<line id="vd-cx" y1="' + Tp + '" y2="' + (H - B) + '" stroke="rgba(255,255,255,.45)" stroke-width="1" style="display:none"/>'
      + '<circle id="vd-cd" r="5" stroke="#1c1c1e" stroke-width="2" style="display:none"/></svg>';
    box.innerHTML = chHead('100만 단위 돌파 예상', sTxt.replace('부터', '') + '(' + md(t0) + ')' + (gapW ? ' ⋯ ' + md(v.pub + s0 * 3600e3) + '부터 기록' : '') + ' → ' + endTxt, msTabs())
      + svg + '<div class="vd-tip" id="vd-tip" hidden></div>'
      + '<div class="vd-key" style="--mc:' + MSC + '"><span><i class="k-a"></i>실제 조회수</span>' + (p ? '<span><i class="k-p"></i>예상</span>' : '')
      + '<span><i class="k-m"></i>100만 단위</span></div>';
    // 말풍선: 지금까지는 실제, 그 뒤는 ③ 추세 곡선 예상
    lineTip(box, W, H, L, R, function(x){
      var h = Hx(x), act = h <= a + 1e-6, y = act ? av(v, h) : p ? VE.dayProject(p, (h - a) / 24) : null;
      if (y == null) return null;
      var t = v.pub + h * 3600e3, nx = (Math.floor(y / VE.MSTEP) + 1) * VE.MSTEP;
      return { x: X(h), y: Y(y), color: act ? '#ff4d4f' : MSC,
        html: '<b>' + md(t) + ' ' + hm(t) + ' · ' + (Math.abs(h - a) < 0.5 ? '지금' : act ? ageTxt(a - h) + ' 전' : ageTxt(h - a) + ' 뒤') + '</b>'
          + '<span>' + (act ? '실제 조회수 <em>' + full(y) + '</em>' : '예상 조회수 <em style="color:' + MSC + '">' + full(Math.round(y)) + '</em>') + '</span>'
          + '<small>' + fmtM(nx) + '까지 ' + fmt(nx - y) + ' 남음</small>' };
    });
  }
  // 선 그래프 말풍선: PC는 마우스를 올리면, 모바일은 누르고 있는 동안(옆으로 밀면 따라감) 세로선 · 점 · 값
  //   at(x, y: SVG 좌표) → { x, y, color, html } | null
  function lineTip(box, W, H, L, R, at){
    var svg = box.querySelector('svg'), tip = $('vd-tip'), cx = svg.querySelector('#vd-cx'), cd = svg.querySelector('#vd-cd');
    function hide(){ tip.hidden = true; cx.style.display = cd.style.display = 'none'; }
    function move(e){
      var rc = svg.getBoundingClientRect(), bx = box.getBoundingClientRect(), x = (e.clientX - rc.left) * W / rc.width, y = (e.clientY - rc.top) * H / rc.height;
      var o = x < L - 4 || x > W - R + 4 ? null : at(x, y);
      if (!o){ hide(); return; }
      cx.setAttribute('x1', o.x); cx.setAttribute('x2', o.x); cx.style.display = '';
      cd.setAttribute('cx', o.x); cd.setAttribute('cy', o.y); cd.setAttribute('fill', o.color); cd.style.display = '';
      tip.innerHTML = o.html; tip.hidden = false;
      var px = rc.left - bx.left + o.x * rc.width / W, py = rc.top - bx.top + o.y * rc.height / H;
      var tw = tip.offsetWidth, left = px + 14 + tw > bx.width ? px - 14 - tw : px + 14;
      tip.style.left = Math.max(4, left) + 'px'; tip.style.top = Math.max(4, py - tip.offsetHeight - 10) + 'px';
    }
    svg.addEventListener('pointermove', move);
    svg.addEventListener('pointerdown', move);
    svg.addEventListener('pointerleave', hide);
    svg.addEventListener('pointercancel', hide);
  }


  function render(){
    if (!sel){ el.innerHTML = head() + '<p class="anote">기록된 영상이 없습니다.</p>'; return; }
    var nSnap = VIDEOS.reduce(function(s, v){ return s + v.snaps.length; }, 0), ch = DATA.channel || {}, title = ch.title;
    // 게시 직후부터 기록한 영상이 적으면(수집 초기) 왜 예측이 비어 있는지 알려 준다
    el.innerHTML = head()
      + '<div class="vp-ch"><div class="vp-ava" aria-hidden="true">' + (ch.thumb ? '<img src="' + esc(ch.thumb) + '" alt="">' : PLAY) + '</div>'
      + '<div class="vp-cht"><b>' + esc(title || CHANNEL.handle) + '</b>'
      + '<small>' + (title ? esc(CHANNEL.handle) + ' · ' : '') + (ch.subs != null ? '구독자 ' + fmt(ch.subs) + ' · ' : '')
      + '영상 ' + VIDEOS.length + '개 · 기록 ' + full(nSnap) + '개</small></div>'
      + (DATA.demo ? '<span class="vp-dpill">예시 데이터</span>' : '')
      + '<a class="gs vp-yt" href="' + CHANNEL.url + '" target="_blank" rel="noopener">채널 ↗</a></div>'
      + (DATA.demo ? '<p class="vp-demo">지금 보이는 영상과 수치는 화면 구성을 보여 주려고 만든 예시이며 실제 채널 수치가 아닙니다. 15분마다 실제 수치를 모으는 수집기를 연결하면 자동으로 바뀝니다.</p>'
        : '')
      // 예측 조회수(가로 카드) / 100만 단위 돌파(진행 목록) / 1,000만 명예의 전당 / 즐겨찾기(별표한 영상, 가로 카드) — 한 줄 탭으로 바꿔 본다
      + '<div class="vr-head"><div class="seg vr-tabs" role="tablist" aria-label="보기">'
      + '<button type="button" role="tab" id="vr-tb" data-rv="rank"></button><button type="button" role="tab" id="vr-msb" data-rv="ms"></button><button type="button" role="tab" id="vr-hof" data-rv="hof"></button><a class="vr-fav" id="vr-fav" href="?tab=vfav" data-tab="vfav"></a></div>'
      + '<div class="vr-side"><div class="seg vr-ft" id="vr-ft"></div>'
      // 바로 가기: 아래 칸으로 한 번에 내려간다
      + '<nav class="vr-jump" aria-label="바로 가기">' + [['vd-pred', '예측 현황'], ['vt-h', '전체 영상'], ['vs-h', '예측 성적표']].map(function(x){
          return '<button type="button" data-jump="' + x[0] + '">' + x[1]
            + '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M12 5v14M6 13l6 6 6-6" fill="none" stroke="currentColor" stroke-width="2.4" stroke-linecap="round" stroke-linejoin="round"/></svg></button>';
        }).join('') + '</nav></div></div>'
      + '<p class="vr-cap" id="vr-cap"></p>'
      + '<div class="vc-wrap at-start" id="vc-wrap"><button type="button" class="vc-nav prev" data-nav="-1" aria-label="이전 영상들">‹</button>'
      + '<div class="vc-row" id="vc-row"></div>'
      + '<button type="button" class="vc-nav next" data-nav="1" aria-label="다음 영상들">›</button></div>'
      + '<div class="mb" id="mb" hidden></div>'
      + '<div class="hof" id="hof" hidden></div>'
      + '<div class="vd" id="vd"></div>'
      + '<div class="vt-head" id="vt-h"><h3 class="ahead">전체 영상</h3><input type="search" class="vt-q" id="vt-q" placeholder="제목 검색" value="' + esc(tq) + '" aria-label="제목 검색"></div>'
      + '<div class="vt" id="vt"></div>'
      + (rv === 'fav' ? '' : '<h3 class="ahead">예측 방법</h3><div class="vm-list" id="vm-list"></div>' + about())
      + '<div class="vx-toast" id="vx-toast" role="status" hidden></div>';
    $('vx-meta').innerHTML = '<span>집계 <b>' + when(Date.parse(DATA.updated)) + '</b></span>'
      + (DATA.demo ? '' : '<button type="button" class="vx-chk" id="vx-chk"><i></i><span id="vx-next"></span></button>');
    var row = $('vc-row');
    row.addEventListener('scroll', navState, { passive: true });
    $('vt-q').addEventListener('input', function(){ tq = this.value.trim(); tn = 20; renderTable(); });
    renderRank(); renderVideo(); renderTable(); renderMethods(); tick();
  }
  function about(){
    return '<details class="vx-about"><summary>용어와 계산 방법</summary><ul>'
      + '<li><b>24시간 증가</b> 최근 24시간 동안 는 조회수입니다. 기록이 아직 24시간이 안 되면 지금까지의 속도로 늘려 잡고 <i class="vk vk-est">추정</i>으로 표시합니다.</li>'
      + '<li><b>추이</b> 최근 24시간 동안 는 조회수가 채널 영상 중 상위 20%면 강함, 50%까지면 중간, 그 아래는 약함입니다. 예측 조회수 탭의 카드와 영상 현황 칸에 나옵니다.</li>'
      + '<li><b>1주 뒤 예상</b> (전체 영상 표) 영상마다 1주 뒤 예상 조회수입니다. 30일 예측 중인 영상은 24시간·7일·30일 종합 예측을 이은 곡선으로, 그 뒤 영상은 ③ 추세 곡선으로 계산합니다. 예측이 아직 없으면 최근 하루 증가가 줄어드는 곡선으로 잡고 <i class="vk vk-est">추정</i>으로 표시합니다.</li>'
      + '<li><b>곧 N만</b> 다음 기념 조회수(1만·10만·100만 단위)에 48시간 안에 닿을 것으로 보이는 영상입니다. 예측 곡선으로 계산하고, 예측이 없는 영상은 최근 24시간 속도로 계산합니다.</li>'
      + '<li><b>100만 단위 돌파 예측</b> 다음 100만 단위(예: 1,000만)를 언제 넘을지 ③ 추세 곡선으로 봅니다. 최근 하루 증가량이 영상이 오래될수록 조금씩 줄어드는 곡선으로 이어 붙여 며칠 뒤 넘을지 세고, 1주 ~ 8주로 보여 줍니다. 조회수는 끝없이 오르지 않고 한쪽으로 수렴합니다. 30일 예측이 끝난 영상은 영상 상세도 이 모드로 보여 줍니다.</li>'
      + '<li><b>100만 단위 돌파</b> 조회수 90만 이상인 영상이 다음 100만을 언제 넘을지 모은 탭입니다. 오른쪽 아래 추이는 ③ 추세 곡선으로 본 1주 증가가 채널 영상 중 상위 20%면 강함, 50%면 중간, 그 아래는 약함입니다. 탭의 숫자는 8주 안에 넘을 것으로 보이는 영상 수입니다. 기록이 2일이 안 된 영상은 줄어드는 정도를 아직 몰라 기본 곡선으로 계산합니다.</li>'
      + '<li><b>1,000만 명예의 전당</b> 조회수 1,000만을 넘은 영상을 조회수 순으로 모은 탭입니다. 아래 "달성 직전"은 900만을 넘었지만 아직 1,000만이 안 된 영상입니다.</li>'
      + '<li><b>즐겨찾기</b> 예측 조회수 카드와 전체 영상 표의 별표를 누른 영상만 모아 보는 페이지입니다(순위 줄 맨 오른쪽 버튼 · 왼쪽 메뉴 "영상 즐겨찾기"). 이 브라우저에만 저장되어 다른 기기와는 이어지지 않습니다.</li>'
      + '<li><b>영상 범위</b> 채널의 동영상 탭 영상만 모읍니다 (쇼츠·라이브 제외).</li>'
      + '<li>모든 수치는 유튜브 공개 조회수와 게시 시각으로 이 페이지가 직접 계산한 값입니다. 유튜브가 조회수를 묶어서 갱신해 15분별 증가가 가끔 튀어 보일 수 있습니다.</li>'
      + '</ul></details>';
  }

  // ----- 예측 조회수 카드 / 100만 단위 돌파 목록 -----
  function renderRank(){
    var cnt = { all: VIDEOS.length }; VIDEOS.forEach(function(v){ cnt[v.type] = (cnt[v.type] || 0) + 1; });
    $('vr-ft').hidden = Object.keys(cnt).length - 1 < 2;
    $('vr-ft').innerHTML = [['all', '전체'], ['long', '일반'], ['short', '쇼츠'], ['live', '라이브']].filter(function(x){ return cnt[x[0]]; }).map(function(x){
      return '<button type="button" data-ft="' + x[0] + '" class="' + (ft === x[0] ? 'on' : '') + '">' + x[1] + '<small>' + cnt[x[0]] + '</small></button>';
    }).join('');
    var B = board(), n8 = B.filter(in8).length, ms = rv === 'ms', hof = rv === 'hof', fav = rv === 'fav', HF = hall(), FL = favList();
    $('vr-tb').innerHTML = '예측 조회수'; $('vr-msb').innerHTML = '100만 단위 돌파<b>' + n8 + '</b>'; $('vr-hof').innerHTML = CROWN + '1,000만 명예의 전당<b>' + HF.top.length + '</b>';
    $('vr-fav').innerHTML = favTab(FL); favSide();
    $('vr-fav').classList.toggle('on', fav); if (fav) $('vr-fav').setAttribute('aria-current', 'page'); else $('vr-fav').removeAttribute('aria-current');
    [['vr-tb', rv === 'rank'], ['vr-msb', ms], ['vr-hof', hof]].forEach(function(x){ $(x[0]).classList.toggle('on', x[1]); $(x[0]).setAttribute('aria-selected', String(x[1])); });
    $('vr-cap').innerHTML = fav
      ? '<b>별표</b>를 누른 영상만 모았습니다. 최근 24시간 동안 많이 오른 영상부터 보여 주고, 별표를 다시 누르면 빠집니다.'
      : hof
      ? '조회수 <b>1,000만</b>을 넘은 영상들을 조회수 순으로 보여 줍니다. 아래에는 900만을 넘어 달성을 앞둔 영상을 모았습니다.'
      : ms
      ? '<b>다음 100만 단위</b>를 먼저 넘을 것으로 보이는 영상부터 보여 줍니다. 조회수 90만 이상인 영상을 모두 보여 줍니다.'
      : '최근 24시간 동안 조회수가 많이 오른 영상부터 보여 줍니다. <b>추이</b>는 채널 영상 중 순위에 따라 강함·중간·약함으로 나눕니다.';
    $('vc-wrap').hidden = ms || hof; $('mb').hidden = !ms; $('hof').hidden = !hof;
    if (hof){ renderHof(HF); return; }
    if (ms){ renderBoard(B); return; }
    var L = fav ? FL.sort(byGain) : list().sort(byGain).slice(0, 12);                    // 최근 24시간 동안 많이 는 순 (추이와 같은 기준). 즐겨찾기는 전부
    $('vc-row').innerHTML = L.map(function(v){ return card(v); }).join('') || (fav ? favEmpty() : '<p class="anote">해당하는 영상이 없습니다.</p>');
    $('vc-row').scrollLeft = 0; navState();
  }
  function wTag(o){ return o.kind === 'est' ? '<i class="vk vk-est">추정</i>' : o.kind === 'wait' ? '<i class="vk vk-wait">수집 중</i>' : ''; }
  // 추이 막대 아이콘: 강함 3칸 · 중간 2칸 · 약함 1칸
  function sigBars(lv){
    return '<svg viewBox="0 0 13 10" aria-hidden="true">' + [0, 1, 2].map(function(k){
      return '<rect x="' + k * 4.5 + '" y="' + (6 - k * 3) + '" width="3.5" height="' + (4 + k * 3) + '" rx="1"' + (k < 3 - TREND.indexOf(lv) ? ' class="on"' : '') + '/>';
    }).join('') + '</svg>';
  }
  // 상단 영상 카드: 썸네일(+ 곧 N00만) · 추이(현황 칸의 추이와 같은 기준) · 제목 · 게시 후 지난 시간만
  function card(v){
    var tr = trend(v), s = soon(v);
    return '<button type="button" class="vc' + (v === sel ? ' on' : '') + '" data-vid="' + esc(v.id) + '" aria-pressed="' + (v === sel) + '">'
      + '<span class="vc-th">' + thumb(v) + (s ? '<span class="vc-ms">곧 ' + fmtM(s.M) + '</span>' : '') + star(v, true) + '</span>'
      + (tr ? '<span class="vc-g vc-tr ' + tr.lv.c + '" title="최근 24시간 +' + fmt(tr.g.x) + ' · 채널 영상 ' + tr.n + '편 중 ' + tr.rank + '위"><small>추이</small>' + sigBars(tr.lv) + '<b>' + tr.lv.t + '</b></span>'
        : '<span class="vc-g vc-tr"><small>추이</small><b>—</b></span>')
      + '<span class="vc-t">' + esc(v.title) + '</span>'
      + '<span class="vc-m">' + ageTxt(age(v)) + ' 전</span></button>';
  }
  // ----- 즐겨찾기 -----
  var STAR = '<path d="M12 17.27 18.18 21l-1.64-7.03L22 9.24l-7.19-.61L12 2 9.19 8.63 2 9.24l5.46 4.73L5.82 21z"/>';
  function favList(){ return list().filter(function(v){ return !!FAV[v.id]; }); }
  function favSide(){
    var n = document.getElementById('vfav-n'), k = DATA ? favList().length : Object.keys(FAV).length;
    if (n){ n.textContent = k; n.hidden = !k; }
  }
  function favTab(FL){ return '<svg class="vf-ic" viewBox="0 0 24 24" aria-hidden="true">' + STAR + '</svg>즐겨찾기<b>' + FL.length + '</b>'; }
  // 별표 버튼. inBtn: 카드처럼 버튼 안에 들어가면 span(role=button), 표에서는 진짜 버튼
  function star(v, inBtn){
    var on = !!FAV[v.id], tag = inBtn ? 'span' : 'button';
    return '<' + tag + (inBtn ? ' role="button" tabindex="0"' : ' type="button"') + ' class="vf-st' + (on ? ' on' : '') + '" data-fav="' + esc(v.id) + '" aria-pressed="' + on + '"'
      + ' aria-label="즐겨찾기" title="' + (on ? '즐겨찾기에서 빼기' : '즐겨찾기에 담기') + '"><svg viewBox="0 0 24 24" aria-hidden="true">' + STAR + '</svg></' + tag + '>';
  }
  function favEmpty(){
    var any = VIDEOS.some(function(v){ return FAV[v.id]; });
    return '<div class="vf-empty"><svg class="vf-ic" viewBox="0 0 24 24" aria-hidden="true">' + STAR + '</svg>'
      + (any ? '<b>고른 종류에는 즐겨찾기한 영상이 없습니다</b><small>위의 전체 · 일반 · 쇼츠 · 라이브 중 다른 종류를 골라 보세요.</small>'
        : '<b>아직 즐겨찾기한 영상이 없습니다</b><small>예측 조회수 카드나 아래 전체 영상 표에서 별표를 누르면 여기에 모입니다. 즐겨찾기는 이 브라우저에만 저장됩니다.</small>')
      + '</div>';
  }
  function toggleFav(id){
    if (FAV[id]) delete FAV[id]; else FAV[id] = Date.now();
    try { localStorage.setItem(FKEY, JSON.stringify(FAV)); } catch (e){}
    Array.prototype.forEach.call(el.querySelectorAll('[data-fav]'), function(b){
      var on = !!FAV[b.getAttribute('data-fav')];
      b.classList.toggle('on', on); b.setAttribute('aria-pressed', String(on)); b.title = on ? '즐겨찾기에서 빼기' : '즐겨찾기에 담기';
    });
    if (rv === 'fav'){ var row = $('vc-row'), x = row.scrollLeft; renderRank(); row.scrollLeft = x; navState(); }   // 즐겨찾기 탭: 카드를 바로 넣고 뺀다 (보던 자리는 그대로)
    else $('vr-fav').innerHTML = favTab(favList());
    favSide();
  }
  // ----- 1,000만 명예의 전당: 조회수 1,000만을 넘은 영상(조회수 순) + 달성 직전(900만 이상) -----
  // 탭 버튼 왼쪽의 왕관 (이모지 대신 SVG — 기기마다 모양이 다르지 않게)
  var CROWN = '<svg class="hf-crown" viewBox="0 0 24 24" aria-hidden="true"><path d="M3 17.5 1.8 7.2l5.4 4.1L12 4l4.8 7.3 5.4-4.1L21 17.5z" fill="currentColor"/><rect x="3" y="18.7" width="18" height="2.3" rx="1" fill="currentColor"/><circle cx="12" cy="12.5" r="1.4" fill="rgba(0,0,0,.35)"/></svg>';
  function hall(){
    var top = [], next = [];
    list().forEach(function(v){ var V = av(v, age(v)); if (V >= 1e7) top.push({ v: v, V: V }); else if (V >= 9e6) next.push({ v: v, V: V }); });
    var by = function(a, b){ return b.V - a.V; };
    return { top: top.sort(by), next: next.sort(by) };
  }
  // 한 줄: 순위 · 썸네일 · 제목/게시·추이 · 조회수(24시간 증가) / 아랫줄: 다음 100만 단위 예상 (달성 직전은 남은 조회수 + 1,000만 달성 예상)
  function hofRow(x, i, pre){
    var v = x.v, a = age(v), g = velo(v, 24), tr = trend(v), m = milestone(v);
    var when = m.h == null ? null : etaHM(m.h / 24) + ' 내 · ' + ddayAP(v, m.h) + ' 무렵';
    var foot = pre
      ? '<span><b>' + fmt(1e7 - x.V) + '</b> 남음</span>'
        + '<span>' + (when ? '1,000만 달성 예상 <b>' + when + '</b>' : '달성 예상일은 기록이 더 쌓이면 나옵니다') + '</span>'
      : '<span>' + (m.h == null ? '다음 ' + fmtM(m.M) + '은 지금 추세로는 어렵습니다' : '다음 <b>' + fmtM(m.M) + '</b> 달성 예상 <b>' + when + '</b>') + '</span>';
    return '<button type="button" class="hf-r' + (v === sel ? ' on' : '') + '" data-vid="' + esc(v.id) + '" data-go="1">'
      + '<span class="hf-n' + (!pre && i < 3 ? ' r' + (i + 1) : '') + '">' + (i + 1) + '</span>'
      + '<span class="mb-th">' + thumb(v) + '</span>'
      + '<span class="hf-b"><span class="mb-t">' + esc(v.title) + '</span><span class="hf-m">게시 ' + dY(v.pub, nowMs(v)) + ' · ' + ageTxt(a) + ' 전'
      + (tr ? '<span class="mb-tr ' + tr.lv.c + '" title="최근 24시간 증가 채널 ' + tr.rank + '위 / ' + tr.n + '편">추이' + sigBars(tr.lv) + '<b>' + tr.lv.t + '</b></span>' : '') + '</span></span>'
      + '<span class="hf-v"><b>' + fmt(x.V) + '</b><small>' + full(x.V) + '회</small>' + (g.x != null ? '<em>24시간 <b>+' + fmt(g.x) + '</b></em>' : '') + '</span>'
      + '<span class="hf-f">' + foot + '</span></button>';
  }
  function renderHof(HF){
    $('hof').innerHTML = '<div class="hf-sec"><h4>1,000만 달성 <b>' + HF.top.length + '</b>편</h4>'
      + (HF.top.length ? '<div class="hf-list">' + HF.top.map(function(x, i){ return hofRow(x, i, false); }).join('') + '</div>' : '<p class="anote">아직 1,000만을 넘은 영상이 없습니다.</p>') + '</div>'
      + '<div class="hf-sec next"><h4>달성 직전 <small>900만 이상</small> <b>' + HF.next.length + '</b>편</h4>'
      + (HF.next.length ? '<div class="hf-list">' + HF.next.map(function(x, i){ return hofRow(x, i, true); }).join('') + '</div>' : '<p class="anote">900만을 넘은 영상이 없습니다.</p>') + '</div>';
  }
  // 100만 단위 돌파 목록: 지난 100만 → 다음 100만 진행 막대, 넘는 때. 8주 안에 넘는 영상은 강조
  function renderBoard(B){
    // 요약: 7일 안 · 30일 안에 새 100만 단위를 달성할 것으로 보이는 영상 수
    var within = function(d){ return B.filter(function(x){ return x.eta != null && x.eta <= d; }).length; };
    $('mb').innerHTML = '<div class="mb-sum"><span><b>' + within(7) + '</b>편 · 7일 안에 새 100만 단위 달성 예상</span><span><b>' + within(30) + '</b>편 · 30일 안에 새 100만 단위 달성 예상</span></div>'
      + (B.length ? '<div class="mb-list">' + B.map(mbRow).join('') + '</div>' : '<p class="anote">조회수 90만 이상인 영상이 없습니다.</p>');
  }
  // 한 줄: [썸네일] [제목·추이 / 지금 → 목표 · 남은 조회수 / 진행 막대] [달성까지 · 남은 시간 · 날짜]
  //   지금·목표는 둘 다 fmtM 이라 표기가 같다("1,197만 → 1,200만"). 색 강조는 8주 안(in) 줄의 남은 시간·막대에만
  //   못 닿거나 기록이 모자라면 오른쪽은 — 와 까닭. i = 목록 순번(막대를 훑는 불빛을 줄마다 조금씩 늦게 시작)
  function mbRow(x, i){
    var v = x.v, ok = in8(x), left = Math.max(0, x.M - x.V), tr = ltTrend(v);
    var p = Math.max(0, Math.min(1, (x.V - (x.M - VE.MSTEP)) / VE.MSTEP));     // 지난 100만 단위 → 다음 100만 단위 진행률
    // 달성까지 상자: 왼쪽 [달성까지 · 남은 시간(크게)] / 오른쪽 날짜 두 줄 [9/23 · 오후 무렵] — 두 줄 날짜가 큰 숫자와 높이가 비슷해 한 줄 상자로 가운데가 맞는다
    var eta = x.eta != null
      ? '<span class="mb-el"><small class="mb-lb">달성까지</small><b class="mb-eta">' + etaHM(x.eta).replace(/(시간|분|일|주)/g, '<i>$1</i>') + '</b></span>'
        + '<span class="mb-ed"><b>' + dday(v, x.eta * 24) + '</b><small>' + ddayAP(v, x.eta * 24).split(' ').pop() + ' 무렵</small></span>'
      : '<span class="mb-el"><small class="mb-lb">달성까지</small><b class="mb-eta na">—</b></span>'
        + '<span class="mb-ed na"><small>' + (x.why === 'far' ? '지금 추세로는 어려움' : '기록 쌓는 중') + '</small></span>';
    var a0 = x.M - VE.MSTEP > 0 ? fmtM(x.M - VE.MSTEP) : '0';
    return '<button type="button" class="mb-r' + (ok ? ' in' : '') + (v === sel ? ' on' : '') + '" data-vid="' + esc(v.id) + '" data-go="1">'
      // 썸네일 한 장: 카드 왼쪽부터 깔아 썸네일 칸 → 글자 칸(반투명 어둠 밑)으로 이어지게 (시안 A 응용). .mb-th 는 자리만
      + '<span class="mb-bg" aria-hidden="true" style="' + (thumbSrc(v) ? 'background-image:url(&quot;' + esc(thumbSrc(v)) + '&quot;)' : '--h:' + v.hue) + '"></span>'
      + '<span class="mb-th">' + thumb(v) + star(v, true) + '</span>'
      + '<span class="mb-c">'
      + '<span class="mb-hd"><span class="mb-t">' + esc(v.title) + '</span>'
      + (tr ? '<span class="mb-tg ' + tr.lv.c + '" title="1주 동안 +' + fmt(tr.x) + ' 예상 · 채널 영상 ' + tr.n + '편 중 ' + tr.rank + '위">' + sigBars(tr.lv) + '<b>' + tr.lv.t + '</b></span>' : '')
      + '</span>'
      // 트랙: 위 라벨 줄 [지금 "N만 달성" · 오른쪽 "N만 남음"] / [지난 100만 단위 ━ 막대(지금 위치에 점) ━ 다음 100만 단위] 한 줄
      + '<span class="mb-tk">'
      + '<span class="mb-tl"><span><b>' + fmtM(x.V) + '</b> 달성</span><span class="rt"><b>' + (left < 1e4 ? full(left) + '회' : fmt(left)) + '</b> 남음</span></span>'
      + '<span class="mb-br"><span class="mb-a0">' + a0 + '</span>'
      + '<span class="mb-trw"><span class="mb-pg" aria-hidden="true" style="--sw:' + ((i || 0) % 8 * 0.18).toFixed(2) + 's"><i style="width:' + (p * 100).toFixed(1) + '%"></i></span><u class="mb-dot" style="left:' + (p * 100).toFixed(1) + '%"></u></span>'
      + '<span class="mb-a1">' + fmtM(x.M) + '</span></span>'
      + '</span>'
      + '<span class="mb-e">' + eta + '</span>'
      + '</span></button>';
  }
  var TYPE = { short: '쇼츠', live: '라이브' };           // 일반 영상은 표시하지 않는다. 예측은 같은 종류끼리만 비교
  function navState(){
    var row = $('vc-row'), w = row && row.parentNode; if (!w) return;
    w.classList.toggle('at-start', row.scrollLeft < 4);
    w.classList.toggle('at-end', row.scrollLeft + row.clientWidth > row.scrollWidth - 4);
  }

  // ----- 전체 영상 표: 정렬(증가·누적·경과) · 검색 · 줄 펼치면 15분별 증가 -----
  function renderTable(){
    var W = 24, L = list().filter(function(v){ return !tq || v.title.toLowerCase().indexOf(tq.toLowerCase()) >= 0; });
    var sorters = { gain: byGain, pred: function(a, b){ var x = week1(a).gain, y = week1(b).gain; return (y == null ? -1 : y) - (x == null ? -1 : x); }, tot: function(a, b){ return av(b, age(b)) - av(a, age(a)); }, age: function(a, b){ return b.pub - a.pub; } };
    L.sort(sorters[ts]);
    var th = function(k, t){ return '<th class="' + { gain: 'g', pred: 'w', tot: 't', age: 'a' }[k] + (ts === k ? ' on' : '') + '"><button type="button" data-ts="' + k + '">' + t + (ts === k ? ' ▾' : '') + '</button></th>'; };
    var h = '<div class="atab-w"><table class="atab vt-tab"><thead><tr><th class="n">#</th><th class="v">영상</th>'
      + th('gain', '24시간 증가') + th('pred', '1주 뒤 예상') + th('tot', '누적') + th('age', '경과') + '<th class="x"></th></tr></thead><tbody>';
    L.slice(0, tn).forEach(function(v, i){
      var a = age(v), g = velo(v, W), s = soon(v), open = OPEN[v.id];
      h += '<tr class="vt-r' + (v === sel ? ' on' : '') + (open ? ' open' : '') + '">'
        + '<td class="n">' + (ts === 'gain' ? '<span class="vt-rk">' + (i + 1) + '</span>' : '') + star(v) + '</td>'
        + '<td class="v"><button type="button" class="vt-v" data-vid="' + esc(v.id) + '" data-go="1"><span class="vs-th">' + thumb(v) + '</span>'
        + '<span class="vt-vt"><b>' + esc(v.title) + '</b><small><span class="vt-dt">' + ymd(v.pub) + (v.dur ? ' · <i class="ko">' + fmtDur(v.dur) + '</i>' : '') + '</span>'
        + (TYPE[v.type] ? '<i class="vtag">' + TYPE[v.type] + '</i>' : '') + (a < 24 ? '<i class="vtag new">24h</i>' : '')
        + (s ? '<i class="vtag ms">곧 ' + fmtM(s.M) + '</i>' : '') + '<span class="vt-tot">누적 ' + fmt(av(v, a)) + ' · ' + ageTxt(a) + '</span></small></span></button></td>'
        + '<td class="g"><span class="vt-gn">' + kindTag(g) + '<b>' + (g.x == null ? '—' : full(g.x)) + '</b></span></td>'
        + '<td class="w">' + (function(w){ return w.gain == null ? '—' : wTag(w) + ' <b>+' + fmt(w.gain) + '</b>'; })(week1(v)) + '</td>'
        + '<td class="t">' + full(av(v, a)) + '</td>'
        + '<td class="a">' + ageTxt(a) + '</td>'
        + '<td class="x"><button type="button" class="vt-x" data-exp="' + esc(v.id) + '" aria-expanded="' + !!open + '" aria-label="시간별 그래프"><svg viewBox="0 0 24 24"><path d="M6 9l6 6 6-6" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"/></svg></button></td></tr>'
        + '<tr class="vt-d"' + (open ? '' : ' hidden') + '><td colspan="7"><div class="vt-dx" id="vt-d-' + esc(v.id) + '"></div></td></tr>';
    });
    h += '</tbody></table></div>';
    var rest = L.length - tn;
    $('vt').innerHTML = h + '<div class="vt-foot"><span>' + L.length + '편' + (tq ? ' (검색 결과)' : '') + '</span>'
      + (rest > 0 ? '<button type="button" class="gs" data-more="1">' + Math.min(rest, 20) + '편 더 보기</button>' : '') + '</div>';
    L.slice(0, tn).forEach(function(v){ if (OPEN[v.id]) rowDetail(v); });
  }
  // 펼친 줄: 24시간·7일·하루 평균·기념 조회수 예상 + 15분별 증가(24시간, 누르면 72시간)
  var HSPAN = {}, HUNIT = {};
  function rowDetail(v){
    var box = $('vt-d-' + v.id); if (!box) return;
    var a = age(v), V = av(v, a), g1 = velo(v, 24), w1 = week1(v), tr = trend(v), m = milestone(v), u = HUNIT[v.id] || 'q', sp = u === 'q' ? HSPAN[v.id] || 24 : UNITS[u].span;
    // 상자: 24시간 · 7일 후 예측 · 추이 · 다음 기념 조회수 돌파
    var tiles = ['<div class="vt-c"><span>24시간</span><b>' + (g1.x == null ? '—' : full(g1.x)) + '</b><small>최근 24시간 동안 는 조회수</small>' + kindTag(g1) + '</div>',
      '<div class="vt-c"><span>7일 후 예측</span><b>' + (w1.x == null ? '—' : full(w1.x)) + '</b><small>' + (w1.gain == null ? '기록이 쌓이면 나옵니다' : '지금보다 +' + fmt(w1.gain)) + '</small></div>',
      tr ? '<div class="vt-c vt-tr ' + tr.lv.c + '"><span>추이</span><b>' + tr.lv.t + '</b><small>24시간 증가 채널 ' + tr.rank + '위 / ' + tr.n + '편</small>'
         + '<div class="vd-trm" aria-hidden="true">' + TREND.slice().reverse().map(function(t){ return '<i class="' + t.c + (t === tr.lv ? ' on' : '') + '">' + t.t + '</i>'; }).join('') + '</div></div>'
         : '<div class="vt-c"><span>추이</span><b>—</b><small>기록이 쌓이면 나옵니다</small></div>'];
    if (m.h != null) tiles.push('<div class="vt-c ms' + (m.h <= 48 ? ' soon' : '') + '"><span>돌파 예상</span>'
      + '<b>' + fmtM(m.M) + ' 돌파</b><b>' + (m.h < 1 ? '1시간 안' : '약 ' + ageTxt(m.h) + ' 뒤') + '</b></div>');
    box.innerHTML = '<div class="vt-cs" style="--n:' + tiles.length + '">' + tiles.join('')
      + '<button type="button" class="gs vt-go" data-vid="' + esc(v.id) + '" data-go="1">예측 자세히 ↑</button></div>'
      + '<div class="vt-hh"><div class="seg" role="tablist" aria-label="단위">'
      + UORDER.map(function(k){ return '<button type="button" data-hu="' + k + '" data-hv="' + esc(v.id) + '" class="' + (k === u ? 'on' : '') + '" aria-selected="' + (k === u) + '">' + UNITS[k].tab + '</button>'; }).join('')
      + '</div>' + (u === 'q' ? '<div class="seg" role="tablist" aria-label="기간">'
      + [24, 72].map(function(h){ return '<button type="button" data-hs="' + h + '" data-hv="' + esc(v.id) + '" class="' + (h === sp ? 'on' : '') + '" aria-selected="' + (h === sp) + '">' + h + '시간</button>'; }).join('')
      + '</div>' : '') + '<span>' + (u === 'q' ? '최근 ' + sp + '시간' : barRange(v, u, sp)) + ' · 막대에 마우스를 올리면 수치가 보입니다</span></div>'
      + '<div class="vt-hc">' + barChart(v, u, sp, Math.max(320, Math.min(900, box.clientWidth || 700)), 160) + '</div>'
      + '<p class="gnote">유튜브가 조회수를 한꺼번에 갱신할 때가 있어 막대가 가끔 튈 수 있습니다.</p>';
  }

  // ----- 조회수 증가 막대 그래프: 15분 · 1시간 · 1일 · 1주일 단위 (실제 날짜 눈금) -----
  // 칸은 달력 기준(15분·정시·자정·월요일 0시)으로 나눈다. 지금 진행 중인 칸은 지금까지 는 만큼만 그리고 "진행 중"으로 표시
  var UNITS = {
    q: { tab: '15분', step: 0.25, span: 72, per: '15분 동안', range: '최근 72시간' },
    h: { tab: '1시간', step: 1, span: 168, per: '1시간 동안', range: '최근 7일' },
    d: { tab: '1일', step: 24, span: 720, per: '하루 동안', range: '최근 30일' },
    w: { tab: '1주일', step: 168, span: 2016, per: '1주일 동안', range: '최근 12주' }
  };
  var UORDER = ['q', 'h', 'd', 'w'];
  function floorSlot(ms, u){
    var d = new Date(ms);
    if (u === 'q') return Math.floor(ms / 900e3) * 900e3;
    if (u === 'h'){ d.setMinutes(0, 0, 0); return d.getTime(); }
    d.setHours(0, 0, 0, 0);
    if (u === 'w') d.setDate(d.getDate() - (d.getDay() + 6) % 7);          // 월요일 0시
    return d.getTime();
  }
  function nextSlot(ms, u){
    if (u === 'q') return ms + 900e3;
    if (u === 'h') return ms + 3600e3;
    var d = new Date(ms); d.setDate(d.getDate() + (u === 'w' ? 7 : 1)); return d.getTime();
  }
  function hm(ms){ var d = new Date(ms); return two(d.getHours()) + ':' + two(d.getMinutes()); }
  function md(ms){ var d = new Date(ms); return (d.getMonth() + 1) + '/' + d.getDate(); }
  // 막대 그래프 시작 칸. 15분은 고른 기간 그대로(24·72시간), 1시간·1일·1주일은 기간(최근 7일·30일·12주) 안에서 기록이 있는 첫 칸부터
  //   → 게시 전·수집 전 빈 날짜를 그리지 않는다. 칸이 적어도 막대가 뚱뚱해지지 않게 막대 폭은 barChart 에서 제한
  function barStart(v, u, span){
    var U = UNITS[u], nowMs = v.pub + age(v) * 3600e3, N = Math.round((span || U.span) / U.step), st0 = floorSlot(nowMs - (N - 1) * U.step * 3600e3, u);
    var f = u === 'q' ? st0 : floorSlot(v.pub + Math.max(0, v.vs.snaps[0][0]) * 3600e3, u);
    return f > st0 ? { t: f, clip: true } : { t: st0, clip: false };
  }
  // 그래프 설명의 기간: 기록이 기간보다 짧으면 "9/21부터"
  function barRange(v, u, span){ var b = barStart(v, u, span); return b.clip ? md(b.t) + '부터' : UNITS[u].range; }
  function barChart(v, u, span, W, H){
    var U = UNITS[u], a = age(v), nowMs = v.pub + a * 3600e3, L = 46, R = 10, Tp = 24, B = 22, slots = [];
    var st0 = barStart(v, u, span).t;
    var s0 = v.vs.snaps[0][0];                                                       // 기록이 시작된 때(게시 후 시간)
    for (var t = st0; t < nowMs; t = nextSlot(t, u)){
      var e = nextSlot(t, u), pre = e <= v.pub, ta = Math.max(0, (t - v.pub) / 3600e3), tb = (Math.min(e, nowMs) - v.pub) / 3600e3, cut = false;
      var x0 = pre ? null : av(v, ta), x1 = pre ? null : av(v, tb);
      // 칸 중간에 기록이 시작됐으면 기록이 있는 부분만 센다 (1일·1주일 칸이 수집 시작 날에 통째로 비지 않게)
      if (x0 == null && x1 != null && s0 > ta && s0 < tb){ x0 = av(v, s0); cut = true; }
      slots.push({ t: t, e: e, pre: pre, x: x0 != null && x1 != null && tb > ta ? Math.max(0, x1 - x0) : null, open: e > nowMs,
        cut: cut ? v.pub + s0 * 3600e3 : 0, pub: t < v.pub && v.pub < e });
    }
    var n = Math.max(1, slots.length), inc = slots.map(function(o){ return o.x; });
    var mx = Math.max.apply(null, inc.filter(function(x){ return x != null; }).concat([1])), stp = niceStep(mx * 1.1 / 3), top = Math.ceil(mx * 1.1 / stp) * stp, bw = (W - L - R) / n;
    function X(i){ return L + i * bw; }
    function Y(y){ return Tp + (1 - y / top) * (H - Tp - B); }
    function XT(ms){ var i = 0; while (i < n - 1 && slots[i + 1].t <= ms) i++; return X(i) + (ms - slots[i].t) / (slots[i].e - slots[i].t) * bw; }
    var s = '<svg class="vh-svg" viewBox="0 0 ' + W + ' ' + H + '" role="img" aria-label="' + U.tab + ' 단위 조회수 증가">'
      + '<defs><pattern id="vg-h2" width="7" height="7" patternUnits="userSpaceOnUse" patternTransform="rotate(45)"><line x1="0" y1="0" x2="0" y2="7" stroke="rgba(255,255,255,.07)" stroke-width="2"/></pattern></defs>';
    for (var y = 0; y <= top + 1e-9; y += stp)
      s += '<line x1="' + L + '" x2="' + (W - R) + '" y1="' + Y(y).toFixed(1) + '" y2="' + Y(y).toFixed(1) + '" stroke="rgba(255,255,255,' + (y ? .06 : .16) + ')"/>'
        + '<text x="' + (L - 7) + '" y="' + (Y(y) + 4).toFixed(1) + '" text-anchor="end" font-size="10.5" fill="#8e8e93">' + fmt(y) + '</text>';
    // 게시 전 구간: 빗금 없이 비워 두고 이름만
    var np = 0; while (np < n && slots[np].pre) np++;
    if (np && X(np) - L > 70) s += '<text x="' + ((L + X(np)) / 2).toFixed(1) + '" y="' + (Tp + (H - Tp - B) / 2 + 4).toFixed(1) + '" text-anchor="middle" font-size="11" fill="#6e6e73">게시 전</text>';
    // 기록이 없는 구간(수집 전)
    var gs = -1, i;
    for (i = 0; i <= n; i++){
      var none = i < n && inc[i] == null && !slots[i].pre;
      if (none && gs < 0) gs = i;
      if (!none && gs >= 0){
        s += '<rect x="' + X(gs).toFixed(1) + '" y="' + Tp + '" width="' + (X(i) - X(gs)).toFixed(1) + '" height="' + (H - Tp - B) + '" fill="url(#vg-h2)"/>'
          + (X(i) - X(gs) > 90 ? '<text x="' + ((X(gs) + X(i)) / 2).toFixed(1) + '" y="' + (Tp + (H - Tp - B) / 2 + 4).toFixed(1) + '" text-anchor="middle" font-size="11" fill="#8e8e93">수집 전 · 기록 없음</text>' : '');
        gs = -1;
      }
    }
    // 날짜 눈금. 15분·1시간: 자정마다 경계에 / 1일·1주일: 막대 가운데에, 맨 오른쪽(지금) 칸부터 글자가 겹치지 않게 건너뛰며
    var coarse = u === 'd' || u === 'w';
    if (coarse){
      for (var k = Math.max(1, Math.ceil(46 / bw)), j = n - 1; j >= 0; j -= k)
        s += '<text x="' + (X(j) + bw / 2).toFixed(1) + '" y="' + (H - 6) + '" text-anchor="middle" font-size="10.5" fill="#8e8e93">' + md(slots[j].t) + (u === 'w' ? '~' : '') + '</text>';
    } else {
      var d = new Date(slots[0].t), lastX = -99;
      d.setHours(24, 0, 0, 0);
      for (; d.getTime() < nowMs; d.setDate(d.getDate() + 1)){
        var x = XT(d.getTime());
        if (x - lastX < 44 || x < L + 10) continue;
        lastX = x;
        s += '<line x1="' + x.toFixed(1) + '" x2="' + x.toFixed(1) + '" y1="' + Tp + '" y2="' + (H - B) + '" stroke="rgba(255,255,255,.07)"/>'
          + '<text x="' + x.toFixed(1) + '" y="' + (H - 6) + '" text-anchor="middle" font-size="10.5" fill="#8e8e93">' + md(d.getTime()) + '</text>';
      }
    }
    // 게시 표시. 1일·1주일은 막대를 가로지르지 않게 게시한 칸의 왼쪽 경계에 긋고 날짜·시각을 적는다
    if (slots[0].t <= v.pub){
      var px = coarse ? X(np) : XT(v.pub), pl = '게시 ' + (coarse ? md(v.pub) + ' ' : '') + hm(v.pub), pr = px + 100 > W - R;
      s += '<line x1="' + px.toFixed(1) + '" x2="' + px.toFixed(1) + '" y1="' + (Tp - 8) + '" y2="' + (H - B) + '" stroke="#ff4d4f" stroke-dasharray="3 3"/>'
        + '<text x="' + (pr ? px - 4 : px + 4).toFixed(1) + '" y="' + (Tp - 10) + '"' + (pr ? ' text-anchor="end"' : '') + ' font-size="10.5" font-weight="700" fill="#ff9e9a">' + pl + '</text>';
    }
    inc.forEach(function(x, i){
      if (x == null) return;
      var y0 = Y(x), w = Math.max(1, Math.min(bw * 0.78, 44));
      s += '<rect class="hb' + (slots[i].open ? ' now' : '') + '" data-bi="' + i + '" x="' + (X(i) + (bw - w) / 2).toFixed(1) + '" y="' + y0.toFixed(1) + '" width="' + w.toFixed(1) + '" height="' + Math.max(0.5, Y(0) - y0).toFixed(1) + '" rx="' + Math.min(2, w / 3).toFixed(1) + '"/>';
    });
    // 수치 말풍선용 감지 영역: 막대가 가늘어도 짚기 쉽게 칸 전체 높이로 (views.js 아래쪽 말풍선 처리)
    inc.forEach(function(x, i){
      if (x == null) return;
      var o = slots[i], lab = u === 'q' || u === 'h' ? md(o.t) + ' ' + hm(o.t) + ' ~ ' + hm(o.e) : u === 'd' ? md(o.t) : md(o.t) + ' ~ ' + md(o.e - 1);
      s += '<rect class="hit" data-bi="' + i + '" x="' + X(i).toFixed(1) + '" y="' + Tp + '" width="' + bw.toFixed(1) + '" height="' + (H - Tp - B) + '" fill="transparent"'
        + ' data-tt="' + lab + '" data-tv="+' + full(x) + '회" data-tu="' + U.per + ' 는 조회수' + (o.cut ? ' · ' + md(o.cut) + ' ' + hm(o.cut) + ' 기록 시작 뒤만' : o.pub ? ' · 게시 ' + hm(v.pub) + ' 뒤' : '') + (o.open ? ' · 진행 중' : '') + '"/>';
    });
    return s + '</svg>';
  }

  // ----- 고른 영상: 제목 · 썸네일과 지금 현황(같은 높이) · 예측 현황 · 그래프 -----
  // 같은 종류·같은 게시 후 시간의 다른 영상들 값. k 1: 조회수(그 시간 기록이 있는 영상만), 2·3: 조회수 대비 좋아요·댓글 비율
  function peers(v, a, k){
    var out = [];
    VIDEOS.forEach(function(i){
      if (i === v || i.type !== v.type) return;                                   // 쇼츠·라이브·일반 영상은 각자 비교
      if (k === 1){ var x = age(i) >= a ? at(i, a, 1) : null; if (x != null) out.push(x); return; }
      var t = Math.min(a, age(i)); if (at(i, t, 1) == null) t = age(i);          // 그 시점 기록이 없으면 가장 최근 값으로
      var V = at(i, t, 1), y = at(i, t, k);
      if (V > 0 && y != null) out.push(y / V);
    });
    return out;
  }
  // 채널 안에서의 위치: 위쪽 절반이면 "상위 N%", 아니면 "하위 N%"
  function rank(x, arr){
    if (arr.length < 3) return '';
    var n = arr.length + 1, up = arr.filter(function(y){ return y > x; }).length + 1, dn = arr.filter(function(y){ return y < x; }).length + 1;
    return up / n <= 0.5 ? '<em class="up">상위 ' + Math.max(1, Math.round(up / n * 100)) + '%</em>'
      : '<em>하위 ' + Math.max(1, Math.round(dn / n * 100)) + '%</em>';
  }
  // 다른 영상들의 비율 분포를 부드러운 곡선(밀도)으로 깔고, 이 영상 자리에 바늘. 세로 점선은 보통(중앙값).
  //   바늘 왼쪽(이 영상보다 비율이 낮은 영상들)만 빨강으로 채워 "상위 N%" 가 눈에 보이게 한다. 높이는 24px 그대로
  var SID = 0;
  function strip(x, arr){
    if (arr.length < 3) return '';
    var all = arr.concat([x]), mn = Math.min.apply(null, all), w = Math.max.apply(null, all) - mn || 1;
    mn -= w * 0.06; w *= 1.12;                                                   // 양 끝 여유 (곡선이 잘리지 않게)
    function P(y){ return (y - mn) / w; }
    var W = 200, H = 24, n = 60, bw = 0.07, ys = [], top = 0;
    for (var i = 0; i <= n; i++){ var u = i / n, d = 0; arr.forEach(function(y){ var z = (u - P(y)) / bw; d += Math.exp(-z * z / 2); }); ys.push(d); top = Math.max(top, d); }
    var line = ys.map(function(d, i){ return (i ? 'L' : 'M') + (W * i / n).toFixed(1) + ' ' + (H - 1 - d / top * (H - 5)).toFixed(1); }).join(' ');
    var area = line + ' L' + W + ' ' + H + ' L0 ' + H + ' Z', px = P(x), id = 'vsg' + (++SID);
    return '<span class="vd-strip" title="곡선: 채널 다른 영상들의 분포 · 점선: 보통 · 바늘: 이 영상 (빨간 부분 = 이 영상보다 낮은 영상들)">'
      + '<svg viewBox="0 0 ' + W + ' ' + H + '" preserveAspectRatio="none" aria-hidden="true"><defs>'
      + '<linearGradient id="' + id + '" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#ff4d4f" stop-opacity=".7"/><stop offset="1" stop-color="#ff4d4f" stop-opacity=".12"/></linearGradient>'
      + '<clipPath id="' + id + 'c"><rect x="0" y="0" width="' + (px * W).toFixed(1) + '" height="' + H + '"/></clipPath></defs>'
      + '<path class="a" d="' + area + '"/><path d="' + area + '" fill="url(#' + id + ')" clip-path="url(#' + id + 'c)"/>'
      + '<path class="l" d="' + line + '" vector-effect="non-scaling-stroke"/></svg>'
      + '<i class="md" style="left:' + (P(q(arr, 0.5)) * 100).toFixed(1) + '%"></i><b style="left:' + (px * 100).toFixed(1) + '%"></b></span>';
  }
  // 누적 조회수 곡선 (게시 직후부터 기록이 없으면 기록 시작부터)
  function spark(v, a){
    var s0 = VE.since(v.vs), W = 120, H = 30, n = 40, V = av(v, a), lo = s0 ? av(v, s0) : 0, d = '';
    if (!(a > s0 + 0.5) || !(V > lo)) return '';
    for (var i = 0; i <= n; i++) d += (i ? ' L' : 'M') + (W * i / n).toFixed(1) + ' ' + (H - 2 - (av(v, s0 + (a - s0) * i / n) - lo) / (V - lo) * (H - 5)).toFixed(1);
    return '<svg class="vd-spark" viewBox="0 0 ' + W + ' ' + H + '" preserveAspectRatio="none" aria-hidden="true">'
      + '<path class="a" d="' + d + ' L' + W + ' ' + H + ' L0 ' + H + ' Z"/><path class="l" d="' + d + '" vector-effect="non-scaling-stroke"/></svg>';
  }
  // 최근 n칸의 증가 (step 시간 단위, 마지막 막대가 가장 최근)
  function bars(v, a, step, n){
    var inc = [];
    for (var j = n - 1; j >= 0; j--){
      var t1 = a - j * step, x1 = t1 > 0 ? av(v, t1) : null, x0 = av(v, Math.max(0, t1 - step));
      if (x1 != null && x0 != null) inc.push(x1 - x0);
    }
    if (!inc.length) return '';
    var mx = Math.max.apply(null, inc.concat([1]));
    return '<span class="vd-bars" aria-hidden="true">' + inc.map(function(x){ return '<i style="height:' + Math.max(6, x / mx * 100).toFixed(0) + '%"></i>'; }).join('') + '</span>';
  }
  // 최근 h시간 동안 는 조회수 (그만큼 거슬러 올라간 기록이 없으면 null)
  function gain(v, a, h){ var x = av(v, Math.max(0, a - h)); return x == null ? null : av(v, a) - x; }
  // 최근 1시간 안에 기록이 두 번 이상 있으면(매시간 값) 시간 단위로 볼 수 있다
  function fine(v, a){ return v.vs.snaps.filter(function(p){ return p[0] >= a - 1.6; }).length >= 2; }
  function tile(k, chip, val, sub, viz){
    return '<div class="vd-s"><div class="vd-sh"><span>' + k + '</span>' + chip + '</div><b>' + val + '</b><small>' + sub + '</small>'
      + (viz ? '<div class="vd-sv">' + viz + '</div>' : '') + '</div>';
  }

  // 추이: 최근 24시간 동안 는 조회수(velo, 표의 "24시간 증가"와 같은 값)가 채널 전체 영상 중 몇 번째인지
  //   상위 20% 안 = 강함, 상위 50% 안 = 중간, 그 아래 = 약함. 오래된 영상도 다시 뜨면 강함으로 잡힌다
  var TREND = [{ max: 0.2, t: '강함', c: 'hi' }, { max: 0.5, t: '중간', c: 'mid' }, { max: 1, t: '약함', c: 'lo' }];
  function trend(v){
    var g = velo(v, 24);
    if (g.x == null) return null;
    var xs = VIDEOS.map(function(o){ return velo(o, 24).x; }).filter(function(x){ return x != null; });
    var r = xs.filter(function(x){ return x > g.x; }).length + 1, p = r / xs.length, lv = TREND.filter(function(t){ return p <= t.max; })[0];
    return { g: g, rank: r, n: xs.length, lv: lv };
  }
  function trendTile(tr){
    if (!tr) return tile('추이', '', '—', '기록이 조금 더 쌓이면 나옵니다', '');
    return '<div class="vd-s vd-tr ' + tr.lv.c + '" title="최근 24시간 증가가 채널 영상 ' + tr.n + '편 중 몇 번째인지로 나눕니다 (상위 20% 강함 · 50% 중간 · 그 아래 약함)">'
      + '<div class="vd-sh"><span>추이</span><em>' + tr.rank + '위 / ' + tr.n + '편</em></div>'
      + '<b>' + tr.lv.t + '</b><small>최근 24시간 +' + fmt(tr.g.x) + (tr.g.kind === 'est' ? ' <i>(추정)</i>' : tr.g.kind === 'pred' ? ' <i>(예측)</i>' : '') + '</small>'
      + '<div class="vd-trm" aria-hidden="true">' + TREND.slice().reverse().map(function(t){ return '<i class="' + t.c + (t === tr.lv ? ' on' : '') + '">' + t.t + '</i>'; }).join('') + '</div></div>';
  }
  // 현황 칸 카운터: 다음 100만 단위까지 남은 시간 (③ 추세 곡선, milestone). 마지막 기록 시각부터 흐른 만큼 빼서 30초마다 다시 센다 (cntTick)
  //   아래 막대는 지난 100만 단위 → 다음 100만 단위 사이 어디쯤인지
  function msTile(v){
    var a = age(v), V = av(v, a), m = milestone(v), p = m.p, M0 = m.M - VE.MSTEP, f = Math.max(0, Math.min(1, (V - M0) / VE.MSTEP));
    var hd = '<div class="vd-sh"><span>다음 ' + fmtM(m.M) + '까지</span></div>';
    // 맨 아래: 지난 100만 단위 → 다음 100만 단위 사이를 가로 막대 하나로. 채운 만큼 황금 액체가 왼쪽에서 차오르고 오른쪽 끝은 물결 (waveSvg · waveLoop)
    var pc = Math.round(f * 100);
    var bar = '<div class="vd-msb" title="' + (M0 > 0 ? fmtM(M0) : '0') + ' → ' + fmtM(m.M) + ' · ' + pc + '%"><span>' + (M0 > 0 ? fmtM(M0) : '0') + '</span>'
      + '<div class="vd-msg" role="img" aria-label="' + fmtM(m.M) + '까지 ' + pc + '%">' + waveSvg(f) + '<em>' + pc + '%</em></div><span>' + fmtM(m.M) + '</span></div>';
    if (!p || m.how !== 'lt') return '<div class="vd-s vd-ms na">' + hd + '<b>—</b><small>최근 기록이 3시간 이상 쌓이면 남은 시간이 나옵니다</small><div class="vd-sv">' + bar + '</div></div>';
    if (m.h == null) return '<div class="vd-s vd-ms na">' + hd + '<b>닿기 어려움</b><small>지금 추세로는 ' + fmtM(m.M) + '에 닿기 어렵습니다</small><div class="vd-sv">' + bar + '</div></div>';
    var atMs = nowMs(v) + m.h * 3600e3;
    if (!WAVE.raf) WAVE.raf = requestAnimationFrame(waveLoop);
    // 가운데 줄 상자 세 개: 최근 1시간 증가(1시간 전 기록이 없으면 24시간 증가 ÷ 24) · 최근 24시간 증가 · 남은 조회수
    var g1 = gain(v, a, 1);
    var boxes = '<div class="vd-msv">'
      + '<span class="vd-mc" title="최근 1시간 동안 늘어난 조회수">1시간 <em>+' + fmt(g1 != null ? g1 : p.g / 24) + '</em></span>'
      + '<span class="vd-mc" title="최근 24시간 동안 늘어난 조회수">24시간 <em>+' + fmt(p.g) + '</em></span>'
      + '<span class="vd-mc" title="' + fmtM(m.M) + '까지 남은 조회수"><em>' + fmt(m.M - V) + '</em> 남음</span></div>';
    // 배치(사용자 시안): 윗줄 상자 [N만 달성까지 · 남은 시간(크게) ··· 날짜 / 오전·오후 무렵] / [1시간] [24시간] [N만 남음] / [700만 ~막대~ 800만]
    //   윗줄은 100만 목록 카드의 "달성까지" 상자(.mb-e)와 같은 짜임 — 색만 카운터 칸의 황금. 남은 시간이 주 단위면 8주 넘게도 숫자로 보인다
    return '<div class="vd-s vd-ms' + (m.h <= 48 ? ' soon' : '') + '" title="최근 하루 +' + fmt(p.g) + ' 기준">'
      + '<div class="vd-mst"><span class="vd-mel"><small>' + fmtM(m.M) + ' 달성까지</small><b id="vd-cnt" data-at="' + atMs + '">' + cntTxt(atMs) + '</b></span>'
      + '<span class="vd-med"><b>' + dday(v, m.h) + '</b><small>' + ddayAP(v, m.h).split(' ').pop() + ' 무렵</small></span></div>'
      + boxes + '<div class="vd-sv">' + bar + '</div></div>';
  }
  // 카운터 막대의 액체: SVG 로 그린다. 오른쪽 끝선은 사인파 두 개를 겹친 물결이고, waveLoop 가 매 프레임 위상을 옮겨 마루가 위아래로 흐른다.
  //   처음 1초는 0 에서 채운 만큼까지 차오른다. 진폭도 천천히 숨 쉬듯 변한다. 움직임 줄이기 설정이면 멈춘 물결
  var WAVE = { raf: 0, W: 200, H: 26 };
  function waveSvg(f){
    return '<svg id="vd-wave" viewBox="0 0 ' + WAVE.W + ' ' + WAVE.H + '" preserveAspectRatio="none" aria-hidden="true" data-f="' + f.toFixed(4) + '">'
      + '<defs><linearGradient id="vd-wg" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#f0c75e"/><stop offset=".5" stop-color="#d9a441"/><stop offset="1" stop-color="#b07d26"/></linearGradient></defs>'
      + '<path class="wf" fill="url(#vd-wg)" d="M0 0 L0 ' + WAVE.H + ' Z"/><path class="wl" fill="none" stroke="#f9e2a0" stroke-width="1.6" stroke-linejoin="round" vector-effect="non-scaling-stroke" d=""/></svg>';
  }
  function waveLoop(ts){
    WAVE.raf = requestAnimationFrame(waveLoop);
    var s = $('vd-wave'); if (!s || document.hidden || el.hidden) return;
    if (!s._t0) s._t0 = ts;
    var still = window.matchMedia && matchMedia('(prefers-reduced-motion: reduce)').matches;
    var W = WAVE.W, H = WAVE.H, f = +s.getAttribute('data-f'), t = ts / 1000;
    var e = still ? 1 : Math.min(1, (ts - s._t0) / 1000), ease = 1 - Math.pow(1 - e, 3);            // 차오름 (1초, 끝에서 느려짐)
    var x0 = f * W * ease, ph = still ? 0 : t * 2.4, A = f >= 0.999 ? 0 : 5 * (0.75 + 0.25 * Math.sin(t * 1.1));
    var pts = [];
    for (var y = 0; y <= H; y += 1){
      var x = x0 + A * Math.sin(y / H * Math.PI * 2 - ph) + A * 0.45 * Math.sin(y / H * Math.PI * 4 + ph * 0.6);
      pts.push(Math.max(0, Math.min(W, x)).toFixed(2) + ' ' + y);
    }
    s.firstElementChild.nextElementSibling.setAttribute('d', 'M0 0 L' + pts.join(' L') + ' L0 ' + H + ' Z');
    s.lastElementChild.setAttribute('d', x0 > 0.5 ? 'M' + pts.join(' L') : '');
  }
  function cntTxt(atMs){
    var d = (atMs - Date.now()) / 864e5;
    return d <= 0 ? '곧<i>새 기록 확인 중</i>' : etaHM(d).replace(/(시간|분|일|주)/g, '<i>$1</i>');
  }
  function cntTick(){ var b = $('vd-cnt'); if (b) b.innerHTML = cntTxt(+b.getAttribute('data-at')); }
  function renderVideo(){
    var v = sel, a = age(v), V = at(v, a, 1), L = at(v, a, 2), C = at(v, a, 3), s = status(v);
    var pv = peers(v, a, 1), pl = peers(v, a, 2), pc = peers(v, a, 3), tr = trend(v);
    var link = DATA.demo ? '' : 'https://www.youtube.com/watch?v=' + encodeURIComponent(v.id);
    $('vd').innerHTML = '<div class="vd-hd"><div class="vd-ht"><div class="vd-hm"><span class="vp-st' + (s.live ? ' live' : '') + '">' + s.t + '</span>' + (TYPE[v.type] ? '<span class="vp-st">' + TYPE[v.type] + '</span>' : '') + msPill(v)
      + '<small class="vd-when">게시 ' + when(v.pub) + ' · ' + ageTxt(a) + ' 전</small></div><h3>' + esc(v.title) + '</h3></div>'
      + (link ? '<a class="gs vd-yt" href="' + link + '" target="_blank" rel="noopener">YouTube에서 보기 ↗</a>' : '') + '</div>'
      + '<div class="vd-top">'
      + (link ? '<a class="vd-th" href="' + link + '" target="_blank" rel="noopener" aria-label="YouTube에서 보기">' : '<div class="vd-th">')
      + thumb(v) + '<span class="vd-play">' + PLAY + '</span>' + (link ? '</a>' : '</div>')
      // 현황 칸: 윗줄 조회수 · 좋아요 · 댓글, 아랫줄 추이 · 다음 100만 단위 카운터(두 칸)
      + '<div class="vd-stats">'
      // 설명 글이 칸보다 길면 두 줄로: 뒷부분(<i>)은 통째로 다음 줄에 (CSS .vd-s small i)
      + tile('조회수', rank(V, pv), fmt(V), full(V) + '회' + (pv.length >= 3 ? ' <i>· 같은 시점 보통 ' + fmt(q(pv, 0.5)) + '</i>' : ''), spark(v, a))
      + (L == null ? tile('좋아요', '', '숨김', '좋아요 수를 공개하지 않은 영상', '')
         : tile('좋아요', rank(L / V, pl), full(L), '조회수의 ' + pct(L / V, 1) + (pl.length >= 3 ? ' <i>· 보통 ' + pct(q(pl, 0.5), 1) + '</i>' : ''), strip(L / V, pl)))
      + (C == null ? tile('댓글', '', '꺼짐', '댓글을 막아 둔 영상', '')
         : tile('댓글', rank(C / V, pc), full(C), '조회수의 ' + pct(C / V, 2) + (pc.length >= 3 ? ' <i>· 보통 ' + pct(q(pc, 0.5), 2) + '</i>' : ''), strip(C / V, pc)))
      + trendTile(tr) + msTile(v)
      + '</div></div>'
      + '<div class="vd-pred' + (late(v) ? ' late' : '') + '" id="vd-pred"><div class="vd-ph">' + (late(v)
        ? '<h4>100만 단위 돌파 예측</h4><span class="vd-lt" style="--mc:' + MSC + '">③ 추세 곡선</span></div>'
        : '<h4>예측 현황</h4><div class="vd-mt" role="tablist" aria-label="예측 방법">'
      + ORDER.map(function(k){ var m = ALLM[k];
          return '<button type="button" role="tab" data-mi="' + k + '" class="' + (k === mi ? 'on' : '') + '" aria-selected="' + (k === mi) + '" style="--mc:' + m.color + '"><i>' + m.b + '</i>' + m.tab + '</button>';
        }).join('') + '</div></div>')
      + '<p class="vd-md" id="vd-md"></p><div class="vd-hs" id="vd-hs"></div><div id="vd-ex"></div><div class="vd-mlg" id="vd-mlg"></div></div>'
      + '<div class="vd-chart" id="vd-chart"></div>'
      // 예측 성적표: 이 영상에 한 예측이 실제와 얼마나 맞았는지 (그래프 아래)
      + '<div class="vd-sc" id="vs-h"><div class="vd-sch"><h4>예측 성적표</h4><span>이 영상에 한 예측이 실제와 얼마나 맞았는지</span></div><div class="vs" id="vs"></div></div>';
    renderPred();
    if (v.id !== siFor){ si = autoSi(v); siFor = v.id; }                             // 영상이 바뀌면 그 영상에 맞는 탭으로
    renderScore();
  }

  function msPill(v){
    var m = milestone(v); if (m.h == null) return '';
    if (late(v)) return m.far ? '' : '<span class="vp-ms" title="' + daysTxt(m.h / 24) + ' 안">' + fmtM(m.M) + ' 돌파 유력 · ' + msWeek(v, m.p.ms[0]) + '주 차</span>';
    return '<span class="vp-ms" title="' + (m.how === 'lt' ? '최근 추세 기준' : '종합 예측 곡선 기준') + '">' + fmtM(m.M) + ' 돌파 예상 · '
      + (m.h < 1 ? '1시간 안' : '약 ' + ageTxt(m.h) + ' 뒤') + '</span>';
  }

  // ----- 100만 단위 달성 기록 (예측 현황 상자 맨 아래 토글) -----
  // 실제 기록(v.vs: snaps · 15분 기록 hr · 마지막 값)에서 조회수가 100만 단위를 넘은 두 기록 사이를 찾아 그 사이를 곧게 이어 넘은 때를 추정한다.
  // 두 기록 간격이 1.5시간 이하면 분까지("오후 3:12쯤"), 더 넓으면 두 기록 시각 사이("오후 1:40 ~ 7:40 사이") — 모르는 시각을 지어내지 않게.
  // 첫 기록이 게시 2시간(VE.EARLY) 안이면 게시 순간 0회부터 이어 본다. 첫 기록 전에 넘은 단위는 "수집 전"으로만 적는다
  var MLGOPEN = false, WD = ['일', '월', '화', '수', '목', '금', '토'];
  function mlgRows(v){
    var key = v.id + '|mlg';
    if (key in VC) return VC[key];
    var p = v.vs.snaps, rows = [];
    if (!p.length) return (VC[key] = null);
    var pts = p[0][0] <= VE.EARLY ? [[0, 0]].concat(p) : p;
    for (var i = 1; i < pts.length; i++){
      var a = pts[i - 1], b = pts[i];
      for (var M = (Math.floor(a[1] / 1e6) + 1) * 1e6; M <= b[1]; M += 1e6)
        rows.push({ M: M, h: a[0] + (M - a[1]) / (b[1] - a[1]) * (b[0] - a[0]), h0: a[0], h1: b[0] });
    }
    return (VC[key] = { rows: rows.reverse(), before: Math.floor(pts[0][1] / 1e6) * 1e6, firstMs: v.pub + pts[0][0] * 3600e3 });
  }
  function mlgDay(ms){ return dY(ms, Date.now()) + ' (' + WD[new Date(ms).getDay()] + ')'; }
  function mlgTime(ms){ var d = new Date(ms), H = d.getHours(); return (H < 12 ? '오전 ' : '오후 ') + (H % 12 || 12) + ':' + two(d.getMinutes()); }
  function mlgWhen(v, r){
    if (r.h1 - r.h0 <= 1.5){ var t = v.pub + r.h * 3600e3; return mlgDay(t) + ' ' + mlgTime(t) + '쯤'; }
    var t0 = v.pub + r.h0 * 3600e3, t1 = v.pub + r.h1 * 3600e3;
    return mlgDay(t0) + ' ' + mlgTime(t0) + ' ~ ' + (new Date(t0).toDateString() === new Date(t1).toDateString() ? '' : mlgDay(t1) + ' ') + mlgTime(t1) + ' 사이';
  }
  function renderMlg(v){
    var box = $('vd-mlg'); if (!box) return;
    var L = mlgRows(v); if (!L){ box.innerHTML = ''; return; }
    var rows = L.rows, last = rows[0];
    var sum = last ? '최근 ' + fmtM(last.M) + ' · ' + mlgWhen(v, last) : L.before ? '수집 뒤로는 아직 없음' : '아직 없음';
    var h = '<button type="button" class="vd-mlgb" data-mlg aria-expanded="' + MLGOPEN + '">'
      + '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M5 21V4"/><path d="M5 4h12l-2.5 4L17 12H5"/></svg>'
      + '<b>100만 단위 달성 기록</b><span class="vd-mlgc">' + rows.length + '</span>'
      + '<span class="vd-mlgs">' + esc(sum) + '</span><svg class="vd-mlgv" aria-hidden="true"><use href="#i-chev"/></svg></button>'
      + '<div class="vd-mlgp"' + (MLGOPEN ? '' : ' hidden') + '>';
    if (rows.length) h += '<ol class="vd-mlgl">' + rows.map(function(r, i){
        var prev = rows[i + 1];
        return '<li><span class="vd-mlgm">' + fmtM(r.M) + '</span><span class="vd-mlgw"><b>' + esc(mlgWhen(v, r)) + '</b><small>게시 후 ' + ageTxt(r.h)
          + (prev ? ' · ' + fmtM(prev.M) + '부터 ' + ageTxt(r.h - prev.h) : '') + '</small></span></li>';
      }).join('') + '</ol>';
    else h += '<p class="vd-mlge">' + (L.before ? '수집을 시작한 뒤로 새로 넘은 100만 단위가 아직 없습니다.' : '아직 100만을 넘지 않았습니다.') + '</p>';
    if (L.before) h += '<p class="vd-mlgn">' + (L.before >= 2e6 ? '100만 ~ ' : '') + fmtM(L.before) + '은 수집을 시작하기 전(' + when(L.firstMs) + ')에 넘어서 날짜 기록이 없습니다.</p>';
    box.innerHTML = h + '</div>';
  }

  function renderPred(){
    renderMlg(sel);
    if (late(sel)){ renderLate(); return; }
    var v = sel, m = ALLM[mi];
    Array.prototype.forEach.call(el.querySelectorAll('.vd-mt [data-mi]'), function(b){
      var on = +b.getAttribute('data-mi') === mi; b.classList.toggle('on', on); b.setAttribute('aria-selected', String(on));
    });
    var acc = TARGETS.map(function(tg, k){ var s = track(k).sum[mi]; return s.hits ? tg.name + ' ' + pct(s.hit) : null; }).filter(Boolean);
    $('vd-md').innerHTML = '<i style="background:' + m.color + '"></i><span>' + m.short + '</span>'
      + (acc.length ? '<em>지난 예측 범위 적중률 · ' + acc.join(' · ') + '</em>' : '');
    $('vd-hs').innerHTML = TARGETS.map(function(tg, k){ return hzCard(v, k); }).join('');
    chart();
  }

  // 목표 카드: 큰 숫자(예상 또는 실제) · 게이지(채운 막대 = 지금/실제, 칸 = 예상 범위, 세로 막대 = 예측) · 방법별 예측
  function gauge(fill, r, act){
    var top = Math.max(fill, r ? (r.hi != null ? r.hi : r.p) : 0) * 1.1 || 1;
    function P(x){ return Math.min(100, x / top * 100).toFixed(1) + '%'; }
    return '<div class="vh-g" aria-hidden="true"><i class="now" style="width:' + P(fill) + '"></i>'
      + (r && r.lo != null ? '<i class="band" style="left:' + P(r.lo) + ';width:' + ((r.hi - r.lo) / top * 100).toFixed(1) + '%"></i>' : '')
      + (r ? '<i class="pm" style="left:' + P(r.p) + '"></i>' : '')
      + (act ? '<i class="act" style="left:' + P(fill) + '"></i>' : '') + '</div>';
  }
  function mchips(o){
    if (!o.pr) return '';
    return '<div class="vh-ms">' + [0, 1, 2].map(function(k){
      var r = o.pr[k], m = METHODS[k];
      if (!r) return '<span class="vh-mc off" style="--mc:' + m.color + '"><i>' + m.b + '</i>—</span>';
      var res = o.done && r.lo != null ? (o.act >= r.lo && o.act <= r.hi ? ' hit' : ' miss') : '';
      return '<button type="button" class="vh-mc' + (k === mi ? ' on' : '') + res + '" data-mi="' + k + '" style="--mc:' + m.color + '" title="' + m.name
        + (res ? (res === ' hit' ? ' · 범위 안' : ' · 범위 밖') : '') + '"><i>' + m.b + '</i>' + fmt(r.p) + '</button>';
    }).join('') + '</div>';
  }
  function hzCard(v, k){
    var o = hz(v, k), m = ALLM[mi], tg = o.tg, r = o.pr ? o.pr[mi] : null, a = age(v), V = at(v, a, 1);
    var head = function(tag, cls){
      return '<div class="vh-h"><div><b>게시 후 ' + tg.name + '</b><small>' + when(v.pub + tg.T * 3600e3) + '</small></div>'
        + '<span class="vh-tag ' + (cls || '') + '">' + tag + '</span></div>';
    };
    var range = function(lab){ return r && r.lo != null ? '<span class="r">' + lab + ' <b>' + fmtR(r.lo, r.hi) + '</b></span>' : '<span>범위는 과거 영상이 더 모이면</span>'; };
    if (o.done && o.act == null) return '<div class="vh na">' + head('기록 없음') + '<small class="vh-n">' + o.err + '</small></div>';
    if (o.done){
      var res = r ? { err: (r.p - o.act) / o.act, hit: r.lo != null && o.act >= r.lo && o.act <= r.hi } : null;
      var cls = res ? (res.hit ? 'hit' : r.lo != null ? 'miss' : '') : '';
      return '<div class="vh done ' + cls + '" style="--mc:' + m.color + '">'
        + head(res ? (res.hit ? '✓ 예측 적중' : r.lo != null ? '범위 밖' : '지남') : '지남', cls)
        + '<div class="vh-v">' + fmt(o.act) + '<small>실제</small></div>'
        + (r ? '<div class="vh-up" title="' + (Math.abs(res.err) < 0.005 ? '실제와 거의 같게 예측했습니다'
               : '예측이 실제보다 ' + Math.round(Math.abs(res.err) * 100) + '% ' + (res.err > 0 ? '높았습니다' : '낮았습니다')) + '">'
             + tg.from + ' 때 예측 <b>' + fmt(r.p) + '</b> · 오차 <b>' + signPct(res.err) + '</b></div>'
             + gauge(o.act, r, true) + '<div class="vh-gl"><span>실제 <b>' + fmt(o.act) + '</b></span>' + range('예측 범위') + '</div>'
           : '<small class="vh-n">' + (o.err || '이 방법으로는 예측하지 못했습니다') + '</small>')
        + mchips(o) + '</div>';
    }
    if (!r) return '<div class="vh na">' + head('예측 불가') + '<small class="vh-n">' + (o.err || '이 방법으로는 예측하지 못했습니다') + '</small>' + mchips(o) + '</div>';
    return '<div class="vh" style="--mc:' + m.color + '">' + head(ageTxt(tg.T - a) + ' 남음', 'live')
      + '<div class="vh-v">' + fmt(r.p) + '<small>예상</small></div>'
      + '<div class="vh-up">지금보다 <b>+' + fmt(Math.max(0, r.p - V)) + '</b> · ' + (r.p / V >= 2 ? '약 ' + (r.p / V).toFixed(1) + '배' : '+' + Math.round((r.p / V - 1) * 100) + '%') + '</div>'
      + gauge(V, r, false) + '<div class="vh-gl"><span class="n">지금 <b>' + fmt(V) + '</b></span>' + range('범위') + '</div>'
      + mchips(o) + '</div>';
  }

  // ----- 그래프: 실제 추이 + 예측 부채꼴(80% 범위) + 지난 목표의 실제. 마우스를 올리면 값 -----
  function niceStep(x){ var p = Math.pow(10, Math.floor(Math.log(x) / Math.LN10)), f = x / p; return (f <= 1 ? 1 : f <= 2 ? 2 : f <= 2.5 ? 2.5 : f <= 5 ? 5 : 10) * p; }
  function chart(){
    var box = $('vd-chart');
    if (late(sel)){ msChart(); return; }
    if (!UNITS[cm]){ cumChart(); return; }
    var U = UNITS[cm];
    box.innerHTML = chHead('조회수 증가', U.tab + ' 단위 · ' + barRange(sel, cm, U.span))
      + '<div class="vt-hc">' + barChart(sel, cm, U.span, Math.max(320, Math.min(860, (box.clientWidth || 760) - 28)), 240) + '</div>'
      + '<p class="gnote">유튜브가 조회수를 한꺼번에 갱신할 때가 있어 선이 가끔 튈 수 있습니다.</p>';
  }
  function chHead(t, sub, tabs){
    return '<div class="vd-ch"><h4>' + t + '</h4><span>' + sub + '</span><div class="seg vd-cm" role="tablist" aria-label="' + (tabs ? '가로축 단위' : '그래프 종류') + '">'
      + (tabs || '<button type="button" data-cm="cum" class="' + (!UNITS[cm] ? 'on' : '') + '">누적·예측</button>'
      + UORDER.map(function(k){ return '<button type="button" data-cm="' + k + '" class="' + (cm === k ? 'on' : '') + '">' + UNITS[k].tab + '</button>'; }).join('')) + '</div></div>';
  }
  // 방법 k(0~2 방법, 3 종합)의 예측이 아직 없으면 그 이유(언제 나오는지), 있으면 null
  function mStatus(v, k){
    var a = age(v), pool = null, ok = false;
    TARGETS.forEach(function(tg, ti){
      var o = hz(v, ti);
      if (o.done) return;
      if (o.pr && o.pr[k]) ok = true;
      if (o.pool != null) pool = o.pool;
    });
    if (ok) return null;
    var m3 = VE.m3From(v), t3 = m3 > a ? '약 ' + ageTxt(m3 - a) + ' 뒤' : null;
    if (k === 2) return t3 ? t3 + ' 나옵니다' : '기록이 조금 더 쌓이면 나옵니다';
    if (k === 3) return t3 ? '추세 곡선 예측이 나오는 ' + t3 + '부터' : '세 방법 중 하나라도 나오면';
    return '수집 뒤 올라온 영상 ' + MINPOOL + '개가 모이면 (지금 ' + (pool || 0) + '개)';
  }
  function cumChart(){
    var v = sel, m = ALLM[mi], a = age(v), box = $('vd-chart');
    var W = Math.max(320, Math.min(860, (box.clientWidth || 760) - 28)), H = 300, L = 54, R = 22, Tp = 34, B = 34;
    var xmax = Math.max(720, a * 1.04);
    // ③ 추세 곡선으로 본 다음 100만 단위 세 개(예: 800만·900만·1,000만)의 돌파 시점 (첫 번째는 현황 칸 카운터와 같은 값).
    //   60일 안에 드는 점까지 가로축을 늘려서 보여 준다. 하나도 안 들면 오른쪽 위에 한 줄
    var ms = milestone(v), mss = ms.how === 'lt' ? ms.p.ms.filter(function(o){ return o.days != null && a + o.days * 24 <= 1440; })
      .map(function(o){ return { M: o.M, h: a + o.days * 24, d: o.days }; }) : [];
    if (mss.length) xmax = Math.max(xmax, mss[mss.length - 1].h * 1.06);
    // 가로축: 게시(왼쪽 끝)부터. 수집 시작 전 구간(기록 없음)이 1시간 넘게 길면 좁은 칸(gapW)으로 접고 ⋯, 그 뒤는 기록 시작부터 초반을 넓게 보는 눈금(제곱근)
    var s0 = VE.since(v), gapW = s0 > 1 ? 46 : 0, sB = gapW ? Math.max(0, s0 - 1) : 0, PW = W - L - R - gapW;
    function X(h){ return h <= sB ? L + (gapW ? Math.max(0, h) / sB * gapW : 0) : L + gapW + Math.sqrt((h - sB) / (xmax - sB)) * PW; }
    function Hx(x){ if (x <= L + gapW) return gapW ? Math.max(0, (x - L) / gapW) * sB : 0; var f = Math.max(0, Math.min(1, (x - L - gapW) / PW)); return sB + f * f * (xmax - sB); }
    var V0 = at(v, a, 1), knots = [{ h: a, p: V0, lo: V0, hi: V0 }], past = [];
    TARGETS.forEach(function(tg, k){
      var o = hz(v, k), r = o.pr ? o.pr[mi] : null;
      if (o.done && o.act != null) past.push({ h: tg.T, act: o.act, r: r, tg: tg });
      else if (r) knots.push({ h: tg.T, p: r.p, lo: r.lo != null ? r.lo : r.p, hi: r.hi != null ? r.hi : r.p, tg: tg });
    });
    var ymax = 1;
    v.vs.snaps.forEach(function(s){ ymax = Math.max(ymax, s[1]); });
    knots.forEach(function(k){ ymax = Math.max(ymax, k.hi); });
    past.forEach(function(p){ ymax = Math.max(ymax, p.act, p.r ? (p.r.hi || p.r.p) : 0); });
    mss.forEach(function(o){ ymax = Math.max(ymax, o.M); });
    var st = niceStep(ymax * 1.08 / 5), top = Math.ceil(ymax * 1.08 / st) * st;      // 눈금 5칸쯤 → 100만 단위 점들이 덜 붙는다
    function Y(y){ return Tp + (1 - y / top) * (H - Tp - B); }
    var s = '<svg viewBox="0 0 ' + W + ' ' + H + '" role="img" aria-label="조회수 추이와 예측">'
      + '<defs><linearGradient id="vg-a" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#ff4d4f" stop-opacity=".38"/><stop offset="1" stop-color="#ff4d4f" stop-opacity="0"/></linearGradient>'
      + '<linearGradient id="vg-f" x1="0" y1="0" x2="1" y2="0"><stop offset="0" stop-color="' + m.color + '" stop-opacity=".08"/><stop offset="1" stop-color="' + m.color + '" stop-opacity=".3"/></linearGradient>'
      + '<pattern id="vg-h" width="7" height="7" patternUnits="userSpaceOnUse" patternTransform="rotate(45)"><rect width="7" height="7" fill="rgba(255,255,255,.015)"/><line x1="0" y1="0" x2="0" y2="7" stroke="rgba(255,255,255,.07)" stroke-width="2"/></pattern></defs>';
    for (var y = 0; y <= top + 1e-9; y += st)
      s += '<line x1="' + L + '" x2="' + (W - R) + '" y1="' + Y(y).toFixed(1) + '" y2="' + Y(y).toFixed(1) + '" stroke="rgba(255,255,255,' + (y ? .07 : .18) + ')"/>'
        + '<text x="' + (L - 8) + '" y="' + (Y(y) + 4).toFixed(1) + '" text-anchor="end" font-size="11" fill="#8e8e93">' + fmt(y) + '</text>';
    // 가로 눈금: 왼쪽 끝은 게시 날짜(빨강), 그 뒤는 자정마다 실제 날짜 (겹치면 건너뜀, 앞으로의 날짜는 굵게)
    s += '<text x="' + L + '" y="' + (H - B + 19) + '" text-anchor="start" font-size="11" font-weight="700" fill="#ff9e9a">' + md(v.pub) + '</text>';
    var lastX = L + 30, dt = new Date(v.pub + sB * 3600e3); dt.setHours(24, 0, 0, 0);
    for (; dt.getTime() <= v.pub + xmax * 3600e3; dt.setDate(dt.getDate() + 1)){
      var th = (dt.getTime() - v.pub) / 3600e3, tx = X(th);
      if (tx - lastX < 40 || tx > W - R - 14) continue; lastX = tx;
      s += '<text x="' + tx.toFixed(1) + '" y="' + (H - B + 19) + '" text-anchor="middle" font-size="11" font-weight="' + (th > a ? 700 : 500) + '" fill="' + (th > a ? '#aeaeb2' : '#8e8e93') + '">' + md(dt.getTime()) + '</text>';
    }
    // 목표 시점 세로선 (기록 시작 전에 지난 목표는 접힌 칸 안이라 생략)
    TARGETS.forEach(function(tg){
      if (tg.T < sB) return;
      s += '<line x1="' + X(tg.T).toFixed(1) + '" x2="' + X(tg.T).toFixed(1) + '" y1="' + (Tp - 6) + '" y2="' + (H - B) + '" stroke="rgba(255,255,255,.14)" stroke-dasharray="3 5"/>'
        + '<text x="' + X(tg.T).toFixed(1) + '" y="' + (Tp - 12) + '" text-anchor="middle" font-size="11" font-weight="700" fill="#aeaeb2">' + tg.name + '</text>';
    });
    // 수집을 시작하기 전 구간(기록 없음)은 접힌 칸: 빗금 + ⋯ + 축 끊김 표시(//). 왼쪽 위에 게시 시각
    if (gapW){
      var gx = L + gapW;
      s += '<rect x="' + L + '" y="' + Tp + '" width="' + gapW + '" height="' + (H - Tp - B) + '" fill="url(#vg-h)"/>'
        + '<text x="' + (L + gapW / 2).toFixed(1) + '" y="' + (H - B + 19) + '" text-anchor="middle" font-size="12" font-weight="800" fill="#8e8e93">⋯</text>'
        + '<line x1="' + (gx - 4) + '" x2="' + (gx + 4) + '" y1="' + (H - B + 5) + '" y2="' + (H - B - 5) + '" stroke="#8e8e93" stroke-width="1.5"/>'
        + '<line x1="' + (gx + 1) + '" x2="' + (gx + 9) + '" y1="' + (H - B + 5) + '" y2="' + (H - B - 5) + '" stroke="#8e8e93" stroke-width="1.5"/>'
        + '<line x1="' + gx + '" x2="' + gx + '" y1="' + Tp + '" y2="' + (H - B - 6) + '" stroke="rgba(255,255,255,.12)" stroke-dasharray="3 4"/>';
    }
    s += '<text x="' + (L + 2) + '" y="' + (Tp - 12) + '" font-size="10.5" font-weight="700" fill="#ff9e9a">게시 ' + when(v.pub) + '</text>';
    // 실제 추이 (면 + 선)
    var pts = v.vs.snaps.filter(function(p){ return p[0] <= xmax; }), s0 = VE.since(v);       // 15분 간격 값까지 써서 촘촘하게. 게시 직후 기록이 없으면 기록 시작점부터
    var line = s0 ? '' : 'M' + X(0).toFixed(1) + ' ' + Y(0).toFixed(1);
    pts.forEach(function(p, i){ line += (line ? ' L' : 'M') + X(p[0]).toFixed(1) + ' ' + Y(p[1]).toFixed(1); });
    s += '<path d="' + line + ' L' + X(pts[pts.length - 1][0]).toFixed(1) + ' ' + Y(0).toFixed(1) + ' L' + X(s0 ? pts[0][0] : 0).toFixed(1) + ' ' + Y(0).toFixed(1) + ' Z" fill="url(#vg-a)"/>'
      + '<path d="' + line + '" fill="none" stroke="#ff4d4f" stroke-width="2.6" stroke-linejoin="round" stroke-linecap="round"/>';
    // 예측 부채꼴
    if (knots.length > 1){
      var up = '', dn = '', mdp = '';
      knots.forEach(function(k, i){ up += (i ? ' L' : 'M') + X(k.h).toFixed(1) + ' ' + Y(k.hi).toFixed(1); mdp += (i ? ' L' : 'M') + X(k.h).toFixed(1) + ' ' + Y(k.p).toFixed(1); });
      knots.slice().reverse().forEach(function(k){ dn += ' L' + X(k.h).toFixed(1) + ' ' + Y(k.lo).toFixed(1); });
      s += '<path d="' + up + dn + ' Z" fill="url(#vg-f)" stroke="' + m.color + '" stroke-opacity=".35" stroke-width="1"/>'
        + '<path d="' + mdp + '" fill="none" stroke="' + m.color + '" stroke-width="2.4" stroke-dasharray="7 5" stroke-linecap="round"/>';
      // 목표 시점 예측 점(범례 "예측 포인트"): 다이아몬드. 값 글자는 점 위로 8px 띄워 가운데 맞춤(오른쪽 끝 점은 칸 안쪽으로 끝 맞춤),
      //   어두운 테두리(paint-order stroke)를 둘러 예측 점선 · 100만 단위 선 위에서도 읽히게
      knots.slice(1).forEach(function(k){
        var x = X(k.h), y = Y(k.p), D = 6.5, right = x > W - R - 24;
        s += '<path d="M' + x.toFixed(1) + ' ' + (y - D).toFixed(1) + ' L' + (x + D).toFixed(1) + ' ' + y.toFixed(1) + ' L' + x.toFixed(1) + ' ' + (y + D).toFixed(1)
          + ' L' + (x - D).toFixed(1) + ' ' + y.toFixed(1) + ' Z" fill="' + m.color + '" stroke="#1c1c1e" stroke-width="2" stroke-linejoin="round"/>'
          + '<text x="' + (right ? x + D : x).toFixed(1) + '" y="' + (y - D - 8).toFixed(1) + '" text-anchor="' + (right ? 'end' : 'middle') + '" font-size="12" font-weight="700" fill="' + m.color
          + '" stroke="#1c1c1e" stroke-width="4" stroke-linejoin="round" paint-order="stroke">' + fmt(k.p) + '</text>';
      });
    }
    // 고른 방법의 예측이 아직 없으면, 예측선이 들어갈 자리(지금 오른쪽)에 이유를 적는다
    var why = knots.length > 1 ? null : mStatus(v, mi);
    if (why){
      var fx = (X(a) + (W - R)) / 2, fy = Tp + (H - Tp - B) / 2;
      s += '<text x="' + fx.toFixed(1) + '" y="' + (fy - 6).toFixed(1) + '" text-anchor="middle" font-size="13" font-weight="700" fill="' + m.color + '">' + esc(m.tab) + ' 예측선 준비 중</text>'
        + '<text x="' + fx.toFixed(1) + '" y="' + (fy + 13).toFixed(1) + '" text-anchor="middle" font-size="11.5" fill="#aeaeb2">' + esc(why) + '</text>';
    }
    // 지난 목표: 실제(흰 점)
    past.forEach(function(p){
      var x = X(p.h);
      s += '<circle cx="' + x.toFixed(1) + '" cy="' + Y(p.act).toFixed(1) + '" r="5" fill="#fff" stroke="#ff4d4f" stroke-width="2.2"/>';
    });
    // 다음 100만 단위 돌파 예상: 단위마다 돌파선 + 점 (민트 MSC). 글자는 그래프 선을 가리지 않게 그래프 위 알약(msPill)으로 올리고,
    //   모든 점은 마우스를 올리면(휴대폰은 누르면) 말풍선에 돌파 예상 날짜·시각이 나온다 (아래 lineTip 의 msHit)
    mss.forEach(function(o, i){
      var mx = X(o.h), my = Y(o.M);
      s += '<line x1="' + L + '" x2="' + (W - R) + '" y1="' + my.toFixed(1) + '" y2="' + my.toFixed(1) + '" stroke="' + MSC + '" stroke-opacity="' + (i ? .22 : .45) + '" stroke-dasharray="6 5"/>'
        + '<line x1="' + mx.toFixed(1) + '" x2="' + mx.toFixed(1) + '" y1="' + my.toFixed(1) + '" y2="' + (H - B) + '" stroke="' + MSC + '" stroke-opacity="' + (i ? .18 : .3) + '" stroke-dasharray="2 4"/>'
        + '<circle cx="' + mx.toFixed(1) + '" cy="' + my.toFixed(1) + '" r="' + (i ? 4.5 : 5.5) + '" fill="' + MSC + '" fill-opacity="' + (i ? .75 : 1) + '" stroke="#1c1c1e" stroke-width="2"/>';
    });
    var msPill = mss.length ? '<span class="vd-msp"><i></i>' + fmtM(mss[0].M) + ' 돌파 예상 <b>' + ddayAP(v, mss[0].d * 24) + '</b></span>'
      : ms.how === 'lt' ? '<span class="vd-msp na"><i></i>' + (ms.h == null ? '지금 추세로는 ' + fmtM(ms.M) + ' 전에 멈춥니다' : fmtM(ms.M) + ' 돌파는 60일 뒤 <b>' + ddayAP(v, ms.h) + '</b>') + '</span>' : '';
    // 지금
    s += '<line x1="' + X(a).toFixed(1) + '" x2="' + X(a).toFixed(1) + '" y1="' + Tp + '" y2="' + (H - B) + '" stroke="#ff4d4f" stroke-opacity=".5" stroke-dasharray="2 4"/>'
      + '<text x="' + X(a).toFixed(1) + '" y="' + (Tp - 24) + '" text-anchor="middle" font-size="10.5" font-weight="700" fill="#ff9e9a">지금</text>'
      + '<circle cx="' + X(a).toFixed(1) + '" cy="' + Y(V0).toFixed(1) + '" r="5.5" fill="#ff4d4f" stroke="#1c1c1e" stroke-width="2"/>';
    // 마우스 따라가는 선과 점
    s += '<line id="vd-cx" y1="' + Tp + '" y2="' + (H - B) + '" stroke="rgba(255,255,255,.45)" stroke-width="1" style="display:none"/>'
      + '<circle id="vd-cd" r="5" stroke="#1c1c1e" stroke-width="2" style="display:none"/></svg>';
    box.innerHTML = chHead('조회수 추이와 예측', m.tab + ' 예측 · 게시 ' + md(v.pub) + (gapW ? ' ⋯ ' + md(v.pub + s0 * 3600e3) + '부터 기록' : '') + ' → ' + md(v.pub + xmax * 3600e3))
      + (msPill ? '<div class="vd-cms">' + msPill + '</div>' : '')
      + s + '<div class="vd-tip" id="vd-tip" hidden></div>'
      + '<div class="vd-key"><span><i class="k-a"></i>실제 조회수</span>'
      + (knots.length > 1 ? '<span style="--mc:' + m.color + '"><i class="k-p"></i>예측</span><span style="--mc:' + m.color + '"><i class="k-r"></i>80% 범위</span>'
        + '<span style="--mc:' + m.color + '"><i class="k-dm"></i>예측 포인트</span>' : '')
      // 흰 점은 지난 목표 시점의 실제 조회수 — 예전 이름 "예측 포인트"는 위 다이아몬드(목표 시점 예측)에 쓰게 되어 이름을 나눔
      + (past.length ? '<span><i class="k-d"></i>지난 목표 실제</span>' : '')
      + (mss.length ? '<span style="--mc:' + MSC + '"><i class="k-ms"></i>100만 단위 돌파 예상</span><small class="vd-kn">100만 단위 예상은 추세가 바뀌면 달라집니다</small>' : '')
      + '</div>';
    // 값 읽기: 지금까지는 실제, 그 뒤는 부채꼴 매듭 사이를 가로 위치 기준으로 잇는다
    function valAt(h){
      if (h <= a){ var x = at(v, h, 1); return x == null ? null : { act: x }; }
      for (var i = 1; i < knots.length; i++) if (h <= knots[i].h || i === knots.length - 1){
        var k0 = knots[i - 1], k1 = knots[i], f = Math.max(0, Math.min(1, (X(h) - X(k0.h)) / (X(k1.h) - X(k0.h) || 1)));
        if (h > k1.h) return null;
        return { p: k0.p + (k1.p - k0.p) * f, lo: k0.lo + (k1.lo - k0.lo) * f, hi: k0.hi + (k1.hi - k0.hi) * f };
      }
      return null;
    }
    // 100만 단위 점 가까이(14px 안)면 그 점의 말풍선: 게시 후 시간 · 돌파 예상 날짜와 시각 · 지금부터 얼마 뒤
    function msHit(x, y){
      var best = null, bd = 14;
      mss.forEach(function(o){ var d = Math.max(Math.abs(X(o.h) - x), Math.abs(Y(o.M) - y)); if (d < bd){ bd = d; best = o; } });
      if (!best) return null;
      var t = v.pub + best.h * 3600e3;                                       // 날짜는 dday (이 함수 안에서 md 는 예측선 path 변수)
      return { x: X(best.h), y: Y(best.M), color: MSC,
        html: '<b>게시 후 ' + ageTxt(best.h) + '</b><span><em style="color:' + MSC + '">' + fmtM(best.M) + '</em> 돌파 예상 <em style="color:' + MSC + '">' + dday(v, best.h - a) + ' ' + hm(t) + '</em></span>'
          + '<small>지금부터 약 ' + etaHM(best.d) + ' 뒤 · 추세가 바뀌면 달라집니다</small>' };
    }
    lineTip(box, W, H, L, R, function(x, y){
      var hit = msHit(x, y); if (hit) return hit;
      var h = Hx(x), val = valAt(h);
      if (!val) return null;
      var yv = val.act != null ? val.act : val.p;
      return { x: X(h), y: Y(yv), color: val.act != null ? '#ff4d4f' : m.color,
        html: '<b>게시 후 ' + ageTxt(h) + '</b>' + (val.act != null
          ? '<span>실제 조회수 <em>' + full(val.act) + '</em></span>'
          : '<span>' + m.tab + ' 예측 <em style="color:' + m.color + '">' + fmt(val.p) + '</em></span><small>80% 범위 ' + fmt(val.lo) + ' ~ ' + fmt(val.hi) + '</small>') };
    });
  }

  // ----- 예측 방법: 공식 없이 쉬운 설명 -----
  function renderMethods(){
    if (!$('vm-list')) return;
    $('vm-list').innerHTML = METHODS.map(function(m, k){
      var s = track(1).sum[k];
      return '<button type="button" class="vm" data-mi="' + k + '" style="--mc:' + m.color + '">'
        + '<span class="vm-h"><span class="vp-no">' + m.b + '</span><b>' + m.name + '</b></span>'
        + '<span class="vp-tags">' + m.uses.map(function(u){ return '<span>' + u + '</span>'; }).join('') + '</span>'
        + '<span class="vm-pc"><span class="p">' + m.pro + '</span><span class="c">' + m.con + '</span></span>'
        + '<span class="vm-acc">' + (s.n ? '7일 예측 ' + (s.hits ? '<b>적중 ' + pct(s.hit) + '</b> · ' : '') + '<b>오차 ' + pct(s.mape) + '</b>' : '7일 예측 기록 없음')
        + (k === 2 ? (function(){                                                                  // ③ 은 100만 단위 구간 채점 결과도
            var S = segAll().sum, any = S.some(function(x){ return x.n; });
            return '<br>' + (any ? '100만 구간 오차 ' + S.map(function(x, j){ return SEGS[j] + ' <b>' + (x.mape != null ? pct(x.mape) : '—') + '</b>'; }).join(' · ') : '100만 단위 구간 채점 결과 아직 없음');
          })() : '')
        + '<em>이 방법으로 보기 →</em></span>'
        + '</button>';
    }).join('');
  }

  // ----- 예측 성적표 (영상 상세 상자 안, 그래프 아래): 선택한 영상 하나 -----
  //   [6시간 → 24시간 | 24시간 → 7일 | 7일 → 30일]: 예측 시점(게시 6시간·24시간·7일)에 고정한 예측(①②③·종합) vs 목표 시점 실제
  //   [100만 단위 예측 확인]: 이 영상의 100만 단위 구간 기록 (구간마다 100만·50만·20만 남은 지점의 도달 예측)
  // 영상을 고르면 보여 줄 탭: 30일 예측이 끝난 영상은 100만, 아니면 결과가 나온 가장 늦은 목표 → 고정된 예측이 있는 첫 목표 → 앞으로 고정할 첫 목표 → 24시간 → 7일
  function autoSi(v){
    if (late(v)) return 3;
    var ks = [0, 1, 2].filter(function(k){ return track(k).rows.some(function(r){ return r.v === v; }); });
    var done = ks.filter(function(k){ return age(v) >= TARGETS[k].T; });
    if (done.length) return done[done.length - 1];
    if (ks.length) return ks[0];
    var up = [0, 1, 2].filter(function(k){ return age(v) < TARGETS[k].c && VE.since(v) <= TARGETS[k].c; });   // 앞으로 예측을 고정할 목표
    return up.length ? up[0] : 1;
  }
  function scoreSeg(){
    return '<div class="seg vs-seg" role="tablist" aria-label="성적표 목표">' + TARGETS.map(function(x, k){
        return '<button type="button" role="tab" data-si="' + k + '" class="' + (k === si ? 'on' : '') + '" aria-selected="' + (k === si) + '">' + x.from + ' → ' + x.name + '</button>';
      }).join('') + '<button type="button" role="tab" data-si="3" class="' + (si === 3 ? 'on' : '') + '" aria-selected="' + (si === 3) + '">100만 단위 예측 확인</button></div>';
  }

  function renderScore(){
    var v = sel, box = $('vs'); if (!v || !box) return;
    var h = '<div class="vs-top">' + scoreSeg() + '</div>';
    if (si === 3){ box.innerHTML = h + segScore(v); return; }
    var tg = TARGETS[si], a = age(v), row = track(si).rows.filter(function(r){ return r.v === v; })[0];
    var at0 = v.pub + tg.c * 3600e3, atT = v.pub + tg.T * 3600e3;
    if (!row){
      var f = frozen(v, tg), why = a < tg.c ? '게시 ' + tg.from + ' 뒤(' + when(at0) + ')에 예측을 고정하고, ' + tg.name + ' 뒤(' + when(atT) + ')에 채점합니다. ' + ageTxt(tg.c - a) + ' 남았습니다.'
        : VE.since(v) > tg.c ? '수집을 시작하기 전에 게시 ' + tg.from + '이 지나 이 예측은 없습니다.'
        : f && f.err ? f.err + '.'
        : '게시 ' + tg.from + ' 뒤에는 기록이 모자라 어느 방법으로도 예측하지 못했습니다.';
      box.innerHTML = h + '<p class="anote">' + why + '</p>'; return;
    }
    var best = -1, bm = Infinity;
    if (row.done) [0, 1, 2].forEach(function(k){ var x = row.res[k]; if (x && Math.abs(x.err) < bm){ bm = Math.abs(x.err); best = k; } });
    var base = at(v, tg.c, 1);
    h += '<p class="vs-line">게시 <b>' + tg.from + '</b> 뒤(' + when(at0) + ')' + (base != null ? ' 조회수 <b>' + fmt(base) + '</b>일 때' : '') + ' 고정한 예측 → '
      + (row.done ? '게시 <b>' + tg.name + '</b> 뒤(' + when(atT) + ') 실제 <b>' + fmt(row.act) + '</b>'
        : '<b>' + ageTxt(tg.T - a) + ' 뒤</b>(' + when(atT) + ')에 실제 조회수와 비교합니다') + '</p>'
      + '<div class="vs-cards">' + ORDER.map(function(k){
          var r = row.pr[k], x = row.res[k], m = ALLM[k];
          return '<div class="vs-c' + (k === best ? ' best' : '') + '" style="--mc:' + m.color + '">'
            + '<div class="vs-ch"><span class="vp-no">' + m.b + '</span>' + m.tab + (k === best ? '<em>가장 정확</em>' : '') + '</div>'
            + (!r ? '<small>' + (k === 3 ? '예측이 없습니다' : k < 2 ? '비교할 과거 영상이 ' + MINPOOL + '개 모이면 예측합니다' : '기록이 모자라 예측하지 못했습니다') + '</small>'
              : '<div class="vs-row"><span>예측</span><b>' + fmt(r.p) + '</b></div>'
                + '<div class="vs-row"><span>범위</span><em>' + (r.lo != null ? fmt(r.lo) + ' ~ ' + fmt(r.hi) : '—') + '</em></div>'
                + '<div class="vs-row"><span>오차</span>' + (x ? '<b class="sc-e' + (x.hit == null ? '' : x.hit ? ' hit' : ' miss') + '">' + signPct(x.err) + (x.hit == null ? '' : x.hit ? ' ✓' : ' ✗') + '</b>'
                  : '<em>' + (row.done ? '—' : '채점 전') + '</em>') + '</div>')
            + '</div>';
        }).join('') + '</div>'
      + '<p class="gnote">예측 시점에 한 번 고정한 값이라 위 "예측 현황"의 지금 예측과 다를 수 있습니다. 오차 = (예측 − 실제) ÷ 실제, ✓ 는 실제가 예측 범위(80%) 안에 들어온 경우입니다.</p>';
    box.innerHTML = h;
  }
  // [100만 단위 예측 확인]: 이 영상의 구간 기록
  function segScore(v){
    var L = (v.seg || []).filter(function(s){ return s.c && s.c.length; }).slice().reverse();
    // 기록이 없을 때 안내: 어느 영상이든 같은 설명 한 문장 + 아직 지점을 안 지났다는 것
    if (!L.length) return '<p class="anote">100만 단위 구간마다 100만·50만·20만이 남은 지점을 지날 때 다음 100만 도달 예측을 고정하고, 실제로 닿으면 채점합니다. '
        + '이 영상은 아직 이 지점들을 지나지 않았습니다.</p>';
    return '<div class="sg-list">' + L.map(function(s){ return segRow(v, s, true); }).join('') + '</div>'
      + '<p class="gnote">100만·50만·20만이 남은 지점을 지날 때 한 도달 예측을 실제로 닿은 때와 비교합니다. 오차가 + 이면 실제보다 늦게, − 이면 빨리 닿는다고 본 것이고, 8주보다 먼 예측은 <i class="sg-far">참고</i>입니다.</p>';
  }

  function pick(v, scroll){
    sel = v;
    Array.prototype.forEach.call(el.querySelectorAll('.vc'), function(b){
      var on = b.getAttribute('data-vid') === v.id; b.classList.toggle('on', on); b.setAttribute('aria-pressed', String(on));
      if (on && scroll) b.scrollIntoView({ block: 'nearest', inline: 'center', behavior: 'smooth' });
    });
    Array.prototype.forEach.call(el.querySelectorAll('.vt-r'), function(r){
      var b = r.querySelector('[data-vid]'); r.classList.toggle('on', !!b && b.getAttribute('data-vid') === v.id);
    });
    Array.prototype.forEach.call(el.querySelectorAll('.mb-r, .hf-r'), function(b){ b.classList.toggle('on', b.getAttribute('data-vid') === v.id); });
    renderVideo();
  }
  el.addEventListener('keydown', function(e){
    if (e.key !== 'Enter' && e.key !== ' ') return;
    var fv = e.target.closest && e.target.closest('span[data-fav]');
    if (fv){ e.preventDefault(); toggleFav(fv.getAttribute('data-fav')); }
  });
  el.addEventListener('click', function(e){
    var mlg = e.target.closest('[data-mlg]');                 // 100만 단위 달성 기록 펼치기 · 접기 (영상을 바꿔도 유지)
    if (mlg){ MLGOPEN = !MLGOPEN; mlg.setAttribute('aria-expanded', String(MLGOPEN)); mlg.nextElementSibling.hidden = !MLGOPEN; return; }
    var fv = e.target.closest('[data-fav]');
    if (fv){ toggleFav(fv.getAttribute('data-fav')); return; }
    var jp = e.target.closest('[data-jump]');
    if (jp){ ($(jp.getAttribute('data-jump')) || $('vd')).scrollIntoView({ block: 'start', behavior: 'smooth' }); return; }
    var b = e.target.closest('[data-vid]');
    if (b){
      var v = VIDEOS.filter(function(x){ return x.id === b.getAttribute('data-vid'); })[0];
      if (v){
        var far = b.hasAttribute('data-go') || !!b.closest('.vs');     // 표·성적표에서 고르면 상세로 스크롤
        pick(v, far); if (far) $('vd').scrollIntoView({ block: 'start', behavior: 'smooth' });
      }
      return;
    }
    if (e.target.closest('#vr-fav') && rv === 'fav'){ e.preventDefault(); e.stopPropagation(); return; }
    var rvb = e.target.closest('[data-rv]');
    if (rvb){
      // 탭마다 보던 영상을 기억해 두고, 탭을 바꾸면 아래 상세도 그 탭의 영상으로 (100만 탭은 목록 안의 영상만)
      var to = rvb.getAttribute('data-rv');
      if (rv === 'fav'){ rvBack = to; goTab('views'); return; }                 // 즐겨찾기 페이지 → 조회수 예측기의 그 탭
      var was = sel;
      if (!setRv(to)) return;
      renderRank(); if (sel && sel !== was) pick(sel);
      return;
    }
    var f = e.target.closest('[data-ft]');
    if (f){ ft = f.getAttribute('data-ft'); tn = 20; renderRank(); renderTable(); return; }
    var t = e.target.closest('[data-ts]');
    if (t){ ts = t.getAttribute('data-ts'); renderTable(); return; }
    var hu = e.target.closest('[data-hu]');
    if (hu){
      var uv = hu.getAttribute('data-hv');
      HUNIT[uv] = hu.getAttribute('data-hu');
      rowDetail(VIDEOS.filter(function(v){ return v.id === uv; })[0]);
      return;
    }
    var hs = e.target.closest('[data-hs]');
    if (hs){
      var hv = hs.getAttribute('data-hv');
      HSPAN[hv] = +hs.getAttribute('data-hs');
      rowDetail(VIDEOS.filter(function(v){ return v.id === hv; })[0]);
      return;
    }
    var x = e.target.closest('[data-exp]');
    if (x){
      var id = x.getAttribute('data-exp'), tr = x.closest('tr'), d = tr.nextElementSibling;
      OPEN[id] = !OPEN[id]; tr.classList.toggle('open', OPEN[id]); x.setAttribute('aria-expanded', String(OPEN[id])); d.hidden = !OPEN[id];
      if (OPEN[id]) rowDetail(VIDEOS.filter(function(v){ return v.id === id; })[0]);
      return;
    }
    if (e.target.closest('[data-more]')){ tn += 20; renderTable(); return; }
    var mub = e.target.closest('[data-mu]');
    if (mub){ mu = mub.getAttribute('data-mu'); msChart(); return; }
    var c = e.target.closest('[data-cm]');
    if (c){ cm = c.getAttribute('data-cm'); chart(); return; }
    if (e.target.closest('#vx-chk')){ recheck(true); return; }
    var n = e.target.closest('[data-nav]');
    if (n){ var row = $('vc-row'); row.scrollBy({ left: +n.getAttribute('data-nav') * row.clientWidth * 0.85, behavior: 'smooth' }); return; }
    var mt = e.target.closest('[data-mi]');
    if (mt){
      mi = +mt.getAttribute('data-mi'); renderPred();
      if (mt.closest('.vm-list')) $('vd-pred').scrollIntoView({ block: 'start', behavior: 'smooth' });
      return;
    }
    var sc = e.target.closest('[data-si]');
    if (sc){ si = +sc.getAttribute('data-si'); renderScore(); }
  });

  // ----- 시간별 막대 수치 말풍선: PC는 마우스를 올리면, 모바일은 꾹 누르고 있는 동안 -----
  var tip = document.createElement('div');
  tip.className = 'vh-tip'; tip.hidden = true; tip.setAttribute('role', 'status');
  document.body.appendChild(tip);
  var tipBar = null, pressT = null, pressing = false;
  function tipShow(hit, cx, cy){
    if (!hit) return tipHide();
    var svg = hit.ownerSVGElement, bar = svg && svg.querySelector('rect.hb[data-bi="' + hit.getAttribute('data-bi') + '"]');
    if (tipBar && tipBar !== bar) tipBar.classList.remove('act');
    tipBar = bar; if (bar) bar.classList.add('act');
    tip.innerHTML = '<b>' + hit.getAttribute('data-tt') + '</b><em>' + hit.getAttribute('data-tv') + '</em><small>' + (hit.getAttribute('data-tu') || '') + '</small>';
    tip.hidden = false;
    var w = tip.offsetWidth, h = tip.offsetHeight, x = cx - w / 2, y = cy - h - 18;
    x = Math.max(8, Math.min(window.innerWidth - w - 8, x));
    if (y < 8) y = cy + 22;
    tip.style.left = x + 'px'; tip.style.top = y + 'px';
  }
  function tipHide(){
    tip.hidden = true;
    if (tipBar){ tipBar.classList.remove('act'); tipBar = null; }
  }
  function hitAt(x, y){ var t = document.elementFromPoint(x, y); return t && t.closest ? t.closest('.vh-svg .hit') : null; }
  document.addEventListener('pointermove', function(e){
    if (e.pointerType === 'mouse'){ var h = e.target.closest && e.target.closest('.vh-svg .hit'); if (h) tipShow(h, e.clientX, e.clientY); else if (tipBar) tipHide(); return; }
    if (pressing){ e.preventDefault(); tipShow(hitAt(e.clientX, e.clientY), e.clientX, e.clientY); }
    else if (pressT){ clearTimeout(pressT); pressT = null; }                 // 누르자마자 움직이면 스크롤로 본다
  }, { passive: false });
  document.addEventListener('pointerdown', function(e){
    if (e.pointerType === 'mouse') return;
    var h = e.target.closest && e.target.closest('.vh-svg .hit'); if (!h) return;
    var x = e.clientX, y = e.clientY;
    pressT = setTimeout(function(){ pressT = null; pressing = true; tipShow(hitAt(x, y) || h, x, y); }, 320);
  });
  function pressEnd(){ if (pressT){ clearTimeout(pressT); pressT = null; } if (pressing){ pressing = false; tipHide(); } }
  document.addEventListener('pointerup', pressEnd);
  document.addEventListener('pointercancel', pressEnd);
  document.addEventListener('scroll', function(){ if (!pressing) tipHide(); }, true);
  // 꾹 누르는 동안 브라우저 메뉴(이미지 저장 등)가 뜨지 않게
  document.addEventListener('contextmenu', function(e){ if (e.target.closest && e.target.closest('.vh-svg, .vd-chart svg')) e.preventDefault(); });
})();
