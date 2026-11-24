/* Golf HCP – logica di calcolo, lettura rating federgolf e import storico.
 * Porting 1:1 della versione Android 0.3 (HandicapCalc, FedergolfParser, HistoryImporter, SheetReader).
 * Nessuna dipendenza: gira nel browser (iPhone) e in Node (test). */
(function (root) {
  'use strict';

  var MAX_INDEX = 54.0;
  var FEDERGOLF_URL = 'https://areariservata.federgolf.it/SlopeAndCourseRating/Index';

  function round1(v) { return Math.round(v * 10.0) / 10.0; }

  // ---------------- HandicapCalc ----------------
  /** HCP di gioco = HI x (Slope / 113) + (CR - Par), arrotondato all'intero più vicino. */
  function playingHandicap(hi, slope, cr, par) {
    return Math.round(hi * (slope / 113.0) + (cr - par));
  }
  /** Score differential = (113 / Slope) x [Par + HCP di gioco - (Stableford - 36) - CR - PCC], al decimo. */
  function scoreDifferential(slope, par, phcp, stb, cr, pcc) {
    pcc = pcc || 0;
    return round1((113.0 / slope) * (par + phcp - (stb - 36) - cr - pcc));
  }
  /** 9 buche: HCP di gioco = (HI / 2) x (Slope / 113) + (CR - Par). */
  function playingHandicap9(hi, slope, cr, par) {
    return Math.round(hi / 2.0 * (slope / 113.0) + (cr - par));
  }
  /** 9 buche: differenziale delle 9 giocate + atteso sulle altre 9 (0,52 x HI + 1,2). */
  function scoreDifferential9(slope, par, phcp, stb, cr, pcc, hi) {
    var played = (113.0 / slope) * (par + phcp - (stb - 18) - cr - pcc);
    var expected = 0.52 * hi + 1.2;
    return round1(played + expected);
  }
  /** Punteggio eccezionale: -1 se SD almeno 7 sotto l'HI, -2 se almeno 10 sotto. */
  function exceptionalReduction(hiBefore, diff) {
    var gap = round1(hiBefore - diff);
    if (gap >= 10.0) return -2.0;
    if (gap >= 7.0) return -1.0;
    return 0;
  }
  /** Differenziali corretti: la riduzione si applica alla gara e alle 19 valide precedenti. Input dal più recente. */
  function adjusted(validNewestFirst) {
    var n = validNewestFirst.length, adj = [], i, j;
    for (i = 0; i < n; i++) adj[i] = validNewestFirst[i].differential;
    for (i = 0; i < n; i++) {
      var e = validNewestFirst[i].esr || 0;
      if (e !== 0) for (j = i; j < n && j < i + 20; j++) adj[j] += e;
    }
    return adj.map(round1);
  }
  /** HI dai differenziali (dal più recente): migliori 8 degli ultimi 20, tabella WHS sotto i 20. null se meno di 3. */
  function handicapIndex(diffsNewestFirst) {
    var n = Math.min(20, diffsNewestFirst.length);
    if (n < 3) return null;
    var last = diffsNewestFirst.slice(0, n).sort(function (a, b) { return a - b; });
    var take, adj = 0;
    if (n === 3) { take = 1; adj = -2.0; }
    else if (n === 4) { take = 1; adj = -1.0; }
    else if (n === 5) { take = 1; }
    else if (n === 6) { take = 2; adj = -1.0; }
    else if (n <= 8) take = 2;
    else if (n <= 11) take = 3;
    else if (n <= 14) take = 4;
    else if (n <= 16) take = 5;
    else if (n <= 18) take = 6;
    else if (n === 19) take = 7;
    else take = 8;
    var sum = 0;
    for (var i = 0; i < take; i++) sum += last[i];
    return Math.min(round1(sum / take + adj), MAX_INDEX);
  }
  function countingScores(validCount) {
    var n = Math.min(20, validCount);
    if (n < 3) return 0;
    if (n <= 5) return 1;
    if (n <= 8) return 2;
    if (n <= 11) return 3;
    if (n <= 14) return 4;
    if (n <= 16) return 5;
    if (n <= 18) return 6;
    if (n === 19) return 7;
    return 8;
  }

  // ---------------- gare ----------------
  function sortNewestFirst(list) {
    list.sort(function (a, b) {
      if (a.date !== b.date) return a.date < b.date ? 1 : -1;
      return (b.id || 0) - (a.id || 0);
    });
    return list;
  }
  function adjustedDifferentials(newestFirst) {
    return adjusted(newestFirst.filter(function (r) { return r.valid; }));
  }

  // ---------------- numeri ----------------
  function parseDouble(s) {
    if (s === null || s === undefined) return 0;
    var t = String(s).trim().replace(',', '.');
    if (!/^[-+]?(\d+\.?\d*|\.\d+)([eE][-+]?\d+)?$/.test(t)) return 0;
    var v = Number(t);
    return isFinite(v) ? v : 0;
  }
  function parseInt2(s) { return Math.round(parseDouble(s)); }
  function isNumber(s) { return /^-?\d+(\.\d+)?$/.test(String(s).trim().replace(',', '.')); }

  // ---------------- testo HTML ----------------
  function cleanHtml(s) {
    s = s.replace(/<br\s*\/?>/gi, ' ').replace(/<[^>]*>/g, '');
    s = s.replace(/&nbsp;/g, ' ').replace(/&amp;/g, '&').replace(/&quot;/g, '"').replace(/&#39;/g, "'")
      .replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&agrave;/g, 'à').replace(/&egrave;/g, 'è')
      .replace(/&eacute;/g, 'é').replace(/&igrave;/g, 'ì').replace(/&ograve;/g, 'ò').replace(/&ugrave;/g, 'ù');
    return s.replace(/\s+/g, ' ').trim();
  }

  // ---------------- FedergolfParser ----------------
  var COLORS = ['Nero', 'Bianco', 'Giallo', 'Verde', 'Blu', 'Rosso', 'Arancio'];
  var GENDERS = ['U', 'U', 'U', 'U', 'D', 'D', 'D'];
  var CSS = ['tee-nero', 'tee-bianco', 'tee-giallo', 'tee-verde', 'tee-blue', 'tee-rosso', 'tee-arancio'];

  function titleCase(s) {
    var out = '', up = true, low = s.toLocaleLowerCase('it-IT');
    for (var i = 0; i < low.length; i++) {
      var ch = low[i];
      out += up ? ch.toLocaleUpperCase('it-IT') : ch;
      up = !/\p{L}/u.test(ch) && ch !== "'";
    }
    return out;
  }

  /** Da 17 celle (Circolo, Percorso, Par, 7 coppie CR/Slope) a un percorso; attrs opzionali per il controllo colonne. */
  function courseFromCells(cells, attrs) {
    var par = parseInt2(cells[2]);
    if (par <= 0) return { bad: true };
    var c = { name: titleCase(cells[0]) + ' - ' + cells[1], tees: [] };
    for (var i = 0; i < 7; i++) {
      var ci = 3 + 2 * i;
      var cr = parseDouble(cells[ci]), slope = parseInt2(cells[ci + 1]);
      if (cr <= 0 || slope <= 0) continue;
      if (attrs) {
        var a = (attrs[ci] || '').toLowerCase();
        if (a.indexOf('class') >= 0 && a.indexOf('tee-') >= 0 && a.indexOf(CSS[i]) < 0)
          throw new Error('Ordine delle colonne cambiato (atteso ' + CSS[i] + ')');
      }
      c.tees.push({ color: COLORS[i], gender: GENDERS[i], cr: cr, slope: slope, par: par });
    }
    return c;
  }

  /** Legge la pagina HTML federgolf (stesse regole e controlli della versione Android). */
  function parseFedergolfHtml(html, minCourses) {
    if (minCourses === undefined) minCourses = 50;
    var tm = /<table[^>]*class="[^"]*\bslope\b[^"]*"[^>]*>([\s\S]*?)<\/table>/i.exec(html);
    if (!tm) throw new Error('Tabella dei rating non trovata nella pagina federgolf');
    var table = tm[1];
    var upper = cleanHtml(table.substring(0, 6000)).toLocaleUpperCase('it-IT');
    ['NERO', 'BIANCO', 'GIALLO', 'VERDE', 'ROSSO', 'ARANCIO'].forEach(function (c) {
      if (upper.indexOf(c) < 0) throw new Error('Intestazioni della tabella cambiate (manca ' + c + ')');
    });
    var out = [], bad = 0, rm, TR = /<tr[^>]*>([\s\S]*?)<\/tr>/gi;
    while ((rm = TR.exec(table))) {
      var cells = [], attrs = [], cm, TD = /<td([^>]*)>([\s\S]*?)<\/td>/gi;
      while ((cm = TD.exec(rm[1]))) { attrs.push(cm[1]); cells.push(cleanHtml(cm[2])); }
      if (!cells.length) continue;
      if (cells.length !== 17) { bad++; continue; }
      var c = courseFromCells(cells, attrs);
      if (c.bad) { bad++; continue; }
      if (c.tees.length) out.push(c);
    }
    if (out.length < minCourses) throw new Error('Trovati solo ' + out.length + ' percorsi (righe scartate: ' + bad + ')');
    return out;
  }

  /** Tabella compatta (una riga "Circolo|Percorso|Par|CR|Slope|..." per percorso) usata per la copia inclusa nell'app. */
  function parseCompactRows(lines) {
    var out = [];
    lines.forEach(function (l) {
      var cells = l.split('|');
      if (cells.length !== 17) return;
      var c = courseFromCells(cells, null);
      if (!c.bad && c.tees.length) out.push(c);
    });
    return out;
  }

  // ---------------- HistoryImporter ----------------
  function norm(s) { return s == null ? '' : String(s).trim().toLocaleLowerCase('it-IT').replace(/\s+/g, ' '); }
  function get(r, c) { return c >= 0 && c < r.length && r[c] != null ? String(r[c]).trim() : ''; }
  function isBlank(r) { for (var i = 0; i < r.length; i++) if (r[i] != null && String(r[i]).trim() !== '') return false; return true; }
  function isYes(s) {
    var v = norm(s);
    return v === 'si' || v === 'sì' || v === 's' || v === 'x' || v === '1' || v === 'true' || v === 'yes' || v === 'y' ||
      v === 'v' || v.indexOf('valid') === 0 || v === '*';
  }
  function isTeamFormula(f) {
    var v = norm(f);
    return v.indexOf('louisiana') >= 0 || v.indexOf('l2s') >= 0 || v.indexOf('greensome') >= 0 || v.indexOf('foursome') >= 0 ||
      v.indexOf('texas') >= 0 || v.indexOf('scramble') >= 0 || v.indexOf('coppie') >= 0 || v.indexOf('best ball') >= 0 ||
      v.indexOf('4 palle') >= 0 || v.indexOf('quattro palle') >= 0 || v === 'l2s' || v === 'l4m' || v === 'p2s' || v === 'gss';
  }
  function pad2(n) { return (n < 10 ? '0' : '') + n; }
  function fmtDate(y, mo, d) {
    if (mo < 1 || mo > 12 || d < 1 || d > 31) return null;
    return String(y).padStart(4, '0') + '-' + pad2(mo) + '-' + pad2(d);
  }
  /** yyyy-MM-dd oppure null. Accetta gg/mm/aaaa, aaaa-mm-gg e il numero seriale di Excel. */
  function parseDate(s) {
    if (s == null) return null;
    s = String(s).trim();
    if (!s) return null;
    var m = /(\d{4})-(\d{1,2})-(\d{1,2})/.exec(s);
    if (m) return fmtDate(+m[1], +m[2], +m[3]);
    m = /(\d{1,2})[\/.-](\d{1,2})[\/.-](\d{2,4})/.exec(s);
    if (m) { var y = +m[3]; if (y < 100) y += 2000; return fmtDate(y, +m[2], +m[1]); }
    if (/^\d{5}(\.\d+)?$/.test(s)) {
      var d = new Date(Date.UTC(1899, 11, 30) + Math.floor(Number(s)) * 86400000);
      return fmtDate(d.getUTCFullYear(), d.getUTCMonth() + 1, d.getUTCDate());
    }
    return null;
  }

  function newRound() {
    return { id: 0, date: '', course: '', tee: '', courseRating: 0, slope: 0, par: 0, hiUsed: 0, playingHcp: 0,
      stableford: 0, differential: 0, valid: true, imported: false, esr: 0, pcc: 0, holes: 18 };
  }

  function parseHistory(rows) {
    var res = { rounds: [], skipped: 0, columns: '', error: null, teamSkipped: 0, federIndex: null };
    var header = -1;
    var cDate = -1, cDiff = -1, cStb = -1, cCr = -1, cSlope = -1, cPar = -1, cValid = -1, cPhcp = -1, cHi = -1,
      cHiNew = -1, cTee = -1, cClub = -1, cEvent = -1, cFormula = -1, cEsr = -1, cPcc = -1, cHoles = -1, cCorrDiff = -1;
    for (var i = 0; i < Math.min(rows.length, 30) && header < 0; i++) {
      var r = rows[i], d = -1, df = -1, st = -1, j, h;
      for (j = 0; j < r.length; j++) {
        h = norm(r[j]);
        if (d < 0 && h.indexOf('data') === 0) d = j;
        if (df < 0 && (h.indexOf('differen') >= 0 || h === 'sd' || h.indexOf('score diff') >= 0)) df = j;
        if (st < 0 && (h.indexOf('stableford') >= 0 || h.indexOf('stb') === 0 || h === 'punti')) st = j;
      }
      if (d < 0 || (df < 0 && st < 0)) continue;
      header = i; cDate = d; cDiff = df; cStb = st;
      var cCircolo = -1, cPercorso = -1;
      for (j = 0; j < r.length; j++) {
        h = norm(r[j]);
        if (cCorrDiff < 0 && (h === 'corr sd' || h === 'sd corr' || h.indexOf('sd corrett') >= 0 || h.indexOf('differenziale corr') >= 0)) cCorrDiff = j;
        if (cEsr < 0 && (h === 'corr' || h.indexOf('esr') >= 0 || h.indexOf('eccezional') >= 0)) cEsr = j;
        if (cPcc < 0 && h === 'pcc') cPcc = j;
        if (cHoles < 0 && h.indexOf('buche') === 0 && h.indexOf('valid') < 0) cHoles = j;
        if (cClub < 0 && h.indexOf('esecutore') >= 0) cClub = j;
        if (cCircolo < 0 && (h.indexOf('circolo') >= 0 || h.indexOf('club') >= 0 || h.indexOf('campo') >= 0)) cCircolo = j;
        if (cPercorso < 0 && h.indexOf('percorso') >= 0) cPercorso = j;
        if (cEvent < 0 && h === 'gara') cEvent = j;
        if (cFormula < 0 && h.indexOf('formula') === 0) cFormula = j;
        if (cCr < 0 && (h === 'cr' || h.indexOf('course rating') >= 0)) cCr = j;
        if (cSlope < 0 && (h.indexOf('slope') >= 0 || h === 'sr')) cSlope = j;
        if (cPar < 0 && (h === 'par' || h.indexOf('par ') === 0)) cPar = j;
        if (cValid < 0 && h.indexOf('buche') !== 0 && (h.indexOf('valid') >= 0 || h.indexOf('valev') >= 0)) cValid = j;
        if (cPhcp < 0 && (h.indexOf('gioco') >= 0 || h.indexOf('playing') >= 0 || h.indexOf('course handicap') >= 0)) cPhcp = j;
        if (h.indexOf('index') >= 0 || h === 'hi' || h === 'ega') {
          if (h.indexOf('nuov') >= 0 || h.indexOf('new') >= 0 || h.indexOf('dopo') >= 0) { if (cHiNew < 0) cHiNew = j; }
          else if (cHi < 0) cHi = j;
        }
        if (cTee < 0 && (h.indexOf('tee') >= 0 || h.indexOf('battitor') >= 0)) cTee = j;
      }
      if (cClub < 0) cClub = cCircolo >= 0 ? cCircolo : cPercorso;
    }
    if (header < 0) {
      res.error = 'Non trovo le colonne: servono almeno "Data" e "SD" (o "Stableford").';
      return res;
    }
    res.columns = 'Data, SD' + (cEsr >= 0 ? ', Corr' : '') + (cValid >= 0 ? ', Valida' : '') + (cClub >= 0 ? ', circolo' : '') +
      (cFormula >= 0 ? ', formula' : '') + (cHiNew >= 0 ? ', index nuovo' : '');

    var newestDate = '';
    for (i = header + 1; i < rows.length; i++) {
      r = rows[i];
      var date = parseDate(get(r, cDate));
      if (date == null) { if (!isBlank(r)) res.skipped++; continue; }
      var x = newRound();
      x.imported = true;
      x.date = date;
      var club = get(r, cClub), event = get(r, cEvent);
      x.course = !club ? event : (!event ? club : club + ' · ' + event);
      x.tee = get(r, cTee);
      x.courseRating = parseDouble(get(r, cCr));
      x.slope = parseInt2(get(r, cSlope));
      x.par = parseInt2(get(r, cPar));
      x.stableford = parseInt2(get(r, cStb));
      x.playingHcp = parseInt2(get(r, cPhcp));
      x.hiUsed = parseDouble(get(r, cHi));
      var hiNew = get(r, cHiNew);
      if (hiNew && isNumber(hiNew)) {
        x.hiFed = parseDouble(hiNew);   // "Index Nuovo" ufficiale di quella gara, usato dal grafico Andamento
        if (date >= newestDate) { newestDate = date; res.federIndex = x.hiFed; }
      }
      var notValid = cValid >= 0 ? !isYes(get(r, cValid)) : isTeamFormula(get(r, cFormula));
      var team = notValid;
      x.esr = parseDouble(get(r, cEsr));
      x.pcc = parseInt2(get(r, cPcc));
      var holes = parseInt2(get(r, cHoles));
      x.holes = holes > 0 ? holes : (x.par > 0 && x.par < 50 ? 9 : 18);
      var diff = get(r, cDiff);
      if (diff && isNumber(diff)) {
        x.differential = round1(parseDouble(diff));
      } else if (!team && x.holes >= 18 && x.slope > 0 && x.par > 0 && x.courseRating > 0 && cStb >= 0 && cPhcp >= 0 && get(r, cStb)) {
        x.differential = scoreDifferential(x.slope, x.par, x.playingHcp, x.stableford, x.courseRating, x.pcc);
      } else {
        if (team) res.teamSkipped++; else res.skipped++;
        continue;
      }
      x.valid = !notValid;
      res.rounds.push(x);
    }
    // ordine cronologico dentro il file (l'export federgolf va dal più recente): serve a scegliere
    // l'"Index Nuovo" dell'ultima gara giocata quando ce ne sono più nello stesso giorno
    var n = res.rounds.length, desc = n > 1 && res.rounds[0].date > res.rounds[n - 1].date;
    res.rounds.forEach(function (r, k) { if (typeof r.hiFed === 'number') r.fedSeq = desc ? n - 1 - k : k; });
    return res;
  }

  // ---------------- SheetReader (xlsx / csv / html) ----------------
  function xmlDecode(s) {
    return s.replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&quot;/g, '"').replace(/&apos;/g, "'")
      .replace(/&#x([0-9a-fA-F]+);/g, function (_, h) { return String.fromCodePoint(parseInt(h, 16)); })
      .replace(/&#(\d+);/g, function (_, d) { return String.fromCodePoint(+d); })
      .replace(/&amp;/g, '&');
  }

  async function inflateRaw(bytes) {
    var ds = new DecompressionStream('deflate-raw');
    var stream = new Blob([bytes]).stream().pipeThrough(ds);
    return new Uint8Array(await new Response(stream).arrayBuffer());
  }

  /** Estrae da uno zip i file richiesti (lettura della directory centrale). */
  async function unzip(u8, wanted) {
    var dv = new DataView(u8.buffer, u8.byteOffset, u8.byteLength);
    var eocd = -1;
    for (var i = u8.length - 22; i >= Math.max(0, u8.length - 65557); i--) {
      if (dv.getUint32(i, true) === 0x06054b50) { eocd = i; break; }
    }
    if (eocd < 0) throw new Error('File Excel non valido');
    var count = dv.getUint16(eocd + 10, true), off = dv.getUint32(eocd + 16, true);
    var dec = new TextDecoder('utf-8'), files = {};
    for (var k = 0; k < count; k++) {
      if (dv.getUint32(off, true) !== 0x02014b50) break;
      var method = dv.getUint16(off + 10, true), csize = dv.getUint32(off + 20, true);
      var nlen = dv.getUint16(off + 28, true), elen = dv.getUint16(off + 30, true), clen = dv.getUint16(off + 32, true);
      var lho = dv.getUint32(off + 42, true);
      var name = dec.decode(u8.subarray(off + 46, off + 46 + nlen));
      off += 46 + nlen + elen + clen;
      if (!wanted(name)) continue;
      var lnlen = dv.getUint16(lho + 26, true), lelen = dv.getUint16(lho + 28, true);
      var data = u8.subarray(lho + 30 + lnlen + lelen, lho + 30 + lnlen + lelen + csize);
      files[name] = method === 0 ? data : await inflateRaw(data);
    }
    return files;
  }

  function parseShared(xml) {
    var out = [], m, SI = /<si>([\s\S]*?)<\/si>|<si\/>/g;
    while ((m = SI.exec(xml))) {
      var s = '', t, T = /<t(?:\s[^>]*)?>([\s\S]*?)<\/t>/g;
      if (m[1]) while ((t = T.exec(m[1]))) s += xmlDecode(t[1]);
      out.push(s);
    }
    return out;
  }
  function colIndex(ref) {
    var c = 0;
    for (var i = 0; i < ref.length; i++) {
      var ch = ref.charCodeAt(i);
      if (ch >= 65 && ch <= 90) c = c * 26 + (ch - 64); else break;
    }
    return c - 1;
  }
  function parseSheet(xml, shared) {
    var rows = [], rm, ROW = /<row\b[^>]*?(?:\/>|>([\s\S]*?)<\/row>)/g;
    while ((rm = ROW.exec(xml))) {
      var row = [], cm, C = /<c\b([^>]*?)(?:\/>|>([\s\S]*?)<\/c>)/g, body = rm[1] || '';
      while ((cm = C.exec(body))) {
        var attrs = cm[1], inner = cm[2] || '';
        var tm = /\bt="([^"]*)"/.exec(attrs), rr = /\br="([A-Z]+)\d*"/.exec(attrs);
        var col = rr ? colIndex(rr[1]) : row.length;
        var v = '', vm = /<v>([\s\S]*?)<\/v>/.exec(inner);
        if (vm) v = xmlDecode(vm[1]);
        else { var T = /<t(?:\s[^>]*)?>([\s\S]*?)<\/t>/g, t; while ((t = T.exec(inner))) v += xmlDecode(t[1]); }
        if (tm && tm[1] === 's') { var idx = parseInt(v.trim(), 10); if (!isNaN(idx) && idx < shared.length) v = shared[idx]; }
        while (row.length < col) row.push('');
        row.push(v);
      }
      rows.push(row);
    }
    return rows;
  }
  async function readXlsx(u8) {
    var files = await unzip(u8, function (n) {
      return n === 'xl/sharedStrings.xml' || n.indexOf('xl/worksheets/sheet') === 0;
    });
    var dec = new TextDecoder('utf-8');
    var shared = files['xl/sharedStrings.xml'] ? parseShared(dec.decode(files['xl/sharedStrings.xml'])) : [];
    var sheet = files['xl/worksheets/sheet1.xml'];
    if (!sheet) for (var k in files) if (k.indexOf('xl/worksheets/sheet') === 0) { sheet = files[k]; break; }
    if (!sheet) throw new Error('Nessun foglio trovato nel file Excel');
    return parseSheet(dec.decode(sheet), shared);
  }
  function count(s, c) { var n = 0; for (var i = 0; i < s.length; i++) if (s[i] === c) n++; return n; }
  function splitCsv(line, sep) {
    var out = [], cur = '', q = false;
    for (var i = 0; i < line.length; i++) {
      var ch = line[i];
      if (q) {
        if (ch === '"') { if (line[i + 1] === '"') { cur += '"'; i++; } else q = false; }
        else cur += ch;
      } else if (ch === '"') q = true;
      else if (ch === sep) { out.push(cur.trim()); cur = ''; }
      else cur += ch;
    }
    out.push(cur.trim());
    return out;
  }
  function readCsv(u8) {
    var text = new TextDecoder('utf-8').decode(u8);
    if (text.indexOf('�') >= 0) text = new TextDecoder('windows-1252').decode(u8);
    if (text.charCodeAt(0) === 0xFEFF) text = text.substring(1);
    var lines = text.split(/\r\n|\n|\r/);
    if (lines.length && lines[lines.length - 1] === '') lines.pop();
    var first = lines[0], sep = ';';
    if (first != null) {
      var sc = count(first, ';'), cc = count(first, ','), tc = count(first, '\t');
      if (tc > sc && tc > cc) sep = '\t'; else if (cc > sc) sep = ',';
    }
    return lines.map(function (l) { return splitCsv(l, sep); });
  }
  function readHtmlTable(html) {
    var rows = [], low = html.toLowerCase(), pos = 0;
    function cellStart(s, from) { var a = s.indexOf('<td', from), b = s.indexOf('<th', from); if (a < 0) return b; if (b < 0) return a; return Math.min(a, b); }
    function cellEnd(s, from) { if (from < 0) return -1; var a = s.indexOf('</td', from), b = s.indexOf('</th', from); if (a < 0) return b; if (b < 0) return a; return Math.min(a, b); }
    while (true) {
      var tr = low.indexOf('<tr', pos);
      if (tr < 0) break;
      var end = low.indexOf('</tr', tr);
      if (end < 0) end = low.length;
      var seg = html.substring(tr, end), segLow = seg.toLowerCase(), row = [], cp = 0;
      while (true) {
        var td = cellStart(segLow, cp);
        if (td < 0) break;
        var gt = segLow.indexOf('>', td);
        if (gt < 0) break;
        var close = cellEnd(segLow, gt);
        if (close < 0) close = seg.length;
        row.push(cleanHtml(seg.substring(gt + 1, close)));
        cp = close + 1;
      }
      if (row.length) rows.push(row);
      pos = end + 1;
    }
    return rows;
  }
  /** Primo foglio di un .xlsx, oppure .csv/.txt, oppure tabella HTML: righe di testo. */
  async function readSheet(u8) {
    if (u8.length > 2 && u8[0] === 0x50 && u8[1] === 0x4B) return readXlsx(u8);
    var head = new TextDecoder('latin1').decode(u8.subarray(0, Math.min(u8.length, 2000))).toLowerCase();
    if (head.indexOf('<table') >= 0 || head.indexOf('<html') >= 0) return readHtmlTable(new TextDecoder('utf-8').decode(u8));
    return readCsv(u8);
  }

  // ---------------- andamento HCP ----------------
  /** Un punto per ogni giorno con gare: HI dopo tutte le gare fino a quel giorno (almeno 3 valide).
   *  Se l'ultima gara del giorno è importata con l'"Index Nuovo" federgolf, usa quel valore ufficiale. */
  function indexHistory(allRounds) {
    var chrono = allRounds.slice().sort(function (a, b) {
      if (a.date !== b.date) return a.date < b.date ? -1 : 1;
      return (a.id || 0) - (b.id || 0);
    });
    var out = [], sofar = [];
    for (var i = 0; i < chrono.length; i++) {
      sofar.push(chrono[i]);
      if (i + 1 < chrono.length && chrono[i + 1].date === chrono[i].date) continue;   // un punto per giorno
      var dayRounds = sofar.filter(function (r) { return r.date === chrono[i].date; });
      var fed = null, seq = -1;
      dayRounds.forEach(function (r) {
        if (typeof r.hiFed === 'number' && (r.fedSeq || 0) >= seq) { fed = r.hiFed; seq = r.fedSeq || 0; }
      });
      var hi = fed !== null ? fed : handicapIndex(adjustedDifferentials(sortNewestFirst(sofar.slice())));
      if (hi === null) continue;
      out.push({ date: chrono[i].date, hi: hi, official: fed !== null, rounds: dayRounds.length });
    }
    return out;
  }
  /** Punti nel periodo [from, to] (aaaa-mm-gg, estremi inclusi) e riepilogo. */
  function trendSummary(points, from, to) {
    var pts = points.filter(function (p) { return (!from || p.date >= from) && (!to || p.date <= to); });
    if (!pts.length) return { points: pts };
    var min = pts[0], max = pts[0];
    pts.forEach(function (p) { if (p.hi < min.hi) min = p; if (p.hi > max.hi) max = p; });
    // HI a inizio periodo: l'ultimo punto alla data di inizio o prima; se non c'è, il primo del periodo
    var before = null;
    points.forEach(function (p) { if (from && p.date <= from) before = p; });
    var start = before || pts[0], end = pts[pts.length - 1];
    return { points: pts, start: start, end: end, change: round1(end.hi - start.hi), min: min, max: max, before: before };
  }

  var api = {
    indexHistory: indexHistory, trendSummary: trendSummary,
    MAX_INDEX: MAX_INDEX, FEDERGOLF_URL: FEDERGOLF_URL, round1: round1,
    playingHandicap: playingHandicap, scoreDifferential: scoreDifferential,
    playingHandicap9: playingHandicap9, scoreDifferential9: scoreDifferential9,
    exceptionalReduction: exceptionalReduction, adjusted: adjusted, handicapIndex: handicapIndex,
    countingScores: countingScores, sortNewestFirst: sortNewestFirst, adjustedDifferentials: adjustedDifferentials,
    parseDouble: parseDouble, parseInt: parseInt2, parseDate: parseDate, newRound: newRound,
    parseFedergolfHtml: parseFedergolfHtml, parseCompactRows: parseCompactRows, titleCase: titleCase,
    parseHistory: parseHistory, readSheet: readSheet, cleanHtml: cleanHtml
  };
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
  else root.GolfCore = api;
})(typeof self !== 'undefined' ? self : this);
