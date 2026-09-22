// 조회수 수집기 — GitHub Actions(.github/workflows/collect-views.yml)가 15분마다 실행한다.
// YouTube Data API v3 로 채널 "동영상" 탭의 영상(쇼츠·라이브 제외)의 조회수·좋아요·댓글을 읽어 기록 파일에 쌓고,
//  - 예측 시점(게시 6시간·24시간·7일)을 지난 영상은 그 시점의 예측을 한 번 계산해 고정 저장한다 (pred)
//  - 게시 15일이 지난 영상은 다음 100만 단위 돌파 예측을 고정 저장하고, 닿으면 닿은 시각을 적는다 (ms — 화면에서는 더 쓰지 않음)
//  - 게시 15일이 지난 영상이 100만 단위 구간의 세 지점(100만·50만·20만 남음)을 넘으면 구간 끝 도달 예측을 고정하고, 닿으면 적는다 (seg)
//
// 실행: YT_API_KEY=키 node tools/collect-views.js <기록 파일>      (FULL=1 이면 영상 목록 전체를 다시 읽는다)
//
// 기록 파일 (data 브랜치의 views.json)
//   { channel: { handle, id, title, url, thumb, subs }, since: 수집 시작 ISO, updated: 마지막 수집 ISO,
//     videos: [ { id, published: ISO, title, thumb, type: 'long', gone?: true(삭제·비공개), dur: 길이(초),
//                 now:   [게시 후 시간(h), 조회수, 좋아요, 댓글]      ← 매번 덮어쓰는 가장 최근 값
//                 hr:    [[h, 조회수], ...]                         ← 최근 74시간의 매 수집 값(15분 간격) — 15분별 증가 그래프용, 오래된 것은 버림
//                 snaps: [[h, 조회수, 좋아요, 댓글], ...]             ← 영상 나이에 따라 간격을 벌려 쌓는 기록
//                 pred:  { "24" | "168" | "720": { t: 예측 시점(h), n: 비교한 과거 영상 수, made: ISO,
//                                                  p: [[예측, 범위 아래, 범위 위] | null × 4 (①②③종합)] }
//                                               | { none: 'pool', n } (그때 어느 방법으로도 예측 못 함) },
//                 ms:    [ { M: 100만 단위 목표, t: 예측한 때(h), v: 그때 조회수, g: 그때 하루 증가, k: 감쇠 지수(views-engine ④), r: 내일 하루 증가가 오늘의 몇 배,
//                            src: 'data' | 'flat', e: 닿을 것으로 본 때(h, null = 못 닿음), w: 몇 주 차로 봤는지,
//                            hit?: 실제로 닿은 때(h) } ],
//                 seg:   [ { M: 구간 끝(100만 단위), hit?: 닿은 때(h), est?: 1(수집이 3시간 넘게 끊겨 닿은 때가 추정),
//                            c: [ { k: 0 | 1 | 2 (100만·50만·20만 남은 지점), t: 그 지점을 넘은 때(h),
//                                   e: 닿을 것으로 본 때(h, null = 못 닿음), lo·hi: 범위(h, 빨리 · 늦게. hi null = 늦게 보면 못 닿음),
//                                   g, k, r, src: 그때 ④ 감쇠 추세, far?: 1(8주보다 멀거나 못 닿는다고 봄 → 참고) } ] } ] } ] }
//   과거 영상이 MINPOOL 개보다 적을 때는 ③ 만 범위 없이 저장된다 (①·②·범위는 null)
//   좋아요·댓글이 숨겨져 있으면 null. 기록 간격: 게시 48시간까지 1시간, 7일까지 6시간, 그 뒤 1일.
//   API 사용량: 한 번에 약 3 (영상 50개마다 +1). 15분마다면 하루 96번 × 3 ≈ 290. 무료 한도는 하루 10,000.
'use strict';
const fs = require('fs');
const VE = require('./views-engine.js');

const HANDLE = '@helloiamwoninicetomeetyou';
const KEY = process.env.YT_API_KEY;
const FILE = process.argv[2] || 'views.json';
const API = 'https://www.googleapis.com/youtube/v3/';
const NOW = process.env.NOW ? Date.parse(process.env.NOW) : Date.now();     // NOW 는 시험용

function gap(h){ return h <= 48 ? 1 : h <= 168 ? 6 : 24; }
const HR_KEEP = 74, HR_MIN = 10 / 60;      // hr: 74시간 보관(72시간 그래프 + 여유), 10분 이상 벌어지면 쌓기
const r2 = x => Math.round(x * 100) / 100;
const num = x => x == null ? null : Number(x);
// ISO 8601 길이 (PT1M30S) → 초
function secs(d){
  const m = /^P(?:(\d+)D)?(?:T(?:(\d+)H)?(?:(\d+)M)?(?:(\d+)S)?)?$/.exec(d || '');
  return m ? (+m[1] || 0) * 86400 + (+m[2] || 0) * 3600 + (+m[3] || 0) * 60 + (+m[4] || 0) : 0;
}

