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
    id: 'hollys2026', title: 'HOLLYS 콜라보', year: '2026', ym: '2026-08', diff: 3,          // 공식 이벤트 기간 2026.08.26 ~ 10.31
    desc: '커피 브랜드 할리스(HOLLYS)가 1998년 창사 이래 28년 만의 첫 브랜드 모델로 5인조 걸그룹 리센느(RESCENE)를 발탁하고 다양한 콜라보 프로모션을 진행하고 있습니다. 세트를 사면 포토카드 5종 중 1장이 랜덤으로 들어 있습니다.',
    parts: '멤버 5종',
    members: [{n:'원이',c:'#f286a8'},{n:'제나',c:'#fca2c4'},{n:'리브',c:'#76d4c8'},{n:'미나미',c:'#eec06a'},{n:'메이',c:'#9ec2f0'}],
    cards: [{n:'할리스 원이', img:'img/hollys2026/wonee.png', m:0},
            {n:'할리스 제나', img:'img/hollys2026/zena.png', m:1},
            {n:'할리스 반하트 리브', img:'img/hollys2026/liv.png', m:2},
            {n:'할리스 윙크 미나미', img:'img/hollys2026/minami.png', m:3},
            {n:'할리스 윙크 메이', img:'img/hollys2026/may.png', m:4}],
    // 칭호(ach): 세트 구매는 달달한 음료·디저트 세트라 살수록 당을 걱정하고, 교환·중고는 이번 콜라보 컨셉인 전래동화에서 따왔다
    modes: [{k:'buy', label:'세트 구매', price:13500, random:true, hint:'세트 1개 · 랜덤 1장',
             ach: [{at:1,  n:'달콤한 첫 모금', d:'달달한 게 당기는 날이죠'},
                   {at:3,  n:'당 충전 완료',   d:'오늘 당 충전은 이걸로 충분해요'},
                   {at:5,  n:'슈가 러시',      d:'세트 5개째… 당 괜찮으세요?'},
                   {at:10, n:'할리스 단골',    d:'진지하게, 당 괜찮으세요?'},
                   {at:20, n:'혈당 스파이크',  d:'포카보다 물 한 잔이 먼저예요'}]},
            {k:'trade', label:'교환', price:0,
             ach: [{at:1,  n:'떡 하나 주면 안 잡아먹지', d:'떡 하나 주고 카드 하나 받기'},     // 해님 달님
                   {at:10, n:'이 카드가 네 카드냐',       d:'산신령도 헷갈릴 교환 솜씨'}]},    // 금도끼 은도끼
            {k:'used', label:'중고 구매', var:true, price:15000,
             ach: [{at:1,  n:'헌 집 줄게 새 집 다오',     d:'누군가의 헌 카드가 나의 새 카드'},  // 두꺼비 노래
                   {at:10, n:'밑 빠진 독에 물 붓기',      d:'두꺼비가 막아 줄 때까지'}]}],     // 콩쥐팥쥐
    // 세트 메뉴: 할리스 세트 안내 이미지 한 장(850×1062)에서 세트마다 멤버 태그 + 음료·디저트 부분만 잘라 보여 준다.
    //   crop 은 각 카드 위쪽 194px(카드 가장자리에서 6px 안쪽) — 이미지 속 세트 이름 글자는 빼고, 제목은 아래 cap·sub 로
    pkg: [{src:'img/hollys2026/sets.webp', size:[850,1062], crop:[75,76,333,194], cap:'원이의 호감 가득 세트', sub:'호감 스무디 + 뉴욕 치즈 케이크 · 13,500원'},
          {src:'img/hollys2026/sets.webp', size:[850,1062], crop:[75,389,333,194], cap:'제나의 언제나 제나 세트', sub:'모과배차 + 쿠앤크 쏘스윗박스 · 13,500원'},
          {src:'img/hollys2026/sets.webp', size:[850,1062], crop:[449,709,333,194], cap:'미나미의 냐미 냐미 세트', sub:'흑임자 라이스 할리치노 + 모과배차 · 13,500원 · 유일한 음료 2잔 구성'},
          {src:'img/hollys2026/sets.webp', size:[850,1062], crop:[449,389,333,194], cap:'메이의 어메이징 세트', sub:'바닐라 딜라이트 + 흑임자 초코 롤케이크 · 13,500원'},
          {src:'img/hollys2026/sets.webp', size:[850,1062], crop:[75,709,333,194], cap:'리브의 아이 리브 유 세트', sub:'흑임자 버터크림 라떼 + 티라미수 쏘스윗박스 · 13,500원'}],
    // 관련 미디어: 유튜브 주소는 공유 추적값(?si=)을 뺐다
    news: [{title:'리센느 세트 구매 시, 포토카드 랜덤 증정', src:'할리스 공식', date:'2026.08.26 ~ 10.31', url:'https://m.hollys.co.kr/news/eventView.do?idx=555', kind:'이벤트'},
           {title:"\"28년 만에 첫 모델\"…할리스가 '리센느' 발탁한 진짜 이유", src:'한국경제', date:'2026.08.28', url:'https://www.hankyung.com/article/202608289743g'},
           {title:'원이🌸 숲속에서 만난 호랑이의 정체는? | HOLLYS × RESCENE', src:'할리스 · YouTube', date:'2026.08.26', url:'https://youtu.be/0_1dV02TA3Y'},
           {title:'임자를 찾아 헤매는 리브🌳 과연 진짜 임자를 찾았을까? | HOLLYS × RESCENE', src:'할리스 · YouTube', date:'2026.08.26', url:'https://youtu.be/-Y8mgIOHOVo'},
           {title:'용궁에 간 토끼 메이🐰🌊 용궁공주 제나를 만나다! | HOLLYS × RESCENE', src:'할리스 · YouTube', date:'2026.08.26', url:'https://youtu.be/Ku9gpeky_UU'}]
  },
  {
    // 한정판 패키지는 9월 출시 예정(뉴시스 2026.08.27). 가격은 아직 모름 → price 0 = "가격 미정", 정해지면 buy.price 만 채운다
    id: 'nrd2026', title: '나랑드 콜라보', year: '2026', ym: '2026-09', diff: 3,
    desc: '동아오츠카의 제로 칼로리 사이다 브랜드 나랑드사이다는 2026년 7월 새로운 광고 모델로 신인 걸그룹 리센느(RESCENE)를 발탁했습니다. 콜라보 제품을 별도 2,000세트 한정으로 출시했으며, 브로마이드와 함께 포토카드 5종 중 1장이 랜덤으로 들어 있습니다.',
    parts: '멤버 5종',
    members: [{n:'원이',c:'#f286a8'},{n:'제나',c:'#fca2c4'},{n:'리브',c:'#76d4c8'},{n:'미나미',c:'#eec06a'},{n:'메이',c:'#9ec2f0'}],
    // 카드 이미지: 리브 사진은 가로로 와서 90도 돌려 세로로 저장함
    cards: [{n:'나랑드 원이', img:'img/nrd2026/wonee.png', m:0},
            {n:'나랑드 제나', img:'img/nrd2026/zena.png', m:1},
            {n:'나랑드 리브', img:'img/nrd2026/liv.png', m:2},
            {n:'나랑드 미나미', img:'img/nrd2026/minami.png', m:3},
            {n:'나랑드 메이', img:'img/nrd2026/may.png', m:4}],
    modes: [{k:'buy', label:'한정판 패키지 구매', price:0, random:true, hint:'브로마이드 + 랜덤 1장 · 2,000세트 한정'},
            {k:'trade', label:'교환', price:0},
            {k:'used', label:'중고 구매', var:true, price:15000}],
    // 패키징: 한 줄에 같은 높이로. 정규 모델 포스터와 유리병은 같은 크기(유리병 정사각 사진을 포스터 비율 틀에 맞춰 양옆을 자름),
    //   브로마이드 사진만 원래 가로 비율
    pkgRow: true,
    pkg: [{src:'img/nrd2026/model.webp', size:[1200,1689], cap:'나랑드 리센느 정규 모델'},
          {src:'img/nrd2026/bromide.webp', size:[1118,838], cap:'나랑드 리센느 브로마이드'},
          {src:'img/nrd2026/bottle.png', ratio:[1200,1689], cap:'나랑드 리센느 콜라보 유리병', sub:'유리병 · 코팅이 아닌 비닐 패키징 · 1세트 6병입 · 2,000세트 한정'}],
    // 관련 미디어: 유튜브 주소는 공유 추적값(?si=)을 뺐다
    news: [{title:"\"리센느 효과에 야호\" 나랑드사이다, 모델 발탁 후 매출 48% '껑충'", src:'뉴시스 · 네이트 뉴스', date:'2026.08.27', url:'https://m.news.nate.com/view/20260827n06577'},
           {title:'2026 나랑드사이다 X 리센느 [나랑드로 와] full ver.', src:'동아오츠카 · YouTube', date:'2026.08.07', url:'https://youtu.be/z49A40CwgwM'},
           {title:'2026 나랑드사이다X리센느 [나랑드로와] 메이킹필름', src:'동아오츠카 · YouTube', date:'2026.09.01', url:'https://youtu.be/HKlm_f-qXdk'}]
  }
].forEach(function(cfg){ window.SGCollection(cfg); });
