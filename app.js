/* Film English — watch films 30 min/day to learn English.
 * Plan: from tomorrow (Sun 8 Nov 2026) to 29 Esfand 1405 (Sat 20 Mar 2027),
 * sessions on Saturday, Monday, Wednesday, Friday.
 * All data is stored locally in the browser (localStorage). */
(() => {
  'use strict';

  // ---------------- constants ----------------
  const PLAN_START = '2026-11-08';            // tomorrow
  const PLAN_END = '2027-03-20';              // 29 Esfand 1405, the last day before Nowruz
  const SESSION_WEEKDAYS = [6, 1, 3, 5];      // Sat, Mon, Wed, Fri (JS: Sun=0)
  const DEFAULT_RUNTIME = 120;                // used when runtime is unknown
  const STORE_KEY = 'filmEnglish.v1';

  // ---------------- state ----------------
  const defaultState = () => ({
    movies: [],     // {id,title,year,country,poster,backdrop,runtime,imdbId,type,done,doneAt,addedAt}
    logs: {},       // 'YYYY-MM-DD' -> {movieId, minutes, words, note}
    settings: { tmdbKey: '', sessionMinutes: 30 },
    timer: { running: false, startedAt: 0, accumulated: 0, date: '' },
  });
  let state = load();

  function load() {
    try {
      const raw = localStorage.getItem(STORE_KEY);
      if (!raw) return defaultState();
      const s = JSON.parse(raw);
      const d = defaultState();
      return { ...d, ...s, settings: { ...d.settings, ...(s.settings || {}) }, timer: { ...d.timer, ...(s.timer || {}) } };
    } catch { return defaultState(); }
  }
  function save() {
    try { localStorage.setItem(STORE_KEY, JSON.stringify(state)); } catch { toast('Could not save (storage blocked)'); }
  }

  // ---------------- helpers ----------------
  const $ = (sel, root = document) => root.querySelector(sel);
  const esc = (s) => String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  const uid = () => Math.random().toString(36).slice(2, 10) + Date.now().toString(36);
  const pad = (n) => String(n).padStart(2, '0');
  const ymd = (d) => `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
  const parse = (s) => { const [y, m, d] = s.split('-').map(Number); return new Date(y, m - 1, d); };
  const todayStr = () => ymd(new Date());
  const sessionLen = () => Math.max(5, Number(state.settings.sessionMinutes) || 30);
  const fmtDate = (s, opts = { weekday: 'short', month: 'short', day: 'numeric' }) => parse(s).toLocaleDateString('en-US', opts);
  const fmtPersian = (s) => {
    try { return new Intl.DateTimeFormat('en-u-ca-persian', { day: 'numeric', month: 'short' }).format(parse(s)); }
    catch { return ''; }
  };
  const fmtHM = (min) => {
    min = Math.max(0, Math.round(min));
    const h = Math.floor(min / 60), m = min % 60;
    return h ? `${h}h ${pad(m)}m` : `${m}m`;
  };
  const fmtClock = (min) => { min = Math.max(0, Math.round(min)); return `${Math.floor(min / 60)}:${pad(min % 60)}:00`; };

  let toastTimer;
  function toast(msg) {
    const t = $('#toast'); t.textContent = msg; t.classList.add('show');
    clearTimeout(toastTimer); toastTimer = setTimeout(() => t.classList.remove('show'), 2600);
  }

  // ---------------- plan ----------------
  const SESSION_DATES = (() => {
    const out = []; const end = parse(PLAN_END);
    for (let d = parse(PLAN_START); d <= end; d.setDate(d.getDate() + 1)) {
      if (SESSION_WEEKDAYS.includes(d.getDay())) out.push(ymd(d));
    }
    return out;
  })();
  const isSessionDay = (s) => SESSION_DATES.includes(s);

  const watchedMin = (movieId) => Object.values(state.logs).reduce((a, l) => a + (l.movieId === movieId ? Number(l.minutes) || 0 : 0), 0);
  const movieById = (id) => state.movies.find((m) => m.id === id);
  const queue = () => state.movies.filter((m) => !m.done);
  const current = () => queue()[0] || null;
  const runtimeOf = (m) => Number(m.runtime) || DEFAULT_RUNTIME;

  /** Projects which film lands on each upcoming, not-yet-logged session date. */
  function projection() {
    const today = todayStr();
    const upcoming = SESSION_DATES.filter((d) => d >= today && !state.logs[d]);
    const map = {}; let i = 0;
    for (const m of queue()) {
      let remaining = Math.max(0, runtimeOf(m) - watchedMin(m.id));
      if (remaining === 0) remaining = 1; // still needs to be ticked
      const first = upcoming[i];
      while (remaining > 0 && i < upcoming.length) { map[upcoming[i]] = m.id; remaining -= sessionLen(); i++; }
      m._eta = upcoming[i - 1] || null; m._start = first || null;
      if (i >= upcoming.length) break;
    }
    return map;
  }

  // ---------------- movie search ----------------
  const hiRes = (url, w = 600) => url ? url.replace(/\._V1_.*?\.jpg$/, `._V1_SX${w}.jpg`) : '';

  /** fetch + JSON with a time limit, so a slow or blocked site never hangs the app. */
  async function fetchJSON(url, opts = {}, timeoutMs = 12000) {
    const ctrl = new AbortController();
    const timer = setTimeout(() => ctrl.abort(), timeoutMs);
    try {
      const r = await fetch(url, { ...opts, signal: ctrl.signal });
      if (!r.ok) throw new Error(`HTTP ${r.status}`);
      return await r.json();
    } catch (e) {
      throw e.name === 'AbortError' ? new Error('timed out') : e;
    } finally { clearTimeout(timer); }
  }

  /** Facts from the Wikidata entity API (fast, same servers as Wikipedia). */
  async function wikidataEntity(qid) {
    if (!/^Q\d+$/.test(qid)) return {};
    const api = 'https://www.wikidata.org/w/api.php?format=json&origin=*&action=wbgetentities';
    const d = await fetchJSON(`${api}&ids=${qid}&props=claims`);
    const claims = d.entities?.[qid]?.claims || {};
    const vals = (p) => (claims[p] || []).filter((c) => c.rank !== 'deprecated').map((c) => c.mainsnak?.datavalue?.value).filter((v) => v != null);
    const years = vals('P577').map((v) => (v.time || '').slice(1, 5)).filter((y) => /^\d{4}$/.test(y)).sort();
    const durs = vals('P2047').map((v) => Number(v.amount)).filter((n) => n > 0);
    const imdb = vals('P345').find((v) => typeof v === 'string' && v.startsWith('tt')) || '';
    const countryIds = [...new Set(vals('P495').map((v) => v.id).filter(Boolean))].slice(0, 6);
    let country = '';
    if (countryIds.length) {
      try {
        const c = await fetchJSON(`${api}&ids=${countryIds.join('|')}&props=labels&languages=en`);
        country = countryIds.map((id) => c.entities?.[id]?.labels?.en?.value).filter(Boolean).join(', ');
      } catch { /* labels optional */ }
    }
    return { year: years[0] || '', runtime: durs.length ? Math.round(Math.max(...durs)) : '', imdbId: imdb, country };
  }

  function tmdbFetch(path, params = {}) {
    const key = state.settings.tmdbKey.trim();
    const u = new URL(`https://api.themoviedb.org/3${path}`);
    Object.entries(params).forEach(([k, v]) => u.searchParams.set(k, v));
    const opts = {};
    if (key.length > 40) opts.headers = { Authorization: `Bearer ${key}` };
    else u.searchParams.set('api_key', key);
    return fetchJSON(u, opts);
  }
  const TMDB_IMG = 'https://image.tmdb.org/t/p/';

  async function searchTMDB(q) {
    const data = await tmdbFetch('/search/movie', { query: q, include_adult: 'false' });
    return (data.results || []).slice(0, 8).map((r) => ({
      source: 'tmdb', tmdbId: r.id, title: r.title,
      year: (r.release_date || '').slice(0, 4),
      poster: r.poster_path ? TMDB_IMG + 'w342' + r.poster_path : '',
      backdrop: r.backdrop_path ? TMDB_IMG + 'w1280' + r.backdrop_path : '',
      sub: r.original_title && r.original_title !== r.title ? r.original_title : '',
    }));
  }
  async function detailsTMDB(r) {
    const d = await tmdbFetch(`/movie/${r.tmdbId}`);
    return {
      ...r, runtime: d.runtime || '', imdbId: d.imdb_id || '',
      country: (d.production_countries || []).map((c) => c.name).join(', '),
      poster: d.poster_path ? TMDB_IMG + 'w500' + d.poster_path : r.poster,
      backdrop: d.backdrop_path ? TMDB_IMG + 'original' + d.backdrop_path : r.backdrop,
    };
  }

  async function searchIMDb(q) {
    const clean = q.trim().toLowerCase();
    const data = await fetchJSON(`https://v2.sg.media-imdb.com/suggestion/${encodeURIComponent(clean[0])}/${encodeURIComponent(clean)}.json`);
    const okTypes = ['movie', 'tvMovie', 'tvSeries', 'tvMiniSeries', 'short', 'video'];
    return (data.d || []).filter((x) => x.id && x.id.startsWith('tt') && (!x.qid || okTypes.includes(x.qid))).slice(0, 8).map((x) => ({
      source: 'imdb', imdbId: x.id, title: x.l, year: x.y ? String(x.y) : '',
      poster: x.i ? hiRes(x.i.imageUrl, 342) : '', backdrop: x.i ? hiRes(x.i.imageUrl, 1200) : '',
      sub: [x.q, x.s].filter(Boolean).join(' · '), type: x.qid || '',
    }));
  }

  async function sparql(query) {
    const u = 'https://query.wikidata.org/sparql?format=json&query=' + encodeURIComponent(query);
    return (await fetchJSON(u, { headers: { Accept: 'application/sparql-results+json' } })).results.bindings;
  }

  /** Country, runtime, year and IMDb id from Wikidata, by Wikidata item id (Q…) or IMDb id (tt…). */
  async function wikidataFacts({ qid, imdbId }) {
    let subj, bind = '';
    if (qid && /^Q\d+$/.test(qid)) subj = 'wd:' + qid;
    else if (imdbId && /^tt\d+$/.test(imdbId)) { subj = '?item'; bind = `?item wdt:P345 "${imdbId}" .`; }
    else return {};
    const rows = await sparql(`SELECT ?countryLabel ?dur ?date ?imdb WHERE {
      ${bind}
      OPTIONAL { ${subj} wdt:P495 ?country . }
      OPTIONAL { ${subj} wdt:P2047 ?dur . }
      OPTIONAL { ${subj} wdt:P577 ?date . }
      OPTIONAL { ${subj} wdt:P345 ?imdb . }
      SERVICE wikibase:label { bd:serviceParam wikibase:language "en". } } LIMIT 80`);
    const countries = [...new Set(rows.map((r) => r.countryLabel?.value).filter(Boolean))];
    const durs = rows.map((r) => Number(r.dur?.value)).filter((n) => n > 0);
    const years = rows.map((r) => (r.date?.value || '').slice(0, 4)).filter(Boolean).sort();
    const imdb = rows.map((r) => r.imdb?.value).find((x) => x && x.startsWith('tt')) || '';
    return { country: countries.join(', '), runtime: durs.length ? Math.round(Math.max(...durs)) : '', year: years[0] || '', imdbId: imdb };
  }

  // ---- Wikipedia (default search): title, description, infobox poster ----
  async function wikiQuery(search) {
    const u = new URL('https://en.wikipedia.org/w/api.php');
    Object.entries({
      action: 'query', format: 'json', formatversion: '2', origin: '*',
      generator: 'search', gsrsearch: search, gsrlimit: '10', gsrnamespace: '0',
      prop: 'pageimages|description|pageprops', piprop: 'thumbnail|original', pithumbsize: '600', pilicense: 'any',
      ppprop: 'wikibase_item|disambiguation',
    }).forEach(([k, v]) => u.searchParams.set(k, v));
    const d = await fetchJSON(u);
    return (d.query?.pages || []).filter((p) => !('disambiguation' in (p.pageprops || {}))).sort((a, b) => a.index - b.index);
  }

  async function searchWikipedia(q) {
    let pages = await wikiQuery(`${q} hastemplate:"Infobox film"`);
    if (!pages.length) pages = await wikiQuery(`${q} film`);
    return pages.slice(0, 8).map((p) => {
      const yearMatch = (p.description || '').match(/\b(18|19|20)\d{2}\b/) || p.title.match(/\((\d{4})[^)]*\)$/);
      const img = p.thumbnail?.source || p.original?.source || '';
      return {
        source: 'wikipedia',
        title: p.title.replace(/\s*\([^)]*\b(film|movie|series|miniseries)\)$/i, ''),
        year: yearMatch ? yearMatch[0].replace(/\D/g, '').slice(0, 4) : '',
        poster: img, backdrop: p.original?.source || img,
        wikidataId: p.pageprops?.wikibase_item || '',
        wikiUrl: 'https://en.wikipedia.org/wiki/' + encodeURIComponent(p.title.replace(/ /g, '_')),
        sub: p.description || '',
      };
    });
  }

  async function searchWikidata(q) {
    const s = await fetchJSON(`https://www.wikidata.org/w/api.php?action=query&list=search&srsearch=${encodeURIComponent(q + ' haswbstatement:P31=Q11424')}&srlimit=8&format=json&origin=*`);
    const ids = (s.query?.search || []).map((x) => x.title).filter((t) => /^Q\d+$/.test(t));
    if (!ids.length) return [];
    const rows = await sparql(`SELECT ?item ?itemLabel (MIN(?date) AS ?d) (GROUP_CONCAT(DISTINCT ?cl; separator=", ") AS ?countries)
      (SAMPLE(?imdb) AS ?im) (SAMPLE(?img) AS ?image) (MAX(?dur) AS ?du) WHERE {
      VALUES ?item { ${ids.map((i) => 'wd:' + i).join(' ')} }
      OPTIONAL { ?item wdt:P577 ?date . }
      OPTIONAL { ?item wdt:P495 ?c . ?c rdfs:label ?cl . FILTER(LANG(?cl) = "en") }
      OPTIONAL { ?item wdt:P345 ?imdb . }
      OPTIONAL { { ?item wdt:P3383 ?img . } UNION { ?item wdt:P18 ?img . } }
      OPTIONAL { ?item wdt:P2047 ?dur . }
      SERVICE wikibase:label { bd:serviceParam wikibase:language "en". }
    } GROUP BY ?item ?itemLabel`);
    const order = Object.fromEntries(ids.map((id, i) => [id, i]));
    return rows.map((r) => {
      const img = r.image?.value ? r.image.value.replace('http://', 'https://') + '?width=500' : '';
      return {
        source: 'wikidata', title: r.itemLabel.value, year: (r.d?.value || '').slice(0, 4),
        country: r.countries?.value || '', imdbId: r.im?.value || '', runtime: r.du?.value ? Math.round(+r.du.value) : '',
        poster: img, backdrop: img, sub: r.countries?.value || '', _o: order[r.item.value.split('/').pop()] ?? 99,
      };
    }).sort((a, b) => a._o - b._o);
  }

  async function searchMovies(q) {
    const errors = [];
    try { const r = await searchWikipedia(q); if (r.length) return r; } catch (e) { errors.push('Wikipedia: ' + e.message); }
    if (state.settings.tmdbKey.trim()) {
      try { const r = await searchTMDB(q); if (r.length) return r; } catch (e) { errors.push('TMDB: ' + e.message); }
    }
    try { const r = await searchIMDb(q); if (r.length) return r; } catch (e) { errors.push('IMDb: ' + e.message); }
    try { const r = await searchWikidata(q); if (r.length) return r; } catch (e) { errors.push('Wikidata: ' + e.message); }
    if (errors.length) throw new Error(errors.join(' | '));
    return [];
  }

  async function enrich(r) {
    let m = { ...r };
    if (m.wikidataId || (m.imdbId && (!m.country || !m.runtime))) {
      try {
        let w = {};
        if (m.wikidataId) { try { w = await wikidataEntity(m.wikidataId); } catch { /* fall back to SPARQL */ } }
        if (!w.country && !w.runtime) {
          try { w = { ...(await wikidataFacts({ qid: m.wikidataId, imdbId: m.imdbId })), ...Object.fromEntries(Object.entries(w).filter(([, v]) => v)) }; } catch { /* optional */ }
        }
        m.country = m.country || w.country || ''; m.runtime = m.runtime || w.runtime || '';
        m.year = m.year || w.year || ''; m.imdbId = m.imdbId || w.imdbId || '';
      } catch { /* optional */ }
    }
    try {
      if (r.source === 'tmdb') m = { ...m, ...(await detailsTMDB(r)) };
      else if (m.imdbId && state.settings.tmdbKey.trim()) {
        // With a TMDB key, swap in wide HD backdrops.
        const f = await tmdbFetch(`/find/${m.imdbId}`, { external_source: 'imdb_id' });
        const hit = (f.movie_results || [])[0];
        if (hit) {
          const t = await detailsTMDB({ ...m, tmdbId: hit.id });
          m = { ...m, backdrop: t.backdrop || m.backdrop, poster: m.poster || t.poster, country: m.country || t.country, runtime: m.runtime || t.runtime };
        }
      }
    } catch { /* keep going with what we have */ }
    return m;
  }

  function addMovie(m) {
    const movie = {
      id: uid(), title: m.title || 'Untitled', year: m.year || '', country: m.country || '',
      poster: m.poster || '', backdrop: m.backdrop || m.poster || '', runtime: m.runtime ? Number(m.runtime) : '',
      imdbId: m.imdbId || '', wikiUrl: m.wikiUrl || '', type: m.type || '', done: false, doneAt: '', addedAt: new Date().toISOString(),
    };
    state.movies.push(movie); save(); render();
    toast(`Added “${movie.title}”`);
    return movie;
  }

  // ---------------- timer ----------------
  const NATIVE = window.AndroidApp || null; // present inside the Android APK
  const nativeCancel = () => { try { NATIVE?.cancelAlarm(); } catch { /* ignore */ } };
  const timerElapsed = () => state.timer.accumulated + (state.timer.running ? Date.now() - state.timer.startedAt : 0);
  function timerStart() {
    if (state.timer.running) return;
    if (state.timer.date !== todayStr()) { state.timer.accumulated = 0; state.timer.date = todayStr(); }
    state.timer.running = true; state.timer.startedAt = Date.now(); state.timer.alerted = false; save();
    if (NATIVE) {
      try { NATIVE.requestNotifications(); NATIVE.scheduleAlarm(Date.now() + Math.max(0, sessionLen() * 60000 - state.timer.accumulated)); } catch { /* ignore */ }
    } else if ('Notification' in window && Notification.permission === 'default') Notification.requestPermission().catch(() => {});
    renderToday();
  }
  function timerPause() {
    if (!state.timer.running) return;
    state.timer.accumulated = timerElapsed(); state.timer.running = false; save(); nativeCancel(); renderToday();
  }
  function timerReset() { nativeCancel(); state.timer = { running: false, startedAt: 0, accumulated: 0, date: todayStr() }; save(); renderToday(); }

  function beep() {
    try {
      const ctx = new (window.AudioContext || window.webkitAudioContext)();
      [0, 0.35, 0.7].forEach((t) => {
        const o = ctx.createOscillator(), g = ctx.createGain();
        o.frequency.value = 660; o.connect(g); g.connect(ctx.destination);
        g.gain.setValueAtTime(0.25, ctx.currentTime + t); g.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + t + 0.3);
        o.start(ctx.currentTime + t); o.stop(ctx.currentTime + t + 0.3);
      });
    } catch { /* no audio */ }
    navigator.vibrate?.([300, 150, 300]);
  }

  function tickTimer() {
    const el = $('#timer-time'); if (!el) return;
    const total = sessionLen() * 60000;
    const left = Math.max(0, total - timerElapsed());
    const s = Math.ceil(left / 1000);
    el.textContent = `${pad(Math.floor(s / 60))}:${pad(s % 60)}`;
    const bar = $('#timer-bar');
    if (bar) bar.style.strokeDashoffset = String(CIRC * (left / total));
    if (state.timer.running && left === 0 && !state.timer.alerted) {
      state.timer.alerted = true; state.timer.accumulated = total; state.timer.running = false; save();
      beep();
      if ('Notification' in window && Notification.permission === 'granted') {
        try { new Notification('Session complete 🎬', { body: 'Your 30 minutes are done. Log your new words!', icon: 'icon.svg' }); } catch { /* ignore */ }
      }
      toast('Time is up! Log your session.');
      renderToday();
      openLog(todayStr());
    }
  }
  const CIRC = 2 * Math.PI * 90;
  setInterval(tickTimer, 1000);

  // ---------------- rendering ----------------
  function setWallpaper() {
    const m = current();
    const wp = $('#wallpaper');
    const img = m && (m.backdrop || m.poster);
    if (img) { wp.style.setProperty('--wp', `url("${img.replace(/"/g, '%22')}")`); wp.classList.add('has-image'); }
    else wp.classList.remove('has-image');
  }

  function posterImg(m, cls = 'poster') {
    return m.poster
      ? `<img class="${cls}" src="${esc(m.poster)}" alt="" loading="lazy" referrerpolicy="no-referrer" onerror="this.replaceWith(Object.assign(document.createElement('div'),{className:this.className}))">`
      : `<div class="${cls}"></div>`;
  }
  function metaChips(m) {
    return `<div class="meta">
      ${m.year ? `<span class="chip">📅 ${esc(m.year)}</span>` : ''}
      ${m.country ? `<span class="chip">🌍 ${esc(m.country)}</span>` : ''}
      ${m.runtime ? `<span class="chip">⏱ ${fmtHM(m.runtime)}</span>` : ''}
      ${m.wikiUrl ? `<a class="chip" href="${esc(m.wikiUrl)}" target="_blank" rel="noopener">W Wikipedia ↗</a>` : ''}
    </div>`;
  }
  function progressBar(m) {
    const w = watchedMin(m.id), rt = runtimeOf(m);
    const pct = m.done ? 100 : Math.min(100, (w / rt) * 100);
    return `<div class="progress"><i style="width:${pct.toFixed(1)}%"></i></div>
      <div class="small muted">${m.done ? `Finished ${m.doneAt ? fmtDate(m.doneAt) : ''}` : `Watched ${fmtHM(w)} of ${m.runtime ? fmtHM(rt) : '~' + fmtHM(rt)} · resume at <b>${fmtClock(w)}</b>`}</div>`;
  }

  function renderHeader() {
    const today = todayStr();
    const left = SESSION_DATES.filter((d) => d >= today);
    const next = left.find((d) => !state.logs[d]);
    $('#countdown').innerHTML = next
      ? `${next === today ? '<strong>Session today</strong>' : `Next: <strong>${fmtDate(next)}</strong>`}<br>${left.length} sessions left · until 29 Esfand`
      : today > PLAN_END ? '<strong>Plan complete</strong><br>Happy Nowruz!' : '<strong>All logged</strong>';
  }

  function renderToday() {
    const v = $('#view-today'); const today = todayStr(); const m = current();
    const sessionToday = isSessionDay(today); const log = state.logs[today];
    const beforeStart = today < PLAN_START;
    const nextDate = SESSION_DATES.find((d) => d > today);
    if (!state.timer.running && state.timer.date && state.timer.date !== today) state.timer = { running: false, startedAt: 0, accumulated: 0, date: today };
    let html = '';

    if (m) {
      html += `<div class="card hero">
        <div class="hero-bg" style="background-image:url('${esc((m.backdrop || m.poster || '').replace(/'/g, '%27'))}')"></div>
        <div class="hero-content"><button class="poster-btn" data-act="view-poster" data-id="${m.id}" aria-label="View poster">${posterImg(m)}</button>
          <div class="grow"><div class="now-badge">Now watching</div><h3>${esc(m.title)}</h3>${metaChips(m)}${progressBar(m)}</div>
        </div></div>`;
    } else {
      html += `<div class="card empty"><div class="big">🎬</div><h2>Add your first film</h2>
        <p class="muted">Type a film name and the app finds its poster, year and country.</p>
        <button class="btn primary" data-act="go-movies">Add films</button></div>`;
    }

    const banner = log
      ? `<span class="chip solid">✓ Logged today · ${fmtHM(log.minutes)}</span>`
      : sessionToday ? `<span class="chip solid">Today is a session day</span>`
      : `<span class="chip">Rest day · next session ${beforeStart ? fmtDate(SESSION_DATES[0]) : nextDate ? fmtDate(nextDate) : '—'}</span>`;

    html += `<div class="card timer">
      <div class="row center" style="margin-bottom:12px">${banner}</div>
      <div class="ring">
        <svg viewBox="0 0 200 200"><circle class="track" cx="100" cy="100" r="90"/><circle id="timer-bar" class="bar" cx="100" cy="100" r="90" stroke-dasharray="${CIRC}" stroke-dashoffset="${CIRC}"/></svg>
        <div class="time"><div><span id="timer-time">${pad(sessionLen())}:00</span><small>${state.timer.running ? 'watching' : 'minutes'}</small></div></div>
      </div>
      <div class="row center">
        ${state.timer.running
          ? `<button class="btn primary" data-act="pause">❚❚ Pause</button>`
          : `<button class="btn primary" data-act="start" ${m ? '' : 'disabled'}>▶ ${timerElapsed() > 0 ? 'Resume' : `Start ${sessionLen()} min`}</button>`}
        <button class="btn" data-act="reset">↺ Reset</button>
        <button class="btn" data-act="log" ${m || log ? '' : 'disabled'}>✎ Log session</button>
      </div>
      ${m ? `<div class="row center" style="margin-top:12px"><button class="btn ghost sm" data-act="finish" data-id="${m.id}">✓ I finished this film</button></div>` : ''}
    </div>`;

    if (log && log.words) {
      html += `<div class="card"><h2>Today's <span class="accent">words</span></h2><pre style="white-space:pre-wrap;font:inherit;margin:0">${esc(log.words)}</pre></div>`;
    }

    const upNext = queue().slice(1, 4);
    if (upNext.length) {
      html += `<div class="section-title"><h2>Up <span class="accent">next</span></h2></div><div class="card">${upNext.map((x) => `
        <div class="movie">${posterImg(x, 'poster sm')}<div class="info"><div class="title">${esc(x.title)}</div>${metaChips(x)}</div></div>`).join('')}</div>`;
    }

    html += `<div class="card small muted" style="margin-top:12px">💡 Tip: watch with <b>English subtitles</b>, pause on new phrases, repeat lines out loud (shadowing) to train your accent, and write every new word or expression in the log.</div>`;
    v.innerHTML = html;
    tickTimer();
  }

  function renderSchedule() {
    const v = $('#view-schedule'); const today = todayStr(); const proj = projection();
    const logged = SESSION_DATES.filter((d) => state.logs[d]).length;
    const missed = SESSION_DATES.filter((d) => d < today && !state.logs[d]).length;
    const totalMin = Object.values(state.logs).reduce((a, l) => a + (Number(l.minutes) || 0), 0);
    const finished = state.movies.filter((m) => m.done).length;

    let html = `<h2>Your <span class="accent">plan</span></h2>
      <p class="muted small">${fmtDate(PLAN_START, { month: 'long', day: 'numeric', year: 'numeric' })} → ${fmtDate(PLAN_END, { month: 'long', day: 'numeric', year: 'numeric' })} (29 Esfand 1405) · Sat, Mon, Wed, Fri · ${sessionLen()} min each · ${SESSION_DATES.length} sessions = ${fmtHM(SESSION_DATES.length * sessionLen())}</p>
      <div class="stats">
        <div class="card stat"><b>${logged}/${SESSION_DATES.length}</b><span>Sessions</span></div>
        <div class="card stat"><b>${fmtHM(totalMin)}</b><span>Watched</span></div>
        <div class="card stat"><b>${finished}</b><span>Films done</span></div>
        <div class="card stat"><b>${missed}</b><span>Missed</span></div>
      </div>
      <div class="progress" style="margin-top:14px"><i style="width:${(logged / SESSION_DATES.length * 100).toFixed(1)}%"></i></div>`;

    const months = {};
    SESSION_DATES.forEach((d) => { (months[d.slice(0, 7)] ||= []).push(d); });
    for (const [key, dates] of Object.entries(months)) {
      const label = parse(key + '-01').toLocaleDateString('en-US', { month: 'long', year: 'numeric' });
      html += `<div class="month"><h3>${label}<span>${dates.filter((d) => state.logs[d]).length}/${dates.length} done</span></h3><div class="days">`;
      for (const d of dates) {
        const log = state.logs[d];
        const cls = log ? 'done' : d === today ? 'today' : d < today ? 'missed' : '';
        const mv = log ? movieById(log.movieId) : movieById(proj[d]);
        const status = log ? `<span class="status done">✓ ${fmtHM(log.minutes)}</span>`
          : d === today ? '<span class="status today">Today</span>'
          : d < today ? '<span class="status missed">Missed</span>' : '<span class="status">Planned</span>';
        const dt = parse(d);
        html += `<button class="day ${cls}" data-act="open-day" data-date="${d}">
          <div class="d"><span>${dt.toLocaleDateString('en-US', { weekday: 'short' })}</span><b>${dt.getDate()}</b></div>
          <div class="what"><div>${mv ? esc(mv.title) : '<span class="muted">No film yet</span>'}</div>
            <div class="small muted">${fmtPersian(d)}${log && log.words ? ' · 📝 ' + log.words.split('\n').filter(Boolean).length + ' notes' : ''}</div></div>
          ${status}</button>`;
      }
      html += '</div></div>';
    }
    v.innerHTML = html;
  }

  let searchSeq = 0, searchDebounce;
  function renderMovies() {
    const v = $('#view-movies'); projection();
    const q = queue(); const done = state.movies.filter((m) => m.done);
    const prev = $('#movie-search')?.value || '';
    v.innerHTML = `<h2>Add a <span class="accent">film</span></h2>
      <div class="card">
        <div class="search-wrap"><svg viewBox="0 0 24 24"><circle cx="11" cy="11" r="7"/><path d="m20 20-3.5-3.5"/></svg>
          <input id="movie-search" type="search" placeholder="Type a film name… e.g. The Social Network" autocomplete="off" value="${esc(prev)}"></div>
        <div id="results" class="results"></div>
        <div class="row" style="margin-top:10px"><button class="btn ghost sm" data-act="manual">+ Add manually</button></div>
      </div>

      <div class="section-title"><h2>Watch <span class="accent">queue</span></h2><span class="muted small">${q.length} film${q.length === 1 ? '' : 's'}</span></div>
      <div class="card">${q.length ? q.map((m, i) => movieRow(m, i, q.length)).join('') : '<p class="muted" style="margin:0">Your queue is empty. Search above to add films.</p>'}</div>

      ${done.length ? `<div class="section-title"><h2>Finished <span class="accent">✓</span></h2><span class="muted small">${done.length}</span></div>
      <div class="card">${done.map((m) => movieRow(m)).join('')}</div>` : ''}`;
  }
  function movieRow(m, i = -1, n = 0) {
    const eta = !m.done && m._eta ? `<div class="small muted">${i === 0 ? 'Watching now' : `Starts ${m._start ? fmtDate(m._start) : '—'}`} · est. finish ${fmtDate(m._eta)}</div>`
      : !m.done && i >= 0 ? '<div class="small muted">Beyond 29 Esfand at this pace</div>' : '';
    return `<div class="movie ${m.done ? 'done' : ''}">
      <button class="check ${m.done ? 'on' : ''}" data-act="${m.done ? 'unfinish' : 'finish'}" data-id="${m.id}" title="${m.done ? 'Mark as not finished' : 'Mark as finished'}"><svg viewBox="0 0 24 24"><path d="m5 12 5 5 9-10"/></svg></button>
      ${posterImg(m, 'poster sm')}
      <div class="info">${i === 0 ? '<div class="now-badge">Now watching</div>' : ''}<div class="title">${esc(m.title)}</div>${metaChips(m)}${progressBar(m)}${eta}</div>
      <div class="actions">
        ${i > 0 ? `<button class="btn icon sm" data-act="up" data-id="${m.id}" title="Move up">▲</button>` : ''}
        ${i >= 0 && i < n - 1 ? `<button class="btn icon sm" data-act="down" data-id="${m.id}" title="Move down">▼</button>` : ''}
        <button class="btn icon sm" data-act="edit" data-id="${m.id}" title="Edit">✎</button>
      </div></div>`;
  }

  async function runSearch(q) {
    const box = $('#results'); if (!box) return;
    q = q.trim();
    if (q.length < 2) { box.innerHTML = ''; return; }
    const seq = ++searchSeq;
    box.innerHTML = '<div class="spinner"></div>';
    try {
      const results = await searchMovies(q);
      if (seq !== searchSeq) return;
      lastResults = results;
      box.innerHTML = results.length ? results.map((r, i) => `
        <button class="result" data-act="pick" data-i="${i}">${posterImg(r, 'poster sm')}
          <div class="grow"><div class="t">${esc(r.title)} ${r.year ? `<span class="muted">(${esc(r.year)})</span>` : ''}</div>
          <div class="small muted">${esc(r.sub || '')}</div></div><span class="chip solid">+ Add</span></button>`).join('')
        : `<p class="muted small">No results. Check spelling or <a href="#" data-act="manual">add it manually</a>.</p>`;
    } catch (e) {
      if (seq !== searchSeq) return;
      box.innerHTML = `<p class="muted small">Search failed (${esc(e.message)}). Check your internet connection, or <a href="#" data-act="manual">add it manually</a>.</p>`;
    }
  }
  let lastResults = [];

  function renderWords() {
    const v = $('#view-words');
    const filter = ($('#word-filter')?.value || '').toLowerCase();
    const entries = Object.entries(state.logs).filter(([, l]) => (l.words || l.note)).sort((a, b) => b[0].localeCompare(a[0]))
      .filter(([, l]) => !filter || (l.words + ' ' + (l.note || '')).toLowerCase().includes(filter));
    const count = Object.values(state.logs).reduce((a, l) => a + (l.words ? l.words.split('\n').filter((x) => x.trim()).length : 0), 0);
    v.innerHTML = `<div class="row between"><h2 style="margin:0">Words &amp; <span class="accent">expressions</span></h2><span class="chip">${count} saved</span></div>
      <div class="card" style="margin-top:12px"><input id="word-filter" type="search" placeholder="Search your notes…" value="${esc(filter)}"></div>
      <div class="card">${entries.length ? entries.map(([d, l]) => {
        const m = movieById(l.movieId);
        return `<div class="word-entry"><div class="row between"><b>${m ? esc(m.title) : 'Film'}</b><a href="#" class="small" data-act="open-day" data-date="${d}">${fmtDate(d)} · ${fmtPersian(d)}</a></div>
          ${l.words ? `<pre>${esc(l.words)}</pre>` : ''}${l.note ? `<div class="small muted" style="margin-top:6px">${esc(l.note)}</div>` : ''}</div>`;
      }).join('') : '<p class="muted" style="margin:0">Nothing yet. After each session, write the new words, phrases and idioms you heard — one per line.</p>'}</div>
      ${count ? '<div class="row" style="margin-top:12px"><button class="btn sm" data-act="export-words">⬇ Export words (.txt)</button></div>' : ''}`;
    const f = $('#word-filter');
    if (filter) { f.focus(); f.setSelectionRange(f.value.length, f.value.length); }
  }

  function renderSettings() {
    const v = $('#view-settings');
    v.innerHTML = `<h2><span class="accent">Settings</span></h2>
      <div class="card">
        <label for="set-min">Session length (minutes)</label>
        <input id="set-min" type="number" min="5" max="180" value="${sessionLen()}">
        <label for="set-tmdb">TMDB API key (optional)</label>
        <input id="set-tmdb" type="text" placeholder="Paste your TMDB key for HD wallpapers" value="${esc(state.settings.tmdbKey)}" autocomplete="off">
        <p class="small muted">Films are searched on <b>Wikipedia</b> (title, poster from the article) and Wikidata (year, country, runtime). IMDb is used as a backup. A free key from <a href="https://www.themoviedb.org/settings/api" target="_blank" rel="noopener">themoviedb.org</a> adds wide HD backdrops.</p>
        <button class="btn primary" data-act="save-settings">Save</button>
      </div>
      <div class="card">
        <h3>Backup</h3>
        <p class="small muted">Your data lives only in this browser. Export a backup now and then.</p>
        <div class="row"><button class="btn" data-act="export">⬇ Export backup</button>
          <label class="btn" style="margin:0;color:var(--text)">⬆ Import backup<input id="import-file" type="file" accept="application/json" hidden></label></div>
      </div>
      <div class="card">
        <h3>Plan</h3>
        <p class="small muted" style="margin:0">Start: ${fmtDate(PLAN_START, { weekday: 'long', month: 'long', day: 'numeric', year: 'numeric' })}<br>
        End: ${fmtDate(PLAN_END, { weekday: 'long', month: 'long', day: 'numeric', year: 'numeric' })} — 29 Esfand 1405, before Nowruz<br>
        Days: Saturday · Monday · Wednesday · Friday<br>Total: ${SESSION_DATES.length} sessions</p>
      </div>
      <div class="card"><button class="btn danger sm" data-act="wipe">Delete all data</button></div>`;
  }

  function render() {
    renderHeader(); setWallpaper();
    const active = document.querySelector('.view.active')?.id.replace('view-', '') || 'today';
    ({ today: renderToday, schedule: renderSchedule, movies: renderMovies, words: renderWords, settings: renderSettings })[active]();
  }

  function showView(name) {
    document.querySelectorAll('.view').forEach((v) => v.classList.toggle('active', v.id === 'view-' + name));
    document.querySelectorAll('.tabbar button').forEach((b) => b.classList.toggle('active', b.dataset.view === name));
    try { sessionStorage.setItem('fe.view', name); } catch { /* ignore */ }
    window.scrollTo({ top: 0 }); render();
  }

  // ---------------- modals ----------------
  const modal = $('#modal');
  function openModal(html) { $('#modal-body').innerHTML = html; modal.showModal(); }
  function closeModal() { modal.close(); }

  function openLog(date) {
    const log = state.logs[date] || {};
    const cur = current();
    const movieId = log.movieId || cur?.id || '';
    const elapsed = date === todayStr() && state.timer.date === date ? Math.round(timerElapsed() / 60000) : 0;
    const minutes = log.minutes ?? (elapsed || sessionLen());
    const options = state.movies.filter((m) => !m.done || m.id === movieId)
      .map((m) => `<option value="${m.id}" ${m.id === movieId ? 'selected' : ''}>${esc(m.title)}${m.year ? ` (${esc(m.year)})` : ''}</option>`).join('');
    openModal(`<h2>Session · <span class="accent">${fmtDate(date)}</span></h2>
      <p class="small muted" style="margin-top:-6px">${fmtPersian(date)} ${isSessionDay(date) ? '· planned session' : '· extra day'}</p>
      ${state.movies.length ? `<label for="log-movie">Film</label><select id="log-movie">${options}</select>
      <label for="log-min">Minutes watched</label><input id="log-min" type="number" min="0" max="600" value="${minutes}">
      <label for="log-words">New words &amp; expressions (one per line)</label>
      <textarea id="log-words" placeholder="e.g.&#10;to call it a day — to stop working&#10;bail out — to rescue&#10;'gonna' = going to">${esc(log.words || '')}</textarea>
      <label for="log-note">Notes (accent, scenes, anything)</label>
      <input id="log-note" type="text" value="${esc(log.note || '')}" placeholder="Optional">
      <div class="row between" style="margin-top:16px">
        ${state.logs[date] ? `<button class="btn danger sm" data-act="del-log" data-date="${date}">Delete</button>` : '<span></span>'}
        <div class="row"><button class="btn" data-act="close">Cancel</button><button class="btn primary" data-act="save-log" data-date="${date}">Save</button></div>
      </div>` : `<p class="muted">Add a film first.</p><button class="btn" data-act="close">Close</button>`}`);
  }

  function openEdit(id) {
    const m = id ? movieById(id) : { title: '', year: '', country: '', runtime: '', poster: '', backdrop: '' };
    openModal(`<h2>${id ? 'Edit' : 'Add'} <span class="accent">film</span></h2>
      <label>Title</label><input id="ed-title" value="${esc(m.title)}">
      <div class="row"><div class="grow"><label>Year</label><input id="ed-year" value="${esc(m.year)}"></div>
        <div class="grow"><label>Runtime (min)</label><input id="ed-rt" type="number" value="${esc(m.runtime)}"></div></div>
      <label>Country</label><input id="ed-country" value="${esc(m.country)}">
      <label>Poster image URL</label><input id="ed-poster" value="${esc(m.poster)}">
      <label>Wallpaper image URL</label><input id="ed-bd" value="${esc(m.backdrop)}">
      <div class="row between" style="margin-top:16px">
        ${id ? `<button class="btn danger sm" data-act="delete-movie" data-id="${id}">Remove</button>` : '<span></span>'}
        <div class="row"><button class="btn" data-act="close">Cancel</button><button class="btn primary" data-act="save-movie" data-id="${id || ''}">Save</button></div>
      </div>`);
  }

  function openDay(date) {
    if (date > todayStr() && !state.logs[date]) {
      const proj = projection(); const m = movieById(proj[date]);
      openModal(`<h2>${fmtDate(date, { weekday: 'long', month: 'long', day: 'numeric' })}</h2>
        <p class="muted">${fmtPersian(date)} · planned session</p>
        ${m ? `<div class="movie">${posterImg(m, 'poster sm')}<div class="info"><div class="title">${esc(m.title)}</div>${metaChips(m)}</div></div>` : '<p>No film planned yet — add more films to your queue.</p>'}
        <div class="row" style="margin-top:16px;justify-content:flex-end"><button class="btn" data-act="close">Close</button></div>`);
    } else openLog(date);
  }

  function download(name, text, type = 'application/json') {
    if (NATIVE) { try { NATIVE.saveFile(name, text, type); } catch { toast('Could not save file'); } return; }
    const a = document.createElement('a');
    a.href = URL.createObjectURL(new Blob([text], { type })); a.download = name;
    document.body.appendChild(a); a.click(); a.remove(); setTimeout(() => URL.revokeObjectURL(a.href), 1000);
  }

  function finishMovie(id) {
    const m = movieById(id); if (!m) return;
    m.done = true; m.doneAt = todayStr();
    // keep finished films after the queue
    state.movies = [...state.movies.filter((x) => !x.done), ...state.movies.filter((x) => x.done)];
    save(); render();
    const nxt = current();
    toast(`✓ “${m.title}” finished!${nxt ? ` Next: ${nxt.title}` : ' Add your next film.'}`);
  }

  // ---------------- events ----------------
  document.addEventListener('click', async (e) => {
    const tab = e.target.closest('.tabbar button');
    if (tab) return showView(tab.dataset.view);
    const el = e.target.closest('[data-act]'); if (!el) return;
    const act = el.dataset.act, id = el.dataset.id;
    if (el.tagName === 'A') e.preventDefault();

    switch (act) {
      case 'go-movies': showView('movies'); setTimeout(() => $('#movie-search')?.focus(), 50); break;
      case 'start': timerStart(); break;
      case 'pause': timerPause(); break;
      case 'reset': timerReset(); break;
      case 'log': openLog(todayStr()); break;
      case 'finish':
        if (confirm(`Mark “${movieById(id)?.title}” as finished?`)) finishMovie(id);
        break;
      case 'unfinish': { const m = movieById(id); m.done = false; m.doneAt = ''; save(); render(); break; }
      case 'up': case 'down': {
        const i = state.movies.findIndex((m) => m.id === id); const j = act === 'up' ? i - 1 : i + 1;
        if (j >= 0 && j < state.movies.length && !state.movies[j].done) {
          [state.movies[i], state.movies[j]] = [state.movies[j], state.movies[i]]; save(); render();
        }
        break;
      }
      case 'edit': openEdit(id); break;
      case 'view-poster': {
        const m = movieById(id); const src = m && (m.poster || m.backdrop); if (!src) break;
        openModal(`<img class="poster-full" src="${esc(m.backdrop && m.backdrop !== m.poster ? m.poster || m.backdrop : src)}" alt="${esc(m.title)} poster" referrerpolicy="no-referrer">
          <h2 style="margin-top:12px">${esc(m.title)}</h2>${metaChips(m)}
          <div class="row" style="justify-content:flex-end;margin-top:12px"><button class="btn" data-act="close">Close</button></div>`);
        break;
      }
      case 'manual': openEdit(null); break;
      case 'close': closeModal(); break;
      case 'pick': {
        const r = lastResults[Number(el.dataset.i)]; if (!r) break;
        // Add immediately with what the search returned, then fill in country/runtime in the background.
        const movie = addMovie(r);
        const s = $('#movie-search'); if (s) { s.value = ''; } $('#results') && ($('#results').innerHTML = '');
        enrich(r).then((m) => {
          const target = movieById(movie.id); if (!target) return;
          for (const k of ['year', 'country', 'runtime', 'imdbId', 'poster', 'backdrop', 'wikiUrl']) {
            if (m[k] && (!target[k] || k === 'backdrop' || k === 'runtime')) target[k] = k === 'runtime' ? Number(m[k]) : m[k];
          }
          save(); render();
        }).catch(() => { /* details are optional; the film is already added */ });
        break;
      }
      case 'save-movie': {
        const data = {
          title: $('#ed-title').value.trim() || 'Untitled', year: $('#ed-year').value.trim(), country: $('#ed-country').value.trim(),
          runtime: Number($('#ed-rt').value) || '', poster: $('#ed-poster').value.trim(), backdrop: $('#ed-bd').value.trim(),
        };
        if (id) Object.assign(movieById(id), data); else addMovie(data);
        save(); closeModal(); render(); break;
      }
      case 'delete-movie':
        if (confirm('Remove this film? Its session logs stay in your history.')) {
          state.movies = state.movies.filter((m) => m.id !== id); save(); closeModal(); render();
        }
        break;
      case 'open-day': openDay(el.dataset.date); break;
      case 'save-log': {
        const date = el.dataset.date;
        state.logs[date] = {
          movieId: $('#log-movie').value, minutes: Math.max(0, Number($('#log-min').value) || 0),
          words: $('#log-words').value.trim(), note: $('#log-note').value.trim(),
        };
        if (date === todayStr()) { nativeCancel(); state.timer = { running: false, startedAt: 0, accumulated: 0, date }; }
        save(); closeModal(); render();
        const m = movieById(state.logs[date].movieId);
        if (m && m.runtime && watchedMin(m.id) >= m.runtime && !m.done) {
          if (confirm(`You've reached the end of “${m.title}”. Tick it as finished and move to the next film?`)) finishMovie(m.id);
        } else toast('Session saved ✓');
        break;
      }
      case 'del-log':
        if (confirm('Delete this session log?')) { delete state.logs[el.dataset.date]; save(); closeModal(); render(); }
        break;
      case 'save-settings':
        state.settings.sessionMinutes = Math.min(180, Math.max(5, Number($('#set-min').value) || 30));
        state.settings.tmdbKey = $('#set-tmdb').value.trim();
        save(); render(); toast('Settings saved'); break;
      case 'export': download(`film-english-backup-${todayStr()}.json`, JSON.stringify(state, null, 2)); break;
      case 'export-words': {
        const txt = Object.entries(state.logs).sort((a, b) => a[0].localeCompare(b[0])).filter(([, l]) => l.words)
          .map(([d, l]) => `## ${d} — ${movieById(l.movieId)?.title || ''}\n${l.words}\n`).join('\n');
        download(`film-english-words-${todayStr()}.txt`, txt, 'text/plain'); break;
      }
      case 'wipe':
        if (confirm('Delete ALL films, logs and words? This cannot be undone.')) { state = defaultState(); save(); render(); toast('All data deleted'); }
        break;
    }
  });

  document.addEventListener('input', (e) => {
    if (e.target.id === 'movie-search') {
      clearTimeout(searchDebounce); const q = e.target.value;
      searchDebounce = setTimeout(() => runSearch(q), 350);
    } else if (e.target.id === 'word-filter') {
      clearTimeout(searchDebounce); searchDebounce = setTimeout(renderWords, 250);
    }
  });
  document.addEventListener('keydown', (e) => {
    if (e.target.id === 'movie-search' && e.key === 'Enter') { clearTimeout(searchDebounce); runSearch(e.target.value); }
  });
  document.addEventListener('change', (e) => {
    if (e.target.id !== 'import-file') return;
    const f = e.target.files[0]; if (!f) return;
    f.text().then((t) => {
      const s = JSON.parse(t);
      if (!Array.isArray(s.movies) || typeof s.logs !== 'object') throw new Error('bad file');
      if (!confirm('Replace your current data with this backup?')) return;
      localStorage.setItem(STORE_KEY, t); state = load(); render(); toast('Backup imported');
    }).catch(() => toast('Invalid backup file'));
  });
  modal.addEventListener('click', (e) => { if (e.target === modal) closeModal(); });
  document.addEventListener('visibilitychange', () => { if (!document.hidden) render(); });

  // ---------------- boot ----------------
  let startView = 'today';
  try { startView = sessionStorage.getItem('fe.view') || 'today'; } catch { /* ignore */ }
  showView(startView);
  if (!NATIVE && 'serviceWorker' in navigator && location.protocol.startsWith('http')) {
    navigator.serviceWorker.register('sw.js').catch(() => {});
  }
})();
