// 조회수 수집기 — GitHub Actions(.github/workflows/collect-views.yml)가 1시간마다 실행한다.
// YouTube Data API v3 로 채널 영상들의 조회수·좋아요·댓글을 읽어 기록 파일에 쌓고,
// 예측 시점(게시 6시간·24시간·7일)을 지난 영상은 그 시점의 예측을 한 번 계산해 고정 저장한다.
//
// 실행: YT_API_KEY=키 node tools/collect-views.js <기록 파일>      (FULL=1 이면 영상 목록 전체를 다시 읽는다)
//
// 기록 파일 (data 브랜치의 views.json)
//   { channel: { handle, id, title, url, thumb, subs }, since: 수집 시작 ISO, updated: 마지막 수집 ISO,
//     videos: [ { id, published: ISO, title, thumb, type: 'long' | 'short' | 'live', gone?: true(삭제·비공개),
//                 now:   [게시 후 시간(h), 조회수, 좋아요, 댓글]      ← 매번 덮어쓰는 가장 최근 값
//                 snaps: [[h, 조회수, 좋아요, 댓글], ...]             ← 영상 나이에 따라 간격을 벌려 쌓는 기록
//                 pred:  { "24" | "168" | "720": { t: 예측 시점(h), n: 비교한 과거 영상 수, made: ISO,
//                                                  p: [[예측, 범위 아래, 범위 위] | null × 4 (①②③종합)] }
//                                               | { none: 'pool', n } (그때 과거 영상이 모자라 예측 못 함) } } ] }
//   좋아요·댓글이 숨겨져 있으면 null. 기록 간격: 게시 48시간까지 1시간, 7일까지 6시간, 30일까지 1일, 그 뒤 1주.
//   API 사용량: 한 번에 약 3 (영상 50개마다 +1, 전체 목록을 읽는 날은 +영상 수/50). 무료 한도는 하루 10,000.
'use strict';
const fs = require('fs');
const VE = require('./views-engine.js');

const HANDLE = '@helloiamwoninicetomeetyou';
const KEY = process.env.YT_API_KEY;
const FILE = process.argv[2] || 'views.json';
const API = 'https://www.googleapis.com/youtube/v3/';
const NOW = process.env.NOW ? Date.parse(process.env.NOW) : Date.now();     // NOW 는 시험용

function gap(h){ return h <= 48 ? 1 : h <= 168 ? 6 : h <= 720 ? 24 : 168; }
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
    throw new Error(name + ' 요청 실패 (' + res.status + '): ' + ((body.error && body.error.message) || '응답 없음'));
  }
}
// 쇼츠인지: youtube.com/shorts/ID 가 그대로 열리면 쇼츠, /watch 로 넘어가면 일반 영상. 확인 못 하면 null
async function isShort(id){
  try {
    const res = await fetch('https://www.youtube.com/shorts/' + encodeURIComponent(id), { method: 'HEAD', redirect: 'manual' });
    return res.status === 200 ? true : res.status >= 300 && res.status < 400 ? false : null;
  } catch (e){ return null; }
}
// 기록 + 가장 최근 값 (예측 계산용)
function series(v){
  const s = v.snaps.slice();
  if (v.now && (!s.length || v.now[0] > s[s.length - 1][0] + 1e-6)) s.push(v.now);
  return s;
}

