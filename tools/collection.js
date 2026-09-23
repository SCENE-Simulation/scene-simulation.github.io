// 포토카드 컬렉션 페이지 엔진
// 설정(cfg) 하나로 도감 페이지 한 장을 통째로 만든다. CU 405빵 페이지(source.html)의 구성을 따른다.
// cfg = { id, title, year, ym, diff, desc, members[{n,c}], cards[{n,img,m,land}],
//         modes[{k,label,price,random,var,hint}], pkg[{src?,cap,sub?,wide?}], news[{title,src,date,url,kind?}] }
//   news[] : 관련 미디어. 유튜브 주소면 썸네일이 붙는다. kind 는 종류 칩 글자(없으면 영상/기사)
//   pkg[] : src 가 없으면 자리표시자 + 제목(cap)·설명(sub). wide:true 는 한 줄 전체·원본 크기.
//           crop:[x,y,w,h] + size:[원본 폭,높이] 면 한 장짜리 이미지의 그 영역만 보여 준다 (여러 칸이 같은 파일을 나눠 씀)
//           size 만 있으면 그 비율로, ratio:[w,h] 면 그 비율 틀에 맞춰 가운데를 잘라 보여 준다 (크기가 다른 사진을 같은 크기로)
//   pkgRow:true : 패키징을 한 줄에 같은 높이로 나란히 (칸 폭은 각 이미지 비율대로, 좁은 화면에서는 세로로 쌓임).
//                 모든 항목에 size·ratio·crop 중 하나가 있어야 한다
//   cards[].m : 멤버 번호(0부터), 없으면 스페셜
//   groups[{k, n, c, note?, soon?[{n, sub?}]}] : 포토카드와 따로 모으는 묶음(브로마이드 · 스페셜 굿즈 등). 멤버 칸 아래에 묶음마다 새 줄.
//     cards[].g 에 묶음 k 를 적으면 그 줄에 나온다. soon 은 아직 공개 전인 굿즈 — SOON 칸만 보이고 개수·완성에는 안 들어간다
//     (공개되면 soon 에서 빼고 cards 맨 뒤에 g 를 붙여 추가. 기록은 카드 번호로 저장되므로 cards 순서는 바꾸지 않는다)
//   modes[].g : 뽑기형 방식이 뽑는 묶음(없으면 포토카드). 뽑기형·g 가 있는 방식은 그 묶음 카드에만, 나머지(교환·중고 등)는 모든 카드에 쓴다
//   modes[].price : 고정 금액 / var:true 면 살 때마다 금액 입력(중고 거래 등) / price 0 이면 금액 없음(교환 등)
//   modes[].random : 무엇이 나올지 모르는 뽑기형(컴플리트 평균 계산에 사용)
//   modes[].ach : 그 방식의 칭호를 직접 정함 [{at:횟수, n:칭호, d:한마디}] — 설명은 "<방식> N회 · 한마디". 없으면 첫걸음(1회)·단골(10회)
//   ach : 기본 칭호를 콜라보에 맞게 바꿈 {id:{n:칭호, d:한마디, at:장수}} — 설명은 "<조건> · 한마디", false 면 그 칭호를 뺀다.
//         id: first(1종) · mem1(한 멤버 전부) · half(절반) · all(컴플리트) · dup3 · dup6(같은 카드 3·6장, at 으로 장수 변경) · avg(평균 비용) · thrifty(알뜰)
//         멤버마다 카드가 1종이면 mem1 은 first 와 같은 때 받으니 false 로 빼는 게 낫다
//   achSum : 여러 방식의 횟수를 합쳐 세는 칭호 [{id, modes:[k…], at:횟수, lb:조건 이름, n:칭호, d?:한마디, r?:등급 1~4, c?:색}]
//            설명은 "<lb> N회 · 한마디". 예: 1·2차 피자 주문을 합쳐 3판 (id 앞에 s_ 가 붙어 저장된다)
(function(){
  var REG = window.SGCOLS = window.SGCOLS || [];

  function won(n){ return (n || 0).toLocaleString('ko-KR'); }
  function esc(s){ return String(s).replace(/[&<>"']/g, function(c){ return { '&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;' }[c]; }); }
  // 을/를: 마지막 글자에 받침이 있으면 '을' ("중고 구매를" · "확정 구매를" · "교환을")
  function eul(w){ var s = String(w), c = s.charCodeAt(s.length - 1); return c >= 0xAC00 && c <= 0xD7A3 && (c - 0xAC00) % 28 ? '을' : '를'; }
  function two(n){ return n < 10 ? '0' + n : '' + n; }
  function when(t){ var d = new Date(t); return (d.getMonth() + 1) + '/' + d.getDate() + ' ' + two(d.getHours()) + ':' + two(d.getMinutes()); }
  function newId(){ return 'e' + Date.now().toString(36) + Math.random().toString(36).slice(2, 6); }
  function load(k, d){ try { return JSON.parse(localStorage.getItem(k)) || d; } catch(e){ return d; } }
  // 이 사이트 저장값을 브라우저가 공간이 모자랄 때 지우지 않게 "영구 저장"을 요청한다 (Chrome 등은 알림 없이 판단, Firefox 는 한 번 묻는다).
  //   이용자가 실제로 기록을 남길 때(도감 저장 · 굿즈 수량 · 위시 · 즐겨찾기 · 예측)만 부르고, 한 번 물으면 이 방문 동안은 다시 묻지 않는다
  window.SGPersist = window.SGPersist || function(){
    if (window.__sgPersistAsked) return; window.__sgPersistAsked = true;
    try { if (navigator.storage && navigator.storage.persist) navigator.storage.persisted().then(function(p){ if (!p) return navigator.storage.persist(); }).catch(function(){}); } catch(e){}
  };
  // 유튜브 주소에서 영상 id (youtu.be/ID · watch?v=ID · shorts/ID)
  function ytId(u){ var m = /(?:youtu\.be\/|[?&]v=|\/shorts\/)([\w-]{11})/.exec(u || ''); return m ? m[1] : null; }

  // 천 단위 쉼표 입력칸
  function numVal(inp){ var v = parseInt(String(inp.value).replace(/\D/g, ''), 10); return isNaN(v) ? 0 : v; }
  function numFmt(inp){
    inp.addEventListener('input', function(){
      var pos = inp.selectionStart == null ? inp.value.length : inp.selectionStart;
      var right = inp.value.slice(pos).replace(/\D/g, '').length;
      var digits = inp.value.replace(/\D/g, '').replace(/^0+(?=\d)/, '').slice(0, 8);
      var out = digits ? (+digits).toLocaleString('ko-KR') : '';
      inp.value = out;
      var p = out.length, c = 0;
      while (p > 0 && c < right) { p--; if (/\d/.test(out[p])) c++; }
      try { inp.setSelectionRange(p, p); } catch(e){}
    });
  }

  window.SGCollection = function(cfg){
    var N = cfg.cards.length;
    var KEY = 'col:' + cfg.id, COLKEY = 'col:' + cfg.id + ':cols';
    var MODE = {}; cfg.modes.forEach(function(m){ MODE[m.k] = m; });
    // 묶음(groups): 뽑기형 방식은 자기 묶음 안에서만 뽑는다 — 포토카드 확률 · 컴플리트 평균 · 시뮬레이터에 굿즈가 섞이지 않게
    var GROUPS = cfg.groups || [];
    function gOf(c){ return (c && c.g) || ''; }
    function poolOf(m){ var out = []; cfg.cards.forEach(function(c, i){ if (gOf(c) === ((m && m.g) || '')) out.push(i); }); return out; }
    function groupIds(k){ var out = []; cfg.cards.forEach(function(c, i){ if (c.g === k) out.push(i); }); return out; }
    function modeFits(m, i){ return (m.random || m.g) ? gOf(cfg.cards[i]) === (m.g || '') : true; }
    var ENTRIES = [], PEND = [], ACH = {}, EDITING = null, EDITS = 0, savedAt = null;
    var el = document.createElement('section');
    el.id = 'v-' + cfg.id; el.className = 'wrap page colpg'; el.hidden = true;           // colpg: 카드 크기 규칙(theme.css)을 405빵 페이지와 같이 씀
    document.querySelector('main.mn').appendChild(el);

    // ---------- 기록에서 현재 상태를 계산 ----------
    // 전체 초기화는 기록에 k:'reset' 한 줄로 남는다(405빵과 같게). 그 줄 앞의 기록(저장 전 변경 포함)은 세지 않고 로그에도 안 보이며,
    // 저장하면 지워진다(save). 계산은 마지막 초기화 줄 다음부터(all), 로그는 초기화 줄부터(shown)
    function lastReset(a){ for (var j = a.length - 1; j >= 0; j--) if (a[j].k === 'reset') return j; return -1; }
    function all(){ var a = ENTRIES.concat(PEND); return a.slice(lastReset(a) + 1); }
    function shown(){ var a = ENTRIES.concat(PEND); return a.slice(Math.max(0, lastReset(a))); }
    function counts(){
      var c = new Array(N).fill(0);
      all().forEach(function(e){ if (e.i != null && e.i < N) c[e.i] += e.d; });   // 목록에 없는 카드 번호(보존된 기록)는 세지 않는다
      return c.map(function(v){ return Math.max(0, v); });
    }
    function ledger(k){ var s = 0; all().forEach(function(e){ if (e.k === k) s += e.d; }); return Math.max(0, s); }
    function money(){ var s = 0; all().forEach(function(e){ s += e.w || 0; }); return Math.max(0, s); }
    function owned(){ return counts().filter(function(v){ return v > 0; }).length; }
    function maxDup(){ return counts().reduce(function(a, b){ return Math.max(a, b); }, 0); }
    function dirtyN(){ return PEND.length + EDITS; }

    // 컴플리트 평균: 뽑기형 방식의 가격 기준
    var rnd = cfg.modes.filter(function(m){ return m.random; })[0];
    // 뽑기형인데 가격이 아직 없으면(price 0·없음) "가격 미정" — 0원으로 보이지 않게. 시뮬레이터(gacha.js)도 price > 0 일 때만 넣는다
    function tbd(m){ return !!(m && m.random && !m.price); }
    function expect(){
      if (!rnd) return null;
      var packs = 0, cost = 0;
      cfg.modes.forEach(function(m){
        if (!m.random) return;
        var n = poolOf(m).length, h = 0, k; if (!n) return;
        for (k = 1; k <= n; k++) h += 1 / k;
        var p = Math.round(n * h); packs += p; cost += p * (m.price || 0);
      });
      return { packs: packs, cost: cost };
    }

    // ---------- 저장 ----------
    function snap(){ return { entries: ENTRIES, ach: ACH, updated: new Date().toISOString() }; }
    function save(){
      ENTRIES = ENTRIES.concat(netPend());
      var r = lastReset(ENTRIES); if (r > 0) ENTRIES = ENTRIES.slice(r);        // 초기화 줄 앞의 기록은 버리고 초기화 줄은 로그에 남긴다
      PEND = []; EDITS = 0; EDITING = null;
      try { localStorage.setItem(KEY, JSON.stringify(snap())); } catch(e){}
      if (window.SGPersist) window.SGPersist();
      savedAt = Date.now();
      render();
      if (window.toastSG) window.toastSG('저장했습니다', '기록이 이 브라우저에 저장되었습니다');
    }
    // 저장된 기록을 읽을 때 모양을 검사한다 — 깨진 줄(null · 이상한 카드 번호 · 숫자가 아닌 수량)이 하나라도 있으면
    //   예전엔 도감 페이지 전체가 안 나오거나 HTML 로 들어갔다. 줄 모양은 { id, t, k, i(카드 번호 | null), d(수량), w(금액) }
    function cleanEntries(a){
      return (Array.isArray(a) ? a : []).filter(function(e){
        return e && typeof e === 'object' && typeof e.k === 'string' && isFinite(e.d) && (e.i == null || (e.i === Math.floor(e.i) && e.i >= 0));
        // 카드 번호가 지금 목록보다 커도 버리지 않는다 — 설정에서 카드가 잘못 빠졌다가 돌아와도 이용자 기록이 남아 있게 (계산 · 화면에서는 건너뜀)
      }).map(function(e){
        var id = String(e.id);                                                    // id 는 화면 속성에 들어가므로 글자를 제한 (백업 파일로 들어온 값 포함). 이상하면 새로 붙인다
        return { id: /^[\w-]{1,40}$/.test(id) ? id : newId(), t: +e.t || 0, k: e.k, i: e.i == null ? null : e.i,
          d: Math.max(-9999, Math.min(9999, +e.d)), w: Math.max(-1e10, Math.min(1e10, +e.w || 0)) };           // 수량 · 금액은 말이 되는 범위로 (한 줄 수량은 99까지)
      });
    }
    function cleanAch(o){ return o && typeof o === 'object' && !Array.isArray(o) ? o : {}; }
    function revert(){
      var d = load(KEY, null);
      ENTRIES = cleanEntries(d && d.entries); ACH = cleanAch(d && d.ach);
      PEND = []; EDITS = 0; EDITING = null;
      render();
    }
    function init(){
      var d = load(KEY, null);
      ENTRIES = cleanEntries(d && d.entries); ACH = cleanAch(d && d.ach);
      savedAt = d && d.updated ? Date.parse(d.updated) : null;
    }

    // ---------- 저장 전 변경 합치기 ----------
    function netPend(){
      var out = [], at = {};
      PEND.forEach(function(e){
        // 전체 초기화: 그 앞의 저장 전 변경은 버리고 초기화 줄 하나만 (405빵 netPend 와 같게)
        if (e.k === 'reset') { out = [{ id: e.id, t: e.t, k: 'reset', i: null, d: 0, w: 0 }]; at = {}; return; }
        var unit = e.d ? Math.round(Math.abs(e.w || 0) / Math.abs(e.d)) : 0;
        var key = e.k + '|' + e.i + '|' + unit;
        if (at[key] == null) { at[key] = out.length; out.push({ id: e.id, t: e.t, k: e.k, i: e.i, d: 0, w: 0 }); }
        var o = out[at[key]]; o.d += e.d; o.w += e.w; o.t = e.t;
      });
      return out.filter(function(o){ return o.k === 'reset' || o.d !== 0; });
    }

    // ---------- 칭호 ----------
    function achDefs(){
      var ex = expect(), half = Math.max(1, Math.round(N / 2));
      // cfg.ach 로 기본 칭호를 콜라보에 맞게 바꿀 수 있다 (맨 위 설명). 중복 칭호는 장수(at)도 바꿀 수 있고, id 는 그대로라 받은 칭호가 이어진다
      var O = cfg.ach || {};
      function at(id, def){ return (O[id] && O[id].at) || def; }
      var dupA = at('dup3', 3), dupB = at('dup6', 6);
      var list = [
        { id:'first', n:'첫 장의 설렘', d:'카드 1종 보유', c:'#55a1e7', r:1, t:function(x){ return x.own >= 1; } },
        { id:'half',  n:'절반의 수집가', d:half + '종 보유', c:'#55a1e7', r:2, t:function(x){ return x.own >= half; } },
        { id:'all',   n:'컴플리터', d:N + '종 전부 수집', c:'#55a1e7', r:4, t:function(x){ return x.own >= N; } },
        { id:'dup3',  n:'중복 시작', d:'같은 카드 ' + dupA + '장 보유', c:'#a080d0', r:1, t:function(x){ return x.maxDup >= dupA; } },
        { id:'dup6',  n:'중복 지옥', d:'같은 카드 ' + dupB + '장 보유', c:'#a080d0', r:2, t:function(x){ return x.maxDup >= dupB; } }
      ];
      if (cfg.members && cfg.members.length) {
        list.splice(1, 0, { id:'mem1', n:'최애 한 세트', d:'한 멤버의 카드 모두 수집', c:'#55a1e7', r:2, t:function(x){ return x.memberDone >= 1; } });
      }
      cfg.modes.forEach(function(m){
        if (m.k === 'adj') return;
        // 방식마다 칭호를 따로 정했으면(ach) 그걸 쓰고, 없으면 "첫걸음(1회) · 단골(10회)". id 는 둘 다 m_<k><횟수> 라 받은 칭호가 이어진다
        var tiers = m.ach || [{ at:1, n:m.label + ' 첫걸음' }, { at:10, n:m.label + ' 단골' }];
        tiers.forEach(function(a, i){
          list.push({ id:'m_' + m.k + a.at, n:a.n, d:m.label + ' ' + a.at + '회' + (a.d ? ' · ' + a.d : ''), c:m.badge || '#ecd25b',
            r:Math.min(4, i + 1), t:function(x){ return x.mode[m.k] >= a.at; } });
        });
      });
      (cfg.achSum || []).forEach(function(a){
        list.push({ id:'s_' + a.id, n:a.n, d:a.lb + ' ' + a.at + '회' + (a.d ? ' · ' + a.d : ''), c:a.c || '#ecd25b', r:a.r || 4,
          t:function(x){ return a.modes.reduce(function(s, k){ return s + (x.mode[k] || 0); }, 0) >= a.at; } });
      });
      if (ex && ex.cost) {
        list.push({ id:'avg', n:'평균을 넘어선 자', d:'누적 지출 ' + won(ex.cost) + '원 돌파 · 평균 컴플리트 비용', c:'#e09050', r:3, t:function(x){ return x.money >= ex.cost; } });
        list.push({ id:'thrifty', n:'알뜰 컴플리터', d:won(Math.round(ex.cost * 0.75)) + '원 이하로 ' + N + '종 완성', c:'#f6b93c', r:4,
          t:function(x){ return x.own >= N && x.money <= Math.round(ex.cost * 0.75); } });
      }
      // 기본 칭호 바꾸기: 이름(n)은 바꾸고, 한마디(d)는 조건 설명 뒤에 " · 한마디"로 붙인다. false 면 뺀다
      return list.filter(function(a){ return O[a.id] !== false; }).map(function(a){
        var o = O[a.id];
        if (o && a.id.indexOf('m_') !== 0) { if (o.n) a.n = o.n; if (o.d) a.d += ' · ' + o.d; }
        return a;
      });
    }
    var ACHDEF = achDefs();
    function achCtx(){
      var c = counts(), memberDone = 0;
      (cfg.members || []).forEach(function(m, mi){
        var ids = cardsOf(mi);
        if (ids.length && ids.every(function(i){ return c[i] > 0; })) memberDone++;
      });
      var mode = {}; cfg.modes.forEach(function(m){ mode[m.k] = ledger(m.k); });
      return { own: owned(), maxDup: maxDup(), money: money(), memberDone: memberDone, mode: mode };
    }
    function achCheck(silent){
      var x = achCtx();
      ACHDEF.forEach(function(a){
        if (!ACH[a.id] && a.t(x)) {
          ACH[a.id] = Date.now();
          if (!silent && window.toastSG) window.toastSG('칭호 획득 — ' + esc(a.n), esc(a.d));
        }
      });
    }

    // ---------- 카드 묶음 ----------
    function cardsOf(mi){
      var out = [];
      cfg.cards.forEach(function(c, i){ if (c.m === mi) out.push(i); });
      return out;
    }
    function specials(){
      var out = [];
      cfg.cards.forEach(function(c, i){ if (c.m == null && !c.g) out.push(i); });
      return out;
    }

    // ---------- 그리기 ----------
    function metaTiles(){
      var ex = expect(), p = (cfg.ym || '').split('-');
      var DIFF = [['쉬움','#47d19a'],['보통','#99ce64'],['어려움','#ecd25b'],['매우 어려움','#e09050'],['극악','#e96387']];
      var lv = Math.max(1, Math.min(5, cfg.diff || 3)), t = DIFF[lv - 1];
      var bars = '<span class="dlv" style="--dc:' + t[1] + '"><span class="db">';
      for (var i = 1; i <= 5; i++) bars += '<i' + (i <= lv ? ' class="f"' : '') + '></i>';
      bars += '</span><b>' + t[0] + '</b></span>';
      var h = '<div class="cmeta">';
      if (cfg.ym) h += '<div class="mt"><span class="mk">출시</span><b>' + p[0] + '.' + p[1] + '</b><small>' + p[0] + '년 ' + (+p[1]) + '월</small></div>';
      h += '<div class="mt"><span class="mk">구성</span><b>' + N + '종</b><small>' + esc(cfg.parts || ((cfg.members || []).length ? '멤버 ' + cardsOf(0).length * cfg.members.length + '종 + 스페셜 ' + specials().length + '종' : '')) + '</small></div>';
      if (ex) h += '<div class="mt"><span class="mk">컴플리트 평균</span><b>약 ' + ex.packs + '개</b><small>'
        + (tbd(rnd) ? '가격 미정 · 정해지면 비용도 계산' : '약 ' + won(ex.cost) + '원 · 1개 ' + won(rnd.price) + '원') + '</small></div>';
      h += '<div class="mt"><span class="mk">수집 난이도</span>' + bars + '<small>비용 · 구하기 종합 · 5단계 중 ' + lv + '</small></div>';
      return h + '</div>';
    }
    function statTiles(){
      var ex = expect(), m = money(), o = owned();
      var main = cfg.modes[0];
      return '<div class="chead2">'
        + '<div class="m" id="' + cfg.id + '-m1"><span class="mk">' + esc(main.label) + '</span><b>' + won(ledger(main.k)) + '회</b><small>' + esc(main.hint || (main.price ? won(main.price) + '원' : '')) + '</small></div>'
        + '<div class="m" id="' + cfg.id + '-m2"><span class="mk">누적 금액</span><b>' + won(m) + '원</b><small>모든 구매 합계</small></div>'
        + '<div class="m" id="' + cfg.id + '-m3"><span class="mk">보유 종수</span><b>' + o + '/' + N + '</b><small>중복 ' + Math.max(0, counts().reduce(function(a, b){ return a + b; }, 0) - o) + '장</small>'
        + '<span class="mbar"><i style="width:' + (o / N * 100) + '%"></i></span></div>'
        + '<div class="sp"><button class="p" data-act="save"' + (dirtyN() ? '' : ' disabled') + '>' + (dirtyN() ? '저장 (' + dirtyN() + ')' : '저장됨') + '</button>'
        + '<button data-act="reset">전체 초기화</button></div>'
        + achBox() + '</div>';
    }
    function badge(a, lock){
      return '<span class="bdg' + (lock ? ' lock' : '') + '" data-r="' + (a.r || 1) + '" style="--bc:' + a.c + '" title="' + esc(a.n) + ' · ' + esc(a.d) + '">'
        + '<span class="em"><i>' + (lock ? '✧' : '✦') + '</i></span><span class="bt"><b>' + esc(a.n) + '</b><small>' + esc(a.d) + '</small></span></span>';
    }
    function achBox(){
      var got = ACHDEF.filter(function(a){ return ACH[a.id]; });
      return '<div class="cach"><div class="cach-h"><span class="cach-t">✦ 칭호</span><span class="cach-n">' + got.length + ' / ' + ACHDEF.length + '</span>'
        + '<button type="button" class="cach-btn" data-act="achall">전체 보기</button></div>'
        + '<div class="badges">' + (got.length ? got.map(function(a){ return badge(a, false); }).join('')
            : '<span class="bdg-empty">아직 얻은 칭호가 없습니다 · “전체 보기”에서 조건을 확인해 보세요</span>') + '</div>'
        + '<div class="badges all" data-all' + (state.achAll ? '' : ' hidden') + '>' + ACHDEF.map(function(a){ return badge(a, !ACH[a.id]); }).join('') + '</div></div>';
    }
    function ledgerRow(){
      var h = '<div class="cledger">';
      cfg.modes.forEach(function(m){
        h += '<div class="lg"><div class="t">' + esc(m.label) + (m['var']
            ? ' · 장당 <input data-price="' + m.k + '" type="text" inputmode="numeric" autocomplete="off" value="' + won(state.price[m.k] || 0) + '">원'
            : (m.price ? ' · ' + won(m.price) + '원' : tbd(m) ? ' · 가격 미정' : ' · 0원')) + '</div>'
          + '<div class="ctr"><button data-mode="' + m.k + '" data-d="-1"' + (ledger(m.k) ? '' : ' disabled') + '>−</button>'
          + '<span class="n">' + won(ledger(m.k)) + '</span>'
          + '<button class="m" data-mode="' + m.k + '" data-d="1">+</button></div>'
          + (m.hint ? '<div class="uw"><span class="tdone">' + esc(m.hint) + '</span></div>' : '') + '</div>';
      });
      return h + '</div>';
    }
    function logRow(e, pend){
      // 전체 초기화 줄: 수정 버튼 없이 한 줄 (405빵과 같게)
      if (e.k === 'reset') return '<div class="lrow' + (pend ? ' pend' : '') + '"><span class="tg">' + (pend ? '저장 전' : when(e.t)) + '</span><span class="lt">전체 초기화</span></div>';
      var c = counts();
      var mode = MODE[e.k], what = e.i == null ? '' : ' <b>' + (e.i + 1) + '. ' + esc(cfg.cards[e.i] ? cfg.cards[e.i].n : '(목록에 없는 카드)') + '</b>';
      var w = e.w ? ' <span class="wn">' + (e.w < 0 ? '−' : '') + won(Math.abs(e.w)) + '원</span>' : '';
      var h = '<div class="lrow' + (pend ? ' pend' : '') + (EDITING === e.id ? ' editing' : '') + '">'
        + '<span class="tg">' + (pend ? '저장 전' : when(e.t)) + '</span>'
        + '<span class="lt">' + esc(mode ? mode.label : e.k) + (e.d > 0 ? ' +' : ' −') + Math.abs(e.d) + what + w + '</span>'
        + '<button type="button" class="led" data-edit="' + esc(e.id) + '">' + (EDITING === e.id ? '닫기' : '수정') + '</button></div>';
      if (EDITING !== e.id) return h;
      var unit = e.d ? Math.round(Math.abs(e.w || 0) / Math.abs(e.d)) : 0;
      return h + '<div class="ledit">'
        + '<label class="lf"><span>수량</span><input class="le-qty" type="number" min="1" max="99" value="' + Math.abs(e.d) + '"></label>'
        + (mode && (mode['var'] || mode.price) ? '<label class="lf"><span>장당 금액</span><span class="lp"><input class="le-price" type="text" inputmode="numeric" value="' + won(unit) + '">원</span></label>' : '')
        + '<div class="le-btns"><button type="button" class="le-del" data-del="' + esc(e.id) + '">기록 삭제</button>'
        + '<button type="button" class="le-cancel">취소</button><button type="button" class="p le-ok" data-ok="' + esc(e.id) + '">적용</button></div>'
        + '<p class="le-note">적용하면 카드 수량과 금액도 함께 바뀝니다. 저장을 눌러야 확정됩니다.</p></div>';
    }
    function logBox(){
      var rows = shown().slice().reverse().map(function(e){ return logRow(e, PEND.indexOf(e) >= 0); }).join('');   // 최신이 위, 초기화 줄 앞은 안 보임
      return '<div class="clog"' + (state.open === 'log' ? '' : ' hidden') + ' data-panel="log"><div class="list">'
        + (rows || '<div class="em">기록이 없습니다.</div>') + '</div></div>';
    }
    // 한 장짜리 이미지에서 일부만 보여 주기: crop = [x, y, w, h] (원본 픽셀), size = [원본 폭, 원본 높이].
    //   칸 폭을 w 에 맞추도록 배경 크기를 키우고, 위치(%)로 그 영역을 맞춘다 — 파일은 하나, 자르기는 CSS
    function cropBox(p){
      var c = p.crop, S = p.size, bw = S[0] / c[2] * 100;
      var bx = S[0] > c[2] ? c[0] / (S[0] - c[2]) * 100 : 0, by = S[1] > c[3] ? c[1] / (S[1] - c[3]) * 100 : 0;
      return '<div class="pk-crop" role="img" aria-label="' + esc(p.cap || '패키징') + '" style="aspect-ratio:' + c[2] + '/' + c[3]
        + ';background-image:url(\'' + esc(p.src) + '\');background-size:' + bw.toFixed(3) + '% auto;background-position:' + bx.toFixed(3) + '% ' + by.toFixed(3) + '%"></div>';
    }
    // 패키징 한 칸의 가로/세로 비율 (ratio 틀 > crop 영역 > 원본 size). 모르면 0
    function pkRatio(p){ var r = p.ratio || (p.crop ? [p.crop[2], p.crop[3]] : p.size); return r ? r[0] / r[1] : 0; }
    function toggles(){
      var pkg = cfg.pkg || [], news = cfg.news || [], n = shown().length;
      // 왼쪽 아이콘은 405빵 페이지(shell.js)와 같은 것
      function btn(k, icon, label, cnt){
        return '<button type="button" class="xt-b" data-panel-btn="' + k + '" aria-expanded="' + (state.open === k) + '"><svg class="xi"><use href="#' + icon + '"/></svg>' + label
          + (cnt ? '<span class="xt-c">' + cnt + '</span>' : '<span class="xt-c soon">SOON</span>') + '<svg class="xv"><use href="#i-chev"/></svg></button>';
      }
      var h = '<div class="xt"><div class="xt-bar">' + btn('pkg', 'i-box', '패키징 보기', pkg.length) + btn('news', 'i-news', '관련 미디어 보기', news.length)
        + '<button type="button" class="xt-b" data-panel-btn="log" aria-expanded="' + (state.open === 'log') + '"><svg class="xi"><use href="#i-log"/></svg>기록 로그<span class="xt-c">' + n + '</span><span class="lgx-h">건별 수정 가능</span><svg class="xv"><use href="#i-chev"/></svg></button></div>';
      h += '<div class="xt-p" data-panel="pkg"' + (state.open === 'pkg' ? '' : ' hidden') + '>'
        + (cfg.pkgRow && pkg.length > 1 && pkg.every(pkRatio)
           ? '<div class="pk row" style="--pkc:' + pkg.map(function(p){ return pkRatio(p).toFixed(4) + 'fr'; }).join(' ')
             // 줄 폭 상한 = 비율 합 × 최대 높이 + 칸 사이 — 세로 사진 두어 장만 있어도 너무 커지지 않게 (theme.css --pkh)
             + ';--pks:' + pkg.reduce(function(s, p){ return s + pkRatio(p); }, 0).toFixed(4) + ';--pkgap:' + (pkg.length - 1) * 10 + 'px">'
           : '<div class="pk">')
        + (pkg.length ? pkg.map(function(p){
              return '<figure' + (p.wide ? ' class="wide"' : '') + '>'
                + (p.src && p.crop ? cropBox(p)
                  : p.src ? '<img src="' + esc(p.src) + '" alt="' + esc(p.cap || '패키징') + '" loading="lazy"'
                    + ((p.ratio || p.size) ? ' class="fit" style="aspect-ratio:' + (p.ratio || p.size)[0] + '/' + (p.ratio || p.size)[1] + '"' : '') + '>'
                  : '<div class="pk-ph"><svg viewBox="0 0 24 24"><use href="#i-img"/></svg><span>이미지 준비 중</span></div>')
                + (p.cap || p.sub ? '<figcaption>' + (p.cap ? '<b>' + esc(p.cap) + '</b>' : '') + (p.sub ? '<small>' + esc(p.sub) + '</small>' : '') + '</figcaption>' : '') + '</figure>';
            }).join('')
           : '<div class="pk-ph"><svg viewBox="0 0 24 24"><use href="#i-img"/></svg><span>패키징 이미지 준비 중</span><span class="chip">SOON</span></div>') + '</div></div>';
      h += '<div class="xt-p" data-panel="news"' + (state.open === 'news' ? '' : ' hidden') + '>'
        + (news.length ? '<div class="nws">' + news.map(function(a){
              // 유튜브 링크는 썸네일 + 재생 표시, 모든 항목에 종류 칩(kind 가 없으면 영상/기사로 자동)
              var yt = ytId(a.url), kind = a.kind || (yt ? '영상' : '기사');
              return '<a class="nw' + (yt ? ' vid' : '') + '" href="' + esc(a.url) + '" target="_blank" rel="noopener noreferrer">'
                + (yt ? '<span class="nw-th"><img src="https://i.ytimg.com/vi/' + yt + '/mqdefault.jpg" alt="" loading="lazy"><i><svg viewBox="0 0 24 24" aria-hidden="true"><path d="M8 5.5v13l10.5-6.5z" fill="currentColor"/></svg></i></span>' : '')
                + '<span class="nw-x"><span class="nw-t">' + esc(a.title) + '</span>'
                + '<span class="nw-m"><i class="nw-k' + (yt ? ' v' : '') + '">' + esc(kind) + '</i>' + esc([a.src, a.date].filter(Boolean).join(' · ')) + '</span></span><svg><use href="#i-ext"/></svg></a>';
            }).join('') + '</div>'
           : '<div class="pk"><div class="pk-ph"><svg viewBox="0 0 24 24"><use href="#i-news"/></svg><span>관련 미디어 준비 중</span><span class="chip">SOON</span></div></div>') + '</div>';
      return h + logBox() + '</div>';
    }
    function grid(){
      var c = counts(), h = '';
      function tile(i){
        var card = cfg.cards[i], n = c[i];
        return '<div class="ctile' + (n ? ' have' : '') + (card.land ? ' land' : '') + '">'
          + '<div class="frame"><div class="pic">' + (card.img ? '<img src="' + esc(card.img) + '" alt="" loading="lazy">' : '<div class="gd-ph"><svg viewBox="0 0 24 24"><use href="#i-img"/></svg></div>')
          + (n > 1 ? '<span class="lvb"><i>×' + n + '</i></span>' : '') + '</div>'
          + '<button type="button" class="wish" data-wish="pc:' + cfg.id + ':' + i + '" aria-label="위시리스트에 담기"><svg viewBox="0 0 24 24"><use href="#i-heart"/></svg></button></div>'
          + '<div class="nm" title="' + esc(card.n) + '">' + (i + 1) + '. ' + esc(card.n) + '</div>'
          + '<div class="ctr"><button type="button" data-card="' + i + '" data-d="-1"' + (n ? '' : ' disabled') + '>−</button>'
          + '<span class="n">' + n + '</span><button type="button" class="p" data-card="' + i + '" data-d="1">+</button></div></div>';
      }
      function section(title, color, ids, note){
        if (!ids.length) return '';
        var own = ids.filter(function(i){ return c[i] > 0; }).length;
        var por = ids.filter(function(i){ return !cfg.cards[i].land; }), lan = ids.filter(function(i){ return cfg.cards[i].land; });
        return '<div class="set"><div class="shead"><span class="chip" style="background:' + color + '"></span><b>' + esc(title) + '</b>'
          + '<span class="vs">' + esc(note || '') + '</span><span class="pr num">' + own + '/' + ids.length + '</span></div>'
          + (por.length ? '<div class="cgrid">' + por.map(tile).join('') + '</div>' : '')
          + (lan.length ? '<div class="cgrid wide">' + lan.map(tile).join('') + '</div>' : '') + '</div>';
      }
      (cfg.members || []).forEach(function(m, mi){ h += section(m.n, m.c, cardsOf(mi), cardsOf(mi).length > 1 ? '같은 멤버 ' + cardsOf(mi).length + '종' : ''); });   // 멤버당 1장인 도감은 '같은 멤버 1종' 이 어색해 뺌
      h += section('스페셜', '#f6b93c', specials(), specials().length + '종');
      // 묶음(브로마이드 · 스페셜 굿즈): 묶음마다 새 줄. 컴팩트면 칸 수(--span)만큼 가로로 차지해 카드 크기가 멤버 칸과 같다
      function soonTile(x){
        return '<div class="ctile soon"><div class="frame"><div class="pic"><div class="gd-ph"><svg viewBox="0 0 24 24"><use href="#i-img"/></svg><span class="chip">SOON</span></div></div></div>'
          + '<div class="nm" title="' + esc(x.n) + '">' + esc(x.n) + '</div><div class="sn">' + esc(x.sub || '실물 공개 전') + '</div></div>';
      }
      function groupRow(g){
        var ids = groupIds(g.k), soon = g.soon || [], n = ids.length + soon.length;
        if (!n) return '';
        var own = ids.filter(function(i){ return c[i] > 0; }).length;
        return '<div class="cbody grp' + (compact() ? ' compact' : '') + '"><div class="set" style="--span:' + n + '"><div class="shead"><span class="chip" style="background:' + (g.c || '#f6b93c') + '"></span><b>' + esc(g.n) + '</b>'
          + '<span class="vs">' + esc(g.note || '') + '</span>' + (ids.length ? '<span class="pr num">' + own + '/' + ids.length + '</span>' : '') + '</div>'   // 공개 전 굿즈만 있으면 개수 없이 (칸 안에 SOON)
          + '<div class="cgrid">' + ids.map(tile).join('') + soon.map(soonTile).join('') + '</div></div></div>';
      }
      return '<div class="cbody' + (compact() ? ' compact' : '') + '">' + h + '</div>' + GROUPS.map(groupRow).join('');
    }
    // 멤버마다 카드가 2장 이하면 멤버 칸을 나란히 놓는다 (예: 멤버 5명 × 1종).
    // 이때 칸마다 카드가 1~2장이라 한 줄 카드 수(슬라이더)가 의미 없어서 슬라이더는 숨기고 기본 크기로 둔다
    function compact(){
      var per = (cfg.members || []).map(function(m, mi){ return cardsOf(mi).length; }).concat([specials().length]).filter(Boolean);
      return per.length > 1 && Math.max.apply(null, per) <= 2;
    }
    function sumRow(){
      // 칸 수(멤버 + 스페셜)가 6보다 적으면 한 줄을 그 수로 나눠 꽉 채운다 (--csn, theme.css). 405빵처럼 6칸이면 예전 그대로
      var gu = GROUPS.filter(function(g){ return groupIds(g.k).length; });
      var nu = (cfg.members || []).length + (specials().length ? 1 : 0) + gu.length;
      var c = counts(), h = '<div class="csum"' + (nu && nu < 6 ? ' style="--csn:' + nu + '"' : '') + '>';
      (cfg.members || []).forEach(function(m, mi){
        var ids = cardsOf(mi), own = ids.filter(function(i){ return c[i] > 0; }).length, tot = ids.reduce(function(a, i){ return a + c[i]; }, 0);
        h += '<div class="u' + (own === ids.length && ids.length ? ' full' : '') + '" style="--c:' + m.c + '"><div class="t">' + esc(m.n) + '</div><div class="v">' + own + '/' + ids.length + '</div><div class="s">' + tot + '장</div></div>';
      });
      var sp = specials(), spOwn = sp.filter(function(i){ return c[i] > 0; }).length;
      if (sp.length) h += '<div class="u' + (spOwn === sp.length ? ' full' : '') + '" style="--c:#f6b93c"><div class="t">스페셜</div><div class="v">' + spOwn + '/' + sp.length + '</div><div class="s">' + sp.reduce(function(a, i){ return a + c[i]; }, 0) + '장</div></div>';
      gu.forEach(function(g){
        var ids = groupIds(g.k), own = ids.filter(function(i){ return c[i] > 0; }).length;
        h += '<div class="u' + (own === ids.length ? ' full' : '') + '" style="--c:' + (g.c || '#f6b93c') + '"><div class="t">' + esc(g.n) + '</div><div class="v">' + own + '/' + ids.length + '</div><div class="s">' + ids.reduce(function(a, i){ return a + c[i]; }, 0) + '장</div></div>';
      });
      return h + '</div>';
    }
    function noteBar(){
      var n = dirtyN();
      return '<div class="snote' + (n ? ' dirty' : '') + '"><span class="ic">!</span><div class="tx"><b>기록은 <em>저장</em> 버튼을 눌러야 저장됩니다.</b>'
        + '<span>' + (n ? '저장하지 않은 변경이 ' + n + '건 있습니다. 저장하지 않고 페이지를 나가면 사라집니다.'
          : (savedAt ? '모든 기록이 저장되어 있습니다 · 마지막 저장 ' + when(savedAt) : '저장하지 않고 페이지를 나가면 바꾼 내용이 사라집니다.')) + '</span></div></div>';
    }
    // ---------- 공유 카드 (tools/share.js SGShare.collection, 형식은 그 파일 drawCollection 위 주석) ----------
    // 지금 화면 기록(저장 전 변경 포함). 멤버 카드는 멤버마다 한 묶음, 스페셜 한 묶음, 묶음(브로마이드 등)은 다음 줄. 공개 전(soon)은 뺀다
    var SHRI = '<svg viewBox="0 0 24 24" aria-hidden="true" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="18" cy="5" r="3"/><circle cx="6" cy="12" r="3"/><circle cx="18" cy="19" r="3"/><path d="M8.6 13.5l6.8 4M15.4 6.5l-6.8 4"/></svg>';
    function shareCard(){
      var c = counts(), o = owned(), main = cfg.modes[0], p = (cfg.ym || '').split('-');
      function cd(i){ return { src: cfg.cards[i].img || '', n: c[i], land: !!cfg.cards[i].land }; }
      function grp(name, color, ids){ return { name: name, color: color, cols: Math.min(ids.length, (cfg.members || []).length && cardsOf(0).length > 2 ? 2 : 8), cards: ids.map(cd) }; }
      var row1 = (cfg.members || []).map(function(m, mi){ return grp(m.n, m.c, cardsOf(mi)); });
      if (specials().length) row1.push(grp('스페셜', '#f6b93c', specials()));
      row1 = row1.filter(function(g){ return g.cards.length; });
      var gr = GROUPS.filter(function(g){ return groupIds(g.k).length; }).map(function(g){ return grp(g.n, g.c || '#f6b93c', groupIds(g.k)); });
      // 카드가 적으면(10장 이하) 묶음도 같은 줄에 — 빈 자리 없이. 많으면 다음 줄
      var nc = function(r){ return r.reduce(function(s, g){ return s + g.cards.length; }, 0); };
      var rows = !gr.length ? [row1] : nc(row1) + nc(gr) <= 10 ? [row1.concat(gr)] : [row1, gr];
      var pcN = cfg.cards.filter(function(x){ return !x.g; }).length;
      var parts = ['포토카드 ' + pcN + '종'].concat(GROUPS.filter(function(g){ return groupIds(g.k).length; }).map(function(g){ return g.n + ' ' + groupIds(g.k).length + '종'; }));
      var others = cfg.modes.slice(1).filter(function(m){ return m.k !== 'adj'; }).map(function(m){ return m.label + ' ' + ledger(m.k) + '장'; }).join(' · ');   // 기타 방식(교환 · 중고 등)은 수량 합 = 카드 장수
      return { kind: '포카 컬렉션 북', title: cfg.title, sub: (p[1] ? p[0] + '년 ' + (+p[1]) + '월 출시 · ' : '') + parts.join(' · '), at: Date.now(), file: 'sendungi-' + cfg.id, hmax: 280,
        stats: [{ k: '보유 종수', v: o + ' / ' + N, bar: o / N }, { k: main.label, v: won(ledger(main.k)) + '회', s: others },
          { k: '누적 금액', v: won(money()) + '원', s: '모든 구매 합계' }, { k: '중복', v: Math.max(0, c.reduce(function(a, b){ return a + b; }, 0) - o) + '장', s: '여분 카드' }],
        rows: rows,
        ach: { got: ACHDEF.filter(function(a){ return ACH[a.id]; }).sort(function(a, b){ return (b.r || 1) - (a.r || 1); }).map(function(a){ return { n: a.n, c: a.c }; }), total: ACHDEF.length } };
    }
    var state = { open: null, achAll: false, cols: null, price: {} };
    cfg.modes.forEach(function(m){ if (m['var']) state.price[m.k] = m.price || 0; });

    function render(){
      achCheck(true);
      var crumbs = ['포카 컬렉션 북', cfg.year + ' 포카', cfg.title];
      el.innerHTML = '<div class="sec"><div class="sec-t"><svg viewBox="0 0 24 24"><use href="#i-book"/></svg>'
        + crumbs.map(function(c, i){ return (i ? '<span class="cr">›</span>' : '') + (i === crumbs.length - 1 ? '<span class="lt">' + esc(c) + '</span>' : esc(c)); }).join('')
        + '</div><button type="button" class="gs shr-btn" data-act="share" title="지금 수집 기록으로 이미지 카드 만들기">' + SHRI + '공유하기</button></div>'
        + (cfg.desc ? '<p class="sec-d">' + esc(cfg.desc) + '</p>' : '')
        + metaTiles() + toggles() + noteBar() + statTiles() + ledgerRow() + sumRow()
        + (compact() ? '' : '<div class="colbar"><span class="cb-k">카드 크기</span><span class="cb-s">크게</span>'
          + '<input type="range" min="2" max="8" step="1" value="' + cols() + '" data-cols aria-label="한 줄에 보여 줄 카드 수">'
          + '<span class="cb-s">작게</span><b>' + cols() + '열</b></div>')
        + grid()
        + '<p class="csave">기록은 저장 버튼을 눌러야 이 브라우저에 저장됩니다.</p>'
        + (dirtyN() ? '<div class="sfloat"><span class="sf-t">저장하지 않은 변경 <b>' + dirtyN() + '</b>건</span>'
            + '<button type="button" data-act="revert">되돌리기</button><button type="button" class="p" data-act="save">저장</button></div>' : '');
      applyCols();
      el.querySelectorAll('input[data-price]').forEach(function(inp){ numFmt(inp); });
      var pi = el.querySelector('.le-price'); if (pi) numFmt(pi);
      if (window.SG && window.SG.afterRender) window.SG.afterRender();
      document.dispatchEvent(new CustomEvent('sgcolchange'));
    }

    // ---------- 카드 크기 ----------
    function cols(){
      if (state.cols) return state.cols;
      var s = null; try { s = localStorage.getItem(COLKEY); } catch(e){}
      state.cols = (s && +s >= 2 && +s <= 8) ? +s : (window.innerWidth <= 640 ? 3 : 4);
      return state.cols;
    }
    function applyCols(){
      // 컴팩트(슬라이더 없음)면 예전에 슬라이더로 저장해 둔 값 대신 기본값 — 5열 이상 값이 남아 있으면 카드 이름·버튼이 작아지므로
      var v = compact() ? (window.innerWidth <= 640 ? 3 : 4) : cols();
      el.setAttribute('data-cols', v);
      el.style.setProperty('--cols', v);
      el.style.setProperty('--colsw', Math.max(1, Math.round(v / 2)));
      el.querySelectorAll('.cgrid').forEach(function(g){
        var wide = g.classList.contains('wide'), want = wide ? Math.max(1, Math.round(v / 2)) : v;
        g.style.setProperty(wide ? '--colsw' : '--cols', Math.min(want, g.children.length));
      });
    }

    // ---------- 기록 추가 ----------
    function add(k, i, qty, price){
      var m = MODE[k] || { price: 0 };
      var unit = price != null ? price : (m['var'] ? (state.price[k] || 0) : (m.price || 0));
      PEND.push({ id: newId(), t: Date.now(), k: k, i: i, d: qty, w: unit * qty });
      achCheck(false);
      render();
    }
    function findEntry(id){
      var a = PEND.filter(function(e){ return e.id === id; })[0];
      if (a) return { e: a, arr: PEND };
      var b = ENTRIES.filter(function(e){ return e.id === id; })[0];
      return b ? { e: b, arr: ENTRIES } : null;
    }

    // ---------- 카드 선택 창 ----------
    function pick(i, dir){
      var mask = document.getElementById('mask'), body = document.getElementById('m-body');
      document.getElementById('m-title').textContent = (i + 1) + '. ' + cfg.cards[i].n;
      document.getElementById('m-sub').textContent = dir > 0 ? '수량과 구매 방식을 고르십시오.' : '차감할 수량과 방식을 고르십시오.';
      var qty = 1;
      var h = '<div class="mqty"><span class="lb">' + (dir > 0 ? '추가' : '차감') + ' 수량</span><div class="st">'
        + '<button type="button" data-q="-1">−</button><span class="n">1</span><button type="button" class="p" data-q="1">+</button></div>'
        + '<div class="ps">' + [1, 3, 5, 10].map(function(v){ return '<button type="button" data-qset="' + v + '">' + v + '장</button>'; }).join('') + '</div></div>';
      var fit = cfg.modes.filter(function(m){ return modeFits(m, i); });
      var vmode = fit.filter(function(m){ return m['var']; })[0];
      if (vmode && dir > 0) h += '<div class="mqty mup"><span class="lb">' + esc(vmode.label) + ' 금액 (장당)</span>'
        + '<span class="upw"><input type="text" inputmode="numeric" data-vprice value="' + won(state.price[vmode.k] || 0) + '"><span>원</span></span>'
        + '<span class="uh">' + esc(vmode.label) + eul(vmode.label) + ' 고를 때만 적용됩니다.</span></div>';
      h += '<div class="msrc">' + fit.map(function(m){
          var sub = m['var'] ? '장당 금액 입력' : (m.price ? won(m.price) + '원' : tbd(m) ? '가격 미정' : '추가 비용 없음');
          return '<button type="button" data-pickmode="' + m.k + '">' + esc(m.label) + (dir > 0 ? '' : ' 취소') + '<small>' + sub + '</small></button>';
        }).join('') + '<button type="button" data-pickmode="adj">수량만 조정<small>구매·금액 기록 없이 수량만</small></button></div>';
      body.innerHTML = h;
      mask.hidden = false;
      var nEl = body.querySelector('.mqty .n');
      body.onclick = function(ev){
        var t = ev.target.closest('button'); if (!t) return;
        if (t.hasAttribute('data-q')) { qty = Math.max(1, Math.min(99, qty + (+t.getAttribute('data-q')))); nEl.textContent = qty; return; }
        if (t.hasAttribute('data-qset')) { qty = +t.getAttribute('data-qset'); nEl.textContent = qty; return; }
        if (t.hasAttribute('data-pickmode')) {
          var k = t.getAttribute('data-pickmode');
          var vp = body.querySelector('[data-vprice]');
          var price = (k === 'adj') ? 0 : (MODE[k] && MODE[k]['var'] && vp ? numVal(vp) : null);
          if (k !== 'adj' && MODE[k] && MODE[k]['var'] && vp) { state.price[k] = numVal(vp); try { localStorage.setItem(KEY + ':price:' + k, state.price[k]); } catch(e){} }
          mask.hidden = true; body.innerHTML = ''; body.onclick = null;
          add(k, i, dir * qty, price);
        }
      };
      var vp = body.querySelector('[data-vprice]'); if (vp) numFmt(vp);
    }

    // ---------- 이벤트 ----------
    el.addEventListener('click', function(ev){
      var t = ev.target;
      var pb = t.closest('[data-panel-btn]');
      if (pb) { var k = pb.getAttribute('data-panel-btn'); state.open = (state.open === k) ? null : k; render(); return; }
      var act = t.closest('[data-act]');
      if (act) {
        var a = act.getAttribute('data-act');
        if (a === 'save') save();
        else if (a === 'revert') revert();
        else if (a === 'achall') { state.achAll = !state.achAll; render(); }
        else if (a === 'share') { if (window.SGShare) SGShare.collection(shareCard()); }
        else if (a === 'reset') {
          // 전체 초기화 (405빵과 같게): 초기화 줄 하나를 저장 전 변경으로 넣는다 → 저장된 기록 · 저장 전에 넣은 카드 모두 계산에서 빠지고(all),
          // 저장하면 그 앞 기록은 지워지고 로그엔 "전체 초기화" 한 줄만 남는다. 칭호도 비운다. 되돌리기를 누르면 저장된 상태로 돌아간다.
          // 예전 방식(음수 기록을 줄줄이 추가)은 저장 전 카드가 남고 로그가 쌓였으며, 그 전엔 칭호도 안 지워졌다
          if (!all().length && !PEND.length && !Object.keys(ACH).length) return;   // 지울 것이 없으면 그대로
          PEND = [{ id: newId(), t: Date.now(), k: 'reset', i: null, d: 0, w: 0 }];
          ACH = {}; EDITS = 0; EDITING = null;
          render();
        }
        return;
      }
      var card = t.closest('[data-card]');
      if (card) { pick(+card.getAttribute('data-card'), +card.getAttribute('data-d')); return; }
      var mode = t.closest('[data-mode]');
      if (mode) {
        var mk = mode.getAttribute('data-mode'), d = +mode.getAttribute('data-d');
        if (d < 0) { add(mk, null, -1, null); return; }
        pickCardFor(mk);
        return;
      }
      var ed = t.closest('[data-edit]');
      if (ed) { var id = ed.getAttribute('data-edit'); EDITING = (EDITING === id) ? null : id; render(); return; }
      if (t.closest('.le-cancel')) { EDITING = null; render(); return; }
      var del = t.closest('[data-del]');
      if (del) {
        var f = findEntry(del.getAttribute('data-del'));
        if (f) { f.arr.splice(f.arr.indexOf(f.e), 1); if (f.arr === ENTRIES) EDITS++; }
        EDITING = null; render(); return;
      }
      var ok = t.closest('[data-ok]');
      if (ok) {
        var f2 = findEntry(ok.getAttribute('data-ok'));
        if (f2) {
          var box = ok.closest('.ledit');
          var q = Math.max(1, Math.min(99, parseInt(box.querySelector('.le-qty').value, 10) || 1));
          var pin = box.querySelector('.le-price');
          var sg = f2.e.d < 0 ? -1 : 1;
          var unit = pin ? numVal(pin) : (f2.e.d ? Math.round(Math.abs(f2.e.w || 0) / Math.abs(f2.e.d)) : 0);
          f2.e.d = sg * q; f2.e.w = sg * q * unit; f2.e.ed = true;
          if (f2.arr === ENTRIES) EDITS++;
        }
        EDITING = null; render(); return;
      }
    });
    el.addEventListener('input', function(ev){
      var sl = ev.target.closest('[data-cols]');
      if (sl) {
        state.cols = +sl.value;
        try { localStorage.setItem(COLKEY, String(state.cols)); } catch(e){}
        applyCols();
        var lab = el.querySelector('.colbar b'); if (lab) lab.textContent = state.cols + '열';
        return;
      }
      var pr = ev.target.closest('[data-price]');
      if (pr) state.price[pr.getAttribute('data-price')] = numVal(pr);
    });

    // 원장 "+"에서 카드 고르기
    function pickCardFor(k){
      var mask = document.getElementById('mask'), body = document.getElementById('m-body');
      document.getElementById('m-title').textContent = (MODE[k] ? MODE[k].label : k) + ' — 카드 선택';
      document.getElementById('m-sub').textContent = '어떤 카드를 얻으셨습니까?';
      var c = counts();
      body.innerHTML = '<div class="mgrid">' + cfg.cards.map(function(card, i){
        if (MODE[k] && !modeFits(MODE[k], i)) return '';
        return '<button type="button" class="mcard' + (card.land ? ' land' : '') + '" data-pickcard="' + i + '">'
          + (card.img ? '<img src="' + esc(card.img) + '" alt="">' : '<div class="gd-ph"><svg viewBox="0 0 24 24"><use href="#i-img"/></svg></div>')
          + '<div class="cn">' + (i + 1) + '. ' + esc(card.n) + '</div><div class="cq">x' + c[i] + '</div></button>';
      }).join('') + '</div>';
      mask.hidden = false;
      body.onclick = function(ev){
        var b = ev.target.closest('[data-pickcard]'); if (!b) return;
        mask.hidden = true; body.innerHTML = ''; body.onclick = null;
        add(k, +b.getAttribute('data-pickcard'), 1, null);
      };
    }

    init(); render();

    var api = {
      id: cfg.id, year: cfg.year, title: cfg.title, tab: cfg.id,
      desc: cfg.desc || '', ym: cfg.ym || '', diff: Math.max(1, Math.min(5, cfg.diff || 3)),   // 홈 카드 설명 · 정렬(최신순·난이도순)
      N: N,
      names: cfg.cards.map(function(c){ return c.n; }),
      src: cfg.cards.map(function(c){ return c.img || ''; }),
      isLand: function(i){ return !!cfg.cards[i].land; },
      isPix: function(){ return false; },
      members: (cfg.members || []).map(function(m){ return { n: m.n, c: m.c }; }),
      // 포토카드 뽑기 시뮬레이터(gacha.js)가 쓴다: 카드별 멤버 번호, 구매 방식(random 인 방식이 있으면 뽑기 목록에 나온다)
      mem: cfg.cards.map(function(c){ return c.m == null ? null : c.m; }),
      grp: cfg.cards.map(function(c){ return c.g || null; }),                                  // 카드별 묶음 k (포토카드는 null)
      groups: GROUPS.map(function(g){ return { k: g.k, n: g.n, c: g.c || '#f6b93c' }; }),     // 포토카드 전체보기(pages.js)가 묶음 줄을 따로 그린다
      modes: cfg.modes || [],
      vper: (cfg.members && cfg.members.length) ? cardsOf(0).length : 0,
      mcount: (cfg.members || []).length,
      mtotal: N - specials().length - cfg.cards.filter(function(c){ return c.g; }).length,
      // 시뮬레이터(gacha.js)가 뽑는 카드 번호: 첫 뽑기형 방식(가격 있는 것)의 묶음. 묶음이 없는 도감은 null(전부)
      pool: (function(){ var r = cfg.modes.filter(function(m){ return m.random && m.price > 0; })[0]; return r && GROUPS.length ? poolOf(r) : null; })(),
      counts: counts,
      buys: function(){ return ledger(cfg.modes[0].k); },   // 주 구매 방식 횟수 (홈 카드 "N회 구매", 405빵 카드와 같은 자리)
      tileEl: function(i){ return el.querySelectorAll('.ctile')[i]; },
      el: el,
      onShow: function(){ render(); },
      dirty: function(){ return dirtyN() > 0; }
    };
    REG.push(api);
    return api;
  };

  // 저장 알림(원본 페이지의 toast를 쓸 수 없을 때를 대비)
  window.toastSG = window.toastSG || function(title, desc){
    var box = document.getElementById('toasts'); if (!box) return;
    var d = document.createElement('div'); d.className = 'toast';
    d.innerHTML = '<b>' + title + '</b><span>' + desc + '</span>';
    box.appendChild(d);
    setTimeout(function(){ if (d.parentNode) d.parentNode.removeChild(d); }, 5200);
  };
})();
