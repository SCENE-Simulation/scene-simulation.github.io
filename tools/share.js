// 공유 카드 — 지금 보이는 내용을 그 순간 기준으로 고정된 PNG 이미지로 만든다 (디시 등 외부에 올리는 용도)
// 서버 없이 브라우저 캔버스에서 그린다. 실시간으로 바뀌지 않는다.
//   SGShare.video(card): 조회수 예측기 영상 카드. card 는 views.js 의 shareCard(v) 가 글자까지 만들어 넘긴다
//     { id, title, thumbs: [썸네일 주소 후보…], hue, demo, at: 기록 시각(ms), chips: [...], when, views, sub,
//       boxes: [{ name, at, tag, tone: 'pred'|'hit'|'miss'|'', big, unit, note } × 3], ms: { head, txt, how }, last }
// [공유하기]를 누르면 바로 클립보드에 복사(게시글에 Ctrl+V). 못 넣는 브라우저는 저장(다운로드)으로, 휴대폰은 공유 시트도
(function(){
  var SITE = 'scene-simulation.github.io';
  var SANS = '"Pretendard Variable","Noto Sans KR",sans-serif', MONO = '"JetBrains Mono","Pretendard Variable",monospace';
  var W = 1200, H = 720, SC = 2;                       // 논리 크기 × 배율(선명하게)
  var C = { bg: '#140b0d', ink: '#fff4f3', ink2: '#c9aeb0', ink3: '#8c7477', line: 'rgba(255,255,255,.1)', box: 'rgba(255,255,255,.045)',
            red: '#ff4d4f', redT: '#ff9e9a', mint: '#6fe0b3', miss: '#ffb36b' };

  function two(n){ return n < 10 ? '0' + n : '' + n; }
  function stamp(ms){ var d = new Date(ms); return d.getFullYear() + '.' + two(d.getMonth() + 1) + '.' + two(d.getDate()) + ' ' + two(d.getHours()) + ':' + two(d.getMinutes()); }
  function fileStamp(ms){ var d = new Date(ms); return '' + d.getFullYear() + two(d.getMonth() + 1) + two(d.getDate()) + '-' + two(d.getHours()) + two(d.getMinutes()); }

  // ---------- 그리기 도구 ----------
  function rr(x, c, y, w, h, r){
    x.beginPath(); x.moveTo(c + r, y); x.arcTo(c + w, y, c + w, y + h, r); x.arcTo(c + w, y + h, c, y + h, r);
    x.arcTo(c, y + h, c, y, r); x.arcTo(c, y, c + w, y, r); x.closePath();
  }
  function font(x, w, s, f){ x.font = w + ' ' + s + 'px ' + (f || SANS); }
  // 한 줄에 안 들어가면 끝을 "…"로
  function fit(x, t, w){
    if (x.measureText(t).width <= w) return t;
    while (t.length > 1 && x.measureText(t + '…').width > w) t = t.slice(0, -1);
    return t.replace(/\s+$/, '') + '…';
  }
  // 여러 줄로 나눈다 (띄어쓰기에서 먼저, 안 되면 글자 단위). 마지막 줄이 넘치면 "…"
  function wrap(x, t, w, max){
    var lines = [], cur = '';
    t.split(/(\s+)/).forEach(function(part){
      if (x.measureText(cur + part).width <= w){ cur += part; return; }
      if (cur.trim()) { lines.push(cur.trim()); cur = ''; }
      part = part.replace(/^\s+/, '');
      while (x.measureText(part).width > w){
        var i = part.length; while (i > 1 && x.measureText(part.slice(0, i)).width > w) i--;
        lines.push(part.slice(0, i)); part = part.slice(i);
      }
      cur = part;
    });
    if (cur.trim()) lines.push(cur.trim());
    if (lines.length > max){ lines = lines.slice(0, max); lines[max - 1] = fit(x, lines[max - 1] + '…', w); }
    return lines;
  }
  // 알약 글자 상자. 너비를 돌려준다
  function pill(x, c, y, t, fg, bg, bd, s){
    s = s || 15; font(x, 700, s);
    var w = x.measureText(t).width + s * 1.3, h = s * 1.9;
    rr(x, c, y, w, h, h / 2); x.fillStyle = bg; x.fill();
    if (bd){ x.strokeStyle = bd; x.lineWidth = 1.5; x.stroke(); }
    x.fillStyle = fg; x.textBaseline = 'middle'; x.fillText(t, c + s * .65, y + h / 2 + 1); x.textBaseline = 'alphabetic';
    return w;
  }
  // 썸네일 불러오기: 후보를 차례로. 유튜브는 없는 크기면 120×90 회색 그림을 주므로 그것도 실패로 본다
  function loadImg(list){
    return new Promise(function(done){
      (function next(i){
        if (i >= list.length) return done(null);
        var im = new Image(); im.crossOrigin = 'anonymous';
        im.onload = function(){ im.naturalWidth > 200 ? done(im) : next(i + 1); };
        im.onerror = function(){ next(i + 1); };
        im.src = list[i];
      })(0);
    });
  }
  // 16:9 칸에 꽉 차게 (4:3 hqdefault 의 위아래 검은 띠는 잘려 나간다)
  function cover(x, im, c, y, w, h){
    var r = w / h, sw = im.naturalWidth, sh = im.naturalHeight, sx = 0, sy = 0;
    if (sw / sh > r){ var nw = sh * r; sx = (sw - nw) / 2; sw = nw; } else { var nh = sw / r; sy = (sh - nh) / 2; sh = nh; }
    x.drawImage(im, sx, sy, sw, sh, c, y, w, h);
  }
  // 캔버스에 쓸 글자의 글꼴을 미리 받아 둔다 (Pretendard 는 글자 묶음별로 나눠 받으므로 실제 글자를 넘긴다)
  function fontsFor(text){
    if (!document.fonts || !document.fonts.load) return Promise.resolve();
    var jobs = ['400', '600', '700', '800'].map(function(w){ return document.fonts.load(w + ' 20px "Pretendard Variable"', text); })
      .concat(['500', '700'].map(function(w){ return document.fonts.load(w + ' 20px "JetBrains Mono"', '0123456789,.:~%+−회만억'); }));
    return Promise.race([Promise.all(jobs), new Promise(function(r){ setTimeout(r, 2500); })]).catch(function(){});
  }

  // ---------- 조회수 예측 카드 ----------
  function drawVideo(d, im){
    var cv = document.createElement('canvas'); cv.width = W * SC; cv.height = H * SC;
    var x = cv.getContext('2d'); x.scale(SC, SC);
    // 바탕: 어두운 바탕 + 붉은 빛 번짐 (조회수 예측기 화면 색)
    x.fillStyle = C.bg; x.fillRect(0, 0, W, H);
    var g = x.createRadialGradient(W * .92, -40, 10, W * .92, -40, 620); g.addColorStop(0, 'rgba(255,77,79,.30)'); g.addColorStop(1, 'rgba(255,77,79,0)');
    x.fillStyle = g; x.fillRect(0, 0, W, H);
    g = x.createRadialGradient(-60, H + 60, 10, -60, H + 60, 560); g.addColorStop(0, 'rgba(255,179,107,.14)'); g.addColorStop(1, 'rgba(255,179,107,0)');
    x.fillStyle = g; x.fillRect(0, 0, W, H);
    g = x.createLinearGradient(0, 0, W, 0); g.addColorStop(0, '#ffb36b'); g.addColorStop(.55, '#ff4d4f'); g.addColorStop(1, '#d91e3c');
    x.fillStyle = g; x.fillRect(0, 0, W, 6);

    // 머리: 사이트 이름 · 기록 시각
    var P = 48;
    font(x, 800, 22); x.fillStyle = C.ink; x.fillText('센둥이 시뮬레이터', P, 62);
    var bw = x.measureText('센둥이 시뮬레이터').width;
    font(x, 600, 18); x.fillStyle = C.redT; x.fillText('·  조회수 예측기', P + bw + 12, 62);
    font(x, 500, 16, MONO); x.fillStyle = C.ink2; x.textAlign = 'right';
    x.fillText(stamp(d.at) + ' 기록 기준', W - P, 61); var sw = x.measureText(stamp(d.at) + ' 기록 기준').width; x.textAlign = 'left';
    if (d.demo){ font(x, 700, 14); pill(x, W - P - sw - 14 - (x.measureText('예시 데이터').width + 14 * 1.3), 41, '예시 데이터', '#2b0608', '#ffc93c', null, 14); }

    // 썸네일
    var TX = P, TY = 96, TW = 480, TH = 270;
    x.save(); rr(x, TX, TY, TW, TH, 18); x.clip();
    if (im) cover(x, im, TX, TY, TW, TH);
    else {
      g = x.createLinearGradient(TX, TY, TX + TW, TY + TH);
      g.addColorStop(0, 'hsl(' + d.hue + ' 55% 34%)'); g.addColorStop(1, 'hsl(' + (d.hue + 50) + ' 60% 16%)');
      x.fillStyle = g; x.fillRect(TX, TY, TW, TH);
      font(x, 800, 22); x.fillStyle = 'rgba(255,255,255,.88)';
      wrap(x, d.title, TW - 48, 3).forEach(function(l, i, a){ x.fillText(l, TX + 24, TY + TH - 24 - (a.length - 1 - i) * 30); });
    }
    x.restore();
    rr(x, TX + .5, TY + .5, TW - 1, TH - 1, 18); x.strokeStyle = 'rgba(255,255,255,.14)'; x.lineWidth = 1; x.stroke();

    // 오른쪽: 상태 · 제목 · 게시 · 조회수
    var RX = TX + TW + 36, RW = W - P - RX, cx = RX;
    d.chips.forEach(function(t, i){ cx += pill(x, cx, TY, t, i ? C.ink2 : C.redT, i ? 'rgba(255,255,255,.06)' : 'rgba(255,77,79,.14)', i ? C.line : 'rgba(255,77,79,.45)', 14) + 8; });
    font(x, 800, 30); x.fillStyle = C.ink;
    var tl = wrap(x, d.title, RW, 2);
    tl.forEach(function(l, i){ x.fillText(l, RX, TY + 72 + i * 40); });
    var y = TY + 72 + (tl.length - 1) * 40 + 34;
    font(x, 500, 16); x.fillStyle = C.ink2; x.fillText(d.when, RX, y);
    font(x, 700, 15); x.fillStyle = C.ink3; x.fillText('지금 조회수', RX, TY + TH - 72);
    font(x, 700, 54, MONO); x.fillStyle = C.ink; x.fillText(fit(x, d.views, RW), RX, TY + TH - 18);
    font(x, 500, 15); x.fillStyle = C.ink2; x.fillText(d.sub, RX, TY + TH + 10);

    // 100만 단위 줄 (민트)
    var MY = TY + TH + 34, MH = 58;
    rr(x, P, MY, W - P * 2, MH, 14); x.fillStyle = 'rgba(111,224,179,.08)'; x.fill(); x.strokeStyle = 'rgba(111,224,179,.35)'; x.lineWidth = 1.5; x.stroke();
    x.textBaseline = 'middle';
    x.save(); x.translate(P + 30, MY + MH / 2); x.rotate(Math.PI / 4); x.fillStyle = C.mint; x.fillRect(-7, -7, 14, 14); x.restore();
    font(x, 800, 20); x.fillStyle = C.mint; x.fillText(d.ms.head, P + 52, MY + MH / 2 + 1);
    var hx = P + 52 + x.measureText(d.ms.head).width + 16;
    font(x, 600, 18); x.fillStyle = C.ink; x.fillText(d.ms.txt, hx, MY + MH / 2 + 1);
    hx += x.measureText(d.ms.txt).width + 14;
    if (d.ms.how){ font(x, 500, 14); x.fillStyle = C.ink3; x.fillText(d.ms.how, hx, MY + MH / 2 + 1); hx += x.measureText(d.ms.how).width; }
    if (d.last){
      font(x, 500, 14); x.fillStyle = C.ink2; x.textAlign = 'right';
      var lw = W - P - 22 - hx - 30;
      if (lw > 120) x.fillText(fit(x, d.last, lw), W - P - 22, MY + MH / 2 + 1);
      x.textAlign = 'left';
    }
    x.textBaseline = 'alphabetic';

    // 24시간 · 7일 · 30일 칸
    var BY = MY + MH + 18, BH = 162, GAP = 16, BW = (W - P * 2 - GAP * 2) / 3;
    d.boxes.forEach(function(b, i){
      var bx = P + i * (BW + GAP), tone = b.tone === 'hit' ? C.mint : b.tone === 'miss' ? C.miss : b.tone === 'pred' ? C.redT : C.ink3;
      rr(x, bx, BY, BW, BH, 16); x.fillStyle = C.box; x.fill(); x.strokeStyle = b.tone === 'pred' ? 'rgba(255,77,79,.35)' : C.line; x.lineWidth = 1.5; x.stroke();
      font(x, 800, 18); x.fillStyle = C.ink; x.fillText(b.name, bx + 20, BY + 36);
      font(x, 500, 13, MONO); x.fillStyle = C.ink3; x.fillText(b.at, bx + 20, BY + 56);
      font(x, 700, 14); var tw = x.measureText(b.tag).width + 18;
      pill(x, bx + BW - 20 - tw, BY + 18, b.tag, tone, 'rgba(255,255,255,.05)', tone, 14);
      font(x, 700, 42, MONO); x.fillStyle = b.tone === 'pred' ? C.ink : b.tone ? C.ink : C.ink2; x.fillText(b.big, bx + 20, BY + 112);
      if (b.unit){ var nw = x.measureText(b.big).width; font(x, 700, 15); x.fillStyle = tone; x.fillText(b.unit, bx + 20 + nw + 10, BY + 110); }
      font(x, 500, 14); x.fillStyle = C.ink2; x.fillText(fit(x, b.note, BW - 40), bx + 20, BY + 142);
    });

    // 발
    font(x, 500, 14); x.fillStyle = C.ink3;
    x.fillText('15분마다 모은 기록으로 계산한 예측입니다 · 비전문가가 만든 계산식이니 재미로만 참고해 주세요', P, H - 26);
    font(x, 700, 15, MONO); x.fillStyle = C.redT; x.textAlign = 'right'; x.fillText(SITE, W - P, H - 26); x.textAlign = 'left';
    return cv;
  }

  // ---------- 미리보기 창 ----------
  // [공유하기]를 누르는 순간 클립보드 복사를 시작한다 (이미지는 다 그려지면 채워짐 — 누른 순간이어야 브라우저가 허락).
  // 클립보드에 이미지를 못 넣는 브라우저이거나 실패하면 [이미지 저장](파일 받기)을 대신 보여 준다. 휴대폰은 [공유…]도
  var CAN_COPY = !!(navigator.clipboard && navigator.clipboard.write && window.ClipboardItem);
  var box = null, url = null, blob = null, name = '';
  function ui(){
    if (box) return box;
    box = document.createElement('div'); box.className = 'shr'; box.hidden = true;
    box.innerHTML = '<div class="shr-bg" data-shx></div><div class="shr-p" role="dialog" aria-modal="true" aria-labelledby="shr-t">'
      + '<div class="shr-h"><b id="shr-t">공유 카드</b><button type="button" class="shr-x" data-shx aria-label="닫기">✕</button></div>'
      + '<div class="shr-im"><span class="shr-ld">이미지를 만드는 중…</span><img alt="공유 카드 미리보기" hidden></div>'
      + '<p class="shr-d">지금 기록 기준으로 고정된 이미지입니다. 클립보드에 복사되니 게시글 쓰기 창에서 붙여 넣기(Ctrl+V) 하세요.</p>'
      + '<div class="shr-b"><button type="button" class="gs shr-go" data-sha="copy">클립보드에 복사</button>'
      + '<button type="button" class="gs" data-sha="save" hidden>이미지 저장</button>'
      + '<button type="button" class="gs" data-sha="share" hidden>공유…</button><span class="shr-m" aria-live="polite"></span></div></div>';
    document.body.appendChild(box);
    box.addEventListener('click', function(e){
      if (e.target.closest('[data-shx]')) return close();
      var b = e.target.closest('[data-sha]'); if (b && blob) act(b.getAttribute('data-sha'));
    });
    document.addEventListener('keydown', function(e){ if (e.key === 'Escape' && !box.hidden) close(); });
    return box;
  }
  function msg(t, bad){ var m = box.querySelector('.shr-m'); m.textContent = t; m.classList.toggle('bad', !!bad); }
  function close(){ box.hidden = true; document.documentElement.classList.remove('shr-on'); }
  function file(){ return new File([blob], name, { type: 'image/png' }); }
  // 클립보드에 넣기. png 는 Blob 또는 Blob 을 줄 Promise
  function copy(png){
    var cb = box.querySelector('[data-sha="copy"]');
    return navigator.clipboard.write([new ClipboardItem({ 'image/png': png })]).then(function(){
      cb.textContent = '✓ 복사됨 · 다시 복사'; msg('클립보드에 복사했습니다 · 게시글에 붙여 넣기(Ctrl+V)');
    });
  }
  function noCopy(){
    box.querySelector('[data-sha="copy"]').hidden = true;
    var s = box.querySelector('[data-sha="save"]'); s.hidden = false; s.classList.add('shr-go');
    msg('이 브라우저에서는 클립보드에 넣지 못했어요 · 저장해서 올려 주세요', true);
  }
  function act(k){
    if (k === 'copy') copy(blob).catch(noCopy);
    else if (k === 'save'){
      var a = document.createElement('a'); a.href = url; a.download = name; document.body.appendChild(a); a.click(); a.remove();
      msg('저장했습니다');
    } else if (k === 'share') navigator.share({ files: [file()], title: '센둥이 시뮬레이터' }).catch(function(){});
  }
  function open(make, fname, text){
    ui(); box.hidden = false; document.documentElement.classList.add('shr-on');
    var img = box.querySelector('.shr-im img'), ld = box.querySelector('.shr-ld'), cb = box.querySelector('[data-sha="copy"]'), sv = box.querySelector('[data-sha="save"]');
    img.hidden = true; ld.hidden = false; ld.textContent = '이미지를 만드는 중…'; blob = null; msg('');
    cb.hidden = false; cb.textContent = '클립보드에 복사'; sv.hidden = true; sv.classList.remove('shr-go');
    Array.prototype.forEach.call(box.querySelectorAll('[data-sha]'), function(b){ b.disabled = true; });
    if (url){ URL.revokeObjectURL(url); url = null; }
    name = fname;
    var pb = fontsFor(text).then(make).then(function(cv){
      return new Promise(function(r){ cv.toBlob(r, 'image/png'); });
    }).then(function(b){ if (!b) throw new Error('blob'); return b; });
    // 누른 순간 복사 시작 (실패하면 버튼으로 다시 — 그래도 안 되면 저장으로 바꿈)
    var auto = CAN_COPY ? copy(pb).catch(function(){ if (blob) msg('[클립보드에 복사]를 눌러 주세요'); return 'retry'; }) : null;
    if (!CAN_COPY) noCopy();
    pb.then(function(b){
      blob = b; url = URL.createObjectURL(b); img.src = url; img.hidden = false; ld.hidden = true;
      var canShare = false; try { canShare = !!(navigator.canShare && navigator.canShare({ files: [file()] })); } catch (e){}
      box.querySelector('[data-sha="share"]').hidden = !canShare;
      Array.prototype.forEach.call(box.querySelectorAll('[data-sha]'), function(b){ b.disabled = false; });
      if (auto) auto.then(function(r){ if (r === 'retry') msg('[클립보드에 복사]를 눌러 주세요'); });
    }).catch(function(){ ld.textContent = '이미지를 만들지 못했습니다. 잠시 뒤 다시 해 주세요.'; msg(''); });
  }

  window.SGShare = {
    video: function(d){
      var text = [d.title, d.when, d.views, d.sub, d.ms.head, d.ms.txt, d.ms.how || '', d.last, d.chips.join('')]
        .concat(d.boxes.map(function(b){ return b.name + b.tag + (b.unit || '') + b.note; })).join('') + '센둥이 시뮬레이터 조회수 예측기 기록 기준 예시 데이터 15분마다 모은 기록으로 계산한 예측입니다 비전문가가 만든 계산식이니 재미로만 참고해 주세요';
      open(function(){ return loadImg(d.thumbs).then(function(im){ return drawVideo(d, im); }); },
        'sendungi-views-' + (d.id || 'demo') + '-' + fileStamp(d.at) + '.png', text);
    }
  };
})();
