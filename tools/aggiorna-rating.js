// Scarica la tabella federgolf e aggiorna ratings.json e ratings.js (usato dall'aggiornamento settimanale su GitHub).
// Se il formato della pagina cambia non tocca i file: l'app continua con gli ultimi dati validi.
const fs = require('fs');
const path = require('path');
const G = require('../golf-core.js');
(async () => {
  const r = await fetch(G.FEDERGOLF_URL, { headers: { 'User-Agent': 'Mozilla/5.0 GolfHCP' } });
  if (!r.ok) throw new Error('federgolf.it ha risposto ' + r.status);
  const list = G.parseFedergolfHtml(await r.text());
  const order = ['Nero', 'Bianco', 'Giallo', 'Verde', 'Blu', 'Rosso', 'Arancio'];
  const rows = list.map(c => {
    const i = c.name.indexOf(' - ');
    const cells = [c.name.substring(0, i).toUpperCase(), c.name.substring(i + 3), c.tees[0].par];
    order.forEach(col => { const t = c.tees.find(x => x.color === col); cells.push(t ? t.cr.toFixed(1) : '', t ? t.slope : ''); });
    return cells.join('|');
  });
  const root = path.join(__dirname, '..');
  const old = JSON.parse(fs.readFileSync(path.join(root, 'ratings.json'), 'utf8'));
  if (JSON.stringify(old.rows) === JSON.stringify(rows)) { console.log('Nessuna variazione (' + rows.length + ' percorsi)'); return; }
  const data = { date: new Date().toISOString().substring(0, 10), source: 'federgolf.it', rows };
  fs.writeFileSync(path.join(root, 'ratings.json'), JSON.stringify(data));
  fs.writeFileSync(path.join(root, 'ratings.js'), '/* Tabella Slope e Course Rating da ' + G.FEDERGOLF_URL + ' */\nself.GOLF_RATINGS = ' + JSON.stringify(data) + ';\n');
  console.log('Aggiornati ' + rows.length + ' percorsi');
})().catch(e => { console.error(e.message); process.exit(1); });
