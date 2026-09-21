// 조회수 예측 엔진 — 사이트(views.js)와 수집기(collect-views.js)가 같이 쓴다
// 브라우저에서는 window.VE, Node 에서는 require('./views-engine.js')
//
// 영상 v: { pub: 게시 시각(ms), type: 'long'|'short'|'live', snaps: [[게시 후 시간(h), 조회수, 좋아요, 댓글], ...] }
// 좋아요·댓글이 숨겨진 영상은 그 자리가 null 이다.
(function(root){
  // 예측 목표. c: 이 목표를 트래킹할 때 예측을 만드는 시점(게시 후 시간)
  var TARGETS = [
    { T: 24, c: 6, name: '24시간', from: '6시간' },
    { T: 168, c: 24, name: '7일', from: '24시간' },
    { T: 720, c: 168, name: '30일', from: '7일' }
  ];
  var MINPOOL = 5;                     // 과거 영상이 이보다 적으면 예측하지 않는다
  var EARLY = 2;                       // 첫 기록이 게시 후 이 시간 안이면 게시 순간(0)부터 이어 본다
  var M3MIN = 0.75;                    // ③ 은 지나온 시간의 4분의 1 이상을 기록으로 봤을 때만

  function q(a, p){
    var s = a.slice().sort(function(x, y){ return x - y; }); if (!s.length) return NaN;
    var i = (s.length - 1) * p, lo = Math.floor(i), hi = Math.ceil(i);
    return s[lo] + (s[hi] - s[lo]) * (i - lo);
  }
  function mean(a){ return a.reduce(function(x, y){ return x + y; }, 0) / a.length; }

  // 게시 후 t시간의 값(기록 사이는 직선으로 잇는다). k: 1 조회수, 2 좋아요, 3 댓글.
  // 기록보다 뒤이거나, 수집을 시작하기 전(첫 기록이 게시 직후가 아닌 영상의 그 앞)이면 null
  function at(v, t, k){
    var s = v.snaps;
    if (!s.length || t > s[s.length - 1][0] + 1e-6) return null;
    if (t <= s[0][0]){
      if (s[0][k] == null) return null;
      if (s[0][0] <= EARLY) return s[0][0] > 0 ? s[0][k] * t / s[0][0] : s[0][k];
      return t >= s[0][0] - 1e-6 ? s[0][k] : null;
    }
    var lo = 1, hi = s.length - 1;                                                  // s[i][0] >= t 인 첫 i (이진 탐색)
    while (lo < hi){ var mid = (lo + hi) >> 1; if (s[mid][0] >= t) hi = mid; else lo = mid + 1; }
    var a = s[lo - 1], b = s[lo], f = (t - a[0]) / (b[0] - a[0] || 1);
    if (a[k] == null || b[k] == null) return null;
    return a[k] + (b[k] - a[k]) * f;
  }
  function age(v){ return v.snaps.length ? v.snaps[v.snaps.length - 1][0] : 0; }
  // 이 영상의 기록이 시작된 시점 (게시 직후부터 모았으면 0)
  function since(v){ return !v.snaps.length ? Infinity : v.snaps[0][0] <= EARLY ? 0 : v.snaps[0][0]; }
  // v 를 게시 t시간 뒤에 예측할 때 쓸 과거 영상: 같은 종류이고, 기준 시각(ms)까지 목표 T 에 이미 도달했고,
  // t 시점 기록이 있는 다른 영상
  function poolFor(videos, v, T, whenMs, t){
    return videos.filter(function(i){
      return i !== v && (i.type || 'long') === (v.type || 'long') && age(i) >= T && i.pub + T * 3600e3 <= whenMs + 1 && since(i) <= t;
    });
  }

  // ---------- 예측 방법 ----------
  // point(v, t, T, pool): 게시 t시간 뒤까지의 기록으로 T시간 조회수를 예측한 값
  function ratios(pool, f){ var r = []; pool.forEach(function(p){ var x = f(p); if (x != null && isFinite(x) && x > 0) r.push(x); }); return r; }
  var METHODS = [
    // ① 초기 속도 배수법: 예측 = V(t) × 중앙값[ Vᵢ(T) ÷ Vᵢ(t) ]
    { key: 'm1', pool: true, point: function(v, t, T, pool){
        var x = at(v, t, 1), r = ratios(pool, function(p){ var a = at(p, t, 1); return a > 0 ? at(p, T, 1) / a : null; });
        return x > 0 && r.length ? x * q(r, 0.5) : null;
      } },
    // ② 참여도 환산법: 좋아요 환산 = L(t) × 중앙값[ Vᵢ(T) ÷ Lᵢ(t) ], 댓글 환산 = C(t) × 중앙값[ Vᵢ(T) ÷ Cᵢ(t) ]
    //    예측 = 좋아요 환산^⅔ × 댓글 환산^⅓ (댓글이 없으면 좋아요만)
    { key: 'm2', pool: true, point: function(v, t, T, pool){
        var l = at(v, t, 2), c = at(v, t, 3);
        var rl = ratios(pool, function(p){ var a = at(p, t, 2); return a > 0 ? at(p, T, 1) / a : null; });
        var rc = ratios(pool, function(p){ var a = at(p, t, 3); return a > 0 ? at(p, T, 1) / a : null; });
        if (!(l > 0) || !rl.length) return null;
        var byL = l * q(rl, 0.5);
        if (!(c > 0) || !rc.length) return byL;
        return Math.pow(byL, 2 / 3) * Math.pow(c * q(rc, 0.5), 1 / 3);
      } },
    // ③ 추세 곡선 외삽법: b = [ V(t) − V(s) ] ÷ ln[ (1+t) ÷ (1+s) ], 예측 = V(t) + b × ln[ (1+T) ÷ (1+t) ]
    //    s 는 보통 t/2. 게시 직후부터 기록하지 못한 영상은 기록 시작점부터 (단 s ≤ t × M3MIN 일 때만 — 너무 짧은 구간은 흔들린다)
    //    과거 영상이 필요 없어 수집 초기에도 나온다
    { key: 'm3', point: function(v, t, T){
        var s = Math.max(t / 2, since(v));
        if (t < 1 || s > t * M3MIN) return null;
        var a = at(v, t, 1), h = at(v, s, 1);
        if (!(a > 0) || h == null) return null;
        var b = (a - h) / Math.log((1 + t) / (1 + s));
        return Math.max(a, a + b * Math.log((1 + T) / (1 + t)));
      } }
  ];
  // ③ 을 쓸 수 있으려면 게시 t시간 째여야 하는지 (기록 시작 s 에 대해 t ≥ s ÷ M3MIN)
  function m3From(v){ return since(v) / M3MIN; }

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
  // 과거 영상이 MINPOOL 개보다 적으면 과거 영상과 비교하는 ①·② 는 내지 않는다 (③ 은 범위 없이 낸다)
  function predictAll(v, t, T, pool){
    var out = METHODS.map(function(m){
      if (m.pool && pool.length < MINPOOL) return null;
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

  // ---------- ④ 1일 추세 (게시 15일 뒤부터): 다음 100만 단위까지 며칠 ----------
  // 간단하게 1일 단위로 본다:
  //   g: 최근 하루(24시간) 증가 (기록이 하루가 안 되면 있는 만큼으로 하루치 환산, 3시간 이상일 때)
  //   r: 하루 증가가 하루마다 몇 배가 되는지 — 최근 최대 7일을 앞·뒤 반으로 나눠 하루 증가를 비교 (기록 2일 이상일 때, 0.85 ~ 1)
  //      기록이 모자라면 r = 1 (지금 속도 그대로)
  //   n일 뒤 누적 = V + g·(r + r² + … + rⁿ)      (r = 1 이면 V + g·n)
  var LATE = 360, MSTEP = 1e6, WEEKS = 8;          // LATE: 게시 15일(360시간) 뒤부터 100만 단위로 본다
  // vs: 조회수만 담은 기록 { snaps: [[h, 조회수], ...] }. h0~h1 사이 하루 평균 증가
  function perDay(vs, h0, h1){ var x0 = at(vs, h0, 1), x1 = at(vs, h1, 1); return x0 == null || x1 == null || h1 - h0 < 1 ? null : (x1 - x0) / (h1 - h0) * 24; }
  function daily(vs, a){
    var s = since(vs), r0 = Math.max(s, a - 24), g = perDay(vs, r0, a), r = 1, src = 'flat';
    if (!(g > 0) || a - r0 < 3) return null;                         // 최근 기록이 3시간은 있어야
    var w0 = Math.max(s, a - 168);
    if (a - w0 >= 48){
      var mid = (w0 + a) / 2, g0 = perDay(vs, w0, mid), g1 = perDay(vs, mid, a);
      if (g0 > 0 && g1 > 0){ r = Math.max(0.85, Math.min(1, Math.pow(g1 / g0, 24 / (mid - w0)))); src = 'data'; }
    }
    return { g: g, r: r, src: src, days: (a - s) / 24 };
  }
  // 지금부터 n일 뒤 누적
  function dayProject(V, g, r, n){ return V + (Math.abs(r - 1) < 1e-9 ? g * n : g * r * (1 - Math.pow(r, n)) / (1 - r)); }
  // M 까지 며칠 (소수). 줄어드는 추세상 영영 못 닿으면 null
  function daysTo(V, M, g, r){
    if (V >= M) return 0;
    if (Math.abs(r - 1) < 1e-9) return (M - V) / g;
    var x = 1 - (M - V) * (1 - r) / (g * r);                        // rⁿ = x
    return x <= 0 ? null : Math.log(x) / Math.log(r);
  }
  // 다음 n개 100만 단위: days = 며칠 뒤(null = 못 닿음), week = 몇 주 차(1~, 8주 넘으면 그대로 큰 수)
  // wk: 1~8주 뒤 예상 누적
  function msPlan(vs, a, n){
    var V = at(vs, a, 1), T = daily(vs, a); if (V == null || !T) return null;
    var out = [], M = (Math.floor(V / MSTEP) + 1) * MSTEP, wk = [];
    for (var i = 0; i < (n || 3); i++, M += MSTEP){
      var d = daysTo(V, M, T.g, T.r);
      out.push({ M: M, days: d, week: d == null ? null : Math.max(1, Math.ceil(d / 7)) });
    }
    for (var w = 1; w <= WEEKS; w++) wk.push(dayProject(V, T.g, T.r, w * 7));
    return { V: V, g: T.g, r: T.r, src: T.src, days: T.days, ms: out, wk: wk };
  }
  // 8주 안에 닿는다고 계산되면 "유력"
  function likely(m){ return m.week != null && m.week <= WEEKS; }

  // ---------- 100만 단위 구간 채점 ----------
  // 구간 = 100만 단위 하나 (예: 1,300만 → 1,400만). 구간마다 세 지점 — 100만·50만·20만 남았을 때(시작 M0, M0+50만, M0+80만) —
  // 을 넘은 순간 ④ 로 구간 끝(M0+100만) 도달을 예측해 고정하고, 실제로 닿은 때와 비교한다 (수집기가 고정, 사이트가 채점).
  // 멀리서 한 예측일수록 오차가 큰 게 정상이라 지점별로 따로 본다. 우하향은 영상마다 r(하루 증가가 하루마다 몇 배)로 반영.
  //   범위: r 을 ±RSPAN 바꿔 본 도달 (빨리 = r + RSPAN, 늦게 = r − RSPAN. 늦게 보면 못 닿으면 hi = null) — 멀리 볼수록 넓어진다
  //   far: FAR 일(8주)보다 멀거나 못 닿는다고 본 예측 — 참고로만 (평균에서 뺀다)
  var SEGK = [0, 5e5, 8e5], RSPAN = 0.03, FAR = 56;
  function segPredict(vs, a, M){
    var V = at(vs, a, 1), T = daily(vs, a); if (V == null || !T) return null;
    var d = daysTo(V, M, T.g, T.r);
    return { d: d, lo: daysTo(V, M, T.g, Math.min(1, T.r + RSPAN)), hi: daysTo(V, M, T.g, Math.max(0.8, T.r - RSPAN)),
      g: T.g, r: T.r, src: T.src, far: d == null || d > FAR };
  }

  var E = { TARGETS: TARGETS, MINPOOL: MINPOOL, EARLY: EARLY, q: q, mean: mean, at: at, age: age, since: since, m3From: m3From,
    poolFor: poolFor, METHODS: METHODS, predictAll: predictAll,
    LATE: LATE, MSTEP: MSTEP, WEEKS: WEEKS, daily: daily, dayProject: dayProject, daysTo: daysTo, msPlan: msPlan, likely: likely,
    SEGK: SEGK, RSPAN: RSPAN, FAR: FAR, segPredict: segPredict };
  if (typeof module === 'object' && module.exports) module.exports = E; else root.VE = E;
})(this);
