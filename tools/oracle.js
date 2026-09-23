// 예측의 신 (?tab=oracle) — 장난감
// 즐겨찾기한 영상(조회수 예측기의 별표)이 다음 100만 단위를 넘는 날짜·시각을 사이트 이용자가 직접 골라 남기고,
// 실제로 넘으면 수집 기록으로 넘은 순간을 추정해(조회수 예측기 "100만 단위 달성 기록"과 같은 계산) 얼마나 가까웠는지 채점한다.
// 기록 · 즐겨찾기 · 100만 단위 계산은 views.js 가 넘겨주는 window.SGV 를 쓴다.
//
// 예측 기록은 이 브라우저 localStorage 'sendungi:oracle' 에만 저장 (위시리스트 · 즐겨찾기처럼 기기끼리 이어지지 않는다)
//   한 줄 = { k: 고유 id, id: 영상 id, t: 제목(영상이 목록에서 빠져도 보이게), M: 목표 조회수(100만 단위),
//            g: 고른 때(ms), at: 남긴 때(ms), v0: 남길 때 조회수,
//            ai: 그때 조회수 예측기(③ 추세 곡선)가 본 때(ms) — 0 이면 "못 닿는다고 봄", null 이면 계산 전, s: 채점 알림을 보냈으면 1 }
// 채점: 오차 = |고른 때 − 실제로 넘은 때|, 기간 = 실제로 넘은 때 − 남긴 때, 정확도 = 1 − 오차 ÷ 기간 (0 아래는 0)
//   → 멀리 내다본 예측일수록 같은 오차라도 덜 깎인다. 예측기의 예상도 같은 식으로 채점해 누가 더 가까웠는지 겨룬다
(function(){
  var main = document.querySelector('main.mn');
  if (!main || !window.SG || !window.SGV) return;
  var V = window.SGV;

  var KEY = 'sendungi:oracle', STEP = 1e6, H = 3600e3, D = 864e5;
  // 등급: 정확도 기준. "적중" = 족집게 이상(75%)
  var GRADES = [
    { min: 0.97, n: '예측의 신', k: 'god' },
    { min: 0.9,  n: '예언자',   k: 'seer' },
    { min: 0.75, n: '족집게',   k: 'hit' },
    { min: 0.5,  n: '감 좋음',  k: 'ok' },
    { min: 0.25, n: '아슬아슬', k: 'meh' },
    { min: 0,    n: '빗나감',   k: 'miss' }
  ];
  var HIT = 0.75;
  function grade(a){ return GRADES.filter(function(g){ return a >= g.min; })[0]; }

  function esc(s){ return String(s).replace(/[&<>"']/g, function(c){ return { '&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;' }[c]; }); }
  function two(n){ return n < 10 ? '0' + n : '' + n; }
  function pct(a){ return Math.round(a * 100) + '%'; }
  var WD = ['일', '월', '화', '수', '목', '금', '토'];
  // 9/26 (금) · 해가 다르면 "27년 1/3 (일)"
  function dayTxt(ms){
    var d = new Date(ms);
    return (d.getFullYear() !== new Date().getFullYear() ? String(d.getFullYear()).slice(2) + '년 ' : '') + (d.getMonth() + 1) + '/' + d.getDate() + ' (' + WD[d.getDay()] + ')';
  }
  function timeTxt(ms){ var d = new Date(ms), h = d.getHours(); return (h < 12 ? '오전 ' : '오후 ') + (h % 12 || 12) + ':' + two(d.getMinutes()); }
  function whenTxt(ms){ return dayTxt(ms) + ' ' + timeTxt(ms); }
  function shortTxt(ms){ var d = new Date(ms); return (d.getMonth() + 1) + '/' + d.getDate() + ' ' + two(d.getHours()) + ':' + two(d.getMinutes()); }
  // 걸린 시간: 3일 안은 N시간 N분, 2주 안은 N일 N시간, 그 뒤는 N주 N일
  function durTxt(ms){
    var mn = Math.max(1, Math.round(Math.abs(ms) / 60e3)), hh = Math.round(mn / 60), dd = Math.round(mn / 1440);
    if (mn < 60) return mn + '분';
    if (mn < 72 * 60) return Math.floor(mn / 60) + '시간' + (mn % 60 ? ' ' + mn % 60 + '분' : '');
    if (hh < 14 * 24) return Math.floor(hh / 24) + '일' + (hh % 24 ? ' ' + hh % 24 + '시간' : '');
    return Math.floor(dd / 7) + '주' + (dd % 7 ? ' ' + dd % 7 + '일' : '');
  }
  // datetime-local 값 ↔ ms (브라우저 현지 시각)
  function toLocal(ms){ var d = new Date(ms); return d.getFullYear() + '-' + two(d.getMonth() + 1) + '-' + two(d.getDate()) + 'T' + two(d.getHours()) + ':' + two(d.getMinutes()); }
  function fromLocal(s){ var m = /^(\d{4})-(\d\d)-(\d\d)T(\d\d):(\d\d)/.exec(s || ''); return m ? new Date(+m[1], m[2] - 1, +m[3], +m[4], +m[5]).getTime() : NaN; }
  function defaultGuess(){ var t = new Date(Date.now() + D); t.setMinutes(0, 0, 0); return t.getTime() + H; }   // 내일 이맘때 다음 정시

  // ---------- 저장 ----------
  var LOG = (function(){
    try {
      var a = JSON.parse(localStorage.getItem(KEY) || '[]');
      return Array.isArray(a) ? a.filter(function(x){ return x && x.id && x.M > 0 && x.g > 0 && x.at > 0; }) : [];
    } catch (e){ return []; }
  })();
  function save(){ try { localStorage.setItem(KEY, JSON.stringify(LOG)); } catch (e){} }
  function mine(id, M){ return LOG.filter(function(x){ return x.id === id && x.M === M; })[0]; }

  // ---------- 채점 ----------
  function byId(id){ return V.videos().filter(function(v){ return v.id === id; })[0]; }
  function judge(x){
    var v = byId(x.id), c = v ? V.cross(v, x.M) : null;
    if (c){
      if (c.ms <= x.at) return { st: 'void', v: v, c: c };                          // 남기기 전에 이미 넘었음 (마지막 기록과 남긴 때 사이)
      var L = c.ms - x.at, acc = Math.max(0, 1 - Math.abs(x.g - c.ms) / L);
      var ai = x.ai == null ? null : x.ai === 0 ? 0 : Math.max(0, 1 - Math.abs(x.ai - c.ms) / L);
      // 대결: 같은 기간으로 나눈 정확도끼리 비교 (0.5%p 안이면 무승부 — 둘 다 0% 도 무승부)
      var win = ai == null ? null : Math.abs(acc - ai) < 0.005 ? 0 : acc > ai ? 1 : -1;
      return { st: 'done', v: v, c: c, L: L, err: x.g - c.ms, acc: acc, gr: grade(acc), ai: ai, win: win };
    }
    if (!v) return { st: 'gone' };
    return { st: 'wait', v: v, now: V.views(v) };
  }

  // ---------- 화면 ----------
  var el = document.createElement('section');
  el.id = 'v-oracle'; el.className = 'wrap page'; el.hidden = true;
  main.appendChild(el);
  window.SG.pages.oracle = el;
  var prevShow = window.SG.onShow;
  window.SG.onShow = function(tab){ prevShow(tab); if (tab === 'oracle') show(); };
  V.active = function(){ return !el.hidden; };
  V.onData(function(){ if (!el.hidden) render(); });

  var DRAFT = {}, lt = 'all', timer = null, loaded = false;   // 영상별 입력 중인 목표·시각, 기록 탭
  var DELK = null;                                            // 지우기 확인 중인 예측(k)
  // 카드 그래프를 접은 영상 id (기본은 펼침)
  var GKEY = 'sendungi:oracle-shut', GSHUT = (function(){ try { var o = JSON.parse(localStorage.getItem(GKEY) || '{}'); return o && typeof o === 'object' ? o : {}; } catch (e){ return {}; } })();

  function head(){
    return '<div class="sec"><div class="sec-t"><svg viewBox="0 0 24 24"><use href="#i-toy"/></svg>장난감<span class="cr">›</span><span class="lt">예측의 신</span></div></div>'
      + '<div class="og-hero"><div class="og-k"><svg viewBox="0 0 24 24" aria-hidden="true"><use href="#i-orb"/></svg>PREDICTION GOD</div>'
      + '<h2 class="og-h">다음 100만 돌파,<br><em>몇 시 몇 분</em>일까?</h2>'
      + '<p class="og-d">즐겨찾기한 영상이 다음 100만 단위를 넘는 때를 직접 골라 예측을 남기세요.<br>'
      + '실제로 넘으면 15분마다 모은 기록으로 넘은 순간을 추정해 얼마나 가까웠는지 채점하고, 조회수 예측기의 계산과도 겨뤄 봅니다.<br>'
      + '예측 기록은 이 브라우저에만 저장됩니다.</p></div>';
  }
  function show(){
    if (!timer) timer = setInterval(function(){ if (!el.hidden && loaded) tick(); }, 30e3);
    if (loaded){ render(); return; }
    el.innerHTML = head() + '<p class="gnote">기록을 불러오는 중…</p>';
    V.ready().then(function(){ loaded = true; if (!el.hidden) render(); });
  }
  function render(){
    if (!loaded) return;
    el.innerHTML = head()
      + '<div class="og-sum" id="og-sum"></div>'
      + '<div class="sec sec2" id="og-new"><div class="sec-t"><svg viewBox="0 0 24 24"><use href="#i-target"/></svg>예측하기</div></div>'
      + '<p class="og-sd">목표 조회수를 고르고, 그 조회수를 넘을 날짜와 시각을 정해 남기세요. 영상마다 다음 세 단위까지 하나씩 예측할 수 있습니다.</p>'
      + '<div class="og-cards" id="og-cards"></div>'
      + '<div class="sec sec2" id="og-logs"><div class="sec-t"><svg viewBox="0 0 24 24"><use href="#i-log"/></svg>내 예측 기록</div></div>'
      + '<div id="og-log"></div>'
      + '<div class="sec sec2"><div class="sec-t"><svg viewBox="0 0 24 24"><use href="#i-grid"/></svg>채점 방법</div></div>'
      + rules();
    renderCards(); tick();
  }
  // 30초마다: 남은 시간 · 기록 · 요약만 다시 (입력 칸은 그대로 둔다)
  function tick(){
    var J = LOG.map(function(x){ return { x: x, j: judge(x) }; });
    notify(J);
    renderSum(J); renderLog(J);
    Array.prototype.forEach.call(el.querySelectorAll('.og-c[data-vid]'), function(c){ live(c); });
  }

  // 새로 채점된 예측 알림 (한 번만)
  function notify(J){
    var fresh = J.filter(function(o){ return o.j.st === 'done' && !o.x.s; });
    if (!fresh.length) return;
    fresh.slice(0, 3).forEach(function(o){
      if (window.toastSG) window.toastSG('예측 채점 — ' + esc(V.fmtM(o.x.M)) + ' · ' + esc(o.j.gr.n), esc(o.x.t) + ' · 정확도 ' + pct(o.j.acc));
    });
    fresh.forEach(function(o){ o.x.s = 1; });
    save();
  }

  // ----- 요약 -----
  function renderSum(J){
    var box = document.getElementById('og-sum'); if (!box) return;
    var done = J.filter(function(o){ return o.j.st === 'done'; }), wait = J.filter(function(o){ return o.j.st === 'wait'; }).length;
    var avg = done.length ? done.reduce(function(s, o){ return s + o.j.acc; }, 0) / done.length : null;
    var hits = done.filter(function(o){ return o.j.acc >= HIT; }).length;
    var vs = done.filter(function(o){ return o.j.win != null; }), w = vs.filter(function(o){ return o.j.win > 0; }).length, l = vs.filter(function(o){ return o.j.win < 0; }).length;
    var gr = avg == null ? null : grade(avg);
    box.innerHTML = tile('남긴 예측', LOG.length + '건', wait ? '채점 기다리는 중 ' + wait + '건' : LOG.length ? '모두 채점 끝' : '아직 없음')
      + tile('평균 정확도', avg == null ? '—' : pct(avg), gr ? '<span class="og-gr" data-g="' + gr.k + '">' + gr.n + '</span> · 채점 ' + done.length + '건' : '채점된 예측이 아직 없음', gr && gr.k)
      + tile('적중률', done.length ? pct(hits / done.length) : '—', done.length ? '정확도 75% 이상 ' + hits + ' / ' + done.length + '건' : '정확도 75% 이상이면 적중')
      + tile('예측기와 대결', vs.length ? w + '승 ' + l + '패' + (vs.length - w - l ? ' ' + (vs.length - w - l) + '무' : '') : '—',
          vs.length ? (w > l ? '예측기보다 앞서는 중' : w < l ? '예측기가 앞서는 중' : '팽팽함') : '채점되면 조회수 예측기와 비교');
  }
  function tile(k, b, s, g){ return '<div class="og-t"' + (g ? ' data-g="' + g + '"' : '') + '><span class="mk">' + k + '</span><b>' + b + '</b><small>' + s + '</small></div>'; }

  // ----- 예측하기 카드 (즐겨찾기한 영상마다) -----
  function thumbImg(v){
    var src = V.thumb(v);
    return src ? '<img src="' + esc(src) + '" alt="" loading="lazy">' : '<span class="og-ph" style="--h:' + v.hue + '"></span>';
  }
  function targets(v){ var b = (Math.floor(V.views(v) / STEP) + 1) * STEP; return [b, b + STEP, b + 2 * STEP]; }
  function renderCards(){
    var box = document.getElementById('og-cards'); if (!box) return;
    if (V.demo()){ box.innerHTML = empty('기록을 불러오지 못했습니다', '조회수 기록을 읽지 못해 지금은 예측을 남길 수 없습니다. 잠시 뒤 다시 열어 주세요.'); return; }
    var F = V.favs();
    if (!F.length){
      box.innerHTML = empty('즐겨찾기한 영상이 없습니다', '조회수 예측기의 영상 카드나 전체 영상 표에서 별표를 누르면 여기에서 예측할 수 있습니다.',
        '<a class="og-lk" href="?tab=views" data-tab="views">조회수 예측기로 가기 →</a>');
      return;
    }
    box.innerHTML = F.map(card).join('');
    Array.prototype.forEach.call(box.querySelectorAll('.og-c'), function(c){ live(c); });
  }
  function empty(b, s, x){
    return '<div class="og-empty"><svg viewBox="0 0 24 24" aria-hidden="true"><use href="#i-star"/></svg><b>' + b + '</b><small>' + s + '</small>' + (x || '') + '</div>';
  }
  function card(v){
    var nowV = V.views(v), Ms = targets(v), d = DRAFT[v.id] || (DRAFT[v.id] = {});
    if (Ms.indexOf(d.M) < 0 || mine(v.id, d.M) && !d.pick) d.M = Ms.filter(function(M){ return !mine(v.id, M); })[0] || Ms[0];
    if (!d.val) d.val = toLocal(defaultGuess());
    var P = V.plan(v), have = mine(v.id, d.M), id = 'og-in-' + esc(v.id);
    var h = '<article class="og-c" data-vid="' + esc(v.id) + '">'
      + '<div class="og-ch"><span class="og-th">' + thumbImg(v) + '</span>'
      + '<div class="og-ct"><b title="' + esc(v.title) + '">' + esc(v.title) + '</b>'
      + '<small>지금 <em>' + V.full(nowV) + '</em>회 · ' + shortTxt(V.lastMs(v)) + ' 기록</small></div></div>'
      + '<div class="og-tg" role="group" aria-label="목표 조회수">' + Ms.map(function(M){
          var m = mine(v.id, M);
          return '<button type="button" class="' + (M === d.M ? 'on' : '') + (m ? ' done' : '') + '" data-og-m="' + M + '" aria-pressed="' + (M === d.M) + '">'
            + V.fmtM(M) + (m ? '<i aria-label="예측함">✓</i>' : '') + '</button>';
        }).join('') + '</div>'
      // 조회수 추이 그래프 (접기 · 펼치기). 접어도 머리 줄에 남은 조회수 · 최근 하루 증가는 보인다
      + '<div class="og-gb"><button type="button" class="og-gt" data-og-gt aria-expanded="' + !GSHUT[v.id] + '">'
      + '<svg class="og-gv" aria-hidden="true"><use href="#i-chev"/></svg><span class="og-gl">조회수 추이</span>'
      + '<span class="og-hint"><span>남은 <b>' + V.fmt(d.M - nowV) + '</b></span><span>하루 <b>' + (P ? '+' + V.fmt(P.g) : '—') + '</b></span></span></button>'
      + '<div class="og-gw"' + (GSHUT[v.id] ? ' hidden' : '') + '></div></div>';
    if (have) h += '<div class="og-have"><span>이 목표는 이미 예측했습니다</span><b>' + whenTxt(have.g) + '</b>'
      + '<small>결과는 아래 “내 예측 기록”에서 볼 수 있습니다.</small></div>';
    else h += '<div class="og-f"><label class="og-lb" for="' + id + '">' + V.fmtM(d.M) + '을 넘을 때</label>'
      + '<input type="datetime-local" id="' + id + '" data-og-in value="' + d.val + '" min="' + toLocal(Date.now()) + '" step="60">'
      + '<div class="og-st">' + [[-D, '−1일'], [-H, '−1시간'], [H, '+1시간'], [D, '+1일']].map(function(s){
          return '<button type="button" data-og-step="' + s[0] + '">' + s[1] + '</button>';
        }).join('') + '</div>'
      + '<p class="og-live" data-og-live></p>'
      + '<button type="button" class="og-go" data-og-go>이 때로 예측 남기기</button></div>';
    return h + '</article>';
  }
  // 입력한 때 → 안내 줄 · 남기기 버튼
  function check(val){
    var g = fromLocal(val), now = Date.now();
    if (isNaN(g)) return { ok: false, t: '날짜와 시각을 골라 주세요' };
    if (g <= now + 60e3) return { ok: false, t: '지금보다 뒤의 때를 골라 주세요' };
    if (g > now + 730 * D) return { ok: false, t: '2년 안으로 골라 주세요' };
    return { ok: true, g: g, t: '지금부터 <b>' + durTxt(g - now) + '</b> 뒤 · ' + whenTxt(g) };
  }
  function live(c){
    graph(c);
    var inp = c.querySelector('[data-og-in]'); if (!inp) return;
    var r = check(inp.value), p = c.querySelector('[data-og-live]'), go = c.querySelector('[data-og-go]');
    p.innerHTML = r.t; p.classList.toggle('bad', !r.ok); go.disabled = !r.ok;
    inp.min = toLocal(Date.now());
  }

  // ----- 카드 그래프: 최근 72시간 실제 조회수 + 최근 하루 속도를 그대로 이은 점선 + 목표선 + 내가 고른 때 -----
  // 예측기(③)의 곡선은 그리지 않는다 (채점 때 겨룰 상대라 미리 보여 주지 않음). 점선은 "지금 속도가 안 줄면" 참고용
  function graph(c){
    var box = c.querySelector('.og-gw'); if (!box || box.hidden) return;
    var vid = c.getAttribute('data-vid'), v = byId(vid), d = DRAFT[vid]; if (!v || !d) return;
    var have = mine(vid, d.M), inp = c.querySelector('[data-og-in]'), g = have ? have.g : inp ? fromLocal(inp.value) : NaN;
    box.innerHTML = chart(v, d.M, g > V.lastMs(v) ? g : NaN, !!have);
  }
  function chart(v, M, g, fixed){
    var a = v.vs.snaps.length ? v.vs.snaps[v.vs.snaps.length - 1][0] : 0;
    var pts = v.vs.snaps.filter(function(p){ return p[0] >= a - 72; }).map(function(p){ return [v.pub + p[0] * H, p[1]]; });
    if (pts.length < 2) return '<p class="og-gn">기록이 더 쌓이면 그래프가 나옵니다.</p>';
    var P = V.plan(v), t0 = pts[0][0], tn = pts[pts.length - 1][0], vn = pts[pts.length - 1][1];
    var perMs = P ? P.g / D : (vn - pts[0][1]) / (tn - t0);                      // 최근 하루 속도 (조회수 / ms)
    var t1 = !isNaN(g) ? Math.max(tn + D, g + Math.max(6 * H, (g - tn) * 0.12)) : tn + 2 * D, far = false;
    if (t1 > tn + 30 * D){ t1 = tn + 30 * D; far = !isNaN(g) && g > t1; }
    var y0 = pts[0][1], y1 = M + (M - y0) * 0.14;
    var W = 320, Hh = 138, L = 8, R = 8, T = 14, B = 20;
    function X(t){ return L + (t - t0) / (t1 - t0) * (W - L - R); }
    function Y(y){ return Hh - B - (y - y0) / (y1 - y0) * (Hh - T - B); }
    function f(n){ return n.toFixed(1); }
    var line = pts.map(function(p, i){ return (i ? 'L' : 'M') + f(X(p[0])) + ' ' + f(Y(p[1])); }).join('');
    var area = line + 'L' + f(X(tn)) + ' ' + (Hh - B) + 'L' + f(X(t0)) + ' ' + (Hh - B) + 'Z';
    // 점선: 지금부터 같은 속도로 → 그래프 위 끝에 닿으면 거기서 멈춤
    var te = t1, ve = vn + perMs * (t1 - tn);
    if (perMs > 0 && ve > y1){ te = tn + (y1 - vn) / perMs; ve = y1; }
    var s = '<svg class="og-g" viewBox="0 0 ' + W + ' ' + Hh + '" role="img" aria-label="최근 조회수 추이와 목표">';
    // 날짜 눈금 (자정마다, 많으면 건너뜀)
    var span = (t1 - t0) / D, step = Math.max(1, Math.ceil(span / 4)), day = new Date(t0); day.setHours(24, 0, 0, 0);
    for (var k = 0; day.getTime() < t1; day.setDate(day.getDate() + 1), k++){
      if (k % step) continue;
      var x = X(day.getTime());
      s += '<line class="og-gx" x1="' + f(x) + '" y1="' + T + '" x2="' + f(x) + '" y2="' + (Hh - B) + '"/>'
        + '<text class="og-gxt" x="' + f(x) + '" y="' + (Hh - 6) + '">' + (day.getMonth() + 1) + '/' + day.getDate() + '</text>';
    }
    s += '<line class="og-gm" x1="' + L + '" y1="' + f(Y(M)) + '" x2="' + (W - R) + '" y2="' + f(Y(M)) + '"/>'
      + '<text class="og-gmt" x="' + (L + 2) + '" y="' + f(Y(M) - 4) + '">' + esc(V.fmtM(M)) + '</text>'
      + '<path class="og-ga" d="' + area + '"/><path class="og-gl2" d="' + line + '"/>'
      + (perMs > 0 ? '<line class="og-ge" x1="' + f(X(tn)) + '" y1="' + f(Y(vn)) + '" x2="' + f(X(te)) + '" y2="' + f(Y(ve)) + '"/>' : '')
      + '<circle class="og-gd" cx="' + f(X(tn)) + '" cy="' + f(Y(vn)) + '" r="3.4"/>';
    if (!isNaN(g) && !far){
      var gx = X(g), anc = gx > W - 60 ? 'end' : 'start', tx = anc === 'end' ? gx - 4 : gx + 4;
      s += '<line class="og-gg" x1="' + f(gx) + '" y1="' + T + '" x2="' + f(gx) + '" y2="' + (Hh - B) + '"/>'
        + '<text class="og-ggt" x="' + f(tx) + '" y="' + (T + 8) + '" text-anchor="' + anc + '">' + (fixed ? '남긴 예측' : '내 예측') + '</text>';
    }
    else if (far) s += '<text class="og-ggt" x="' + (W - R) + '" y="' + (T + 8) + '" text-anchor="end">' + (fixed ? '남긴 예측' : '내 예측') + ' ' + dayTxt(g) + ' →</text>';
    return s + '</svg><div class="og-glg"><span><i class="l"></i>실제 조회수</span><span><i class="e"></i>최근 하루 속도 그대로</span>'
      + '<span><i class="m"></i>목표</span>' + (!isNaN(g) ? '<span><i class="g"></i>' + (fixed ? '남긴 예측' : '내 예측') + '</span>' : '') + '</div>';
  }
  function submit(c){
    var vid = c.getAttribute('data-vid'), v = byId(vid), d = DRAFT[vid], r = check(d && d.val);
    if (!v || !r.ok || mine(vid, d.M)) return;
    var nowV = V.views(v); if (d.M <= nowV){ renderCards(); return; }
    // 그때 예측기(③ 추세 곡선)가 본 때 — 채점 때 비교용. 못 닿는다고 보면 0, 아직 계산 못 하면 null
    var P = V.plan(v), m = P && P.ms.filter(function(x){ return x.M === d.M; })[0];
    var ai = !m ? null : m.days == null ? 0 : Math.round(V.lastMs(v) + m.days * D);
    var now = Date.now();
    LOG.push({ k: now.toString(36) + Math.random().toString(36).slice(2, 6), id: vid, t: v.title, M: d.M, g: r.g, at: now, v0: Math.round(nowV), ai: ai });
    save();
    if (window.toastSG) window.toastSG('예측을 남겼습니다 — ' + esc(V.fmtM(d.M)), esc(whenTxt(r.g)));
    DRAFT[vid] = {};                                       // 다음 목표로 넘어가고 시각은 기본값부터
    lt = lt === 'done' ? 'all' : lt;
    renderCards(); tick();
  }

  // ----- 내 예측 기록 -----
  function renderLog(J){
    var box = document.getElementById('og-log'); if (!box) return;
    if (!LOG.length){ box.innerHTML = '<p class="og-none">아직 남긴 예측이 없습니다. 위에서 영상 하나를 골라 첫 예측을 남겨 보세요.</p>'; return; }
    var W = J.filter(function(o){ return o.j.st === 'wait'; }).sort(function(a, b){ return a.x.g - b.x.g; });
    var Dn = J.filter(function(o){ return o.j.st === 'done' || o.j.st === 'void'; }).sort(function(a, b){ return b.j.c.ms - a.j.c.ms; });
    var G = J.filter(function(o){ return o.j.st === 'gone'; });
    var show = lt === 'wait' ? W : lt === 'done' ? Dn : W.concat(Dn, G);
    box.innerHTML = '<div class="seg og-seg" role="tablist">'
      + [['all', '전체', J.length], ['wait', '채점 기다림', W.length], ['done', '채점 끝', Dn.length]].map(function(t){
          return '<button type="button" role="tab" data-og-lt="' + t[0] + '" class="' + (lt === t[0] ? 'on' : '') + '" aria-selected="' + (lt === t[0]) + '">' + t[1] + ' <b>' + t[2] + '</b></button>';
        }).join('') + '</div>'
      + (show.length ? '<ol class="og-log">' + show.map(row).join('') + '</ol>' : '<p class="og-none">이 칸에 해당하는 예측이 없습니다.</p>');
  }
  function row(o){
    var x = o.x, j = o.j, v = j.v, h = '<li class="og-r ' + j.st + '"' + (j.gr ? ' data-g="' + j.gr.k + '"' : '') + ' data-k="' + esc(x.k) + '">'
      + '<span class="og-rth">' + (v ? thumbImg(v) : '<span class="og-ph"></span>') + '</span>'
      + '<div class="og-rb"><div class="og-rh"><b class="og-rt" title="' + esc(x.t) + '">' + esc(x.t) + '</b>'
      + '<span class="og-rm">' + V.fmtM(x.M) + ' 돌파</span></div>';
    if (j.st === 'done'){
      var early = j.err < 0;
      h += '<div class="og-rv"><span><small>내 예측</small><b>' + whenTxt(x.g) + '</b></span>'
        + '<span><small>실제</small><b>' + actual(j.c) + '</b></span></div>'
        + '<p class="og-rn">' + (Math.abs(j.err) < 60e3 ? '<em>분 단위까지 정확</em>' : '<em>' + durTxt(j.err) + ' ' + (early ? '이르게' : '늦게') + '</em> 예측')
        + ' · 남긴 때 <span class="og-nw">' + shortTxt(x.at) + ' (' + V.fmtM(x.v0) + ')</span>부터 ' + durTxt(j.L) + ' 뒤에 넘음</p>'
        + '<p class="og-ai">' + aiTxt(x, j) + '</p>';
    }
    else if (j.st === 'wait'){
      var now = Date.now(), left = x.M - j.now, f = Math.max(0, Math.min(1, (j.now - x.v0) / (x.M - x.v0)));
      h += '<div class="og-rv"><span><small>내 예측</small><b>' + whenTxt(x.g) + '</b></span>'
        + '<span><small>' + (x.g > now ? '예측한 때까지' : '예측한 때부터') + '</small><b class="og-cd">' + durTxt(x.g - now) + (x.g > now ? ' 남음' : ' 지남') + '</b></span></div>'
        + '<div class="og-pg" aria-hidden="true"><i style="width:' + (f * 100).toFixed(1) + '%"></i></div>'
        + '<p class="og-rn">지금 ' + V.fmt(j.now) + ' · <em>' + V.fmt(left) + ' 남음</em> · 남긴 때 <span class="og-nw">' + shortTxt(x.at) + ' (' + V.fmtM(x.v0) + ')</span></p>'
        + '<p class="og-ai">' + (x.ai == null ? '예측기: 그때는 기록이 모자라 계산 전' : x.ai === 0 ? '예측기: 그때 추세로는 못 닿는다고 봄'
          : '예측기 예상: ' + whenTxt(x.ai)) + '</p>';
    }
    else if (j.st === 'void') h += '<p class="og-rn">예측을 남기기 전(마지막 기록과 남긴 때 사이)에 이미 넘어서 채점하지 않습니다. 실제 ' + actual(j.c) + '</p>';
    else h += '<p class="og-rn">이 영상의 기록을 더는 찾을 수 없어 채점할 수 없습니다. 내 예측 ' + whenTxt(x.g) + '</p>';
    h += '</div><div class="og-rs">';
    if (j.st === 'done') h += '<b class="og-acc">' + pct(j.acc) + '</b><span class="og-gr" data-g="' + j.gr.k + '">' + j.gr.n + '</span>';
    else if (j.st === 'wait') h += '<span class="og-wt">채점 기다림</span>';
    else h += '<span class="og-wt">채점 안 함</span>';
    // 지우기: × → 그 자리에서 한 번 더 확인 (브라우저 confirm 창은 앱 · 웹뷰에서 막혀 아무 일도 안 일어날 수 있어 쓰지 않는다)
    if (DELK === x.k) return h + '<span class="og-cf"><small>지울까요?</small><button type="button" class="og-yes" data-og-yes="' + esc(x.k) + '">지우기</button>'
      + '<button type="button" class="og-no" data-og-no>취소</button></span></div></li>';
    return h + '<button type="button" class="og-del" data-og-del="' + esc(x.k) + '" title="이 예측 지우기" aria-label="이 예측 지우기">×</button></div></li>';
  }
  // 실제로 넘은 때: 두 기록 간격이 1.5시간 안이면 분까지, 넓으면 두 기록 시각 사이
  function actual(c){
    if (c.ms1 - c.ms0 <= 1.5 * H) return whenTxt(c.ms) + '쯤';
    return whenTxt(c.ms0) + ' ~ ' + (new Date(c.ms0).toDateString() === new Date(c.ms1).toDateString() ? '' : dayTxt(c.ms1) + ' ') + timeTxt(c.ms1) + ' 사이';
  }
  function aiTxt(x, j){
    if (j.ai == null) return '예측기: 그때는 기록이 모자라 계산 전 — 대결 없음';
    var who = j.win > 0 ? '<em class="w">내가 이김</em>' : j.win < 0 ? '<em class="l">예측기가 이김</em>' : '<em>무승부</em>';
    return (x.ai === 0 ? '예측기: 못 닿는다고 봄 (정확도 0%)' : '예측기 예상: ' + whenTxt(x.ai) + ' · 정확도 ' + pct(j.ai)) + ' → ' + who;
  }

  // ----- 채점 방법 -----
  function rules(){
    return '<div class="og-rule"><p>정확도 = 100% − <b>오차</b> ÷ <b>기간</b>. 오차는 고른 때와 실제로 넘은 때의 차이, 기간은 예측을 남긴 때부터 실제로 넘은 때까지입니다. '
      + '멀리 내다본 예측일수록 같은 오차라도 덜 깎입니다 (예: 10일 전에 남긴 예측이 하루 빗나가면 90%).</p>'
      + '<p>실제로 넘은 때는 15분마다 모은 조회수 기록 두 개 사이를 곧게 이어 추정합니다. 조회수 예측기가 그때 계산한 예상(③ 추세 곡선)도 같은 식으로 채점해 누가 더 가까웠는지 겨룹니다.</p>'
      + '<div class="og-grs">' + GRADES.map(function(g, i){
          return '<span class="og-gi"><span class="og-gr" data-g="' + g.k + '">' + g.n + '</span><small>' + (i === GRADES.length - 1 ? pct(GRADES[i - 1].min) + ' 미만' : pct(g.min) + ' 이상') + '</small></span>';
        }).join('') + '</div></div>';
  }

  // ---------- 이벤트 ----------
  el.addEventListener('click', function(e){
    var t;
    if ((t = e.target.closest('[data-og-m]'))){
      var c = t.closest('.og-c'), d = DRAFT[c.getAttribute('data-vid')];
      d.M = +t.getAttribute('data-og-m'); d.pick = true;
      c.outerHTML = card(byId(c.getAttribute('data-vid')));
      var nc = el.querySelector('.og-c[data-vid="' + CSS.escape(c.getAttribute('data-vid')) + '"]'); if (nc) live(nc);
      return;
    }
    if ((t = e.target.closest('[data-og-step]'))){
      var c2 = t.closest('.og-c'), d2 = DRAFT[c2.getAttribute('data-vid')], inp = c2.querySelector('[data-og-in]');
      var g = fromLocal(inp.value); if (isNaN(g)) g = defaultGuess();
      d2.val = inp.value = toLocal(g + +t.getAttribute('data-og-step'));
      live(c2); return;
    }
    if ((t = e.target.closest('[data-og-go]'))){ submit(t.closest('.og-c')); return; }
    if ((t = e.target.closest('[data-og-lt]'))){ lt = t.getAttribute('data-og-lt'); tick(); return; }
    if ((t = e.target.closest('[data-og-del]'))){ DELK = t.getAttribute('data-og-del'); tick(); return; }
    if (e.target.closest('[data-og-no]')){ DELK = null; tick(); return; }
    if ((t = e.target.closest('[data-og-yes]'))){
      var k = t.getAttribute('data-og-yes');
      LOG = LOG.filter(function(y){ return y.k !== k; }); save(); DELK = null;
      renderCards(); tick(); return;
    }
    if ((t = e.target.closest('[data-og-gt]'))){                // 그래프 접기 · 펼치기 (영상마다, 이 브라우저에 기억)
      var gc = t.closest('.og-c'), gid = gc.getAttribute('data-vid'), open = !!GSHUT[gid];
      if (open) delete GSHUT[gid]; else GSHUT[gid] = 1;
      try { localStorage.setItem(GKEY, JSON.stringify(GSHUT)); } catch (err){}
      t.setAttribute('aria-expanded', String(open)); gc.querySelector('.og-gw').hidden = !open;
      if (open) graph(gc);
      return;
    }
  });
  el.addEventListener('input', function(e){
    var inp = e.target.closest('[data-og-in]'); if (!inp) return;
    var c = inp.closest('.og-c'); DRAFT[c.getAttribute('data-vid')].val = inp.value; live(c);
  });
})();
