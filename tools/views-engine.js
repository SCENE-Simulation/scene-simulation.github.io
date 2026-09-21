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
    { key: 'm1', point: function(v, t, T, pool){
        var x = at(v, t, 1), r = ratios(pool, function(p){ var a = at(p, t, 1); return a > 0 ? at(p, T, 1) / a : null; });
        return x > 0 && r.length ? x * q(r, 0.5) : null;
      } },
    // ② 참여도 환산법: 좋아요 환산 = L(t) × 중앙값[ Vᵢ(T) ÷ Lᵢ(t) ], 댓글 환산 = C(t) × 중앙값[ Vᵢ(T) ÷ Cᵢ(t) ]
    //    예측 = 좋아요 환산^⅔ × 댓글 환산^⅓ (댓글이 없으면 좋아요만)
    { key: 'm2', point: function(v, t, T, pool){
        var l = at(v, t, 2), c = at(v, t, 3);
        var rl = ratios(pool, function(p){ var a = at(p, t, 2); return a > 0 ? at(p, T, 1) / a : null; });
        var rc = ratios(pool, function(p){ var a = at(p, t, 3); return a > 0 ? at(p, T, 1) / a : null; });
        if (!(l > 0) || !rl.length) return null;
        var byL = l * q(rl, 0.5);
        if (!(c > 0) || !rc.length) return byL;
        return Math.pow(byL, 2 / 3) * Math.pow(c * q(rc, 0.5), 1 / 3);
      } },
    // ③ 추세 곡선 외삽법: b = [ V(t) − V(t/2) ] ÷ ln[ (1+t) ÷ (1+t/2) ], 예측 = V(t) + b × ln[ (1+T) ÷ (1+t) ]
    { key: 'm3', point: function(v, t, T){
        var a = at(v, t, 1), h = at(v, t / 2, 1);
        if (!(a > 0) || h == null || t < 1) return null;
        var b = (a - h) / Math.log((1 + t) / (1 + t / 2));
        return Math.max(a, a + b * Math.log((1 + T) / (1 + t)));
      } }
  ];

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

  var E = { TARGETS: TARGETS, MINPOOL: MINPOOL, EARLY: EARLY, q: q, mean: mean, at: at, age: age, since: since,
    poolFor: poolFor, METHODS: METHODS, predictAll: predictAll };
  if (typeof module === 'object' && module.exports) module.exports = E; else root.VE = E;
})(this);
