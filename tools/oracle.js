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
      // 모양이 이상한 줄은 버린다 (시각은 2096년 전 · 목표는 100억 아래 — 너무 큰 값이 LED 숫자 그리기를 깨뜨리지 않게)
      //   숫자 칸은 진짜 숫자만(배열 [5] 같은 값은 비교는 통과해도 날짜가 NaN 이 된다), 나머지 칸은 모양을 맞춰 넣는다 (백업 파일로 들어온 값 포함)
      function n(v, max){ return typeof v === 'number' && v > 0 && v < max; }
      return Array.isArray(a) ? a.filter(function(x){ return x && typeof x === 'object' && typeof x.id === 'string' && /^[\w-]{1,20}$/.test(x.id) && n(x.M, 1e10) && n(x.g, 4e12) && n(x.at, 4e12); })
        .map(function(x){
          return { k: typeof x.k === 'string' && /^[\w-]{1,40}$/.test(x.k) ? x.k : 'o' + Math.random().toString(36).slice(2, 12), id: x.id, t: typeof x.t === 'string' ? x.t.slice(0, 300) : '',
            M: x.M, g: x.g, at: x.at, v0: n(x.v0, 1e10) ? x.v0 : 0, ai: x.ai === 0 || n(x.ai, 4e12) ? x.ai : null, s: x.s ? 1 : undefined };
        }) : [];
    } catch (e){ return []; }
  })();
  function save(){ try { localStorage.setItem(KEY, JSON.stringify(LOG)); } catch (e){} if (window.SGPersist) window.SGPersist(); }
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
  var ftimer = null;
  var DELK = null;                                            // 지우기 확인 중인 예측(k)

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
    if (!ftimer) ftimer = setInterval(function(){ if (!el.hidden && loaded) ledTick(); }, 1000);    // 시한폭탄 시계 초
    if (loaded){ render(); return; }
    el.innerHTML = head() + '<p class="gnote">기록을 불러오는 중…</p>';
    V.ready().then(function(){ loaded = true; if (!el.hidden) render(); });
  }
  // 머리 아래 두 쪽 버튼: [예측하기] 예측을 고르는 쪽 · [내 예측 기록] 남긴 예측과 채점을 보는 쪽 (사용자 요청 — 한 페이지에 다 늘어놓지 않음)
  var mode = 'new';
  function pages(){
    return '<div class="og-pt" role="tablist">'
      + '<button type="button" role="tab" data-og-pg="new" class="' + (mode === 'new' ? 'on' : '') + '" aria-selected="' + (mode === 'new') + '">'
      + '<svg viewBox="0 0 24 24" aria-hidden="true"><use href="#i-target"/></svg><span><b>예측하기</b><small>즐겨찾기 영상의 돌파 시각 고르기</small></span></button>'
      + '<button type="button" role="tab" data-og-pg="log" class="' + (mode === 'log' ? 'on' : '') + '" aria-selected="' + (mode === 'log') + '">'
      + '<svg viewBox="0 0 24 24" aria-hidden="true"><use href="#i-log"/></svg><span><b>내 예측 기록 <em id="og-jn">' + LOG.length + '</em></b><small>남긴 예측 · 채점 결과</small></span></button></div>';
  }
  function render(){
    if (!loaded) return;
    el.innerHTML = head() + pages() + (mode === 'new'
      ? '<p class="og-sd">목표 조회수를 고르고, 그 조회수를 넘을 날짜와 시각을 정해 남기세요. 영상마다 다음 세 단위까지 하나씩 예측할 수 있습니다.</p>'
        + '<div class="og-cards" id="og-cards"></div>'
      : '<div class="og-sum" id="og-sum"></div>'
        + '<div class="sec sec2" id="og-logs"><div class="sec-t"><svg viewBox="0 0 24 24"><use href="#i-log"/></svg>내 예측 기록</div></div>'
        + '<div id="og-log"></div>'
        + '<div class="sec sec2"><div class="sec-t"><svg viewBox="0 0 24 24"><use href="#i-grid"/></svg>채점 방법</div></div>'
        + rules());
    renderCards(); tick();
  }
  // 30초마다: 남은 시간 · 기록 · 요약만 다시 (입력 칸은 그대로 둔다)
  function tick(){
    var J = LOG.map(function(x){ return { x: x, j: judge(x) }; });
    notify(J);
    renderSum(J); renderLog(J); fixLegends(document.getElementById('og-log'));
    var jn = document.getElementById('og-jn'); if (jn) jn.textContent = LOG.length;
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
      + '<small>지금 <em>' + V.full(nowV) + '</em>회</small><small class="og-ctm">' + shortTxt(V.lastMs(v)) + ' 기록</small></div>'   // 두 줄로 (좁은 카드에서 ' · ' 가 줄머리에 남던 것)
      // 즐겨찾기 별표 (켜진 상태) — 누르면 즐겨찾기에서 빠지고 카드도 사라진다. 남긴 예측 기록은 그대로
      + '<button type="button" class="og-fav" data-og-fav aria-pressed="true" title="즐겨찾기에서 빼기" aria-label="즐겨찾기에서 빼기">'
      + '<svg viewBox="0 0 24 24" aria-hidden="true"><use href="#i-star"/></svg></button></div>'
      + '<div class="og-tg" role="group" aria-label="목표 조회수">' + Ms.map(function(M){
          var m = mine(v.id, M);
          return '<button type="button" class="' + (M === d.M ? 'on' : '') + (m ? ' done' : '') + '" data-og-m="' + M + '" aria-pressed="' + (M === d.M) + '">'
            + V.fmtM(M) + (m ? '<i aria-label="예측함">✓</i>' : '') + '</button>';
        }).join('') + '</div>'
      // 조회수 추이 그래프 — 머리 줄에 남은 조회수 · 최근 하루 증가 (접기 토글은 9/24 사용자 요청으로 뺌, 늘 펼침)
      + '<div class="og-gb"><div class="og-gt"><span class="og-gl">조회수 추이</span>'
      + '<span class="og-hint"><span>남은 <b>' + V.fmt(d.M - nowV) + '</b></span><span>하루 <b>' + (P ? '+' + V.fmt(P.g) : '—') + '</b></span></span></div>'
      + '<div class="og-gw"></div></div>'
      + '<div class="og-aip" data-og-aip></div>';                // 조회수 예측기(③ 추세 곡선)의 예상 — 사용자 요청으로 폼 위에 보여 줌 (live 가 채움)
    if (have) h += '<div class="og-have"><span>이 목표는 이미 예측했습니다</span><b>' + whenTxt(have.g) + '</b>'
      + '<small>결과는 위의 [내 예측 기록]에서 볼 수 있습니다.</small></div>';
    else h += '<div class="og-f"><label class="og-lb" for="' + id + '">' + V.fmtM(d.M) + '을 넘을 때</label>'
      + '<input type="datetime-local" id="' + id + '" data-og-in value="' + d.val + '" min="' + toLocal(Date.now()) + '" step="60">'
      + '<div class="og-st">' + [[-D, '−1일'], [-H, '−1시간'], [H, '+1시간'], [D, '+1일']].map(function(s){
          return '<button type="button" data-og-step="' + s[0] + '">' + s[1] + '</button>';
        }).join('') + '</div>'
      + '<p class="og-live" data-og-live></p>'
      + '<button type="button" class="og-go" data-og-go>이때로 예측 남기기</button></div>';
    return h + '</article>';
  }
  // 입력한 때 → 안내 줄 · 남기기 버튼
  function check(val){
    var g = fromLocal(val), now = Date.now();
    if (isNaN(g)) return { ok: false, t: '날짜와 시각을 골라 주세요' };
    if (g <= now + 60e3) return { ok: false, t: '지금 이후의 시각을 골라 주세요' };
    if (g > now + 730 * D) return { ok: false, t: '2년 안으로 골라 주세요' };
    return { ok: true, g: g, t: '지금부터 <b>' + durTxt(g - now) + '</b> 뒤 · ' + whenTxt(g) };
  }
  // 조회수 예측기(③ 추세 곡선)가 보는 M 돌파 때(ms). 0 = 지금 추세로는 못 닿음, null = 기록이 모자라 계산 전
  function aiAt(v, M){
    var P = V.plan(v), m = P && P.ms.filter(function(x){ return x.M === M; })[0];
    return !m ? null : m.days == null ? 0 : Math.round(V.lastMs(v) + m.days * D);
  }
  function live(c){
    graph(c);
    var ap = c.querySelector('[data-og-aip]'), vid = c.getAttribute('data-vid'), v = byId(vid), d = DRAFT[vid];
    if (ap && v && d){
      var t = aiAt(v, d.M), now = Date.now();
      ap.innerHTML = '<span class="og-aik"><i></i>예측기 예상</span>'
        + (t == null ? '<small>기록이 더 쌓이면 계산합니다</small>' : t === 0 ? '<small>지금 추세로는 ' + V.fmtM(d.M) + '에 닿기 어렵다고 봅니다</small>'
          : '<b>' + whenTxt(t) + '</b><small>' + (t > now ? '지금부터 ' + durTxt(t - now) + ' 뒤' : '곧') + '</small>');
    }
    var inp = c.querySelector('[data-og-in]'); if (!inp) return;
    var r = check(inp.value), p = c.querySelector('[data-og-live]'), go = c.querySelector('[data-og-go]');
    p.innerHTML = r.t; p.classList.toggle('bad', !r.ok); go.disabled = !r.ok;
    inp.min = toLocal(Date.now());
  }

  // ----- 카드 그래프: 최근 72시간 실제 조회수 + 최근 하루 속도를 그대로 이은 점선 + 목표선 + 내가 고른 때 + 예측기 예상(목표선 위 민트 점) -----
  // 점선은 "지금 속도가 안 줄면" 참고용. 예측기(③ 추세 곡선)는 곡선 대신 목표에 닿는 때만 점으로 (그래프 아래 줄과 같은 값)
  function graph(c){
    var box = c.querySelector('.og-gw'); if (!box || box.hidden) return;
    var vid = c.getAttribute('data-vid'), v = byId(vid), d = DRAFT[vid]; if (!v || !d) return;
    var have = mine(vid, d.M), inp = c.querySelector('[data-og-in]'), g = have ? have.g : inp ? fromLocal(inp.value) : NaN;
    box.innerHTML = chart(v, d.M, { g: g > V.lastMs(v) ? g : NaN, fixed: !!have, ai: aiAt(v, d.M) });
    fixLegends(box);
  }
  // 창 크기가 바뀌거나(휴대폰 돌림) 글꼴이 늦게 들어오면 범례 줄바꿈이 달라지므로 다시 잰다
  var fixT = null;
  window.addEventListener('resize', function(){ clearTimeout(fixT); fixT = setTimeout(function(){ if (!el.hidden) fixLegends(); }, 150); });
  if (document.fonts && document.fonts.ready) document.fonts.ready.then(function(){ if (!el.hidden) fixLegends(); });
  // 범례가 두 줄로 꺾이며 마지막 하나만 아랫줄에 남으면 3칸 격자(.g3)로 — 좁은 카드 · 휴대폰에서 '내 예측'만 떨어지던 것
  function fixLegends(root){
    Array.prototype.forEach.call((root || el).querySelectorAll('.og-glg'), function(g){
      g.classList.remove('g3');
      var tops = Array.prototype.map.call(g.children, function(c){ return c.offsetTop; }), rows = tops.filter(function(t, i){ return tops.indexOf(t) === i; });
      if (rows.length > 1 && rows.some(function(t){ return tops.filter(function(x){ return x === t; }).length === 1; })) g.classList.add('g3');
    });
  }
  // o = { g: 내가 고른 때, fixed: 남긴 예측인지, ai: 예측기 예상, act: 실제로 넘은 때(채점 끝), from: 남긴 때 }
  //   채점 전: 최근 72시간(남긴 때가 더 앞이면 거기부터, 최대 14일) ~ 고른 때 조금 뒤. 채점 끝: 남긴 때 앞 ~ 실제 · 고른 때 · 예측기 중 늦은 때 조금 뒤
  function chart(v, M, o){
    var g = o.g > 0 ? o.g : NaN, fixed = o.fixed, ai = o.ai > 0 ? o.ai : NaN, act = o.act;
    var all = v.vs.snaps.map(function(p){ return [v.pub + p[0] * H, p[1]]; });
    if (all.length < 2) return '<p class="og-gn">기록이 더 쌓이면 그래프가 나옵니다.</p>';
    var end = act || all[all.length - 1][0], t0 = end - 72 * H;
    if (o.from) t0 = Math.min(t0, o.from - 6 * H);
    t0 = Math.max(t0, all[0][0], end - 14 * D);
    function pad(t){ return t + Math.max(6 * H, (t - end) * 0.12); }
    var t1 = act ? end + Math.max(6 * H, (end - t0) * 0.15) : end + (isNaN(g) ? 2 * D : D), far = false;
    if (!isNaN(g)) t1 = Math.max(t1, pad(g));
    if (!isNaN(ai)) t1 = Math.max(t1, pad(ai));                                    // 예측기 점도 보이게
    if (t1 > end + 30 * D){ t1 = end + 30 * D; far = !isNaN(g) && g > t1; }
    var pts = all.filter(function(p){ return p[0] >= t0 - 1 && p[0] <= t1; });
    if (pts.length < 2) return '<p class="og-gn">이 구간의 기록이 모자라 그래프를 그릴 수 없습니다.</p>';
    var P = V.plan(v), tn = pts[pts.length - 1][0], vn = pts[pts.length - 1][1];
    var perMs = act ? 0 : P ? P.g / D : (vn - pts[0][1]) / (tn - t0);            // 최근 하루 속도 (조회수 / ms), 채점 끝이면 점선 없음
    var y0 = pts[0][1], y1 = Math.max(M, vn) + (M - y0) * 0.14;
    var W = 320, Hh = 148, L = 8, R = 8, T = 24, B = 20;   // 위 여백: 내 예측 글자 자리 (목표선 근처 글자와 안 겹치게)
    function X(t){ return L + (t - t0) / (t1 - t0) * (W - L - R); }
    function Y(y){ return Hh - B - (y - y0) / (y1 - y0) * (Hh - T - B); }
    function f(n){ return n.toFixed(1); }
    var line = pts.map(function(p, i){ return (i ? 'L' : 'M') + f(X(p[0])) + ' ' + f(Y(p[1])); }).join('');
    var area = line + 'L' + f(X(tn)) + ' ' + (Hh - B) + 'L' + f(X(pts[0][0])) + ' ' + (Hh - B) + 'Z';
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
      + (act ? '' : '<circle class="og-gd" cx="' + f(X(tn)) + '" cy="' + f(Y(vn)) + '" r="3.4"/>');
    if (o.from && o.from > t0) s += '<line class="og-gf" x1="' + f(X(o.from)) + '" y1="' + T + '" x2="' + f(X(o.from)) + '" y2="' + (Hh - B) + '"/>';   // 남긴 때
    if (act){                                                                        // 실제로 넘은 때: 목표선 위 흰 점
      var cx = X(act), ca = cx > W - 40 ? 'end' : cx < 40 ? 'start' : 'middle';
      s += '<circle class="og-gc" cx="' + f(cx) + '" cy="' + f(Y(M)) + '" r="4.2"/>'
        + '<text class="og-gct" x="' + f(cx) + '" y="' + f(Y(M) - 8) + '" text-anchor="' + ca + '">실제</text>';
    }
    if (ai >= t0 && ai <= t1){
      var ax = X(ai), aa = ax > W - 50 ? 'end' : ax < 50 ? 'start' : 'middle';
      s += '<line class="og-gai" x1="' + f(ax) + '" y1="' + f(Y(M)) + '" x2="' + f(ax) + '" y2="' + (Hh - B) + '"/>'
        + '<circle class="og-gaid" cx="' + f(ax) + '" cy="' + f(Y(M)) + '" r="3.6"/>'
        + '<text class="og-gait" x="' + f(ax) + '" y="' + f(Y(M) + 13) + '" text-anchor="' + aa + '">예측기</text>';
    }
    if (!isNaN(g) && !far){
      var gx = X(g), anc = gx > W - 60 ? 'end' : 'start', tx = anc === 'end' ? gx - 4 : gx + 4;
      var gy = Y(M);                                                               // 목표선과 만나는 곳: 금색 다이아몬드
      s += '<line class="og-gg" x1="' + f(gx) + '" y1="' + (T - 4) + '" x2="' + f(gx) + '" y2="' + (Hh - B) + '"/>'
        + '<path class="og-ggd" d="M' + f(gx) + ' ' + f(gy - 5.5) + 'L' + f(gx + 5.5) + ' ' + f(gy) + 'L' + f(gx) + ' ' + f(gy + 5.5) + 'L' + f(gx - 5.5) + ' ' + f(gy) + 'Z"/>'
        + '<text class="og-ggt" x="' + f(tx) + '" y="' + (T - 8) + '" text-anchor="' + anc + '">' + '내 예측' + '</text>';
    }
    else if (far) s += '<text class="og-ggt" x="' + (W - R) + '" y="' + (T - 8) + '" text-anchor="end">' + '내 예측' + ' ' + dayTxt(g) + ' →</text>';
    return s + '</svg><div class="og-glg"><span><i class="l"></i>실제 조회수</span>' + (perMs > 0 ? '<span><i class="e"></i>지금 속도로</span>' : '')
      + '<span><i class="m"></i>목표</span>' + (act ? '<span><i class="c"></i>실제 돌파</span>' : '')
      + (ai >= t0 && ai <= t1 ? '<span><i class="a"></i>예측기 예상</span>' : '') + (!isNaN(g) ? '<span><i class="g"></i>' + '내 예측' + '</span>' + (far ? '' : '<span><i class="gd"></i>내 예측 돌파</span>') : '') + '</div>';
  }
  function submit(c){
    var vid = c.getAttribute('data-vid'), v = byId(vid), d = DRAFT[vid], r = check(d && d.val);
    if (!v || !r.ok || mine(vid, d.M)) return;
    var nowV = V.views(v); if (d.M <= nowV){ renderCards(); return; }
    // 그때 예측기(③ 추세 곡선)가 본 때 — 채점 때 비교용. 못 닿는다고 보면 0, 아직 계산 못 하면 null
    var ai = aiAt(v, d.M), now = Date.now();
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
    if (!LOG.length){ box.innerHTML = '<p class="og-none">아직 남긴 예측이 없습니다. 위의 [예측하기]에서 영상 하나를 골라 첫 예측을 남겨 보세요.</p>'; return; }
    var W = J.filter(function(o){ return o.j.st === 'wait'; }).sort(function(a, b){ return a.x.g - b.x.g; });
    var Dn = J.filter(function(o){ return o.j.st === 'done' || o.j.st === 'void'; }).sort(function(a, b){ return b.j.c.ms - a.j.c.ms; });
    var G = J.filter(function(o){ return o.j.st === 'gone'; });
    var show = lt === 'wait' ? W : lt === 'done' ? Dn : W.concat(Dn, G);
    box.innerHTML = '<div class="seg og-seg" role="tablist">'
      + [['all', '전체', J.length], ['wait', '채점 기다림', W.length], ['done', '채점 끝', Dn.length]].map(function(t){
          return '<button type="button" role="tab" data-og-lt="' + t[0] + '" class="' + (lt === t[0] ? 'on' : '') + '" aria-selected="' + (lt === t[0]) + '">' + t[1] + ' <b>' + t[2] + '</b></button>';
        }).join('') + '</div>'
      + (show.length ? '<div class="og-cards og-lgrid">' + show.map(row).join('') + '</div>' : '<p class="og-none">이 탭에 해당하는 예측이 없습니다.</p>');
  }
  // 기록 카드 — 예측하기 카드와 같은 짜임: [썸네일 · 제목 · 상태] / 그래프 / 예측기 예상(민트) / 내 예측(보라) / 지우기
  function row(o){
    var x = o.x, j = o.j, v = j.v, now = Date.now();
    var h = '<article class="og-c og-lc ' + j.st + '"' + (j.gr ? ' data-g="' + j.gr.k + '"' : '') + ' data-k="' + esc(x.k) + '">'
      + '<div class="og-ch"><span class="og-th">' + (v ? thumbImg(v) : '<span class="og-ph"></span>') + '</span>'
      + '<div class="og-ct"><b title="' + esc(x.t) + '">' + esc(x.t) + '</b>'
      + '<small><span class="og-rm">' + V.fmtM(x.M) + ' 돌파</span></small></div>'
      + '<div class="og-st2">' + (j.st === 'done' ? '<b class="og-acc">' + pct(j.acc) + '</b><span class="og-gr" data-g="' + j.gr.k + '">' + j.gr.n + '</span>'
        : '<span class="og-wt">' + (j.st === 'wait' ? '채점 기다림' : '채점 안 함') + '</span>') + '</div></div>';
    // 그래프 (영상 기록이 없으면 생략)
    if (v){
      var hint = j.st === 'wait' ? '<span>지금 <b>' + V.fmt(j.now) + '</b></span><span>남은 <b>' + V.fmt(x.M - j.now) + '</b></span>'
        : j.st === 'done' ? '<span>걸린 시간 <b>' + durTxt(j.L) + '</b></span>' : '';
      h += '<div class="og-gb"><div class="og-gt"><span class="og-gl">조회수 추이</span><span class="og-hint">' + hint + '</span></div>'
        + '<div class="og-gw">' + chart(v, x.M, { g: x.g, fixed: true, ai: x.ai, act: j.st === 'done' || j.st === 'void' ? j.c.ms : null, from: x.at }) + '</div></div>';
    }
    // 예측기 예상 (남길 때 저장한 값)
    if (j.st === 'wait' || j.st === 'done'){
      h += '<div class="og-aip"><span class="og-aik"><i></i>예측기 예상</span>'
        + (x.ai == null ? '<small>그때는 기록이 모자라 계산 전' + (j.st === 'done' ? ' — 대결 없음' : '') + '</small>'
          : (x.ai === 0 ? '<b>닿기 어렵다고 봄</b>' : '<b>' + whenTxt(x.ai) + '</b>')
            + (j.st === 'done' ? '<small>정확도 ' + pct(j.ai) + ' · ' + (j.win > 0 ? '<em class="w">내가 이김</em>' : j.win < 0 ? '<em class="l">예측기가 이김</em>' : '<em>무승부</em>') + '</small>'
              // 채점 기다림도 두 줄로 (같은 줄 카드끼리 높이가 같게): 남길 때 본 값 · 그때까지 남은 시간
              : '<small>' + aiLine(x, now) + '</small>'))
        + '</div>';
    }
    // 내 예측 (예측기 예상과 같은 모양의 보라 상자): 고른 때 / 아랫줄 — 기다림: 예측기와 비교, 채점 끝: 실제와의 차이, 그 밖: 안내
    var my = myLine(x, j), myH = my.tone ? '<em class="' + my.tone + '">' + esc(my.t) + '</em>' : esc(my.t);
    h += '<div class="og-aip og-myp"><span class="og-aik"><i></i>내 예측</span><b>' + whenTxt(x.g) + '</b><small>' + myH + '</small></div>';
    // 남긴 기록(등록 일시 · 예측 당시 조회수) · 남은 시간 · 성공 확률
    h += '<div class="og-have og-mine">'
      + '<div class="og-myl">'
      + '<div><small>등록 일시</small><b>' + whenTxt(x.at) + '</b></div>'
      + '<div><small>예측 당시 조회수</small><b>' + V.fmtM(x.v0) + '</b></div></div>';
    if (j.st === 'wait'){
      var left = x.g - now;
      h += '<div class="og-flw' + (left > 0 ? '' : ' over') + '">'
        + '<small class="og-flh">' + (left > 0 ? '예측한 때까지 남은 시간' : '예측한 때가 ' + durTxt(-left) + ' 지났는데 아직 못 넘음') + '</small>'
        + led(x.g, left <= 0) + progress(x, j) + '</div>';
    }
    h += '</div><div class="og-lf">';
    // 지우기: 그 자리에서 한 번 더 확인 (브라우저 confirm 창은 앱 · 웹뷰에서 막혀 아무 일도 안 일어날 수 있어 쓰지 않는다)
    if (DELK === x.k) h += '<span class="og-cf"><small>이 예측을 지울까요?</small><button type="button" class="og-yes" data-og-yes="' + esc(x.k) + '">지우기</button>'
      + '<button type="button" class="og-no" data-og-no>취소</button></span>';
    else h += '<button type="button" class="og-del" data-og-del="' + esc(x.k) + '">지우기</button>';
    // 공유하기는 오른쪽 끝 (사용자 요청: 지우기 ↔ 공유하기 자리 바꿈)
    if (window.SGShare) h += '<button type="button" class="gs og-shr" data-og-shr="' + esc(x.k) + '">' + SHRI + '공유하기</button>';
    return h + '</div></article>';
  }
  // 내 예측 상자 아랫줄 { t: 글, tone: fast · slow · eq } — 기다림: 위 상자 예측기 예상(x.ai)과 비교, 채점 끝: 실제와 차이, 그 밖: 안내
  function myLine(x, j){
    if (j.st === 'done') return { t: '실제 ' + actual(j.c) + ' · ' + (Math.abs(j.err) < 60e3 ? '분 단위까지 정확' : durTxt(j.err) + ' ' + (j.err < 0 ? '이르게' : '늦게') + ' 예측') };
    if (j.st === 'void') return { t: '등록하기 전(마지막 기록과 등록 일시 사이)에 이미 넘어서 채점하지 않습니다 · 실제 ' + actual(j.c) };
    if (j.st === 'gone') return { t: '이 영상의 기록을 더는 찾을 수 없어 채점할 수 없습니다' };
    if (x.ai == null) return { t: '예측기는 그때 기록이 모자라 비교할 수 없어요' };
    if (x.ai === 0) return { t: '예측기는 닿기 어렵다고 봤어요' };
    var gp = x.ai - x.g;
    return Math.abs(gp) < 30 * 60e3 ? { t: '예측기와 내 예측이 거의 같아요', tone: 'eq' }
      : gp < 0 ? { t: '예측기는 내 예측보다 ' + durTxt(-gp) + ' 빨라요', tone: 'fast' } : { t: '예측기는 내 예측보다 ' + durTxt(gp) + ' 느려요', tone: 'slow' };
  }
  // 예측기 예상 상자 아랫줄 (기다림)
  function aiLine(x, now){ return x.ai === 0 ? '대결에서 정확도 0%' : x.ai > now ? '지금부터 ' + durTxt(x.ai - now) + ' 뒤' : durTxt(now - x.ai) + ' 지남'; }
  // 채점 기다림 카드 아래 상자 (사용자 요청 9/24): [목표까지 N 남음 ··· 지금 / 목표] + 예측 성공 확률
  //   성공 = 정확도 75%(족집게) 이상 = 실제로 넘는 때 c 가 [등록 + (고른 때 − 등록) ÷ 1.25, 등록 + (고른 때 − 등록) ÷ 0.75] 안.
  //   c 의 분포: ③ 추세 곡선으로 본 도달까지 날 수 T 를 로그정규로 — 가운데 = 지금 k 로 본 T, 폭(σ) = k ± 0.15 로 본 T 의 차이(최소 0.2).
  //   추세로는 못 닿는다고 나오면 지금 하루 증가 그대로 이어 간다고 보고 σ 0.6. 일부러 단순하게 둔 어림값이다
  function erf(z){ var t = 1 / (1 + 0.3275911 * Math.abs(z)), y = 1 - (((((1.061405429 * t - 1.453152027) * t) + 1.421413741) * t - 0.284496736) * t + 0.254829592) * t * Math.exp(-z * z); return z < 0 ? -y : y; }
  function winChance(x, v){
    var P = V.plan(v); if (!P || !(P.g > 0)) return null;
    var VE = window.VE, d = VE.daysTo(P, x.M), sg;
    if (d == null){ d = (x.M - P.V) / P.g; sg = 0.6; }
    else { var lo = VE.daysTo(P, x.M, Math.max(VE.KMIN, P.k - 0.15)), hi = VE.daysTo(P, x.M, P.k + 0.15);
      sg = hi == null || !(lo > 0) ? 0.6 : Math.max(0.2, Math.log(hi / lo) / 2); }
    if (!(d > 0)) return null;
    var last = V.lastMs(v), gu = x.g - x.at;
    function cdf(ms){ var t = (ms - last) / D; return t <= 0 ? 0 : 0.5 * (1 + erf((Math.log(t) - Math.log(d)) / (sg * Math.SQRT2))); }
    return Math.max(0, cdf(x.at + gu / 0.75) - cdf(x.at + gu / 1.25));
  }
  function chancePct(x, j){ var p = winChance(x, j.v); return p == null ? null : Math.max(1, Math.min(99, Math.round(p * 100))); }
  function chanceTone(pc){ return pc == null ? '' : pc >= 60 ? 'hi' : pc >= 30 ? 'mid' : 'lo'; }
  function progress(x, j){
    var pc = chancePct(x, j), tone = chanceTone(pc);
    return '<div class="og-prg"><div class="og-prgh"><span>목표까지 <b>' + V.fmt(Math.max(0, x.M - j.now)) + '</b> 남음</span>'
      + '<span class="og-prgv">지금 ' + V.fmt(j.now) + ' / ' + V.fmtM(x.M) + '</span></div>'
      + '<div class="og-prgp ' + tone + '"><span>예측 성공 확률</span><b>' + (pc == null ? '—' : pc + '%') + '</b></div>'
      + '<small class="og-prgn">' + (pc == null ? '기록이 조금 더 쌓이면 계산합니다'
        : '지금 추세로 보면 내 예측이 족집게(정확도 75%) 이상으로 맞을 가능성이에요') + '</small></div>';
  }
  // 기록 카드 [공유하기] → 공유 카드 이미지 (tools/share.js SGShare.oracle). 누른 때 기준으로 고정
  var SHRI = '<svg viewBox="0 0 24 24" aria-hidden="true" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="18" cy="5" r="3"/><circle cx="6" cy="12" r="3"/><circle cx="18" cy="19" r="3"/><path d="M8.6 13.5l6.8 4M15.4 6.5l-6.8 4"/></svg>';
  var GC = { god: '#f0c75e', seer: '#cdb9ff', hit: '#6fe0b3', ok: '#8cc8f5', meh: '#aeaeb2', miss: '#8e8e93' };   // 등급 색 (theme.css #v-oracle [data-g])
  // 화면 카드와 같은 짜임(9/24): 예측기 예상 상자 · 내 예측 상자(아랫줄 비교 · 등록 일시 · 예측 당시 조회수) · 기다림이면 [남은 시간 | 목표까지 | 성공 확률]
  function shareCard(x){
    var j = judge(x), v = j.v, now = Date.now(), my = myLine(x, j);
    var th = v && !V.demo() ? ['https://i.ytimg.com/vi/' + encodeURIComponent(v.id) + '/maxresdefault.jpg', 'https://i.ytimg.com/vi/' + encodeURIComponent(v.id) + '/hqdefault.jpg', V.thumb(v)] : [];
    var d = { id: x.id, at: now, title: x.t, thumbs: th, hue: (v && v.hue) || 270, M: V.fmtM(x.M) + ' 돌파', st: j.st, guess: whenTxt(x.g),
      my: { t: my.t, tone: my.tone || '' }, mine: [['등록 일시', whenTxt(x.at)], ['예측 당시 조회수', V.fmtM(x.v0)]], done: null, wait: null, ai: null };
    if (j.st === 'wait' || j.st === 'done')
      d.ai = { when: x.ai == null ? '계산 전' : x.ai === 0 ? '닿기 어렵다고 봄' : whenTxt(x.ai),
        sub: x.ai == null ? (j.st === 'done' ? '대결 없음' : '')
          : j.st === 'done' ? '정확도 ' + pct(j.ai) + ' · ' + (j.win > 0 ? '내가 이김' : j.win < 0 ? '예측기가 이김' : '무승부') : aiLine(x, now) };
    if (j.st === 'done') d.done = { acc: pct(j.acc), grade: j.gr.n, gc: GC[j.gr.k] };
    else if (j.st === 'wait'){
      var left = x.g - now, pc = chancePct(x, j);
      d.wait = { left: left > 0 ? durTxt(left) + ' 남음' : durTxt(-left) + ' 지남', over: left <= 0,
        remain: V.fmt(Math.max(0, x.M - j.now)) + ' 남음', nowgoal: '지금 ' + V.fmt(j.now) + ' / ' + V.fmtM(x.M),
        prob: pc == null ? '—' : pc + '%', ptone: chanceTone(pc) };
    }
    return d;
  }
  // 카운트다운 LED 숫자 (채점 기다림 카드) — 사용자 요청 "점(LED, 노랑) 숫자 시계", 꾸밈(시한폭탄 판 · 전선)은 빼고 숫자만
  //   5×7 점 글자(도트 매트릭스)로 [일] : 시 : 분 : 초. 꺼진 점도 희미하게 보인다
  //   1초마다 ledTick 이 바뀐 글자만 다시 그린다. 고른 때가 지나면 00 에서 멈추고 빨강으로 깜빡임(.over)
  var DOTS = {
    '0': ['01110', '10001', '10011', '10101', '11001', '10001', '01110'], '1': ['00100', '01100', '00100', '00100', '00100', '00100', '01110'],
    '2': ['01110', '10001', '00001', '00010', '00100', '01000', '11111'], '3': ['11111', '00010', '00100', '00010', '00001', '10001', '01110'],
    '4': ['00010', '00110', '01010', '10010', '11111', '00010', '00010'], '5': ['11111', '10000', '11110', '00001', '00001', '10001', '01110'],
    '6': ['00110', '01000', '10000', '11110', '10001', '10001', '01110'], '7': ['11111', '00001', '00010', '00100', '01000', '01000', '01000'],
    '8': ['01110', '10001', '10001', '01110', '10001', '10001', '01110'], '9': ['01110', '10001', '10001', '01111', '00001', '00010', '01100']
  };
  function ledParts(ms){
    var s = Math.max(0, Math.floor(ms / 1000));
    return { d: Math.floor(s / 86400), h: Math.floor(s / 3600) % 24, m: Math.floor(s / 60) % 60, s: s % 60 };
  }
  function ledDigit(c){
    return '<span class="og-ld" data-c="' + c + '">' + DOTS[c].join('').split('').map(function(b){ return b === '1' ? '<i class="on"></i>' : '<i></i>'; }).join('') + '</span>';
  }
  function ledVal(p, k){ return k === 'd' ? String(p.d) : two(p[k]); }
  function led(to, over){
    var p = ledParts(to - Date.now()), ks = p.d > 0 ? ['d', 'h', 'm', 's'] : ['h', 'm', 's'];
    var nd = ks.reduce(function(n, k){ return n + ledVal(p, k).length; }, 0), u = nd * 6.6 + (nd - ks.length) * 0.9 + (ks.length - 1) * 3.4 + 1;
    return '<div class="og-bomb' + (over ? ' over' : '') + '" data-to="' + to + '" aria-label="남은 시간">'
      + '<div class="og-lcd" style="--u:' + u.toFixed(1) + '">'
      + ks.map(function(k, i){
          return (i ? '<span class="og-lcol"><i></i><i></i></span>' : '')
            + '<span class="og-lu"><span class="og-lds" data-u="' + k + '">' + ledVal(p, k).split('').map(ledDigit).join('') + '</span></span>';   // 단위 글자(시간 · 분 · 초)는 사용자 요청으로 뺌
        }).join('') + '</div></div>';
  }
  // 1초마다: 보이는 시한폭탄 시계의 바뀐 글자만 (카드 전체는 30초마다 tick 이 다시 그림)
  function ledTick(){
    Array.prototype.forEach.call(el.querySelectorAll('.og-bomb[data-to]:not(.over)'), function(w){
      var p = ledParts(+w.getAttribute('data-to') - Date.now());
      Array.prototype.forEach.call(w.querySelectorAll('.og-lds'), function(g){
        var t = ledVal(p, g.getAttribute('data-u')), ds = g.querySelectorAll('.og-ld');
        if (ds.length !== t.length){ g.innerHTML = t.split('').map(ledDigit).join(''); return; }
        Array.prototype.forEach.call(ds, function(d, i){ if (d.getAttribute('data-c') !== t[i]) d.outerHTML = ledDigit(t[i]); });
      });
    });
  }
  // 실제로 넘은 때: 두 기록 간격이 1.5시간 안이면 분까지, 넓으면 두 기록 시각 사이
  function actual(c){
    if (c.ms1 - c.ms0 <= 1.5 * H) return whenTxt(c.ms) + '쯤';
    return whenTxt(c.ms0) + ' ~ ' + (new Date(c.ms0).toDateString() === new Date(c.ms1).toDateString() ? '' : dayTxt(c.ms1) + ' ') + timeTxt(c.ms1) + ' 사이';
  }

  // ----- 채점 방법 -----
  function rules(){
    return '<div class="og-rule"><p>정확도 = 100% − <b>오차</b> ÷ <b>기간</b>. 오차는 고른 때와 실제로 넘은 때의 차이, 기간은 예측을 등록한 때부터 실제로 넘은 때까지입니다. '
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
    if ((t = e.target.closest('[data-og-pg]'))){
      var to = t.getAttribute('data-og-pg'); if (to === mode) return;
      mode = to; DELK = null;
      var y = el.querySelector('.og-pt').getBoundingClientRect().top;         // 버튼 줄이 화면에서 같은 자리에 있게
      render();
      var y2 = el.querySelector('.og-pt').getBoundingClientRect().top; if (y < 0 || y2 !== y) window.scrollBy(0, y2 - Math.max(y, 0));
      return;
    }
    if ((t = e.target.closest('[data-og-fav]'))){
      var fc = t.closest('.og-c'), fid = fc.getAttribute('data-vid'), fv = byId(fid);
      V.toggleFav(fid); delete DRAFT[fid];
      if (window.toastSG && fv) window.toastSG('즐겨찾기에서 뺐습니다', esc(fv.title) + ' · 남긴 예측 기록은 그대로입니다');
      renderCards(); return;
    }
    if ((t = e.target.closest('[data-og-shr]'))){
      var sx = LOG.filter(function(y){ return y.k === t.getAttribute('data-og-shr'); })[0];
      if (sx && window.SGShare) SGShare.oracle(shareCard(sx));
      return;
    }
    if ((t = e.target.closest('[data-og-del]'))){ DELK = t.getAttribute('data-og-del'); tick(); return; }
    if (e.target.closest('[data-og-no]')){ DELK = null; tick(); return; }
    if ((t = e.target.closest('[data-og-yes]'))){
      var k = t.getAttribute('data-og-yes');
      LOG = LOG.filter(function(y){ return y.k !== k; }); save(); DELK = null;
      renderCards(); tick(); return;
    }
  });
  el.addEventListener('input', function(e){
    var inp = e.target.closest('[data-og-in]'); if (!inp) return;
    var c = inp.closest('.og-c'); DRAFT[c.getAttribute('data-vid')].val = inp.value; live(c);
  });
})();
