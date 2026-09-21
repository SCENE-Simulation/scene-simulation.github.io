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

  // ---------- ④ 장기 추세 (게시 3주 뒤부터): 100만 단위 돌파 예측 ----------
  // 하루 증가량이 나이에 따라 거듭제곱으로 줄어든다고 본다:  d(t) = d × (A / t)^k   (t, A: 게시 후 일수, A 는 지금)
  //   t일째 누적 = V + d·A^k·(t^(1−k) − A^(1−k)) ÷ (1−k)      (k = 1 이면 V + d·A·ln(t/A))
  //   d: 최근 24시간 증가, k: 앞 구간(최대 2주)과 최근 24시간의 하루 증가를 비교해 구한다. 기록이 모자라면 KDEF
  //   범위: k 를 ±KSPAN 바꿔 본 값 (k 가 작을수록 덜 줄어듦 = 빨리 닿음)
  var LATE = 504, MSTEP = 1e6, KDEF = 1, KSPAN = 0.4;
  // vs: 조회수만 담은 기록 { snaps: [[h, 조회수], ...] }. h0~h1 사이 하루 평균 증가
  function perDay(vs, h0, h1){ var x0 = at(vs, h0, 1), x1 = at(vs, h1, 1); return x0 == null || x1 == null || h1 - h0 < 1 ? null : (x1 - x0) / (h1 - h0) * 24; }
  function longTerm(vs, a){
    var s = since(vs), r0 = Math.max(s, a - 24), d = perDay(vs, r0, a), k = null;
    if (!(d > 0) || a - r0 < 3) return null;                         // 최근 기록이 3시간은 있어야
    var o0 = Math.max(s, a - 336), o1 = r0;
    if (o1 - o0 >= 24){
      var d0 = perDay(vs, o0, o1), c0 = (o0 + o1) / 48, c1 = (r0 + a) / 48;
      if (d0 > 0 && c1 > c0) k = Math.log(d0 / d) / Math.log(c1 / c0);
    }
    var src = k != null && isFinite(k) ? 'data' : 'default';
    return { d: d, k: src === 'data' ? Math.max(0.2, Math.min(3, k)) : KDEF, src: src, days: (a - s) / 24 };
  }
  // 지금(a시간, 조회수 V)부터 M 에 닿기까지 몇 시간. 줄어드는 속도상 영영 못 닿으면 null
  function etaH(V, M, a, d, k){
    if (V >= M) return 0;
    var A = a / 24, need = M - V, t;
    k = Math.max(0, k);
    if (Math.abs(k - 1) < 1e-6) t = A * Math.exp(need / (d * A));
    else {
      var x = Math.pow(A, 1 - k) + need * (1 - k) / (d * Math.pow(A, k));
      if (x <= 0) return null;
      t = Math.pow(x, 1 / (1 - k));
    }
    return isFinite(t) && t < A + 3650 ? (t - A) * 24 : null;
  }
  // a 에서 h시간 뒤 누적 조회수
  function project(V, a, d, k, h){
    var A = a / 24, T = (a + h) / 24; k = Math.max(0, k);
    return V + (Math.abs(k - 1) < 1e-6 ? d * A * Math.log(T / A) : d * Math.pow(A, k) * (Math.pow(T, 1 - k) - Math.pow(A, 1 - k)) / (1 - k));
  }
  // 주 단위(1주 ~ 8주)로 본다. 주별로 "그 주까지 M 을 넘을 확률":
  //   k(줄어드는 정도)와 d(하루 증가)가 흔들린다고 보고 — k ~ 정규(k̂, KSD), d ~ 로그정규(DSD) —
  //   격자(−2.5σ ~ +2.5σ, 0.5σ 간격)로 무게를 매겨 넘는 쪽의 비율을 센다. k 를 기본값으로 쓴 경우 흔들림을 더 크게
  var WEEKS = 8, KSD = 0.35, DSD = 0.2, ZS = [-2.5, -2, -1.5, -1, -0.5, 0, 0.5, 1, 1.5, 2, 2.5];
  function probs(V, a, d, k, M, src){
    var ksd = src === 'data' ? KSD : KSD * 1.6, out = [];
    for (var w = 1; w <= WEEKS; w++){
      var h = w * 168, p = 0, t = 0;
      for (var i = 0; i < ZS.length; i++) for (var j = 0; j < ZS.length; j++){
        var wt = Math.exp(-(ZS[i] * ZS[i] + ZS[j] * ZS[j]) / 2);
        if (project(V, a, d * Math.exp(ZS[j] * DSD), Math.max(0, k + ZS[i] * ksd), h) >= M) p += wt;
        t += wt;
      }
      out.push(p / t);
    }
    return out;                                                // [1주까지, 2주까지, …, 8주까지]
  }
  // 다음 n개 100만 단위와 도달 예상
  //   e: 지금부터 [빠르면, 가운데, 늦으면] 몇 시간 뒤 (null = 못 닿음), p: 1~8주까지 넘을 확률
  //   wk: 1~8주 뒤 예상 누적 [빠르면, 가운데, 늦으면]
  function msPlan(vs, a, n){
    var V = at(vs, a, 1), L = longTerm(vs, a); if (V == null || !L) return null;
    var out = [], M = (Math.floor(V / MSTEP) + 1) * MSTEP, wk = [];
    for (var i = 0; i < (n || 3); i++, M += MSTEP)
      out.push({ M: M, e: [etaH(V, M, a, L.d, L.k - KSPAN), etaH(V, M, a, L.d, L.k), etaH(V, M, a, L.d, L.k + KSPAN)], p: probs(V, a, L.d, L.k, M, L.src) });
    for (var w = 1; w <= WEEKS; w++) wk.push([project(V, a, L.d, L.k - KSPAN, w * 168), project(V, a, L.d, L.k, w * 168), project(V, a, L.d, L.k + KSPAN, w * 168)]);
    return { V: V, d: L.d, k: L.k, src: L.src, days: L.days, ms: out, wk: wk };
  }
  // 가능성(8주 안에 넘을 확률): 70% 이상 high, 40% 이상 mid, 그 밖 low
  function chance(m){ var p = m.p[WEEKS - 1]; return p >= 0.7 ? 'high' : p >= 0.4 ? 'mid' : 'low'; }
  // 넘을 확률이 처음 50% 를 넘는 주 (1~8, 8주 안에 없으면 null) — "유력 주차"
  function likelyWeek(p){ for (var i = 0; i < p.length; i++) if (p[i] >= 0.5) return i + 1; return null; }

  var E = { TARGETS: TARGETS, MINPOOL: MINPOOL, EARLY: EARLY, q: q, mean: mean, at: at, age: age, since: since, m3From: m3From,
    poolFor: poolFor, METHODS: METHODS, predictAll: predictAll,
    LATE: LATE, MSTEP: MSTEP, WEEKS: WEEKS, KSPAN: KSPAN, longTerm: longTerm, etaH: etaH, project: project, probs: probs, msPlan: msPlan,
    chance: chance, likelyWeek: likelyWeek };
  if (typeof module === 'object' && module.exports) module.exports = E; else root.VE = E;
})(this);
