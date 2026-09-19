(function(){
  // 탭 → 원본 페이지 버튼. collection은 예전 주소 호환용
  var TABS = { home: null, cu405: 'tab-col', gacha: 'tab-sim' };
  var ALIAS = { collection: 'cu405' };
  var home = document.getElementById('v-home'), app = document.getElementById('v-app');
  var sheet = document.getElementById('bsheet');

  function cur(){
    var t = new URLSearchParams(location.search).get('tab');
    t = ALIAS[t] || t;
    return t in TABS ? t : 'home';
  }
  function show(t){
    home.hidden = t !== 'home';
    app.hidden = t === 'home';
    if (TABS[t]) document.getElementById(TABS[t]).click();
    document.querySelectorAll('.sb [data-tab], .bsheet [data-tab], .bb [data-tab]').forEach(function(a){
      a.classList.toggle('on', a.getAttribute('data-tab') === t);
    });
    // 하단 탭 바: 현재 페이지가 속한 그룹 버튼 강조
    document.querySelectorAll('.bb [data-open]').forEach(function(b){
      var g = document.getElementById(b.getAttribute('data-open'));
      b.classList.toggle('on', !!g.querySelector('[data-tab="' + t + '"]'));
    });
    closeSheet();
    window.scrollTo(0, 0);
  }

  // 모바일 하단 시트: 사이드바 그룹을 그대로 복제해서 보여줌
  function closeSheet(){
    sheet.hidden = true;
    document.querySelectorAll('.bb [data-open]').forEach(function(b){ b.classList.remove('open'); });
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
  // ym: 출시 연-월, types: 종류 수, price: 1개 가격
  // get: 구하기 난이도(물량·판매 기간 등, 1~5). 사람이 판단해서 넣는 값이라 없으면 표시하지 않음
  var COLS = {
    cu405: { ym: '2026-09', types: 27, price: 2500, comp: '멤버 20종 + 스페셜 7종', get: null }
  };
  // 비용 난이도: 모든 종류를 한 장씩 모을 때까지 드는 평균 비용 기준
  var DIFF = [
    { max: 50000,    label: '쉬움',       c: '#47d19a' },
    { max: 100000,   label: '보통',       c: '#99ce64' },
    { max: 200000,   label: '어려움',     c: '#ecd25b' },
    { max: 400000,   label: '매우 어려움', c: '#e09050' },
    { max: Infinity, label: '극악',       c: '#e96387' }
  ];
  function won(n){ return n.toLocaleString('ko-KR') + '원'; }
  function info(id){
    var d = COLS[id], h = 0;
    for (var k = 1; k <= d.types; k++) h += 1 / k;
    var packs = Math.round(d.types * h), cost = packs * d.price, lv = 0;
    while (cost >= DIFF[lv].max) lv++;
    var p = d.ym.split('-');
    return { d: d, packs: packs, cost: cost, lv: lv + 1, t: DIFF[lv], ym: p[0] + '.' + p[1], ymK: p[0] + '년 ' + (+p[1]) + '월' };
  }
  function bars(lv, t){
    var s = '<span class="dlv" style="--dc:' + t.c + '" title="수집 난이도 ' + lv + '/5 · ' + t.label + '"><span class="db">';
    for (var i = 1; i <= 5; i++) s += '<i' + (i <= lv ? ' class="f"' : '') + '></i>';
    return s + '</span><b>' + t.label + '</b></span>';
  }
  function guide(){
    var s = '<details class="dguide"><summary>수집 난이도 기준</summary><div class="dg">'
      + '<p>모든 종류를 한 장씩 모을 때까지 사야 하는 <b>평균 개수 × 가격</b>으로 자동 계산합니다. 물량이나 판매 기간처럼 구하기 어려운 정도는 반영하지 않습니다.</p><ul>';
    var lo = 0;
    DIFF.forEach(function(t, i){
      var range = t.max === Infinity ? won(lo) + ' 이상' : (lo ? won(lo) + ' ~ ' : '') + won(t.max) + ' 미만';
      s += '<li>' + bars(i + 1, t) + '<span>' + range + '</span></li>';
      lo = t.max;
    });
    return s + '</ul></div></details>';
  }
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
      + '<div class="mt"><span class="mk">수집 난이도</span>' + bars(x.lv, x.t) + '<small>비용 기준 · 5단계 중 ' + x.lv + '</small></div>';
    if (x.d.get) html += '<div class="mt"><span class="mk">구하기 난이도</span>' + bars(x.d.get, DIFF[x.d.get - 1]) + '<small>물량 · 판매 기간 기준</small></div>';
    html += '<div class="mt"><span class="mk">구성</span><b>' + x.d.types + '종</b><small>' + x.d.comp + '</small></div>'
      + '<div class="mt"><span class="mk">컴플리트 평균</span><b>약 ' + x.packs + '개</b><small>약 ' + won(x.cost) + ' · 1개 ' + won(x.d.price) + '</small></div>';
    box.innerHTML = html;
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
