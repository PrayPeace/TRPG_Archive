// 메모리 안의 가짜 구글 Apps Script (시트·캐시·속성·잠금). 여러 vm(예전 판/새 판)이 같은 저장소를 쓸 수 있다.
const vm = require('vm'), fs = require('fs'), crypto = require('crypto');
function colIdx(a){ let n=0; for (const ch of a) n = n*26 + (ch.charCodeAt(0)-64); return n; }
function makeStore(){ return { books:{}, props:{}, cache:{}, triggers:[], clock:{ now:null } }; }
function makeBook(store, id, name){
  const b = { id, name, sheets:[] }; store.books[id] = b; return b;
}
function sheetObj(b, sh){
  const getLastRow = () => { for (let i = sh.rows.length - 1; i >= 0; i--) if (sh.rows[i] && sh.rows[i].some(v => v !== '' && v != null)) return i + 1; return 0; };
  const range = (r, c, nr, nc) => ({
    getValues: () => { const out=[]; for (let i=0;i<nr;i++){ const row=sh.rows[r-1+i]||[]; const o=[]; for(let j=0;j<nc;j++){ const v=row[c-1+j]; o.push(v==null?'':v);} out.push(o);} return out; },
    getValue: () => { const row=sh.rows[r-1]||[]; const v=row[c-1]; return v==null?'':v; },
    setValues: v => { if (v.length!==nr || v.some(x=>x.length!==nc)) throw new Error('setValues 크기 다름 '+nr+'x'+nc+' vs '+v.length+'x'+(v[0]||[]).length); v.forEach((row,i)=>{ const R=sh.rows[r-1+i]=sh.rows[r-1+i]||[]; row.forEach((x,j)=>{ if (typeof x==='string' && x.length>50000) throw new Error('칸 한도 5만 자 넘음'); R[c-1+j]=x; }); }); return range(r,c,nr,nc); },
    setValue: x => { const R=sh.rows[r-1]=sh.rows[r-1]||[]; if (typeof x==='string' && x.length>50000) throw new Error('칸 한도'); R[c-1]=x; return range(r,c,nr,nc); },
    setNumberFormat: () => range(r,c,nr,nc), clearContent: () => { for(let i=0;i<nr;i++){const R=sh.rows[r-1+i]; if(R) for(let j=0;j<nc;j++) R[c-1+j]='';} return range(r,c,nr,nc); },
    getNumRows: () => nr
  });
  return {
    getName: () => sh.name, getLastRow,
    getDataRange: () => { const lr = Math.max(1, getLastRow()), lc = Math.max(1, ...sh.rows.map(r => r ? r.length : 0)); return range(1, 1, lr, lc); }, getMaxRows: () => Math.max(1000, sh.rows.length), getLastColumn: () => Math.max(0, ...sh.rows.map(r => r ? r.length : 0)),
    getRange: (a, c, nr, nc) => {
      if (typeof a === 'string') { const m = /^([A-Z]+)(\d*)(?::([A-Z]+)(\d*))?$/.exec(a); const c1=colIdx(m[1]), r1=m[2]?Number(m[2]):1, c2=m[3]?colIdx(m[3]):c1, r2=m[4]?Number(m[4]):Math.max(1000,sh.rows.length); return range(r1,c1,r2-r1+1,c2-c1+1); }
      return range(a, c, nr == null ? 1 : nr, nc == null ? 1 : nc);
    },
    appendRow: row => { sh.rows[getLastRow()] = row.slice(); },
    deleteRows: (r, n) => { sh.rows.splice(r - 1, n); },
    clear: () => { sh.rows = []; }, clearContents: () => { sh.rows = []; },
    setFrozenRows: () => {}, hideSheet: () => {}, showSheet: () => {}, setTabColor: () => {}, getSheetId: () => b.sheets.indexOf(sh),
    autoResizeColumns: () => {}, setColumnWidth: () => {},
  };
}
function bookObj(b){
  return {
    getId: () => b.id, getName: () => b.name, rename: n => { b.name = n; }, getUrl: () => 'https://docs.google.com/spreadsheets/d/' + b.id + '/edit',
    getSheetByName: n => { const s = b.sheets.find(x => x.name === n); return s ? sheetObj(b, s) : null; },
    insertSheet: n => { const s = { name: n, rows: [] }; b.sheets.push(s); return sheetObj(b, s); },
    getSheets: () => b.sheets.map(s => sheetObj(b, s)),
  };
}
// 한 "실행"(웹 요청·트리거)마다 새 vm을 만든다 = 실제 Apps Script처럼 전역 변수가 매번 새로
function execCtx(store, codePath, opts){
  opts = opts || {};
  let D = Date;
  if (store.vclock) {      // 가상 시계: AI 지연·sleep을 실제로 기다리지 않고 시간만 흐르게
    const vc = store.vclock;
    D = class extends Date { constructor(...a) { if (a.length) super(...a); else super(vc.t); } static now() { return vc.t; } };
  }
  const ctx = { console, Logger: { log: () => {} }, Date: D, JSON, Math };
  ctx.SpreadsheetApp = { getActive: () => opts.active ? bookObj(store.books[opts.active]) : null, openById: id => { if (!store.books[id]) throw new Error('시트 없음 ' + id); return bookObj(store.books[id]); }, flush: () => {} };
  ctx.PropertiesService = { getScriptProperties: () => ({ getProperty: k => store.props[k] == null ? null : store.props[k], setProperty: (k, v) => { store.props[k] = String(v); }, deleteProperty: k => { delete store.props[k]; } }) };
  ctx.CacheService = { getScriptCache: () => ({ get: k => store.cache[k] == null ? null : store.cache[k], put: (k, v) => { if (String(v).length > 100000) throw new Error('캐시 한도'); store.cache[k] = String(v); }, remove: k => { delete store.cache[k]; }, putAll: o => { Object.keys(o).forEach(k => store.cache[k] = String(o[k])); }, getAll: ks => { const r = {}; ks.forEach(k => { if (store.cache[k] != null) r[k] = store.cache[k]; }); return r; }, removeAll: ks => ks.forEach(k => delete store.cache[k]) }) };
  store.locks = store.locks || { script: null };
  ctx.LockService = { getScriptLock: () => { const me = {}; return { tryLock: () => { if (store.locks.script && store.locks.script !== me) return false; store.locks.script = me; return true; }, waitLock: () => { if (store.locks.script && store.locks.script !== me) throw new Error('잠금 시간 초과'); store.locks.script = me; }, releaseLock: () => { if (store.locks.script === me) store.locks.script = null; }, hasLock: () => store.locks.script === me }; } };
  let uu = 0;
  ctx.Utilities = { getUuid: () => crypto.randomUUID(), sleep: ms => { if (store.vclock) store.vclock.t += ms; }, base64Encode: b => Buffer.from(b).toString('base64'), base64EncodeWebSafe: b => Buffer.from(b).toString('base64').replace(/\+/g, '-').replace(/\//g, '_'), computeDigest: (a, s) => crypto.createHash('sha256').update(String(s)).digest(), DigestAlgorithm: { SHA_256: 1 }, Charset: { UTF_8: 1 }, formatDate: (d, tz, f) => new Date(d).toISOString().replace('T', ' ').slice(0, 19) };
  ctx.Session = { getScriptTimeZone: () => 'Asia/Seoul' };
  ctx.ContentService = { createTextOutput: s => ({ setMimeType: () => JSON.parse(s) }), MimeType: { JSON: 1 } };
  ctx.ScriptApp = { getService: () => ({ getUrl: () => opts.serviceUrl || '' }), getProjectTriggers: () => store.triggers, deleteTrigger: t => { store.triggers = store.triggers.filter(x => x !== t); }, newTrigger: h => { const t = { getHandlerFunction: () => h }; const b = { timeBased: () => b, everyMinutes: () => b, after: () => b, create: () => { store.triggers.push(t); return t; } }; return b; } };
  ctx.UrlFetchApp = { fetch: () => ({ getResponseCode: () => 200, getContentText: () => '{}' }) };
  ctx.DriveApp = { getFileById: id => ({ makeCopy: name => { const nid = '1COPY' + crypto.randomBytes(14).toString('hex'); const src = store.books[id]; const b = makeBook(store, nid, name); b.sheets = JSON.parse(JSON.stringify(src.sheets)); return { getId: () => nid }; }, setTrashed: () => {} }) };
  vm.createContext(ctx);
  vm.runInContext(fs.readFileSync(codePath, 'utf8'), ctx, { filename: 'Code.gs' });
  if (opts.after) vm.runInContext(opts.after, ctx);
  return ctx;
}
module.exports = { makeStore, makeBook, execCtx, bookObj };
