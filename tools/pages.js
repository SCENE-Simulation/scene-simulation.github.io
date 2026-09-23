// 굿즈 컬렉션 · 통합 보기 · 위시리스트
(function(){
  var LS = { wish: 'sendungi:wish', goods: 'sendungi:goods' };
  function load(k, d){ try { return JSON.parse(localStorage.getItem(k)) || d; } catch(e){ return d; } }
  function save(k, v){ try { localStorage.setItem(k, JSON.stringify(v)); } catch(e){} }
  function won(n){ return (n || 0).toLocaleString('ko-KR'); }
  function esc(s){ return String(s).replace(/[&<>"']/g, function(c){ return { '&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;' }[c]; }); }

  // ===== 굿즈 자료 =====
  // 굿즈 컬렉션(페이지) 목록. 여기에 하나 넣으면 페이지 · 사이드바 메뉴(그 연도 줄 아래) · 홈 카드 · 굿즈 전체보기 · 위시리스트에 모두 반영된다.
  //   id     탭 이름(주소 ?tab=id). 한 번 정하면 바꾸지 않는다
  //   y      연도 — 사이드바 "2026 굿즈" 같은 연도 줄 아래에 붙는다
  //   ym     출시 연-월 'YYYY-MM' — 사이드바 메뉴 오른쪽 끝 "N월" 상자(shell.js). 꼭 채울 것
  //   title  메뉴 · 페이지 이름(짧게) / desc 페이지 설명 / card 홈 카드 설명(없으면 desc) / c 홈 카드 색
  //   items  상품 [{ id, name, price, parts(한 줄 설명), date(출시), img(이미지 주소) }] — 상품 id 는 보유 수량 · 위시리스트 저장 키라 바꾸지 않는다
  //   ratio  상품 그림 칸 비율 [가로, 세로] — 없으면 4:3. 사진 비율을 넣으면 잘리지 않는다(크림 티셔츠 셀카 399×501)
  //   ach    칭호 [{ at: 보유 종류 수, n: 칭호, d?: 한마디, r?: 등급 1~4(405빵 TIER: 1 브론즈 · 2 실버 · 3 골드 · 4 플래티넘), c?: 색 }]
  //          — 있으면 페이지에 칭호 창(도감 페이지와 같은 모양). 설명은 "N종 보유 · 한마디"(마지막 단계는 "N종 전부 보유").
  //          지금 보유한 종류 수로 매번 계산한다(따로 저장하지 않음)
  //   cheer  전 종류를 처음 다 모은 순간 화면 가운데에 크게 나타났다 사라지는 축하 문구 (cheerFx — 빛 번짐 · 메아리 · 색종이)
  //   news   관련 미디어 [{ title, src(언론사 · 채널), date, url, kind? }] — 있으면 페이지 위쪽에 "관련 미디어 보기" 토글(도감 페이지와 같은 모양).
  //          유튜브 주소면 썸네일이 붙고, 종류 칩은 kind(없으면 영상/기사). 공유 주소의 추적값(?si= 등)은 빼고 넣는다
  var GCOLS = [
    { id: 'goods2026', y: '2026', ym: '2026-09',   // 'Scent Archive (memories of RESCENE)' 2026.9.15~23 더현대 서울 5층 (텐아시아 2026.09.16)
      title: '더현대 팝업 스토어', c: '#ecd25b',
      desc: '더현대 팝업 스토어에서 나온 리센느 굿즈를 상품별로 모았습니다. 가지고 있는 굿즈는 보유 수량을 올려 두면 통합 현황에 반영됩니다.',
      card: '더현대 팝업 스토어에서 나온 리센느 굿즈를 상품별로 모았습니다. 가지고 있는 굿즈를 기록해 보세요.',
      items: [] },
    { id: 'kream2026', y: '2026', ym: '2026-07',   // KREAM 단독 2026.7.9 11:00 ~ 7.31 23:59, 32,000원 (패스트페이퍼 2026.07.08 · 금강일보 2026.07.11)
      title: '크림 티셔츠', c: '#99ce64',
      desc: '한정판 거래 플랫폼 KREAM에서 단독으로 판매한 리센느 × 김씨네과일 \'야호 티셔츠\' 5종입니다. 멤버들이 고향의 추억과 풍경을 직접 그린 손그림이 들어 있습니다. '
        + '2026년 7월 9일부터 31일까지 판매했고, 구매자에게 멤버 친필 사인 티셔츠를 랜덤으로 주는 이벤트도 있었습니다.',
      card: 'KREAM에서 단독 판매한 리센느 × 김씨네과일 \'야호 티셔츠\' 5종. 멤버들이 직접 그린 고향 손그림 티셔츠를 모아 보세요.',
      // 사용자가 준 구글 공유 링크(share.google/UXdpCcoWooLJQRlcF, 구글 이미지 결과)가 가리키는 KREAM 공식 쇼츠. 제목의 해시태그는 뺌, 날짜는 한국 시간
      news: [{ title: '리센느 야-호★ 김씨네과일 야-호★', src: 'KREAM · YouTube', date: '2026.07.16', url: 'https://www.youtube.com/shorts/3SMQxQdPVJk' }],
      // 사진: 사용자 제공 멤버 셀카(각자 고향 티셔츠, 399×501). 티셔츠 글자로 짝을 확인함
      ratio: [399, 501],
      // 칭호: 사용자 요청 "5장 구매에 따른 컬렉션을 1~5장 별로" → 등급(9/23 사용자 지정): 1~2종 실버(r2) · 3~4종 골드(r3) · 5종 완성 플래티넘(r4).
      // '야호'(산에서 외치는 소리 · 메아리)와 멤버 고향 순회를 엮음. 4종 · 5종 이름은 사용자 지정
      ach: [
        { at: 1, n: '첫 야호',         d: '산 정상에서 외치는 첫 한마디', r: 2, c: '#c3ccd8' },
        { at: 2, n: '야호 메아리',     d: '한 번 외치면 두 번 돌아온다', r: 2, c: '#c3ccd8' },
        { at: 3, n: '야호 중독자',    d: '반은 넘게 돌았다', r: 3, c: '#ecd25b' },
        { at: 4, n: '거제야-허',   d: '이제 한 곳만 남았다', r: 3, c: '#ecd25b' },
        { at: 5, n: '야호야호야호야호야호', d: '거제 · 경주 · 수원 · 치바 · 고양 완주', r: 4, c: '#e2fff3' }
      ],
      cheer: '야-호!',
      items: [
        { id: 'kream2026-geoje',    name: '거제 야호', price: 32000, date: '2026.07.09', parts: '원이의 고향 거제 · 섬과 모래성 손그림', img: 'img/kream2026/geoje.jpg' },
        { id: 'kream2026-gyeongju', name: '경주 야호', price: 32000, date: '2026.07.09', parts: '제나의 고향 경주 · 첨성대와 경주빵 손그림', img: 'img/kream2026/gyeongju.jpg' },
        { id: 'kream2026-suwon',    name: '수원 야호', price: 32000, date: '2026.07.09', parts: '리브의 고향 수원 · 수원 치킨 손그림', img: 'img/kream2026/suwon.jpg' },
        { id: 'kream2026-chiba',    name: '치바 야호', price: 32000, date: '2026.07.09', parts: '미나미의 고향 치바 · 비행기와 나리타 공항 손그림', img: 'img/kream2026/chiba.jpg' },
        { id: 'kream2026-goyang',   name: '고양 야호', price: 32000, date: '2026.07.09', parts: '메이의 고향 고양 · 고양시 마스코트와 물고기 손그림', img: 'img/kream2026/goyang.jpg' }
      ] }
  ];
  function gcol(id){ return GCOLS.filter(function(c){ return c.id === id; })[0]; }
  window.SGGOODS = GCOLS;   // shell.js 가 사이드바 "N월" 상자(ym)에 쓴다

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
    return GCOLS.reduce(function(a, c){ return a.concat(c.items.map(function(g){ return { c: c, g: g }; })); }, []);
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
  var elGd = {};                                               // 굿즈 컬렉션 페이지 (GCOLS 마다 하나, id v-<id>)
  GCOLS.forEach(function(c){ elGd[c.id] = page('v-' + c.id); });
  var elAllCards = page('v-allcards'), elAllGoods = page('v-allgoods'), elWish = page('v-wish');

  function sec(icon, crumbs, desc, right){
    var t = crumbs.map(function(c, i){
      return (i ? '<span class="cr">›</span>' : '') + (i === crumbs.length - 1 ? '<span class="lt">' + esc(c) + '</span>' : esc(c));
    }).join('');
    return '<div class="sec"><div class="sec-t"><svg viewBox="0 0 24 24"><use href="#' + icon + '"/></svg>' + t + '</div>' + (right || '') + '</div>'
      + (desc ? '<p class="sec-d">' + desc + '</p>' : '');
  }
  function empty(icon, text, sub){
    return '<div class="pk-ph tall"><svg viewBox="0 0 24 24"><use href="#' + icon + '"/></svg><span>' + text + '</span>'
      + (sub ? '<small>' + sub + '</small>' : '') + '<span class="chip">SOON</span></div>';
  }

  // ===== 만들지 않는 연도 안내 페이지 (사이드바 2025·2024 포카 · 굿즈) =====
  // 2024·2025년 포토카드 · 굿즈 컬렉션 북은 만들지 않는다. 사이드바 연도 줄(아래 메뉴 없음)을 누르면 이 페이지로 온다.
  // 안내 문구는 여기만 고치면 된다 — 제목은 연도 · 종류에 맞춰 만들고, 설명은 네 페이지 공통(NB_DESC, 사용자 문구 9/23).
  // 페이지마다 t(제목) · d(설명, HTML 가능)를 넣으면 기본 문구 대신 쓴다
  var NB_DESC = '왜냐면 내가 26년 6월부터 덕질을 시작했기 때문입니다.';
  // 상자 맨 위 그림(네 페이지 공통, 사용자 제공 9/23). 페이지마다 img 를 넣으면 그걸 쓴다
  var NB_IMG = { src: 'img/nobuild/pepe.webp', w: 623, h: 639, alt: '리센느 머리띠를 두르고 조끼에 빵과 피자를 가득 꽂은 개구리 그림' };
  var NOBUILD = {
    pc2025:    { pc: true,  y: '2025' },
    pc2024:    { pc: true,  y: '2024' },
    goods2025: { pc: false, y: '2025' },
    goods2024: { pc: false, y: '2024' }
  };
  function noBuild(k){
    var d = NOBUILD[k], what = d.pc ? '포토카드' : '굿즈', icon = d.pc ? 'i-book' : 'i-gift';
    var t = d.t || d.y + '년 ' + what + ' 컬렉션 북은 만들지 않았습니다.';
    var desc = d.d || NB_DESC, im = d.img || NB_IMG;
    var go = d.pc ? ['allcards', '포토카드 전체보기 →'] : ['allgoods', '굿즈 전체보기 →'];
    return sec(icon, [d.pc ? '포카 컬렉션 북' : '굿즈 컬렉션 북', d.y + (d.pc ? ' 포카' : ' 굿즈')])
      + '<div class="pk-ph tall nbx">'
      + (im ? '<img class="nbx-img" src="' + esc(im.src) + '" width="' + im.w + '" height="' + im.h + '" alt="' + esc(im.alt || '') + '" loading="lazy">'
            : '<svg viewBox="0 0 24 24"><use href="#' + icon + '"/></svg>')
      + '<b>' + esc(t) + '</b><p>' + desc + '</p>'
      + '<div class="nbx-go"><a href="?tab=' + go[0] + '" data-tab="' + go[0] + '">' + go[1] + '</a>'
      + '<a href="?tab=home" data-tab="home">홈으로</a></div></div>';
  }
  var elNoBuild = {};
  Object.keys(NOBUILD).forEach(function(k){ elNoBuild[k] = page('v-' + k); elNoBuild[k].innerHTML = noBuild(k); });

  // ===== 굿즈 카드 =====
  function goodsCard(g, c){
    var n = GOWN[g.id] || 0, r = c && c.ratio;                 // r: 컬렉션 그림 칸 비율 (없으면 CSS 기본 4:3)
    return '<article class="gd' + (n ? ' have' : '') + '" data-g="' + esc(g.id) + '">'
      + '<div class="gd-img"' + (r ? ' style="aspect-ratio:' + r[0] + '/' + r[1] + '"' : '') + '>' + heart('gd:' + g.id)
      + (g.img ? '<img src="' + esc(g.img) + '" alt="' + esc(g.name) + '" loading="lazy">' : '<div class="gd-ph"><svg viewBox="0 0 24 24"><use href="#i-img"/></svg></div>')
      + '</div>'
      + '<div class="gd-b"><h4>' + esc(g.name) + '</h4>'
      + '<div class="gd-m">' + (g.price != null ? '<span class="pr">' + won(g.price) + '원</span>' : '') + (g.date ? '<span>' + esc(g.date) + ' 출시</span>' : '') + '</div>'
      + (g.parts ? '<p>' + esc(g.parts) + '</p>' : '')
      + '<div class="gd-c"><span class="gk">보유</span><button type="button" data-gd="-1"' + (n ? '' : ' disabled') + '>−</button>'
      + '<b>' + n + '</b><button type="button" class="p" data-gd="1">+</button></div>'
      + '</div></article>';
  }
  function goodsGrid(list, c){
    var port = c && c.ratio && c.ratio[0] < c.ratio[1];          // 세로 사진 컬렉션은 칸을 좁게(PC 3~4칸) — theme.css .gdgrid.gd-port
    return list.length ? '<div class="gdgrid' + (port ? ' gd-port' : '') + '">' + list.map(function(g){ return goodsCard(g, c); }).join('') + '</div>'
      : empty('i-gift', '등록된 굿즈가 없습니다', '굿즈 정보를 준비하고 있습니다');
  }
  function goodsStats(list){
    var own = list.filter(function(g){ return GOWN[g.id] > 0; }).length;
    var spent = list.reduce(function(s, g){ return s + (GOWN[g.id] || 0) * (g.price || 0); }, 0);
    return '<div class="cmeta"><div class="mt"><span class="mk">등록 상품</span><b>' + list.length + '종</b><small>이 컬렉션에 나온 굿즈</small></div>'
      + '<div class="mt"><span class="mk">보유</span><b>' + own + '/' + list.length + '</b><small>가지고 있는 종류</small></div>'
      + '<div class="mt"><span class="mk">쓴 금액</span><b>' + won(spent) + '원</b><small>보유 수량 × 가격</small></div></div>';
  }

  // ===== 각 페이지 =====
  // 굿즈 페이지 위쪽 토글 "관련 미디어 보기" — 컬렉션에 news 가 있을 때만. 도감 페이지(collection.js toggles)와 같은 클래스라 모양이 같다.
  // 펼침 상태는 GXOPEN 에 두어 보유 수량을 바꿔 페이지를 다시 그려도 유지
  var GXOPEN = {};
  function ytId(u){ var m = /(?:youtu\.be\/|[?&]v=|\/shorts\/)([\w-]{11})/.exec(u || ''); return m ? m[1] : null; }
  function goodsNews(c){
    if (!c.news) return '';
    var news = c.news, open = !!GXOPEN[c.id];
    return '<div class="xt"><div class="xt-bar"><button type="button" class="xt-b" data-gx="' + esc(c.id) + '" aria-expanded="' + open + '">'
      + '<svg class="xi"><use href="#i-news"/></svg>관련 미디어 보기'
      + (news.length ? '<span class="xt-c">' + news.length + '</span>' : '<span class="xt-c soon">SOON</span>') + '<svg class="xv"><use href="#i-chev"/></svg></button></div>'
      + '<div class="xt-p"' + (open ? '' : ' hidden') + '>'
      + (news.length ? '<div class="nws">' + news.map(function(a){
            var yt = ytId(a.url), kind = a.kind || (yt ? '영상' : '기사');
            return '<a class="nw' + (yt ? ' vid' : '') + '" href="' + esc(a.url) + '" target="_blank" rel="noopener noreferrer">'
              + (yt ? '<span class="nw-th"><img src="https://i.ytimg.com/vi/' + yt + '/mqdefault.jpg" alt="" loading="lazy"><i><svg viewBox="0 0 24 24" aria-hidden="true"><path d="M8 5.5v13l10.5-6.5z" fill="currentColor"/></svg></i></span>' : '')
              + '<span class="nw-x"><span class="nw-t">' + esc(a.title) + '</span>'
              + '<span class="nw-m"><i class="nw-k' + (yt ? ' v' : '') + '">' + esc(kind) + '</i>' + esc([a.src, a.date].filter(Boolean).join(' · ')) + '</span></span><svg><use href="#i-ext"/></svg></a>';
          }).join('') + '</div>'
         : '<div class="pk"><div class="pk-ph"><svg viewBox="0 0 24 24"><use href="#i-news"/></svg><span>관련 미디어 준비 중</span><span class="chip">SOON</span></div></div>')
      + '</div></div>';
  }
  // 굿즈 칭호 창 (GCOLS 의 ach) — 도감 페이지 칭호 창(collection.js achBox · badge)과 같은 클래스라 모양이 같다.
  // 받은 칭호 = 지금 보유한 종류 수가 at 이상인 것. "전체 보기" 펼침은 GACHALL 에 두어 다시 그려도 유지
  var GACHALL = {};
  function gOwnKinds(c){ return c.items.filter(function(g){ return GOWN[g.id] > 0; }).length; }
  function gAchDefs(c){
    var N = c.items.length;
    return (c.ach || []).map(function(a, i){
      return { at: a.at, n: a.n, r: a.r || Math.min(4, i + 1), c: a.c || '#55a1e7',
        d: a.at + '종' + (a.at >= N ? ' 전부' : '') + ' 보유' + (a.d ? ' · ' + a.d : '') };
    });
  }
  function gBadge(a, lock){
    return '<span class="bdg' + (lock ? ' lock' : '') + '" data-r="' + a.r + '" style="--bc:' + a.c + '" title="' + esc(a.n) + ' · ' + esc(a.d) + '">'
      + '<span class="em"><i>' + (lock ? '✧' : '✦') + '</i></span><span class="bt"><b>' + esc(a.n) + '</b><small>' + esc(a.d) + '</small></span></span>';
  }
  function goodsAch(c){
    if (!c.ach) return '';
    var defs = gAchDefs(c), own = gOwnKinds(c), got = defs.filter(function(a){ return own >= a.at; });
    return '<div class="cach gd-ach"><div class="cach-h"><span class="cach-t">✦ 칭호</span><span class="cach-n">' + got.length + ' / ' + defs.length + '</span>'
      + '<button type="button" class="cach-btn" data-gach="' + esc(c.id) + '" aria-expanded="' + !!GACHALL[c.id] + '">전체 보기</button></div>'
      + '<div class="badges">' + (got.length ? got.map(function(a){ return gBadge(a, false); }).join('')
          : '<span class="bdg-empty">아직 얻은 칭호가 없습니다 · “전체 보기”에서 조건을 확인해 보세요</span>') + '</div>'
      + '<div class="badges all"' + (GACHALL[c.id] ? '' : ' hidden') + '>' + defs.map(function(a){ return gBadge(a, own < a.at); }).join('') + '</div></div>';
  }
  // 컴플리트 축하 연출 — 화면 가운데에 문구(cheer)가 크게 튀어나왔다 사라진다.
  // 빛 번짐 + 금색 글자 + 양옆으로 번지는 메아리 두 개("야호" 컨셉) + 멤버 색 색종이 26장. 약 2.6초 뒤 스스로 사라짐.
  // 움직임 줄이기 설정이면 색종이 · 메아리 없이 은은하게 떴다 사라지기만 한다 (theme.css .chr)
  function cheerFx(text){
    var old = document.querySelector('.chr'); if (old) old.parentNode.removeChild(old);
    var box = document.createElement('div'); box.className = 'chr'; box.setAttribute('aria-hidden', 'true');
    var h = '<i class="chr-flash"></i><span class="chr-e e1">' + esc(text) + '</span><span class="chr-e e2">' + esc(text) + '</span>'
      + '<b class="chr-t">' + esc(text) + '</b>';
    var COLS = ['#f286a8', '#fca2c4', '#76d4c8', '#eec06a', '#9ec2f0', '#ffd95e'];   // 멤버 5색 + 금색
    for (var i = 0; i < 26; i++){
      var a = Math.random() * Math.PI * 2, d = 130 + Math.random() * 190;            // 흩날리는 방향 · 거리
      h += '<i class="chr-p" style="--pc:' + COLS[i % COLS.length] + ';--px:' + Math.round(Math.cos(a) * d) + 'px;--py:'
        + Math.round(Math.sin(a) * d - 60) + 'px;--pr:' + Math.round(Math.random() * 720 - 360) + 'deg;--pd:' + (Math.random() * 0.35).toFixed(2) + 's;--ps:' + (0.6 + Math.random() * 0.8).toFixed(2) + '"></i>';
    }
    box.innerHTML = h;
    document.body.appendChild(box);
    setTimeout(function(){ if (box.parentNode) box.parentNode.removeChild(box); }, 2700);
  }
  // ===== 공유 카드 (tools/share.js SGShare.collection, 형식은 그 파일 drawCollection 위 주석) =====
  // 제목 줄 오른쪽 [공유하기] — 상품이 있는 컬렉션만. 지금 보유 수량 기준. 상품이 10종 이하면 상품마다 한 칸(이름 · 가짐 여부), 많으면 한 묶음
  var SHRI = '<svg viewBox="0 0 24 24" aria-hidden="true" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="18" cy="5" r="3"/><circle cx="6" cy="12" r="3"/><circle cx="18" cy="19" r="3"/><path d="M8.6 13.5l6.8 4M15.4 6.5l-6.8 4"/></svg>';
  function gShareBtn(c){
    return c.items.length ? '<button type="button" class="gs shr-btn" data-gshr="' + esc(c.id) + '" title="지금 보유 기록으로 이미지 카드 만들기">' + SHRI + '공유하기</button>' : '';
  }
  function gShareCard(c){
    var r = c.ratio ? c.ratio[0] / c.ratio[1] : 4 / 3, p = (c.ym || '').split('-'), N = c.items.length, own = gOwnKinds(c);
    function cd(g){ return { src: g.img || '', n: GOWN[g.id] || 0, r: r }; }
    var rows = N <= 10 ? [c.items.map(function(g){ return { name: g.name, color: c.c, cols: 1, cards: [cd(g)] }; })]
      : [[{ name: c.title, color: c.c, cols: 8, cards: c.items.map(cd) }]];
    var cnt = c.items.reduce(function(a, g){ return a + (GOWN[g.id] || 0); }, 0);
    var spent = c.items.reduce(function(a, g){ return a + (GOWN[g.id] || 0) * (g.price || 0); }, 0);
    var got = c.ach ? gAchDefs(c).filter(function(a){ return own >= a.at; }).sort(function(a, b){ return b.r - a.r; }) : null;
    return { kind: '굿즈 컬렉션 북', title: c.title, sub: (p[1] ? p[0] + '년 ' + (+p[1]) + '월 출시 · ' : '') + '굿즈 ' + N + '종', at: Date.now(), file: 'sendungi-' + c.id, hmax: 280,
      stats: [{ k: '보유 종류', v: own + ' / ' + N, bar: N ? own / N : 0 }, { k: '보유 수량', v: cnt + '개', s: '같은 상품 여러 개 포함' },
        { k: '쓴 금액', v: won(spent) + '원', s: '보유 수량 × 가격' }],
      rows: rows, ach: got ? { got: got.map(function(a){ return { n: a.n, c: a.c }; }), total: gAchDefs(c).length } : null };
  }
  function renderGoodsPage(c){
    elGd[c.id].innerHTML = sec('i-gift', ['굿즈 컬렉션 북', c.y + ' 굿즈', c.title], esc(c.desc || ''), gShareBtn(c))
      + goodsStats(c.items) + goodsNews(c) + goodsAch(c) + '<p class="gnote2">기록은 이 브라우저에 바로 저장됩니다.</p>' + goodsGrid(c.items, c);
  }
  function renderGoods(){ GCOLS.forEach(renderGoodsPage); }
  function renderAllGoods(){
    var h = sec('i-gift', ['굿즈 컬렉션 북', '굿즈 통합 보기'], '지금까지 나온 굿즈를 컬렉션별로 모아서 봅니다.');
    GCOLS.forEach(function(c){
      h += '<div class="sec sec2"><div class="sec-t">' + c.y + '년 · ' + esc(c.title) + '<span class="cnt">' + c.items.length + '종</span></div></div>' + goodsGrid(c.items, c);
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
        var id = key.slice(3), f = null;
        goodsAll().forEach(function(x){ if (x.g.id === id) f = x; });
        if (f) out.push({ key: key, type: 'gd', name: f.g.name, from: f.c.y + ' · ' + f.c.title, img: f.g.img, price: f.g.price, own: GOWN[id] || 0, tab: f.c.id });
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
    gd.innerHTML = box('i-gift', '굿즈 통합', go, gl, gl ? ('상품 ' + gl + '종 · 컬렉션 ' + GCOLS.length + '개') : '등록된 굿즈가 아직 없습니다', 'allgoods', '#47d19a');
    syncHearts();
  }

  // ===== 이벤트 =====
  document.addEventListener('click', function(e){
    var w = e.target.closest('[data-wish]');
    if (w) { e.preventDefault(); toggleWish(w.getAttribute('data-wish')); return; }
    var gx = e.target.closest('[data-gx]');                    // 굿즈 페이지 "관련 미디어 보기" 펼치기 · 접기
    if (gx) {
      var gid = gx.getAttribute('data-gx'), op = !GXOPEN[gid];
      GXOPEN[gid] = op;
      gx.setAttribute('aria-expanded', String(op));
      gx.closest('.xt').querySelector('.xt-p').hidden = !op;
      return;
    }
    var gsh = e.target.closest('[data-gshr]');                 // 굿즈 [공유하기] → 공유 카드
    if (gsh) { var sc = gcol(gsh.getAttribute('data-gshr')); if (sc && window.SGShare) SGShare.collection(gShareCard(sc)); return; }
    var ga = e.target.closest('[data-gach]');                  // 굿즈 칭호 "전체 보기" 펼치기 · 접기
    if (ga) {
      var aid = ga.getAttribute('data-gach');
      GACHALL[aid] = !GACHALL[aid];
      ga.setAttribute('aria-expanded', String(GACHALL[aid]));
      ga.closest('.cach').querySelector('.badges.all').hidden = !GACHALL[aid];
      return;
    }
    var g = e.target.closest('[data-gd]');
    if (g) {
      var card = g.closest('[data-g]'), id = card.getAttribute('data-g'), d = +g.getAttribute('data-gd');
      var gc = (goodsAll().filter(function(x){ return x.g.id === id; })[0] || {}).c, before = gc ? gOwnKinds(gc) : 0;
      GOWN[id] = Math.max(0, Math.min(99, (GOWN[id] || 0) + d));
      save(LS.goods, GOWN);
      // 보유 종류가 늘어 칭호 단계를 넘으면 알림 (도감 페이지와 같은 toastSG), 전 종류를 처음 다 모으면 축하 연출
      if (gc && gc.ach && window.toastSG) {
        var after = gOwnKinds(gc);
        gAchDefs(gc).forEach(function(a){ if (before < a.at && after >= a.at) window.toastSG('칭호 획득 — ' + esc(a.n), esc(a.d)); });
        if (gc.cheer && before < gc.items.length && after >= gc.items.length) cheerFx(gc.cheer);
      }
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
  // 굿즈 컬렉션(GCOLS)을 사이드바(그 연도 줄 아래)와 홈 굿즈 칸에 붙임 — 목록 순서대로, 홈은 준비 중(SOON) 카드보다 앞에
  function mountGoods(){
    var grid = document.getElementById('gd-grid');
    GCOLS.forEach(function(c){
      var yr = null;
      document.querySelectorAll('#grp-gd details.yr').forEach(function(d){
        if (d.querySelector('summary').textContent.indexOf(c.y) === 0) yr = d;
      });
      if (yr && !yr.querySelector('[data-tab="' + c.id + '"]')) {
        var a = document.createElement('a');
        a.className = 'nv sub'; a.href = '?tab=' + c.id; a.setAttribute('data-tab', c.id); a.textContent = c.title;
        yr.appendChild(a);
      }
      if (grid) {
        var card = document.createElement('a');
        card.className = 'hc'; card.href = '?tab=' + c.id; card.setAttribute('data-tab', c.id); card.style.setProperty('--c', c.c || '#ecd25b');
        card.innerHTML = '<div class="k">' + esc(c.y) + ' 굿즈</div><h2>' + esc(c.title) + '</h2>'
          + '<p>' + esc(c.card || c.desc || '') + '</p><span class="go">굿즈 보기 →</span>';
        grid.insertBefore(card, grid.querySelector('.hc.soon'));
      }
    });
  }
  mountCollections();
  mountGoods();
  renderGoods(); renderAllGoods(); renderAllCards(); renderWish();
  injectCardHearts(); syncHearts();

  window.SG = {
    pages: (function(){
      var m = { allcards: elAllCards, allgoods: elAllGoods, wish: elWish };
      GCOLS.forEach(function(c){ m[c.id] = elGd[c.id]; });      // 굿즈 컬렉션 (goods2026 · kream2026 …)
      (window.SGCOLS || []).forEach(function(c){ m[c.id] = c.el; });
      if (window.SGMINI) m.minigame = window.SGMINI.el;        // 뽑기 미니게임 (gacha.js)
      Object.keys(elNoBuild).forEach(function(k){ m[k] = elNoBuild[k]; });   // 만들지 않는 연도 안내 (pc2025 · pc2024 · goods2025 · goods2024)
      return m;
    })(),
    onShow: function(tab){
      if (tab === 'allcards') renderAllCards();
      else if (tab === 'wish') renderWish();
      else if (tab === 'allgoods') renderAllGoods();
      else if (gcol(tab)) renderGoodsPage(gcol(tab));
      else if (tab === 'home') renderSum();
      else if (tab === 'minigame') { if (window.SGMINI) window.SGMINI.onShow(); }
      else (window.SGCOLS || []).forEach(function(c){ if (c.id === tab) c.onShow(); });
      syncHearts();
    }
  };
})();
