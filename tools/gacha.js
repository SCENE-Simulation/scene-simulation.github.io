// 포토카드 뽑기 시뮬레이터
// 콜라보마다 포토카드 구성과 가격이 달라서, 뽑기 한 종류(G)를 데이터로 받아 화면과 계산을 만든다.
// 뽑기 목록은 두 곳에서 모은다.
//   1) 405빵 — source.html 이 넘겨주는 window.SG405
//   2) collections.js 에 등록한 컬렉션 중 구매 방식에 random:true(뽑기형)가 있는 것.
//      새 콜라보를 collections.js 에 추가하면 여기에도 자동으로 나타난다.
// 모든 카드가 같은 확률로 나온다고 본다.
(function(){
  var root = document.getElementById('page-sim');
  if (!root) return;

  var PENALTY = 5000;                 // 교환 가위바위보에서 지면 잃는 돈
  var HAND = ['가위', '바위', '보'];
  function svg(d){ return '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.9" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">' + d + '</svg>'; }
  var ICON = {
    one: svg('<rect x="6" y="3" width="12" height="18" rx="2"/><path d="M12 8.3l1 2 2.2.3-1.6 1.5.4 2.2-2-1.05-2 1.05.4-2.2-1.6-1.5 2.2-.3z"/>'),
    ff: svg('<path d="M4 6l7 6-7 6zM13 6l7 6-7 6z"/>'),
    swap: svg('<path d="M4 8h14l-3.5-3.5M20 16H6l3.5 3.5"/>'),
    tag: svg('<path d="M3.5 12.5l8.8-8.8H20v7.7l-8.8 8.8z"/><circle cx="15.6" cy="8.4" r="1.3"/>'),
    reset: svg('<path d="M4 4v5h5"/><path d="M5.1 15a7.5 7.5 0 1 0 1.3-7.6L4 9"/>'),
    chev: svg('<path d="M6 9l6 6 6-6"/>')
  };

  function $(id){ return document.getElementById(id); }
  function won(v){ return Math.round(v).toLocaleString('ko-KR'); }
  function esc(s){ return String(s).replace(/[&<>"']/g, function(c){ return { '&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;' }[c]; }); }
  function cssv(n){ return getComputedStyle(document.documentElement).getPropertyValue(n).trim(); }
  function H(k){ var s = 0; for (var i = 1; i <= k; i++) s += 1 / i; return s; }
  function pctTxt(p){
    if (!isFinite(p) || p * 100 < 0.01) return '0.01% 미만';
    if (p * 100 > 99.99) return '99.99% 이상';
    return (p * 100).toFixed(2) + '%';
  }

  // ---------- 확률 계산 ----------
  // 한 장 뽑을 때 새 카드가 나올 확률은 (N - 가진 종 수) / N 이다.
  // p[j] = 가진 종 수가 j 일 확률. 한 장 더 뽑은 뒤의 분포로 바꾼다.
  function step(p, N){
    for (var j = N; j >= 1; j--) p[j] = p[j] * (j / N) + p[j - 1] * ((N - j + 1) / N);
    p[0] = 0;
  }
  // start 종을 가진 상태에서 n장 더 뽑았을 때 N종을 다 모았을 확률 curve[n] (정확한 값)
  function doneCurve(N, start){
    var p = new Float64Array(N + 1); p[Math.min(start, N)] = 1;
    var out = [p[N]], cap = Math.ceil(N * H(N) * 10) + 100;
    for (var n = 1; n <= cap && p[N] < 0.99995; n++){ step(p, N); out.push(p[N]); }
    return out;
  }
  function at(curve, n){ return n < 0 ? 0 : (n < curve.length ? curve[n] : 1); }
  function firstAt(curve, q){ for (var n = 0; n < curve.length; n++) if (curve[n] >= q) return n; return curve.length; }
  // n장 뽑은 뒤 가진 종 수의 10%·90% 지점 (n = 0..upto)
  function ownedBand(N, upto){
    var p = new Float64Array(N + 1), lo = [], hi = [];
    p[0] = 1;
    for (var n = 0; n <= upto; n++){
      if (n) step(p, N);
      var c = 0, a = -1, b = -1;
      for (var j = 0; j <= N; j++){ c += p[j]; if (a < 0 && c >= 0.1) a = j; if (b < 0 && c >= 0.9) b = j; }
      lo.push(a < 0 ? N : a); hi.push(b < 0 ? N : b);
    }
    return { lo: lo, hi: hi };
  }
  // n장 뽑은 사람 중 가진 종 수가 o 이상인 비율 (작을수록 운이 좋다)
  function atLeast(N, n, o){
    var p = new Float64Array(N + 1); p[0] = 1;
    for (var k = 0; k < n; k++) step(p, N);
    var s = 0; for (var j = o; j <= N; j++) s += p[j];
    return Math.min(1, s);
  }

  // 전략별로 끝까지 모으는 판을 여러 번 돌려 총비용을 정렬해 둔다.
  // 1: 중복이 2장 쌓이면 교환, 2: 여기에 더해 다음 새 카드의 기대 비용이 중고가보다 비싸지면 중고 구매
  function policies(G){
    var a = [{ k: 0, name: '뽑기만' }];
    if (G.trade) a.push({ k: 1, name: '뽑기 + 교환' });
    if (G.used) a.push({ k: 2, name: G.trade ? '뽑기 + 교환 + 중고' : '뽑기 + 중고' });
    return a;
  }
  function trialsOf(G){ return Math.max(3000, Math.min(20000, Math.round(2.5e6 / (G.N * H(G.N))))); }
  function simCost(G, policy, trials){
    var N = G.N, res = new Float64Array(trials);
    for (var t = 0; t < trials; t++){
      var cnt = new Uint16Array(N), o = 0, dup = 0, cost = 0;
      while (o < N){
        var act = 0;
        if (G.trade && policy >= 1 && dup >= 2) act = 1;
        else if (policy === 2 && G.price * N / (N - o) > G.used) act = 2;
        if (act === 0){
          var i = (Math.random() * N) | 0; cost += G.price;
          if (cnt[i] === 0) o++; else dup++;
          cnt[i]++;
        } else if (act === 1){
          var loss = 0;
          for (;;){ var r = (Math.random() * 3) | 0; if (r === 0) break; if (r === 1) loss++; }
          cost += loss * PENALTY; dup -= 2; o++;
        } else { cost += G.used; o++; }
      }
      res[t] = cost;
    }
    res.sort();
    return res;
  }
  function rankIn(arr, v){ var lo = 0, hi = arr.length; while (lo < hi){ var m = (lo + hi) >> 1; if (arr[m] <= v) lo = m + 1; else hi = m; } return lo / arr.length; }
  function qOf(arr, p){ return arr[Math.min(arr.length - 1, Math.floor(p * arr.length))]; }
  function avg(arr){ var s = 0; for (var i = 0; i < arr.length; i++) s += arr[i]; return s / arr.length; }

  // ---------- 뽑기 목록 ----------
  function from405(){
    var d = window.SG405; if (!d) return null;
    var groups = d.members.map(function(m, mi){
      var ids = []; for (var v = 0; v < d.vper; v++) ids.push(mi * d.vper + v);
      return { name: m.n, color: m.c, ids: ids };
    });
    var sp = []; for (var i = d.mtotal; i < d.N; i++) sp.push(i);
    groups.push({ name: '스페셜', color: '#f5b23a', ids: sp, sp: true });
    return { id: 'cu405', title: 'CU 리센느 405빵 콜라보', buy: '빵 1개', ready: '빵을 뜯어 보십시오',
      price: d.price, used: d.used, trade: true,
      names: d.names, src: d.src, cover: d.cover, coverCls: d.pix(d.N) ? 'pix' : '',
      land: d.land, pix: d.pix, groups: groups };
  }
  function fromCol(c){
    var ms = c.modes || [], rnd = ms.filter(function(m){ return m.random && m.price > 0; })[0];
    if (!rnd) return null;                                   // 뽑기형 구매가 없는 컬렉션은 시뮬레이션하지 않는다
    var used = ms.filter(function(m){ return m.k === 'used'; })[0], mem = c.mem || [];
    function ids(f){ var a = []; for (var i = 0; i < c.N; i++) if (f(mem[i])) a.push(i); return a; }
    var groups = (c.members || []).map(function(m, mi){
      return { name: m.n, color: m.c, ids: ids(function(x){ return x === mi; }) };
    }).filter(function(g){ return g.ids.length; });
    var sp = ids(function(x){ return x == null; });
    if (sp.length) groups.push(groups.length ? { name: '스페셜', color: '#f5b23a', ids: sp, sp: true } : { name: '전체', color: '#f5b23a', ids: sp, all: true });
    if (!groups.length) groups.push({ name: '전체', color: '#f5b23a', ids: ids(function(){ return true; }), all: true });
    return { id: c.id, title: c.title, buy: rnd.label, ready: '카드를 뽑아 보십시오',
      price: rnd.price, used: used && used.price > 0 ? used.price : 0, trade: ms.some(function(m){ return m.k === 'trade'; }),
      names: c.names, src: c.src, cover: '', coverCls: '',
      land: c.isLand, pix: function(){ return false; }, groups: groups };
  }
  function prep(G){
    G.N = G.names.length;
    G.mean = G.N * H(G.N);
    G.curve = doneCurve(G.N, 0);
    G.median = firstAt(G.curve, 0.5);
    G.q90 = firstAt(G.curve, 0.9);
    G.sims = null;
    var ms = G.groups.filter(function(g){ return !g.sp && !g.all; }), sp = G.groups.filter(function(g){ return g.sp; });
    var mc = ms.reduce(function(a, g){ return a + g.ids.length; }, 0), sc = sp.reduce(function(a, g){ return a + g.ids.length; }, 0);
    var same = ms.length > 1 && ms.every(function(g){ return g.ids.length === ms[0].ids.length; });
    var parts = [];
    if (ms.length) parts.push(same ? '멤버 ' + ms.length + '명 × ' + ms[0].ids.length + '종' : '멤버 ' + ms.length + '명 ' + mc + '종');
    if (sc) parts.push('스페셜 ' + sc + '종');
    G.comp = parts.join(' + ');                              // 비어 있으면 멤버 구분이 없는 뽑기
    return G;
  }
  var LIST = [];
  (function(){
    var g = from405(); if (g) LIST.push(g);
    (window.SGCOLS || []).forEach(function(c){ var x = fromCol(c); if (x) LIST.push(x); });
    LIST.forEach(prep);
  })();
  if (!LIST.length){ root.insertAdjacentHTML('beforeend', '<p class="gnote">뽑기 데이터를 불러오지 못했습니다.</p>'); return; }

  // ---------- 화면 ----------
  root.insertAdjacentHTML('beforeend',
    '<div class="gsel">'
    + '<div class="gsel-h">뽑기 종류<small>콜라보마다 포토카드 구성과 가격이 다릅니다</small></div>'
    + '<div class="gsel-list" id="g-list" role="radiogroup" aria-label="뽑기 종류"></div>'
    + '<p class="gsel-info" id="g-info"></p>'
    + '</div>'
    + '<div class="gview seg" id="g-view" role="tablist" aria-label="시뮬레이터 화면">'
    + '<button type="button" role="tab" data-v="draw">뽑기</button>'
    + '<button type="button" role="tab" data-v="ana">분석</button>'
    + '</div>'
    + '<div id="g-draw">'
    +   '<div class="board">'
    +     '<div class="top">'
    +       '<div class="stage" id="stage"><img id="hero" alt=""><div class="tag" id="tag">READY</div><div class="tag2" id="tag2"></div></div>'
    +       '<div>'
    +         '<div class="gpull">'
    +           '<button type="button" class="gp gp1" id="b1"><span class="gp-l">' + ICON.one + '1장 뽑기</span><span class="gp-s" id="b1s"></span></button>'
    +           '<button type="button" class="gp gp10" id="b10"><span class="gp-x">×10</span><span class="gp-l"><svg aria-hidden="true"><use href="#i-gacha"/></svg>10장 뽑기</span><span class="gp-s" id="b10s"></span></button>'
    +         '</div>'
    +         '<div class="gsub">'
    +           '<button type="button" class="gs" id="bauto">' + ICON.ff + '<span id="bauto-l">자동 완성</span></button>'
    +           '<button type="button" class="gs gs-m" id="btrade" title="중복 2장을 걸고 가위바위보로 없는 카드와 교환">' + ICON.swap + '교환<small>중복 2장</small></button>'
    +           '<button type="button" class="gs gs-m" id="bused" title="없는 카드 한 장을 중고로 구매">' + ICON.tag + '중고<small id="bused-p"></small></button>'
    +           '<button type="button" class="gs gs-r" id="breset">' + ICON.reset + '처음부터</button>'
    +         '</div>'
    +         '<div class="rps" id="rps" hidden>'
    +           '<div class="q">중복 2장을 넘기려면 가위바위보에서 이겨야 합니다. 지면 ' + won(PENALTY) + '원을 잃습니다.</div>'
    +           '<div class="hands"><button class="m" data-h="0">✌ 가위</button><button class="m" data-h="1">✊ 바위</button>'
    +           '<button class="m" data-h="2">✋ 보</button><button id="rpsclose">닫기</button></div>'
    +           '<div class="out" id="rpsout"></div><div class="sc" id="rpssc"></div>'
    +         '</div>'
    +         '<div class="stats">'
    +           '<div class="st"><b id="s-w">0</b><span>쓴 돈(원)</span></div>'
    +           '<div class="st"><b id="s-n">0</b><span>뽑은 장수</span></div>'
    +           '<div class="st"><b id="s-o">0</b><span>모은 종</span></div>'
    +           '<div class="st"><b id="s-d">0</b><span>중복 장수</span></div>'
    +         '</div>'
    +         '<div class="gprog" id="gprog">'
    +           '<div class="gprog-h"><span class="gprog-t">수집 진행률</span><b id="gp-n"></b><span class="gprog-pc" id="gp-pc"></span><span class="gprog-r" id="gp-r"></span></div>'
    +           '<div class="gprog-slots" id="gp-slots"></div>'
    +         '</div>'
    +         '<div class="stats" style="grid-template-columns:1fr 1fr">'
    +           '<div class="st"><b id="s-e">0</b><span>예상 총비용(원) = 지금까지 + 남은 기대</span></div>'
    +           '<div class="st"><b id="s-c">0</b><span id="s-cl">평균 대비(원)</span></div>'
    +         '</div>'
    +       '</div>'
    +     '</div>'
    +     '<div class="sets" id="sets"></div>'
    +     '<div class="result" id="result" hidden></div>'
    +     '<div class="log" id="log"></div>'
    +   '</div>'
    +   '<p class="rec" id="rec">완성 기록 없음</p>'
    + '</div>'
    + '<div id="g-ana" hidden>'
    +   '<h3 class="ahead">이 뽑기의 기본 수치</h3><div class="cmeta" id="a-meta"></div>'
    +   '<h3 class="ahead">지금 내 진행</h3><div id="a-now"></div>'
    +   '<div class="graph" id="a-prog"></div>'
    +   '<div class="graph" id="a-cdf"></div>'
    +   '<div class="graph" id="a-cost"></div>'
    +   '<div class="cmp" id="a-cmp"></div>'
    +   '<div class="graph" id="a-rec"></div>'
    + '</div>');

  // ---------- 뽑기 미니게임 페이지 (?tab=minigame) ----------
  // 원래 시뮬레이터 안의 세 번째 화면이었는데, 사이드바의 별도 페이지로 올렸다(pages.js 가 window.SGMINI 를 페이지로 등록).
  // 뽑기 종류(G)는 시뮬레이터와 같이 쓴다 — 어느 페이지에서 바꿔도 둘 다 바뀐다
  var mgPage = document.createElement('section');
  mgPage.id = 'v-minigame'; mgPage.className = 'wrap page'; mgPage.hidden = true;
  (document.querySelector('main.mn') || document.body).appendChild(mgPage);
  mgPage.insertAdjacentHTML('beforeend',
    '<div class="sec"><div class="sec-t"><svg viewBox="0 0 24 24"><use href="#i-toy"/></svg>장난감<span class="cr">›</span><span class="lt">뽑기 미니게임</span></div></div>'
    + '<p class="sec-d">원하는 포토카드 한 장을 고르고, 그 카드가 몇 번 만에 나오는지 도전해 보세요. 결과는 등급과 확률 그래프로 보여 주고, 도전 기록은 이 브라우저에 남습니다.</p>'
    + '<div class="gsel">'
    +   '<div class="gsel-h">뽑기 종류<small>콜라보마다 포토카드 구성이 다릅니다</small></div>'
    +   '<div class="gsel-list" id="mg-glist" role="radiogroup" aria-label="뽑기 종류"></div>'
    +   '<p class="gsel-info" id="mg-ginfo"></p>'
    + '</div>'
    + '<div id="g-mini">'
    // 순서: 카드 고르기 토글(뽑기 상자 위, 눌러서 펼치고 접음) → 뽑기 상자 → 결과 → 기록.
    // 결과는 늘 뽑기 버튼 바로 아래에 온다
    +   '<div class="mg-acc" id="mg-acc">'
    +     '<button type="button" class="mg-tog" id="mg-tog" aria-controls="mg-pick" aria-expanded="true">'
    +       '<span class="mg-tog-l">' + ICON.one + '<span id="mg-togt"></span></span>'
    +       '<span class="mg-tog-r"><span id="mg-togr"></span>' + ICON.chev + '</span>'
    +     '</button>'
    +     '<div class="mg-pick" id="mg-pick"></div>'
    +   '</div>'
    +   '<div class="mg-stage" id="mg-stage">'
    +     '<div class="mg-slots">'
    +       '<div class="mg-slot mg-target"><span class="mg-k">목표 카드</span><div class="mg-card" id="mg-tcard"><img alt=""></div>'
    +         '<b id="mg-tname"></b></div>'
    +       '<div class="mg-arrow" aria-hidden="true">→</div>'
    +       '<div class="mg-slot mg-draw" id="mg-draw"><span class="mg-k">뽑기 창</span><div class="mg-card" id="mg-dcard"><img alt=""></div>'
    +         '<b id="mg-count" aria-live="polite"></b><small id="mg-sub"></small></div>'
    +     '</div>'
    +     '<button type="button" class="gp gp1 mg-go" id="mg-go"><span class="gp-l">' + ICON.one + '<span id="mg-gol">뽑기 시작</span></span><span class="gp-s" id="mg-gos"></span></button>'
    +   '</div>'
    +   '<div class="mg-res" id="mg-res"></div>'
    +   '<div class="mg-hist" id="mg-hist"></div>'
    + '</div>');

  var hero = $('hero'), tag = $('tag'), tag2 = $('tag2'), stage = $('stage'), setsEl = $('sets'), logEl = $('log');
  var G = null, S = null, ST = {}, auto = null, view = 'draw', cells = [], progs = [];

  function fresh(){
    return { counts: new Array(G.N).fill(0), pulls: 0, spent: 0, trades: 0, buys: 0,
      rpsW: 0, rpsL: 0, rpsD: 0, penalty: 0, path: [[0, 0]], log: [], last: null, done: false };
  }
  function name(i){ return esc(G.names[i]); }
  function owned(){ var c = 0; for (var i = 0; i < G.N; i++) if (S.counts[i]) c++; return c; }
  function dupCount(){ var c = 0; for (var i = 0; i < G.N; i++) if (S.counts[i] > 1) c += S.counts[i] - 1; return c; }
  function missing(){ var m = []; for (var i = 0; i < G.N; i++) if (!S.counts[i]) m.push(i); return m; }
  // 평균과 남은 기대는 장수를 정수로 반올림해 비교한다 (뽑기 전에는 평균 대비 0)
  function meanCost(){ return Math.round(G.mean) * G.price; }
  function remPulls(rem){ return rem ? Math.round(G.N * H(rem)) : 0; }
  function pure(){ return !S.trades && !S.buys; }
  function note(){ S.path.push([S.pulls, owned()]); }       // 수집 곡선에 쓸 지점

  function setImg(el, i){
    var land = G.land(i) ? ' land' : '';
    if (!G.src[i]){ el.removeAttribute('src'); el.className = 'gback' + land; return; }   // 이미지가 아직 없는 카드는 뒷면 무늬
    el.src = G.src[i]; el.className = (G.pix(i) ? 'pix' : '') + land;
  }
  function showCover(){
    if (G.cover){ hero.src = G.cover; hero.className = G.coverCls; }
    else { hero.removeAttribute('src'); hero.className = 'gback'; }
    tag.textContent = 'READY'; tag.style.color = '#f5b23a'; tag2.textContent = G.ready;
  }
  function show(i, state){
    S.last = [i, state];
    setImg(hero, i);
    tag.textContent = state;
    tag.style.color = state.indexOf('NEW') === 0 ? '#4fd8c0' : (state.indexOf('DUP') === 0 ? '#a293c9' : '#f5b23a');
    tag2.textContent = G.names[i] + (S.counts[i] > 1 ? ' x' + S.counts[i] : '');
  }
  function flash(i){ var e = cells[i].el; e.classList.add('flash'); setTimeout(function(){ e.classList.remove('flash'); }, 280); }
  function say(t, cls){
    S.log.unshift([t, cls || '']); if (S.log.length > 60) S.log.length = 60;
    var p = document.createElement('div'); if (cls) p.className = cls; p.innerHTML = t; logEl.prepend(p);
    while (logEl.children.length > 60) logEl.lastChild.remove();
  }

  function buildSets(){
    var slots = $('gp-slots');
    setsEl.innerHTML = ''; slots.innerHTML = ''; cells = []; progs = [];
    $('gprog').classList.toggle('dense', G.N > 40);             // 카드가 많으면 슬롯 간격을 좁힌다
    G.groups.forEach(function(gr){
      // 진행률 슬롯: 카드 한 장당 한 칸, 멤버 그룹끼리 묶고 그룹 색으로 채운다
      var sg = document.createElement('div'); sg.className = 'gps';
      sg.style.flex = gr.ids.length + ' 1 0'; sg.style.setProperty('--c', gr.color);
      var sr = document.createElement('div'); sr.className = 'gps-s';
      var sn = document.createElement('span'); sn.className = 'gps-n'; sn.textContent = gr.name;
      sg.appendChild(sr); sg.appendChild(sn); slots.appendChild(sg);

      var box = document.createElement('div'); box.className = 'set' + (gr.sp ? ' sp' : '');
      var hd = document.createElement('div'); hd.className = 'shead';
      hd.innerHTML = '<span class="chip" style="background:' + gr.color + '"></span><b>' + esc(gr.name) + '</b>'
        + '<span class="vs">' + (gr.sp ? '스페셜 ' : gr.all ? '' : '같은 멤버 ') + gr.ids.length + '종</span><span class="pr num">0/' + gr.ids.length + '</span>';
      var row = document.createElement('div'); row.className = 'row';
      var rowW = document.createElement('div'); rowW.className = 'row wide';
      gr.ids.forEach(function(i){
        var land = G.land(i);
        var wrap = document.createElement('div'); wrap.className = 'gitem' + (land ? ' land' : '');
        var d = document.createElement('div'); d.className = 'cell' + (land ? ' land' : '');
        var c = document.createElement('img'); setImg(c, i); c.alt = '';
        var b = document.createElement('span'); b.className = 'd'; b.style.display = 'none';
        var v = document.createElement('div'); v.className = 'v'; v.textContent = v.title = (i + 1) + '. ' + G.names[i];
        d.appendChild(c); d.appendChild(b); d.title = G.names[i] + ' (No.' + (i + 1) + ')';
        wrap.appendChild(d); wrap.appendChild(v);
        var sl = document.createElement('i'); sl.title = (i + 1) + '. ' + G.names[i]; sl.style.setProperty('--k', i); sr.appendChild(sl);
        (land ? rowW : row).appendChild(wrap); cells[i] = { el: d, dup: b, wrap: wrap, slot: sl };
      });
      box.appendChild(hd);
      if (row.children.length) box.appendChild(row);
      if (rowW.children.length) box.appendChild(rowW);
      setsEl.appendChild(box);
      progs.push({ el: hd.querySelector('.pr'), ids: gr.ids, slot: sg });
    });
  }
  // 새 카드를 얻은 칸을 한 번 튀어 오르게 한다
  function pop(i){ var s = cells[i].slot; s.classList.remove('pop'); void s.offsetWidth; s.classList.add('pop'); }

  function render(){
    var N = G.N, o = owned(), rem = N - o, dup = dupCount();
    $('s-n').textContent = won(S.pulls);
    $('s-w').textContent = won(S.spent);
    $('s-o').textContent = o + '/' + N;
    $('s-d').textContent = won(dup);
    var exp = S.spent + remPulls(rem) * G.price, diff = exp - meanCost();
    $('s-e').textContent = won(exp);
    var dEl = $('s-c');
    dEl.textContent = (diff > 0 ? '+' : '') + won(diff);
    dEl.style.color = diff > 0 ? 'var(--pink)' : 'var(--mint)';
    $('s-cl').textContent = '평균 ' + won(meanCost()) + '원 대비(원)';
    $('gp-n').textContent = o + ' / ' + N + '종';
    $('gp-pc').textContent = Math.floor(o / N * 100) + '%';      // 26/27 이 100% 로 보이지 않게 내림
    $('gp-r').textContent = rem ? '남은 ' + rem + '종 · 다음 1장이 새 카드일 확률 ' + Math.round(rem / N * 100) + '%' : '컴플리트!';
    $('gprog').classList.toggle('done', !rem);
    for (var i = 0; i < N; i++){
      cells[i].el.classList.toggle('own', S.counts[i] > 0);
      cells[i].wrap.classList.toggle('own', S.counts[i] > 0);
      cells[i].slot.classList.toggle('on', S.counts[i] > 0);
      if (S.counts[i] > 1){ cells[i].dup.style.display = ''; cells[i].dup.textContent = 'x' + S.counts[i]; }
      else cells[i].dup.style.display = 'none';
    }
    progs.forEach(function(p){
      var c = 0; p.ids.forEach(function(i){ if (S.counts[i]) c++; });
      p.el.textContent = c + '/' + p.ids.length;
      p.slot.classList.toggle('full', c === p.ids.length);
    });
    $('btrade').disabled = dup < 2 || rem === 0;
    $('bused').disabled = rem === 0;
    $('b1').disabled = $('b10').disabled = $('bauto').disabled = rem === 0;
    if (view === 'ana') anaSoon();
  }

  // ---------- 완성 기록 ----------
  // 405빵은 예전 시뮬레이터가 쓰던 키를 그대로 써서 지난 기록을 잇는다
  function recKey(){ return G.id === 'cu405' ? 'bread27' : 'gacha:rec:' + G.id; }
  function loadRec(){ try { return JSON.parse(localStorage.getItem(recKey()) || '[]'); } catch (e){ return []; } }
  function showRec(){
    var r = loadRec(), el = $('rec');
    if (!r.length){ el.textContent = '완성 기록 없음'; return; }
    var s = r.reduce(function(a, b){ return a + b.n; }, 0), best = Math.min.apply(null, r.map(function(x){ return x.n; }));
    el.textContent = '완성 ' + r.length + '회 · 평균 ' + Math.round(s / r.length) + '장 · 최소 ' + best + '장('
      + won(best * G.price) + '원, 상위 ' + pctTxt(at(G.curve, best)) + ')';
  }

  function complete(){
    S.done = true;
    stopAuto();
    say('<b>' + G.N + '종 완성.</b> ' + won(S.pulls) + '장 · 총 ' + won(S.spent) + '원.', 'new');
    try {
      var r = loadRec(); r.push({ n: S.pulls, w: S.spent, pure: pure(), t: Date.now() }); if (r.length > 20) r.shift();
      localStorage.setItem(recKey(), JSON.stringify(r));
    } catch (e){}
    showResult(); showRec();
    if (view === 'ana') renderAna();
  }
  function showResult(){
    var box = $('result'), pu = pure(), rank = pctTxt(at(G.curve, Math.floor(S.spent / G.price)));
    var diff = S.spent - meanCost(), qRank = pctTxt(at(G.curve, S.pulls));
    box.hidden = false;
    box.innerHTML = '<div class="r1">상위 <span class="fig">' + rank + '</span>'
      + '<span class="tagx ' + (pu ? 'pure' : 'mix') + '">[' + (pu ? '순수 운빨' : '교환 및 구매 이용') + ']</span></div>'
      + '<div class="r2">총 ' + won(S.spent) + '원(' + won(S.pulls) + '장' + (pu ? '' : ' + 교환·중고') + ')으로 완성했습니다. '
      + '뽑기만 해서 모을 때의 총비용 분포에서 이 금액 이하로 끝날 확률이 ' + rank + '이므로 상위 ' + rank + '입니다. 적게 쓸수록 수치가 낮아집니다. '
      + '대괄호는 이번 판의 진행 방식으로, ' + (pu ? '뽑기만 사용했습니다.' : '교환과 중고 구매를 함께 사용해 지출을 줄인 판입니다.') + '</div>'
      + '<div class="r3">평균 ' + won(meanCost()) + '원(' + Math.round(G.mean) + '장) 대비 ' + (diff > 0 ? '+' : '') + won(diff) + '원 · 1종당 '
      + won(S.spent / G.N) + '원 · 장수 기준 확률 ' + qRank
      + (pu ? '' : ' · 교환 성공 ' + S.trades + '회(가위바위보 ' + S.rpsW + '승 ' + S.rpsL + '패 ' + S.rpsD + '무, 벌금 ' + won(S.penalty) + '원), 중고 구매 ' + S.buys + '회')
      + '</div>'
      + '<button type="button" class="g-go" data-go="ana">그래프로 분석 보기 →</button>';
  }

  // ---------- 뽑기 동작 ----------
  function pull(quiet){
    if (owned() === G.N) return;
    var i = Math.floor(Math.random() * G.N), isNew = S.counts[i] === 0;
    S.counts[i]++; S.pulls++; S.spent += G.price; note();
    show(i, isNew ? 'NEW No.' + (i + 1) : 'DUP No.' + (i + 1));
    if (!quiet){ stage.classList.remove('pop'); void stage.offsetWidth; stage.classList.add('pop'); }
    flash(i); if (isNew && !auto) pop(i);
    if (isNew) say(S.pulls + '장째 — <b>' + name(i) + '</b> 획득 (' + owned() + '/' + G.N + ')', 'new');
    else if (!quiet) say(S.pulls + '장째 — ' + name(i) + ' 중복');
    render();
    if (owned() === G.N) complete();
  }
  function stopAuto(){ if (auto){ clearInterval(auto); auto = null; } $('bauto-l').textContent = '자동 완성'; $('bauto').classList.remove('on'); }
  function rpsScore(){
    $('rpssc').textContent = '교환 승부 ' + (S.rpsW + S.rpsL + S.rpsD) + '회 — ' + S.rpsW + '승 ' + S.rpsL + '패 ' + S.rpsD + '무 · 벌금 누적 ' + won(S.penalty) + '원';
  }
  function rpsPlay(me){
    var m = missing();
    if (!m.length || dupCount() < 2){ $('rps').hidden = true; render(); return; }
    var cpu = (Math.random() * 3) | 0, out = $('rpsout'), head = '나 ' + HAND[me] + ' vs 상대 ' + HAND[cpu] + ' — ';
    if (me === cpu){
      S.rpsD++; out.innerHTML = head + '<b>무승부.</b> 다시 내십시오. (비용 없음)';
      say('교환 가위바위보 — 무승부 (' + HAND[me] + ')');
    } else if ((me + 2) % 3 === cpu){
      S.rpsW++;
      // 중복 2장을 내준다. 장수가 가장 많은 카드부터 한 장씩
      var gave = [];
      for (var k = 0; k < 2; k++){
        var src = -1, best = 1;
        for (var i = 0; i < G.N; i++) if (S.counts[i] > best){ best = S.counts[i]; src = i; }
        S.counts[src]--; gave.push(name(src));
      }
      var tt = m[(Math.random() * m.length) | 0]; S.counts[tt] = 1; S.trades++; note();
      show(tt, 'TRADE No.' + (tt + 1)); flash(tt); pop(tt);
      out.innerHTML = head + '<span class="w"><b>승리.</b></span> ' + name(tt) + ' 획득';
      say('교환 성공 — 중복 2장(' + gave.join(', ') + ')을 내주고 <b>' + name(tt) + '</b> 획득', 'new');
      render();
      if (owned() === G.N){ $('rps').hidden = true; complete(); return; }
    } else {
      S.rpsL++; S.penalty += PENALTY; S.spent += PENALTY;
      out.innerHTML = head + '<span class="l"><b>패배.</b></span> ' + won(PENALTY) + '원을 잃었습니다.';
      say('교환 실패 — 가위바위보 패배로 ' + won(PENALTY) + '원 차감 (누적 벌금 ' + won(S.penalty) + '원)');
      render();
    }
    rpsScore();
  }

  $('b1').onclick = function(){ pull(false); };
  $('b10').onclick = function(){
    for (var k = 0; k < 10 && owned() < G.N; k++) pull(true);
    stage.classList.remove('pop'); void stage.offsetWidth; stage.classList.add('pop');
    say('10장 뽑기 — 누적 ' + S.pulls + '장 · ' + won(S.spent) + '원');
  };
  $('bauto').onclick = function(){
    if (auto){ stopAuto(); return; }
    $('bauto-l').textContent = '멈추기'; this.classList.add('on');
    auto = setInterval(function(){ for (var k = 0; k < 3; k++) pull(true); }, 40);
  };
  $('btrade').onclick = function(){
    if (!missing().length || dupCount() < 2) return;
    $('rps').hidden = false;
    $('rpsout').textContent = '가위·바위·보 중 하나를 내십시오.';
    rpsScore();
  };
  $('rpsclose').onclick = function(){ $('rps').hidden = true; };
  Array.prototype.forEach.call(root.querySelectorAll('.rps .hands button[data-h]'), function(b){
    b.onclick = function(){ rpsPlay(+b.getAttribute('data-h')); };
  });
  $('bused').onclick = function(){
    var m = missing(); if (!m.length) return;
    var t = m[(Math.random() * m.length) | 0]; S.counts[t] = 1; S.spent += G.used; S.buys++; note();
    show(t, 'BUY No.' + (t + 1)); flash(t); pop(t);
    say('중고 구매 — <b>' + name(t) + '</b> ' + won(G.used) + '원에 확보');
    render();
    if (owned() === G.N) complete();
  };
  $('breset').onclick = function(){
    stopAuto();
    S = ST[G.id] = fresh();
    $('rps').hidden = true; $('result').hidden = true;
    showCover(); intro(); render(); showRec();
    if (view === 'ana') renderAna();
  };

  function intro(){
    logEl.innerHTML = '';
    say(G.N + '종 구성' + (G.comp ? '(' + G.comp + ')' : '') + '입니다. 카드 한 장이 나올 확률은 모두 1/' + G.N + '입니다.');
  }

  // ---------- 뽑기 종류 선택 · 화면 전환 ----------
  // 뽑기 종류 목록은 시뮬레이터(g-list)와 미니게임 페이지(mg-glist) 두 곳에 같은 내용으로 그린다
  function renderList(){
    var html = LIST.map(function(g){
      var on = g === G;
      return '<button type="button" class="gopt' + (on ? ' on' : '') + '" role="radio" aria-checked="' + on + '" data-g="' + esc(g.id) + '">'
        + '<b>' + esc(g.title) + '</b><small>' + g.N + '종 · 1장 ' + won(g.price) + '원</small></button>';
    }).join('');
    var info = (G.comp ? G.comp + ' = ' : '') + G.N + '종 · 카드 한 장이 나올 확률은 모두 1/' + G.N
      + ' · 1장 ' + won(G.price) + '원(' + G.buy + ')';
    $('g-list').innerHTML = $('mg-glist').innerHTML = html;
    $('g-info').textContent = $('mg-ginfo').textContent = info;
  }
  function select(id){
    var g = LIST.filter(function(x){ return x.id === id; })[0] || LIST[0];
    stopAuto(); mgStop();
    G = g;
    var isNew = !ST[G.id];
    S = ST[G.id] || (ST[G.id] = fresh());
    try { localStorage.setItem('gacha:sel', G.id); } catch (e){}
    renderList();
    buildSets();
    $('btrade').hidden = !G.trade;
    $('bused').hidden = !G.used;
    $('b1s').textContent = won(G.price) + '원';
    $('b10s').textContent = won(G.price * 10) + '원';
    $('bused-p').textContent = won(G.used) + '원';
    $('rps').hidden = true;
    if (isNew) intro();
    else logEl.innerHTML = S.log.map(function(e){ return '<div' + (e[1] ? ' class="' + e[1] + '"' : '') + '>' + e[0] + '</div>'; }).join('');
    if (S.last) show(S.last[0], S.last[1]); else showCover();
    render();
    if (S.done) showResult(); else $('result').hidden = true;
    showRec();
    if (view === 'ana') renderAna();
    if (!mgPage.hidden) renderMini();
  }
  function setView(v){
    view = v;
    Array.prototype.forEach.call($('g-view').children, function(b){
      var on = b.getAttribute('data-v') === v;
      b.classList.toggle('on', on); b.setAttribute('aria-selected', String(on));
    });
    $('g-draw').hidden = v !== 'draw';
    $('g-ana').hidden = v !== 'ana';
    if (v === 'ana') renderAna();
  }
  root.addEventListener('click', function(e){
    var o = e.target.closest('.gopt'); if (o){ select(o.getAttribute('data-g')); return; }
    var v = e.target.closest('#g-view [data-v]'); if (v){ setView(v.getAttribute('data-v')); return; }
    var go = e.target.closest('[data-go]'); if (go){ setView(go.getAttribute('data-go')); window.scrollTo(0, 0); }
  });

  // ---------- 분석 ----------
  var anaT = null;
  function anaSoon(){ if (anaT) return; anaT = setTimeout(function(){ anaT = null; if (view === 'ana') renderAna(); }, 150); }
  function renderAna(){ renderMeta(); renderNow(); renderProg(); renderCdf(); renderCost(); renderCmp(); renderRecs(); }

  function palette(){
    return { ink: cssv('--ink'), ink2: cssv('--ink2'), line: cssv('--line'), paper: cssv('--slot'),
      pink: cssv('--pink'), pinkT: cssv('--pink-t'), lav: cssv('--lav'), lavT: cssv('--lav-t'),
      mint: cssv('--mint'), mintT: cssv('--mint-t'), gold: cssv('--gold'), goldT: cssv('--gold-t') };
  }
  function t(x, y, s, fill, o){
    o = o || {};
    return '<text x="' + x.toFixed(1) + '" y="' + y.toFixed(1) + '" text-anchor="' + (o.a || 'middle') + '" font-size="' + (o.fs || 11) + '" fill="' + fill + '">' + s + '</text>';
  }
  function niceStep(span, n){
    var c = [1, 2, 5, 10, 20, 25, 50, 100, 200, 250, 500, 1000, 2000, 5000];
    for (var i = 0; i < c.length; i++) if (span / c[i] <= n) return c[i];
    return c[c.length - 1];
  }
  function manwon(v){ return (v / 10000).toFixed(1).replace(/\.0$/, '') + '만원'; }
  function tile(k, v, s){ return '<div class="mt"><span class="mk">' + k + '</span><b>' + v + '</b>' + (s ? '<small>' + s + '</small>' : '') + '</div>'; }

  function renderMeta(){
    $('a-meta').innerHTML =
      tile('카드 구성', G.N + '종', G.comp ? esc(G.comp) : '')
      + tile('1장 가격', won(G.price) + '원', esc(G.buy))
      + tile('컴플리트 평균', '약 ' + Math.round(G.mean) + '장', won(meanCost()) + '원')
      + tile('절반이 끝나는 지점', G.median + '장', '중앙값 · ' + won(G.median * G.price) + '원')
      + tile('90%가 끝나는 지점', G.q90 + '장', won(G.q90 * G.price) + '원')
      + tile('이론 최소', G.N + '장', '모두 다른 카드 · ' + won(G.N * G.price) + '원');
  }

  function renderNow(){
    var el = $('a-now'), N = G.N, o = owned(), p = S.pulls, rem = N - o;
    if (!p && pure()){
      el.innerHTML = '<p class="anote">아직 뽑지 않았습니다. <button type="button" class="g-go" data-go="draw">뽑기 화면으로</button> 가서 뽑으면 여기에서 내 진행을 분석합니다.</p>';
      return;
    }
    var expO = N * (1 - Math.pow(1 - 1 / N, p)), gap = o - expO;
    var h = tile('모은 종', o + ' / ' + N, p + '장 뽑음' + (pure() ? '' : ' · 교환·중고 포함'))
      + tile('같은 장수 평균', expO.toFixed(1) + '종', '내 결과 ' + (gap >= 0 ? '+' : '') + gap.toFixed(1) + '종');
    h += pure() ? tile('운 순위', '상위 ' + pctTxt(atLeast(N, p, o)), p + '장 뽑은 사람 중 ' + o + '종 이상 모은 비율')
                : tile('운 순위', '—', '교환·중고를 쓰면 뽑기 운만 따로 비교할 수 없습니다');
    if (rem){
      var c = doneCurve(N, o);
      h += tile('다음 1장이 새 카드일 확률', pctTxt(rem / N), '남은 ' + rem + '종')
        + tile('남은 기대', '약 ' + remPulls(rem) + '장', won(remPulls(rem) * G.price) + '원 더')
        + tile('10장 안에 끝날 확률', pctTxt(at(c, 10)), '50장 안에 ' + pctTxt(at(c, 50)));
    } else {
      h += tile('완성', won(S.spent) + '원', S.pulls + '장 · 상위 ' + pctTxt(at(G.curve, Math.floor(S.spent / G.price))));
    }
    el.innerHTML = '<div class="cmeta">' + h + '</div>';
  }

  // 수집 곡선: 뽑은 장수에 따라 모은 종 수가 어떻게 늘어나는지
  function renderProg(){
    var C = palette(), N = G.N, p = S.pulls;
    var xmax = Math.max(G.q90 * 1.1, p + 10), st = niceStep(xmax, 7); xmax = Math.ceil(xmax / st) * st;
    var band = ownedBand(N, xmax);
    var w = 640, h = 230, L = 40, R = 14, T = 14, B = 30;
    function X(n){ return L + n / xmax * (w - L - R); }
    function Y(o){ return T + (1 - o / N) * (h - T - B); }
    var s = '<svg viewBox="0 0 ' + w + ' ' + h + '" role="img" aria-label="뽑은 장수에 따른 모은 종 수">';
    [0, 0.25, 0.5, 0.75, 1].forEach(function(f){
      var o = Math.round(N * f);
      s += '<line x1="' + L + '" x2="' + (w - R) + '" y1="' + Y(o) + '" y2="' + Y(o) + '" stroke="' + C.line + '"/>' + t(L - 7, Y(o) + 4, o + '종', C.ink2, { a: 'end' });
    });
    for (var x = 0; x <= xmax; x += st) s += t(X(x), h - B + 16, x + '장', C.ink2);
    var d = '';
    for (var n = 0; n <= xmax; n++) d += (n ? 'L' : 'M') + X(n).toFixed(1) + ' ' + Y(band.hi[n]).toFixed(1) + ' ';
    for (var n2 = xmax; n2 >= 0; n2--) d += 'L' + X(n2).toFixed(1) + ' ' + Y(band.lo[n2]).toFixed(1) + ' ';
    s += '<path d="' + d + 'Z" fill="' + C.lav + '" opacity="0.22"/>';
    var e = '';
    for (var n3 = 0; n3 <= xmax; n3++) e += (n3 ? 'L' : 'M') + X(n3).toFixed(1) + ' ' + Y(N * (1 - Math.pow(1 - 1 / N, n3))).toFixed(1) + ' ';
    s += '<path d="' + e + '" fill="none" stroke="' + C.ink2 + '" stroke-width="2" stroke-dasharray="5 4"/>';
    if (S.path.length > 1){
      var m = '';
      S.path.forEach(function(q, k){ m += (k ? 'L' : 'M') + X(q[0]).toFixed(1) + ' ' + Y(q[1]).toFixed(1) + ' '; });
      s += '<path d="' + m + '" fill="none" stroke="' + C.pink + '" stroke-width="2.5" stroke-linejoin="round"/>';
      var last = S.path[S.path.length - 1];
      s += '<circle cx="' + X(last[0]).toFixed(1) + '" cy="' + Y(last[1]).toFixed(1) + '" r="5" fill="' + C.pink + '" stroke="' + C.paper + '" stroke-width="2"/>';
    }
    // 범례는 곡선이 지나가지 않는 오른쪽 아래에 둔다
    var lx = w - R - 4, ly = h - B - 10;
    s += t(lx, ly - 30, '— 평균', C.ink2, { a: 'end' }) + t(lx, ly - 15, '■ 80%가 들어오는 범위', C.lavT, { a: 'end' })
      + (S.path.length > 1 ? t(lx, ly, '— 내 기록', C.pinkT, { a: 'end' }) : '');
    s += '</svg>';
    $('a-prog').innerHTML = '<h3>수집 곡선<span>가로축 뽑은 장수 · 세로축 모은 종</span></h3>' + s
      + '<p class="gnote">' + (S.path.length > 1
        ? '분홍 선이 지금까지의 내 기록입니다. 보라 띠보다 위에 있으면 같은 장수를 뽑은 사람의 상위 10% 안쪽, 아래에 있으면 하위 10% 안쪽입니다.'
          + (pure() ? '' : ' 교환·중고로 얻은 카드는 선이 수직으로 올라갑니다.')
        : '뽑기 화면에서 뽑으면 내 기록이 분홍 선으로 겹쳐 그려집니다. 보라 띠는 같은 장수를 뽑은 사람 80%가 들어오는 범위입니다.') + '</p>';
  }

  // 누적 완성 확률 + 완성 장수 분포
  function renderCdf(){
    var C = palette(), N = G.N, p = S.pulls, o = owned(), done = S.done, pu = pure();
    var xmin = N, xmax = Math.max(firstAt(G.curve, 0.995), p + 25), st = niceStep(xmax - xmin, 7);
    xmax = Math.ceil(xmax / st) * st;
    var w = 640, L = 48, R = 14;
    function X(n){ return L + (Math.max(xmin, Math.min(xmax, n)) - xmin) / (xmax - xmin) * (w - L - R); }
    var ticks = [xmin];
    for (var k = Math.ceil((xmin + 1) / st) * st; k <= xmax; k += st) if (X(k) - X(ticks[ticks.length - 1]) > 34) ticks.push(k);
    var mean = Math.round(G.mean), med = G.median;

    var h1 = 220, T = 14, B = 34;
    function Y1(q){ return T + (1 - q) * (h1 - T - B); }
    var s = '<svg viewBox="0 0 ' + w + ' ' + h1 + '" role="img" aria-label="뽑은 장수별 누적 완성 확률">';
    for (var g = 0; g <= 1.001; g += 0.25)
      s += '<line x1="' + L + '" x2="' + (w - R) + '" y1="' + Y1(g) + '" y2="' + Y1(g) + '" stroke="' + C.line + '"/>' + t(L - 8, Y1(g) + 4, Math.round(g * 100) + '%', C.ink2, { a: 'end' });
    ticks.forEach(function(n){ s += t(X(n), h1 - B + 16, n + '장', C.ink2) + t(X(n), h1 - B + 29, manwon(n * G.price), C.ink2, { fs: 10 }); });
    s += '<line x1="' + X(mean) + '" x2="' + X(mean) + '" y1="' + T + '" y2="' + (h1 - B) + '" stroke="' + C.gold + '" stroke-dasharray="4 4"/>'
      + '<line x1="' + X(med) + '" x2="' + X(med) + '" y1="' + T + '" y2="' + (h1 - B) + '" stroke="' + C.ink2 + '" stroke-dasharray="4 4"/>'
      + t(X(mean) + 5, T + 12, '평균 ' + mean + '장', C.goldT, { a: 'start' }) + t(X(med) - 5, T + 12, '중앙값 ' + med + '장', C.ink2, { a: 'end' });
    var d = '';
    for (var n = xmin; n <= xmax; n++) d += (n === xmin ? 'M' : 'L') + X(n).toFixed(1) + ' ' + Y1(at(G.curve, n)).toFixed(1) + ' ';
    s += '<path d="' + d + '" fill="none" stroke="' + C.ink + '" stroke-width="2.5"/>';
    if (p && !done){
      // 지금 가진 종에서 이어서 뽑을 때의 완성 확률
      var cc = doneCurve(N, o), dd = '';
      for (var n1 = Math.max(p, xmin); n1 <= xmax; n1++) dd += (dd ? 'L' : 'M') + X(n1).toFixed(1) + ' ' + Y1(at(cc, n1 - p)).toFixed(1) + ' ';
      s += '<path d="' + dd + '" fill="none" stroke="' + C.pink + '" stroke-width="2.5" stroke-dasharray="6 4"/>';
      if (p >= xmin) s += '<line x1="' + X(p) + '" x2="' + X(p) + '" y1="' + T + '" y2="' + (h1 - B) + '" stroke="' + C.pink + '" stroke-width="1.5"/>';
      var right = X(p) > w * 0.7;
      s += t(X(p) + (right ? -8 : 8), T + 30, '지금 ' + p + '장 · 이어서 뽑으면', C.pinkT, { a: right ? 'end' : 'start', fs: 12 });
    } else if (done){
      var right2 = X(p) > w * 0.75;
      s += '<line x1="' + X(p) + '" x2="' + X(p) + '" y1="' + T + '" y2="' + (h1 - B) + '" stroke="' + C.pink + '" stroke-width="2"/>'
        + '<circle cx="' + X(p) + '" cy="' + Y1(at(G.curve, p)) + '" r="5" fill="' + C.pink + '" stroke="' + C.paper + '" stroke-width="2"/>'
        + t(X(p) + (right2 ? -8 : 8), Y1(at(G.curve, p)) - 10, '내 결과 ' + p + '장' + (pu ? '' : ' (교환·중고 포함)'), C.pinkT, { a: right2 ? 'end' : 'start', fs: 12 });
    }
    s += '</svg>';

    var h2 = 170, T2 = 12, B2 = 30, pk = 0;
    for (var n2 = xmin; n2 <= xmax; n2++){ var v = at(G.curve, n2) - at(G.curve, n2 - 1); if (v > pk) pk = v; }
    function Y2(v){ return T2 + (1 - v / pk) * (h2 - T2 - B2); }
    function pm(n){ return at(G.curve, n) - at(G.curve, n - 1); }
    var g2 = '<svg viewBox="0 0 ' + w + ' ' + h2 + '" role="img" aria-label="완성 장수 분포">';
    var area = 'M' + X(xmin) + ' ' + (h2 - B2) + ' ';
    for (var n3 = xmin; n3 <= xmax; n3++) area += 'L' + X(n3).toFixed(1) + ' ' + Y2(pm(n3)).toFixed(1) + ' ';
    g2 += '<path d="' + area + 'L' + X(xmax) + ' ' + (h2 - B2) + ' Z" fill="' + C.lav + '" opacity="0.3"/>';
    if (done){
      var fill = 'M' + X(xmin) + ' ' + (h2 - B2) + ' ';
      for (var n4 = xmin; n4 <= Math.min(p, xmax); n4++) fill += 'L' + X(n4).toFixed(1) + ' ' + Y2(pm(n4)).toFixed(1) + ' ';
      g2 += '<path d="' + fill + 'L' + X(Math.min(p, xmax)) + ' ' + (h2 - B2) + ' Z" fill="' + C.pink + '" opacity="0.45"/>';
    }
    var d2 = '';
    for (var n5 = xmin; n5 <= xmax; n5++) d2 += (n5 === xmin ? 'M' : 'L') + X(n5).toFixed(1) + ' ' + Y2(pm(n5)).toFixed(1) + ' ';
    g2 += '<path d="' + d2 + '" fill="none" stroke="' + C.ink + '" stroke-width="2"/>';
    g2 += '<line x1="' + L + '" x2="' + (w - R) + '" y1="' + (h2 - B2) + '" y2="' + (h2 - B2) + '" stroke="' + C.line + '"/>';
    ticks.forEach(function(n){ g2 += t(X(n), h2 - B2 + 16, n + '장', C.ink2); });
    if (p && (done || p >= xmin)) g2 += '<line x1="' + X(p) + '" x2="' + X(p) + '" y1="' + T2 + '" y2="' + (h2 - B2) + '" stroke="' + C.pink + '" stroke-width="2"/>'
      + t(X(p) + (X(p) > w * 0.75 ? -8 : 8), T2 + 12, (done ? '' : '지금 ') + p + '장', C.pinkT, { a: X(p) > w * 0.75 ? 'end' : 'start', fs: 12 });
    loadRec().forEach(function(r){
      if (r.n >= xmin && r.n <= xmax)
        g2 += '<polygon points="' + X(r.n) + ',' + (h2 - B2 - 5) + ' ' + (X(r.n) - 4) + ',' + (h2 - B2 + 3) + ' ' + (X(r.n) + 4) + ',' + (h2 - B2 + 3) + '" fill="' + C.lavT + '" opacity="0.8"/>';
    });
    g2 += '</svg>';

    var txt;
    if (done && pu) txt = '분홍 영역이 이번 결과보다 빨리 끝나는 경우입니다. 그 면적이 상위 ' + pctTxt(at(G.curve, p)) + '에 해당합니다.';
    else if (done) txt = '두 그래프는 뽑기만 해서 모을 때의 분포입니다. 이번 판은 교환·중고를 써서 뽑은 장수가 줄었습니다.';
    else if (p) txt = '분홍 점선은 지금 가진 ' + o + '종에서 이어서 뽑을 때, 가로축 장수까지 ' + N + '종을 다 모을 확률입니다.';
    else txt = '뽑기만 해서 ' + N + '종을 모을 때의 분포입니다. 평균은 약 ' + mean + '장, 절반은 ' + med + '장 안에 끝납니다.';
    $('a-cdf').innerHTML = '<h3>누적 완성 확률<span>가로축 뽑은 장수 · 세로축 그 장수 안에 ' + N + '종을 끝낼 확률</span></h3>' + s
      + '<h3>완성 장수 분포<span>정확히 그 장수에서 끝날 확률 · 삼각형은 지난 기록</span></h3>' + g2
      + '<p class="gnote">' + txt + '</p>';
  }

  // 전략별 총비용 분포 (몬테카를로)
  function sessPolicy(){
    var k = S.buys ? 2 : (S.trades ? 1 : 0), ps = policies(G);
    for (var i = 0; i < ps.length; i++) if (ps[i].k === k) return i;
    return 0;
  }
  function renderCost(){
    var box = $('a-cost'), g = G;
    if (!g.sims){
      box.innerHTML = '<h3>전략별 총비용 분포<span>계산 중…</span></h3>';
      setTimeout(function(){
        if (!g.sims){ var n = trialsOf(g); g.sims = policies(g).map(function(pl){ return simCost(g, pl.k, n); }); }
        if (G === g && view === 'ana'){ renderCost(); renderCmp(); }
      }, 30);
      return;
    }
    var C = palette(), sims = g.sims, ps = policies(g), pol = sessPolicy(), done = S.done, my = S.spent;
    var cols = [C.gold, C.mint, C.lav], colsT = [C.goldT, C.mintT, C.lavT];
    var xmax = Math.max(qOf(sims[0], 0.985), done ? my * 1.1 : 0), stw = niceStep(xmax / 10000, 6) * 10000;
    xmax = Math.ceil(xmax / stw) * stw;
    var w = 640, h = 230, L = 50, R = 14, T = 14, B = 34;
    function X(c){ return L + Math.min(c, xmax) / xmax * (w - L - R); }
    function Y(q){ return T + (1 - q) * (h - T - B); }
    var s = '<svg viewBox="0 0 ' + w + ' ' + h + '" role="img" aria-label="전략별 총비용 누적분포">';
    for (var gg = 0; gg <= 1.001; gg += 0.25)
      s += '<line x1="' + L + '" x2="' + (w - R) + '" y1="' + Y(gg) + '" y2="' + Y(gg) + '" stroke="' + C.line + '"/>' + t(L - 7, Y(gg) + 4, Math.round(gg * 100) + '%', C.ink2, { a: 'end' });
    for (var c = 0; c <= xmax; c += stw) s += t(X(c), h - B + 16, manwon(c), C.ink2);
    sims.forEach(function(arr, k){
      var d = '', stp = Math.max(1, Math.floor(arr.length / 240));
      for (var j = 0; j < arr.length; j += stp) d += (j === 0 ? 'M' : 'L') + X(arr[j]).toFixed(1) + ' ' + Y(j / arr.length).toFixed(1) + ' ';
      d += 'L' + X(arr[arr.length - 1]).toFixed(1) + ' ' + Y(1).toFixed(1);
      var hot = done && k === pol;
      s += '<path d="' + d + '" fill="none" stroke="' + cols[k] + '" stroke-width="' + (hot ? 3 : 2) + '" opacity="' + (done && !hot ? 0.55 : 1) + '"/>';
      // 범례는 곡선이 다 올라간 뒤라 비어 있는 오른쪽 아래에 둔다
      s += t(w - R - 4, h - B - 10 - (sims.length - 1 - k) * 15, ps[k].name + ' 평균 ' + won(avg(arr)) + '원', colsT[k], { a: 'end' });
    });
    var extra = '';
    if (done){
      var rk = at(g.curve, Math.floor(my / g.price)), rkPol = rankIn(sims[pol], my), right = my > xmax * 0.7;
      s += '<line x1="' + X(my) + '" x2="' + X(my) + '" y1="' + T + '" y2="' + (h - B) + '" stroke="' + C.pink + '" stroke-width="2"/>'
        + '<circle cx="' + X(my) + '" cy="' + Y(rk) + '" r="5" fill="' + C.pink + '" stroke="' + C.paper + '" stroke-width="2"/>'
        + t(X(my) + (right ? -8 : 8), Y(rk) - 10, '내 지출 ' + won(my) + '원 · 상위 ' + pctTxt(rk), C.pinkT, { a: right ? 'end' : 'start', fs: 12 });
      extra = '분홍 선이 이번 지출입니다. 상위 비율은 뽑기만 하는 분포(평균 ' + won(avg(sims[0])) + '원)를 공통 기준으로 계산하며, 같은 전략('
        + ps[pol].name + ') 안에서만 보면 상위 ' + pctTxt(rkPol) + '입니다. ';
    }
    s += '</svg>';
    box.innerHTML = '<h3>전략별 총비용 분포<span>전략마다 ' + won(sims[0].length) + '판씩 끝까지 모아 본 결과 · 가로축 총지출</span></h3>' + s
      + '<p class="gnote">' + extra + (done ? '' : '완성하면 내 총비용이 분홍 선으로 표시됩니다. ')
      + (g.trade ? '교환은 중복 2장을 가위바위보로 걸고, 지면 ' + won(PENALTY) + '원을 잃는 규칙입니다. ' : '')
      + (g.used ? '중고는 다음 새 카드를 뽑는 기대 비용이 중고가(' + won(g.used) + '원)보다 비싸질 때 삽니다.' : '') + '</p>';
  }

  // 비교 막대
  function renderCmp(){
    var N = G.N, o = owned(), rem = N - o, started = S.pulls || !pure();
    var expRemain = remPulls(rem) * G.price, expTotal = S.spent + expRemain, diff = expTotal - meanCost();
    var rows = [];
    if (started) rows.push({ k: '내 예상 총비용', v: expTotal, c: 'var(--pink)', n: rem ? '지금 ' + won(S.spent) + '원 + 남은 기대 ' + won(expRemain) + '원' : '완성' });
    rows.push({ k: '평균(뽑기만)', v: meanCost(), c: 'var(--gold)', n: '약 ' + Math.round(G.mean) + '장분' });
    if (G.sims){
      var ps = policies(G);
      for (var i = 1; i < ps.length; i++) rows.push({ k: ps[i].name + ' 평균', v: avg(G.sims[i]), c: i === 1 ? 'var(--mint)' : 'var(--lav)', n: '시뮬레이션 평균' });
    }
    rows.push({ k: '이론 최소', v: N * G.price, c: 'var(--ink2)', n: N + '장이 전부 다른 카드' });
    var mx = Math.max.apply(null, rows.map(function(r){ return r.v; })) * 1.02;
    var html = started
      ? '<div class="now"><b>' + won(S.spent) + '원</b><span>지금까지 지출 · ' + won(S.pulls) + '장'
        + (S.penalty ? ' · 교환 벌금 ' + won(S.penalty) + '원' : '') + (S.buys ? ' · 중고 ' + S.buys + '회' : '') + '</span>'
        + '<em style="color:' + (diff > 0 ? 'var(--pink)' : 'var(--mint)') + '">예상 총비용 ' + won(expTotal) + '원 (' + (diff > 0 ? '+' : '') + won(diff) + '원)</em></div>'
      : '<div class="now"><b>비용 비교</b><span>뽑기 화면에서 뽑으면 내 예상 총비용이 함께 표시됩니다</span></div>';
    rows.forEach(function(r){
      var pc = Math.max(1, Math.min(100, Math.round(r.v / mx * 100)));
      html += '<div class="crow"><div class="chead"><span class="ck">' + r.k + '</span><span class="cv">' + won(r.v) + '원</span><span>' + r.n + '</span></div>'
        + '<div class="track"><div class="fill" style="width:' + pc + '%;background:' + r.c + '"></div></div></div>';
    });
    html += '<p class="note2">1장 ' + won(G.price) + '원 기준입니다.' + (G.sims ? '' : ' 교환·중고 전략 평균은 계산이 끝나면 함께 표시됩니다.') + '</p>';
    $('a-cmp').innerHTML = html;
  }

  function renderRecs(){
    var r = loadRec(), box = $('a-rec');
    if (!r.length){
      box.innerHTML = '<h3>완성 기록<span>최근 20회</span></h3><p class="gnote">아직 완성 기록이 없습니다. 끝까지 모으면 여기에 쌓입니다.</p>';
      return;
    }
    var s = r.reduce(function(a, b){ return a + b.n; }, 0), best = Math.min.apply(null, r.map(function(x){ return x.n; }));
    var rows = r.slice().reverse().slice(0, 10).map(function(x, k){
      return '<tr><td>' + (r.length - k) + '</td><td>' + won(x.n) + '장</td><td>' + won(x.w) + '원</td><td>' + (x.pure ? '뽑기만' : '교환·중고') + '</td>'
        + '<td>상위 ' + pctTxt(at(G.curve, Math.floor(x.w / G.price))) + '</td></tr>';
    }).join('');
    box.innerHTML = '<h3>완성 기록<span>최근 20회 · 표는 최근 10회</span></h3>'
      + '<p class="gnote">완성 ' + r.length + '회 · 평균 ' + Math.round(s / r.length) + '장 · 최소 ' + best + '장(상위 ' + pctTxt(at(G.curve, best)) + ')</p>'
      + '<div class="atab-w"><table class="atab"><thead><tr><th>회차</th><th>장수</th><th>총비용</th><th>방식</th><th>총비용 기준</th></tr></thead><tbody>' + rows + '</tbody></table></div>';
  }

  // ---------- 뽑기 미니게임 ----------
  // 카드 한 장을 골라 그 카드가 몇 번 만에 나오는지 본다.
  // 한 번에 나올 확률이 1/N 이므로 n번 안에 나올 확률은 1 - (1 - 1/N)^n, 평균은 N번이다.
  var MINI = {}, mgT = [], mgEnd = null;       // 뽑기 종류별 목표 카드 · 결과, 연출 타이머, 연출을 끝내는 함수(연출 중일 때만)
  var GRADES = [                                // max: n번 안에 나올 확률이 이 값 이하이면 그 등급
    { t: '원샷 원킬', c: '#ffe08a', max: 0 },    // 첫 번째에 바로
    { t: '신의 손', c: '#ffe08a', max: 0.10 },
    { t: '금손', c: '#f3a93b', max: 0.30 },
    { t: '무난한 손', c: '#6fe0b3', max: 0.60 },
    { t: '아쉬운 손', c: '#c1a8ea', max: 0.85 },
    { t: '흙손', c: '#c9a27e', max: 0.97 },
    { t: '저주받은 손', c: '#f28aa7', max: 2 }
  ];
  // open: 카드 고르기 목록을 펼쳤는지. 처음엔 펼쳐 두고, 카드를 고르면 접는다
  function mini(){ return MINI[G.id] || (MINI[G.id] = { target: null, res: null, open: true }); }
  function mgKey(){ return 'gacha:mini:' + G.id; }
  function mgLoad(key){ try { return JSON.parse(localStorage.getItem(key || mgKey()) || '[]'); } catch (e){ return []; } }
  function within(n){ return 1 - Math.pow(1 - 1 / G.N, n); }
  function mgMedian(){ return Math.ceil(Math.log(0.5) / Math.log(1 - 1 / G.N)); }
  function gradeOf(n){
    if (n === 1) return GRADES[0];
    var q = within(n);
    for (var k = 1; k < GRADES.length; k++) if (q <= GRADES[k].max) return GRADES[k];
    return GRADES[GRADES.length - 1];
  }
  function backImg(img){ img.removeAttribute('src'); img.className = 'gback'; img.parentNode.classList.remove('land'); }
  function cardImg(img, i){ setImg(img, i); img.parentNode.classList.toggle('land', !!G.land(i)); }
  function coverImg(img){
    if (!G.cover){ backImg(img); return; }
    img.src = G.cover; img.className = G.coverCls; img.parentNode.classList.remove('land');
  }
  function mgStop(){
    mgT.forEach(clearTimeout); mgT = []; mgEnd = null;
    $('g-mini').classList.remove('busy'); $('mg-go').classList.remove('skip');
  }

  function renderMini(){
    var m = mini(), has = m.target != null, run = !!mgEnd;
    var tImg = $('mg-tcard').firstChild, dImg = $('mg-dcard').firstChild;
    if (has) cardImg(tImg, m.target); else backImg(tImg);
    $('mg-tname').textContent = has ? G.names[m.target] : '카드를 골라 주세요';
    if (!run){
      if (m.res){ cardImg(dImg, m.res.i); $('mg-count').textContent = won(m.res.n) + '번째'; $('mg-draw').classList.add('hit'); }
      else { coverImg(dImg); $('mg-count').textContent = '—'; $('mg-draw').classList.remove('hit'); }
    }
    $('mg-sub').textContent = '한 번에 나올 확률 1/' + G.N + ' (' + (100 / G.N).toFixed(2) + '%)';
    $('mg-go').disabled = !has;
    $('mg-gol').textContent = run ? '건너뛰기' : (m.res ? '한 번 더' : '뽑기 시작');
    $('mg-gos').textContent = run ? '결과 바로 보기'
      : has ? '나올 때까지 뽑기 · 평균 ' + G.N + '번'
      : '위에서 뽑고 싶은 카드를 먼저 고르세요';
    // 카드 고르기 토글: 접혀 있으면 "다른 카드 고르기 ▾", 펼치면 "접기 ▴"
    $('mg-acc').classList.toggle('open', m.open);
    $('mg-tog').setAttribute('aria-expanded', String(m.open));
    $('mg-togt').innerHTML = has ? '<small>목표 카드</small><b>' + name(m.target) + '</b>' : '<b>뽑고 싶은 카드를 골라 주세요</b>';
    $('mg-togr').textContent = m.open ? '접기' : (has ? '다른 카드 고르기' : '카드 고르기');
    $('mg-pick').hidden = !m.open;
    if (m.open) mgPicker();
    mgResult();
    mgHist();
  }

  function mgPicker(){
    var m = mini(), box = $('mg-pick');
    box.innerHTML = '';
    G.groups.forEach(function(gr){
      var g = document.createElement('div'); g.className = 'mg-grp';
      g.innerHTML = '<div class="mg-gh"><i style="background:' + gr.color + '"></i>' + esc(gr.name) + '</div>';
      var row = document.createElement('div'); row.className = 'mg-row';
      gr.ids.forEach(function(i){
        var b = document.createElement('button'); b.type = 'button';
        b.className = 'mg-pc' + (G.land(i) ? ' land' : '') + (m.target === i ? ' on' : '');
        b.setAttribute('data-mg', i);
        var im = document.createElement('img'); im.alt = ''; setImg(im, i);
        var s = document.createElement('span'); s.textContent = G.names[i];
        b.appendChild(im); b.appendChild(s); row.appendChild(b);
      });
      g.appendChild(row); box.appendChild(g);
    });
  }

  function mgRun(){
    if (mgEnd){ mgEnd(); return; }                            // 연출 중에 누르면 건너뛰기
    var m = mini(); if (m.target == null) return;
    var t = m.target, seq = [], k;
    do { k = (Math.random() * G.N) | 0; seq.push(k); } while (k !== t && seq.length < 1e5);
    var key = mgKey(), n = seq.length, draw = $('mg-draw'), dImg = $('mg-dcard').firstChild;
    function frame(idx){ cardImg(dImg, seq[idx]); $('mg-count').textContent = won(idx + 1) + '번째'; }
    m.res = null;
    mgEnd = function(){
      mgStop();
      m.res = { i: t, n: n, seq: seq };
      try { var r = mgLoad(key); r.push({ i: t, n: n, t: Date.now() }); if (r.length > 50) r.shift(); localStorage.setItem(key, JSON.stringify(r)); } catch (e){}
      renderMini();
      draw.classList.remove('hit'); void draw.offsetWidth; draw.classList.add('hit');
      // 결과 타일: 숫자는 0부터 올라가고 막대는 차오른다
      var rb = $('mg-res'); rb.classList.add('fresh'); mgCount();
      setTimeout(function(){ rb.classList.remove('fresh'); }, 1000);
    };
    $('g-mini').classList.add('busy'); $('mg-go').classList.add('skip'); draw.classList.remove('hit');
    renderMini();
    var reduce = window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)').matches;
    if (reduce || n === 1){ mgEnd(); return; }
    // 처음엔 빠르게 넘기다 끝으로 갈수록 느려지고, 목표 카드 직전에 잠깐 멈춘다.
    // 오래 걸린 판도 3초 안에 끝나도록 보여 줄 장면 수를 줄인다
    var D = Math.min(2600, 400 + n * 60), F = Math.min(n, 44), HOLD = 300;
    for (var f = 0; f < F - 1; f++) (function(f){
      var idx = Math.floor(f * (n - 1) / (F - 1));          // 마지막 장(목표 카드)은 mgEnd 에서 보여 준다
      mgT.push(setTimeout(function(){ frame(idx); }, D * Math.pow(f / (F - 1), 2.2)));
    })(f);
    mgT.push(setTimeout(function(){ if (mgEnd) mgEnd(); }, D + HOLD));
  }

  // 등급별 구간: [{ g, a, b }] — a번부터 b번까지 (마지막 등급은 b 가 없다)
  function mgRanges(){
    var out = [], cur = null, lastG = GRADES[GRADES.length - 1];
    for (var k = 1; k < 1e5; k++){
      var g = gradeOf(k);
      if (!cur || cur.g !== g){ if (cur) out.push(cur); cur = { g: g, a: k, b: k }; } else cur.b = k;
      if (g === lastG){ cur.b = null; break; }
    }
    out.push(cur);
    return out;
  }
  // 몇 번째에 처음 나오는지의 분포. 막대 하나 = 정확히 그 번째에 처음 나올 확률 p(1-p)^(k-1).
  // 막대 색은 등급 구간, 결과(n)가 있으면 n번째까지를 진하게 칠한다
  function mgChart(n){
    // 그리는 폭을 실제 화면 폭에 맞춘다. 640 으로 그려 모바일에서 줄이면 글자가 5px 로 작아진다
    var box = $('mg-res'), w = Math.max(320, Math.min(640, (box.clientWidth || 672) - 32));
    var C = palette(), p = 1 / G.N, h = 200, L = 44, R = 12, T = 30, B = 26;
    var xmax = Math.max(Math.ceil(Math.log(0.015) / Math.log(1 - p)), n ? n + 3 : 0), st = niceStep(xmax, w < 480 ? 5 : 8);
    xmax = Math.ceil(xmax / st) * st;
    var bw = (w - L - R) / xmax, ymax = p * 1.08;
    function X(k){ return L + (k - 1) * bw; }                // k번째 막대의 왼쪽
    function Y(v){ return T + (1 - v / ymax) * (h - T - B); }
    var s = '<svg viewBox="0 0 ' + w + ' ' + h + '" role="img" aria-label="몇 번째에 처음 나오는지의 확률 분포">';
    [0, p / 2, p].forEach(function(v){
      s += '<line x1="' + L + '" x2="' + (w - R) + '" y1="' + Y(v).toFixed(1) + '" y2="' + Y(v).toFixed(1) + '" stroke="' + C.line + '"/>'
        + t(L - 6, Y(v) + 4, (v * 100).toFixed(1) + '%', C.ink2, { a: 'end', fs: 10.5 });
    });
    var bar = bw >= 4 ? bw * 0.78 : bw;
    for (var k = 1; k <= xmax; k++){
      var v = p * Math.pow(1 - p, k - 1);
      s += '<rect x="' + X(k).toFixed(1) + '" y="' + Y(v).toFixed(1) + '" width="' + Math.max(1, bar).toFixed(1) + '" height="' + (h - B - Y(v)).toFixed(1)
        + '" fill="' + gradeOf(k).c + '" opacity="' + (n ? (k <= n ? 0.95 : 0.22) : 0.6) + '"/>';
    }
    for (var x = st; x <= xmax; x += st) s += t(X(x) + bw / 2, h - B + 16, x + '번', C.ink2);
    s += t(X(1) + bw / 2, h - B + 16, '1', C.ink2);
    // 평균은 N번. 라벨은 내 결과 선과 겹치지 않게 결과의 반대쪽에 둔다
    var mx = X(G.N) + bw / 2, ml = n > G.N;
    s += '<line x1="' + mx.toFixed(1) + '" x2="' + mx.toFixed(1) + '" y1="' + T + '" y2="' + (h - B) + '" stroke="' + C.ink2 + '" stroke-dasharray="4 4"/>'
      + t(mx + (ml ? -5 : 5), T + 12, '평균 ' + G.N + '번', C.ink2, { a: ml ? 'end' : 'start', fs: 11 });
    if (n){
      var cx = X(n) + bw / 2, right = cx > w * 0.62;
      s += '<line x1="' + cx.toFixed(1) + '" x2="' + cx.toFixed(1) + '" y1="' + (T - 8) + '" y2="' + (h - B) + '" stroke="' + C.ink + '" stroke-width="2"/>'
        + t(cx + (right ? -7 : 7), T - 12, '내 결과 ' + won(n) + '번', C.ink, { a: right ? 'end' : 'start', fs: 12.5 });
    }
    return s + '</svg>';
  }

  // 결과 타일의 색·효과 단계. 평균(N번)의 몇 배 걸렸는지로 정한다
  //   great 금색·빛남 / good 민트 / even 기본 / bad 주황 / worst 빨강·깜빡임
  function mgTone(n){
    var r = n / G.N;
    return n === 1 || r <= 0.35 ? 'great' : r <= 0.8 ? 'good' : r <= 1.25 ? 'even' : r <= 2 ? 'bad' : 'worst';
  }
  // 위시리스트 하트. pages.js 가 문서 전체에서 [data-wish] 클릭을 받아 담고 빼며, 같은 저장소(sendungi:wish)를 쓴다
  function wishBtn(key){
    var on = false;
    try { on = !!(JSON.parse(localStorage.getItem('sendungi:wish')) || {})[key]; } catch (e){}
    return '<button type="button" class="wish' + (on ? ' on' : '') + '" data-wish="' + esc(key) + '" aria-pressed="' + on + '"'
      + ' aria-label="위시리스트에 담기" title="위시리스트"><svg viewBox="0 0 24 24"><use href="#i-heart"/></svg></button>';
  }
  // 결과 타일 4개. r 이 없으면(도전 전·뽑는 중) 같은 모양에 빈 값만 채운다
  function mgTiles(r, n, cnt, top, topN){
    var N = G.N, tone = r ? mgTone(n) : '', others = Math.max(1, N - 1), kinds = Object.keys(cnt).length;
    var diff = N - n, dCost = (n - N) * G.price, scale = Math.max(n, N) * 1.15;
    function num(v){ return '<span data-cnt="' + v + '">' + won(v) + '</span>'; }       // 결과가 나올 때 0부터 올라가는 숫자
    function box(t, k, body){ return '<div class="mt mg-mt' + (t ? ' tone-' + t : '') + '"><span class="mk">' + k + '</span>' + body + '</div>'; }
    if (!r) return box('', '쓴 돈', '<b>—</b><small>평균 ' + won(N * G.price) + '원과 비교</small><small>1장 ' + won(G.price) + '원</small>')
      + box('', '평균과 비교', '<b>—</b><div class="mg-cmp"><em style="left:' + (100 / 1.15).toFixed(1) + '%"></em></div><small>평균 ' + N + '번 · 절반은 ' + mgMedian() + '번 안에</small>')
      + box('', '그 사이 나온 카드', '<b>—</b><div class="mg-cov"></div><small>다른 카드 ' + others + '종 중 몇 종을 봤는지</small>')
      + '<div class="mt mg-mt mg-top"><span class="mk">제일 많이 나온 카드</span><b>—</b><small>그 사이 가장 자주 겹친 카드</small><div class="mg-topc empty"></div></div>';
    var topTone = topN >= 5 ? 'worst' : topN >= 3 ? 'bad' : 'even';
    return box(tone, '쓴 돈', '<b>' + num(n * G.price) + '원</b>'
        + '<small class="mg-d ' + (dCost > 0 ? 'up' : dCost < 0 ? 'down' : '') + '">'
        + (dCost > 0 ? '평균보다 ' + won(dCost) + '원 더' : dCost < 0 ? '평균보다 ' + won(-dCost) + '원 아낌' : '평균과 같음') + '</small>'
        + '<small>1장 ' + won(G.price) + '원 × ' + won(n) + '장</small>')
      + box(tone, '평균과 비교', '<b>' + (diff > 0 ? '▲ ' + num(diff) + '번 빨리' : diff < 0 ? '▼ ' + num(-diff) + '번 늦게' : '딱 평균') + '</b>'
        + '<div class="mg-cmp" title="나 ' + n + '번 · 평균 ' + N + '번"><i style="width:' + (n / scale * 100).toFixed(1) + '%"></i>'
        + '<em style="left:' + (N / scale * 100).toFixed(1) + '%"></em></div>'
        + '<small>나 ' + won(n) + '번 · 평균 ' + N + '번 · 절반은 ' + mgMedian() + '번 안에</small>')
      + box(tone, '그 사이 나온 카드', '<b>' + (n > 1 ? num(n - 1) + '장' : '없음') + '</b>'
        + '<div class="mg-cov" title="다른 카드 ' + kinds + '/' + others + '종"><i style="width:' + (kinds / others * 100).toFixed(1) + '%"></i></div>'
        + '<small>' + (n > 1 ? '다른 카드 ' + kinds + '/' + others + '종 · 중복 ' + won(n - 1 - kinds) + '장' : '첫 번째에 바로 나왔습니다') + '</small>')
      + (topN >= 2
        ? '<div class="mt mg-mt mg-top tone-' + topTone + '"><span class="mk">제일 많이 나온 카드</span><b>' + esc(G.names[top]) + '</b>'
          + '<small>' + topN + '번' + (topN >= 3 ? '이나' : '') + ' 나왔습니다' + (topN >= 5 ? ' · 목표보다 ' + topN + '배 자주' : '') + '</small>'
          + '<div class="mg-topc' + (G.land(top) ? ' land' : '') + '" id="mg-topc"><span class="mg-x">×' + topN + '</span>' + wishBtn('pc:' + G.id + ':' + top) + '</div></div>'
        : '<div class="mt mg-mt mg-top"><span class="mk">제일 많이 나온 카드</span><b>—</b><small>' + (n > 1 ? '겹친 카드 없이 모두 한 번씩' : '바로 나왔습니다') + '</small>'
          + '<div class="mg-topc empty"></div></div>');
  }
  // 결과가 막 나왔을 때 숫자를 0부터 올린다
  function mgCount(){
    if (window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)').matches) return;
    var els = $('mg-res').querySelectorAll('[data-cnt]'), t0 = performance.now(), D = 700;
    (function tick(now){
      var k = Math.min(1, (now - t0) / D), e = 1 - Math.pow(1 - k, 3);
      Array.prototype.forEach.call(els, function(el){ el.textContent = won(+el.getAttribute('data-cnt') * e); });
      if (k < 1) requestAnimationFrame(tick);
    })(t0);
  }

  // 결과 영역은 늘 보인다. 도전 전·뽑는 중에는 같은 자리에 빈 값을 채워 화면이 들썩이지 않게 한다
  function mgResult(){
    var m = mini(), run = !!mgEnd, r = run ? null : m.res, box = $('mg-res');
    var n = r ? r.n : 0, gr = r ? gradeOf(n) : null, q = r ? within(n) : 0;
    var cnt = {}, top = -1, topN = 0;
    if (r) r.seq.slice(0, -1).forEach(function(i){ cnt[i] = (cnt[i] || 0) + 1; if (cnt[i] > topN){ topN = cnt[i]; top = i; } });
    var head = r
      ? '<span class="mg-grade" style="--gc:' + gr.c + '">' + gr.t + '</span><b>' + won(n) + '번 만에 나왔다!</b>'
      : '<span class="mg-grade mg-g0">' + (run ? '뽑는 중' : '도전 전') + '</span><b>' + (run ? '뽑는 중…' : '몇 번 만에 나올까요?') + '</b>';
    var text = r
      ? (n === 1 ? '첫 번째에 바로 나왔습니다. 확률 ' + pctTxt(1 / G.N) + '의 행운입니다.'
        : won(n) + '번 안에 나올 확률은 ' + pctTxt(q) + '입니다. 같은 카드를 노린 100명 중 약 ' + Math.round(within(n - 1) * 100) + '명이 이보다 빨리 뽑았습니다.')
      : run ? '목표 카드가 나오면 결과가 여기에 표시됩니다.'
      : '목표 카드를 고르고 뽑기 시작을 누르면 결과가 여기에 표시됩니다. 한 번에 나올 확률은 1/' + G.N
        + '이고, 평균 ' + G.N + '번 · 절반은 ' + mgMedian() + '번 안에 나옵니다.';
    var legend = mgRanges().map(function(x){
      var rg = x.b == null ? x.a + '번~' : x.a === x.b ? x.a + '번' : x.a + '~' + x.b + '번';
      return '<span class="' + (gr === x.g ? 'on' : '') + '" style="--gc:' + x.g.c + '"><i></i>' + x.g.t + ' ' + rg + '</span>';
    }).join('');
    box.classList.toggle('empty', !r);
    box.innerHTML =
      '<div class="mg-rh">' + head + '</div><p class="mg-rs">' + text + '</p>'
      + '<div class="mg-chart">' + mgChart(n) + '</div>'
      + '<div class="mg-legend">' + legend + '</div>'
      + '<p class="gnote mg-cap">막대 하나는 정확히 그 번째에 처음 나올 확률입니다. 색은 등급 구간'
      + (r ? '이고, 진하게 칠한 막대가 이번 결과보다 빨리 나온 경우입니다.' : '입니다.') + '</p>'
      + '<div class="cmeta">' + mgTiles(r, n, cnt, top, topN) + '</div>'
      + '<div class="mg-strip" id="mg-strip">' + (r ? '' : '<em>목표 카드가 나오기까지 뽑힌 카드가 여기에 순서대로 나옵니다</em>') + '</div>'
      + (r ? '<div class="mg-btns"><button type="button" class="gs" id="mg-again">' + ICON.reset + '같은 카드로 한 번 더</button></div>' : '');
    if (!r) return;
    // 제일 많이 나온 카드 그림 (큰 이미지는 문자열로 넣지 않고 요소로 붙인다)
    var tc = $('mg-topc');
    if (tc){ var ti = document.createElement('img'); ti.alt = ''; setImg(ti, top); ti.title = G.names[top]; tc.insertBefore(ti, tc.firstChild); }
    // 목표가 나오기까지 뽑힌 카드들 (최근 40장, 마지막이 목표 카드)
    var strip = $('mg-strip'), last = r.seq.slice(-40);
    if (r.seq.length > 40){ var em = document.createElement('em'); em.textContent = '앞의 ' + won(r.seq.length - 40) + '장 생략 ·'; strip.appendChild(em); }
    last.forEach(function(i, k){
      var im = document.createElement('img'); im.alt = ''; setImg(im, i); im.title = G.names[i];
      if (k === last.length - 1) im.classList.add('t');
      strip.appendChild(im);
    });
  }

  function mgHist(){
    var r = mgLoad(), box = $('mg-hist'), m = mini();
    if (!r.length){ box.innerHTML = ''; return; }
    var sum = r.reduce(function(a, x){ return a + x.n; }, 0);
    var best = r.reduce(function(a, x){ return x.n < a.n ? x : a; }, r[0]);
    var mine = m.target != null ? r.filter(function(x){ return x.i === m.target; }) : [];
    var rows = r.slice().reverse().slice(0, 10).map(function(x, k){
      var g = gradeOf(x.n);
      return '<tr><td>' + (r.length - k) + '</td><td>' + esc(G.names[x.i] || 'No.' + (x.i + 1)) + '</td>'
        + '<td><span class="mg-gd" style="--gc:' + g.c + '">' + g.t + '</span></td><td>' + won(x.n) + '번</td><td>' + pctTxt(within(x.n)) + '</td></tr>';
    }).join('');
    box.innerHTML = '<h3 class="ahead">도전 기록</h3><div class="cmeta">'
      + tile('도전 횟수', r.length + '회', '최근 50회까지 저장')
      + tile('평균', (sum / r.length).toFixed(1) + '번', '이론 평균 ' + G.N + '번')
      + tile('최고 기록', won(best.n) + '번', esc(G.names[best.i] || ''))
      + (m.target != null ? tile('이 카드 최고', mine.length ? won(Math.min.apply(null, mine.map(function(x){ return x.n; }))) + '번' : '—',
          mine.length ? '도전 ' + mine.length + '회' : '아직 도전 안 함') : '')
      + '</div><div class="atab-w"><table class="atab mg-tab"><thead><tr><th>회차</th><th>카드</th><th>등급</th><th>횟수</th><th>그 안에 나올 확률</th></tr></thead>'
      + '<tbody>' + rows + '</tbody></table></div>';
  }

  $('g-mini').addEventListener('click', function(e){
    var m = mini(), b = e.target.closest('[data-mg]');
    if (b){
      if (mgEnd) return;
      m.target = +b.getAttribute('data-mg'); m.open = false; m.res = null;
      renderMini();
      $('mg-acc').scrollIntoView({ block: 'start', behavior: 'smooth' });
      return;
    }
    if (e.target.closest('#mg-tog')){                         // 카드 고르기 펼치기 / 접기
      if (mgEnd) return;
      m.open = !m.open; renderMini();
      return;
    }
    if (e.target.closest('#mg-go')){ mgRun(); return; }
    if (e.target.closest('#mg-again')){ $('mg-stage').scrollIntoView({ block: 'nearest', behavior: 'smooth' }); mgRun(); return; }
    if (mgEnd && e.target.closest('#mg-draw')) mgEnd();       // 뽑기 창을 눌러도 건너뛴다
  });
  // 미니게임 페이지의 뽑기 종류 목록 (시뮬레이터와 같은 select)
  mgPage.addEventListener('click', function(e){
    var o = e.target.closest('.gopt'); if (o) select(o.getAttribute('data-g'));
  });

  // ---------- 시작 ----------
  var saved = null;
  try { saved = localStorage.getItem('gacha:sel'); } catch (e){}
  select(saved || LIST[0].id);
  setView('draw');
  // 페이지 등록용 (pages.js). 숨어 있는 동안은 그래프 폭을 잴 수 없어서, 페이지를 열 때 새로 그린다
  window.SGMINI = { el: mgPage, onShow: function(){ renderMini(); } };
})();
