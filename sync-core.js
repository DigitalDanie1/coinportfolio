/* Cross-device sync: pure merge logic (no DOM, no network). Browser global CPSyncCore / Node module.
 * A "doc" is the mergeable form of the app state:
 *   recs  : { key: { v: value, t: updatedAt, f: { field: updatedAt } } }   (f only for plain-object values)
 *   tombs : { key: deletedAt }
 *   lists : { removedDefaults, appliedImports, migrations }   (unioned)
 *   pairsInit : farmingPairs has been initialised (null vs [])
 * t === 0 means "legacy": data that predates sync or was never edited on a synced device. */
(function(root, factory) {
  const api = factory();
  if (typeof module === 'object' && module.exports) module.exports = api;
  else root.CPSyncCore = api;
})(typeof self !== 'undefined' ? self : this, function() {
  const TOMB_TTL = 90 * 86400000;
  const LISTS = ['removedDefaults', 'appliedImports', 'migrations'];
  const isObj = v => v && typeof v === 'object' && !Array.isArray(v);
  const J = v => JSON.stringify(v);
  const clone = v => v === undefined ? undefined : JSON.parse(JSON.stringify(v));
  const sameJSON = (a, b) => J(a) === J(b);
  function isEmpty(v) {
    if (v === null || v === undefined || v === '' || v === 0 || v === false) return true;
    if (Array.isArray(v)) return v.every(isEmpty);
    if (isObj(v)) return Object.values(v).every(isEmpty);
    return false;
  }
  function hash(s) { let h = 5381; for (let i = 0; i < s.length; i++) h = ((h << 5) + h + s.charCodeAt(i)) | 0; return (h >>> 0).toString(36); }
  const kid = item => item && item.id != null && item.id !== '' ? String(item.id) : 'h' + hash(J(item));

  // Deterministic choice between two values with no timestamps to compare: never let empty beat non-empty,
  // then prefer the one with more content, then break the tie by text so both devices converge.
  function pickLegacy(x, y) {
    const sx = J(x), sy = J(y);
    if (sx === sy) return x;
    const ex = isEmpty(x), ey = isEmpty(y);
    if (ex !== ey) return ex ? y : x;
    if (sx.length !== sy.length) return sx.length > sy.length ? x : y;
    return sx > sy ? x : y;
  }

  function pairKey(p) { return p.oi ? 'pair:oi:' + p.oi : p.gap ? 'pair:gap:' + p.gap : 'pair:' + kid(p); }

  // State -> flat { key: value }. Duplicate keys get a suffix so nothing is silently dropped.
  function extract(S) {
    const out = {};
    const put = (key, v) => { let k = key, n = 1; while (k in out) k = key + '~' + (n++); out[k] = clone(v); };
    for (const c of S.coins || []) put('coin:' + kid(c), c);
    for (const [id, h] of Object.entries(S.holdings || {})) put('holding:' + id, h);
    for (const p of S.farming || []) put('farm:' + kid(p), p);
    for (const p of S.options || []) put('opt:' + kid(p), p);
    for (const c of S.categories || []) put('cat:' + kid(c), c);
    for (const p of S.farmingPairs || []) put(pairKey(p), p);
    const fx = S.farmingExtra || {};
    for (const [k, v] of Object.entries(fx.venueMeta || {})) put('fx:venueMeta:' + k, v);
    for (const [k, v] of Object.entries(fx.points || {})) put('fx:points:' + k, v);
    for (const e of fx.pnl || []) put('fx:pnl:' + (e.id || kid(e)), e);
    for (const [k, v] of Object.entries(fx.ui || {})) put('fx:ui:' + k, v);
    if (fx.target) put('fx:target', fx.target);
    if (S.scenario) put('scenario', S.scenario);
    if (S.reflections) put('reflections', S.reflections);
    return out;
  }

  function emptyDoc() { return { recs: {}, tombs: {}, lists: { removedDefaults: [], appliedImports: [], migrations: [] }, pairsInit: false }; }
  function unionList(a, b) {
    const seen = new Set(), out = [];
    for (const x of [...(a || []), ...(b || [])]) { const k = J(x); if (!seen.has(k)) { seen.add(k); out.push(x); } }
    return out;
  }
  const recT = r => Math.max(r.t || 0, ...Object.values(r.f || {}).map(Number), 0);

  // Local state -> doc, carrying over prev's timestamps for everything that did not change.
  function build(S, prev, now = Date.now()) {
    const cur = extract(S), doc = emptyDoc(), tombs = Object.assign({}, prev && prev.tombs);
    for (const [key, v] of Object.entries(cur)) {
      const p = prev && prev.recs[key];
      if (!prev) { doc.recs[key] = { v, t: 0, f: {} }; continue; }
      if (!p) { // new record: an empty shell must not outrank real data elsewhere, so it stays legacy
        const f = {};
        if (isObj(v)) for (const [k, x] of Object.entries(v)) f[k] = isEmpty(x) ? 0 : now;
        const t = isEmpty(v) ? 0 : now;
        if (t) delete tombs[key];
        doc.recs[key] = { v, t, f: isObj(v) ? f : {} };
        continue;
      }
      if (sameJSON(p.v, v)) { doc.recs[key] = p; continue; }
      if (isObj(v) && isObj(p.v)) {
        const f = Object.assign({}, p.f);
        for (const k of Object.keys(v)) if (!(k in p.v) ? !isEmpty(v[k]) : !sameJSON(p.v[k], v[k])) f[k] = now;
        for (const k of Object.keys(p.v)) if (!(k in v)) f[k] = now; // removed field
        doc.recs[key] = { v, t: now, f };
      } else doc.recs[key] = { v, t: now, f: {} };
      delete tombs[key];
    }
    if (prev) for (const key of Object.keys(prev.recs)) if (!(key in cur)) tombs[key] = now;
    for (const [k, t] of Object.entries(tombs)) if (now - t > TOMB_TTL) delete tombs[k];
    doc.tombs = tombs;
    for (const l of LISTS) doc.lists[l] = unionList(prev && prev.lists && prev.lists[l], S[l]);
    doc.pairsInit = !!(S.farmingPairs || (prev && prev.pairsInit));
    return doc;
  }

  function mergeRec(a, b) {
    if (!isObj(a.v) || !isObj(b.v)) {
      const ta = recT(a), tb = recT(b);
      if (ta !== tb) return ta > tb ? a : b;
      return { v: pickLegacy(a.v, b.v), t: ta, f: {} };
    }
    const v = {}, f = {};
    const fields = [];
    for (const k of [...Object.keys(a.v), ...Object.keys(b.v), ...Object.keys(a.f || {}), ...Object.keys(b.f || {})]) if (!fields.includes(k)) fields.push(k);
    for (const k of fields) {
      const fa = (a.f || {})[k] || 0, fb = (b.f || {})[k] || 0;
      const pa = k in a.v, pb = k in b.v;
      let win, from;
      if (fa !== fb) from = fa > fb ? 'a' : 'b';
      else if (pa !== pb) from = pa ? 'a' : 'b';
      else if (pa) from = pickLegacy(a.v[k], b.v[k]) === a.v[k] ? 'a' : 'b';
      if (from === 'a' ? pa : from === 'b' ? pb : false) v[k] = from === 'a' ? a.v[k] : b.v[k];
      if (Math.max(fa, fb)) f[k] = Math.max(fa, fb);
    }
    return { v, t: Math.max(a.t || 0, b.t || 0), f };
  }

  function merge(a, b, now = Date.now()) {
    const out = emptyDoc();
    const tombs = {};
    for (const src of [a.tombs, b.tombs]) for (const [k, t] of Object.entries(src || {})) tombs[k] = Math.max(tombs[k] || 0, t);
    for (const key of new Set([...Object.keys(a.recs), ...Object.keys(b.recs)])) {
      const ra = a.recs[key], rb = b.recs[key];
      const r = ra && rb ? mergeRec(ra, rb) : clone(ra || rb);
      const tomb = tombs[key] || 0;
      if (tomb && tomb >= recT(r)) continue; // deleted after its last edit (or never edited): stays deleted
      delete tombs[key];
      out.recs[key] = r;
    }
    for (const [k, t] of Object.entries(tombs)) if (now - t > TOMB_TTL) delete tombs[k];
    out.tombs = tombs;
    for (const l of LISTS) out.lists[l] = unionList(a.lists && a.lists[l], b.lists && b.lists[l]);
    out.pairsInit = !!(a.pairsInit || b.pairsInit);
    return out;
  }

  // True when the two docs would produce the same app state (timestamps ignored).
  function sameValues(a, b) {
    const ka = Object.keys(a.recs), kb = Object.keys(b.recs);
    if (ka.length !== kb.length) return false;
    for (const k of ka) if (!b.recs[k] || !sameJSON(a.recs[k].v, b.recs[k].v)) return false;
    for (const l of LISTS) if (!sameJSON(a.lists[l], b.lists[l])) return false;
    return !!a.pairsInit === !!b.pairsInit;
  }

  // Stricter than sameValues: also compares timestamps and tombstones (used to decide whether a push is needed).
  function sameDoc(a, b) {
    if (!sameValues(a, b) || !sameJSON(a.tombs || {}, b.tombs || {})) return false;
    for (const k of Object.keys(a.recs)) if (a.recs[k].t !== b.recs[k].t || !sameJSON(a.recs[k].f || {}, b.recs[k].f || {})) return false;
    return true;
  }

  // Doc -> app state, keeping the order the local state already has and appending anything new.
  function apply(doc, S) {
    const keys = Object.keys(doc.recs);
    // Keep the order the local state already has, then append anything new in doc order.
    const ex = extract(S);
    const orderedKeys = prefix => {
      const mine = Object.keys(ex).filter(k => k.startsWith(prefix) && k in doc.recs);
      return [...mine, ...keys.filter(k => k.startsWith(prefix) && !mine.includes(k))];
    };
    const list = prefix => orderedKeys(prefix).map(k => clone(doc.recs[k].v));
    const dict = prefix => { const o = {}; for (const k of orderedKeys(prefix)) o[k.slice(prefix.length).replace(/~\d+$/, '')] = clone(doc.recs[k].v); return o; };
    const pairs = orderedKeys('pair:').map(k => clone(doc.recs[k].v));
    const out = {
      coins: list('coin:'), holdings: dict('holding:'), farming: list('farm:'), options: list('opt:'),
      categories: list('cat:'), farmingPairs: pairs.length || doc.pairsInit ? pairs : null,
      farmingExtra: {
        venueMeta: dict('fx:venueMeta:'), points: dict('fx:points:'), pnl: list('fx:pnl:'),
        target: doc.recs['fx:target'] ? clone(doc.recs['fx:target'].v) : undefined, ui: dict('fx:ui:')
      },
      scenario: doc.recs['scenario'] ? clone(doc.recs['scenario'].v) : { text: '', updatedAt: null },
      reflections: doc.recs['reflections'] ? clone(doc.recs['reflections'].v) : null
    };
    if (out.farmingExtra.target === undefined) delete out.farmingExtra.target;
    for (const l of LISTS) out[l] = clone(doc.lists[l] || []);
    return out;
  }

  return { TOMB_TTL, isEmpty, pickLegacy, extract, emptyDoc, build, merge, apply, sameValues, sameDoc, recT };
});