async function main(){
  if (!KEY) throw new Error('YT_API_KEY 가 없습니다 (GitHub 저장소 Settings → Secrets → Actions 에 등록)');
  let D = { channel: {}, since: null, updated: null, videos: [] };
  if (fs.existsSync(FILE)){ const t = fs.readFileSync(FILE, 'utf8').trim(); if (t) D = Object.assign(D, JSON.parse(t)); }
  D.videos = D.videos || [];
  const byId = new Map(D.videos.map(v => [v.id, v]));
  const log = { added: 0, snaps: 0, frozen: 0, gone: 0 };

  // 1) 채널
  const ch = ((await api('channels', { part: 'snippet,contentDetails,statistics', forHandle: HANDLE })).items || [])[0];
  if (!ch) throw new Error('채널을 찾지 못했습니다: ' + HANDLE);
  const th = ch.snippet.thumbnails || {};
  D.channel = { handle: HANDLE, id: ch.id, title: ch.snippet.title, url: 'https://www.youtube.com/' + HANDLE,
    thumb: (th.medium || th.default || {}).url || '',
    subs: ch.statistics.hiddenSubscriberCount ? null : num(ch.statistics.subscriberCount) };

  // 2) 영상 목록: 처음이거나 하루 한 번(UTC 0시 실행) 또는 FULL=1 이면 전부, 그 외에는 최근 50개
  const full = !D.videos.length || new Date(NOW).getUTCHours() === 0 || process.env.FULL === '1';
  const listed = [];
  let token = '';
  do {
    const r = await api('playlistItems', { part: 'contentDetails', playlistId: ch.contentDetails.relatedPlaylists.uploads, maxResults: 50, pageToken: token });
    (r.items || []).forEach(it => listed.push(it.contentDetails.videoId));
    token = full ? r.nextPageToken || '' : '';
  } while (token);

  // 3) 수치: 목록의 영상 + 이미 기록 중인 영상. 요청했는데 응답에 없으면 삭제·비공개로 본다
  const ids = [...new Set(listed.concat(D.videos.filter(v => !v.gone).map(v => v.id)))];
  const returned = new Set();
  for (let i = 0; i < ids.length; i += 50){
    const r = await api('videos', { part: 'snippet,statistics,contentDetails,liveStreamingDetails', id: ids.slice(i, i + 50).join(','), maxResults: 50 });
    for (const it of r.items || []){
      returned.add(it.id);
      const sn = it.snippet, st = it.statistics || {}, live = it.liveStreamingDetails;
      if (sn.liveBroadcastContent && sn.liveBroadcastContent !== 'none') continue;     // 예정·진행 중인 방송은 끝난 뒤부터
      let v = byId.get(it.id);
      if (!v){
        v = { id: it.id, published: (live && live.actualStartTime) || sn.publishedAt, snaps: [] };
        byId.set(it.id, v); D.videos.push(v); log.added++;
      }
      v.title = sn.title;
      const vt = sn.thumbnails || {};
      v.thumb = (vt.medium || vt.default || {}).url || '';
      if (!v.type){
        if (live) v.type = 'live';
        else {
          const s = secs(it.contentDetails && it.contentDetails.duration);
          let short = false;
          if (s > 0 && s <= 180){ short = await isShort(it.id); if (short == null) short = s <= 60; }
          v.type = short ? 'short' : 'long';
        }
      }
      delete v.gone;
      const h = (NOW - Date.parse(v.published)) / 3600e3;
      if (!(h >= 0)) continue;
      const row = [r2(h), num(st.viewCount) || 0, num(st.likeCount), num(st.commentCount)];
      v.now = row;
      const last = v.snaps[v.snaps.length - 1];
      if (!last || h - last[0] >= gap(h) - 0.25){ v.snaps.push(row); log.snaps++; }
    }
  }
  D.videos.forEach(v => { if (!v.gone && ids.includes(v.id) && !returned.has(v.id)){ v.gone = true; log.gone++; } });

  // 4) 예측 고정: 예측 시점(c)을 지났고 그 시점 기록이 있는 영상은, 그때 알 수 있던 기록만으로 예측해 저장한다
  const vids = D.videos.filter(v => !v.gone).map(v => ({ raw: v, id: v.id, pub: Date.parse(v.published), type: v.type || 'long', snaps: series(v) }));
  for (const V of vids){
    const a = VE.age(V), raw = V.raw;
    for (const tg of VE.TARGETS){
      const key = String(tg.T);
      if (a < tg.c || (raw.pred && raw.pred[key]) || VE.since(V) > tg.c) continue;     // 수집 전 영상은 예측 시점 기록이 없다
      const pool = VE.poolFor(vids, V, tg.T, V.pub + tg.c * 3600e3, tg.c);
      raw.pred = raw.pred || {};
      if (pool.length < VE.MINPOOL){ raw.pred[key] = { none: 'pool', n: pool.length }; continue; }
      const pr = VE.predictAll(V, tg.c, tg.T, pool), R = x => x == null ? null : Math.round(x);
      raw.pred[key] = { t: tg.c, n: pool.length, made: new Date(NOW).toISOString(), p: pr.map(r => r ? [R(r.p), R(r.lo), R(r.hi)] : null) };
      log.frozen++;
    }
  }

  // 5) 저장: 영상 하나가 한 줄 (git 이 바뀐 줄만 저장하도록)
  D.since = D.since || new Date(NOW).toISOString();
  D.updated = new Date(NOW).toISOString();
  D.videos.sort((a, b) => Date.parse(b.published) - Date.parse(a.published));
  const out = '{"channel":' + JSON.stringify(D.channel) + ',\n"since":' + JSON.stringify(D.since) + ',"updated":' + JSON.stringify(D.updated)
    + ',\n"videos":[\n' + D.videos.map(v => JSON.stringify(v)).join(',\n') + '\n]}\n';
  JSON.parse(out);
  fs.writeFileSync(FILE + '.tmp', out);
  fs.renameSync(FILE + '.tmp', FILE);

  const alive = D.videos.filter(v => !v.gone);
  console.log('채널 ' + D.channel.title + ' · 영상 ' + alive.length + '개 (쇼츠 ' + alive.filter(v => v.type === 'short').length + ', 라이브 ' + alive.filter(v => v.type === 'live').length + ')'
    + ' · 새 영상 ' + log.added + ' · 기록 추가 ' + log.snaps + ' · 예측 고정 ' + log.frozen + ' · 사라진 영상 ' + log.gone
    + ' · API 요청 ' + calls + '번' + (full ? ' (전체 목록)' : ''));
}

main().catch(e => { console.error('수집 실패: ' + e.message); process.exit(1); });
