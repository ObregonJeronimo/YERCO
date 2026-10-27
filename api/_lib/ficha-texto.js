/**
 * Descripcion e informacion nutricional de la ficha, dibujadas en vez de texto corrido.
 * Los textos vienen en un formato fijo:
 *   descripcion: parrafos, lineas "• ..." y un "Conservar ..." final;
 *   info nutricional: PORCIÓN: / INFORMACIÓN NUTRICIONAL POR PORCIÓN: (y a veces POR 100 g) /
 *   filas "Dato: valor" / INGREDIENTES: / ALÉRGENOS:.
 * Las viñetas salen como lista, las filas como tabla (una columna por cada "POR ...") e
 * ingredientes y alergenos en recuadros. Lo que no sigue el formato sale como antes, con saltos.
 * La misma logica esta en app.js (fichaDescHtml / fichaVnHtml) para la ventana del producto:
 * si se cambia una, cambiar la otra.
 */

/* Filas que van con sangria debajo de su total. */
const SUB = /^(Azúcares totales|Azúcares añadidos|Grasas saturadas|Grasas trans)$/i;

function descHtml(texto, esc) {
  const bloques = String(texto).replace(/\r/g, '').trim().split(/\n\s*\n/);
  let html = '', items = [];
  const cerrar = () => {
    if (items.length) html += '<ul class="ft-lista">' + items.map(i => '<li>' + esc(i) + '</li>').join('') + '</ul>';
    items = [];
  };
  for (const b of bloques) {
    const ls = b.split('\n').map(l => l.trim()).filter(Boolean);
    if (!ls.length) continue;
    if (ls.every(l => /^•\s/.test(l))) { items.push(...ls.map(l => l.replace(/^•\s+/, ''))); continue; }
    cerrar();
    html += '<p' + (/^Conservar/i.test(ls[0]) ? ' class="ft-conservar"' : '') + '>' + ls.map(esc).join('<br>') + '</p>';
  }
  cerrar();
  return html;
}

function vnHtml(texto, esc) {
  const ls = String(texto).replace(/\r/g, '').split('\n').map(l => l.trim());
  let porcion = '', modo = '';
  const cols = [], secs = [], extra = [];
  for (const l of ls) {
    let m;
    if (!l) { if (modo !== 'tabla') modo = ''; continue; }
    if (/^PORCI[ÓO]N:$/i.test(l)) { modo = 'porcion'; continue; }
    if ((m = l.match(/^INFORMACI[ÓO]N NUTRICIONAL POR (.+):$/i))) { cols.push({ titulo: m[1], filas: [] }); modo = 'tabla'; continue; }
    if ((m = l.match(/^(INGREDIENTES|AL[ÉE]RGENOS):$/i))) { secs.push({ alerg: /^AL/i.test(m[1]), txt: [] }); modo = 'sec'; continue; }
    if (modo === 'porcion') { porcion = porcion ? porcion + ' ' + l : l; continue; }
    if (modo === 'sec') { secs[secs.length - 1].txt.push(l); continue; }
    if (modo === 'tabla' && (m = l.match(/^([^:]{2,80}):\s*(.+)$/))) { cols[cols.length - 1].filas.push([m[1], m[2]]); continue; }
    extra.push(l);
  }
  if (!cols.length && !secs.length) return String(texto).trim().split(/\r?\n/).map(esc).join('<br>');

  let html = porcion ? '<p class="ft-porcion">Porción: <strong>' + esc(porcion) + '</strong></p>' : '';
  if (cols.length) {
    const nombres = [];
    cols.forEach(c => c.filas.forEach(f => { if (!nombres.includes(f[0])) nombres.push(f[0]); }));
    const titulo = c => /^porci[óo]n$/i.test(c.titulo) ? 'Por porción' : 'Por ' + c.titulo;
    const valor = v => /^no especificad/i.test(v)
      ? '<span class="ft-nd">No especificado</span>'
      : esc(v).replace(/\s*\(([^)]*kJ)\)/, '<small>$1</small>');
    html += '<table class="ft-tabla"><thead><tr><td></td>' + cols.map(c => '<th scope="col">' + esc(titulo(c)) + '</th>').join('') + '</tr></thead><tbody>' +
      nombres.map(n => '<tr' + (SUB.test(n) ? ' class="ft-sub"' : '') + '><th scope="row">' + esc(n) + '</th>' +
        cols.map(c => { const f = c.filas.find(x => x[0] === n); return '<td>' + (f ? valor(f[1]) : '') + '</td>'; }).join('') + '</tr>').join('') +
      '</tbody></table>';
  }
  if (extra.length) html += '<p class="ft-extra">' + extra.map(esc).join('<br>') + '</p>';
  secs.forEach(s => {
    html += '<div class="ft-caja' + (s.alerg ? ' ft-alergenos' : '') + '"><span class="ft-caja-tit">' + (s.alerg ? 'Alérgenos' : 'Ingredientes') + '</span><p>' + s.txt.map(esc).join('<br>') + '</p></div>';
  });
  return html;
}

module.exports = { descHtml, vnHtml };
