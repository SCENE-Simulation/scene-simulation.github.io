// 기록 백업 · 복원 (?tab=backup)
// 이 사이트의 기록(포카 컬렉션 북 · 굿즈 보유 · 위시리스트 · 영상 즐겨찾기 · 예측의 신 · 뽑기 기록)은 모두 이용자 브라우저 localStorage 에만 있다.
// 사이트를 업데이트해도 지워지지 않지만, 브라우저 쪽에서 사라질 수 있다(아이폰 Safari 는 7일 넘게 방문하지 않으면 지울 수 있음 ·
// 인터넷 기록 삭제 · 기기 변경). 그래서 기록을 JSON 파일 하나로 저장하고, 그 파일로 되살리는 페이지를 둔다.
//
// 파일 형식: { app: 'sendungi', v: 1, site, at: ISO 시각, data: { 저장 키: 저장값(문자열 그대로) } }
//   저장 키는 PREFIX 로 시작하는 것만 (col: 엔진 도감 · bread27 405빵 · sendungi: 굿즈/위시/즐겨찾기/예측 · gacha: 뽑기).
//   복원은 "파일에 있는 키만" 덮어쓴다(파일에 없는 기록은 그대로). 복원 직전 값은 sendungi:undo 에 남겨 한 번 되돌릴 수 있다
(function(){
  var main = document.querySelector('main.mn');
  if (!main || !window.SG) return;

  var PREFIX = /^(col:|bread27|sendungi:|gacha:)/, SKIP = { 'sendungi:undo': 1 }, UNDO = 'sendungi:undo', MAXV = 4e6;
  function esc(s){ return String(s).replace(/[&<>"']/g, function(c){ return { '&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;' }[c]; }); }
  function two(n){ return n < 10 ? '0' + n : '' + n; }
  function stamp(d){ return d.getFullYear() + '.' + two(d.getMonth() + 1) + '.' + two(d.getDate()) + ' ' + two(d.getHours()) + ':' + two(d.getMinutes()); }
  function parse(s, d){ try { var v = JSON.parse(s); return v == null ? d : v; } catch (e){ return d; } }

  // 지금 브라우저의 기록 (키 → 문자열)
  function current(){
    var out = {};
    try { for (var i = 0; i < localStorage.length; i++){ var k = localStorage.key(i); if (PREFIX.test(k) && !SKIP[k]) out[k] = localStorage.getItem(k); } } catch (e){}
    return out;
  }
  // 기록 요약 (지금 것 · 불러올 파일 둘 다 같은 함수로)
  function titles(){
    var t = { cu405: 'CU 리센느 405빵 콜라보' };
    (window.SGCOLS || []).forEach(function(c){ t[c.id] = c.title; });
    return t;
  }
  function summary(data){
    var T = titles(), books = [], n = function(k){ var v = parse(data[k], null); return v && typeof v === 'object' ? (Array.isArray(v) ? v.length : Object.keys(v).length) : 0; };
    // 405빵: counts 배열에서 1장 이상인 종류 수
    var b = parse(data['bread27:collection'], null);
    if (b && Array.isArray(b.counts)){ var o = b.counts.filter(function(x){ return +x > 0; }).length; if (o || (b.log && b.log.length)) books.push({ t: T.cu405, own: o }); }
    // 엔진 도감: 마지막 초기화 뒤 기록에서 카드별 수량 합이 1 이상인 종류 수
    Object.keys(data).forEach(function(k){
      var m = /^col:([^:]+)$/.exec(k); if (!m) return;
      var d = parse(data[k], null), es = d && Array.isArray(d.entries) ? d.entries : [], r = -1, c = Object.create(null);
      es.forEach(function(e, j){ if (e && e.k === 'reset') r = j; });
      es.slice(r + 1).forEach(function(e){ if (e && e.i != null) c[e.i] = (c[e.i] || 0) + (+e.d || 0); });
      var own = Object.keys(c).filter(function(i){ return c[i] > 0; }).length;
      if (own || es.length) books.push({ t: Object.prototype.hasOwnProperty.call(T, m[1]) ? T[m[1]] : m[1], own: own });
    });
    var goods = parse(data['sendungi:goods'], {}), gOwn = goods && typeof goods === 'object' ? Object.keys(goods).filter(function(k){ return +goods[k] > 0; }).length : 0;
    var games = 0; Object.keys(data).forEach(function(k){ if (k === 'bread27' || /^gacha:(rec|mini):/.test(k)) games += n(k); });
    return { books: books, goods: gOwn, wish: n('sendungi:wish'), fav: n('sendungi:vfav'), oracle: n('sendungi:oracle'), games: games, keys: Object.keys(data).length };
  }
  function sumHtml(s){
    function tile(k, v, sub){ return '<div class="mt"><span class="mk">' + k + '</span><b>' + v + '</b><small>' + sub + '</small></div>'; }
    return '<div class="cmeta bk-sum">'
      + tile('포카 컬렉션 북', s.books.length + '개', s.books.length ? s.books.map(function(b){ return esc(b.t) + ' ' + b.own + '종'; }).join(' · ') : '기록 없음')
      + tile('굿즈 보유', s.goods + '종', '보유 수량을 올린 굿즈')
      + tile('위시리스트 · 즐겨찾기', s.wish + ' · ' + s.fav, '담아 둔 카드 · 굿즈 / 영상')
      + tile('예측의 신 · 뽑기', s.oracle + ' · ' + s.games, '남긴 예측 / 뽑기 · 미니게임 기록')
      + '</div>';
  }

  // ---------- 화면 ----------
  var el = document.createElement('section');
  el.id = 'v-backup'; el.className = 'wrap page'; el.hidden = true;
  main.appendChild(el);
  window.SG.pages.backup = el;
  var prevShow = window.SG.onShow;
  window.SG.onShow = function(tab){ prevShow(tab); if (tab === 'backup') render(); };

  var pending = null;   // 불러온 파일 (복원 전 확인 중)
  function render(){
    var now = current(), s = summary(now), undo = parse(localStorage.getItem(UNDO), null), done = null;
    try { done = sessionStorage.getItem('sg:restored'); sessionStorage.removeItem('sg:restored'); } catch (e){}
    var h = '<div class="sec"><div class="sec-t"><svg viewBox="0 0 24 24"><use href="#i-save"/></svg>기록 백업</div></div>'
      + '<p class="sec-d">이 사이트의 기록(포카 컬렉션 북 · 굿즈 보유 · 위시리스트 · 영상 즐겨찾기 · 예측의 신 · 뽑기 기록)은 서버가 아니라 <b>지금 쓰는 브라우저에만</b> 저장됩니다. '
      + '사이트가 업데이트되어도 지워지지 않지만, 인터넷 기록을 지우거나 기기 · 브라우저를 바꾸면 사라지고, <b>아이폰 Safari 는 7일 넘게 방문하지 않으면 지울 수 있습니다.</b> '
      + '가끔 백업 파일로 저장해 두면 언제든 그대로 되살릴 수 있습니다.</p>'
      + (done ? '<div class="bk-ok">✓ 백업 파일에서 기록 ' + esc(done) + '개를 되살렸습니다.</div>' : '')
      + '<div class="sec sec2"><div class="sec-t">지금 이 브라우저의 기록</div></div>' + sumHtml(s)
      + '<div class="bk-acts">'
      + '<div class="bk-card"><b>백업 파일 저장</b><small>지금 기록을 파일 하나(.json)로 내려받습니다. 휴대폰에서는 "파일" 앱이나 다운로드 폴더에 저장됩니다.</small>'
      + '<button type="button" class="p" data-bk="save"' + (s.keys ? '' : ' disabled') + '>백업 파일 저장</button>' + (s.keys ? '' : '<small class="bk-na">저장할 기록이 아직 없습니다</small>') + '</div>'
      + '<div class="bk-card"><b>백업 파일 불러오기</b><small>저장해 둔 백업 파일을 고르면, 복원하기 전에 무엇이 들어 있는지 먼저 보여 줍니다.</small>'
      + '<button type="button" data-bk="pick">파일 고르기</button><input type="file" accept=".json,application/json" data-bk-file hidden></div>'
      + '</div>'
      + '<div id="bk-prev"></div>'
      + (undo && undo.at && Date.now() - undo.at < 7 * 864e5 ? '<p class="bk-undo">' + stamp(new Date(undo.at)) + '에 백업 파일로 복원했습니다. <button type="button" data-bk="undo">복원하기 전 상태로 되돌리기</button></p>' : '')
      + '<p class="bk-per" id="bk-per"></p>';
    el.innerHTML = h;
    persistLine();
  }
  // 브라우저의 "영구 저장"(공간이 모자라도 지우지 않음) 상태
  function persistLine(){
    var p = document.getElementById('bk-per'); if (!p) return;
    if (!(navigator.storage && navigator.storage.persisted)){ p.textContent = ''; return; }
    navigator.storage.persisted().then(function(ok){
      p.innerHTML = ok ? '이 브라우저는 이 사이트 기록을 <b>영구 저장</b>하도록 되어 있습니다 (저장 공간이 모자라도 지우지 않음).'
        : '이 브라우저는 저장 공간이 모자라면 이 사이트 기록을 지울 수도 있습니다. <button type="button" data-bk="persist">영구 저장 요청</button>';
    }).catch(function(){});
  }
  function showPrev(file, s){
    var box = document.getElementById('bk-prev'); if (!box) return;
    box.innerHTML = '<div class="bk-prev"><b>이 백업 파일로 복원할까요?</b>'
      + '<small>' + (file.at ? stamp(new Date(file.at)) + ' 에 저장한 파일' : '저장 시각 모름') + ' · 기록 ' + s.keys + '개. 파일에 있는 기록만 바뀌고, 파일에 없는 기록은 그대로 둡니다.</small>'
      + sumHtml(s)
      + '<div class="bk-row"><button type="button" class="p" data-bk="restore">이 파일로 복원</button><button type="button" data-bk="cancel">취소</button></div></div>';
  }
  function err(t){ var box = document.getElementById('bk-prev'); if (box) box.innerHTML = '<div class="bk-err">' + esc(t) + '</div>'; }

  function download(){
    var data = current(), d = new Date();
    var txt = JSON.stringify({ app: 'sendungi', v: 1, site: location.origin, at: d.toISOString(), data: data });
    var a = document.createElement('a'), url = URL.createObjectURL(new Blob([txt], { type: 'application/json' }));
    a.href = url; a.download = 'sendungi-backup-' + d.getFullYear() + two(d.getMonth() + 1) + two(d.getDate()) + '-' + two(d.getHours()) + two(d.getMinutes()) + '.json';
    document.body.appendChild(a); a.click(); a.remove();
    setTimeout(function(){ URL.revokeObjectURL(url); }, 4000);
    if (window.toastSG) window.toastSG('백업 파일을 저장했습니다', esc(a.download));
  }
  // 파일 검사: 이 사이트 백업 형식인지, 키 · 값 모양이 맞는지. 모르는 키 · 너무 큰 값은 버린다
  function readFile(f){
    if (f.size > 20e6) return err('파일이 너무 큽니다 (20MB 넘음).');
    var r = new FileReader();
    r.onload = function(){
      var o = parse(r.result, null);
      if (!o || o.app !== 'sendungi' || !o.data || typeof o.data !== 'object') return err('센둥이 시뮬레이터 백업 파일이 아닙니다.');
      var data = {};
      Object.keys(o.data).forEach(function(k){ var v = o.data[k]; if (PREFIX.test(k) && !SKIP[k] && typeof v === 'string' && v.length < MAXV) data[k] = v; });
      if (!Object.keys(data).length) return err('이 파일에는 되살릴 기록이 없습니다.');
      pending = { at: Date.parse(o.at) || null, data: data };
      showPrev(pending, summary(data));
    };
    r.onerror = function(){ err('파일을 읽지 못했습니다.'); };
    r.readAsText(f);
  }
  function restore(){
    if (!pending) return;
    var prev = {}, keys = Object.keys(pending.data), done = [];
    try {
      keys.forEach(function(k){ prev[k] = localStorage.getItem(k); });
      localStorage.setItem(UNDO, JSON.stringify({ at: Date.now(), prev: prev }));
      keys.forEach(function(k){ localStorage.setItem(k, pending.data[k]); done.push(k); });
    } catch (e){
      // 저장 공간이 모자라 중간에 멈추면, 이미 바꾼 기록을 되돌려 반쯤 섞인 상태를 남기지 않는다
      try { localStorage.removeItem(UNDO); } catch (e2){}
      done.reverse().forEach(function(k){ try { if (prev[k] == null) localStorage.removeItem(k); else localStorage.setItem(k, prev[k]); } catch (e3){} });
      return err('저장 공간이 모자라 복원하지 못했습니다. 지금 기록은 그대로입니다.');
    }
    try { sessionStorage.setItem('sg:restored', String(done.length)); } catch (e){}
    location.reload();                                                     // 모든 페이지가 새 기록을 처음부터 읽게
  }
  function undo(){
    var u = parse(localStorage.getItem(UNDO), null); if (!u || !u.prev) return;
    Object.keys(u.prev).forEach(function(k){ if (!PREFIX.test(k)) return; if (u.prev[k] == null) localStorage.removeItem(k); else localStorage.setItem(k, u.prev[k]); });
    localStorage.removeItem(UNDO);
    location.reload();
  }

  el.addEventListener('click', function(e){
    var b = e.target.closest('[data-bk]'); if (!b) return;
    var k = b.getAttribute('data-bk');
    if (k === 'save') download();
    else if (k === 'pick') el.querySelector('[data-bk-file]').click();
    else if (k === 'restore') restore();
    else if (k === 'cancel'){ pending = null; document.getElementById('bk-prev').innerHTML = ''; }
    else if (k === 'undo') undo();
    else if (k === 'persist' && navigator.storage && navigator.storage.persist) navigator.storage.persist().then(persistLine, persistLine);
  });
  el.addEventListener('change', function(e){
    var inp = e.target.closest('[data-bk-file]'); if (!inp || !inp.files || !inp.files[0]) return;
    readFile(inp.files[0]); inp.value = '';
  });
})();
