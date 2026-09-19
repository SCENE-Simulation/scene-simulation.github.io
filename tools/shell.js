(function(){
  var TABS = { home: 1, gacha: 1, collection: 1 };
  var home = document.getElementById('v-home'), app = document.getElementById('v-app');
  var bSim = document.getElementById('tab-sim'), bCol = document.getElementById('tab-col');

  function cur(){
    var t = new URLSearchParams(location.search).get('tab');
    return TABS[t] ? t : 'home';
  }
  function show(t){
    home.hidden = t !== 'home';
    app.hidden = t === 'home';
    if (t === 'gacha') bSim.click();
    if (t === 'collection') bCol.click();
    document.querySelectorAll('[data-tab]').forEach(function(a){
      a.classList.toggle('on', a.getAttribute('data-tab') === t && !a.closest('.hd,.home'));
    });
    window.scrollTo(0, 0);
  }
  document.addEventListener('click', function(e){
    var a = e.target.closest('a[data-tab]');
    if (!a || e.ctrlKey || e.metaKey || e.shiftKey) return;
    e.preventDefault();
    var t = a.getAttribute('data-tab');
    if (t !== cur()) history.pushState(null, '', '?tab=' + t);
    show(t);
  });
  window.addEventListener('popstate', function(){ show(cur()); });
  show(cur());

  // 사이드바·홈의 컬렉션 요약을 도감 숫자와 연동
  function sync(){
    document.querySelectorAll('[data-mirror]').forEach(function(el){
      var src = document.getElementById(el.getAttribute('data-mirror'));
      if (src) el.textContent = src.textContent;
    });
    var own = document.getElementById('c-own'), pg = document.getElementById('sb-pg');
    if (own && pg) {
      var m = own.textContent.match(/(\d+)\s*\/\s*(\d+)/);
      if (m) pg.style.width = (100 * m[1] / m[2]) + '%';
    }
  }
  var obs = new MutationObserver(sync);
  ['c-own', 'c-won', 'c-cnt'].forEach(function(id){
    var el = document.getElementById(id);
    if (el) obs.observe(el, { childList: true, characterData: true, subtree: true });
  });
  sync();
})();