/* Golf HCP per iPhone – interfaccia. Stesso comportamento della versione Android 0.7. */
(function () {
  'use strict';
  var G = window.GolfCore;
  var ALL_COLORS = ['Rosso', 'Arancio', 'Giallo', 'Blu', 'Verde', 'Bianco', 'Nero'];
  var REFRESH_MS = 7 * 24 * 3600 * 1000;
  var KEY = 'golfhcp';

  // ---------------- memoria locale ----------------
  function load() {
    var s = null;
    try { s = JSON.parse(localStorage.getItem(KEY) || 'null'); } catch (e) { s = null; }
    s = s || {};
    if (!Array.isArray(s.rounds)) s.rounds = [];
    if (typeof s.initialHi !== 'number') s.initialHi = 54.0;
    return s;
  }
  var state = load();
  function persist() {
    try { localStorage.setItem(KEY, JSON.stringify(state)); }
    catch (e) { toast('Non riesco a salvare i dati sul telefono: ' + e.message); }
  }
  function rounds() { return G.sortNewestFirst(state.rounds.map(function (r) { return Object.assign({}, r); })); }
  function validDifferentials() { return G.adjustedDifferentials(rounds()); }
  function currentIndex() { var hi = G.handicapIndex(validDifferentials()); return hi !== null ? hi : state.initialHi; }
  var lastId = 0;
  function newId() { var t = Date.now(); lastId = t > lastId ? t : lastId + 1; return lastId; }

  // ---------------- percorsi ----------------
  var courses = [], coursesDate = '', coursesTime = 0;
  function loadCourses() {
    var builtIn = window.GOLF_RATINGS || { rows: [], date: '' };
    var cached = state.ratings;
    var src = cached && cached.rows && cached.rows.length && cached.date >= (builtIn.date || '') ? cached : builtIn;
    courses = G.parseCompactRows(src.rows);
    coursesDate = src.date || '';
    coursesTime = src === cached ? (cached.time || 0) : Date.parse(builtIn.date + 'T12:00:00') || 0;
  }
  function toCompact(list) {
    var order = ['Nero', 'Bianco', 'Giallo', 'Verde', 'Blu', 'Rosso', 'Arancio'];
    return list.map(function (c) {
      var i = c.name.indexOf(' - '), club = c.name.substring(0, i), course = c.name.substring(i + 3);
      var cells = [club.toUpperCase(), course, c.tees[0].par];
      order.forEach(function (col) {
        var t = c.tees.filter(function (x) { return x.color === col; })[0];
        cells.push(t ? t.cr.toFixed(1) : '', t ? t.slope : '');
      });
      return cells.join('|');
    });
  }
  function today() {
    var d = new Date();
    return d.getFullYear() + '-' + ('0' + (d.getMonth() + 1)).slice(-2) + '-' + ('0' + d.getDate()).slice(-2);
  }
  /** Prova federgolf.it (di solito bloccato dal browser), poi la copia aggiornata pubblicata accanto all'app. */
  async function downloadCourses() {
    var errors = [];
    try {
      var r = await fetch(G.FEDERGOLF_URL, { credentials: 'omit', cache: 'no-store' });
      if (!r.ok) throw new Error('federgolf.it ha risposto ' + r.status);
      var parsed = G.parseFedergolfHtml(await r.text());
      state.ratings = { date: today(), time: Date.now(), rows: toCompact(parsed), source: 'federgolf.it' };
      persist(); loadCourses();
      return parsed.length + ' percorsi aggiornati da federgolf.it';
    } catch (e) { errors.push(e.message); }
    try {
      var r2 = await fetch('ratings.json?t=' + Date.now(), { cache: 'no-store' });
      if (!r2.ok) throw new Error('copia rating non disponibile (' + r2.status + ')');
      var j = await r2.json();
      var list = G.parseCompactRows(j.rows || []);
      if (list.length < 50) throw new Error('copia rating incompleta (' + list.length + ' percorsi)');
      state.ratings = { date: j.date, time: Date.now(), rows: j.rows, source: j.source || 'federgolf.it' };
      persist(); loadCourses();
      return list.length + ' percorsi, rating federgolf del ' + displayDate(j.date);
    } catch (e) { errors.push(e.message); }
    throw new Error(errors[errors.length - 1]);
  }
  function findCourse(name) {
    var n = (name || '').trim().toLowerCase();
    for (var i = 0; i < courses.length; i++) if (courses[i].name.toLowerCase() === n) return courses[i];
    return null;
  }

  // ---------------- formattazione ----------------
  function fmt1(v) { return (Math.round(v * 10) / 10).toFixed(1).replace('.', ','); }
  function displayDate(iso) {
    if (!iso || iso.length < 10) return iso || '';
    return iso.substring(8, 10) + '/' + iso.substring(5, 7) + '/' + iso.substring(0, 4);
  }
  function esc(s) { return String(s).replace(/[&<>"']/g, function (c) { return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]; }); }
  function $(id) { return document.getElementById(id); }
  function el(tag, cls, text) { var e = document.createElement(tag); if (cls) e.className = cls; if (text != null) e.textContent = text; return e; }

  // ---------------- header ----------------
  function refreshHeader() {
    var d = validDifferentials(), hi = G.handicapIndex(d);
    if (hi !== null) {
      $('hi').textContent = fmt1(hi);
      var n = Math.min(20, d.length);
      $('hiDetail').textContent = 'Media dei migliori ' + G.countingScores(d.length) + ' su ' + n + ' gare valide' +
        (d.length < 20 ? ' (tabella WHS per meno di 20)' : ' (ultime 20)');
    } else {
      $('hi').textContent = fmt1(state.initialHi);
      $('hiDetail').textContent = 'HI iniziale: servono almeno 3 gare valide per calcolarlo (' + d.length + ' finora)';
    }
  }

  // ---------------- tab ----------------
  var currentTab = 0;
  function showTab(i) {
    currentTab = i;
    [].forEach.call(document.querySelectorAll('.tabbar button'), function (b, k) { b.classList.toggle('on', k === i); });
    var c = $('content');
    c.innerHTML = '';
    window.scrollTo(0, 0);
    if (i === 0) buildNewRound(c, false); else if (i === 1) buildSimulation(c); else if (i === 2) buildPlayingHcp(c); else if (i === 3) buildTrend(c); else if (i === 4) buildHistory(c); else buildSettings(c);
  }

  // ---------------- nuova gara ----------------
  var f = {}, teeOptions = [];
  function field(parent, label, input) {
    var w = el('label', 'field');
    w.appendChild(el('span', 'lbl', label));
    w.appendChild(input);
    parent.appendChild(w);
    return input;
  }
  function numInput(mode, value) {
    var i = el('input'); i.type = 'text'; i.inputMode = mode; i.autocomplete = 'off';
    if (value != null) i.value = value;
    return i;
  }
  // ---------------- andamento HCP ----------------
  var tr = {};
  function addMonths(iso, m) {
    var d = new Date(iso + 'T12:00:00');
    d.setMonth(d.getMonth() + m);
    return d.getFullYear() + '-' + ('0' + (d.getMonth() + 1)).slice(-2) + '-' + ('0' + d.getDate()).slice(-2);
  }
  function buildTrend(c) {
    tr.points = G.indexHistory(rounds());
    if (!tr.points.length) {
      c.appendChild(el('p', 'hint pad', "Servono almeno 3 gare valide per disegnare l'andamento dell'Handicap Index. Registra le gare o importa lo storico federgolf."));
      return;
    }
    var first = tr.points[0].date, last = today();
    var card = el('div', 'card'); c.appendChild(card);
    // Dal / Al: mese e anno da menu a tendina (niente calendario da scorrere mese per mese)
    var MESI = ['gennaio', 'febbraio', 'marzo', 'aprile', 'maggio', 'giugno', 'luglio', 'agosto', 'settembre', 'ottobre', 'novembre', 'dicembre'];
    var y1 = +last.substring(0, 4), y0 = Math.min(+first.substring(0, 4), y1 - 1);
    function monthYear(label) {
      card.appendChild(el('span', 'lbl', label));
      var r = el('div', 'row2'); card.appendChild(r);
      var m = el('select'), y = el('select');
      MESI.forEach(function (n, i) { var o = el('option', null, n); o.value = String(i + 1).padStart(2, '0'); m.appendChild(o); });
      for (var k = y1; k >= y0; k--) { var o = el('option', null, String(k)); o.value = String(k); y.appendChild(o); }
      m.setAttribute('aria-label', label + ' mese'); y.setAttribute('aria-label', label + ' anno');
      r.appendChild(m); r.appendChild(y);
      return { m: m, y: y };
    }
    var fSel = monthYear('Dal'), tSel = monthYear('Al');
    var period = el('p', 'hint'); card.appendChild(period);
    // tr.from / tr.to tengono la data esatta; i menu mostrano mese e anno
    tr.from = { value: tr.fromV || first }; tr.to = { value: tr.toV || last };
    function showSel() {
      var a0 = tr.from.value, a1 = tr.to.value; if (a0 > a1) { var t = a0; a0 = a1; a1 = t; }
      period.textContent = 'Periodo: dal ' + displayDate(a0) + ' al ' + displayDate(a1);
      [[fSel, tr.from.value], [tSel, tr.to.value]].forEach(function (a) {
        a[0].m.value = a[1].substring(5, 7); a[0].y.value = a[1].substring(0, 4);
      });
    }
    // Dal = giorno 1 del mese; Al = ultimo giorno del mese, al massimo oggi (come su Android)
    function monthEnd(y, m) { var d = new Date(Date.UTC(+y, +m, 0)).toISOString().substring(0, 10); return d > last ? last : d; }
    function fromSel() {
      var f = fSel.y.value + '-' + fSel.m.value + '-01', t = monthEnd(tSel.y.value, tSel.m.value);
      if (f > t) { f = tSel.y.value + '-' + tSel.m.value + '-01'; t = monthEnd(fSel.y.value, fSel.m.value); }
      tr.from.value = f; tr.to.value = t;
      showSel(); drawTrend();
    }
    [fSel.m, fSel.y, tSel.m, tSel.y].forEach(function (e) { e.addEventListener('change', fromSel); });
    showSel();
    var quick = el('div', 'chips'); card.appendChild(quick);
    [['3 mesi', -3], ['6 mesi', -6], ['1 anno', -12], ['Tutto', 0]].forEach(function (q) {
      var b = el('button', 'chip', q[0]); b.type = 'button';
      b.onclick = function () { tr.from.value = q[1] ? addMonths(last, q[1]) : first; tr.to.value = last; showSel(); drawTrend(); };
      quick.appendChild(b);
    });
    tr.chart = el('div', 'chart-card'); c.appendChild(tr.chart);
    tr.stats = el('div', 'result'); c.appendChild(tr.stats);
    c.appendChild(el('p', 'hint pad', "Un punto per ogni giorno di gara: l'Handicap Index dopo quella gara. Per le gare importate dall'Excel federgolf è l'\"Index Nuovo\" ufficiale; per le altre è calcolato dall'app. Tocca il grafico per leggere un punto."));
    drawTrend();
  }
  function drawTrend() {
    var from = tr.from.value, to = tr.to.value;
    if (from && to && from > to) { var t = from; from = to; to = t; }
    tr.fromV = tr.from.value; tr.toV = tr.to.value;
    var s = G.trendSummary(tr.points, from, to);
    tr.chart.innerHTML = ''; tr.stats.innerHTML = '';
    if (!s.points.length) {
      tr.chart.appendChild(el('p', 'hint', 'Nessuna gara in questo periodo.'));
      if (s.before) tr.stats.appendChild(line('HI in vigore', fmt1(s.before.hi) + ' (dal ' + displayDate(s.before.date) + ')'));
      return;
    }
    var pts = s.points.slice();
    if (s.before && s.before.date < pts[0].date) pts.unshift({ date: from, hi: s.before.hi, carried: true });
    var W = 340, H = 220, L = 34, R = 10, T = 12, B = 28;
    // asse X proporzionale alle date tra Dal e Al (come su Android)
    var t0 = Date.parse(from || pts[0].date), t1 = Date.parse(to || pts[pts.length - 1].date);
    if (Date.parse(pts[0].date) < t0) t0 = Date.parse(pts[0].date);
    if (t1 === t0) { t0 -= 86400000 * 15; t1 += 86400000 * 15; }
    var lo = Math.min.apply(null, pts.map(function (p) { return p.hi; })), hi = Math.max.apply(null, pts.map(function (p) { return p.hi; }));
    lo = Math.floor(lo - 0.5); hi = Math.ceil(hi + 0.5);
    var step = hi - lo > 12 ? 4 : hi - lo > 6 ? 2 : 1;
    lo = Math.floor(lo / step) * step; hi = Math.ceil(hi / step) * step;
    function X(d) { return L + (Date.parse(d) - t0) / (t1 - t0) * (W - L - R); }
    function Y(v) { return T + (hi - v) / (hi - lo) * (H - T - B); }
    var ns = 'http://www.w3.org/2000/svg';
    function sv(tag, attrs, text) { var e = document.createElementNS(ns, tag); for (var k in attrs) e.setAttribute(k, attrs[k]); if (text != null) e.textContent = text; return e; }
    var svg = sv('svg', { viewBox: '0 0 ' + W + ' ' + H, 'class': 'chart', role: 'img', 'aria-label': 'Andamento Handicap Index' });
    for (var v = lo; v <= hi + 1e-9; v += step) {
      svg.appendChild(sv('line', { x1: L, x2: W - R, y1: Y(v), y2: Y(v), 'class': 'grid' }));
      svg.appendChild(sv('text', { x: L - 6, y: Y(v) + 4, 'class': 'ylab', 'text-anchor': 'end' }, String(v)));
    }
    // etichette delle date: inizio, metà, fine
    [new Date(t0).toISOString().substring(0, 10), null, new Date(t1).toISOString().substring(0, 10)].forEach(function (d, k) {
      var iso = d || new Date((t0 + t1) / 2).toISOString().substring(0, 10);
      var lab = iso.substring(8, 10) + '/' + iso.substring(5, 7) + '/' + iso.substring(2, 4);
      svg.appendChild(sv('text', { x: k === 0 ? L : k === 2 ? W - R : (L + W - R) / 2, y: H - 8, 'class': 'xlab',
        'text-anchor': k === 0 ? 'start' : k === 2 ? 'end' : 'middle' }, lab));
    });
    var dpath = '';
    pts.forEach(function (p, i) { dpath += (i ? (' H' + X(p.date).toFixed(1) + ' V' + Y(p.hi).toFixed(1)) : ('M' + X(p.date).toFixed(1) + ' ' + Y(p.hi).toFixed(1))); });
    svg.appendChild(sv('path', { d: dpath, 'class': 'line' }));
    pts.forEach(function (p) { if (!p.carried) svg.appendChild(sv('circle', { cx: X(p.date), cy: Y(p.hi), r: 3, 'class': 'dot' })); });
    var mark = sv('g', { 'class': 'mark', visibility: 'hidden' });
    var mLine = sv('line', { y1: T, y2: H - B, 'class': 'mline' }), mDot = sv('circle', { r: 5, 'class': 'mdot' });
    mark.appendChild(mLine); mark.appendChild(mDot); svg.appendChild(mark);
    tr.chart.appendChild(svg);
    var readout = el('div', 'readout', ' '); tr.chart.appendChild(readout);
    function show(best) {
      mark.setAttribute('visibility', 'visible');
      mLine.setAttribute('x1', X(best.date)); mLine.setAttribute('x2', X(best.date));
      mDot.setAttribute('cx', X(best.date)); mDot.setAttribute('cy', Y(best.hi));
      readout.textContent = displayDate(best.date) + ' · HI ' + fmt1(best.hi) + (best.official ? ' (federgolf)' : '') + (best.rounds > 1 ? ', ' + best.rounds + ' gare' : '');
    }
    function pick(ev) {
      var rect = svg.getBoundingClientRect(), x = (ev.clientX - rect.left) / rect.width * W, best = null, bd = 1e9;
      s.points.forEach(function (p) { var d = Math.abs(X(p.date) - x); if (d < bd) { bd = d; best = p; } });
      if (best) show(best);
    }
    show(s.points[s.points.length - 1]);
    svg.addEventListener('pointerdown', pick);
    svg.addEventListener('pointermove', function (e) { if (e.buttons || e.pointerType === 'touch') pick(e); });
    var ch = s.change;
    tr.stats.appendChild(line('Inizio periodo', fmt1(s.start.hi) + '  ' + displayDate(s.start.date)));
    tr.stats.appendChild(line('Fine periodo', fmt1(s.end.hi) + '  ' + displayDate(s.end.date)));
    tr.stats.appendChild(line('Variazione', ch === 0 ? 'invariato' : (ch > 0 ? '+' : '−') + fmt1(Math.abs(ch)), true));
    tr.stats.appendChild(line('Minimo', fmt1(s.min.hi) + '  ' + displayDate(s.min.date)));
    tr.stats.appendChild(line('Massimo', fmt1(s.max.hi) + '  ' + displayDate(s.max.date)));
    tr.stats.appendChild(line('Giorni di gara nel periodo', String(s.points.length)));
  }

  // ---------------- HCP di gioco ----------------
  // Scelto il campo, mostra l'HCP di gioco per ogni battitore con HI attuale (modificabile).
  var p = {};
  function buildPlayingHcp(c) {
    var card = el('div', 'card'); c.appendChild(card);
    p.course = el('input'); p.course.type = 'text'; p.course.placeholder = 'Scrivi parte del nome del circolo';
    p.course.autocomplete = 'off'; p.course.setAttribute('autocorrect', 'off'); p.course.setAttribute('autocapitalize', 'off');
    p.course.spellcheck = false;
    var cw = field(card, 'Campo', p.course).parentNode;
    cw.classList.add('suggest-wrap');
    p.sugg = el('div', 'suggest'); cw.appendChild(p.sugg);
    p.hi = field(card, 'Handicap Index', numInput('decimal', fmt1(currentIndex())));
    card.appendChild(el('p', 'hint', "Di partenza c'è il tuo HI attuale; puoi cambiarlo per fare una prova."));
    p.manual = el('div'); card.appendChild(p.manual);
    var row = el('div', 'row3'); p.manual.appendChild(row);
    p.cr = field(row, 'Course Rating', numInput('decimal'));
    p.slope = field(row, 'Slope', numInput('numeric'));
    p.par = field(row, 'Par', numInput('numeric'));
    p.manual.appendChild(el('p', 'hint', 'Campo non in elenco? Inserisci CR, Slope e Par a mano.'));
    p.result = el('div', 'result'); c.appendChild(p.result);
    p.chosen = null;
    p.course.addEventListener('input', function () {
      p.chosen = findCourse(p.course.value) || null;
      showPhSuggestions(); updatePlayingHcp();
    });
    p.course.addEventListener('focus', showPhSuggestions);
    p.course.addEventListener('blur', function () { setTimeout(function () { p.sugg.innerHTML = ''; }, 200); });
    [p.hi, p.cr, p.slope, p.par].forEach(function (e) { e.addEventListener('input', updatePlayingHcp); });
    updatePlayingHcp();
  }
  function showPhSuggestions() {
    var q = p.course.value.trim().toLowerCase();
    p.sugg.innerHTML = '';
    if (q.length < 2 || findCourse(q)) return;
    var words = q.split(/\s+/), hits = [];
    for (var i = 0; i < courses.length && hits.length < 40; i++) {
      var n = courses[i].name.toLowerCase();
      if (words.every(function (w) { return n.indexOf(w) >= 0; })) hits.push(courses[i]);
    }
    hits.forEach(function (c) {
      var b = el('button', null, c.name); b.type = 'button';
      b.addEventListener('mousedown', function (e) { e.preventDefault(); });
      b.onclick = function () { p.course.value = c.name; p.sugg.innerHTML = ''; p.course.blur(); p.chosen = c; updatePlayingHcp(); };
      p.sugg.appendChild(b);
    });
  }
  function hcpFor(hi, slope, cr, par) {
    return par < 50 ? G.playingHandicap9(hi, slope, cr, par) : G.playingHandicap(hi, slope, cr, par);
  }
  function updatePlayingHcp() {
    var box = p.result;
    if (!box) return;
    box.innerHTML = '';
    p.manual.style.display = p.chosen ? 'none' : '';
    var hiS = p.hi.value.trim();
    if (!hiS) { box.appendChild(el('p', 'hint', "Inserisci l'Handicap Index.")); return; }
    var hi = G.parseDouble(hiS);
    if (p.chosen) {
      box.appendChild(el('div', 'lbl', p.chosen.name + ' · HI ' + fmt1(hi)));
      p.chosen.tees.forEach(function (t) {
        var d = line(t.color + (t.gender === 'D' ? ' (donne)' : ' (uomini)'), String(hcpFor(hi, t.slope, t.cr, t.par)));
        box.appendChild(d);
        box.appendChild(el('p', 'hint', 'CR ' + fmt1(t.cr) + ' · Slope ' + t.slope + ' · Par ' + t.par));
      });
      if (p.chosen.tees.length && p.chosen.tees[0].par < 50)
        box.appendChild(el('p', 'hint', 'Percorso da 9 buche: HCP di gioco = HI/2 × Slope/113 + (CR − Par).'));
      return;
    }
    var cr = G.parseDouble(p.cr.value), slope = G.parseInt(p.slope.value), par = G.parseInt(p.par.value);
    if (cr <= 0 || slope <= 0 || par <= 0) {
      box.appendChild(el('p', 'hint', "Scegli un campo per vedere l'HCP di gioco di ogni battitore."));
      return;
    }
    box.appendChild(line('HCP di gioco', String(hcpFor(hi, slope, cr, par)), true));
  }

  function buildSimulation(c) {
    var info = el('div', 'sim-banner');
    info.appendChild(el('b', null, 'Simulazione'));
    info.appendChild(el('span', null, ' Stessi calcoli di Nuova gara, ma niente viene salvato: lo storico e il tuo HI non cambiano.'));
    c.appendChild(info);
    buildNewRound(c, true);
  }
  function buildNewRound(c, simulate) {
    f.simulate = !!simulate;
    var card = el('div', 'card'); c.appendChild(card);
    f.date = el('input'); f.date.type = 'date'; f.date.value = today();
    field(card, 'Data', f.date);

    f.course = el('input'); f.course.type = 'text'; f.course.placeholder = 'Scrivi parte del nome del circolo';
    f.course.autocomplete = 'off'; f.course.setAttribute('autocorrect', 'off'); f.course.setAttribute('autocapitalize', 'off');
    f.course.spellcheck = false;
    var cw = field(card, 'Campo', f.course).parentNode;
    cw.classList.add('suggest-wrap');
    f.sugg = el('div', 'suggest'); cw.appendChild(f.sugg);
    f.status = el('div', 'hint'); card.appendChild(f.status);
    updateCourseStatus();

    f.tee = el('select'); field(card, 'Battitore', f.tee);

    var row = el('div', 'row3'); card.appendChild(row);
    f.cr = field(row, 'Course Rating', numInput('decimal'));
    f.slope = field(row, 'Slope', numInput('numeric'));
    f.par = field(row, 'Par', numInput('numeric'));

    var row2 = el('div', 'row3'); card.appendChild(row2);
    f.hi = field(row2, 'HI prima della gara', numInput('decimal', fmt1(currentIndex())));
    f.stb = field(row2, 'Punti Stableford', numInput('numeric'));
    f.pcc = field(row2, 'PCC', numInput('text', '0'));

    var vl = el('label', 'check');
    f.valid = el('input'); f.valid.type = 'checkbox'; f.valid.checked = true;
    vl.appendChild(f.valid); vl.appendChild(el('span', null, 'Gara valida per handicap'));
    card.appendChild(vl);

    f.result = el('div', 'result'); c.appendChild(f.result);
    if (simulate) {
      var reset = el('button', 'secondary', 'Azzera simulazione'); c.appendChild(reset);
      reset.onclick = function () { showTab(1); };
    } else {
      var save = el('button', 'primary', 'Salva gara e aggiorna HI'); c.appendChild(save);
      save.onclick = saveRound;
    }

    f.course.addEventListener('input', function () {
      showSuggestions();
      if (!findCourse(f.course.value)) setTeeOptions(null);
    });
    f.course.addEventListener('focus', showSuggestions);
    f.course.addEventListener('blur', function () { setTimeout(function () { f.sugg.innerHTML = ''; }, 200); });
    f.tee.addEventListener('change', function () { onTeeChosen(f.tee.selectedIndex); updatePreview(); });
    [f.cr, f.slope, f.par, f.hi, f.stb, f.pcc].forEach(function (e) { e.addEventListener('input', updatePreview); });
    f.valid.addEventListener('change', updatePreview);
    f.date.addEventListener('change', updatePreview);
    setTeeOptions(null);
    updatePreview();
  }
  function updateCourseStatus(msg) {
    if (!f.status || !document.body.contains(f.status)) return;
    if (msg) { f.status.textContent = msg; return; }
    f.status.textContent = courses.length ? courses.length + ' percorsi federgolf, rating del ' + displayDate(coursesDate)
      : 'Nessun campo disponibile. Puoi inserire CR, Slope e Par a mano.';
  }
  function showSuggestions() {
    var q = f.course.value.trim().toLowerCase();
    f.sugg.innerHTML = '';
    if (q.length < 2 || findCourse(q)) return;
    var words = q.split(/\s+/), hits = [];
    for (var i = 0; i < courses.length && hits.length < 40; i++) {
      var n = courses[i].name.toLowerCase();
      if (words.every(function (w) { return n.indexOf(w) >= 0; })) hits.push(courses[i]);
    }
    hits.forEach(function (c) {
      var b = el('button', null, c.name); b.type = 'button';
      b.addEventListener('mousedown', function (e) { e.preventDefault(); });
      b.onclick = function () { f.course.value = c.name; f.sugg.innerHTML = ''; f.course.blur(); setTeeOptions(c); };
      f.sugg.appendChild(b);
    });
  }
  function setTeeOptions(c) {
    teeOptions = [];
    f.tee.innerHTML = '';
    if (c) {
      c.tees.forEach(function (t) {
        teeOptions.push(t);
        f.tee.appendChild(el('option', null, t.color + (t.gender === 'D' ? ' (donne)' : ' (uomini)') + '  CR ' + fmt1(t.cr) + ' / Slope ' + t.slope));
      });
    } else {
      ALL_COLORS.forEach(function (col) {
        teeOptions.push({ color: col, slope: 0 });
        f.tee.appendChild(el('option', null, col + ' (valori a mano)'));
      });
    }
    if (c) {
      var pref = -1;
      teeOptions.forEach(function (t, i) { if (t.color === 'Giallo') pref = i; });
      f.tee.selectedIndex = pref >= 0 ? pref : 0;
      if (teeOptions.length) onTeeChosen(pref >= 0 ? pref : 0);
    }
    updatePreview();
  }
  function onTeeChosen(pos) {
    if (pos < 0 || pos >= teeOptions.length) return;
    var t = teeOptions[pos];
    if (t.slope > 0) { f.cr.value = fmt1(t.cr); f.slope.value = String(t.slope); f.par.value = String(t.par); }
  }
  function buildRound() {
    var cr = G.parseDouble(f.cr.value), slope = G.parseInt(f.slope.value), par = G.parseInt(f.par.value);
    var hiS = f.hi.value.trim(), stbS = f.stb.value.trim();
    if (cr <= 0 || slope < 55 || slope > 155 || par <= 0 || !hiS || !stbS) return null;
    var r = G.newRound();
    r.date = f.date.value || today();
    r.course = f.course.value.trim();
    var pos = f.tee.selectedIndex;
    r.tee = pos >= 0 && pos < teeOptions.length ? teeOptions[pos].color : '';
    r.courseRating = cr; r.slope = slope; r.par = par;
    r.hiUsed = G.parseDouble(hiS);
    r.stableford = G.parseInt(stbS);
    r.pcc = G.parseInt(f.pcc.value);
    r.holes = par < 50 ? 9 : 18;
    if (r.holes === 9) {
      r.playingHcp = G.playingHandicap9(r.hiUsed, slope, cr, par);
      r.differential = G.scoreDifferential9(slope, par, r.playingHcp, r.stableford, cr, r.pcc, r.hiUsed);
    } else {
      r.playingHcp = G.playingHandicap(r.hiUsed, slope, cr, par);
      r.differential = G.scoreDifferential(slope, par, r.playingHcp, r.stableford, cr, r.pcc);
    }
    r.valid = f.valid.checked;
    r.esr = r.valid ? G.exceptionalReduction(r.hiUsed, r.differential) : 0;
    return r;
  }
  function indexWith(r) {
    var all = rounds();
    r.id = Number.MAX_SAFE_INTEGER;
    all.push(r);
    G.sortNewestFirst(all);
    return G.handicapIndex(G.adjustedDifferentials(all));
  }
  function line(label, value, big) {
    var d = el('div', big ? 'kv big' : 'kv');
    d.appendChild(el('span', null, label)); d.appendChild(el('b', null, value));
    return d;
  }
  function updatePreview() {
    var box = f.result;
    if (!box) return;
    box.innerHTML = '';
    var cr = G.parseDouble(f.cr.value), slope = G.parseInt(f.slope.value), par = G.parseInt(f.par.value), hiS = f.hi.value.trim();
    if (cr <= 0 || slope <= 0 || par <= 0 || !hiS) {
      box.appendChild(el('p', 'hint', "Scegli campo e battitore (o inserisci CR, Slope e Par) per vedere l'HCP di gioco."));
      return;
    }
    var hiNow = G.parseDouble(hiS);
    var phcp = par < 50 ? G.playingHandicap9(hiNow, slope, cr, par) : G.playingHandicap(hiNow, slope, cr, par);
    if (par < 50) box.appendChild(el('p', 'hint', 'Percorso da 9 buche: SD = differenziale delle 9 giocate + atteso sulle altre 9 (0,52 × HI + 1,2).'));
    box.appendChild(line('HCP di gioco', String(phcp)));
    var r = buildRound();
    if (r) {
      box.appendChild(line('Score differential', fmt1(r.differential)));
      if (r.esr !== 0) box.appendChild(el('p', 'warn', 'Punteggio eccezionale: riduzione ' + fmt1(r.esr) + ' su questa e sulle 19 gare precedenti'));
      if (r.valid) {
        var hi = indexWith(r);
        var now = currentIndex();
        if (hi !== null) {
          box.appendChild(line(f.simulate ? 'Handicap Index simulato' : 'Nuovo Handicap Index', fmt1(hi), true));
          var delta = Math.round((hi - now) * 10) / 10;
          box.appendChild(el('p', 'hint', 'Attuale ' + fmt1(now) + (delta === 0 ? ', invariato' : ', variazione ' + (delta > 0 ? '+' : '−') + fmt1(Math.abs(delta)))));
        } else {
          box.appendChild(el('p', 'hint', 'Nuovo Handicap Index: servono almeno 3 gare valide'));
          box.appendChild(el('p', 'hint', 'Attuale ' + fmt1(now)));
        }
      } else box.appendChild(el('p', 'hint', "Gara non valida: l'HI non cambia"));
    } else box.appendChild(el('p', 'hint', 'Inserisci i punti Stableford per lo score differential.'));
  }
  function saveRound() {
    var r = buildRound();
    if (!r) { toast('Completa CR, Slope (55-155), Par, HI e punti Stableford'); return; }
    var before = currentIndex();
    r.id = newId();
    state.rounds.push(r); persist();
    refreshHeader();
    var after = currentIndex();
    var msg = 'HCP di gioco: ' + r.playingHcp + '\nScore differential: ' + fmt1(r.differential) +
      (r.esr !== 0 ? '\nRiduzione punteggio eccezionale: ' + fmt1(r.esr) : '') +
      '\n\nHandicap Index: ' + fmt1(before) + ' → ' + fmt1(after);
    dialog('Gara salvata', msg, [{ label: 'OK', primary: true }]);
    showTab(0);
  }

  // ---------------- storico ----------------
  function adjustedById(newestFirst) {
    var v = newestFirst.filter(function (r) { return r.valid; }), a = G.adjusted(v), m = {};
    v.forEach(function (r, i) { m[r.id] = a[i]; });
    return m;
  }
  function countingIds(newestFirst) {
    var valid = [];
    newestFirst.forEach(function (r) { if (r.valid && valid.length < 20) valid.push(r); });
    var k = G.countingScores(valid.length), adj = adjustedById(newestFirst);
    var sorted = valid.slice().sort(function (a, b) { return adj[a.id] - adj[b.id]; });
    var ids = {};
    for (var i = 0; i < k; i++) ids[sorted[i].id] = true;
    return ids;
  }
  function buildHistory(c) {
    var bar = el('div', 'bar'); c.appendChild(bar);
    var imp = el('button', 'secondary', 'Importa storico'); bar.appendChild(imp);
    var exp = el('button', 'secondary', 'Esporta CSV'); bar.appendChild(exp);
    imp.onclick = startImport;
    exp.onclick = doExport;

    var list = rounds(), counting = countingIds(list), adj = adjustedById(list);
    c.appendChild(el('p', 'hint pad', list.length + " gare. ★ = conta per l'HI. Tocca una gara per modificarla."));
    var ul = el('div', 'list'); c.appendChild(ul);
    var validSeen = 0;
    list.forEach(function (r) {
      var item = el('button', 'item'); item.type = 'button';
      var inWindow = r.valid && validSeen < 20;
      if (r.valid) validSeen++;
      if (!inWindow) item.classList.add('dim');
      var a = adj[r.id];
      var corr = a != null && Math.abs(a - r.differential) > 0.05 ? '  (corretto ' + fmt1(a) + ')' : '';
      var t1 = el('div', 't1');
      if (counting[r.id]) t1.appendChild(el('span', 'star', '★ '));
      t1.appendChild(document.createTextNode(displayDate(r.date) + '   SD ' + fmt1(r.differential) + corr));
      var detail = (r.course ? r.course : 'Campo non indicato') + (r.tee ? ' · ' + r.tee : '') +
        (r.stableford > 0 ? ' · ' + r.stableford + ' punti' : '') +
        (r.playingHcp !== 0 || !r.imported ? ' · HCP gioco ' + r.playingHcp : '') +
        (r.holes === 9 ? ' · 9 buche' : '') + (r.esr ? ' · eccezionale ' + fmt1(r.esr) : '') +
        (r.valid ? '' : ' · NON valida') + (r.imported ? ' · importata' : '');
      item.appendChild(t1);
      item.appendChild(el('div', 't2', detail));
      item.onclick = function () { editRound(r); };
      ul.appendChild(item);
    });
  }
  function updateStored(r) {
    state.rounds = state.rounds.map(function (x) { return x.id === r.id ? r : x; });
    persist();
  }
  function editRound(r) {
    dialog(displayDate(r.date) + ' · SD ' + fmt1(r.differential), null, [
      { label: r.valid ? 'Segna come NON valida per handicap' : 'Segna come valida per handicap', action: function () {
        r.valid = !r.valid; updateStored(r); refreshHeader(); showTab(4);
      } },
      { label: 'Elimina gara', danger: true, action: function () { setTimeout(function () { confirmDelete(r); }, 50); } },
      { label: 'Annulla' }
    ]);
  }
  function confirmDelete(r) {
    dialog(null, 'Eliminare la gara del ' + displayDate(r.date) + '?', [
      { label: 'Elimina', danger: true, action: function () {
        state.rounds = state.rounds.filter(function (x) { return x.id !== r.id; });
        persist(); refreshHeader(); showTab(4);
      } },
      { label: 'Annulla' }
    ]);
  }
  function startImport() {
    var inp = $('fileInput');
    inp.value = '';
    inp.onchange = function () { if (inp.files && inp.files[0]) doImport(inp.files[0]); };
    inp.click();
  }
  async function doImport(file) {
    var r;
    try {
      var buf = new Uint8Array(await file.arrayBuffer());
      if (looksLikeBackup(buf)) { restoreBackup(buf); return; }
      r = G.parseHistory(await G.readSheet(buf));
    } catch (e) {
      toast('Non riesco a leggere il file: ' + e.message);
      return;
    }
    if (r.error) { dialog('Import non riuscito', r.error, [{ label: 'OK', primary: true }]); return; }
    var existing = {};
    rounds().forEach(function (x) { existing[x.date + '|' + fmt1(x.differential)] = true; });
    var fresh = [], dup = 0, fedFill = {};
    r.rounds.forEach(function (x) {
      var k = x.date + '|' + fmt1(x.differential);
      if (!existing[k]) { existing[k] = true; fresh.push(x); }
      else { dup++; if (typeof x.hiFed === 'number') fedFill[k] = x; }
    });
    var valid = fresh.filter(function (x) { return x.valid; }).length;
    var base = Date.now();
    fresh.forEach(function (x, i) { x.id = base + i; });
    var merged = G.sortNewestFirst(rounds().concat(fresh.map(function (x) { return Object.assign({}, x); })));
    var appHi = G.handicapIndex(G.adjustedDifferentials(merged));
    var check = '';
    if (r.federIndex !== null) {
      check = '\n\nUltimo index federgolf nel file: ' + fmt1(r.federIndex) + "\nIndex calcolato dall'app: " + (appHi !== null ? fmt1(appHi) : '–');
      if (appHi !== null && Math.abs(appHi - r.federIndex) >= 0.15) check += '\n(diversi: controlla le gare del file)';
    }
    dialog('Importa storico', 'Gare nuove trovate: ' + fresh.length + ' (valide per handicap: ' + valid + ')\n' +
      'Già presenti: ' + dup + '\nGare non valide senza SD (es. Louisiana), saltate: ' + r.teamSkipped +
      '\nRighe scartate: ' + r.skipped + '\n\nColonne lette: ' + r.columns + check, [
      { label: 'Importa', primary: true, action: function () {
        fresh.forEach(function (x) { x.id = newId(); state.rounds.push(x); });
        // gare già presenti: aggiunge l'"Index Nuovo" federgolf se manca (serve al grafico Andamento)
        state.rounds.forEach(function (x) {
          var s = fedFill[x.date + '|' + fmt1(x.differential)];
          if (s && typeof x.hiFed !== 'number') { x.hiFed = s.hiFed; x.fedSeq = s.fedSeq; }
        });
        persist(); refreshHeader(); showTab(4);
        toast(fresh.length + ' gare importate');
      } },
      { label: 'Annulla' }
    ]);
  }
  async function shareFile(name, text, type) {
    var blob = new Blob([text], { type: type });
    try {
      var file = new File([blob], name, { type: type });
      if (navigator.canShare && navigator.canShare({ files: [file] })) { await navigator.share({ files: [file], title: name }); return; }
    } catch (e) { if (e && e.name === 'AbortError') return; }
    var a = document.createElement('a');
    a.href = URL.createObjectURL(blob); a.download = name;
    document.body.appendChild(a); a.click();
    setTimeout(function () { URL.revokeObjectURL(a.href); a.remove(); }, 1000);
  }
  function doExport() {
    var s = 'Data;Campo;Battitore;CR;Slope;Par;HI;HCP gioco;Stableford;Differenziale;Valida\n';
    rounds().forEach(function (r) {
      s += [r.date, r.course.replace(/;/g, ','), r.tee, fmt1(r.courseRating), r.slope, r.par, fmt1(r.hiUsed), r.playingHcp,
        r.stableford, fmt1(r.differential), r.valid ? 'si' : 'no'].join(';') + '\n';
    });
    shareFile('golf-hcp-' + today() + '.csv', s, 'text/csv');
  }

  // ---------------- copia di sicurezza completa ----------------
  function looksLikeBackup(buf) {
    var head = new TextDecoder('utf-8').decode(buf.subarray(0, 200));
    return /^\s*\{\s*"app"\s*:\s*"golfhcp-backup"/.test(head);
  }
  function doBackup() {
    var b = { app: 'golfhcp-backup', version: 1, saved: new Date().toISOString(), initialHi: state.initialHi, rounds: state.rounds };
    shareFile('golf-hcp-backup-' + today() + '.json', JSON.stringify(b), 'application/json');
  }
  function restoreBackup(buf) {
    var b;
    try { b = JSON.parse(new TextDecoder('utf-8').decode(buf)); } catch (e) { toast('Copia di sicurezza non valida'); return; }
    if (!Array.isArray(b.rounds)) { toast('Copia di sicurezza non valida'); return; }
    dialog('Ripristina copia di sicurezza', 'Il file contiene ' + b.rounds.length + ' gare (salvato il ' +
      displayDate((b.saved || '').substring(0, 10)) + ').\nSostituisce le ' + state.rounds.length + ' gare presenti ora.', [
      { label: 'Ripristina', primary: true, action: function () {
        state.rounds = b.rounds; if (typeof b.initialHi === 'number') state.initialHi = b.initialHi;
        persist(); refreshHeader(); showTab(currentTab); toast('Copia di sicurezza ripristinata');
      } },
      { label: 'Annulla' }
    ]);
  }

  // ---------------- impostazioni ----------------
  function buildSettings(c) {
    var card = el('div', 'card'); c.appendChild(card);
    var init = numInput('decimal', fmt1(state.initialHi));
    field(card, 'Handicap Index iniziale (usato finché non ci sono 3 gare valide)', init);
    var save = el('button', 'primary', 'Salva'); card.appendChild(save);
    save.onclick = function () {
      var s = init.value.trim();
      if (!s) return;
      state.initialHi = Math.min(54, G.parseDouble(s));
      persist(); refreshHeader(); toast('Salvato');
    };

    var c2 = el('div', 'card'); c.appendChild(c2);
    c2.appendChild(el('div', 'lbl', 'Campi e rating federgolf'));
    f.status = el('p', 'hint'); c2.appendChild(f.status);
    updateCourseStatus();
    var dl = el('button', 'secondary', 'Aggiorna rating ora'); c2.appendChild(dl);
    dl.onclick = function () { refreshCourses(true); };

    var c3 = el('div', 'card'); c.appendChild(c3);
    c3.appendChild(el('div', 'lbl', 'Copia di sicurezza'));
    c3.appendChild(el('p', 'hint', 'Le gare restano solo su questo iPhone. Salva ogni tanto una copia (in File, iCloud o via mail). ' +
      'Per ripristinarla usa "Importa storico" e scegli il file .json.'));
    var bk = el('button', 'secondary', 'Salva copia di sicurezza'); c3.appendChild(bk);
    bk.onclick = doBackup;

    var fm = el('div', 'formulas'); c.appendChild(fm);
    fm.textContent = 'Formule usate\n' +
      'HCP di gioco = HI × (Slope ÷ 113) + (CR − Par), arrotondato all\'intero.\n' +
      'Score differential = (113 ÷ Slope) × [Par + HCP di gioco − (Stableford − 36) − CR − PCC], al decimo.\n' +
      '9 buche: HCP di gioco = HI/2 × Slope/113 + (CR − Par); SD = differenziale delle 9 (con Stableford − 18) + 0,52 × HI + 1,2.\n' +
      'Punteggio eccezionale: SD almeno 7 sotto l\'HI → −1, almeno 10 sotto → −2, applicato a quella gara e alle 19 precedenti.\n' +
      'Handicap Index = media dei migliori 8 delle ultime 20 gare valide. Con meno di 20 gare si usa la tabella WHS ' +
      '(3 gare: migliore −2; 4: migliore −1; 5: migliore; 6: media 2 migliori −1; 7-8: 2; 9-11: 3; 12-14: 4; 15-16: 5; 17-18: 6; 19: 7).\n' +
      'Rating da ' + G.FEDERGOLF_URL + '\nVersione iPhone 0.8';
  }
  var refreshing = false;
  async function refreshCourses(manual) {
    if (refreshing) return;
    refreshing = true;
    updateCourseStatus('Aggiorno i rating…');
    var msg;
    try { msg = await downloadCourses(); }
    catch (e) { msg = 'Aggiornamento non riuscito: ' + e.message + (courses.length ? ' (uso i dati salvati)' : ''); }
    refreshing = false;
    updateCourseStatus();
    if (manual || msg.indexOf('Aggiornamento') === 0) { if (manual) toast(msg); }
  }

  // ---------------- dialoghi ----------------
  function dialog(title, message, buttons) {
    var ov = el('div', 'overlay'), box = el('div', 'dialog');
    if (title) box.appendChild(el('h3', null, title));
    if (message) box.appendChild(el('p', 'msg', message));
    var bs = el('div', 'buttons');
    buttons.forEach(function (b) {
      var btn = el('button', b.primary ? 'primary' : b.danger ? 'danger' : 'plain', b.label);
      btn.onclick = function () { ov.remove(); if (b.action) b.action(); };
      bs.appendChild(btn);
    });
    box.appendChild(bs); ov.appendChild(box);
    ov.addEventListener('click', function (e) { if (e.target === ov) ov.remove(); });
    document.body.appendChild(ov);
  }
  var toastTimer;
  function toast(s) {
    var t = $('toast');
    t.textContent = s; t.classList.add('show');
    clearTimeout(toastTimer);
    toastTimer = setTimeout(function () { t.classList.remove('show'); }, 3500);
  }

  // ---------------- avvio ----------------
  loadCourses();
  refreshHeader();
  [].forEach.call(document.querySelectorAll('.tabbar button'), function (b, k) { b.onclick = function () { showTab(k); }; });
  showTab(0);
  if (!courses.length || Date.now() - coursesTime > REFRESH_MS) refreshCourses(false);
  if (navigator.storage && navigator.storage.persist) navigator.storage.persist().catch(function () {});
  if ('serviceWorker' in navigator && location.protocol === 'https:') navigator.serviceWorker.register('sw.js').catch(function () {});
  window.GolfApp = { state: function () { return state; }, courses: function () { return courses; } };
})();
