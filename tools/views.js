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
    { key: 'm1', no: '①', b: '1', name: '초기 속도 배수법', color: '#ecd25b',
      idea: '지금 조회수에, 과거 영상들이 같은 시점에서 목표 시점까지 몇 배로 늘었는지(중앙값)를 곱합니다.',
      formula: '예측 = V(t) × 중앙값[ Vᵢ(T) ÷ Vᵢ(t) ]',
      uses: ['게시 후 시간별 조회수', '과거 영상'],
      pro: '가장 단순하고 안정적입니다', con: '초반이 유난히 빠르거나 느린 영상도 평균적인 배수로 늘립니다',
      point: function(v, t, T, pool){
        var x = at(v, t, 1), r = ratios(pool, function(p){ var a = at(p, t, 1); return a > 0 ? at(p, T, 1) / a : null; });
        return x > 0 && r.length ? x * q(r, 0.5) : null;
      } },
    { key: 'm2', no: '②', b: '2', name: '참여도 환산법', color: '#47d19a',
      idea: '좋아요·댓글 수를 과거 영상의 "좋아요 1개당·댓글 1개당 목표 시점 조회수"로 환산하고, 좋아요 2 : 댓글 1 비중으로 섞습니다.',
      formula: '좋아요 환산 = L(t) × 중앙값[ Vᵢ(T) ÷ Lᵢ(t) ]\n댓글 환산 = C(t) × 중앙값[ Vᵢ(T) ÷ Cᵢ(t) ]\n예측 = 좋아요 환산^⅔ × 댓글 환산^⅓',
      uses: ['좋아요', '댓글', '과거 영상'],
      pro: '반응이 뜨거운 영상을 더 높게 봅니다', con: '좋아요·댓글이 적은 극초반에는 흔들립니다',
      point: function(v, t, T, pool){
        var l = at(v, t, 2), c = at(v, t, 3);
        var rl = ratios(pool, function(p){ var a = at(p, t, 2); return a > 0 ? at(p, T, 1) / a : null; });
        var rc = ratios(pool, function(p){ var a = at(p, t, 3); return a > 0 ? at(p, T, 1) / a : null; });
        if (!(l > 0) || !rl.length) return null;
        var byL = l * q(rl, 0.5);
        if (!(c > 0) || !rc.length) return byL;                       // 댓글이 아직 없으면 좋아요만
        return Math.pow(byL, 2 / 3) * Math.pow(c * q(rc, 0.5), 1 / 3);
      } },
    { key: 'm3', no: '③', b: '3', name: '추세 곡선 외삽법', color: '#a080d0',
      idea: '이 영상의 최근 증가 속도가 "시간의 로그"에 비례해 이어진다고 보고 목표 시점까지 늘립니다. 다른 영상 없이 이 영상의 추이만 씁니다.',
      formula: 'b = [ V(t) − V(t/2) ] ÷ ln[ (1+t) ÷ (1+t/2) ]\n예측 = V(t) + b × ln[ (1+T) ÷ (1+t) ]',
      uses: ['게시 후 1시간 단위 추이', '1주일 추이'],
      pro: '과거 영상이 적어도 쓸 수 있습니다', con: '초반에 몰렸다 식는 영상은 높게 봅니다',
      point: function(v, t, T){
        var a = at(v, t, 1), h = at(v, t / 2, 1);
        if (!(a > 0) || h == null || t < 1) return null;
        var b = (a - h) / Math.log((1 + t) / (1 + t / 2));
        return Math.max(a, a + b * Math.log((1 + T) / (1 + t)));
      } }
  ];
  var ALL = { key: 'mix', no: '★', b: '★', name: '세 방법 종합', color: '#e96387' };

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

  var sel = null, ti = null, loading = false;
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
        VIDEOS = d.videos.map(function(v){ return { id: v.id, title: v.title, pub: Date.parse(v.published), snaps: v.snaps.slice().sort(function(a, b){ return a[0] - b[0]; }) }; })
          .filter(function(v){ return v.snaps.length; }).sort(function(a, b){ return b.pub - a.pub; });
        sel = VIDEOS[0] || null;
        render();
      });
  }
  function head(){
    return '<div class="sec"><div class="sec-t"><svg viewBox="0 0 24 24"><use href="#i-toy"/></svg>장난감<span class="cr">›</span><span class="lt">조회수 예측기</span></div></div>'
      + '<p class="sec-d">채널 영상의 조회수·좋아요·댓글 흐름으로 앞으로의 조회수를 예측합니다. 세 가지 간단한 공식으로 예측하고, 과거 영상에 같은 공식을 적용해 본 결과로 오차 범위와 적중률을 함께 보여 줍니다.</p>';
  }
  // 영상마다 지금 볼 목표: 아직 도달하지 않은 가장 가까운 목표 (다 지났으면 30일)
  function autoTarget(v){ var a = age(v); for (var k = 0; k < TARGETS.length; k++) if (a < TARGETS[k].T) return k; return TARGETS.length - 1; }
  function status(v){
    var a = age(v);
    for (var k = 0; k < TARGETS.length; k++) if (a < TARGETS[k].T) return { t: TARGETS[k].name + ' 예측 중', live: true };
    return { t: '30일 지남', live: false };
  }

  function render(){
    if (!sel){ el.innerHTML = head() + '<p class="gnote">기록된 영상이 없습니다.</p>'; return; }
    if (ti == null) ti = autoTarget(sel);
    var nSnap = VIDEOS.reduce(function(s, v){ return s + v.snaps.length; }, 0);
    var h = head()
      + '<div class="vp-ch"><div class="vp-ava" aria-hidden="true"><svg viewBox="0 0 24 24"><use href="#i-yt"/></svg></div>'
      + '<div class="vp-cht"><b>' + esc((DATA.channel && DATA.channel.title) || CHANNEL.handle) + '</b>'
      + '<small>' + (DATA.channel && DATA.channel.title ? esc(CHANNEL.handle) + ' · ' : '') + '영상 ' + VIDEOS.length + '개 · 기록 ' + full(nSnap) + '개 · 마지막 수집 ' + when(Date.parse(DATA.updated)) + '</small></div>'
      + '<a class="gs vp-yt" href="' + CHANNEL.url + '" target="_blank" rel="noopener">YouTube 채널 ↗</a></div>'
      + (DATA.demo ? '<div class="vp-demo"><b>예시 데이터</b><span>지금 보이는 영상과 수치는 화면 구성을 보여 주려고 만든 가짜 값이며, 실제 채널 수치가 아닙니다. '
        + '1시간마다 실제 수치를 모으는 수집기를 연결하면 자동으로 실제 기록으로 바뀝니다.</span></div>' : '')
      + '<h3 class="ahead">영상 고르기</h3><div class="vp-list" role="listbox" aria-label="영상">'
      + VIDEOS.map(function(v){
          var s = status(v);
          return '<button type="button" class="vp-v' + (v === sel ? ' on' : '') + '" data-vid="' + esc(v.id) + '" role="option" aria-selected="' + (v === sel) + '">'
            + '<span class="vp-st' + (s.live ? ' live' : '') + '">' + s.t + '</span><b>' + esc(v.title) + '</b>'
            + '<small>' + ageTxt(age(v)) + ' 전 · 조회수 ' + fmt(at(v, age(v), 1)) + '</small></button>';
        }).join('') + '</div>'
      + '<div class="vp-det" id="vp-det"></div>'
      + '<h3 class="ahead">예측 방법 3가지</h3><div class="vp-ms" id="vp-ms"></div>'
      + '<p class="gnote vp-note">기호 — V 조회수, L 좋아요, C 댓글, t 지금(게시 후 시간), T 목표 시점, i 과거 영상. '
      + '오차 범위는 과거 영상에 같은 공식을 하나씩 적용해 본 "실제 ÷ 예측" 비율의 10~90% 구간을 곱한 것으로, 10번 중 8번은 이 안에 들어오도록 잡은 범위입니다.</p>'
      + '<h3 class="ahead" id="vp-trh"></h3><div id="vp-tr"></div>';
    el.innerHTML = h;
    renderDetail(); renderMethods(); renderTrack();
  }

  function renderDetail(){
    var v = sel, tg = TARGETS[ti], a = age(v), done = a >= tg.T, t = done ? tg.c : a;
    var pool = poolFor(v, tg.T, v.pub + t * 3600e3);
    var V = at(v, a, 1), L = at(v, a, 2), C = at(v, a, 3), dh = a >= 2 ? V - at(v, a - 1, 1) : V;
    var box = $('vp-det');
    var h = '<div class="vp-dh"><div class="vp-dt"><h3>' + esc(v.title) + '</h3><small>게시 ' + when(v.pub) + ' · 게시 후 ' + ageTxt(a) + '</small></div>'
      + '<div class="seg vp-hz" role="tablist" aria-label="예측 목표">' + TARGETS.map(function(x, k){
          return '<button type="button" role="tab" data-ti="' + k + '" class="' + (k === ti ? 'on' : '') + '" aria-selected="' + (k === ti) + '">' + x.name + '</button>';
        }).join('') + '</div></div>'
      + '<div class="cmeta vp-now">'
      + tile('조회수', fmt(V), full(V) + '회')
      + tile('좋아요', fmt(L), '조회수의 ' + pct(L / V, 1))
      + tile('댓글', fmt(C), '조회수의 ' + pct(C / V, 2))
      + tile('최근 1시간', '+' + fmt(dh), a >= 2 ? '시간당 증가' : '게시 직후')
      + '</div>';
    if (t < 1){
      box.innerHTML = h + '<p class="anote">게시 1시간 뒤부터 예측합니다.</p>'; return;
    }
    if (pool.length < MINPOOL){
      box.innerHTML = h + '<p class="anote">' + tg.name + ' 조회수를 예측하려면 ' + tg.name + '이 지난 과거 영상이 ' + MINPOOL + '개 이상 필요합니다 (지금 ' + pool.length + '개).</p>'; return;
    }
    var pr = predictAll(v, t, tg.T, pool), act = done ? at(v, tg.T, 1) : null;
    // 네 카드의 범위를 한 눈금 위에 그린다
    var lo = Infinity, hi = 0;
    pr.forEach(function(r){ if (!r) return; lo = Math.min(lo, r.lo || r.p); hi = Math.max(hi, r.hi || r.p); });
    if (act){ lo = Math.min(lo, act); hi = Math.max(hi, act); }
    var pad = (hi - lo) * 0.08 || hi * 0.05; lo = Math.max(0, lo - pad); hi += pad;
    function sx(x){ return ((x - lo) / (hi - lo) * 100).toFixed(1) + '%'; }
    h += '<p class="vp-lead">' + (done
        ? '<b>' + tg.name + '</b>이 지난 영상입니다. 게시 <b>' + tg.from + '</b> 뒤에 했던 예측을 실제 ' + tg.name + ' 조회수(<b>' + fmt(act) + '</b>)와 비교합니다.'
        : '게시 <b>' + ageTxt(t) + '</b> 뒤까지의 기록으로 <b>' + tg.name + '</b> 조회수를 예측합니다. 과거 영상 ' + pool.length + '개를 기준으로 썼습니다.') + '</p>'
      + '<div class="vp-preds">' + METHODS.concat([ALL]).map(function(m, k){
          var r = pr[k];
          if (!r) return '<div class="vp-pc" style="--mc:' + m.color + '"><div class="vp-pch"><span class="vp-no">' + m.b + '</span><b>' + m.name + '</b></div><div class="vp-pv">—</div><small>기록이 부족해 예측하지 못했습니다</small></div>';
          var res = act ? { err: (r.p - act) / act, hit: r.lo != null && act >= r.lo && act <= r.hi } : null;
          return '<div class="vp-pc' + (k === 3 ? ' mix' : '') + '" style="--mc:' + m.color + '">'
            + '<div class="vp-pch"><span class="vp-no">' + m.b + '</span><b>' + m.name + '</b></div>'
            + '<div class="vp-pv">' + fmt(r.p) + (res ? '<span class="vp-ok ' + (res.hit ? 'hit' : 'miss') + '">' + (res.hit ? '범위 적중' : '범위 밖') + '</span>' : '') + '</div>'
            + '<div class="vp-rg">' + (r.lo != null ? fmt(r.lo) + ' ~ ' + fmt(r.hi) + ' <small>80% 범위</small>' : '<small>범위 계산에 필요한 과거 영상이 부족합니다</small>') + '</div>'
            + '<div class="vp-scale" aria-hidden="true">' + (r.lo != null ? '<i style="left:' + sx(r.lo) + ';width:calc(' + sx(r.hi) + ' - ' + sx(r.lo) + ')"></i>' : '')
            + '<em style="left:' + sx(r.p) + '"></em>' + (act ? '<u style="left:' + sx(act) + '"></u>' : '') + '</div>'
            + '<small>' + (res ? (Math.abs(res.err) < 0.005 ? '실제와 거의 같게 예측' : '실제보다 ' + signPct(res.err) + (res.err > 0 ? ' 높게' : ' 낮게') + ' 예측')
              : k < 3 && r.mape != null ? '과거 영상으로 검증한 평균 오차 ' + pct(r.mape) : '세 방법 예측의 가운데 값') + '</small></div>';
        }).join('') + '</div>'
      + (act ? '<p class="gnote vp-legend"><i class="a"></i>실제 조회수 <i class="p"></i>예측 <i class="r"></i>80% 범위</p>' : '')
      + '<div class="graph vp-chart" id="vp-chart"></div>';
    box.innerHTML = h;
    $('vp-chart').innerHTML = '<h3>조회수 추이와 예측<span>가로축은 게시 후 시간(초반을 넓게 보도록 제곱근 눈금)</span></h3>' + chart(v, t, tg, pr, act);
  }
  function tile(k, v, s){ return '<div class="mt"><span class="mk">' + k + '</span><b>' + v + '</b>' + (s ? '<small>' + s + '</small>' : '') + '</div>'; }

  function chart(v, t, tg, pr, act){
    var T = tg.T, box = $('vp-chart');
    var w = Math.max(320, Math.min(760, (box.clientWidth || 720) - 30)), h = 250, L = 50, R = 58, Tp = 22, B = 30;
    function X(x){ return L + Math.sqrt(Math.max(0, x) / T) * (w - L - R); }
    var pts = v.snaps.filter(function(s){ return s[0] <= Math.min(age(v), T); });
    var ymax = 0;
    pts.forEach(function(s){ ymax = Math.max(ymax, s[1]); });
    pr.forEach(function(r){ if (r) ymax = Math.max(ymax, r.hi || r.p, r.p); });
    ymax *= 1.08;
    function Y(y){ return Tp + (1 - y / ymax) * (h - Tp - B); }
    var ink2 = '#aeaeb2', line = 'rgba(255,255,255,.1)', s = '<svg viewBox="0 0 ' + w + ' ' + h + '" role="img" aria-label="조회수 추이와 예측">';
    for (var g = 0; g <= 4; g++){
      var yv = ymax / 1.08 * g / 4;
      s += '<line x1="' + L + '" x2="' + (w - R + 36) + '" y1="' + Y(yv).toFixed(1) + '" y2="' + Y(yv).toFixed(1) + '" stroke="' + line + '"/>'
        + '<text x="' + (L - 6) + '" y="' + (Y(yv) + 4).toFixed(1) + '" text-anchor="end" font-size="11" fill="' + ink2 + '">' + fmt(yv) + '</text>';
    }
    var last = -99;
    [1, 3, 6, 12, 24, 48, 72, 168, 336, 720].forEach(function(x){
      if (x > T || X(x) - last < 38) return;
      last = X(x);
      s += '<text x="' + X(x).toFixed(1) + '" y="' + (h - B + 17) + '" text-anchor="middle" font-size="11" fill="' + ink2 + '">' + hLab(x) + '</text>';
    });
    // 예측 시점 이후는 미래 구간으로 옅게 칠한다
    s += '<rect x="' + X(t).toFixed(1) + '" y="' + Tp + '" width="' + (X(T) - X(t)).toFixed(1) + '" height="' + (h - Tp - B) + '" fill="rgba(255,255,255,.03)"/>';
    s += '<line x1="' + X(t).toFixed(1) + '" x2="' + X(t).toFixed(1) + '" y1="' + Tp + '" y2="' + (h - B) + '" stroke="rgba(255,255,255,.25)" stroke-dasharray="3 4"/>'
      + '<text x="' + (X(t) - 5).toFixed(1) + '" y="' + (Tp + 11) + '" text-anchor="end" font-size="11" fill="' + ink2 + '">' + (act ? '예측한 시점' : '지금') + '</text>';
    s += '<line x1="' + X(T).toFixed(1) + '" x2="' + X(T).toFixed(1) + '" y1="' + Tp + '" y2="' + (h - B) + '" stroke="rgba(255,255,255,.4)" stroke-dasharray="5 4"/>'
      + '<text x="' + (X(T) + 4).toFixed(1) + '" y="' + (Tp - 8) + '" text-anchor="middle" font-size="11" fill="#e8e8ed">목표 ' + tg.name + '</text>';
    // 실제 기록
    var d = 'M' + X(0).toFixed(1) + ' ' + Y(0).toFixed(1);
    pts.forEach(function(p){ d += ' L' + X(p[0]).toFixed(1) + ' ' + Y(p[1]).toFixed(1); });
    s += '<path d="' + d + '" fill="none" stroke="#e96387" stroke-width="2.5" stroke-linejoin="round"/>';
    var vt = at(v, t, 1);
    // 방법별 예측: 예측 시점에서 목표까지 점선, 목표 옆에 범위 막대
    METHODS.concat([ALL]).forEach(function(m, k){
      var r = pr[k]; if (!r) return;
      var xe = X(T) + 10 + k * 11;
      if (k < 3) s += '<line x1="' + X(t).toFixed(1) + '" y1="' + Y(vt).toFixed(1) + '" x2="' + X(T).toFixed(1) + '" y2="' + Y(r.p).toFixed(1) + '" stroke="' + m.color + '" stroke-width="1.6" stroke-dasharray="5 4" opacity=".85"/>';
      if (r.lo != null) s += '<line x1="' + xe + '" x2="' + xe + '" y1="' + Y(r.hi).toFixed(1) + '" y2="' + Y(r.lo).toFixed(1) + '" stroke="' + m.color + '" stroke-width="3" stroke-linecap="round" opacity=".55"/>';
      s += '<circle cx="' + xe + '" cy="' + Y(r.p).toFixed(1) + '" r="4" fill="' + m.color + '" stroke="#1c1c1e" stroke-width="1.5"/>';
    });
    s += '<circle cx="' + X(t).toFixed(1) + '" cy="' + Y(vt).toFixed(1) + '" r="4.5" fill="#e96387" stroke="#1c1c1e" stroke-width="2"/>';
    if (act) s += '<circle cx="' + X(T).toFixed(1) + '" cy="' + Y(act).toFixed(1) + '" r="5.5" fill="#fff" stroke="#e96387" stroke-width="2.5"/>'
      + '<text x="' + (X(T) - 8).toFixed(1) + '" y="' + (Y(act) - 9).toFixed(1) + '" text-anchor="end" font-size="12" font-weight="700" fill="#e8e8ed">실제 ' + fmt(act) + '</text>';
    s += '</svg>';
    return s + '<div class="vp-key">' + METHODS.concat([ALL]).map(function(m){ return '<span style="--mc:' + m.color + '"><i></i>' + m.no + ' ' + m.name + '</span>'; }).join('')
      + '<span style="--mc:#e96387"><i class="ln"></i>실제 조회수</span></div>';
  }

  function renderMethods(){
    var sm = track(ti).sum;
    $('vp-ms').innerHTML = METHODS.map(function(m, k){
      var st = sm[k];
      // 왼쪽: 이름·설명·쓰는 데이터·장단점 / 오른쪽: 공식·성적 (공식이 좁은 칸에서 끊기지 않게)
      return '<div class="vp-m" style="--mc:' + m.color + '"><div class="vp-ml">'
        + '<div class="vp-mh"><span class="vp-no">' + m.b + '</span><b>' + m.name + '</b></div>'
        + '<p>' + m.idea + '</p>'
        + '<div class="vp-tags">' + m.uses.map(function(u){ return '<span>' + u + '</span>'; }).join('') + '</div>'
        + '<ul class="vp-pc2"><li class="p">' + m.pro + '</li><li class="c">' + m.con + '</li></ul></div>'
        + '<div class="vp-mr"><pre class="vp-f">' + esc(m.formula) + '</pre>'
        + '<div class="vp-mst">' + (st.n ? '<span>' + TARGETS[ti].name + ' 예측 적중률 <b>' + pct(st.hit) + '</b></span><span>평균 오차 <b>' + pct(st.mape) + '</b></span><span>' + st.n + '회</span>'
          : '<span>' + TARGETS[ti].name + ' 예측 기록이 아직 없습니다</span>') + '</div></div></div>';
    }).join('');
  }

  function renderTrack(){
    var tg = TARGETS[ti], tr = track(ti), all = METHODS.concat([ALL]);
    $('vp-trh').textContent = '예측 성적표 · 게시 ' + tg.from + ' 뒤에 한 ' + tg.name + ' 조회수 예측';
    var best = -1, bm = Infinity;
    tr.sum.forEach(function(s, k){ if (k < 3 && s.n && s.mape < bm){ bm = s.mape; best = k; } });
    var h = '<div class="cmeta vp-sum">' + all.map(function(m, k){
        var s = tr.sum[k];
        return '<div class="mt vp-sm' + (k === best ? ' best' : '') + '" style="--mc:' + m.color + '"><span class="mk">' + m.no + ' ' + m.name + (k === best ? ' <em>가장 정확</em>' : '') + '</span>'
          + '<b>' + (s.n ? pct(s.hit) : '—') + '</b><small>' + (s.n ? '범위 적중 ' + Math.round(s.hit * s.n) + '/' + s.n + ' · 평균 오차 ' + pct(s.mape) : '아직 결과가 없습니다') + '</small></div>';
      }).join('') + '</div>';
    if (!tr.rows.length){ $('vp-tr').innerHTML = h + '<p class="anote">아직 비교할 예측이 없습니다.</p>'; return; }
    h += '<div class="atab-w"><table class="atab vp-tab"><thead><tr><th>영상</th><th>실제 ' + tg.name + '</th>'
      + all.map(function(m){ return '<th style="color:' + m.color + '">' + m.no + '</th>'; }).join('') + '</tr></thead><tbody>'
      + tr.rows.slice(0, 20).map(function(r){
          return '<tr' + (r.v === sel ? ' class="on"' : '') + '><td><button type="button" class="vp-link" data-vid="' + esc(r.v.id) + '">' + esc(r.v.title) + '</button></td>'
            + '<td>' + (r.done ? fmt(r.act) : '<span class="vp-wait">' + ageTxt(tg.T - age(r.v)) + ' 뒤</span>') + '</td>'
            + r.pr.map(function(p, k){
                if (!p) return '<td>—</td>';
                var x = r.res[k];
                return '<td>' + fmt(p.p) + (x ? ' <span class="vp-e ' + (x.hit ? 'hit' : 'miss') + '">' + signPct(x.err) + (x.hit ? ' ✓' : ' ✗') + '</span>' : '') + '</td>';
              }).join('') + '</tr>';
        }).join('') + '</tbody></table></div>'
      + '<p class="gnote">✓ 는 실제 조회수가 80% 범위 안에 들어온 경우입니다. 예측은 게시 ' + tg.from + ' 뒤 그 시점까지 있던 기록만으로 계산하고, '
      + '그 뒤에 목표 시점에 도달한 영상은 과거 영상으로 쓰지 않습니다. 결과를 기다리는 예측도 함께 보여 줍니다.</p>';
    $('vp-tr').innerHTML = h;
  }

  el.addEventListener('click', function(e){
    var b = e.target.closest('[data-vid]');
    if (b){
      var v = VIDEOS.filter(function(x){ return x.id === b.getAttribute('data-vid'); })[0];
      if (v){ sel = v; ti = autoTarget(v); render(); $('vp-det').scrollIntoView({ block: 'start', behavior: 'smooth' }); }
      return;
    }
    var hz = e.target.closest('[data-ti]');
    if (hz){ ti = +hz.getAttribute('data-ti'); renderDetail(); renderMethods(); renderTrack(); }
  });
})();
