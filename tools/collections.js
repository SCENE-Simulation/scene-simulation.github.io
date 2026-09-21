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
].forEach(function(cfg){ window.SGCollection(cfg); });
