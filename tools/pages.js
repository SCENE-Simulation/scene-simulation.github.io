// 굿즈 컬렉션 · 통합 보기 · 위시리스트
(function(){
  var LS = { wish: 'sendungi:wish', goods: 'sendungi:goods' };
  function load(k, d){ try { return JSON.parse(localStorage.getItem(k)) || d; } catch(e){ return d; } }
  function save(k, v){ try { localStorage.setItem(k, JSON.stringify(v)); } catch(e){} }
  function won(n){ return (n || 0).toLocaleString('ko-KR'); }
  function esc(s){ return String(s).replace(/[&<>"']/g, function(c){ return { '&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;' }[c]; }); }

  // ===== 굿즈 자료 =====
  // 연도별 상품 목록. 자료를 받으면 여기에 넣으면 페이지·통합 보기·위시리스트에 모두 반영됨
  // { id, name, price, parts(구성), date(출시), img(이미지 주소) }
  var GOODS = { '2026': [], '2025': [], '2024': [] };
  var YEARS = ['2026', '2025', '2024'];
  // 연도별 굿즈 컬렉션 이름
  var GCOLL = { '2026': '더현대 팝업 스토어', '2025': '2025년 굿즈', '2024': '2024년 굿즈' };

  // ===== 포토카드 컬렉션 =====
  function cu(){ return window.CU405; }
  function pcCols(){ return cu() ? [cu()] : []; }
  function pcTotal(){ return pcCols().reduce(function(s, c){ return s + c.N; }, 0); }
  function pcOwned(){
    return pcCols().reduce(function(s, c){
      return s + c.counts().filter(function(v){ return v > 0; }).length;
    }, 0);
  }
  function goodsAll(){
    return YEARS.reduce(function(a, y){ return a.concat(GOODS[y].map(function(g){ return { y: y, g: g }; })); }, []);
  }
  function gdOwned(){ return goodsAll().filter(function(x){ return GOWN[x.g.id] > 0; }).length; }

  var WISH = load(LS.wish, {}), GOWN = load(LS.goods, {});

  // ===== 위시리스트 하트 =====
  function heart(key, big){
    var on = !!WISH[key];
    return '<button type="button" class="wish' + (on ? ' on' : '') + (big ? ' big' : '') + '" data-wish="' + esc(key) + '"'
      + ' aria-pressed="' + on + '" aria-label="위시리스트에 담기" title="위시리스트"><svg viewBox="0 0 24 24"><use href="#i-heart"/></svg></button>';
  }
  function wishCount(){ return Object.keys(WISH).length; }
  function syncHearts(){
    document.querySelectorAll('[data-wish]').forEach(function(b){
      var on = !!WISH[b.getAttribute('data-wish')];
      b.classList.toggle('on', on);
      b.setAttribute('aria-pressed', String(on));
    });
    var n = document.getElementById('wish-n');
    if (n) { n.textContent = wishCount(); n.hidden = !wishCount(); }
  }
  function toggleWish(key){
    if (WISH[key]) delete WISH[key]; else WISH[key] = Date.now();
    save(LS.wish, WISH);
    syncHearts(); renderWish(); renderSum();
  }

  // ===== 페이지 틀 =====
  var main = document.querySelector('main.mn');
  function page(id){
    var s = document.createElement('section');
    s.id = id; s.className = 'wrap page'; s.hidden = true;
    main.appendChild(s);
    return s;
  }
  var elGoods = page('v-goods2026'), elAllCards = page('v-allcards'), elAllGoods = page('v-allgoods'), elWish = page('v-wish');

  function sec(icon, crumbs, desc){
    var t = crumbs.map(function(c, i){
      return (i ? '<span class="cr">›</span>' : '') + (i === crumbs.length - 1 ? '<span class="lt">' + esc(c) + '</span>' : esc(c));
    }).join('');
    return '<div class="sec"><div class="sec-t"><svg viewBox="0 0 24 24"><use href="#' + icon + '"/></svg>' + t + '</div></div>'
      + (desc ? '<p class="sec-d">' + desc + '</p>' : '');
  }
  function empty(icon, text, sub){
    return '<div class="pk-ph tall"><svg viewBox="0 0 24 24"><use href="#' + icon + '"/></svg><span>' + text + '</span>'
      + (sub ? '<small>' + sub + '</small>' : '') + '<span class="chip">SOON</span></div>';
  }

  // ===== 굿즈 카드 =====
  function goodsCard(g){
    var n = GOWN[g.id] || 0;
    return '<article class="gd' + (n ? ' have' : '') + '" data-g="' + esc(g.id) + '">'
      + '<div class="gd-img">' + heart('gd:' + g.id)
      + (g.img ? '<img src="' + esc(g.img) + '" alt="' + esc(g.name) + '" loading="lazy">' : '<div class="gd-ph"><svg viewBox="0 0 24 24"><use href="#i-img"/></svg></div>')
      + '</div>'
      + '<div class="gd-b"><h4>' + esc(g.name) + '</h4>'
      + '<div class="gd-m">' + (g.price != null ? '<span class="pr">' + won(g.price) + '원</span>' : '') + (g.date ? '<span>' + esc(g.date) + ' 출시</span>' : '') + '</div>'
      + (g.parts ? '<p>' + esc(g.parts) + '</p>' : '')
      + '<div class="gd-c"><span class="gk">보유</span><button type="button" data-gd="-1"' + (n ? '' : ' disabled') + '>−</button>'
      + '<b>' + n + '</b><button type="button" class="p" data-gd="1">+</button></div>'
      + '</div></article>';
  }
  function goodsGrid(list){
    return list.length ? '<div class="gdgrid">' + list.map(goodsCard).join('') + '</div>'
      : empty('i-gift', '등록된 굿즈가 없습니다', '굿즈 정보를 알려주시면 이 자리에 채워집니다');
  }
  function goodsStats(list){
    var own = list.filter(function(g){ return GOWN[g.id] > 0; }).length;
    var spent = list.reduce(function(s, g){ return s + (GOWN[g.id] || 0) * (g.price || 0); }, 0);
    return '<div class="cmeta"><div class="mt"><span class="mk">등록 상품</span><b>' + list.length + '종</b><small>이 연도에 나온 굿즈</small></div>'
      + '<div class="mt"><span class="mk">보유</span><b>' + own + '/' + list.length + '</b><small>가지고 있는 종류</small></div>'
      + '<div class="mt"><span class="mk">쓴 금액</span><b>' + won(spent) + '원</b><small>보유 수량 × 가격</small></div></div>';
  }

  // ===== 각 페이지 =====
  function renderGoods(){
    var list = GOODS['2026'];
    elGoods.innerHTML = sec('i-gift', ['굿즈 컬렉션 북', '2026 굿즈', GCOLL['2026']],
      GCOLL['2026'] + '에서 나온 리센느 굿즈를 상품별로 모았습니다. 가지고 있는 굿즈는 보유 수량을 올려 두면 통합 현황에 반영됩니다.')
      + goodsStats(list) + '<p class="gnote2">기록은 이 브라우저에 바로 저장됩니다.</p>' + goodsGrid(list);
  }
  function renderAllGoods(){
    var h = sec('i-gift', ['굿즈 컬렉션 북', '굿즈 통합 보기'], '2024년부터 2026년까지 나온 굿즈를 연도별로 모아서 봅니다.');
    YEARS.forEach(function(y){
      h += '<div class="sec sec2"><div class="sec-t">' + y + '년 · ' + esc(GCOLL[y]) + '<span class="cnt">' + GOODS[y].length + '종</span></div></div>' + goodsGrid(GOODS[y]);
    });
    elAllGoods.innerHTML = h;
  }
  function cardTile(c, i, count, key){
    return '<div class="pcard' + (count ? ' have' : '') + (c.isLand(i) ? ' land' : '') + '">'
      + '<div class="pc-img">' + heart(key)
      + '<img src="' + c.src[i] + '" alt="' + esc(c.names[i]) + '"' + (c.isPix(i) ? ' class="pix"' : '') + ' loading="lazy">'
      + (count > 1 ? '<span class="pc-n">×' + count + '</span>' : '') + '</div>'
      + '<div class="pc-t">' + (i + 1) + '. ' + esc(c.names[i]) + '</div></div>';
  }
  function renderAllCards(){
    var c = cu();
    if (!c) { elAllCards.innerHTML = sec('i-grid', ['포카 컬렉션 북', '포토카드 통합 보기'], '') + empty('i-book', '포토카드 자료를 불러오는 중입니다'); return; }
    var counts = c.counts();
    var h = sec('i-grid', ['포카 컬렉션 북', '포토카드 통합 보기'],
      '지금까지 나온 포토카드를 멤버별로 모아서 봅니다. 가지고 있는 카드는 색이 살아나고, 하트를 누르면 위시리스트에 담깁니다.');
    h += '<div class="cmeta"><div class="mt"><span class="mk">전체</span><b>' + pcTotal() + '종</b><small>컬렉션 ' + pcCols().length + '개</small></div>'
      + '<div class="mt"><span class="mk">보유</span><b>' + pcOwned() + '/' + pcTotal() + '</b><small>모은 종류</small></div>'
      + '<div class="mt"><span class="mk">위시리스트</span><b>' + Object.keys(WISH).filter(function(k){ return k.indexOf('pc:') === 0; }).length + '장</b><small>담아 둔 카드</small></div></div>';
    c.members.forEach(function(m, mi){
      var ids = [], v;
      for (v = 0; v < c.vper; v++) ids.push(mi * c.vper + v);
      var own = ids.filter(function(i){ return counts[i] > 0; }).length;
      h += '<div class="sec sec2"><div class="sec-t"><span class="dot" style="background:' + m.c + '"></span>' + esc(m.n)
        + '<span class="cnt">' + own + '/' + ids.length + '</span></div></div>'
        + '<div class="pcgrid">' + ids.map(function(i){ return cardTile(c, i, counts[i], 'pc:' + c.id + ':' + i); }).join('') + '</div>';
    });
    var sp = [], k;
    for (k = c.mtotal; k < c.N; k++) sp.push(k);
    var spOwn = sp.filter(function(i){ return counts[i] > 0; }).length;
    h += '<div class="sec sec2"><div class="sec-t"><span class="dot" style="background:#f6b93c"></span>스페셜<span class="cnt">' + spOwn + '/' + sp.length + '</span></div></div>'
      + '<div class="pcgrid">' + sp.map(function(i){ return cardTile(c, i, counts[i], 'pc:' + c.id + ':' + i); }).join('') + '</div>';
    elAllCards.innerHTML = h;
  }
  function wishItems(){
    var c = cu(), out = [];
    Object.keys(WISH).sort(function(a, b){ return WISH[a] - WISH[b]; }).forEach(function(key){
      if (key.indexOf('pc:') === 0 && c) {
        var i = +key.split(':')[2];
        out.push({ key: key, type: 'pc', name: (i + 1) + '. ' + c.names[i], from: c.title, img: c.src[i], pix: c.isPix(i), land: c.isLand(i), own: c.counts()[i] || 0, tab: c.id });
      } else if (key.indexOf('gd:') === 0) {
        var id = key.slice(3), f = null, fy = null;
        goodsAll().forEach(function(x){ if (x.g.id === id) { f = x.g; fy = x.y; } });
        if (f) out.push({ key: key, type: 'gd', name: f.name, from: fy + ' · ' + GCOLL[fy], img: f.img, price: f.price, own: GOWN[id] || 0, tab: 'goods' + fy });
      }
    });
    return out;
  }
  function renderWish(){
    var items = wishItems();
    var h = sec('i-heart', ['위시리스트'], '하트를 누른 포토카드와 굿즈가 여기에 모입니다. 기록은 이 브라우저에 저장됩니다.');
    [['포토카드', 'pc', '포토카드 도감이나 전체보기에서 하트를 누르면 여기에 담깁니다'],
     ['굿즈', 'gd', '굿즈 페이지에서 하트를 누르면 여기에 담깁니다']].forEach(function(t){
      var list = items.filter(function(x){ return x.type === t[1]; });
      h += '<div class="sec sec2"><div class="sec-t">' + t[0] + '<span class="cnt">' + list.length + '</span></div></div>';
      if (!list.length) {
        h += '<div class="pk-ph tall"><svg viewBox="0 0 24 24"><use href="#i-heart"/></svg><span>담아 둔 ' + t[0] + '가 없습니다</span><small>' + t[2] + '</small></div>';
        return;
      }
      // 같은 컬렉션끼리 묶고, 제목과 "페이지 열기"는 묶음마다 한 번만
      var order = [], by = {};
      list.forEach(function(x){
        if (!by[x.tab]) { by[x.tab] = { from: x.from, tab: x.tab, items: [] }; order.push(x.tab); }
        by[x.tab].items.push(x);
      });
      order.forEach(function(tab){
        var g = by[tab];
        h += '<div class="wgrp"><div class="wgrp-h"><b>' + esc(g.from) + '</b><span class="cnt">' + g.items.length + '</span>'
          + '<a class="w-go" href="?tab=' + g.tab + '" data-tab="' + g.tab + '">페이지 열기 →</a></div>'
          + '<div class="pcgrid">' + g.items.map(function(x){
              return '<div class="pcard' + (x.own ? ' have' : '') + (x.land ? ' land' : '') + '">'
                + '<div class="pc-img">' + heart(x.key)
                + (x.img ? '<img src="' + esc(x.img) + '" alt=""' + (x.pix ? ' class="pix"' : '') + ' loading="lazy">'
                         : '<div class="gd-ph"><svg viewBox="0 0 24 24"><use href="#i-img"/></svg></div>')
                + (x.own > 1 ? '<span class="pc-n">×' + x.own + '</span>' : '') + '</div>'
                + '<div class="pc-t">' + esc(x.name) + '</div></div>';
            }).join('') + '</div></div>';
      });
    });
    elWish.innerHTML = h;
  }
  function renderSum(){
    var pc = document.getElementById('sum-pc'), gd = document.getElementById('sum-gd');
    if (!pc || !gd) return;
    var pt = pcTotal(), po = pcOwned(), gl = goodsAll().length, go = gdOwned();
    function box(icon, title, own, total, sub, tab, c){
      var pct = total ? Math.round(own / total * 100) : 0;
      return '<div class="k"><svg><use href="#' + icon + '"/></svg>' + title + '</div>'
        + '<div class="v"><b>' + own + '</b><span>/ ' + total + '종</span></div>'
        + '<div class="pbar"><i style="width:' + pct + '%;background:' + c + '"></i></div>'
        + '<div class="s">' + sub + '</div>'
        + '<a class="go" href="?tab=' + tab + '" data-tab="' + tab + '">통합 보기 →</a>';
    }
    pc.innerHTML = box('i-book', '포토카드 통합', po, pt, '컬렉션 ' + pcCols().length + '개 · 2024~2026년', 'allcards', '#e96387');
    gd.innerHTML = box('i-gift', '굿즈 통합', go, gl, gl ? ('상품 ' + gl + '종 · 2024~2026년') : '등록된 굿즈가 아직 없습니다', 'allgoods', '#47d19a');
    syncHearts();
  }

  // ===== 이벤트 =====
  document.addEventListener('click', function(e){
    var w = e.target.closest('[data-wish]');
    if (w) { e.preventDefault(); toggleWish(w.getAttribute('data-wish')); return; }
    var g = e.target.closest('[data-gd]');
    if (g) {
      var card = g.closest('[data-g]'), id = card.getAttribute('data-g'), d = +g.getAttribute('data-gd');
      GOWN[id] = Math.max(0, Math.min(99, (GOWN[id] || 0) + d));
      save(LS.goods, GOWN);
      renderGoods(); renderAllGoods(); renderWish(); renderSum();
    }
  });
  // 도감 수량이 바뀌면 통합 현황도 갱신
  document.addEventListener('cu405change', function(){ renderSum(); if (!elAllCards.hidden) renderAllCards(); });
  document.addEventListener('cu405ready', function(){ injectCardHearts(); renderSum(); syncHearts(); });

  // 도감 카드 타일 위에 하트 달기
  function injectCardHearts(){
    var c = cu(); if (!c || !c.tileEl) return;
    for (var i = 0; i < c.N; i++) {
      var el = c.tileEl(i); if (!el || el.querySelector('.wish')) continue;
      (el.querySelector('.frame') || el).insertAdjacentHTML('beforeend', heart('pc:' + c.id + ':' + i));
    }
    syncHearts();
  }

  renderGoods(); renderAllGoods(); renderAllCards(); renderWish();
  injectCardHearts(); syncHearts();

  window.SG = {
    pages: { goods2026: elGoods, allcards: elAllCards, allgoods: elAllGoods, wish: elWish },
    onShow: function(tab){
      if (tab === 'allcards') renderAllCards();
      else if (tab === 'wish') renderWish();
      else if (tab === 'allgoods') renderAllGoods();
      else if (tab === 'goods2026') renderGoods();
      else if (tab === 'home') renderSum();
      syncHearts();
    }
  };
})();
