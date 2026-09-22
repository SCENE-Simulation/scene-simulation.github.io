// ===== 포토카드 컬렉션 설정 =====
// 여기에 설정을 추가하면 도감 페이지가 만들어지고, 사이드바·홈·통합 보기·위시리스트에 자동으로 붙는다.
// 구매 방식(modes)에 random:true 인 뽑기형 방식이 있으면 포토카드 뽑기 시뮬레이터(gacha.js)의 뽑기 종류에도 자동으로 나온다.
// 설정 형식은 tools/collection.js 맨 위 설명 참고.
[
  // 예시:
  // {
  //   id: 'nrd2026', title: '나랑드 콜라보', year: '2026', ym: '2026-05', diff: 3,
  //   desc: '...',
  //   members: [{n:'원이',c:'#f286a8'},{n:'제나',c:'#fca2c4'}],
  //   cards: [{n:'원이 A', img:'img/nrd/1.jpg', m:0}, {n:'스페셜', img:'img/nrd/2.jpg'}],
  //   modes: [{k:'buy', label:'제품 구매', price:2000, random:true, hint:'랜덤 1장'},
  //           {k:'set', label:'확정 구매', price:9900, hint:'원하는 카드 지정'},
  //           {k:'trade', label:'교환', price:0},
  //           {k:'used', label:'중고 구매', var:true, price:15000}],
  //   pkg: [], news: []
  // }
  {
    id: 'hollys2026', title: 'HOLLYS 콜라보', year: '2026', diff: 3,
    desc: '커피 브랜드 할리스(HOLLYS)가 1998년 창사 이래 28년 만의 첫 브랜드 모델로 5인조 걸그룹 리센느(RESCENE)를 발탁하고 다양한 콜라보 프로모션을 진행하고 있습니다. 세트를 사면 포토카드 5종 중 1장이 랜덤으로 들어 있습니다.',
    parts: '멤버 5종',
    members: [{n:'원이',c:'#f286a8'},{n:'제나',c:'#fca2c4'},{n:'리브',c:'#76d4c8'},{n:'미나미',c:'#eec06a'},{n:'메이',c:'#9ec2f0'}],
    cards: [{n:'할리스 원이', img:'img/hollys2026/wonee.png', m:0},
            {n:'할리스 제나', img:'img/hollys2026/zena.png', m:1},
            {n:'할리스 반하트 리브', img:'img/hollys2026/liv.png', m:2},
            {n:'할리스 윙크 미나미', img:'img/hollys2026/minami.png', m:3},
            {n:'할리스 윙크 메이', img:'img/hollys2026/may.png', m:4}],
    modes: [{k:'buy', label:'세트 구매', price:13500, random:true, hint:'세트 1개 · 랜덤 1장'},
            {k:'trade', label:'교환', price:0},
            {k:'used', label:'중고 구매', var:true, price:15000}],
    // 세트 메뉴 (사진이 오면 src 를 채운다 — 그 전에는 자리표시자 + 제목)
    pkg: [{cap:'원이의 호감 가득 세트', sub:'호감 스무디 + 뉴욕 치즈 케이크 · 13,500원'},
          {cap:'제나의 언제나 제나 세트', sub:'모과배차 + 쿠앤크 쏘스윗박스 · 13,500원'},
          {cap:'미나미의 냐미 냐미 세트', sub:'흑임자 라이스 할리치노 + 모과배차 · 13,500원 · 유일한 음료 2잔 구성'},
          {cap:'메이의 어메이징 세트', sub:'바닐라 딜라이트 + 흑임자 초코 롤케이크 · 13,500원'},
          {cap:'리브의 아이 리브 유 세트', sub:'흑임자 버터크림 라떼 + 티라미수 쏘스윗박스 · 13,500원'}],
    news: []
  }
].forEach(function(cfg){ window.SGCollection(cfg); });