let calls = 0;
async function api(name, params){
  const u = new URL(API + name);
  for (const k in params) if (params[k] !== '' && params[k] != null) u.searchParams.set(k, params[k]);
  u.searchParams.set('key', KEY);
  for (let i = 0; ; i++){
    calls++;
    const res = await fetch(u);
    const body = await res.json().catch(() => ({}));
    if (res.ok) return body;
    if (i < 2 && res.status >= 500){ await new Promise(r => setTimeout(r, 3000 * (i + 1))); continue; }
    const e = new Error(name + ' 요청 실패 (' + res.status + '): ' + ((body.error && body.error.message) || '응답 없음'));
    e.status = res.status; throw e;
  }
}
async function listAll(playlistId, full){
  const out = []; let token = '';
  do {
    const r = await api('playlistItems', { part: 'contentDetails', playlistId: playlistId, maxResults: 50, pageToken: token });
    (r.items || []).forEach(it => out.push(it.contentDetails.videoId));
    token = full ? r.nextPageToken || '' : '';
  } while (token);
  return out;
}
// 기록 + 가장 최근 값 (예측 계산용)
function series(v){
  const s = v.snaps.slice();
  if (v.now && (!s.length || v.now[0] > s[s.length - 1][0] + 1e-6)) s.push(v.now);
  return s;
}
// 조회수만: snaps + 최근 74시간 15분 간격 값 (사이트의 v.vs 와 같다)
function viewsOnly(v){
  return series(v).map(p => [p[0], p[1]]).concat((v.hr || []).map(p => [p[0], p[1]]))
    .sort((a, b) => a[0] - b[0]).filter((p, i, arr) => !i || p[0] - arr[i - 1][0] > 0.05);
}
// t0 ~ t1 사이에서 조회수가 M 을 처음 넘은 때 (기록 사이는 직선으로 보고 이분 탐색)
function crossAt(vs, M, t0, t1){
  let lo = t0, hi = t1;
  for (let i = 0; i < 40; i++){ const mid = (lo + hi) / 2, x = VE.at(vs, mid, 1); if (x != null && x >= M) hi = mid; else lo = mid; }
  return hi;
}

