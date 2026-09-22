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
  function pcCols(){ return (cu() ? [cu()] : []).concat(window.SGCOLS || []); }
  function pcCol(id){ return pcCols().filter(function(c){ return c.id === id; })[0]; }
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

  // ===== 만들지 않는 연도 안내 페이지 (사이드바 2025·2024 포카 · 굿즈) =====
  // 2024·2025년 포토카드 · 굿즈 컬렉션 북은 만들지 않는다. 사이드바 연도 줄(아래 메뉴 없음)을 누르면 이 페이지로 온다.
  // 안내 문구는 여기만 고치면 된다 — 페이지마다 t(제목) · d(설명, HTML 가능)를 넣으면 아래 기본 문구 대신 쓴다
  var NOBUILD = {
    pc2025:    { pc: true,  y: '2025' },
    pc2024:    { pc: true,  y: '2024' },
    goods2025: { pc: false, y: '2025' },
    goods2024: { pc: false, y: '2024' }
  };
  function noBuild(k){
    var d = NOBUILD[k], what = d.pc ? '포토카드' : '굿즈', icon = d.pc ? 'i-book' : 'i-gift';
    var t = d.t || d.y + '년 ' + what + ' 컬렉션 북은 만들지 않습니다';
    var desc = d.d || '센둥이 시뮬레이터의 ' + what + ' 컬렉션 북은 2026년부터 기록합니다. ' + d.y + '년에 나온 ' + what + '는 따로 페이지를 만들 계획이 없습니다.';
    var go = d.pc ? ['allcards', '포토카드 전체보기 →'] : ['goods2026', '2026 굿즈 보기 →'];
    return sec(icon, [d.pc ? '포카 컬렉션 북' : '굿즈 컬렉션 북', d.y + (d.pc ? ' 포카' : ' 굿즈')])
      + '<div class="pk-ph tall nbx"><svg viewBox="0 0 24 24"><use href="#' + icon + '"/></svg>'
      + '<b>' + esc(t) + '</b><p>' + desc + '</p>'
      + '<div class="nbx-go"><a href="?tab=' + go[0] + '" data-tab="' + go[0] + '">' + go[1] + '</a>'
      + '<a href="?tab=home" data-tab="home">홈으로</a></div></div>';
  }
  var elNoBuild = {};
  Object.keys(NOBUILD).forEach(function(k){ elNoBuild[k] = page('v-' + k); elNoBuild[k].innerHTML = noBuild(k); });

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
      : empty('i-gift', '등록된 굿즈가 없습니다', '굿즈 정보를 준비하고 있습니다');
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
  function cardTile(c, i, count, key, dot){
    return '<div class="pcard' + (count ? ' have' : '') + (c.isLand(i) ? ' land' : '') + '">'
      + '<div class="pc-img">' + heart(key)
      + (c.src[i] ? '<img src="' + esc(c.src[i]) + '" alt="' + esc(c.names[i]) + '"' + (c.isPix(i) ? ' class="pix"' : '') + ' loading="lazy">'
                  : '<div class="gd-ph"><svg viewBox="0 0 24 24"><use href="#i-img"/></svg></div>')
      + (count > 1 ? '<span class="pc-n">×' + count + '</span>' : '') + '</div>'
      + '<div class="pc-t" title="' + esc(c.names[i]) + '">' + (dot ? '<i class="pc-dot" style="background:' + dot + '"></i>' : '') + (i + 1) + '. ' + esc(c.names[i]) + '</div></div>';
  }
  // ===== 포토카드 전체보기 =====
  // 컬렉션마다 접었다 펴는 줄(<details>) · 위쪽 카드 크기(열 수) 조절 · "전체" 칸을 누르면 컬렉션 바로가기 버튼
  //   멤버마다 카드가 2장 이하인 도감(HOLLYS · 나랑드 · 도미노 …)은 멤버별 줄 대신 한 줄에 모은다 (카드 이름 앞 점 = 멤버 색).
  //   405빵처럼 멤버마다 여러 장이면 예전처럼 멤버별 줄. 브로마이드 같은 묶음(엔진 groups)은 그 아래 따로 한 줄씩
  var AC = { closed: load('sendungi:acClosed', {}), jump: false, cols: null };
  function acNarrow(){ return window.innerWidth <= 640; }
  function acMax(){ return acNarrow() ? 5 : 8; }                    // 휴대폰은 5열까지 (그보다 작으면 카드 이름 · 하트가 안 보임)
  function acCols(){
    if (AC.cols == null) { var s = +load('sendungi:acCols', 0); AC.cols = s >= 2 ? s : (acNarrow() ? 3 : 5); }
    return Math.max(2, Math.min(acMax(), AC.cols));
  }
  function acRows(c){
    var out = [], n = c.N, i, mi;
    if (!c.mem) {                                                   // 405빵: 멤버마다 vper 장, 그 뒤 스페셜
      (c.members || []).forEach(function(m, k){
        var ids = []; for (i = 0; i < c.vper; i++) ids.push(k * c.vper + i);
        out.push({ t: m.n, c: m.c, ids: ids });
      });
      var sp0 = []; for (i = c.mtotal; i < n; i++) sp0.push(i);
      if (sp0.length) out.push({ t: '스페셜', c: '#f6b93c', ids: sp0 });
      return out;
    }
    var grp = c.grp || [], byM = (c.members || []).map(function(){ return []; }), sp = [];
    for (i = 0; i < n; i++) {
      if (grp[i]) continue;
      mi = c.mem[i];
      if (mi != null && byM[mi]) byM[mi].push(i); else sp.push(i);
    }
    var per = byM.map(function(a){ return a.length; }).filter(Boolean);
    if (per.length && Math.max.apply(null, per) <= 2) {
      var all = [], dot = {};
      byM.forEach(function(a, k){ a.forEach(function(x){ all.push(x); dot[x] = c.members[k].c; }); });
      out.push({ ids: all, dot: dot });                             // 제목 없이 한 줄 (컬렉션 줄 제목 바로 아래)
    } else {
      byM.forEach(function(a, k){ if (a.length) out.push({ t: c.members[k].n, c: c.members[k].c, ids: a }); });
    }
    if (sp.length) out.push({ t: '스페셜', c: '#f6b93c', ids: sp });
    (c.groups || []).forEach(function(g){
      var ids = []; for (i = 0; i < n; i++) if (grp[i] === g.k) ids.push(i);
      if (ids.length) out.push({ t: g.n, c: g.c, ids: ids });
    });
    return out;
  }
  function renderAllCards(){
    var cols = pcCols();
    if (!cols.length) { elAllCards.innerHTML = sec('i-grid', ['포카 컬렉션 북', '포토카드 전체보기'], '') + empty('i-book', '포토카드 자료를 불러오는 중입니다'); return; }
    var nc = acCols();
    var h = sec('i-grid', ['포카 컬렉션 북', '포토카드 전체보기'],
      '지금까지 나온 포토카드를 컬렉션별로 모아서 봅니다. 컬렉션 제목을 누르면 접고 펼 수 있고, 가지고 있는 카드는 색이 살아나며, 하트를 누르면 위시리스트에 담깁니다.');
    h += '<div class="cmeta"><div class="mt ac-tog" role="button" tabindex="0" aria-expanded="' + AC.jump + '" aria-controls="ac-jump" title="컬렉션 바로가기">'
      + '<span class="mk">전체</span><b>' + pcTotal() + '종</b><small>컬렉션 ' + cols.length + '개<span class="ac-hint">바로가기<svg><use href="#i-chev"/></svg></span></small></div>'
      + '<div class="mt"><span class="mk">보유</span><b>' + pcOwned() + '/' + pcTotal() + '</b><small>모은 종류</small></div>'
      + '<div class="mt"><span class="mk">위시리스트</span><b>' + Object.keys(WISH).filter(function(k){ return k.indexOf('pc:') === 0; }).length + '장</b><small>담아 둔 카드</small></div></div>';
    h += '<div class="ac-jump" id="ac-jump"' + (AC.jump ? '' : ' hidden') + '>' + cols.map(function(c){
        var own = c.counts().filter(function(v){ return v > 0; }).length;
        return '<button type="button" data-jump="' + esc(c.id) + '">' + esc(c.title) + '<span class="cnt">' + own + '/' + c.N + '</span></button>';
      }).join('') + '</div>';
    h += '<div class="colbar ac-bar"><span class="cb-k">카드 크기</span><span class="cb-s">크게</span>'
      + '<input type="range" min="2" max="' + acMax() + '" step="1" value="' + nc + '" data-accols aria-label="한 줄에 보여 줄 카드 수">'
      + '<span class="cb-s">작게</span><b>' + nc + '열</b></div>';
    cols.forEach(function(c){
      var counts = c.counts();
      h += '<details class="wgrp ac-col" id="ac-' + esc(c.id) + '" data-col="' + esc(c.id) + '"' + (AC.closed[c.id] ? '' : ' open') + '>'
        + '<summary class="wgrp-h"><b>' + esc(c.title) + '</b><span class="cnt">' + counts.filter(function(v){ return v > 0; }).length + '/' + c.N + '</span>'
        + '<a class="w-go" href="?tab=' + c.id + '" data-tab="' + c.id + '">페이지 열기 →</a></summary>';
      acRows(c).forEach(function(r){
        if (r.t) h += '<div class="sec sec2"><div class="sec-t"><span class="dot" style="background:' + r.c + '"></span>' + esc(r.t)
          + '<span class="cnt">' + r.ids.filter(function(i){ return counts[i] > 0; }).length + '/' + r.ids.length + '</span></div></div>';
        h += '<div class="pcgrid">' + r.ids.map(function(i){ return cardTile(c, i, counts[i], 'pc:' + c.id + ':' + i, r.dot && r.dot[i]); }).join('') + '</div>';
      });
      h += '</details>';
    });
    elAllCards.innerHTML = h;
    elAllCards.style.setProperty('--accols', nc);
  }
  function acJump(on){
    AC.jump = on;
    var t = elAllCards.querySelector('.ac-tog'), j = elAllCards.querySelector('#ac-jump');
    if (t) t.setAttribute('aria-expanded', String(on));
    if (j) j.hidden = !on;
  }
  elAllCards.addEventListener('click', function(e){
    if (e.target.closest('.ac-tog')) { acJump(!AC.jump); return; }
    var j = e.target.closest('[data-jump]');
    if (j) {
      var d = document.getElementById('ac-' + j.getAttribute('data-jump'));
      if (d) {
        d.open = true;
        // 부드럽게 내려가되, 움직임 줄이기 설정이거나 부드러운 스크롤이 안 도는 환경(창이 뒤에 있을 때 등)이면 바로 이동
        var calm = window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)').matches, y0 = window.scrollY;
        d.scrollIntoView({ behavior: calm ? 'auto' : 'smooth', block: 'start' });
        if (!calm) setTimeout(function(){ if (window.scrollY === y0) d.scrollIntoView({ block: 'start' }); }, 450);
      }
    }
  });
  elAllCards.addEventListener('keydown', function(e){
    if ((e.key === 'Enter' || e.key === ' ') && e.target.closest('.ac-tog')) { e.preventDefault(); acJump(!AC.jump); }
  });
  elAllCards.addEventListener('input', function(e){
    var r = e.target.closest('[data-accols]'); if (!r) return;
    AC.cols = +r.value; save('sendungi:acCols', AC.cols);
    elAllCards.style.setProperty('--accols', AC.cols);
    var lab = r.parentNode.querySelector('b'); if (lab) lab.textContent = AC.cols + '열';
  });
  // 접고 편 상태는 이 브라우저에 기억 (다시 그려도 · 다음에 와도 그대로)
  elAllCards.addEventListener('toggle', function(e){
    var d = e.target; if (!d.classList || !d.classList.contains('ac-col')) return;
    var id = d.getAttribute('data-col');
    if (d.open) delete AC.closed[id]; else AC.closed[id] = 1;
    save('sendungi:acClosed', AC.closed);
  }, true);
  function wishItems(){
    var c = cu(), out = [];
    Object.keys(WISH).sort(function(a, b){ return WISH[a] - WISH[b]; }).forEach(function(key){
      if (key.indexOf('pc:') === 0) {
        var pp = key.split(':'), col = pcCol(pp[1]), i = +pp[2];
        if (col) out.push({ key: key, type: 'pc', name: (i + 1) + '. ' + col.names[i], from: col.title, img: col.src[i],
          pix: col.isPix(i), land: col.isLand(i), own: col.counts()[i] || 0, tab: col.id });
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
        h += '<details class="wgrp" open><summary class="wgrp-h"><b>' + esc(g.from) + '</b><span class="cnt">' + g.items.length + '</span>'
          + '<a class="w-go" href="?tab=' + g.tab + '" data-tab="' + g.tab + '">페이지 열기 →</a></summary>'
          + '<div class="pcgrid">' + g.items.map(function(x){
              return '<div class="pcard' + (x.own ? ' have' : '') + (x.land ? ' land' : '') + '">'
                + '<div class="pc-img">' + heart(x.key)
                + (x.img ? '<img src="' + esc(x.img) + '" alt=""' + (x.pix ? ' class="pix"' : '') + ' loading="lazy">'
                         : '<div class="gd-ph"><svg viewBox="0 0 24 24"><use href="#i-img"/></svg></div>')
                + (x.own > 1 ? '<span class="pc-n">×' + x.own + '</span>' : '') + '</div>'
                + '<div class="pc-t">' + esc(x.name) + '</div></div>';
            }).join('') + '</div></details>';
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
        + '<a class="go" href="?tab=' + tab + '" data-tab="' + tab + '">전체보기 →</a>';
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
  document.addEventListener('sgcolchange', function(){ renderSum(); syncColCards(); syncHearts(); });
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

  // 엔진으로 만든 컬렉션을 사이드바와 홈에 붙임
  function mountCollections(){
    (window.SGCOLS || []).forEach(function(c){
      if (document.querySelector('.sb [data-tab="' + c.id + '"]')) return;
      var yr = null;
      document.querySelectorAll('#grp-pc details.yr').forEach(function(d){
        if (d.querySelector('summary').textContent.indexOf(c.year) === 0) yr = d;
      });
      if (yr) {
        var soon = yr.querySelector('summary .bd');
        if (soon) soon.parentNode.removeChild(soon);
        var a = document.createElement('a');
        a.className = 'nv sub'; a.href = '?tab=' + c.id; a.setAttribute('data-tab', c.id); a.textContent = c.title;
        yr.insertBefore(a, yr.querySelector('.nv.sub.off'));                 // 준비 중(SOON) 항목보다 앞에
        if (!yr.open) yr.open = true;
      }
      var grid = document.getElementById('col-grid');
      if (grid) {
        var card = document.createElement('a');
        card.className = 'hc'; card.href = '?tab=' + c.id; card.setAttribute('data-tab', c.id); card.style.setProperty('--c', '#55a1e7');
        card.setAttribute('data-ym', c.ym || ''); card.setAttribute('data-lv', c.diff || 3);   // 홈 정렬(shell.js)용
        // 405빵 카드와 같은 구성: .meta(출시 달 · 난이도)는 shell.js 가 data-ym · data-lv 로 채우고, 보유 · 구매 수는 syncColCards
        card.innerHTML = '<div class="k">' + esc(c.year) + ' 포카</div><h2>' + esc(c.title) + '</h2>'
          + '<div class="meta"></div>'
          + '<p class="cdesc" title="' + esc(c.desc || '') + '">' + esc(c.desc || (c.N + '종 구성')) + '</p>'
          + '<div class="st2"></div>'
          + '<span class="go">도감 열기 →</span>';
        grid.insertBefore(card, grid.querySelector('.hc.soon'));                  // 준비 중 카드보다 앞에
      }
    });
    syncColCards();
  }
  // 엔진 도감 홈 카드의 보유 · 구매 수. 기록이 바뀌면(sgcolchange) 다시 쓴다 (예전엔 새로 고치기 전까지 처음 값 그대로였음)
  function syncColCards(){
    (window.SGCOLS || []).forEach(function(c){
      var b = document.querySelector('#col-grid a[data-tab="' + c.id + '"] .st2'); if (!b) return;
      var own = c.counts().filter(function(v){ return v > 0; }).length;
      b.innerHTML = '<span><b>' + own + '/' + c.N + '</b>보유</span>' + (c.buys ? '<span><b>' + c.buys() + '회</b>구매</span>' : '');
    });
  }
  mountCollections();
  renderGoods(); renderAllGoods(); renderAllCards(); renderWish();
  injectCardHearts(); syncHearts();

  window.SG = {
    pages: (function(){
      var m = { goods2026: elGoods, allcards: elAllCards, allgoods: elAllGoods, wish: elWish };
      (window.SGCOLS || []).forEach(function(c){ m[c.id] = c.el; });
      if (window.SGMINI) m.minigame = window.SGMINI.el;        // 뽑기 미니게임 (gacha.js)
      Object.keys(elNoBuild).forEach(function(k){ m[k] = elNoBuild[k]; });   // 만들지 않는 연도 안내 (pc2025 · pc2024 · goods2025 · goods2024)
      return m;
    })(),
    onShow: function(tab){
      if (tab === 'allcards') renderAllCards();
      else if (tab === 'wish') renderWish();
      else if (tab === 'allgoods') renderAllGoods();
      else if (tab === 'goods2026') renderGoods();
      else if (tab === 'home') renderSum();
      else if (tab === 'minigame') { if (window.SGMINI) window.SGMINI.onShow(); }
      else (window.SGCOLS || []).forEach(function(c){ if (c.id === tab) c.onShow(); });
      syncHearts();
    }
  };
})();
