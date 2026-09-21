// 조회수 예측기
// 유튜브 채널 영상의 조회수·좋아요·댓글 기록(스냅샷)으로 앞으로의 조회수를 세 가지 간단한 공식으로 예측하고,
// 과거 영상에 같은 공식을 적용해 본 결과로 오차 범위와 적중률을 보여 준다. 계산은 모두 브라우저에서, 불러올 때 한 번만 한다.
//
// 데이터: data/views.json — 1시간마다 기록을 쌓는 수집기(따로 만든다)가 채우는 파일
//   { channel: { handle, title, url }, updated: ISO 시각,
//     videos: [ { id, title, published: ISO 시각, snaps: [[게시 후 시간(h), 조회수, 좋아요, 댓글], ...] } ] }
//   이 파일이 없으면 화면 구성을 보여 주기 위한 예시 데이터를 만들어 쓰고, 예시라고 크게 표시한다.
(function(){
  var main = document.querySelector('main.mn');
  if (!main || !window.SG) return;

  var CHANNEL = { handle: '@helloiamwoninicetomeetyou', url: 'https://www.youtube.com/@helloiamwoninicetomeetyou' };
  // 예측 목표. c: 이 목표를 트래킹할 때 예측을 만드는 시점(게시 후 시간)
  var TARGETS = [
    { T: 24, c: 6, name: '24시간', from: '6시간' },
    { T: 168, c: 24, name: '7일', from: '24시간' },
    { T: 720, c: 168, name: '30일', from: '7일' }
  ];
  var MINPOOL = 5;                     // 과거 영상이 이보다 적으면 예측하지 않는다

  function $(id){ return document.getElementById(id); }
  function esc(s){ return String(s).replace(/[&<>"']/g, function(c){ return { '&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;' }[c]; }); }
  function full(n){ return Math.round(n).toLocaleString('ko-KR'); }
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
  function hLab(h){ return h < 24 ? h + '시간' : (h / 24) + '일'; }
  function two(n){ return n < 10 ? '0' + n : '' + n; }
  function when(ms){ var d = new Date(ms); return (d.getMonth() + 1) + '/' + d.getDate() + ' ' + two(d.getHours()) + ':' + two(d.getMinutes()); }
  function q(a, p){
    var s = a.slice().sort(function(x, y){ return x - y; }); if (!s.length) return NaN;
    var i = (s.length - 1) * p, lo = Math.floor(i), hi = Math.ceil(i);
    return s[lo] + (s[hi] - s[lo]) * (i - lo);
  }
  function mean(a){ return a.reduce(function(x, y){ return x + y; }, 0) / a.length; }

  // ---------- 기록 읽기 ----------
  var DATA = null, VIDEOS = [];
  // 게시 후 t시간의 값(기록 사이는 직선으로 잇는다). k: 1 조회수, 2 좋아요, 3 댓글. 기록보다 뒤면 null
  function at(v, t, k){
    var s = v.snaps;
    if (!s.length || t > s[s.length - 1][0] + 1e-6) return null;
    if (t <= s[0][0]) return s[0][0] > 0 ? s[0][k] * t / s[0][0] : s[0][k];      // 게시 순간(0)부터 첫 기록까지
    var lo = 1, hi = s.length - 1;                                                  // s[i][0] >= t 인 첫 i (이진 탐색)
    while (lo < hi){ var mid = (lo + hi) >> 1; if (s[mid][0] >= t) hi = mid; else lo = mid + 1; }
    var a = s[lo - 1], b = s[lo], f = (t - a[0]) / (b[0] - a[0] || 1);
    return a[k] + (b[k] - a[k]) * f;
  }
  function age(v){ return v.snaps.length ? v.snaps[v.snaps.length - 1][0] : 0; }
  // v 를 예측할 때 쓸 과거 영상: 기준 시각(ms)까지 목표 시점 T 에 이미 도달해 있던 다른 영상
  function poolFor(v, T, whenMs){
    return VIDEOS.filter(function(i){ return i !== v && age(i) >= T && i.pub + T * 3600e3 <= whenMs + 1; });
  }

  // ---------- 예측 방법 ----------
  // point(v, t, T, pool): 게시 t시간 뒤까지의 기록으로 T시간 조회수를 예측한 값
  function ratios(pool, f){ var r = []; pool.forEach(function(p){ var x = f(p); if (x != null && isFinite(x) && x > 0) r.push(x); }); return r; }
  var METHODS = [
    // 예측 = V(t) × 중앙값[ Vᵢ(T) ÷ Vᵢ(t) ]
    { key: 'm1', no: '①', b: '1', name: '초기 속도 배수법', tab: '초기 속도', color: '#ecd25b',
      short: '지금 조회수가 과거 영상들처럼 늘어난다고 보고 예측합니다.',
      desc: '과거 영상들이 같은 시점 이후 몇 배로 늘었는지 보고, 지금 조회수에 그만큼 곱합니다.',
      uses: ['시간별 조회수', '과거 영상'],
      pro: '가장 단순하고 안정적', con: '초반이 유난히 빠르거나 느린 영상은 놓칠 수 있음',
      point: function(v, t, T, pool){
        var x = at(v, t, 1), r = ratios(pool, function(p){ var a = at(p, t, 1); return a > 0 ? at(p, T, 1) / a : null; });
        return x > 0 && r.length ? x * q(r, 0.5) : null;
      } },
    // 좋아요 환산 = L(t) × 중앙값[ Vᵢ(T) ÷ Lᵢ(t) ], 댓글 환산 = C(t) × 중앙값[ Vᵢ(T) ÷ Cᵢ(t) ]
    // 예측 = 좋아요 환산^⅔ × 댓글 환산^⅓
    { key: 'm2', no: '②', b: '2', name: '참여도 환산법', tab: '참여도', color: '#47d19a',
      short: '좋아요·댓글 반응으로 앞으로의 조회수를 가늠합니다.',
      desc: '과거 영상에서 좋아요·댓글 1개가 결국 조회수 몇 회로 이어졌는지 보고, 지금의 좋아요·댓글 수로 환산합니다.',
      uses: ['좋아요', '댓글', '과거 영상'],
      pro: '반응이 뜨거운 영상을 더 높게 봄', con: '좋아요·댓글이 적은 극초반엔 흔들림',
      point: function(v, t, T, pool){
        var l = at(v, t, 2), c = at(v, t, 3);
        var rl = ratios(pool, function(p){ var a = at(p, t, 2); return a > 0 ? at(p, T, 1) / a : null; });
        var rc = ratios(pool, function(p){ var a = at(p, t, 3); return a > 0 ? at(p, T, 1) / a : null; });
        if (!(l > 0) || !rl.length) return null;
        var byL = l * q(rl, 0.5);
        if (!(c > 0) || !rc.length) return byL;                       // 댓글이 아직 없으면 좋아요만
        return Math.pow(byL, 2 / 3) * Math.pow(c * q(rc, 0.5), 1 / 3);
      } },
    // b = [ V(t) − V(t/2) ] ÷ ln[ (1+t) ÷ (1+t/2) ], 예측 = V(t) + b × ln[ (1+T) ÷ (1+t) ]
    { key: 'm3', no: '③', b: '3', name: '추세 곡선 외삽법', tab: '추세 곡선', color: '#a080d0',
      short: '이 영상의 최근 증가 속도를 그대로 이어 갑니다.',
      desc: '다른 영상과 비교하지 않고, 이 영상이 최근 늘어난 속도가 점점 느려지며 이어진다고 보고 연장합니다.',
      uses: ['1시간 단위 추이', '1주일 추이'],
      pro: '과거 영상이 적어도 쓸 수 있음', con: '초반에 몰렸다 식는 영상은 높게 봄',
      point: function(v, t, T){
        var a = at(v, t, 1), h = at(v, t / 2, 1);
        if (!(a > 0) || h == null || t < 1) return null;
        var b = (a - h) / Math.log((1 + t) / (1 + t / 2));
        return Math.max(a, a + b * Math.log((1 + T) / (1 + t)));
      } }
  ];
  var ALL = { key: 'mix', no: '★', b: '★', name: '세 방법 종합', tab: '종합', color: '#e96387',
    short: '세 방법 예측의 가운데 값입니다. 한 방법이 크게 빗나가도 영향을 덜 받습니다.' };

  // 과거 영상을 하나씩 빼 놓고 나머지로 예측해 본다. 결과: 실제 ÷ 예측 비율 목록
  function backtest(m, t, T, pool){
    var out = [];
    pool.forEach(function(j){
      var p = m.point(j, t, T, pool.filter(function(x){ return x !== j; })), a = at(j, T, 1);
      if (p > 0 && a > 0) out.push(a / p);
    });
    return out;
  }
  // 예측값 + 오차 범위(과거 영상에서 본 실제 ÷ 예측 비율의 10~90% 구간을 곱한다 → 10번 중 8번은 들어오는 범위)
  function predictAll(v, t, T, pool){
    var out = METHODS.map(function(m){
      var p = m.point(v, t, T, pool);
      if (!(p > 0)) return null;
      var e = backtest(m, t, T, pool);
      return { p: p, lo: e.length >= 4 ? p * q(e, 0.1) : null, hi: e.length >= 4 ? p * q(e, 0.9) : null,
        mape: e.length ? mean(e.map(function(x){ return Math.abs(1 / x - 1); })) : null, n: e.length };
    });
    var ok = out.filter(Boolean);
    out.push(ok.length ? {
      p: q(ok.map(function(r){ return r.p; }), 0.5),
      lo: ok.every(function(r){ return r.lo != null; }) ? q(ok.map(function(r){ return r.lo; }), 0.5) : null,
      hi: ok.every(function(r){ return r.hi != null; }) ? q(ok.map(function(r){ return r.hi; }), 0.5) : null
    } : null);
    return out;                                                // [①, ②, ③, 종합]
  }

  // ---------- 트래킹: 정해진 시점(c)에 한 예측을 실제 T 조회수와 비교 ----------
  // 그 시점까지 있던 기록만 쓴다(그 뒤에 목표에 도달한 영상은 과거 영상으로 쓰지 않는다)
  var TRACK = {};
  function track(ti){
    if (TRACK[ti]) return TRACK[ti];
    var tg = TARGETS[ti], rows = [];
    VIDEOS.forEach(function(v){
      if (age(v) < tg.c) return;
      var pool = poolFor(v, tg.T, v.pub + tg.c * 3600e3);
      if (pool.length < MINPOOL) return;
      var pr = predictAll(v, tg.c, tg.T, pool), done = age(v) >= tg.T, act = done ? at(v, tg.T, 1) : null;
      rows.push({ v: v, pr: pr, done: done, act: act, pool: pool.length,
        res: pr.map(function(r){
          if (!r || !done) return null;
          return { err: (r.p - act) / act, hit: r.lo != null && act >= r.lo && act <= r.hi };
        }) });
    });
    rows.sort(function(a, b){ return b.v.pub - a.v.pub; });
    var sum = [0, 1, 2, 3].map(function(k){
      var d = rows.filter(function(r){ return r.res[k]; });
      return { n: d.length, hit: d.length ? d.filter(function(r){ return r.res[k].hit; }).length / d.length : null,
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
      var last = [0, 0, 0];
      var snaps = hrs.map(function(t){
        var vv = Math.max(last[0], V(t) * (1 + gauss() * 0.01)),
            ll = Math.max(last[1], vv * rl * (1 + 0.4 * Math.exp(-t / 12)) * (1 + gauss() * 0.02)),
            cc = Math.max(last[2], vv * rc * (1 + Math.exp(-t / 8)) * (1 + gauss() * 0.03));
        last = [vv, ll, cc];
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
  var prevShow = window.SG.onShow;
  window.SG.onShow = function(tab){ prevShow(tab); if (tab === 'views') show(); };

  var ALLM = METHODS.concat([ALL]);                    // 0~2 방법, 3 종합
  var ORDER = [3, 0, 1, 2];                            // 화면에 보이는 순서: 종합 먼저
  var sel = null, mi = 3, si = 1, loading = false;     // 고른 영상, 고른 방법(기본 종합), 성적표 목표(기본 7일)
  var PRED = {};                                       // 영상·목표별 예측 (한 번 계산하면 재사용)

  function show(){
    if (DATA){ render(); return; }
    if (loading) return;
    loading = true;
    el.innerHTML = head() + '<p class="gnote">기록을 불러오는 중…</p>';
    fetch('data/views.json', { cache: 'no-store' })
      .then(function(r){ if (!r.ok) throw 0; return r.json(); })
      .then(function(d){ if (!d || !d.videos || !d.videos.length) throw 0; return d; })
      .catch(function(){ return demo(); })
      .then(function(d){
        DATA = d;
        VIDEOS = d.videos.map(function(v, n){
          return { id: v.id, title: v.title, thumb: v.thumb || '', pub: Date.parse(v.published), hue: (n * 47) % 360,
            snaps: v.snaps.slice().sort(function(a, b){ return a[0] - b[0]; }) };
        }).filter(function(v){ return v.snaps.length; }).sort(function(a, b){ return b.pub - a.pub; });
        sel = VIDEOS[0] || null;
        render();
      });
  }
  function head(){
    return '<div class="sec"><div class="sec-t"><svg viewBox="0 0 24 24"><use href="#i-toy"/></svg>장난감<span class="cr">›</span><span class="lt">조회수 예측기</span></div></div>'
      + '<p class="sec-d">영상의 조회수·좋아요·댓글 흐름으로 24시간·7일·30일 조회수를 예측합니다. 세 가지 방법과 그 종합을 볼 수 있고, 지난 예측이 얼마나 맞았는지도 확인할 수 있습니다.</p>';
  }
  function status(v){
    var a = age(v);
    for (var k = 0; k < TARGETS.length; k++) if (a < TARGETS[k].T) return { t: TARGETS[k].name + ' 예측 중', live: true };
    return { t: '30일 지남', live: false };
  }
  // 썸네일: 수집한 주소 → 유튜브 기본 썸네일 → (예시 데이터) 색 카드
  function thumb(v){
    var src = v.thumb || (DATA.demo ? '' : 'https://i.ytimg.com/vi/' + encodeURIComponent(v.id) + '/mqdefault.jpg');
    return src ? '<img src="' + esc(src) + '" alt="" loading="lazy">'
      : '<span class="vt-ph" style="--h:' + v.hue + '"><em>' + esc(v.title) + '</em></span>';
  }
  var PLAY = '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M8 5.5v13l10.5-6.5z" fill="currentColor"/></svg>';

  // 영상 v 의 목표 k 예측. 목표가 지났으면 그 목표의 예측 시점(c)에 했던 예측과 실제
  function hz(v, k){
    var key = v.id + '|' + k;
    if (PRED[key]) return PRED[key];
    var tg = TARGETS[k], a = age(v), done = a >= tg.T, t = done ? tg.c : a;
    var o = { tg: tg, done: done, t: t, act: done ? at(v, tg.T, 1) : null };
    if (t < 1) o.err = '게시 1시간 뒤부터 예측합니다';
    else {
      var pool = poolFor(v, tg.T, v.pub + t * 3600e3);
      if (pool.length < MINPOOL) o.err = tg.name + '이 지난 과거 영상이 ' + MINPOOL + '개 이상 필요합니다 (지금 ' + pool.length + '개)';
      else o.pr = predictAll(v, t, tg.T, pool);
    }
    return (PRED[key] = o);
  }

  function render(){
    if (!sel){ el.innerHTML = head() + '<p class="anote">기록된 영상이 없습니다.</p>'; return; }
    var nSnap = VIDEOS.reduce(function(s, v){ return s + v.snaps.length; }, 0), title = DATA.channel && DATA.channel.title;
    el.innerHTML = head()
      + '<div class="vp-ch"><div class="vp-ava" aria-hidden="true">' + PLAY + '</div>'
      + '<div class="vp-cht"><b>' + esc(title || CHANNEL.handle) + '</b>'
      + '<small>' + (title ? esc(CHANNEL.handle) + ' · ' : '') + '영상 ' + VIDEOS.length + '개 · 기록 ' + full(nSnap) + '개 · 마지막 수집 ' + when(Date.parse(DATA.updated)) + '</small></div>'
      + (DATA.demo ? '<span class="vp-dpill">예시 데이터</span>' : '')
      + '<a class="gs vp-yt" href="' + CHANNEL.url + '" target="_blank" rel="noopener">채널 ↗</a></div>'
      + (DATA.demo ? '<p class="vp-demo">지금 보이는 영상과 수치는 화면 구성을 보여 주려고 만든 예시이며 실제 채널 수치가 아닙니다. 1시간마다 실제 수치를 모으는 수집기를 연결하면 자동으로 바뀝니다.</p>' : '')
      + '<div class="vc-wrap at-start"><button type="button" class="vc-nav prev" data-nav="-1" aria-label="이전 영상들">‹</button>'
      + '<div class="vc-row" id="vc-row">' + VIDEOS.map(card).join('') + '</div>'
      + '<button type="button" class="vc-nav next" data-nav="1" aria-label="다음 영상들">›</button></div>'
      + '<div class="vd" id="vd"></div>'
      + '<h3 class="ahead">예측 방법</h3><div class="vm-list" id="vm-list"></div>'
      + '<h3 class="ahead">예측 성적표</h3><div class="vs" id="vs"></div>';
    var row = $('vc-row');
    row.addEventListener('scroll', navState, { passive: true });
    navState();
    renderVideo(); renderMethods(); renderScore();
  }
  function card(v){
    var s = status(v), a = age(v);
    return '<button type="button" class="vc' + (v === sel ? ' on' : '') + '" data-vid="' + esc(v.id) + '" aria-pressed="' + (v === sel) + '">'
      + '<span class="vc-th">' + thumb(v) + '<span class="vc-age">' + ageTxt(a) + ' 전</span>'
      + (s.live ? '<span class="vc-live">' + s.t + '</span>' : '') + '</span>'
      + '<span class="vc-t">' + esc(v.title) + '</span>'
      + '<span class="vc-m">조회수 ' + fmt(at(v, a, 1)) + ' · 좋아요 ' + fmt(at(v, a, 2)) + '</span></button>';
  }
  function navState(){
    var row = $('vc-row'), w = row && row.parentNode; if (!w) return;
    w.classList.toggle('at-start', row.scrollLeft < 4);
    w.classList.toggle('at-end', row.scrollLeft + row.clientWidth > row.scrollWidth - 4);
  }

  // ----- 고른 영상: 썸네일 · 지금 현황 · 예측 현황 · 그래프 -----
  function renderVideo(){
    var v = sel, a = age(v), V = at(v, a, 1), L = at(v, a, 2), C = at(v, a, 3), dh = a >= 2 ? V - at(v, a - 1, 1) : V, s = status(v);
    var link = DATA.demo ? '' : 'https://www.youtube.com/watch?v=' + encodeURIComponent(v.id);
    $('vd').innerHTML = '<div class="vd-top">'
      + (link ? '<a class="vd-th" href="' + link + '" target="_blank" rel="noopener" aria-label="YouTube에서 보기">' : '<div class="vd-th">')
      + thumb(v) + '<span class="vd-play">' + PLAY + '</span>' + (link ? '</a>' : '</div>')
      + '<div class="vd-info"><span class="vp-st' + (s.live ? ' live' : '') + '">' + s.t + '</span>'
      + '<h3>' + esc(v.title) + '</h3><small class="vd-when">게시 ' + when(v.pub) + ' · ' + ageTxt(a) + ' 전</small>'
      + '<div class="vd-stats">'
      + stat('조회수', fmt(V), full(V) + '회')
      + stat('좋아요', fmt(L), '조회수의 ' + pct(L / V, 1))
      + stat('댓글', fmt(C), '조회수의 ' + pct(C / V, 2))
      + stat('최근 1시간', '+' + fmt(dh), a >= 2 ? '시간당 증가' : '게시 직후')
      + '</div></div></div>'
      + '<div class="vd-pred" id="vd-pred"><div class="vd-ph"><h4>예측 현황</h4><div class="vd-mt" role="tablist" aria-label="예측 방법">'
      + ORDER.map(function(k){ var m = ALLM[k];
          return '<button type="button" role="tab" data-mi="' + k + '" class="' + (k === mi ? 'on' : '') + '" aria-selected="' + (k === mi) + '" style="--mc:' + m.color + '"><i>' + m.b + '</i>' + m.tab + '</button>';
        }).join('') + '</div></div>'
      + '<p class="vd-md" id="vd-md"></p><div class="vd-hs" id="vd-hs"></div></div>'
      + '<div class="vd-chart" id="vd-chart"></div>';
    renderPred();
  }
  function stat(k, v, s){ return '<div class="vd-s"><span>' + k + '</span><b>' + v + '</b><small>' + s + '</small></div>'; }

  function renderPred(){
    var v = sel, m = ALLM[mi];
    Array.prototype.forEach.call(el.querySelectorAll('.vd-mt [data-mi]'), function(b){
      var on = +b.getAttribute('data-mi') === mi; b.classList.toggle('on', on); b.setAttribute('aria-selected', String(on));
    });
    var acc = TARGETS.map(function(tg, k){ var s = track(k).sum[mi]; return s.n ? tg.name + ' ' + pct(s.hit) : null; }).filter(Boolean);
    $('vd-md').innerHTML = '<i style="background:' + m.color + '"></i><span>' + m.short + '</span>'
      + (acc.length ? '<em>지난 예측 범위 적중률 · ' + acc.join(' · ') + '</em>' : '');
    $('vd-hs').innerHTML = TARGETS.map(function(tg, k){ return hzCard(v, k); }).join('');
    chart();
  }
  function hzCard(v, k){
    var o = hz(v, k), m = ALLM[mi], tg = o.tg, r = o.pr ? o.pr[mi] : null, a = age(v), V = at(v, a, 1);
    var top = function(tag, cls){ return '<div class="vh-h"><b>' + tg.name + (o.done ? '' : ' 뒤') + '</b><span class="vh-tag ' + (cls || '') + '">' + tag + '</span></div>'; };
    if (o.done){
      var res = r ? { err: (r.p - o.act) / o.act, hit: r.lo != null && o.act >= r.lo && o.act <= r.hi } : null;
      return '<div class="vh done' + (res ? (res.hit ? ' hit' : ' miss') : '') + '" style="--mc:' + m.color + '">'
        + top(res ? (res.hit ? '예측 적중' : '범위 밖') : '지남', res ? (res.hit ? 'hit' : 'miss') : '')
        + '<div class="vh-v">' + fmt(o.act) + '<small>실제</small></div>'
        + (r ? '<div class="vh-r">게시 ' + tg.from + ' 뒤 예측 <b>' + fmt(r.p) + '</b>' + (r.lo != null ? ' <small>(' + fmt(r.lo) + '~' + fmt(r.hi) + ')</small>' : '') + '</div>'
             + '<small class="vh-n">' + (Math.abs(res.err) < 0.005 ? '실제와 거의 같게 예측했습니다' : '예측이 실제보다 ' + Math.round(Math.abs(res.err) * 100) + '% ' + (res.err > 0 ? '높았습니다' : '낮았습니다')) + '</small>'
           : '<small class="vh-n">' + (o.err || '이 방법으로는 예측하지 못했습니다') + '</small>')
        + '</div>';
    }
    if (!r) return '<div class="vh na">' + top('예측 불가') + '<small class="vh-n">' + (o.err || '이 방법으로는 예측하지 못했습니다') + '</small></div>';
    return '<div class="vh" style="--mc:' + m.color + '">' + top(ageTxt(tg.T - a) + ' 남음', 'live')
      + '<div class="vh-v">' + fmt(r.p) + '<small>예측</small></div>'
      + '<div class="vh-r">' + (r.lo != null ? fmt(r.lo) + ' ~ ' + fmt(r.hi) + ' <small>80% 범위</small>' : '<small>범위를 낼 과거 영상이 부족합니다</small>') + '</div>'
      + '<div class="vh-bar" title="지금 조회수 ÷ 예측"><i style="width:' + Math.min(100, V / r.p * 100).toFixed(1) + '%"></i></div>'
      + '<small class="vh-n">지금 ' + fmt(V) + ' → 약 ' + (r.p / V).toFixed(1) + '배</small></div>';
  }

  // ----- 그래프: 실제 추이 + 예측 부채꼴(80% 범위) + 지난 목표의 실제와 그때 한 예측. 마우스를 올리면 값 -----
  function niceStep(x){ var p = Math.pow(10, Math.floor(Math.log(x) / Math.LN10)), f = x / p; return (f <= 1 ? 1 : f <= 2 ? 2 : f <= 2.5 ? 2.5 : f <= 5 ? 5 : 10) * p; }
  function chart(){
    var v = sel, m = ALLM[mi], a = age(v), box = $('vd-chart');
    var W = Math.max(320, Math.min(860, (box.clientWidth || 760) - 28)), H = 300, L = 54, R = 22, Tp = 34, B = 34;
    var xmax = Math.max(720, a * 1.04);
    function X(h){ return L + Math.sqrt(Math.max(0, h) / xmax) * (W - L - R); }
    function Hx(x){ var f = Math.max(0, Math.min(1, (x - L) / (W - L - R))); return f * f * xmax; }
    var V0 = at(v, a, 1), knots = [{ h: a, p: V0, lo: V0, hi: V0 }], past = [];
    TARGETS.forEach(function(tg, k){
      var o = hz(v, k), r = o.pr ? o.pr[mi] : null;
      if (o.done) past.push({ h: tg.T, act: o.act, r: r, tg: tg });
      else if (r) knots.push({ h: tg.T, p: r.p, lo: r.lo != null ? r.lo : r.p, hi: r.hi != null ? r.hi : r.p, tg: tg });
    });
    var ymax = 1;
    v.snaps.forEach(function(s){ ymax = Math.max(ymax, s[1]); });
    knots.forEach(function(k){ ymax = Math.max(ymax, k.hi); });
    past.forEach(function(p){ ymax = Math.max(ymax, p.act, p.r ? (p.r.hi || p.r.p) : 0); });
    var st = niceStep(ymax * 1.08 / 4), top = Math.ceil(ymax * 1.08 / st) * st;
    function Y(y){ return Tp + (1 - y / top) * (H - Tp - B); }
    var s = '<svg viewBox="0 0 ' + W + ' ' + H + '" role="img" aria-label="조회수 추이와 예측">'
      + '<defs><linearGradient id="vg-a" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#e96387" stop-opacity=".38"/><stop offset="1" stop-color="#e96387" stop-opacity="0"/></linearGradient>'
      + '<linearGradient id="vg-f" x1="0" y1="0" x2="1" y2="0"><stop offset="0" stop-color="' + m.color + '" stop-opacity=".08"/><stop offset="1" stop-color="' + m.color + '" stop-opacity=".3"/></linearGradient></defs>';
    for (var y = 0; y <= top + 1e-9; y += st)
      s += '<line x1="' + L + '" x2="' + (W - R) + '" y1="' + Y(y).toFixed(1) + '" y2="' + Y(y).toFixed(1) + '" stroke="rgba(255,255,255,' + (y ? .07 : .18) + ')"/>'
        + '<text x="' + (L - 8) + '" y="' + (Y(y) + 4).toFixed(1) + '" text-anchor="end" font-size="11" fill="#8e8e93">' + fmt(y) + '</text>';
    var lastX = -99;
    [1, 6, 24, 72, 168, 336, 720, 1440, 2160, 2880].forEach(function(h){
      if (h > xmax || X(h) - lastX < 42) return; lastX = X(h);
      s += '<text x="' + X(h).toFixed(1) + '" y="' + (H - B + 19) + '" text-anchor="middle" font-size="11" fill="#8e8e93">' + hLab(h) + '</text>';
    });
    // 목표 시점 세로선
    TARGETS.forEach(function(tg){
      s += '<line x1="' + X(tg.T).toFixed(1) + '" x2="' + X(tg.T).toFixed(1) + '" y1="' + (Tp - 6) + '" y2="' + (H - B) + '" stroke="rgba(255,255,255,.14)" stroke-dasharray="3 5"/>'
        + '<text x="' + X(tg.T).toFixed(1) + '" y="' + (Tp - 12) + '" text-anchor="middle" font-size="11" font-weight="700" fill="#aeaeb2">' + tg.name + '</text>';
    });
    // 실제 추이 (면 + 선)
    var pts = v.snaps.filter(function(p){ return p[0] <= xmax; }), line = 'M' + X(0).toFixed(1) + ' ' + Y(0).toFixed(1);
    pts.forEach(function(p){ line += ' L' + X(p[0]).toFixed(1) + ' ' + Y(p[1]).toFixed(1); });
    s += '<path d="' + line + ' L' + X(pts[pts.length - 1][0]).toFixed(1) + ' ' + Y(0).toFixed(1) + ' Z" fill="url(#vg-a)"/>'
      + '<path d="' + line + '" fill="none" stroke="#e96387" stroke-width="2.6" stroke-linejoin="round" stroke-linecap="round"/>';
    // 예측 부채꼴
    if (knots.length > 1){
      var up = '', dn = '', md = '';
      knots.forEach(function(k, i){ up += (i ? ' L' : 'M') + X(k.h).toFixed(1) + ' ' + Y(k.hi).toFixed(1); md += (i ? ' L' : 'M') + X(k.h).toFixed(1) + ' ' + Y(k.p).toFixed(1); });
      knots.slice().reverse().forEach(function(k){ dn += ' L' + X(k.h).toFixed(1) + ' ' + Y(k.lo).toFixed(1); });
      s += '<path d="' + up + dn + ' Z" fill="url(#vg-f)" stroke="' + m.color + '" stroke-opacity=".35" stroke-width="1"/>'
        + '<path d="' + md + '" fill="none" stroke="' + m.color + '" stroke-width="2.4" stroke-dasharray="7 5" stroke-linecap="round"/>';
      knots.slice(1).forEach(function(k){
        var right = X(k.h) > W - 90;
        s += '<circle cx="' + X(k.h).toFixed(1) + '" cy="' + Y(k.p).toFixed(1) + '" r="5" fill="' + m.color + '" stroke="#1c1c1e" stroke-width="2"/>'
          + '<text x="' + (X(k.h) + (right ? -9 : 9)).toFixed(1) + '" y="' + (Y(k.p) - 9).toFixed(1) + '" text-anchor="' + (right ? 'end' : 'start') + '" font-size="12" font-weight="700" fill="' + m.color + '">' + fmt(k.p) + '</text>';
      });
    }
    // 지난 목표: 실제(흰 점)와 그때 한 예측(고리 + 범위)
    past.forEach(function(p){
      var x = X(p.h);
      if (p.r){
        if (p.r.lo != null) s += '<line x1="' + (x + 8).toFixed(1) + '" x2="' + (x + 8).toFixed(1) + '" y1="' + Y(p.r.hi).toFixed(1) + '" y2="' + Y(p.r.lo).toFixed(1) + '" stroke="' + m.color + '" stroke-width="3" stroke-linecap="round" opacity=".55"/>';
        s += '<circle cx="' + (x + 8).toFixed(1) + '" cy="' + Y(p.r.p).toFixed(1) + '" r="4.5" fill="#1c1c1e" stroke="' + m.color + '" stroke-width="2.2"/>';
      }
      s += '<circle cx="' + x.toFixed(1) + '" cy="' + Y(p.act).toFixed(1) + '" r="5" fill="#fff" stroke="#e96387" stroke-width="2.2"/>';
    });
    // 지금
    s += '<line x1="' + X(a).toFixed(1) + '" x2="' + X(a).toFixed(1) + '" y1="' + Tp + '" y2="' + (H - B) + '" stroke="#e96387" stroke-opacity=".5" stroke-dasharray="2 4"/>'
      + '<circle cx="' + X(a).toFixed(1) + '" cy="' + Y(V0).toFixed(1) + '" r="5.5" fill="#e96387" stroke="#1c1c1e" stroke-width="2"/>'
      + '<rect x="' + (X(a) - 20).toFixed(1) + '" y="' + (H - B - 22) + '" width="40" height="17" rx="8.5" fill="#e96387"/>'
      + '<text x="' + X(a).toFixed(1) + '" y="' + (H - B - 9.5) + '" text-anchor="middle" font-size="10.5" font-weight="700" fill="#fff">지금</text>';
    // 마우스 따라가는 선과 점
    s += '<line id="vd-cx" y1="' + Tp + '" y2="' + (H - B) + '" stroke="rgba(255,255,255,.45)" stroke-width="1" style="display:none"/>'
      + '<circle id="vd-cd" r="5" stroke="#1c1c1e" stroke-width="2" style="display:none"/></svg>';
    box.innerHTML = '<div class="vd-ch"><h4>조회수 추이와 예측</h4><span>' + m.tab + ' 기준 · 가로축은 게시 후 시간 (초반을 넓게 보는 눈금)</span></div>'
      + s + '<div class="vd-tip" id="vd-tip" hidden></div>'
      + '<div class="vd-key"><span><i class="k-a"></i>실제 조회수</span><span style="--mc:' + m.color + '"><i class="k-p"></i>예측</span>'
      + '<span style="--mc:' + m.color + '"><i class="k-r"></i>80% 범위</span>'
      + (past.length ? '<span><i class="k-d"></i>지난 목표의 실제</span><span style="--mc:' + m.color + '"><i class="k-o"></i>그때 한 예측</span>' : '') + '</div>';
    // 값 읽기: 지금까지는 실제, 그 뒤는 부채꼴 매듭 사이를 가로 위치 기준으로 잇는다
    function valAt(h){
      if (h <= a) return { act: at(v, h, 1) };
      for (var i = 1; i < knots.length; i++) if (h <= knots[i].h || i === knots.length - 1){
        var k0 = knots[i - 1], k1 = knots[i], f = Math.max(0, Math.min(1, (X(h) - X(k0.h)) / (X(k1.h) - X(k0.h) || 1)));
        if (h > k1.h) return null;
        return { p: k0.p + (k1.p - k0.p) * f, lo: k0.lo + (k1.lo - k0.lo) * f, hi: k0.hi + (k1.hi - k0.hi) * f };
      }
      return null;
    }
    var svg = box.querySelector('svg'), tip = $('vd-tip'), cx = svg.querySelector('#vd-cx'), cd = svg.querySelector('#vd-cd');
    function hide(){ tip.hidden = true; cx.style.display = cd.style.display = 'none'; }
    function move(e){
      var rc = svg.getBoundingClientRect(), bx = box.getBoundingClientRect(), x = (e.clientX - rc.left) * W / rc.width;
      if (x < L - 4 || x > W - R + 4){ hide(); return; }
      var h = Hx(x), val = valAt(h);
      if (!val){ hide(); return; }
      var yv = val.act != null ? val.act : val.p, sx = X(h), sy = Y(yv);
      cx.setAttribute('x1', sx); cx.setAttribute('x2', sx); cx.style.display = '';
      cd.setAttribute('cx', sx); cd.setAttribute('cy', sy); cd.setAttribute('fill', val.act != null ? '#e96387' : m.color); cd.style.display = '';
      tip.innerHTML = '<b>게시 후 ' + ageTxt(h) + '</b>' + (val.act != null
        ? '<span>실제 조회수 <em>' + full(val.act) + '</em></span>'
        : '<span>' + m.tab + ' 예측 <em style="color:' + m.color + '">' + fmt(val.p) + '</em></span><small>80% 범위 ' + fmt(val.lo) + ' ~ ' + fmt(val.hi) + '</small>');
      tip.hidden = false;
      var px = rc.left - bx.left + sx * rc.width / W, py = rc.top - bx.top + sy * rc.height / H;
      var tw = tip.offsetWidth, left = px + 14 + tw > bx.width ? px - 14 - tw : px + 14;
      tip.style.left = Math.max(4, left) + 'px'; tip.style.top = Math.max(4, py - tip.offsetHeight - 10) + 'px';
    }
    svg.addEventListener('pointermove', move);
    svg.addEventListener('pointerdown', move);
    svg.addEventListener('pointerleave', hide);
  }

  // ----- 예측 방법: 공식 없이 쉬운 설명 -----
  function renderMethods(){
    $('vm-list').innerHTML = METHODS.map(function(m, k){
      var s = track(1).sum[k];
      return '<button type="button" class="vm" data-mi="' + k + '" style="--mc:' + m.color + '">'
        + '<span class="vm-h"><span class="vp-no">' + m.b + '</span><b>' + m.name + '</b></span>'
        + '<span class="vm-d">' + m.desc + '</span>'
        + '<span class="vp-tags">' + m.uses.map(function(u){ return '<span>' + u + '</span>'; }).join('') + '</span>'
        + '<span class="vm-pc"><span class="p">' + m.pro + '</span><span class="c">' + m.con + '</span></span>'
        + '<span class="vm-acc">' + (s.n ? '7일 예측 <b>적중 ' + pct(s.hit) + '</b> · <b>오차 ' + pct(s.mape) + '</b>' : '7일 예측 기록 없음') + '<em>이 방법으로 보기 →</em></span>'
        + '</button>';
    }).join('');
  }

  // ----- 예측 성적표 -----
  function renderScore(){
    var tg = TARGETS[si], tr = track(si), best = -1, bm = Infinity;
    tr.sum.forEach(function(s, k){ if (k < 3 && s.n && s.mape < bm){ bm = s.mape; best = k; } });
    var h = '<div class="vs-top"><p>게시 <b>' + tg.from + '</b> 뒤에 한 <b>' + tg.name + '</b> 조회수 예측이 실제와 얼마나 맞았는지 봅니다.</p>'
      + '<div class="seg vs-seg" role="tablist" aria-label="성적표 목표">' + TARGETS.map(function(x, k){
          return '<button type="button" role="tab" data-si="' + k + '" class="' + (k === si ? 'on' : '') + '" aria-selected="' + (k === si) + '">' + x.from + ' → ' + x.name + '</button>';
        }).join('') + '</div></div>'
      + '<div class="vs-cards">' + ORDER.map(function(k){
          var s = tr.sum[k], m = ALLM[k];
          return '<div class="vs-c' + (k === best ? ' best' : '') + '" style="--mc:' + m.color + '">'
            + '<div class="vs-ch"><span class="vp-no">' + m.b + '</span>' + m.tab + (k === best ? '<em>가장 정확</em>' : '') + '</div>'
            + '<div class="vs-row"><span>범위 적중률</span><b>' + (s.n ? pct(s.hit) : '—') + '</b></div>'
            + '<div class="vs-bar"><i style="width:' + (s.n ? s.hit * 100 : 0).toFixed(0) + '%"></i></div>'
            + '<div class="vs-row"><span>평균 오차</span><b>' + (s.n ? pct(s.mape) : '—') + '</b></div>'
            + '<div class="vs-bar err"><i style="width:' + (s.n ? Math.min(100, s.mape / 0.3 * 100) : 0).toFixed(0) + '%"></i></div>'
            + '<small>' + (s.n ? s.n + '개 영상에서 확인' : '아직 결과가 없습니다') + '</small></div>';
        }).join('') + '</div>';
    if (!tr.rows.length){ $('vs').innerHTML = h + '<p class="anote">아직 비교할 예측이 없습니다.</p>'; return; }
    h += '<div class="atab-w"><table class="atab vs-tab"><thead><tr><th>영상</th><th>실제 ' + tg.name + '</th>'
      + ORDER.map(function(k){ return '<th><span class="vp-no" style="--mc:' + ALLM[k].color + '">' + ALLM[k].b + '</span> ' + ALLM[k].tab + '</th>'; }).join('')
      + '</tr></thead><tbody>'
      + tr.rows.slice(0, 15).map(function(r){
          return '<tr' + (r.v === sel ? ' class="on"' : '') + '><td><button type="button" class="vs-v" data-vid="' + esc(r.v.id) + '"><span class="vs-th">' + thumb(r.v) + '</span>' + esc(r.v.title) + '</button></td>'
            + '<td>' + (r.done ? '<b>' + fmt(r.act) + '</b>' : '<span class="vs-wait">' + ageTxt(tg.T - age(r.v)) + ' 뒤</span>') + '</td>'
            + ORDER.map(function(k){
                var p = r.pr[k], x = r.res[k];
                if (!p) return '<td>—</td>';
                return '<td>' + fmt(p.p) + (x ? '<span class="vp-e ' + (x.hit ? 'hit' : 'miss') + '">' + signPct(x.err) + (x.hit ? ' ✓' : ' ✗') + '</span>' : '') + '</td>';
              }).join('') + '</tr>';
        }).join('') + '</tbody></table></div>'
      + '<p class="gnote">✓ 는 실제 조회수가 80% 범위 안에 들어온 경우입니다. 예측은 그 시점까지 있던 기록만으로 계산했습니다. '
      + '범위는 과거 영상에 같은 방법을 적용해 본 결과로, 10번 중 8번은 실제가 들어오도록 잡은 폭입니다.</p>';
    $('vs').innerHTML = h;
  }

  function pick(v, scroll){
    sel = v;
    Array.prototype.forEach.call(el.querySelectorAll('.vc'), function(b){
      var on = b.getAttribute('data-vid') === v.id; b.classList.toggle('on', on); b.setAttribute('aria-pressed', String(on));
      if (on && scroll) b.scrollIntoView({ block: 'nearest', inline: 'center', behavior: 'smooth' });
    });
    renderVideo(); renderScore();
  }
  el.addEventListener('click', function(e){
    var b = e.target.closest('[data-vid]');
    if (b){
      var v = VIDEOS.filter(function(x){ return x.id === b.getAttribute('data-vid'); })[0];
      if (v){ var fromTable = !!b.closest('.vs'); pick(v, fromTable); if (fromTable) $('vd').scrollIntoView({ block: 'start', behavior: 'smooth' }); }
      return;
    }
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
})();
