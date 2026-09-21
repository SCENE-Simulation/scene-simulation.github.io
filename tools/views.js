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
    { key: 'm2', no: '②', b: '2', name: '참여도 환산법', tab: '참여도', color: '#47d19a',
      short: '좋아요·댓글 반응으로 앞으로의 조회수를 가늠합니다.',
      desc: '과거 영상에서 좋아요·댓글 1개가 결국 조회수 몇 회로 이어졌는지 보고, 지금의 좋아요·댓글 수로 환산합니다.',
      uses: ['좋아요', '댓글', '과거 영상'],
      pro: '반응이 뜨거운 영상을 더 높게 봄', con: '좋아요·댓글이 적은 극초반엔 흔들림' },
    { key: 'm3', no: '③', b: '3', name: '추세 곡선 외삽법', tab: '추세 곡선', color: '#a080d0',
      short: '이 영상의 최근 증가 속도를 그대로 이어 갑니다.',
      desc: '다른 영상과 비교하지 않고, 이 영상이 최근 늘어난 속도가 점점 느려지며 이어진다고 보고 연장합니다.',
      uses: ['1시간 단위 추이', '1주일 추이'],
      pro: '과거 영상이 적어도 쓸 수 있음', con: '초반에 몰렸다 식는 영상은 높게 봄' }
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
  var prevShow = window.SG.onShow;
  window.SG.onShow = function(tab){ prevShow(tab); if (tab === 'views') show(); };

  var ALLM = METHODS.concat([ALL]);                    // 0~2 방법, 3 종합
  var ORDER = [3, 0, 1, 2];                            // 화면에 보이는 순서: 종합 먼저
  var sel = null, mi = 3, si = 1, loading = false;     // 고른 영상, 고른 방법(기본 종합), 성적표 목표(기본 7일)
  var PRED = {};                                       // 영상·목표별 예측 (한 번 계산하면 재사용)

  // 화면 상태: 순위 기준 창(24시간/7일), 종류 거르기, 표 정렬·검색·보이는 줄 수, 그래프 모드, 펼친 줄
  var SOPEN = {};                                        // 성적표: 방법별 예측을 펼친 줄
  var rv = 'rank', rk = 24, ft = 'all', ts = 'gain', tq = '', tn = 20, cm = 'cum', OPEN = {}, VC = {}, lastCheck = 0, timer = null;

  function show(){
    if (DATA){ render(); return; }
    if (loading) return;
    loading = true;
    el.innerHTML = head() + '<p class="gnote">기록을 불러오는 중…</p>';
    load(0).then(function(d){ apply(d); render(); if (!timer) timer = setInterval(tick, 30e3); });
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
        type: v.type || 'long', dur: v.dur || 0, pred: v.pred || null, ms: v.ms || [], snaps: s, vs: { snaps: vs } };
    }).filter(function(v){ return v.snaps.length; }).sort(function(a, b){ return b.pub - a.pub; });
    sel = VIDEOS.filter(function(v){ return v.id === keep; })[0] || VIDEOS[0] || null;
  }
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

  function head(){
    return '<div class="sec"><div class="sec-t"><svg viewBox="0 0 24 24"><use href="#i-toy"/></svg>장난감<span class="cr">›</span><span class="lt">조회수 예측기</span></div></div>'
      + '<div class="vx-hero"><div class="vx-meta" id="vx-meta"></div>'
      + '<h2 class="vx-h">안원잘부 영상들,<br>조회수가 <em>어디까지 오를까?</em></h2>'
      + '<p class="vx-d">15분마다 조회수를 모아 지금 얼마나 빨리 오르는지 보고, 24시간·7일·30일 뒤 조회수를 예측합니다. 지난 예측이 맞았는지도 채점합니다.</p></div>';
  }
  function status(v){
    var a = age(v);
    if (a < VE.LATE) for (var k = 0; k < TARGETS.length; k++) if (a < TARGETS[k].T) return { t: TARGETS[k].name + ' 예측 중', live: true };
    return { t: a >= VE.LATE ? '100만 단위 추적' : '30일 지남', live: false };
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
    var o = { tg: tg, done: done, t: t, act: done ? at(v, tg.T, 1) : null }, f = done ? frozen(v, tg) : undefined;
    if (done && o.act == null) o.err = '수집을 시작하기 전에 지난 시점이라 기록이 없습니다';
    else if (f !== undefined){ if (f.pr) o.pr = f.pr; else o.err = f.err; }
    else if (t < 1) o.err = '게시 1시간 뒤부터 예측합니다';
    else if (VE.since(v) > t) o.err = '수집을 시작하기 전에 ' + tg.from + '이 지나 예측할 수 없습니다';
    else {
      var pool = poolFor(v, tg.T, v.pub + t * 3600e3, t), pr = predictAll(v, t, tg.T, pool), m3 = VE.m3From(v);
      o.pool = pool.length;
      if (pr.some(Boolean)) o.pr = pr;
      else o.err = !done && m3 > t && m3 < tg.T ? '기록이 조금 더 쌓이면(약 ' + ageTxt(m3 - t) + ' 뒤) ③ 추세 곡선 예측이 나옵니다'
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
  //   게시 15일 전: 지금 → 24시간·7일·30일 종합 예측을 로그 시간으로 이은 곡선 위 1주 뒤, 15일 뒤: ④ 1일 추세의 1주 뒤
  //   예측이 없으면 최근 24시간 증가 × 7 (추정)
  function week1(v){
    var key = v.id + '|w1';
    if (VC[key]) return VC[key];
    var a = age(v), V = av(v, a), T = a + 168, o = null;
    if (a >= VE.LATE){ var p = VE.msPlan(v.vs, a, 1); if (p) o = { x: p.wk[0], kind: 'pred' }; }
    else {
      var pts = [[a, V]];
      TARGETS.forEach(function(tg, k){ if (tg.T <= a) return; var r = hz(v, k).pr, x = r && r[3] ? r[3].p : null; if (x && x > pts[pts.length - 1][1]) pts.push([tg.T, x]); });
      for (var i = 1; i < pts.length && !o; i++) if (pts[i][0] >= T){
        var p0 = pts[i - 1], p1 = pts[i], f = (Math.log(1 + T) - Math.log(1 + p0[0])) / (Math.log(1 + p1[0]) - Math.log(1 + p0[0]));
        o = { x: p0[1] + f * (p1[1] - p0[1]), kind: 'pred' };
      }
    }
    if (!o){ var g = velo(v, 24); if (g.x != null && (g.kind === 'real' || g.kind === 'est')) o = { x: V + g.x * 7, kind: 'est' }; }
    return (VC[key] = o ? { x: o.x, gain: o.x - V, kind: o.kind } : { x: null, gain: null, kind: 'wait' });
  }
  // 100만 단위 돌파 목록: 조회수 90만 이상. 다음 100만 까지 며칠 (15일 뒤는 ④, 그 전은 예측 곡선·최근 속도)
  function board(){
    var key = 'board|' + ft;
    if (VC[key]) return VC[key];
    return (VC[key] = list().map(function(v){
      var a = age(v), V = av(v, a); if (!(V >= 9e5)) return null;
      var M = (Math.floor(V / VE.MSTEP) + 1) * VE.MSTEP, eta = null, why = 'wait';        // why: 못 구한 까닭 (wait 기록 부족, far 지금 추세로는 못 닿음)
      if (a >= VE.LATE){ var p = VE.msPlan(v.vs, a, 1), m = p && p.ms[0]; if (m){ if (m.days != null) eta = m.days; else why = 'far'; } }
      else { var s = milestone(v); if (s.M === M && s.h != null) eta = s.h / 24; }
      return { v: v, V: V, M: M, eta: eta, why: why };
    }).filter(Boolean).sort(function(x, y){ return (x.eta == null ? 1e9 : x.eta) - (y.eta == null ? 1e9 : y.eta) || y.V - x.V; }));
  }
  function in8(x){ return x.eta != null && x.eta <= VE.WEEKS * 7; }
  var KIND = { est: '추정', pred: '예측', sofar: '진행 중', wait: '수집 중' };
  function kindTag(o){ return KIND[o.kind] ? '<i class="vk vk-' + o.kind + '">' + KIND[o.kind] + '</i>' : ''; }

  // 다음 기념 조회수 (1만 → 10만 → 100만 단위)
  function nextMs(V){ var st = V < 1e5 ? 1e4 : V < 1e6 ? 1e5 : 1e6; return (Math.floor(V / st) + 1) * st; }
  function fmtM(M){ return M >= 1e8 ? fmt(M) : Math.round(M / 1e4).toLocaleString('ko-KR') + '만'; }
  // 다음 기념 조회수에 닿는 때: 예측 곡선(지금 → 24시간·7일·30일 종합 예측, 로그 시간으로 잇기) 위에서 찾는다.
  // 예측이 없는 영상(30일 지난 영상 등)은 최근 24시간 속도로 (30일 안일 때만). { M, h: 지금부터 몇 시간 뒤 | null, how }
  function milestone(v){
    var key = v.id + '|ms';
    if (VC[key]) return VC[key];
    var a = age(v), V = av(v, a), M = nextMs(V), pts = [[a, V]], o = null;
    if (a >= VE.LATE){ var lp = VE.msPlan(v.vs, a, 1), lm = lp && lp.ms[0]; return (VC[key] = lm && lm.days != null ? { M: lm.M, h: lm.days * 24, how: 'lt' } : { M: M, h: null }); }
    TARGETS.forEach(function(tg, k){
      if (tg.T <= a) return;
      var r = hz(v, k).pr, p = r && r[3] ? r[3].p : null;
      if (p && p > pts[pts.length - 1][1]) pts.push([tg.T, p]);
    });
    for (var i = 1; i < pts.length && !o; i++) if (pts[i][1] >= M){
      var p0 = pts[i - 1], p1 = pts[i], f = (M - p0[1]) / (p1[1] - p0[1]);
      o = { M: M, h: Math.exp(Math.log(1 + p0[0]) + f * (Math.log(1 + p1[0]) - Math.log(1 + p0[0]))) - 1 - a, how: 'pred' };
    }
    if (!o && pts.length === 1){
      var g = velo(v, 24);
      if (g.x > 0 && (g.kind === 'real' || g.kind === 'est')){ var h = (M - V) / (g.x / 24); if (h <= 720) o = { M: M, h: h, how: 'rate' }; }
    }
    return (VC[key] = o || { M: M, h: null });
  }
  function soon(v){ var m = milestone(v); return m.h != null && m.h <= 48 ? m : null; }       // 48시간 안이면 "곧"
  function fmtDur(s){
    if (!s) return '';
    var h = Math.floor(s / 3600), m = Math.floor(s % 3600 / 60), x = s % 60;
    return h ? h + '시간' + (m ? ' ' + m + '분' : '') : m ? m + '분' + (x ? ' ' + x + '초' : '') : x + '초';
  }
  function ymd(ms){ var d = new Date(ms); return String(d.getFullYear()).slice(2) + '.' + two(d.getMonth() + 1) + '.' + two(d.getDate()) + ' ' + two(d.getHours()) + ':' + two(d.getMinutes()); }
  function list(){
    return VIDEOS.filter(function(v){ return ft === 'all' || v.type === ft; });
  }
  function byGain(a, b){
    var x = velo(a, rk).x, y = velo(b, rk).x;
    return (y == null ? -1 : y) - (x == null ? -1 : x);
  }

  // ---------- 게시 15일 뒤: 100만 단위 돌파 (④ 1일 추세, 1주 ~ 8주로 보여 줌, 계산은 views-engine.js) ----------
  var LT = { no: '④', b: '4', name: '1일 추세법', color: '#5bb4ec',
    short: '게시 15일이 지나면 최근 하루 증가량과, 그 증가량이 하루마다 얼마나 줄어드는지로 다음 100만 단위까지 며칠 걸릴지 계산합니다.',
    desc: '최근 하루 동안 는 조회수를 기준으로, 최근 일주일 동안 하루 증가량이 하루에 몇 %씩 줄었는지를 이어 붙여 다음 100만 단위에 닿는 날을 셉니다.',
    uses: ['최근 하루 증가', '1일 단위 추이'],
    pro: '단순하고 오래된 영상의 느린 증가에 맞음', con: '갑자기 다시 뜨는 영상(역주행)은 늦게 따라감' };
  function late(v){ return age(v) >= VE.LATE; }
  function plan(v){
    var key = v.id + '|plan';
    if (!(key in VC)) VC[key] = late(v) ? VE.msPlan(v.vs, age(v), 3) : null;
    return VC[key];
  }
  function nowMs(v){ return v.pub + age(v) * 3600e3; }
  // 날짜: 올해가 아니면 연도를 붙인다 (27.3/5)
  function dY(ms, ref){ var d = new Date(ms); return (d.getFullYear() !== new Date(ref).getFullYear() ? String(d.getFullYear()).slice(2) + '.' : '') + (d.getMonth() + 1) + '/' + d.getDate(); }
  function dday(v, h){ return dY(nowMs(v) + h * 3600e3, nowMs(v)); }
  function daysTxt(d){ return d == null ? '못 닿음' : d < 1 ? '하루 안' : '약 ' + Math.ceil(d) + '일'; }
  function dropTxt(r){ var x = Math.round((1 - r) * 1000) / 10; return x > 0 ? '하루마다 −' + x + '%' : '지금 속도 그대로'; }
  // 1주 ~ 8주 막대: 그 주까지 다음 100만까지 남은 조회수를 얼마나 채우는지 (100% = 돌파). 넘는 주를 강조
  function wkBars(p, m, big){
    var gap = m.M - p.V;
    return '<span class="wk' + (big ? ' big' : '') + '" role="img" aria-label="주별 진행률 ' + p.wk.map(function(x, i){ return (i + 1) + '주 ' + Math.min(100, Math.round((x - p.V) / gap * 100)) + '%'; }).join(', ') + '">'
      + p.wk.map(function(x, i){
          var f = Math.max(0, Math.min(1, (x - p.V) / gap));
          return '<i class="' + (i + 1 === m.week ? 'lw' : f >= 1 ? 'on' : '') + '" style="--h:' + Math.max(4, f * 100).toFixed(0) + '%" title="' + (i + 1) + '주 뒤 ' + fmt(x) + ' (' + Math.round(f * 100) + '%)">'
            + (big ? '<em>' + Math.round(f * 100) + '</em>' : '') + '</i>';
        }).join('') + '</span>'
      + (big ? '<span class="wk-x">' + p.wk.map(function(x, i){ return '<span>' + (i + 1) + '주</span>'; }).join('') + '</span>' : '');
  }

  // 상세(15일 뒤): 다음 100만 단위 세 개 · 초기 예측 결과 · 이 영상의 100만 돌파 예측 기록
  function renderLate(){
    var v = sel, p = plan(v);
    $('vd-md').innerHTML = '<i style="background:' + LT.color + '"></i><span>' + LT.short + '</span>'
      + (p ? '<em>최근 하루 +' + fmt(p.g) + '회 · ' + dropTxt(p.r)
        + (p.src === 'data' ? ' (최근 ' + Math.min(7, Math.floor(p.days)) + '일 기록)' : ' (기록 2일이 쌓이기 전이라 지금 속도 그대로)') + '</em>' : '');
    $('vd-hs').innerHTML = p ? p.ms.map(function(m){ return msCard(v, p, m); }).join('')
      : '<div class="vh na" style="grid-column:1/-1"><div class="vh-h"><div><b>100만 단위 돌파</b></div><span class="vh-tag">예측 준비 중</span></div>'
        + '<small class="vh-n">최근 기록이 3시간 이상 쌓이면 예측합니다.</small></div>';
    $('vd-ex').innerHTML = early(v) + history(v);
    chart();
  }
  function msCard(v, p, m){
    var ok = VE.likely(m);
    return '<div class="vh ms" style="--mc:' + LT.color + '">'
      + '<div class="vh-h"><div><b>' + fmtM(m.M) + ' 돌파</b><small>' + fmt(m.M - p.V) + ' 남음</small></div>'
      + '<span class="vh-tag ' + (ok ? 'hit' : '') + '">' + (ok ? m.week + '주 차' : m.days == null ? '지금 추세로는 못 닿음' : '8주 넘게') + '</span></div>'
      + '<div class="vh-v">' + (m.days == null ? '—' : Math.ceil(m.days) + '<small>일 뒤 · ' + dday(v, m.days * 24) + ' 무렵</small>') + '</div>'
      + '<div class="vh-up">하루 +' + fmt(p.g) + ' · ' + dropTxt(p.r) + '</div>'
      + wkBars(p, m, true) + '</div>';
  }
  // 초기(24시간·7일·30일) 예측 결과 한 줄 요약
  function early(v){
    return '<div class="vd-early"><span class="vd-el">초기 예측 결과</span>' + TARGETS.map(function(tg, k){
      var o = hz(v, k), r = o.pr && o.pr[3], body;
      if (!o.done) body = r ? '예측 <b>' + fmt(r.p) + '</b> <small>' + ageTxt(tg.T - age(v)) + ' 뒤</small>' : '<small>' + (o.err ? '예측 없음' : '진행 중') + '</small>';
      else if (o.act == null) body = '<small>수집 전이라 기록 없음</small>';
      else body = '실제 <b>' + fmt(o.act) + '</b>' + (r ? ' <small>예측 ' + fmt(r.p) + '</small><span class="vp-e' + (r.lo != null ? (o.act >= r.lo && o.act <= r.hi ? ' hit' : ' miss') : '') + '">' + signPct((r.p - o.act) / o.act) + '</span>' : ' <small>예측 없음</small>');
      return '<span class="vd-e1"><em>' + tg.name + '</em>' + body + '</span>';
    }).join('') + '</div>';
  }
  // 100만 돌파 예측 하나를 주 단위로 채점: 예측한 주차와 실제로 넘은 주차가 ±1주 안이면 적중.
  // 8주 넘게(또는 못 닿음)로 본 예측은 8주 안에 안 넘으면 적중
  function msResult(v, m){
    var a = age(v), pw = m.w != null && m.w <= VE.WEEKS ? m.w : null, el = (a - m.t) / 168;
    if (m.hit != null){
      var aw = Math.max(1, Math.ceil((m.hit - m.t) / 168));
      if (pw == null) return { cls: aw > VE.WEEKS ? 'hit' : 'miss', done: true, pw: pw, aw: aw,
        txt: aw > VE.WEEKS ? '✓ 8주 넘어 달성 (예측대로)' : '예상(8주 넘게)보다 빨리 ' + aw + '주 차 달성' };
      var ok = Math.abs(aw - pw) <= 1;
      return { cls: ok ? 'hit' : 'miss', done: true, pw: pw, aw: aw, txt: (ok ? '✓ ' : '') + '예측 ' + pw + '주 차 → 실제 ' + aw + '주 차' };
    }
    if (pw != null && el > pw + 1) return { cls: 'miss', done: true, pw: pw, aw: null, txt: '✗ 예측한 ' + pw + '주 차가 지났지만 아직 못 넘음' };
    if (pw == null && el > VE.WEEKS) return { cls: 'hit', done: true, pw: pw, aw: null, txt: '✓ 8주 안에 못 넘음 (예측대로)' };
    return { cls: '', done: false, pw: pw, aw: null, txt: '진행 중 · ' + Math.floor(el + 1) + '주 차' };
  }
  function history(v){
    if (!v.ms || !v.ms.length) return '<div class="vd-mh"><span class="vd-el">100만 돌파 예측 기록</span><small class="vh-n">게시 15일 뒤 기록이 2일 쌓이면 다음 100만 단위를 몇 주 차에 넘을지 예측을 고정해 두고, 실제로 넘은 주와 비교해 채점합니다.</small></div>';
    return '<div class="vd-mh"><span class="vd-el">100만 돌파 예측 기록</span>' + v.ms.slice().reverse().map(function(m){
      var r = msResult(v, m);
      return '<div class="vd-mr ' + r.cls + '"><b>' + fmtM(m.M) + '</b><span>' + dY(v.pub + m.t * 3600e3, nowMs(v)) + ' 예측 · '
        + (r.pw ? r.pw + '주 차 (' + dY(v.pub + m.e * 3600e3, nowMs(v)) + ' 무렵)' : m.e == null ? '지금 추세로는 못 닿음' : '8주 넘게') + '</span>'
        + '<span>' + (m.hit != null ? '실제 ' + dY(v.pub + m.hit * 3600e3, nowMs(v)) : '') + '</span><em>' + r.txt + '</em></div>';
    }).join('') + '</div>';
  }

  // 그래프(15일 뒤): 가로축 주 단위 (최근 최대 2주 기록 · 지금 · 1주 ~ 8주 뒤). 1일 추세로 이은 예상 + 100만 단위 가로선
  function msChart(){
    var v = sel, a = age(v), p = plan(v), box = $('vd-chart');
    var W = Math.max(320, Math.min(860, (box.clientWidth || 760) - 28)), H = 300, L = 62, R = 16, Tp = 24, B = 30;
    var s = Math.max(VE.since(v.vs), a - 336), end = a + VE.WEEKS * 168, fut = [];
    var pts = v.vs.snaps.filter(function(q){ return q[0] >= s - 1e-6 && q[0] <= a + 1e-6; });
    if (p) for (var dd = 0; dd <= VE.WEEKS * 7; dd++) fut.push([a + dd * 24, VE.dayProject(p.V, p.g, p.r, dd)]);
    var ys = pts.map(function(q){ return q[1]; }).concat(fut.map(function(f){ return f[1]; }));
    var y0 = Math.min.apply(null, ys), y1 = Math.max.apply(null, ys), M1 = p && p.ms[0].M, showM1 = M1 && M1 <= y1 + (y1 - y0) * 0.35;
    if (showM1) y1 = Math.max(y1, M1);
    var pad = (y1 - y0) * 0.08 || y1 * 0.02; y0 = Math.max(0, y0 - pad); y1 += pad;
    function X(h){ return L + (h - s) / (end - s) * (W - L - R); }
    function Y(y){ return Tp + (1 - (y - y0) / (y1 - y0)) * (H - Tp - B); }
    var svg = '<svg viewBox="0 0 ' + W + ' ' + H + '" role="img" aria-label="주 단위 100만 돌파 예상">';
    var st = niceStep((y1 - y0) / 4);
    for (var y = Math.ceil(y0 / st) * st; y <= y1; y += st)
      svg += '<line x1="' + L + '" x2="' + (W - R) + '" y1="' + Y(y).toFixed(1) + '" y2="' + Y(y).toFixed(1) + '" stroke="rgba(255,255,255,.06)"/>'
        + '<text x="' + (L - 7) + '" y="' + (Y(y) + 4).toFixed(1) + '" text-anchor="end" font-size="10.5" fill="#8e8e93">' + fmt(y) + '</text>';
    for (var w = -2; w <= VE.WEEKS; w++){
      var hx = a + w * 168; if (hx < s - 1e-6) continue;
      var x = X(hx);
      svg += '<line x1="' + x.toFixed(1) + '" x2="' + x.toFixed(1) + '" y1="' + Tp + '" y2="' + (H - B) + '" stroke="rgba(255,255,255,' + (w ? .06 : 0) + ')"/>'
        + '<text x="' + x.toFixed(1) + '" y="' + (H - 9) + '" text-anchor="middle" font-size="10.5" font-weight="' + (w > 0 ? 700 : 500) + '" fill="' + (w > 0 ? '#aeaeb2' : '#8e8e93') + '">' + (w === 0 ? '' : (w > 0 ? w : '−' + (-w)) + '주') + '</text>';
    }
    for (var M = Math.ceil(y0 / VE.MSTEP) * VE.MSTEP; M <= y1; M += VE.MSTEP)
      svg += '<line x1="' + L + '" x2="' + (W - R) + '" y1="' + Y(M).toFixed(1) + '" y2="' + Y(M).toFixed(1) + '" stroke="' + LT.color + '" stroke-opacity=".55" stroke-dasharray="6 5"/>'
        + '<text x="' + (L + 6) + '" y="' + (Y(M) - 6).toFixed(1) + '" font-size="11" font-weight="800" fill="' + LT.color + '">' + fmtM(M) + ' 돌파선</text>';
    if (p){
      svg += '<path d="' + fut.map(function(f, i){ return (i ? 'L' : 'M') + X(f[0]).toFixed(1) + ' ' + Y(f[1]).toFixed(1); }).join(' ') + '" fill="none" stroke="' + LT.color + '" stroke-width="2.4" stroke-dasharray="7 5" stroke-linecap="round"/>';
      p.ms.forEach(function(m){
        if (m.days == null || m.days * 24 > end - a || m.M > y1) return;
        var cx = X(a + m.days * 24), cy = Y(m.M);
        svg += '<circle cx="' + cx.toFixed(1) + '" cy="' + cy.toFixed(1) + '" r="5.5" fill="' + LT.color + '" stroke="#1c1c1e" stroke-width="2"/>'
          + '<text x="' + cx.toFixed(1) + '" y="' + (cy + 18).toFixed(1) + '" text-anchor="middle" font-size="11" font-weight="700" fill="#cfe9fb">' + m.week + '주 차</text>';
      });
      if (M1 && !showM1) svg += '<text x="' + (W - R - 4) + '" y="' + (Tp - 8) + '" text-anchor="end" font-size="11" font-weight="700" fill="' + LT.color + '">다음 ' + fmtM(M1) + '까지 ' + fmt(M1 - p.V) + ' — 8주 안에는 어려움</text>';
    }
    if (pts.length > 1) svg += '<path d="' + pts.map(function(q, i){ return (i ? 'L' : 'M') + X(q[0]).toFixed(1) + ' ' + Y(q[1]).toFixed(1); }).join(' ') + '" fill="none" stroke="#ff4d4f" stroke-width="2.6" stroke-linejoin="round" stroke-linecap="round"/>';
    var V = av(v, a);
    svg += '<line x1="' + X(a).toFixed(1) + '" x2="' + X(a).toFixed(1) + '" y1="' + Tp + '" y2="' + (H - B) + '" stroke="#ff4d4f" stroke-opacity=".5" stroke-dasharray="2 4"/>'
      + '<circle cx="' + X(a).toFixed(1) + '" cy="' + Y(V).toFixed(1) + '" r="5.5" fill="#ff4d4f" stroke="#1c1c1e" stroke-width="2"/></svg>';
    box.innerHTML = chHead('100만 단위 돌파 예상', '④ 1일 추세 · 가로축은 주 (최근 기록 → 지금 → 8주 뒤)') + svg
      + '<div class="vd-key" style="--mc:' + LT.color + '"><span><i class="k-a"></i>실제 조회수</span>' + (p ? '<span><i class="k-p"></i>예상 (1일 추세)</span>' : '')
      + '<span><i class="k-m"></i>100만 단위</span></div>';
  }

  // 성적표(15일 뒤): 주차 적중(±1주) + 8주 안/넘게로 본 예측이 실제로 어땠는지
  function renderMsScore(h){
    var rows = [];
    VIDEOS.forEach(function(v){ (v.ms || []).forEach(function(m){ rows.push({ v: v, m: m, r: msResult(v, m) }); }); });
    rows.sort(function(x, y){ return (y.v.pub + y.m.t * 3600e3) - (x.v.pub + x.m.t * 3600e3); });
    var done = rows.filter(function(x){ return x.r.done; }), hit = done.filter(function(x){ return x.r.cls === 'hit'; });
    var inW = done.filter(function(x){ return x.r.pw != null; }), outW = done.filter(function(x){ return x.r.pw == null; });
    var got = function(L){ return L.filter(function(x){ return x.r.aw != null && x.r.aw <= VE.WEEKS; }).length; };
    h += '<div class="vs-cards ms"><div class="vs-c" style="--mc:' + LT.color + '"><div class="vs-ch"><span class="vp-no">' + LT.b + '</span>' + LT.name + '</div>'
      + '<div class="vs-row"><span>예측 주차 적중 (±1주)</span><b>' + (done.length ? pct(hit.length / done.length) : '—') + '</b></div>'
      + '<div class="vs-bar"><i style="width:' + (done.length ? hit.length / done.length * 100 : 0).toFixed(0) + '%"></i></div>'
      + '<small>' + (done.length ? done.length + '개 결과 · 진행 중 ' + (rows.length - done.length) + '개' : rows.length ? '진행 중 ' + rows.length + '개 · 아직 결과 없음' : '아직 예측이 없습니다') + '</small></div>'
      + '<div class="vs-c" style="--mc:' + LT.color + '"><div class="vs-ch">8주 안에 실제로 넘었나</div>'
      + '<div class="vs-row"><span>8주 안으로 본 예측</span><b>' + (inW.length ? got(inW) + '/' + inW.length : '—') + '</b></div>'
      + '<div class="vs-row"><span>8주 넘게로 본 예측</span><b>' + (outW.length ? got(outW) + '/' + outW.length : '—') + '</b></div>'
      + '<small>앞은 클수록, 뒤는 작을수록 잘 맞은 것</small></div></div>';
    if (!rows.length){ $('vs').innerHTML = h + '<p class="anote">게시 15일이 지나고 기록이 2일 쌓인 영상부터 100만 단위 돌파 예측을 고정해 채점합니다.</p>'; return; }
    h += '<div class="atab-w"><table class="atab vs-tab vs-ms"><thead><tr><th>영상</th><th>목표</th><th>예측한 날</th><th>예상</th><th>예측 주차</th><th>실제</th><th>결과</th></tr></thead><tbody>'
      + rows.slice(0, 20).map(function(x){
          var v = x.v, m = x.m, D = function(t){ return t == null ? '—' : dY(v.pub + t * 3600e3, v.pub + m.t * 3600e3); };
          return '<tr' + (v === sel ? ' class="on"' : '') + '><td><button type="button" class="vs-v" data-vid="' + esc(v.id) + '"><span class="vs-th">' + thumb(v) + '</span>' + esc(v.title) + '</button></td>'
            + '<td><b>' + fmtM(m.M) + '</b></td><td>' + D(m.t) + '</td><td>' + (m.e == null ? '못 닿음' : D(m.e) + ' <small>(' + Math.ceil((m.e - m.t) / 24) + '일)</small>') + '</td>'
            + '<td>' + (x.r.pw ? x.r.pw + '주 차' : '8주 넘게') + '</td>'
            + '<td>' + (m.hit != null ? D(m.hit) + ' <small>(' + x.r.aw + '주 차)</small>' : '—') + '</td><td><span class="vp-e ' + x.r.cls + '">' + x.r.txt + '</span></td></tr>';
        }).join('') + '</tbody></table></div>'
      + '<p class="gnote">예측은 게시 15일이 지나고 기록이 2일 쌓였을 때(또는 앞 목표를 넘은 직후) 한 번 고정해 둔 값입니다. 예측한 주차와 실제로 넘은 주가 ±1주 안이면 적중으로 봅니다.</p>';
    $('vs').innerHTML = h;
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
      // 예측 조회수(가로 카드) / 100만 단위 돌파(진행 목록) — 한 줄 탭으로 바꿔 본다
      + '<div class="vr-head"><div class="seg vr-tabs" role="tablist" aria-label="보기">'
      + '<button type="button" role="tab" id="vr-tb" data-rv="rank"></button><button type="button" role="tab" id="vr-msb" data-rv="ms"></button></div>'
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
      + '<div class="vd" id="vd"></div>'
      + '<div class="vt-head" id="vt-h"><h3 class="ahead">전체 영상</h3><input type="search" class="vt-q" id="vt-q" placeholder="제목 검색" value="' + esc(tq) + '" aria-label="제목 검색"></div>'
      + '<div class="vt" id="vt"></div>'
      + '<h3 class="ahead" id="vs-h">예측 성적표</h3><div class="vs" id="vs"></div>'
      + '<h3 class="ahead">예측 방법</h3><div class="vm-list" id="vm-list"></div>'
      + about()
      + '<div class="vx-toast" id="vx-toast" role="status" hidden></div>';
    $('vx-meta').innerHTML = '<span>집계 <b>' + when(Date.parse(DATA.updated)) + '</b></span>'
      + (DATA.demo ? '' : '<button type="button" class="vx-chk" id="vx-chk"><i></i><span id="vx-next"></span></button>');
    var row = $('vc-row');
    row.addEventListener('scroll', navState, { passive: true });
    $('vt-q').addEventListener('input', function(){ tq = this.value.trim(); tn = 20; renderTable(); });
    renderRank(); renderVideo(); renderTable(); renderScore(); renderMethods(); tick();
  }
  function about(){
    return '<details class="vx-about"><summary>용어와 계산 방법</summary><ul>'
      + '<li><b>24시간 증가</b> 최근 24시간 동안 는 조회수입니다. 기록이 아직 24시간이 안 되면 지금까지의 속도로 늘려 잡고 <i class="vk vk-est">추정</i>으로 표시합니다.</li>'
      + '<li><b>예측 조회수</b> 영상마다 1주 뒤 예상 조회수입니다. 게시 15일 전 영상은 24시간·7일·30일 종합 예측을 이은 곡선으로, 15일 뒤 영상은 ④ 1일 추세로 계산합니다. 예측이 아직 없으면 최근 24시간 증가 × 7 로 잡고 <i class="vk vk-est">추정</i>으로 표시합니다.</li>'
      + '<li><b>곧 N만</b> 다음 기념 조회수(1만·10만·100만 단위)에 48시간 안에 닿을 것으로 보이는 영상입니다. 예측 곡선으로 계산하고, 예측이 없는 영상은 최근 24시간 속도로 계산합니다.</li>'
      + '<li><b>게시 15일 뒤</b> 24시간·7일·30일 예측 대신 다음 100만 단위(예: 1,000만)를 ④ 1일 추세로 봅니다. 최근 하루 증가량이 하루마다 몇 %씩 줄어드는지를 이어 붙여 며칠 뒤 넘을지 세고, 1주 ~ 8주로 보여 줍니다.</li>'
      + '<li><b>100만 단위 돌파</b> 조회수 100만 안팎 이상인 영상이 다음 100만을 언제 넘을지 모은 탭입니다. 탭의 숫자는 8주 안에 넘을 것으로 보이는 영상 수입니다. 기록이 2일이 안 된 영상은 줄어드는 비율을 아직 몰라 지금 속도 그대로 계산합니다.</li>'
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
    var B = board(), n8 = B.filter(in8).length, ms = rv === 'ms';
    $('vr-tb').innerHTML = '예측 조회수'; $('vr-msb').innerHTML = '100만 단위 돌파<b>' + n8 + '</b>';
    [['vr-tb', !ms], ['vr-msb', ms]].forEach(function(x){ $(x[0]).classList.toggle('on', x[1]); $(x[0]).setAttribute('aria-selected', String(x[1])); });
    $('vr-cap').innerHTML = ms
      ? '조회수 100만 안팎 이상인 영상이 <b>다음 100만 단위를 언제 넘을지</b>입니다. 게시 15일 뒤 영상은 ④ 1일 추세, 그 전 영상은 초기 예측 곡선으로 계산하고 빨리 넘는 순으로 보여 줍니다.'
      : '영상마다 <b>1주 뒤 예상 조회수</b>입니다. 앞으로 1주 동안 가장 많이 늘 것으로 보이는 순서입니다.';
    $('vc-wrap').hidden = ms; $('mb').hidden = !ms;
    if (ms){ renderBoard(B); return; }
    var L = list().sort(function(a, b){ var x = week1(a).gain, y = week1(b).gain; return (y == null ? -1 : y) - (x == null ? -1 : x); }).slice(0, 12);
    $('vc-row').innerHTML = L.map(function(v){ return card(v); }).join('') || '<p class="anote">해당하는 영상이 없습니다.</p>';
    $('vc-row').scrollLeft = 0; navState();
  }
  function wTag(o){ return o.kind === 'est' ? '<i class="vk vk-est">추정</i>' : o.kind === 'wait' ? '<i class="vk vk-wait">수집 중</i>' : ''; }
  // 상단 영상 카드: 썸네일(+ 곧 N00만) · 1주 뒤 예상 · 제목 · 게시 후 지난 시간만
  function card(v){
    var w = week1(v), s = soon(v);
    return '<button type="button" class="vc' + (v === sel ? ' on' : '') + '" data-vid="' + esc(v.id) + '" aria-pressed="' + (v === sel) + '">'
      + '<span class="vc-th">' + thumb(v) + (s ? '<span class="vc-ms">곧 ' + fmtM(s.M) + '</span>' : '') + '</span>'
      + '<span class="vc-g"><b>' + (w.gain == null ? '—' : '+' + fmt(w.gain)) + '</b><small>1주 뒤 예상</small></span>'
      + '<span class="vc-t">' + esc(v.title) + '</span>'
      + '<span class="vc-m">' + ageTxt(age(v)) + ' 전</span></button>';
  }
  // 100만 단위 돌파 목록: 지난 100만 → 다음 100만 진행 막대, 넘는 때. 8주 안에 넘는 영상은 강조
  function renderBoard(B){
    $('mb').innerHTML = '<div class="mb-sum"><span><b>' + B.length + '</b>편 · 조회수 100만 안팎 이상</span><span><b>' + B.filter(in8).length + '</b>편 · 8주 안에 다음 100만 돌파 예상</span></div>'
      + (B.length ? '<div class="mb-list">' + B.map(mbRow).join('') + '</div>' : '<p class="anote">조회수 100만 안팎 이상인 영상이 없습니다.</p>');
  }
  // 100만 단위 목록 한 줄
  //   왼쪽: 제목 / 구간(지금 → 목표)   오른쪽: 목표까지 / N만 남음   아래(두 칸 걸침): 달성까지 며칠
  function mbRow(x){
    var v = x.v, ok = in8(x);
    var left = Math.max(0, x.M - x.V), leftTxt = left < 1e4 ? full(left) + '회' : fmtM(left);
    var foot;
    if (x.eta == null) foot = x.why === 'far' ? '지금 추세로는 ' + fmtM(x.M) + ' 달성이 어렵습니다' : '기록이 조금 더 쌓이면 달성 예상일이 나옵니다';
    else foot = '<b>' + (x.eta < 1 ? '하루 안' : '약 ' + Math.ceil(x.eta) + '일 뒤') + '</b> ' + fmtM(x.M) + ' 달성 예상 · ' + dday(v, x.eta * 24) + ' 무렵'
      + (ok ? '' : ' <span class="mb-far">8주 넘게</span>');
    // 아래 줄 오른쪽: 추이 (현황 칸의 추이와 같은 기준 — 최근 24시간 증가가 채널 영상 중 몇 번째인지)
    var tr = trend(v), trTxt = !tr ? '' : '<span class="mb-tr ' + tr.lv.c + '" title="최근 24시간 증가 채널 ' + tr.rank + '위 / ' + tr.n + '편">추이'
      + '<svg viewBox="0 0 13 10" aria-hidden="true">' + [0, 1, 2].map(function(k){
          return '<rect x="' + k * 4.5 + '" y="' + (6 - k * 3) + '" width="3.5" height="' + (4 + k * 3) + '" rx="1"' + (k < 3 - TREND.indexOf(tr.lv) ? ' class="on"' : '') + '/>';
        }).join('') + '</svg><b>' + tr.lv.t + '</b></span>';
    return '<button type="button" class="mb-r' + (ok ? ' in' : '') + (v === sel ? ' on' : '') + '" data-vid="' + esc(v.id) + '" data-go="1">'
      + '<span class="mb-th">' + thumb(v) + '</span>'
      + '<span class="mb-b"><span class="mb-t">' + esc(v.title) + '</span>'
      + '<span class="mb-now">구간 <b>' + fmt(x.V) + '</b><i>→</i><b class="to">' + fmtM(x.M) + '</b></span></span>'
      + '<span class="mb-e"><small>' + fmtM(x.M) + '까지</small><span class="mb-left"><b>' + leftTxt + '</b><em>남음</em></span></span>'
      + '<span class="mb-f"><span class="mb-ft">' + foot + '</span>' + trTxt + '</span></button>';
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
        + '<td class="n">' + (ts === 'gain' ? i + 1 : '') + '</td>'
        + '<td class="v"><button type="button" class="vt-v" data-vid="' + esc(v.id) + '" data-go="1"><span class="vs-th">' + thumb(v) + '</span>'
        + '<span class="vt-vt"><b>' + esc(v.title) + '</b><small><span class="vt-dt">' + ymd(v.pub) + (v.dur ? ' · ' + fmtDur(v.dur) : '') + '</span>'
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
      + '</div>' : '') + '<span>' + (u === 'q' ? '최근 ' + sp + '시간' : UNITS[u].range) + ' · 막대에 마우스를 올리거나 꾹 누르면 수치가 보입니다</span></div>'
      + '<div class="vt-hc">' + barChart(v, u, sp, Math.max(320, Math.min(900, box.clientWidth || 700)), 160) + '</div>'
      + '<p class="gnote">막대 하나가 ' + UNITS[u].per + ' 는 조회수입니다. 기록 간격이 긴 구간은 그 사이를 고르게 나눠 그리고, 유튜브가 조회수를 묶어서 갱신해 한 번씩 튀어도 정상입니다.</p>';
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
  function barChart(v, u, span, W, H){
    var U = UNITS[u], a = age(v), nowMs = v.pub + a * 3600e3, L = 46, R = 10, Tp = 24, B = 22, slots = [];
    // 칸 수는 고른 기간 그대로 (15분 24시간 96칸 · 1시간 168칸 · 1일 30칸 · 1주일 12칸). 새 영상도 막대가 뚱뚱해지지 않게 게시 전 칸은 비워 둔다
    var N = Math.round((span || U.span) / U.step), st0 = floorSlot(nowMs - (N - 1) * U.step * 3600e3, u);
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
      var y0 = Y(x), w = Math.max(1, bw * 0.78);
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
  // 다른 영상들의 비율을 점으로 늘어놓고(세로선은 보통값) 이 영상을 분홍 점으로
  function strip(x, arr){
    if (arr.length < 3) return '';
    var all = arr.concat([x]), mn = Math.min.apply(null, all), w = Math.max.apply(null, all) - mn || 1;
    function P(y){ return ((y - mn) / w * 100).toFixed(1) + '%'; }
    return '<span class="vd-strip" title="점: 채널의 다른 영상 · 세로선: 보통 · 분홍: 이 영상">'
      + arr.map(function(y){ return '<i style="left:' + P(y) + '"></i>'; }).join('')
      + '<i class="md" style="left:' + P(q(arr, 0.5)) + '"></i><b style="left:' + P(x) + '"></b></span>';
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
      + '<b>' + tr.lv.t + '</b><small>최근 24시간 +' + fmt(tr.g.x) + (tr.g.kind === 'est' ? ' (추정)' : tr.g.kind === 'pred' ? ' (예측)' : '') + '</small>'
      + '<div class="vd-trm" aria-hidden="true">' + TREND.slice().reverse().map(function(t){ return '<i class="' + t.c + (t === tr.lv ? ' on' : '') + '">' + t.t + '</i>'; }).join('') + '</div></div>';
  }
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
      + '<div class="vd-stats">'
      + tile('조회수', rank(V, pv), fmt(V), full(V) + '회' + (pv.length >= 3 ? ' · 같은 시점 보통 ' + fmt(q(pv, 0.5)) : ''), spark(v, a))
      + (L == null ? tile('좋아요', '', '숨김', '좋아요 수를 공개하지 않은 영상', '')
         : tile('좋아요', rank(L / V, pl), full(L), '조회수의 ' + pct(L / V, 1) + (pl.length >= 3 ? ' · 보통 ' + pct(q(pl, 0.5), 1) : ''), strip(L / V, pl)))
      + trendTile(tr)
      + (C == null ? tile('댓글', '', '꺼짐', '댓글을 막아 둔 영상', '')
         : tile('댓글', rank(C / V, pc), full(C), '조회수의 ' + pct(C / V, 2) + (pc.length >= 3 ? ' · 보통 ' + pct(q(pc, 0.5), 2) : ''), strip(C / V, pc)))
      + '</div></div>'
      + '<div class="vd-pred' + (late(v) ? ' late' : '') + '" id="vd-pred"><div class="vd-ph">' + (late(v)
        ? '<h4>100만 단위 돌파 예측</h4><span class="vd-lt" style="--mc:' + LT.color + '"><i>' + LT.b + '</i>' + LT.name + ' · 게시 15일 뒤부터</span></div>'
        : '<h4>예측 현황</h4><div class="vd-mt" role="tablist" aria-label="예측 방법">'
      + ORDER.map(function(k){ var m = ALLM[k];
          return '<button type="button" role="tab" data-mi="' + k + '" class="' + (k === mi ? 'on' : '') + '" aria-selected="' + (k === mi) + '" style="--mc:' + m.color + '"><i>' + m.b + '</i>' + m.tab + '</button>';
        }).join('') + '</div></div>')
      + '<p class="vd-md" id="vd-md"></p><div class="vd-hs" id="vd-hs"></div><div id="vd-ex"></div></div>'
      + '<div class="vd-chart" id="vd-chart"></div>';
    renderPred();
  }

  function msPill(v){
    if (late(v)){
      var P = plan(v), M0 = P && P.ms[0];
      return M0 && VE.likely(M0) ? '<span class="vp-ms" title="④ 1일 추세 · ' + daysTxt(M0.days) + ' 뒤">' + fmtM(M0.M) + ' 돌파 유력 · ' + M0.week + '주 차</span>' : '';
    }
    var m = milestone(v); if (m.h == null) return '';
    return '<span class="vp-ms" title="' + (m.how === 'rate' ? '최근 24시간 속도가 이어진다면' : m.how === 'lt' ? '④ 장기 추세 기준' : '종합 예측 곡선 기준') + '">' + fmtM(m.M) + ' 돌파 예상 · '
      + (m.h < 1 ? '1시간 안' : '약 ' + ageTxt(m.h) + ' 뒤') + '</span>';
  }

  function renderPred(){
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
    if (!UNITS[cm]){ if (late(sel)) msChart(); else cumChart(); return; }
    var U = UNITS[cm];
    box.innerHTML = chHead('조회수 증가', U.range + ' · 막대 하나가 ' + U.per + ' 는 조회수 · 막대에 마우스를 올리거나 꾹 누르면 수치')
      + '<div class="vt-hc">' + barChart(sel, cm, U.span, Math.max(320, Math.min(860, (box.clientWidth || 760) - 28)), 240) + '</div>'
      + '<p class="gnote">기록 간격이 긴 구간은 그 사이를 고르게 나눠 그립니다. 유튜브가 조회수를 묶어서 갱신해 한 번씩 튀어도 정상입니다.</p>';
  }
  function chHead(t, sub){
    return '<div class="vd-ch"><h4>' + t + '</h4><span>' + sub + '</span><div class="seg vd-cm" role="tablist" aria-label="그래프 종류">'
      + '<button type="button" data-cm="cum" class="' + (!UNITS[cm] ? 'on' : '') + '">누적·예측</button>'
      + UORDER.map(function(k){ return '<button type="button" data-cm="' + k + '" class="' + (cm === k ? 'on' : '') + '">' + UNITS[k].tab + '</button>'; }).join('') + '</div></div>';
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
    if (k === 3) return t3 ? '③이 나오는 ' + t3 + '부터' : '세 방법 중 하나라도 나오면';
    return '수집 뒤 올라온 영상 ' + MINPOOL + '개가 모이면 (지금 ' + (pool || 0) + '개)';
  }
  function cumChart(){
    var v = sel, m = ALLM[mi], a = age(v), box = $('vd-chart');
    var W = Math.max(320, Math.min(860, (box.clientWidth || 760) - 28)), H = 300, L = 54, R = 22, Tp = 34, B = 34;
    var xmax = Math.max(720, a * 1.04);
    function X(h){ return L + Math.sqrt(Math.max(0, h) / xmax) * (W - L - R); }
    function Hx(x){ var f = Math.max(0, Math.min(1, (x - L) / (W - L - R))); return f * f * xmax; }
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
    var st = niceStep(ymax * 1.08 / 4), top = Math.ceil(ymax * 1.08 / st) * st;
    function Y(y){ return Tp + (1 - y / top) * (H - Tp - B); }
    var s = '<svg viewBox="0 0 ' + W + ' ' + H + '" role="img" aria-label="조회수 추이와 예측">'
      + '<defs><linearGradient id="vg-a" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#ff4d4f" stop-opacity=".38"/><stop offset="1" stop-color="#ff4d4f" stop-opacity="0"/></linearGradient>'
      + '<linearGradient id="vg-f" x1="0" y1="0" x2="1" y2="0"><stop offset="0" stop-color="' + m.color + '" stop-opacity=".08"/><stop offset="1" stop-color="' + m.color + '" stop-opacity=".3"/></linearGradient>'
      + '<pattern id="vg-h" width="7" height="7" patternUnits="userSpaceOnUse" patternTransform="rotate(45)"><rect width="7" height="7" fill="rgba(255,255,255,.015)"/><line x1="0" y1="0" x2="0" y2="7" stroke="rgba(255,255,255,.07)" stroke-width="2"/></pattern></defs>';
    for (var y = 0; y <= top + 1e-9; y += st)
      s += '<line x1="' + L + '" x2="' + (W - R) + '" y1="' + Y(y).toFixed(1) + '" y2="' + Y(y).toFixed(1) + '" stroke="rgba(255,255,255,' + (y ? .07 : .18) + ')"/>'
        + '<text x="' + (L - 8) + '" y="' + (Y(y) + 4).toFixed(1) + '" text-anchor="end" font-size="11" fill="#8e8e93">' + fmt(y) + '</text>';
    var lastX = -99;
    [1, 6, 24, 72, 168, 336, 720, 1440, 2160, 2880, 4320, 8760, 17520, 26280, 35040, 43800].forEach(function(h){
      if (h > xmax || X(h) - lastX < 42) return; lastX = X(h);
      s += '<text x="' + X(h).toFixed(1) + '" y="' + (H - B + 19) + '" text-anchor="middle" font-size="11" fill="#8e8e93">' + hLab(h) + '</text>';
    });
    // 목표 시점 세로선
    TARGETS.forEach(function(tg){
      s += '<line x1="' + X(tg.T).toFixed(1) + '" x2="' + X(tg.T).toFixed(1) + '" y1="' + (Tp - 6) + '" y2="' + (H - B) + '" stroke="rgba(255,255,255,.14)" stroke-dasharray="3 5"/>'
        + '<text x="' + X(tg.T).toFixed(1) + '" y="' + (Tp - 12) + '" text-anchor="middle" font-size="11" font-weight="700" fill="#aeaeb2">' + tg.name + '</text>';
    });
    // 수집을 시작하기 전 구간 (기록 없음) — 빗금으로 표시
    var sb = Math.min(VE.since(v), xmax);
    if (sb > 0){
      var bw = X(sb) - L;
      s += '<rect x="' + L + '" y="' + Tp + '" width="' + bw.toFixed(1) + '" height="' + (H - Tp - B) + '" fill="url(#vg-h)"/>'
        + (bw > 150 ? '<text x="' + (L + bw / 2).toFixed(1) + '" y="' + (Tp + (H - Tp - B) / 2 - 4).toFixed(1) + '" text-anchor="middle" font-size="12" font-weight="700" fill="#8e8e93">수집 시작 전 · 기록 없음</text>'
          + '<text x="' + (L + bw / 2).toFixed(1) + '" y="' + (Tp + (H - Tp - B) / 2 + 14).toFixed(1) + '" text-anchor="middle" font-size="11" fill="#6e6e73">'
          + (DATA.since ? when(Date.parse(DATA.since)) + '부터 기록 · ' : '') + '유튜브는 지난 기록을 주지 않습니다</text>' : '');
    }
    // 실제 추이 (면 + 선)
    var pts = v.vs.snaps.filter(function(p){ return p[0] <= xmax; }), s0 = VE.since(v);       // 15분 간격 값까지 써서 촘촘하게. 게시 직후 기록이 없으면 기록 시작점부터
    var line = s0 ? '' : 'M' + X(0).toFixed(1) + ' ' + Y(0).toFixed(1);
    pts.forEach(function(p, i){ line += (line ? ' L' : 'M') + X(p[0]).toFixed(1) + ' ' + Y(p[1]).toFixed(1); });
    s += '<path d="' + line + ' L' + X(pts[pts.length - 1][0]).toFixed(1) + ' ' + Y(0).toFixed(1) + ' L' + X(s0 ? pts[0][0] : 0).toFixed(1) + ' ' + Y(0).toFixed(1) + ' Z" fill="url(#vg-a)"/>'
      + '<path d="' + line + '" fill="none" stroke="#ff4d4f" stroke-width="2.6" stroke-linejoin="round" stroke-linecap="round"/>';
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
    // 지금
    s += '<line x1="' + X(a).toFixed(1) + '" x2="' + X(a).toFixed(1) + '" y1="' + Tp + '" y2="' + (H - B) + '" stroke="#ff4d4f" stroke-opacity=".5" stroke-dasharray="2 4"/>'
      + '<circle cx="' + X(a).toFixed(1) + '" cy="' + Y(V0).toFixed(1) + '" r="5.5" fill="#ff4d4f" stroke="#1c1c1e" stroke-width="2"/>';
    // 마우스 따라가는 선과 점
    s += '<line id="vd-cx" y1="' + Tp + '" y2="' + (H - B) + '" stroke="rgba(255,255,255,.45)" stroke-width="1" style="display:none"/>'
      + '<circle id="vd-cd" r="5" stroke="#1c1c1e" stroke-width="2" style="display:none"/></svg>';
    box.innerHTML = chHead('조회수 추이와 예측', m.tab + ' 기준 · 가로축은 게시 후 시간 (초반을 넓게 보는 눈금)')
      + s + '<div class="vd-tip" id="vd-tip" hidden></div>'
      + '<div class="vd-key"><span><i class="k-a"></i>실제 조회수</span>'
      + (knots.length > 1 ? '<span style="--mc:' + m.color + '"><i class="k-p"></i>예측</span><span style="--mc:' + m.color + '"><i class="k-r"></i>80% 범위</span>' : '')
      + (past.length ? '<span><i class="k-d"></i>예측 포인트</span>' : '')
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
    var svg = box.querySelector('svg'), tip = $('vd-tip'), cx = svg.querySelector('#vd-cx'), cd = svg.querySelector('#vd-cd');
    function hide(){ tip.hidden = true; cx.style.display = cd.style.display = 'none'; }
    function move(e){
      var rc = svg.getBoundingClientRect(), bx = box.getBoundingClientRect(), x = (e.clientX - rc.left) * W / rc.width;
      if (x < L - 4 || x > W - R + 4){ hide(); return; }
      var h = Hx(x), val = valAt(h);
      if (!val){ hide(); return; }
      var yv = val.act != null ? val.act : val.p, sx = X(h), sy = Y(yv);
      cx.setAttribute('x1', sx); cx.setAttribute('x2', sx); cx.style.display = '';
      cd.setAttribute('cx', sx); cd.setAttribute('cy', sy); cd.setAttribute('fill', val.act != null ? '#ff4d4f' : m.color); cd.style.display = '';
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
        + '<span class="vm-acc">' + (s.n ? '7일 예측 ' + (s.hits ? '<b>적중 ' + pct(s.hit) + '</b> · ' : '') + '<b>오차 ' + pct(s.mape) + '</b>' : '7일 예측 기록 없음') + '<em>이 방법으로 보기 →</em></span>'
        + '</button>';
    }).join('')
      + (function(){
        var rs = []; VIDEOS.forEach(function(v){ (v.ms || []).forEach(function(m){ var r = msResult(v, m); if (r.done) rs.push(r); }); });
        return '<div class="vm lt" style="--mc:' + LT.color + '"><span class="vm-h"><span class="vp-no">' + LT.b + '</span><b>' + LT.name + '</b><small>게시 15일 뒤부터</small></span>'
          + '<span class="vm-d">' + LT.desc + '</span>'
          + '<span class="vp-tags">' + LT.uses.map(function(u){ return '<span>' + u + '</span>'; }).join('') + '</span>'
          + '<span class="vm-pc"><span class="p">' + LT.pro + '</span><span class="c">' + LT.con + '</span></span>'
          + '<span class="vm-acc">' + (rs.length ? '100만 돌파 예측 <b>범위 안 ' + pct(rs.filter(function(r){ return r.cls === 'hit'; }).length / rs.length) + '</b> · ' + rs.length + '개 결과' : '100만 돌파 예측 결과 아직 없음') + '</span></div>';
      })();
  }

  // ----- 예측 성적표 -----
  function scoreSeg(){
    return '<div class="seg vs-seg" role="tablist" aria-label="성적표 목표">' + TARGETS.map(function(x, k){
        return '<button type="button" role="tab" data-si="' + k + '" class="' + (k === si ? 'on' : '') + '" aria-selected="' + (k === si) + '">' + x.from + ' → ' + x.name + '</button>';
      }).join('') + '<button type="button" role="tab" data-si="3" class="' + (si === 3 ? 'on' : '') + '" aria-selected="' + (si === 3) + '">100만 단위 예측 확인</button></div>';
  }
  function renderScore(){
    if (si === 3){ renderMsScore('<div class="vs-top"><p>게시 15일이 지난 영상의 <b>다음 100만 단위 돌파</b> 예측이 맞았는지 봅니다.</p>' + scoreSeg() + '</div>'); return; }
    var tg = TARGETS[si], tr = track(si), best = -1, bm = Infinity;
    tr.sum.forEach(function(s, k){ if (k < 3 && s.n && s.mape < bm){ bm = s.mape; best = k; } });
    var h = '<div class="vs-top"><p>게시 <b>' + tg.from + '</b> 뒤에 한 <b>' + tg.name + '</b> 조회수 예측이 실제와 얼마나 맞았는지 봅니다.</p>'
      + scoreSeg() + '</div>'
      + '<div class="vs-cards">' + ORDER.map(function(k){
          var s = tr.sum[k], m = ALLM[k];
          return '<div class="vs-c' + (k === best ? ' best' : '') + '" style="--mc:' + m.color + '">'
            + '<div class="vs-ch"><span class="vp-no">' + m.b + '</span>' + m.tab + (k === best ? '<em>가장 정확</em>' : '') + '</div>'
            + '<div class="vs-row"><span>범위 적중률</span><b>' + (s.hits ? pct(s.hit) : '—') + '</b></div>'
            + '<div class="vs-bar"><i style="width:' + (s.hits ? s.hit * 100 : 0).toFixed(0) + '%"></i></div>'
            + '<div class="vs-row"><span>평균 오차</span><b>' + (s.n ? pct(s.mape) : '—') + '</b></div>'
            + '<div class="vs-bar err"><i style="width:' + (s.n ? Math.min(100, s.mape / 0.3 * 100) : 0).toFixed(0) + '%"></i></div>'
            + '<small>' + (s.n ? s.n + '개 영상에서 확인' : '아직 결과가 없습니다') + '</small></div>';
        }).join('') + '</div>';
    if (!tr.rows.length){ $('vs').innerHTML = h + '<p class="anote">아직 비교할 예측이 없습니다.</p>'; return; }
    // 열: 영상 · ① 기준 당시(예측을 만든 때) 조회수 · ② 목표 시 실제 조회수 · ③ 예측(종합, 누르면 방법별 3개) · ④ 오차
    var row = function(r){
      var p = r.pr[3], x = r.res[3], base = at(r.v, tg.c, 1), open = !!SOPEN[r.v.id + '|' + si];
      var errCell = !r.done ? '<span class="vs-err vs-wait"><b>' + ageTxt(tg.T - age(r.v)) + '</b><small>뒤 채점</small></span>'
        : !x ? '—' : '<span class="vs-err' + (x.hit == null ? '' : x.hit ? ' hit' : ' miss') + '"><b>' + signPct(x.err) + '</b>'
          + (x.hit == null ? '' : '<small>' + (x.hit ? '✓ 범위 안' : '✗ 범위 밖') + '</small>') + '</span>';
      var h1 = '<tr class="vs-r' + (r.v === sel ? ' on' : '') + (open ? ' open' : '') + '">'
        + '<td><button type="button" class="vs-v" data-vid="' + esc(r.v.id) + '"><span class="vs-th">' + thumb(r.v) + '</span>' + esc(r.v.title) + '</button></td>'
        + '<td class="num">' + (base == null ? '—' : fmt(base)) + '</td>'
        + '<td class="num">' + (r.done ? '<b>' + fmt(r.act) + '</b>' : '<span class="vs-wait">아직</span>') + '</td>'
        + '<td class="num"><button type="button" class="vs-px" data-sx="' + esc(r.v.id) + '" aria-expanded="' + open + '" title="방법별 예측 보기">'
        + '<span class="vp-no" style="--mc:' + ALL.color + '">' + ALL.b + '</span><b class="vs-pv">' + (p ? fmt(p.p) : '—') + '</b>'
        + '<svg viewBox="0 0 24 24"><path d="M6 9l6 6 6-6" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"/></svg></button></td>'
        + '<td class="num">' + errCell + '</td></tr>';
      var h2 = '<tr class="vs-sub"' + (open ? '' : ' hidden') + '><td colspan="5"><div class="vs-ms">' + [0, 1, 2].map(function(k){
          var q2 = r.pr[k], y = r.res[k], m = METHODS[k];
          return '<div class="vs-m' + (q2 ? '' : ' off') + '" style="--mc:' + m.color + '"><span class="vp-no">' + m.b + '</span><b>' + m.tab + '</b>'
            + '<em>' + (q2 ? fmt(q2.p) : '예측 없음') + '</em>'
            + (y ? '<span class="vs-err' + (y.hit == null ? '' : y.hit ? ' hit' : ' miss') + '">' + signPct(y.err) + (y.hit == null ? '' : y.hit ? ' ✓' : ' ✗') + '</span>' : '') + '</div>';
        }).join('') + '</div></td></tr>';
      return h1 + h2;
    };
    h += '<div class="atab-w"><table class="atab vs-tab"><thead><tr><th>영상</th>'
      + '<th class="num">기준 당시 조회수</th>'
      + '<th class="num">목표 시 실제 조회수</th>'
      + '<th class="num">예측</th>'
      + '<th class="num">오차</th>'
      + '</tr></thead><tbody>' + tr.rows.slice(0, 15).map(row).join('') + '</tbody></table></div>'
      + '<p class="gnote">기준 당시 조회수는 예측을 만든 때(게시 ' + tg.from + ' 뒤), 목표 시 실제 조회수는 게시 ' + tg.name + ' 뒤의 조회수입니다. '
      + '예측은 기준 당시까지 있던 기록만으로 계산했고, 예측 값을 누르면 세 방법의 예측이 따로 나옵니다. '
      + '오차가 + 이면 실제보다 높게, − 이면 낮게 예측한 것입니다. ✓ 는 실제 조회수가 80% 범위 안에 들어온 경우입니다.</p>';
    $('vs').innerHTML = h;
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
    renderVideo(); renderScore();
  }
  el.addEventListener('click', function(e){
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
    var rvb = e.target.closest('[data-rv]');
    if (rvb){ rv = rvb.getAttribute('data-rv'); renderRank(); return; }
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
    var sx = e.target.closest('[data-sx]');
    if (sx){ var sk = sx.getAttribute('data-sx') + '|' + si; SOPEN[sk] = !SOPEN[sk]; renderScore(); return; }
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
  document.addEventListener('contextmenu', function(e){ if (e.target.closest && e.target.closest('.vh-svg')) e.preventDefault(); });
})();
