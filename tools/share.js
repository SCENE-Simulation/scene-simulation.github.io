// 공유 카드 — 지금 보이는 내용을 그 순간 기준으로 고정된 PNG 이미지로 만든다 (디시 등 외부에 올리는 용도)
// 서버 없이 브라우저 캔버스에서 그린다. 실시간으로 바뀌지 않는다.
//   SGShare.video(card): 조회수 예측기 영상 카드. card 는 views.js 의 shareCard(v) 가 글자까지 만들어 넘긴다
//     { id, title, thumbs: [썸네일 주소 후보…], hue, demo, at: 기록 시각(ms), chips: [...], when, views, sub,
//       boxes: [{ name, at, tag, tone: 'pred'|'hit'|'miss'|'', big, unit, note } × 3], ms: { head, txt, how }, last }
// 미리보기 창에서 고른다: 클립보드에 복사(게시글에 Ctrl+V) · 이미지 저장 · 공유(휴대폰 공유 시트)
(function(){
  var SITE = 'scene-simulation.github.io';
  var SANS = '"Pretendard Variable","Noto Sans KR",sans-serif', MONO = '"JetBrains Mono","Pretendard Variable",monospace';
  var W = 1200, H = 780, SC = 2;                       // 논리 크기 × 배율(선명하게)
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
    // 글자 크기: 디시에서 가로 700px 안팎으로 줄어 보이므로(약 0.6배) 작은 글자도 18px 이상으로
    var P = 48;
    font(x, 800, 28); x.fillStyle = C.ink; x.fillText('센둥이 시뮬레이터', P, 70);
    var bw = x.measureText('센둥이 시뮬레이터').width;
    font(x, 600, 22); x.fillStyle = C.redT; x.fillText('·  조회수 예측기', P + bw + 14, 69);
    font(x, 500, 20, MONO); x.fillStyle = C.ink2; x.textAlign = 'right';
    x.fillText(stamp(d.at) + ' 기록 기준', W - P, 68); var sw = x.measureText(stamp(d.at) + ' 기록 기준').width; x.textAlign = 'left';
    if (d.demo){ font(x, 700, 17); pill(x, W - P - sw - 14 - (x.measureText('예시 데이터').width + 17 * 1.3), 45, '예시 데이터', '#2b0608', '#ffc93c', null, 17); }

    // 썸네일
    var TX = P, TY = 104, TW = 480, TH = 270;
    x.save(); rr(x, TX, TY, TW, TH, 18); x.clip();
    if (im) cover(x, im, TX, TY, TW, TH);
    else {
      g = x.createLinearGradient(TX, TY, TX + TW, TY + TH);
      g.addColorStop(0, 'hsl(' + d.hue + ' 55% 34%)'); g.addColorStop(1, 'hsl(' + (d.hue + 50) + ' 60% 16%)');
      x.fillStyle = g; x.fillRect(TX, TY, TW, TH);
      font(x, 800, 24); x.fillStyle = 'rgba(255,255,255,.88)';
      wrap(x, d.title, TW - 48, 3).forEach(function(l, i, a){ x.fillText(l, TX + 24, TY + TH - 24 - (a.length - 1 - i) * 32); });
    }
    x.restore();
    rr(x, TX + .5, TY + .5, TW - 1, TH - 1, 18); x.strokeStyle = 'rgba(255,255,255,.14)'; x.lineWidth = 1; x.stroke();

    // 오른쪽: 상태 · 제목 · 게시 · 조회수
    var RX = TX + TW + 36, RW = W - P - RX, cx = RX;
    d.chips.forEach(function(t, i){ cx += pill(x, cx, TY, t, i ? C.ink2 : C.redT, i ? 'rgba(255,255,255,.06)' : 'rgba(255,77,79,.14)', i ? C.line : 'rgba(255,77,79,.45)', 18) + 8; });
    font(x, 800, 36); x.fillStyle = C.ink;
    var tl = wrap(x, d.title, RW, 2);
    tl.forEach(function(l, i){ x.fillText(l, RX, TY + 80 + i * 46); });
    font(x, 500, 21); x.fillStyle = C.ink2; x.fillText(fit(x, d.when, RW), RX, TY + 80 + (tl.length - 1) * 46 + 38);
    font(x, 700, 20); x.fillStyle = C.ink3; x.fillText('지금 조회수', RX, TY + TH - 80);
    font(x, 700, 58, MONO); x.fillStyle = C.ink; x.fillText(fit(x, d.views, RW), RX, TY + TH - 22);
    font(x, 500, 20); x.fillStyle = C.ink2; x.fillText(fit(x, d.sub, RW), RX, TY + TH + 14);

    // 100만 단위 줄 (민트): 머리 · 때 · (자리가 남으면) 오른쪽에 최근 돌파, 그다음 계산 기준
    var MY = TY + TH + 36, MH = 72, MR = W - P - 24;
    rr(x, P, MY, W - P * 2, MH, 16); x.fillStyle = 'rgba(111,224,179,.08)'; x.fill(); x.strokeStyle = 'rgba(111,224,179,.35)'; x.lineWidth = 1.5; x.stroke();
    x.textBaseline = 'middle';
    var my = MY + MH / 2 + 1;
    x.save(); x.translate(P + 32, MY + MH / 2); x.rotate(Math.PI / 4); x.fillStyle = C.mint; x.fillRect(-8, -8, 16, 16); x.restore();
    font(x, 800, 26); x.fillStyle = C.mint; x.fillText(d.ms.head, P + 58, my);
    var hx = P + 58 + x.measureText(d.ms.head).width + 18;
    font(x, 600, 24); x.fillStyle = C.ink; x.fillText(fit(x, d.ms.txt, MR - hx), hx, my);
    hx += x.measureText(d.ms.txt).width + 18;
    font(x, 500, 19);
    var lw = d.last ? x.measureText(d.last).width : 0, how = d.ms.how ? x.measureText(d.ms.how).width : 0;
    x.textAlign = 'right';
    if (lw && hx + lw <= MR){ x.fillStyle = C.ink2; x.fillText(d.last, MR, my); if (how && hx + how + 24 + lw <= MR){ x.textAlign = 'left'; x.fillStyle = C.ink3; x.fillText(d.ms.how, hx, my); } }
    else if (how && hx + how <= MR){ x.textAlign = 'left'; x.fillStyle = C.ink3; x.fillText(d.ms.how, hx, my); }
    x.textAlign = 'left'; x.textBaseline = 'alphabetic';

    // 24시간 · 7일 · 30일 칸
    var BY = MY + MH + 20, BH = 204, GAP = 16, BW = (W - P * 2 - GAP * 2) / 3;
    d.boxes.forEach(function(b, i){
      var bx = P + i * (BW + GAP), tone = b.tone === 'hit' ? C.mint : b.tone === 'miss' ? C.miss : b.tone === 'pred' ? C.redT : C.ink3;
      rr(x, bx, BY, BW, BH, 16); x.fillStyle = C.box; x.fill(); x.strokeStyle = b.tone === 'pred' ? 'rgba(255,77,79,.35)' : C.line; x.lineWidth = 1.5; x.stroke();
      font(x, 700, 17); var tw = x.measureText(b.tag).width + 17 * 1.3;
      font(x, 800, 24); x.fillStyle = C.ink; x.fillText(fit(x, b.name, BW - 44 - tw - 10), bx + 22, BY + 44);
      font(x, 500, 18, MONO); x.fillStyle = C.ink3; x.fillText(b.at, bx + 22, BY + 72);
      pill(x, bx + BW - 22 - tw, BY + 20, b.tag, tone, 'rgba(255,255,255,.05)', tone, 17);
      font(x, 700, 50, MONO); x.fillStyle = b.tone ? C.ink : C.ink2; x.fillText(b.big, bx + 22, BY + 142);
      if (b.unit){ var nw = x.measureText(b.big).width; font(x, 700, 19); x.fillStyle = tone; x.fillText(b.unit, bx + 22 + nw + 10, BY + 140); }
      font(x, 500, 18); x.fillStyle = C.ink2; x.fillText(fit(x, b.note, BW - 44), bx + 22, BY + 180);
    });

    // 발
    font(x, 500, 18); x.fillStyle = C.ink3;
    x.fillText('15분마다 모은 기록으로 계산 · 비전문가가 만든 계산식이니 재미로만 참고해 주세요', P, H - 30);
    font(x, 700, 20, MONO); x.fillStyle = C.redT; x.textAlign = 'right'; x.fillText(SITE, W - P, H - 30); x.textAlign = 'left';
    return cv;
  }

  // ---------- 컬렉션 카드 (포카 · 굿즈 컬렉션 북) ----------
  // d = { kind: '포카 컬렉션 북', title, sub, at, file,
  //       stats: [{ k, v, s, bar: 0~1 (첫 칸만) }], rows: [[{ name, color, cols, cards: [{ src, n: 가진 장수, land, pix }] }]],
  //       ach: { got: [{ n, c }], total } | null, note: 맨 아래 왼쪽 글(없으면 비움) }
  // rows: 한 줄에 여러 묶음(멤버별 등). 묶음 안 카드는 cols 개씩 줄바꿈. 줄마다 카드 높이를 폭에 맞춰 정한다
  var PK = { pink: '#e96387', pinkT: '#f28aa7' };
  function asp(c){ return c.land ? 4 / 3 : 3 / 4; }
  function rowLayout(row, avail){
    var CG = 8, GG = 22, HMAX = 150;
    var gs = row.map(function(g){
      var lines = [];
      for (var i = 0; i < g.cards.length; i += g.cols) lines.push(g.cards.slice(i, i + g.cols));
      var A = Math.max.apply(null, lines.map(function(l){ return l.reduce(function(s, c){ return s + asp(c); }, 0); }));
      var G = Math.max.apply(null, lines.map(function(l){ return (l.length - 1) * CG; }));
      return { g: g, lines: lines, A: A, G: G };
    });
    var A = gs.reduce(function(s, x){ return s + x.A; }, 0), G = gs.reduce(function(s, x){ return s + x.G; }, 0) + (gs.length - 1) * GG;
    var h = Math.min(HMAX, (avail - G) / A);
    var nl = Math.max.apply(null, gs.map(function(x){ return x.lines.length; }));
    return { gs: gs, h: h, CG: CG, GG: GG, H: 34 + nl * h + (nl - 1) * CG };
  }
  function drawCollection(d, imgs){
    var P = 48, AW = W - P * 2;
    var rows = d.rows.map(function(r){ return rowLayout(r, AW); });
    var CH0 = 380;                                                      // 머리 · 제목 · 숫자 칸 (카드 줄이 시작하는 높이)
    var HH = CH0 + rows.reduce(function(s, r){ return s + r.H + 26; }, 0) + (d.ach ? 60 : 0) + 76;
    var cv = document.createElement('canvas'); cv.width = W * SC; cv.height = HH * SC;
    var x = cv.getContext('2d'); x.scale(SC, SC);
    x.fillStyle = '#17121a'; x.fillRect(0, 0, W, HH);
    var g = x.createRadialGradient(W * .9, -40, 10, W * .9, -40, 640); g.addColorStop(0, 'rgba(233,99,135,.30)'); g.addColorStop(1, 'rgba(233,99,135,0)');
    x.fillStyle = g; x.fillRect(0, 0, W, HH);
    g = x.createRadialGradient(-60, HH + 60, 10, -60, HH + 60, 620); g.addColorStop(0, 'rgba(160,128,208,.16)'); g.addColorStop(1, 'rgba(160,128,208,0)');
    x.fillStyle = g; x.fillRect(0, 0, W, HH);
    g = x.createLinearGradient(0, 0, W, 0); g.addColorStop(0, '#f6a6c1'); g.addColorStop(.55, PK.pink); g.addColorStop(1, '#a080d0');
    x.fillStyle = g; x.fillRect(0, 0, W, 6);

    // 머리
    font(x, 800, 28); x.fillStyle = C.ink; x.fillText('센둥이 시뮬레이터', P, 70);
    var bw = x.measureText('센둥이 시뮬레이터').width;
    font(x, 600, 22); x.fillStyle = PK.pinkT; x.fillText('·  ' + d.kind, P + bw + 14, 69);
    font(x, 500, 20, MONO); x.fillStyle = C.ink2; x.textAlign = 'right'; x.fillText(stamp(d.at) + ' 기준', W - P, 68); x.textAlign = 'left';

    // 제목
    font(x, 800, 40); x.fillStyle = C.ink; x.fillText(fit(x, d.title, AW), P, 150);
    font(x, 500, 21); x.fillStyle = C.ink2; x.fillText(fit(x, d.sub, AW), P, 186);

    // 숫자 칸: 첫 칸(보유)이 넓고 진행 막대
    var SY = 214, SH = 132, GAP = 16, n = d.stats.length, w0 = AW * .34, wr = (AW - w0 - GAP * (n - 1)) / (n - 1), sx = P;
    d.stats.forEach(function(s, i){
      var w = i ? wr : w0;
      rr(x, sx, SY, w, SH, 16); x.fillStyle = 'rgba(255,255,255,.045)'; x.fill();
      x.strokeStyle = i ? C.line : 'rgba(233,99,135,.45)'; x.lineWidth = 1.5; x.stroke();
      font(x, 700, 19); x.fillStyle = C.ink3; x.fillText(s.k, sx + 22, SY + 36);
      font(x, 700, i ? 40 : 48, MONO); x.fillStyle = C.ink; x.fillText(fit(x, s.v, w - 44), sx + 22, SY + (i ? 86 : 90));
      if (s.bar != null){
        var bx = sx + 22, by = SY + SH - 26, bw2 = w - 44;
        rr(x, bx, by, bw2, 10, 5); x.fillStyle = 'rgba(255,255,255,.08)'; x.fill();
        if (s.bar > 0){ rr(x, bx, by, Math.max(10, bw2 * Math.min(1, s.bar)), 10, 5); var gb = x.createLinearGradient(bx, 0, bx + bw2, 0); gb.addColorStop(0, '#f6a6c1'); gb.addColorStop(1, PK.pink); x.fillStyle = gb; x.fill(); }
        font(x, 700, 19, MONO); x.fillStyle = PK.pinkT; x.textAlign = 'right'; x.fillText(Math.round(s.bar * 100) + '%', sx + w - 22, SY + 36); x.textAlign = 'left';
      } else if (s.s){ font(x, 500, 18); x.fillStyle = C.ink2; x.fillText(fit(x, s.s, w - 44), sx + 22, SY + SH - 22); }
      sx += w + GAP;
    });

    // 카드 줄
    var y = SY + SH + 34, k = 0;
    rows.forEach(function(r){
      var gx = P;
      r.gs.forEach(function(q){
        var gw = q.A * r.h + q.G, have = q.g.cards.filter(function(c){ return c.n > 0; }).length;
        // 묶음 이름 · 모은 수
        x.textBaseline = 'middle';
        x.fillStyle = q.g.color || PK.pink; x.beginPath(); x.arc(gx + 7, y + 12, 6, 0, Math.PI * 2); x.fill();
        font(x, 800, 20); x.fillStyle = C.ink; x.fillText(fit(x, q.g.name, gw - 70), gx + 20, y + 13);
        font(x, 700, 18, MONO); x.fillStyle = have === q.g.cards.length ? '#6fe0b3' : C.ink2; x.textAlign = 'right';
        x.fillText(have + '/' + q.g.cards.length, gx + gw, y + 13); x.textAlign = 'left'; x.textBaseline = 'alphabetic';
        q.lines.forEach(function(line, li){
          var cx = gx, cy = y + 34 + li * (r.h + r.CG);
          line.forEach(function(c){
            var cw = asp(c) * r.h, im = imgs[k++];
            x.save(); rr(x, cx, cy, cw, r.h, 8); x.clip();
            x.fillStyle = '#241c26'; x.fillRect(cx, cy, cw, r.h);
            if (im){ x.imageSmoothingEnabled = !c.pix; x.globalAlpha = c.n > 0 ? 1 : .13; cover(x, im, cx, cy, cw, r.h); x.globalAlpha = 1; x.imageSmoothingEnabled = true; }
            x.restore();
            rr(x, cx + .75, cy + .75, cw - 1.5, r.h - 1.5, 8);
            if (c.n > 0){ x.strokeStyle = 'rgba(255,255,255,.22)'; x.lineWidth = 1.5; x.setLineDash([]); }
            else { x.strokeStyle = 'rgba(255,255,255,.2)'; x.lineWidth = 1.5; x.setLineDash([6, 5]); }
            x.stroke(); x.setLineDash([]);
            if (c.n > 1){ font(x, 800, 16, MONO); var t = '×' + c.n, tw = x.measureText(t).width + 14;
              rr(x, cx + cw - tw - 6, cy + 6, tw, 24, 12); x.fillStyle = PK.pink; x.fill();
              x.fillStyle = '#fff'; x.textBaseline = 'middle'; x.fillText(t, cx + cw - tw - 6 + 7, cy + 19); x.textBaseline = 'alphabetic'; }
            cx += cw + r.CG;
          });
        });
        gx += gw + r.GG;
      });
      y += r.H + 26;
    });

    // 칭호: 얻은 것 이름을 자리만큼, 나머지는 +N
    if (d.ach){
      var AY = y - 4, AH = 60;
      rr(x, P, AY, AW, AH, 16); x.fillStyle = 'rgba(255,255,255,.045)'; x.fill(); x.strokeStyle = C.line; x.lineWidth = 1.5; x.stroke();
      x.textBaseline = 'middle';
      font(x, 800, 21); x.fillStyle = '#ffd36b'; x.fillText('✦ 칭호', P + 22, AY + AH / 2 + 1);
      var ax = P + 22 + x.measureText('✦ 칭호').width + 12;
      font(x, 700, 19, MONO); x.fillStyle = C.ink2; var at = d.ach.got.length + ' / ' + d.ach.total; x.fillText(at, ax, AY + AH / 2 + 1);
      ax += x.measureText(at).width + 20; x.textBaseline = 'alphabetic';
      var right = P + AW - 18, shown = 0;
      if (!d.ach.got.length){ font(x, 500, 18); x.fillStyle = C.ink3; x.textBaseline = 'middle'; x.fillText('아직 얻은 칭호가 없어요', ax, AY + AH / 2 + 1); x.textBaseline = 'alphabetic'; }
      d.ach.got.some(function(a, i){
        font(x, 700, 17); var pw = x.measureText(a.n).width + 17 * 1.3, rest = d.ach.got.length - i - 1;
        var need = pw + (rest ? 70 : 0);
        if (ax + need > right) return true;
        pill(x, ax, AY + (AH - 32) / 2, a.n, a.c, 'rgba(255,255,255,.05)', a.c, 17); ax += pw + 8; shown++;
        return false;
      });
      if (shown < d.ach.got.length){ font(x, 700, 18, MONO); x.fillStyle = C.ink2; x.textBaseline = 'middle'; x.fillText('+' + (d.ach.got.length - shown), ax + 4, AY + AH / 2 + 1); x.textBaseline = 'alphabetic'; }
      y = AY + AH + 20;
    }

    // 발
    if (d.note){ font(x, 500, 18); x.fillStyle = C.ink3; x.fillText(fit(x, d.note, AW - 330), P, HH - 30); }
    font(x, 700, 20, MONO); x.fillStyle = PK.pinkT; x.textAlign = 'right'; x.fillText(SITE, W - P, HH - 30); x.textAlign = 'left';
    return cv;
  }
  function loadAll(list){ return Promise.all(list.map(function(s){ return s ? loadImg([s]) : Promise.resolve(null); })); }

  // ---------- 미리보기 창 ----------
  // 이미지를 다 그리면 고를 수 있게 버튼을 켠다: [클립보드에 복사](되는 브라우저만) · [이미지 저장] · [공유…](되는 곳만 — 휴대폰 공유 시트)
  // 바로 복사하지 않는다 — 디시 앱(모바일)은 클립보드 붙여 넣기를 받지 않아 저장 · 공유가 필요하다
  var CAN_COPY = !!(navigator.clipboard && navigator.clipboard.write && window.ClipboardItem);
  var box = null, url = null, blob = null, name = '';
  function ui(){
    if (box) return box;
    box = document.createElement('div'); box.className = 'shr'; box.hidden = true;
    box.innerHTML = '<div class="shr-bg" data-shx></div><div class="shr-p" role="dialog" aria-modal="true" aria-labelledby="shr-t">'
      + '<div class="shr-h"><b id="shr-t">공유 카드</b><button type="button" class="shr-x" data-shx aria-label="닫기"><svg viewBox="0 0 24 24" aria-hidden="true"><path d="M6 6l12 12M18 6L6 18"/></svg></button></div>'
      + '<div class="shr-im"><span class="shr-ld">이미지를 만드는 중…</span><img alt="공유 카드 미리보기" hidden></div>'
      + '<p class="shr-d">지금 기록 기준으로 고정된 이미지입니다. 복사해서 게시글에 붙여 넣거나(Ctrl+V), 저장해서 사진으로 첨부하세요.</p>'
      + '<div class="shr-b"><button type="button" class="gs" data-sha="copy">클립보드에 복사</button>'
      + '<button type="button" class="gs" data-sha="save">이미지 저장</button>'
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
  function act(k){
    if (k === 'copy'){
      var cb = box.querySelector('[data-sha="copy"]');
      navigator.clipboard.write([new ClipboardItem({ 'image/png': blob })]).then(function(){
        cb.textContent = '✓ 복사됨'; msg('클립보드에 복사했습니다 · 게시글에 붙여 넣기(Ctrl+V)');
      }, function(){ cb.hidden = true; msg('이 브라우저에서는 클립보드에 넣지 못했어요 · 저장해서 올려 주세요', true); });
    } else if (k === 'save'){
      var a = document.createElement('a'); a.href = url; a.download = name; document.body.appendChild(a); a.click(); a.remove();
      msg('저장했습니다');
    } else if (k === 'share') navigator.share({ files: [file()], title: '센둥이 시뮬레이터' }).catch(function(){});
  }
  function open(make, fname, text){
    ui(); box.hidden = false; document.documentElement.classList.add('shr-on');
    var img = box.querySelector('.shr-im img'), ld = box.querySelector('.shr-ld'), cb = box.querySelector('[data-sha="copy"]');
    img.hidden = true; ld.hidden = false; ld.textContent = '이미지를 만드는 중…'; blob = null; msg('');
    cb.hidden = !CAN_COPY; cb.textContent = '클립보드에 복사';
    Array.prototype.forEach.call(box.querySelectorAll('[data-sha]'), function(b){ b.disabled = true; });
    if (url){ URL.revokeObjectURL(url); url = null; }
    name = fname;
    fontsFor(text).then(make).then(function(cv){
      return new Promise(function(r){ cv.toBlob(r, 'image/png'); });
    }).then(function(b){
      if (!b) throw new Error('blob');
      blob = b; url = URL.createObjectURL(b); img.src = url; img.hidden = false; ld.hidden = true;
      var canShare = false; try { canShare = !!(navigator.canShare && navigator.canShare({ files: [file()] })); } catch (e){}
      box.querySelector('[data-sha="share"]').hidden = !canShare;
      Array.prototype.forEach.call(box.querySelectorAll('[data-sha]'), function(b){ b.disabled = false; });
    }).catch(function(){ ld.textContent = '이미지를 만들지 못했습니다. 잠시 뒤 다시 해 주세요.'; });
  }

  window.SGShare = {
    video: function(d){
      var text = [d.title, d.when, d.views, d.sub, d.ms.head, d.ms.txt, d.ms.how || '', d.last, d.chips.join('')]
        .concat(d.boxes.map(function(b){ return b.name + b.tag + (b.unit || '') + b.note; })).join('') + '센둥이 시뮬레이터 조회수 예측기 기록 기준 예시 데이터 15분마다 모은 기록으로 계산 비전문가가 만든 계산식이니 재미로만 참고해 주세요';
      open(function(){ return loadImg(d.thumbs).then(function(im){ return drawVideo(d, im); }); },
        'sendungi-views-' + (d.id || 'demo') + '-' + fileStamp(d.at) + '.png', text);
    },
    // 컬렉션 카드 (형식은 drawCollection 위 주석). 카드 그림은 같은 사이트 주소 · data: 라 캔버스가 오염되지 않는다
    collection: function(d){
      var cards = []; d.rows.forEach(function(r){ r.forEach(function(g){ cards = cards.concat(g.cards); }); });
      var text = [d.kind, d.title, d.sub, d.note || ''].concat(d.stats.map(function(s){ return s.k + s.v + (s.s || ''); }))
        .concat(d.rows.map(function(r){ return r.map(function(g){ return g.name; }).join(''); }))
        .concat(d.ach ? d.ach.got.map(function(a){ return a.n; }) : []).join('') + '센둥이 시뮬레이터 기준 칭호 아직 얻은 칭호가 없어요 ✦';
      open(function(){ return loadAll(cards.map(function(c){ return c.src; })).then(function(ims){ return drawCollection(d, ims); }); },
        (d.file || 'sendungi-collection') + '-' + fileStamp(d.at) + '.png', text);
    }
  };
})();
