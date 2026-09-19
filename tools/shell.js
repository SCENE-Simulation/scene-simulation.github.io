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
  // desc: 페이지 설명(홈 카드에도 그대로 표시), ym: 출시 연-월, types: 종류 수, price: 1개 가격
  // pkg: 패키징 이미지 [{src, cap}], news: 관련 기사 [{title, src(언론사), date, url}] — 비어 있으면 SOON
  // diff: 수집 난이도(1~5). 비용과 판매 기간·물량 같은 조건을 함께 보고 운영자가 직접 정함
  var COLS = {
    cu405: {
      desc: 'CU의 PB 브랜드인 405베이커리와의 콜라보입니다. 리센느 멤버들의 피드백을 받아 출시한 빵으로, 빵을 사면 포토카드 27종 중 1장이 랜덤으로 들어 있습니다.',
      ym: '2026-09', types: 27, price: 2500, comp: '멤버 20종 + 스페셜 7종', diff: 4,
      pkg: [],
      news: [] }
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
  // 패키징 보기 · 관련 기사 보기: 하나를 펼치면 다른 하나는 닫힘
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
            return '<figure><img src="' + esc(p.src) + '" alt="' + esc(p.cap || '패키징') + '" loading="lazy">'
              + (p.cap ? '<figcaption>' + esc(p.cap) + '</figcaption>' : '') + '</figure>';
          }).join('') : soonBox('i-img', '패키징 이미지 준비 중')) + '</div>' },
      { k: 'news', icon: 'i-news', label: '관련 기사 보기', n: news.length,
        body: news.length ? '<div class="nws">' + news.map(function(a){
            return '<a class="nw" href="' + esc(a.url) + '" target="_blank" rel="noopener noreferrer">'
              + '<span class="nw-x"><span class="nw-t">' + esc(a.title) + '</span>'
              + '<span class="nw-m">' + esc([a.src, a.date].filter(Boolean).join(' · ')) + '</span></span>'
              + '<svg><use href="#i-ext"/></svg></a>';
          }).join('') + '</div>' : '<div class="pk">' + soonBox('i-news', '관련 기사 준비 중') + '</div>' }
    ];
    x.innerHTML = '<div class="xt-bar">' + tabs.map(function(t){
        return '<button type="button" class="xt-b" data-x="' + t.k + '" aria-expanded="false">'
          + '<svg class="xi"><use href="#' + t.icon + '"/></svg>' + t.label
          + (t.n ? '<span class="xt-c">' + t.n + '</span>' : '<span class="xt-c soon">SOON</span>')
          + '<svg class="xv"><use href="#i-chev"/></svg></button>';
      }).join('') + '</div>'
      + tabs.map(function(t){ return '<div class="xt-p" data-x="' + t.k + '" hidden>' + t.body + '</div>'; }).join('');
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
