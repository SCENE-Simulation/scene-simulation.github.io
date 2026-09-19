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
  });
  document.addEventListener('keydown', function(e){ if (e.key === 'Escape') closeSheet(); });
  window.addEventListener('popstate', function(){ show(cur()); });
  show(cur());

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