async function main(){
  if (!KEY) throw new Error('YT_API_KEY 가 없습니다 (GitHub 저장소 Settings → Secrets → Actions 에 등록)');
  let D = { channel: {}, since: null, updated: null, videos: [] };
  if (fs.existsSync(FILE)){ const t = fs.readFileSync(FILE, 'utf8').trim(); if (t) D = Object.assign(D, JSON.parse(t)); }
  // 쇼츠·라이브는 기록하지 않는다 (예전에 모은 것도 지운다)
  D.videos = (D.videos || []).filter(v => !v.type || v.type === 'long');
  const byId = new Map(D.videos.map(v => [v.id, v]));
  const log = { added: 0, snaps: 0, frozen: 0, gone: 0, ms: 0, hit: 0, seg: 0, seghit: 0 };

  // 1) 채널
  const ch = ((await api('channels', { part: 'snippet,contentDetails,statistics', forHandle: HANDLE })).items || [])[0];
  if (!ch) throw new Error('채널을 찾지 못했습니다: ' + HANDLE);
  const th = ch.snippet.thumbnails || {};
  D.channel = { handle: HANDLE, id: ch.id, title: ch.snippet.title, url: 'https://www.youtube.com/' + HANDLE + '/videos',
    thumb: (th.medium || th.default || {}).url || '',
    subs: ch.statistics.hiddenSubscriberCount ? null : num(ch.statistics.subscriberCount) };

  // 2) 영상 목록: 채널 "동영상" 탭 재생목록(UULF…, 쇼츠·라이브 제외). 처음이거나 UTC 0시 실행·FULL=1 이면 전부, 그 외에는 최근 50개
  //    UULF 재생목록을 못 읽으면 전체 업로드(UU…)를 읽고 3분 이하·라이브 영상을 뺀다
  const full = !D.videos.length || new Date(NOW).getUTCHours() === 0 || process.env.FULL === '1';
  let listed, strict = true;
  try { listed = await listAll('UULF' + ch.id.slice(2), full); }
  catch (e){
    if (e.status !== 404 && e.status !== 400) throw e;
    listed = await listAll(ch.contentDetails.relatedPlaylists.uploads, full); strict = false;
  }
  const inTab = new Set(listed);
  // 목록을 전부 읽었으면, 목록에 없는 영상(동영상 탭에서 빠진 것)은 기록에서 뺀다
  if (full && strict) D.videos = D.videos.filter(v => v.gone || inTab.has(v.id));

  // 3) 수치: 목록의 영상 + 이미 기록 중인 영상. 요청했는데 응답에 없으면 삭제·비공개로 본다
  const ids = [...new Set(listed.concat(D.videos.filter(v => !v.gone).map(v => v.id)))];
  const returned = new Set(), drop = new Set();
  const prevNow = new Map();                        // 이번 수집 전 마지막 값 [h, 조회수, …] — 100만 구간 지점을 넘었는지 보려고
  for (let i = 0; i < ids.length; i += 50){
    const r = await api('videos', { part: 'snippet,statistics,contentDetails,liveStreamingDetails', id: ids.slice(i, i + 50).join(','), maxResults: 50 });
    for (const it of r.items || []){
      returned.add(it.id);
      const sn = it.snippet, st = it.statistics || {}, live = it.liveStreamingDetails, dur = secs(it.contentDetails && it.contentDetails.duration);
      if (sn.liveBroadcastContent && sn.liveBroadcastContent !== 'none') continue;     // 예정·진행 중인 방송·최초 공개는 끝난 뒤부터
      if (!strict && (live || dur <= 180)){ drop.add(it.id); continue; }               // 대체 경로: 라이브·쇼츠 빼기
      let v = byId.get(it.id);
      if (!v){
        v = { id: it.id, published: (live && live.actualStartTime) || sn.publishedAt, snaps: [] };
        byId.set(it.id, v); D.videos.push(v); log.added++;
      }
      v.title = sn.title;
      const vt = sn.thumbnails || {};
      v.thumb = (vt.medium || vt.default || {}).url || '';
      v.type = 'long';
      delete v.gone;
      const h = (NOW - Date.parse(v.published)) / 3600e3;
      if (!(h >= 0)) continue;
      const row = [r2(h), num(st.viewCount) || 0, num(st.likeCount), num(st.commentCount)];
      if (v.now) prevNow.set(v.id, v.now);
      v.now = row;
      v.dur = dur || v.dur || 0;
      // 최근 74시간의 매 수집 조회수 [h, 조회수] — 영상 나이와 상관없이 15분별 증가(24·72시간)·24시간 증가를 보기 위해.
      // 예약이 조금 늦게 돌아도 빠지지 않게 10분 이상 벌어졌으면 쌓는다
      v.hr = (v.hr || []).filter(p => p[0] >= row[0] - HR_KEEP);
      if (!v.hr.length || row[0] - v.hr[v.hr.length - 1][0] >= HR_MIN) v.hr.push([row[0], row[1]]);
      const last = v.snaps[v.snaps.length - 1];
      if (!last || h - last[0] >= gap(h) - 0.25){ v.snaps.push(row); log.snaps++; }
    }
  }
  D.videos = D.videos.filter(v => !drop.has(v.id));
  D.videos.forEach(v => { if (!v.gone && ids.includes(v.id) && !returned.has(v.id)){ v.gone = true; log.gone++; } });

  // 4) 예측 고정: 예측 시점(c)을 지났고 그 시점 기록이 있는 영상은, 그때 알 수 있던 기록만으로 예측해 저장한다
  const vids = D.videos.filter(v => !v.gone && v.snaps.length).map(v => ({ raw: v, id: v.id, pub: Date.parse(v.published), type: 'long', snaps: series(v) }));
  for (const V of vids){
    const a = VE.age(V), raw = V.raw;
    for (const tg of VE.TARGETS){
      const key = String(tg.T);
      if (a < tg.c || (raw.pred && raw.pred[key]) || VE.since(V) > tg.c) continue;     // 수집 전 영상은 예측 시점 기록이 없다
      const pool = VE.poolFor(vids, V, tg.T, V.pub + tg.c * 3600e3, tg.c);
      const pr = VE.predictAll(V, tg.c, tg.T, pool), R = x => x == null ? null : Math.round(x);   // 과거 영상이 모자라면 ③ 만
      raw.pred = raw.pred || {};
      if (!pr.some(Boolean)){ raw.pred[key] = { none: 'pool', n: pool.length }; continue; }
      raw.pred[key] = { t: tg.c, n: pool.length, made: new Date(NOW).toISOString(), p: pr.map(r => r ? [R(r.p), R(r.lo), R(r.hi)] : null) };
      log.frozen++;
    }
  }

  // 5) 게시 15일 뒤: 다음 100만 단위 돌파 예측을 한 번 고정하고(기록이 2일 이상 있어야), 닿으면 닿은 때를 적는다
  for (const V of vids){
    const raw = V.raw, a = VE.age(V);
    if (a < VE.LATE) continue;
    const vs = { snaps: viewsOnly(raw) }, cur = VE.at(vs, a, 1);
    raw.ms = raw.ms || [];
    raw.ms.forEach(m => { if (m.hit == null && cur >= m.M){ m.hit = r2(crossAt(vs, m.M, m.t, a)); log.hit++; } });
    const M = (Math.floor(cur / VE.MSTEP) + 1) * VE.MSTEP;
    if (raw.ms.some(m => m.M === M) || a - VE.since(vs) < 48) continue;          // 기록 2일(하루 증가가 줄어드는 정도(k)를 잴 수 있을 만큼)부터
    const P = VE.msPlan(vs, a, 1);
    if (!P) continue;
    const m0 = P.ms[0];
    raw.ms.push({ M: M, t: r2(a), v: Math.round(cur), g: Math.round(P.g), k: Math.round(P.k * 100) / 100, r: Math.round(P.r * 1000) / 1000, src: P.src,
      e: m0.days == null ? null : r2(a + m0.days * 24), w: m0.week });
    log.ms++;
  }

  // 5-2) 100만 단위 구간 채점 (게시 15일 뒤): 지난 수집 값 → 이번 값 사이에 구간 지점(M0, M0+50만, M0+80만)을 넘었으면
  //      ④ 로 구간 끝(M0+100만) 도달을 예측해 고정하고, 구간 끝을 넘었으면 닿은 때를 적는다.
  //      넘은 순간은 두 값 사이를 이어서 추정(15분 수집이면 보통 15분 안쪽 — 조회수 끝자리가 00 으로 떨어지지 않아도 된다).
  //      수집이 3시간 넘게 끊겼으면 그 사이 지점의 예측은 건너뛰고(늦게 한 예측이라), 닿은 때에는 est 를 붙인다
  const GAPMAX = 3;
  for (const V of vids){
    const raw = V.raw, a = VE.age(V), pv = prevNow.get(raw.id);
    if (!pv || !(a > pv[0])) continue;
    const vs = { snaps: viewsOnly(raw) }, cur = VE.at(vs, a, 1), before = pv[1], gapH = a - pv[0];
    if (!(cur > before)) continue;
    raw.seg = raw.seg || [];
    raw.seg.forEach(s => { if (s.hit == null && cur >= s.M){ s.hit = r2(crossAt(vs, s.M, pv[0], a)); if (gapH > GAPMAX) s.est = 1; log.seghit++; } });
    if (a < VE.LATE || gapH > GAPMAX) continue;
    for (let B = Math.floor(before / VE.MSTEP) * VE.MSTEP; B <= cur; B += VE.MSTEP){
      VE.SEGK.forEach((k, ci) => {
        const X = B + k, M = B + VE.MSTEP;
        if (!(before < X && X <= cur)) return;
        let s = raw.seg.find(x => x.M === M);
        if (s && s.c.some(x => x.k === ci)) return;
        const P = VE.segPredict(vs, a, M); if (!P) return;
        if (!s){ s = { M: M, c: [] }; raw.seg.push(s); }
        const H = d => d == null ? null : r2(a + d * 24);
        s.c.push({ k: ci, t: r2(crossAt(vs, X, pv[0], a)), e: H(P.d), lo: H(P.lo), hi: H(P.hi),
          g: Math.round(P.g), k: Math.round(P.k * 100) / 100, r: Math.round(P.r * 1000) / 1000, src: P.src, far: P.far ? 1 : undefined });
        log.seg++;
      });
    }
  }

  // 6) 저장: 영상 하나가 한 줄 (git 이 바뀐 줄만 저장하도록)
  D.since = D.since || new Date(NOW).toISOString();
  D.updated = new Date(NOW).toISOString();
  D.videos.sort((a, b) => Date.parse(b.published) - Date.parse(a.published));
  const out = '{"channel":' + JSON.stringify(D.channel) + ',\n"since":' + JSON.stringify(D.since) + ',"updated":' + JSON.stringify(D.updated)
    + ',\n"videos":[\n' + D.videos.map(v => JSON.stringify(v)).join(',\n') + '\n]}\n';
  JSON.parse(out);
  fs.writeFileSync(FILE + '.tmp', out);
  fs.renameSync(FILE + '.tmp', FILE);

  const alive = D.videos.filter(v => !v.gone);
  console.log('채널 ' + D.channel.title + ' · 동영상 ' + alive.length + '개' + (strict ? '' : ' (대체 경로: 전체 업로드에서 쇼츠·라이브 제외)')
    + ' · 새 영상 ' + log.added + ' · 기록 추가 ' + log.snaps + ' · 예측 고정 ' + log.frozen + ' · 100만 예측 ' + log.ms + ' · 100만 돌파 ' + log.hit + ' · 구간 예측 ' + log.seg + ' · 구간 도달 ' + log.seghit
    + ' · 사라진 영상 ' + log.gone + ' · API 요청 ' + calls + '번' + (full ? ' (전체 목록)' : ''));
}

main().catch(e => { console.error('수집 실패: ' + e.message); process.exit(1); });
