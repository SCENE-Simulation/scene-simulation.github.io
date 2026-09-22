(function(){
  // ===== 메뉴 배지 (HOT · NEW) =====
  // 여기만 고치면 사이드바와 모바일 메뉴(하단 시트)에 같이 붙는다. 떼려면 그 줄을 지운다.
  // 키 = 메뉴의 탭 이름(data-tab): cu405 405빵 콜라보 · goods2026 더현대 팝업 스토어 · gacha 포토카드 뽑기 시뮬레이션
  //       · views 조회수 예측기 · collections.js 로 추가한 콜라보는 그 설정의 id
  //       (들여쓴 하위 메뉴만 된다. 홈·위시리스트는 글자 왼쪽 자리에 아이콘이 있어서 붙지 않는다)
  // 값 = 'hot' 또는 'new'
  var TAGS = {
    cu405: 'hot',
    views: 'new'
  };
  document.querySelectorAll('.sb .nv.sub[data-tab]').forEach(function(a){
    var k = String(TAGS[a.getAttribute('data-tab')] || '').toLowerCase();
    if (k === 'hot' || k === 'new') a.insertAdjacentHTML('afterbegin', '<span class="ntag ' + k + '">' + k.toUpperCase() + '</span> ');
  });

  // 탭 → 보여 줄 화면. btn은 기존 도감 페이지의 내부 탭 버튼
  var home = document.getElementById('v-home'), app = document.getElementById('v-app');
  var TABS = { home: { el: home }, cu405: { el: app, btn: 'tab-col' }, gacha: { el: app, btn: 'tab-sim' } };
  if (window.SG) Object.keys(window.SG.pages).forEach(function(k){ TABS[k] = { el: window.SG.pages[k] }; });
  var VIEWS = [];
  Object.keys(TABS).forEach(function(k){ if (VIEWS.indexOf(TABS[k].el) < 0) VIEWS.push(TABS[k].el); });
  var ALIAS = { collection: 'cu405', goods: 'goods2026' };   // 예전 주소 호환용
  var sheet = document.getElementById('bsheet');

  function cur(){
    var t = new URLSearchParams(location.search).get('tab');
    t = ALIAS[t] || t;
    return t in TABS ? t : 'home';
  }
  function show(t){
    if (!TABS[t]) t = 'home';   // 페이지를 못 만든 경우(데이터를 못 읽음 등) 메뉴를 눌러도 멈추지 않게
    var p = TABS[t];
    VIEWS.forEach(function(v){ v.hidden = v !== p.el; });
    if (p.btn) document.getElementById(p.btn).click();
    if (window.SG) window.SG.onShow(t);
    document.querySelectorAll('.sb [data-tab], .bsheet [data-tab]').forEach(function(a){
      a.classList.toggle('on', a.getAttribute('data-tab') === t);
    });
    closeSheet();   // 하단 탭 바 강조는 closeSheet() → syncBB() 가 맡는다
    window.scrollTo(0, 0);
  }

  // 하단 탭 바 강조를 현재 탭 기준으로 되돌린다. 켜지는 건 현재 페이지 하나뿐이다.
  function syncBB(){
    var t = cur();
    document.querySelectorAll('.bb [data-tab]').forEach(function(a){
      a.classList.toggle('on', a.getAttribute('data-tab') === t);
    });
    document.querySelectorAll('.bb [data-open]').forEach(function(b){
      var g = document.getElementById(b.getAttribute('data-open'));
      b.classList.remove('open');
      b.classList.toggle('on', !!g.querySelector('[data-tab="' + t + '"]'));
    });
  }

  // 모바일 하단 시트: 사이드바 그룹을 그대로 복제해서 보여줌
  function closeSheet(){
    sheet.hidden = true;
    syncBB();
  }
  function openSheet(id, btn){
    if (!sheet.hidden && sheet.getAttribute('data-for') === id) { closeSheet(); return; }
    sheet.innerHTML = '';
    var g = document.getElementById(id).cloneNode(true);
    g.removeAttribute('id');
    sheet.appendChild(g);
    sheet.setAttribute('data-for', id);
    sheet.querySelectorAll('[data-tab]').forEach(function(a){
      a.classList.toggle('on', a.getAttribute('data-tab') === cur());
    });
    sheet.hidden = false;
    // 시트가 열려 있는 동안에는 방금 누른 버튼 하나만 켠다
    document.querySelectorAll('.bb a, .bb button').forEach(function(b){ b.classList.remove('on', 'open'); });
    btn.classList.add('open');
  }

  document.addEventListener('click', function(e){
    var ob = e.target.closest('.bb [data-open]');
    if (ob) { openSheet(ob.getAttribute('data-open'), ob); return; }
    var a = e.target.closest('a[data-tab]');
    if (a && !e.ctrlKey && !e.metaKey && !e.shiftKey) {
      e.preventDefault();
      var t = a.getAttribute('data-tab');
      if (t !== cur()) history.pushState(null, '', '?tab=' + t);
      show(t);
      return;
    }
    if (!sheet.hidden && !e.target.closest('.bsheet')) closeSheet();
    var dg = document.querySelector('.dguide[open]');
    if (dg && !e.target.closest('.dguide')) dg.open = false;
  });
  document.addEventListener('keydown', function(e){ if (e.key === 'Escape') { closeSheet(); var dg = document.querySelector('.dguide[open]'); if (dg) dg.open = false; } });
  window.addEventListener('popstate', function(){ show(cur()); });
  show(cur());

  // ===== 컬렉션 정보: 출시 달 · 수집 난이도 =====
  // desc: 페이지 설명(홈 카드에도 그대로 표시), ym: 출시 연-월, types: 종류 수, price: 1개 가격
  // pkg: 패키징 이미지 [{src, cap, wide?}] (wide: 한 줄 전체·원본 크기), news: 관련 미디어(기사·영상) [{title, src(언론사), date, url}] — 비어 있으면 SOON
  // diff: 수집 난이도(1~5). 비용과 판매 기간·물량 같은 조건을 함께 보고 운영자가 직접 정함
  var COLS = {
    cu405: {
      desc: 'CU의 PB 브랜드인 405베이커리와의 콜라보입니다. 리센느 멤버들의 피드백을 받아 출시한 빵으로, 빵을 사면 포토카드 27종 중 1장이 랜덤으로 들어 있습니다.',
      ym: '2026-09', types: 27, price: 2500, comp: '멤버 20종 + 스페셜 7종', diff: 4,
      pkg: [
        // wide: 큰 가로 이미지 — 작은 칸 대신 한 줄 전체에 원본 크기 그대로 (칸보다 크면 칸 폭에 맞춤)
        { src: 'img/cu405/pkg-sweet-scene.webp', cap: '리센느와 CU의 SWEET Scene! · 빵 5종 패키지', wide: true }
      ],
      news: [
        { title: "CU, '리센느 빵' 출시 나흘 만에 10만개 판매", src: '연합뉴스', date: '2026.09.21', url: 'https://www.yna.co.kr/view/AKR20260921039400030' },
        { title: 'CU 리센느빵 출시일·가격·예약 방법은?', src: '위키푸디', date: '2026.09.17', url: 'https://www.wikifoodie.co.kr/news/articleView.html?idxno=14443' }
      ] }
  };
  var DIFF = [
    { label: '쉬움',       c: '#47d19a', desc: '적은 비용으로 금방 모을 수 있고, 구하기도 어렵지 않습니다.' },
    { label: '보통',       c: '#99ce64', desc: '어느 정도 비용이 들지만, 꾸준히 사면 무리 없이 모을 수 있습니다.' },
    { label: '어려움',     c: '#ecd25b', desc: '비용 부담이 크거나, 판매처·기간이 한정돼 신경 써서 구해야 합니다.' },
    { label: '매우 어려움', c: '#e09050', desc: '비용이 많이 들고, 교환이나 중고 거래 없이는 완성하기 힘듭니다.' },
    { label: '극악',       c: '#e96387', desc: '판매 기간이 짧거나 물량이 적어, 시기를 놓치면 사실상 구할 수 없습니다.' }
  ];
  function won(n){ return n.toLocaleString('ko-KR') + '원'; }
  function info(id){
    var d = COLS[id], h = 0;
    for (var k = 1; k <= d.types; k++) h += 1 / k;
    var packs = Math.round(d.types * h), p = d.ym.split('-');
    return { d: d, packs: packs, cost: packs * d.price, lv: d.diff, t: DIFF[d.diff - 1], ym: p[0] + '.' + p[1], ymK: p[0] + '년 ' + (+p[1]) + '월' };
  }
  function bars(lv, t){
    var s = '<span class="dlv" style="--dc:' + t.c + '" title="수집 난이도 ' + lv + '/5 · ' + t.label + '"><span class="db">';
    for (var i = 1; i <= 5; i++) s += '<i' + (i <= lv ? ' class="f"' : '') + '></i>';
    return s + '</span><b>' + t.label + '</b></span>';
  }
  function guide(){
    var s = '<details class="dguide"><summary>수집 난이도 기준</summary><div class="dg">'
      + '<p>다 모으는 데 드는 <b>비용</b>과 함께, 판매 기간·물량·판매처처럼 <b>시기나 조건 때문에 구하기 어려운 정도</b>를 종합해서 정합니다.</p><ul>';
    DIFF.forEach(function(t, i){
      s += '<li>' + bars(i + 1, t) + '<span>' + t.desc + '</span></li>';
    });
    return s + '</ul></div></details>';
  }
  document.querySelectorAll('[data-desc]').forEach(function(el){
    var d = COLS[el.getAttribute('data-desc')];
    el.textContent = d.desc;
    if (el.classList.contains('cdesc')) el.title = d.desc;
  });
  document.querySelectorAll('.hc[data-col]').forEach(function(card){
    var x = info(card.getAttribute('data-col'));
    card.setAttribute('data-ym', x.d.ym);
    card.setAttribute('data-lv', x.lv);
    card.querySelector('.meta').innerHTML =
      '<span class="mchip"><svg><use href="#i-cal"/></svg>' + x.ym + ' 출시</span>' + bars(x.lv, x.t);
  });
  document.querySelectorAll('.cmeta[data-col]').forEach(function(box){
    var x = info(box.getAttribute('data-col'));
    var html = '<div class="mt"><span class="mk">출시</span><b>' + x.ym + '</b><small>' + x.ymK + '</small></div>'
      + '<div class="mt"><span class="mk">구성</span><b>' + x.d.types + '종</b><small>' + x.d.comp + '</small></div>'
      + '<div class="mt"><span class="mk">컴플리트 평균</span><b>약 ' + x.packs + '개</b><small>약 ' + won(x.cost) + ' · 1개 ' + won(x.d.price) + '</small></div>'
      + '<div class="mt"><span class="mk">수집 난이도</span>' + bars(x.lv, x.t) + '<small>비용 · 구하기 종합 · 5단계 중 ' + x.lv + '</small></div>';
    box.innerHTML = html;
  });
  // 패키징 보기 · 관련 미디어 보기: 하나를 펼치면 다른 하나는 닫힘
  function esc(s){
    return String(s).replace(/[&<>"']/g, function(c){ return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]; });
  }
  function soonBox(icon, text){
    return '<div class="pk-ph"><svg viewBox="0 0 24 24"><use href="#' + icon + '"/></svg><span>' + text + '</span><span class="chip">SOON</span></div>';
  }
  document.querySelectorAll('.xt[data-col]').forEach(function(x){
    var d = COLS[x.getAttribute('data-col')], pkg = d.pkg || [], news = d.news || [];
    var tabs = [
      { k: 'pkg', icon: 'i-box', label: '패키징 보기', n: pkg.length,
        body: '<div class="pk">' + (pkg.length ? pkg.map(function(p){
            return '<figure' + (p.wide ? ' class="wide"' : '') + '><img src="' + esc(p.src) + '" alt="' + esc(p.cap || '패키징') + '" loading="lazy">'
              + (p.cap ? '<figcaption>' + esc(p.cap) + '</figcaption>' : '') + '</figure>';
          }).join('') : soonBox('i-img', '패키징 이미지 준비 중')) + '</div>' },
      { k: 'news', icon: 'i-news', label: '관련 미디어 보기', n: news.length,
        body: news.length ? '<div class="nws">' + news.map(function(a){
            return '<a class="nw" href="' + esc(a.url) + '" target="_blank" rel="noopener noreferrer">'
              + '<span class="nw-x"><span class="nw-t">' + esc(a.title) + '</span>'
              + '<span class="nw-m">' + esc([a.src, a.date].filter(Boolean).join(' · ')) + '</span></span>'
              + '<svg><use href="#i-ext"/></svg></a>';
          }).join('') + '</div>' : '<div class="pk">' + soonBox('i-news', '관련 미디어 준비 중') + '</div>' }
    ];
    x.innerHTML = '<div class="xt-bar">' + tabs.map(function(t){
        return '<button type="button" class="xt-b" data-x="' + t.k + '" aria-expanded="false">'
          + '<svg class="xi"><use href="#' + t.icon + '"/></svg>' + t.label
          + (t.n ? '<span class="xt-c">' + t.n + '</span>' : '<span class="xt-c soon">SOON</span>')
          + '<svg class="xv"><use href="#i-chev"/></svg></button>';
      }).join('') + '</div>'
      + tabs.map(function(t){ return '<div class="xt-p" data-x="' + t.k + '" hidden>' + t.body + '</div>'; }).join('');
    // 도감의 "기록 로그" 토글도 같은 줄로 옮겨서 하나만 열리게 함
    var lb = document.getElementById('c-logbtn'), lp = document.getElementById('c-logp');
    if (lb && lp && x.closest('#page-col')) {
      lb.onclick = null;
      lb.setAttribute('data-x', 'log');
      x.querySelector('.xt-bar').appendChild(lb);
      lp.classList.add('xt-p');
      lp.setAttribute('data-x', 'log');
      x.appendChild(lp);
      var old = document.querySelector('.lgx'); if (old && !old.children.length) old.parentNode.removeChild(old);
      // 중고 구매 칸의 안내를 눌러 로그를 열 때도 다른 패널은 닫음
      document.getElementById('c-usedhint').addEventListener('click', function(){
        x.querySelectorAll('.xt-b').forEach(function(o){ o.setAttribute('aria-expanded', String(o === lb)); });
        x.querySelectorAll('.xt-p').forEach(function(p){ p.hidden = p !== lp; });
      });
    }
    x.addEventListener('click', function(e){
      var b = e.target.closest('.xt-b'); if (!b) return;
      var k = b.getAttribute('data-x'), open = b.getAttribute('aria-expanded') !== 'true';
      x.querySelectorAll('.xt-b').forEach(function(o){ o.setAttribute('aria-expanded', String(open && o === b)); });
      x.querySelectorAll('.xt-p').forEach(function(p){ p.hidden = !(open && p.getAttribute('data-x') === k); });
    });
  });
  var slot = document.getElementById('dguide-slot');
  if (slot) slot.outerHTML = guide();

  // 홈 컬렉션 정렬: 최신순 / 난이도순 (준비 중 항목은 항상 뒤로)
  var grid = document.getElementById('col-grid');
  document.querySelectorAll('.seg [data-sort]').forEach(function(b){
    b.addEventListener('click', function(){
      var mode = b.getAttribute('data-sort');
      document.querySelectorAll('.seg [data-sort]').forEach(function(o){ o.classList.toggle('on', o === b); });
      var cards = [].slice.call(grid.children);
      cards.sort(function(a, c){
        var sa = a.classList.contains('soon'), sc = c.classList.contains('soon');
        if (sa !== sc) return sa ? 1 : -1;
        if (sa) return 0;
        if (mode === 'diff') return (+c.getAttribute('data-lv')) - (+a.getAttribute('data-lv')) || (c.getAttribute('data-ym') > a.getAttribute('data-ym') ? 1 : -1);
        return c.getAttribute('data-ym') > a.getAttribute('data-ym') ? 1 : c.getAttribute('data-ym') < a.getAttribute('data-ym') ? -1 : 0;
      });
      cards.forEach(function(el){ grid.appendChild(el); });
    });
  });

  // 컬렉션 통계: 값이 커질수록 색이 바뀜 (회색 → 민트 → 연두 → 금 → 주황 → 분홍)
  var TINT = {
    'c-cnt': [[1, '#47d19a'], [27, '#99ce64'], [60, '#ecd25b'], [105, '#e09050'], [150, '#e96387']],
    'c-won': [[1, '#47d19a'], [50000, '#99ce64'], [100000, '#ecd25b'], [262500, '#e09050'], [400000, '#e96387']],
    'c-own': [[1, '#47d19a'], [9, '#99ce64'], [18, '#ecd25b'], [27, '#f6b93c']]
  };
  function tint(){
    Object.keys(TINT).forEach(function(id){
      var el = document.getElementById(id); if (!el) return;
      var v = parseInt(el.textContent.split('/')[0].replace(/\D/g, ''), 10) || 0, c = null, lv = 0;
      TINT[id].forEach(function(s, i){ if (v >= s[0]) { c = s[1]; lv = i + 1; } });
      var tile = el.closest('.m');
      if (c) tile.style.setProperty('--tc', c); else tile.style.removeProperty('--tc');
      tile.setAttribute('data-lv', lv);
      tile.classList.toggle('done', id === 'c-own' && v >= 27);
    });
  }
  var tobs = new MutationObserver(tint);
  Object.keys(TINT).forEach(function(id){ var el = document.getElementById(id); if (el) tobs.observe(el, { childList: true, characterData: true, subtree: true }); });
  tint();

  // 홈의 컬렉션 요약을 도감 숫자와 연동
  function sync(){
    document.querySelectorAll('[data-mirror]').forEach(function(el){
      var src = document.getElementById(el.getAttribute('data-mirror'));
      if (src) el.textContent = src.textContent;
    });
  }
  var obs = new MutationObserver(sync);
  ['c-own', 'c-cnt'].forEach(function(id){
    var el = document.getElementById(id);
    if (el) obs.observe(el, { childList: true, characterData: true, subtree: true });
  });
  sync();
})();
