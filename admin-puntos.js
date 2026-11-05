/* =============================================================================
   PROGRAMA DE PUNTOS  —  sección "Puntos" del panel
   =============================================================================
   Cuatro pestañas:
     Resumen        puntos en manos de los clientes y lo que valen en $ (es plata que
                    el negocio debe en descuentos), ganados, usados y vencidos.
     Configuración  config/puntos: prendido / solo probadores, cuánto se gana, cuánto
                    vale un punto, mínimo, tope por compra, vencimiento, cupones.
     Tienda         puntosPremios: productos del catálogo que se canjean por puntos.
     Clientes       saldo de cada uno (puntos/{uid}), sus movimientos y ajuste a mano.

   Quién mueve los saldos: las Cloud Functions (functions/puntos.js) al confirmar un
   pedido y al quedar una venta "Pagó", y este panel solo con el ajuste manual, que
   deja su movimiento y queda en Historial. La tienda solo los lee.

   ptNorm es la gemela de normalizarConfig de functions/puntos.js y de la de app.js:
   si se cambia una, cambiar las otras.
   ============================================================================= */

const PT_DEFECTO = { activo: false, probadores: [], pesosPorPunto: 1000, valorPunto: 20, minimoParaUsar: 50, topePorcentaje: 30, mesesVencimiento: 12, combinarConCupon: true };
let _ptCfg = null;          /* config normalizada, la que está guardada */
let _ptPremios = [];
let _ptSaldos = [];         /* [{uid, saldo, ...}] */
let _ptClientes = {};       /* uid -> {nombre, apellido, email} de clientesAuth */
let _ptTab = 'resumen';
let _ptPremioEdit = null;   /* id del premio que se edita, o null si es nuevo */
let _ptPremioProd = null;   /* producto elegido en el modal de premio */
let _ptClienteUid = null;

function ptNum(v, def, min, max) { const n = Number(v); return isFinite(n) ? Math.min(max, Math.max(min, n)) : def; }
function ptNorm(c) {
  c = c || {};
  return {
    activo: c.activo === true,
    probadores: Array.isArray(c.probadores) ? c.probadores.filter(x => typeof x === 'string') : [],
    pesosPorPunto: Math.round(ptNum(c.pesosPorPunto, PT_DEFECTO.pesosPorPunto, 1, 10000000)),
    valorPunto: ptNum(c.valorPunto, PT_DEFECTO.valorPunto, 0, 1000000),
    minimoParaUsar: Math.round(ptNum(c.minimoParaUsar, PT_DEFECTO.minimoParaUsar, 0, 1000000)),
    topePorcentaje: ptNum(c.topePorcentaje, PT_DEFECTO.topePorcentaje, 0, 100),
    mesesVencimiento: Math.round(ptNum(c.mesesVencimiento, PT_DEFECTO.mesesVencimiento, 0, 120)),
    combinarConCupon: c.combinarConCupon !== false,
  };
}
const ptPesos = n => '$' + Math.round(Number(n) || 0).toLocaleString('es-AR');
const ptPts = n => (Math.round(Number(n) || 0)).toLocaleString('es-AR');
const ptFecha = f => { const d = f && f.toDate ? f.toDate() : (f ? new Date(f) : null); return d && !isNaN(d) ? d.toLocaleDateString('es-AR') : '-'; };
function ptNombreCliente(uid) {
  const c = _ptClientes[uid];
  if (!c) return 'Cliente sin datos';
  return ((c.nombre || '') + ' ' + (c.apellido || '')).trim() || c.email || 'Cliente sin nombre';
}
function ptPrecioFinal(p) { return Math.round((Number(p.precio) || 0) * (1 - (Number(p.descuento) || 0) / 100)); }

async function loadPuntos() {
  const cont = document.getElementById('ptPanelResumen');
  if (cont) cont.innerHTML = '<div class="empty-state" style="padding:2rem"><p>Cargando...</p></div>';
  try {
    const [cfgS, premS, salS, cliS] = await Promise.all([
      db.collection('config').doc('puntos').get(),
      db.collection('puntosPremios').get(),
      db.collection('puntos').get(),
      db.collection('clientesAuth').get(),
    ]);
    _ptCfg = ptNorm(cfgS.exists ? cfgS.data() : null);
    _ptPremios = premS.docs.map(d => Object.assign({ id: d.id }, d.data()))
      .sort((a, b) => (a.puntos || 0) - (b.puntos || 0));
    _ptSaldos = salS.docs.map(d => Object.assign({ uid: d.id }, d.data()));
    _ptClientes = {};
    cliS.docs.forEach(d => { _ptClientes[d.id] = d.data(); });
    if (typeof allProducts !== 'undefined' && !allProducts.length && typeof loadProducts === 'function') {
      try { await loadProducts(); } catch (e) { /* sin catalogo la tienda de canjes muestra lo guardado */ }
    }
  } catch (e) {
    if (cont) cont.innerHTML = '<div class="empty-state"><p>Error: ' + esc(e.message) + '</p></div>';
    return;
  }
  ptRenderEstado();
  ptRenderResumen();
  ptRenderConfig();
  ptRenderPremios();
  ptRenderClientes();
  ptTab(_ptTab);
}

function ptTab(t) {
  _ptTab = t;
  document.querySelectorAll('#sec-puntos .pt-tab').forEach(b => b.classList.toggle('active', b.getAttribute('data-tab') === t));
  ['resumen', 'config', 'premios', 'clientes'].forEach(x => {
    const el = document.getElementById('ptPanel' + x.charAt(0).toUpperCase() + x.slice(1));
    if (el) el.style.display = x === t ? '' : 'none';
  });
}

function ptRenderEstado() {
  const el = document.getElementById('ptEstadoChip');
  if (!el || !_ptCfg) return;
  if (_ptCfg.activo) { el.className = 'pt-chip on'; el.textContent = 'Activo para todos'; }
  else if (_ptCfg.probadores.length) { el.className = 'pt-chip prueba'; el.textContent = 'Solo probadores (' + _ptCfg.probadores.length + ')'; }
  else { el.className = 'pt-chip off'; el.textContent = 'Apagado'; }
}

/* ------------------------------------------------------------------ Resumen */
function ptRenderResumen() {
  const cont = document.getElementById('ptPanelResumen');
  if (!cont) return;
  const cfg = _ptCfg;
  let circulacion = 0, conSaldo = 0, ganado = 0, usado = 0, vencido = 0;
  _ptSaldos.forEach(s => {
    const sal = Number(s.saldo) || 0;
    if (sal > 0) { circulacion += sal; conSaldo++; }
    ganado += Number(s.ganadoTotal) || 0;
    usado += Number(s.usadoTotal) || 0;
    vencido += Number(s.vencidoTotal) || 0;
  });
  const tile = (tit, val, sub, color) => '<div class="pt-tile"><div class="pt-tile-tit">' + tit + '</div><strong style="color:' + (color || 'var(--accent-light)') + '">' + val + '</strong>' + (sub ? '<div class="pt-tile-sub">' + sub + '</div>' : '') + '</div>';
  const top = _ptSaldos.filter(s => (Number(s.saldo) || 0) > 0).sort((a, b) => b.saldo - a.saldo).slice(0, 8);
  cont.innerHTML =
    '<div class="pt-tiles">' +
      tile('Puntos sin usar', ptPts(circulacion), conSaldo + ' cliente' + (conSaldo === 1 ? '' : 's') + ' con saldo') +
      tile('Valen en descuentos', ptPesos(circulacion * cfg.valorPunto), 'lo que el negocio debe hoy', 'var(--warning)') +
      tile('Ganados', ptPts(ganado), 'desde que arrancó') +
      tile('Usados', ptPts(usado), 'descuentos y canjes', '#67c23a') +
      tile('Vencidos', ptPts(vencido), cfg.mesesVencimiento ? cfg.mesesVencimiento + ' meses sin comprar' : 'no vencen', 'var(--text-dim)') +
    '</div>' +
    '<div class="card pt-explica">' + ptTextoReglas(cfg) + '</div>' +
    (top.length
      ? '<h4 class="pt-h4">Más puntos acumulados</h4><div class="hist-list">' + top.map(s =>
          '<div class="pt-fila" onclick="ptAbrirCliente(\'' + esc(s.uid) + '\')"><span>' + esc(ptNombreCliente(s.uid)) + '</span><span class="pt-fila-num">' + ptPts(s.saldo) + ' pts <small>' + ptPesos(s.saldo * cfg.valorPunto) + '</small></span></div>').join('') + '</div>'
      : '<p class="pt-vacio">Todavía nadie tiene puntos. Se acreditan cuando una venta de un cliente con cuenta en la web está en "Pagó" y, si vino de un pedido web, ese pedido está "Entregado".</p>');
}

function ptTextoReglas(cfg) {
  const pct = cfg.pesosPorPunto > 0 ? (cfg.valorPunto / cfg.pesosPorPunto * 100) : 0;
  const ej = 100000;
  const ejPts = Math.floor(ej / cfg.pesosPorPunto);
  return '<div class="pt-reglas">' +
    '<div><b>Ganan</b> 1 punto cada ' + ptPesos(cfg.pesosPorPunto) + ' que pagan en productos (sin el envío).</div>' +
    '<div><b>Cada punto</b> vale ' + ptPesos(cfg.valorPunto) + ' de descuento. Equivale a devolver un <b>' + pct.toLocaleString('es-AR', { maximumFractionDigits: 2 }) + '%</b> de lo que compran.</div>' +
    '<div><b>Ejemplo:</b> una compra de ' + ptPesos(ej) + ' suma ' + ptPts(ejPts) + ' puntos = ' + ptPesos(ejPts * cfg.valorPunto) + ' de descuento en la próxima.</div>' +
    '<div><b>Para usarlos</b> necesitan ' + ptPts(cfg.minimoParaUsar) + ' puntos como mínimo, y cubren hasta el ' + cfg.topePorcentaje + '% de los productos de una compra' + (cfg.combinarConCupon ? '' : ' (no se combinan con cupones)') + '.</div>' +
    '<div><b>Vencen</b> ' + (cfg.mesesVencimiento ? 'si pasan ' + cfg.mesesVencimiento + ' meses sin comprar.' : 'nunca.') + '</div>' +
  '</div>';
}

/* ------------------------------------------------------------- Configuración */
function ptRenderConfig() {
  const c = _ptCfg;
  if (!c) return;
  const set = (id, v) => { const el = document.getElementById(id); if (el) { if (el.type === 'checkbox') el.checked = !!v; else el.value = v; } };
  set('ptActivo', c.activo);
  set('ptPesosPorPunto', c.pesosPorPunto);
  set('ptValorPunto', c.valorPunto);
  set('ptMinimo', c.minimoParaUsar);
  set('ptTope', c.topePorcentaje);
  set('ptMeses', c.mesesVencimiento);
  set('ptCupon', c.combinarConCupon);
  ptRenderProbadores(c.probadores);
  ptPreview();
}

function ptLeerForm() {
  const v = id => document.getElementById(id);
  return ptNorm({
    activo: v('ptActivo').checked,
    probadores: _ptProbadoresForm.slice(),
    pesosPorPunto: montoAR(v('ptPesosPorPunto').value),
    valorPunto: montoAR(v('ptValorPunto').value),
    minimoParaUsar: parseInt(v('ptMinimo').value, 10),
    topePorcentaje: parseFloat(String(v('ptTope').value).replace(',', '.')),
    mesesVencimiento: parseInt(v('ptMeses').value, 10),
    combinarConCupon: v('ptCupon').checked,
  });
}

function ptPreview() {
  const el = document.getElementById('ptPreview');
  if (!el || !_ptCfg) return;
  let c;
  try { c = ptLeerForm(); } catch (e) { return; }
  let aviso = '';
  if (c.valorPunto < _ptCfg.valorPunto && _ptSaldos.some(s => (Number(s.saldo) || 0) > 0)) {
    aviso = '<div class="pt-aviso"><i class="bi bi-exclamation-triangle"></i> Bajar el valor del punto achica lo que ya juntaron los clientes (de ' + ptPesos(_ptCfg.valorPunto) + ' a ' + ptPesos(c.valorPunto) + ' cada uno). Conviene avisarles antes.</div>';
  }
  const pct = c.pesosPorPunto > 0 ? c.valorPunto / c.pesosPorPunto * 100 : 0;
  if (pct > 10) aviso += '<div class="pt-aviso"><i class="bi bi-exclamation-triangle"></i> Estás devolviendo más del 10% de cada compra. Revisá que el margen lo aguante.</div>';
  el.innerHTML = ptTextoReglas(c) + aviso;
}

let _ptProbadoresForm = [];
function ptRenderProbadores(lista) {
  _ptProbadoresForm = (lista || []).slice();
  const el = document.getElementById('ptProbadores');
  if (!el) return;
  el.innerHTML = _ptProbadoresForm.length
    ? _ptProbadoresForm.map((uid, i) => '<span class="pt-probador">' + esc(ptNombreCliente(uid)) + (_ptClientes[uid] && _ptClientes[uid].email ? ' <small>' + esc(_ptClientes[uid].email) + '</small>' : '') + ' <button type="button" title="Quitar" onclick="ptQuitarProbador(' + i + ')"><i class="bi bi-x"></i></button></span>').join('')
    : '<span class="pt-vacio" style="margin:0">Nadie. Con el programa apagado y sin probadores, la tienda no muestra nada de puntos.</span>';
}
function ptQuitarProbador(i) { _ptProbadoresForm.splice(i, 1); ptRenderProbadores(_ptProbadoresForm); }
function ptAgregarProbador() {
  const inp = document.getElementById('ptProbadorMail');
  const mail = (inp.value || '').trim().toLowerCase();
  if (!mail) return;
  const uid = Object.keys(_ptClientes).find(u => (_ptClientes[u].email || '').toLowerCase() === mail);
  if (!uid) { showAdminToast('Ese mail no tiene cuenta en la tienda: tiene que iniciar sesión en yerco.ar al menos una vez', 'error'); return; }
  if (!_ptProbadoresForm.includes(uid)) _ptProbadoresForm.push(uid);
  inp.value = '';
  ptRenderProbadores(_ptProbadoresForm);
}
function ptAgregarmeProbador() {
  const u = auth.currentUser;
  if (!u) return;
  if (!_ptClientes[u.uid]) { showAdminToast('Primero iniciá sesión una vez en yerco.ar con esta cuenta, así existe como cliente', 'error'); return; }
  if (!_ptProbadoresForm.includes(u.uid)) _ptProbadoresForm.push(u.uid);
  ptRenderProbadores(_ptProbadoresForm);
}

async function ptGuardarConfig() {
  const c = ptLeerForm();
  if (!(c.valorPunto > 0)) { showAdminToast('El valor del punto tiene que ser mayor a $0', 'error'); return; }
  if (c.valorPunto < _ptCfg.valorPunto && _ptSaldos.some(s => (Number(s.saldo) || 0) > 0)) {
    if (!await pedirConfirmacion('Vas a bajar el valor del punto de ' + ptPesos(_ptCfg.valorPunto) + ' a ' + ptPesos(c.valorPunto) + '. Los puntos que ya juntaron los clientes pasan a valer menos. ¿Seguro?', { titulo: 'Bajar el valor del punto', peligro: true })) return;
  }
  if (c.activo && !_ptCfg.activo) {
    if (!await pedirConfirmacion('Se prende el programa de puntos para TODOS los clientes de la tienda. ¿Ya lo probaste con las cuentas de prueba?', { titulo: 'Prender el programa' })) return;
  }
  const btn = document.getElementById('ptGuardarBtn');
  if (btn) { btn.disabled = true; btn.innerHTML = '<i class="bi bi-arrow-repeat spin"></i> Guardando...'; }
  try {
    const data = Object.assign({}, c, { actualizadoEn: firebase.firestore.FieldValue.serverTimestamp(), actualizadoPor: (auth.currentUser && auth.currentUser.email) || '-' });
    await db.collection('config').doc('puntos').set(data);
    const antes = _ptCfg;
    _ptCfg = c;
    const cambios = Object.keys(c).filter(k => JSON.stringify(c[k]) !== JSON.stringify(antes[k]));
    if (typeof logAction === 'function') logAction('editar', 'Configuración de puntos', cambios.length ? cambios.map(k => k + ': ' + JSON.stringify(antes[k]) + ' → ' + JSON.stringify(c[k])).join(' | ') : 'sin cambios');
    showAdminToast('Configuración de puntos guardada', 'success');
    ptRenderEstado();
    ptRenderResumen();
    ptRenderPremios();
  } catch (e) {
    showAdminToast('No se pudo guardar: ' + e.message, 'error');
  } finally {
    if (btn) { btn.disabled = false; btn.innerHTML = '<i class="bi bi-check-lg"></i> Guardar'; }
  }
}

/* ------------------------------------------------------------ Tienda de canjes */
function ptProducto(id) { return (typeof allProducts !== 'undefined' ? allProducts : []).find(p => p.id === id) || null; }

function ptRenderPremios() {
  const cont = document.getElementById('ptPremiosList');
  if (!cont || !_ptCfg) return;
  const q = (document.getElementById('ptPremioBuscar')?.value || '').toLowerCase().trim();
  const lista = q ? _ptPremios.filter(p => (p.nombre || '').toLowerCase().includes(q)) : _ptPremios;
  if (!lista.length) {
    cont.innerHTML = '<div class="empty-state" style="padding:2rem"><i class="bi bi-gift"></i><p>' + (q ? 'Sin resultados' : 'Todavía no hay premios. Agregá productos que los clientes puedan canjear con puntos.') + '</p></div>';
    return;
  }
  cont.innerHTML = lista.map(pr => {
    const prod = ptProducto(pr.productoId);
    const precio = prod ? ptPrecioFinal(prod) : 0;
    const valePesos = (Number(pr.puntos) || 0) * _ptCfg.valorPunto;
    const activo = pr.activo !== false;
    const problemas = [];
    if (!prod) problemas.push('el producto ya no está en el catálogo');
    else {
      if (prod.oculto === true) problemas.push('el producto está oculto');
      if (Number(prod.stock) <= 0) problemas.push('sin stock');
    }
    return '<div class="pt-premio' + (activo ? '' : ' inactivo') + '">' +
      '<img src="' + esc((prod && prod.imagen) || pr.imagen || 'img/default-product.jpg') + '" alt="" onerror="this.src=\'img/default-product.jpg\'">' +
      '<div class="pt-premio-info">' +
        '<div class="pt-premio-nombre">' + esc((prod && (prod.nombreMostrado || prod.nombre)) || pr.nombre || '-') + '</div>' +
        '<div class="pt-premio-meta"><b>' + ptPts(pr.puntos) + ' pts</b> = ' + ptPesos(valePesos) + ' en descuentos' + (precio ? ' · precio ' + ptPesos(precio) : '') + (pr.limitePorCliente ? ' · máx. ' + pr.limitePorCliente + ' por cliente' : '') + '</div>' +
        (problemas.length ? '<div class="pt-premio-alerta"><i class="bi bi-exclamation-triangle"></i> No se muestra en la tienda: ' + problemas.join(', ') + '</div>' : '') +
      '</div>' +
      '<div class="pt-premio-acc">' +
        '<label class="toggle-switch" title="' + (activo ? 'Activo' : 'Inactivo') + '"><input type="checkbox"' + (activo ? ' checked' : '') + ' onchange="ptTogglePremio(\'' + esc(pr.id) + '\',this.checked)"><span class="toggle-slider"></span></label>' +
        '<button class="btn btn-sm btn-secondary" style="width:auto" title="Editar" onclick="ptAbrirPremio(\'' + esc(pr.id) + '\')"><i class="bi bi-pencil"></i></button>' +
        '<button class="btn btn-sm" style="width:auto;background:#f56c6c;border-color:#f56c6c;color:#fff" title="Eliminar" onclick="ptBorrarPremio(\'' + esc(pr.id) + '\')"><i class="bi bi-trash"></i></button>' +
      '</div></div>';
  }).join('');
}

function ptAbrirPremio(id) {
  _ptPremioEdit = id || null;
  const pr = id ? _ptPremios.find(x => x.id === id) : null;
  _ptPremioProd = pr ? (ptProducto(pr.productoId) || { id: pr.productoId, nombre: pr.nombre, imagen: pr.imagen, precio: 0 }) : null;
  document.getElementById('ptPremioTitulo').textContent = pr ? 'Editar premio' : 'Nuevo premio';
  document.getElementById('ptPremioBusca').value = '';
  document.getElementById('ptPremioResultados').innerHTML = '';
  document.getElementById('ptPremioPuntos').value = pr ? pr.puntos : '';
  document.getElementById('ptPremioLimite').value = pr && pr.limitePorCliente ? pr.limitePorCliente : '';
  document.getElementById('ptPremioActivo').checked = pr ? pr.activo !== false : true;
  ptPintarProdElegido();
  document.getElementById('ptPremioModal').classList.add('show');
  if (!pr) setTimeout(() => document.getElementById('ptPremioBusca').focus(), 60);
}
function ptCerrarPremio() { document.getElementById('ptPremioModal').classList.remove('show'); _ptPremioEdit = null; _ptPremioProd = null; }

function ptBuscarProd() {
  const q = (document.getElementById('ptPremioBusca').value || '').toLowerCase().trim();
  const cont = document.getElementById('ptPremioResultados');
  if (q.length < 2) { cont.innerHTML = ''; return; }
  const usados = new Set(_ptPremios.filter(p => p.id !== _ptPremioEdit).map(p => p.productoId));
  const res = (typeof allProducts !== 'undefined' ? allProducts : [])
    .filter(p => ((p.nombreMostrado || p.nombre || '') + ' ' + (p.categoria || '')).toLowerCase().includes(q))
    .slice(0, 12);
  cont.innerHTML = res.length ? res.map(p => '<button type="button" class="pt-res" ' + (usados.has(p.id) ? 'disabled title="Ya es un premio"' : 'onclick="ptElegirProd(\'' + esc(p.id) + '\')"') + '>' +
      '<span>' + esc(p.nombreMostrado || p.nombre) + (usados.has(p.id) ? ' <small>(ya es premio)</small>' : '') + '</span><small>' + ptPesos(ptPrecioFinal(p)) + ' · stock ' + (Number(p.stock) || 0) + '</small></button>').join('')
    : '<div class="pt-vacio">Sin resultados</div>';
}
function ptElegirProd(id) {
  _ptPremioProd = ptProducto(id);
  document.getElementById('ptPremioResultados').innerHTML = '';
  document.getElementById('ptPremioBusca').value = '';
  if (!document.getElementById('ptPremioPuntos').value) ptSugerirPuntos();
  ptPintarProdElegido();
}
function ptSugerirPuntos() {
  if (!_ptPremioProd || !(_ptCfg.valorPunto > 0)) return;
  document.getElementById('ptPremioPuntos').value = Math.ceil(ptPrecioFinal(_ptPremioProd) / _ptCfg.valorPunto);
  ptPintarProdElegido();
}
function ptPintarProdElegido() {
  const el = document.getElementById('ptPremioElegido');
  const p = _ptPremioProd;
  if (!p) { el.innerHTML = '<div class="pt-vacio" style="margin:0">Buscá y elegí un producto del catálogo.</div>'; return; }
  const pts = parseInt(document.getElementById('ptPremioPuntos').value, 10) || 0;
  const precio = ptPrecioFinal(p);
  const vale = pts * _ptCfg.valorPunto;
  const comp = precio && pts ? ' Con ' + ptPts(pts) + ' puntos el cliente "paga" ' + ptPesos(vale) + ' (' + Math.round(vale / precio * 100) + '% del precio).' : '';
  const compra = pts && _ptCfg.pesosPorPunto ? ' Para juntarlos tiene que comprar unos ' + ptPesos(pts * _ptCfg.pesosPorPunto) + '.' : '';
  el.innerHTML = '<div class="pt-elegido"><img src="' + esc(p.imagen || 'img/default-product.jpg') + '" alt="" onerror="this.src=\'img/default-product.jpg\'"><div><b>' + esc(p.nombreMostrado || p.nombre || '') + '</b><br><small>Precio ' + ptPesos(precio) + ' · stock ' + (Number(p.stock) || 0) + '</small></div></div>' +
    '<div class="pt-elegido-nota">' + (comp + compra).trim() + '</div>';
}

async function ptGuardarPremio() {
  const p = _ptPremioProd;
  const puntos = parseInt(document.getElementById('ptPremioPuntos').value, 10);
  const lim = parseInt(document.getElementById('ptPremioLimite').value, 10);
  const activo = document.getElementById('ptPremioActivo').checked;
  if (!p || !p.id) { showAdminToast('Elegí un producto', 'error'); return; }
  if (!(puntos > 0)) { showAdminToast('Poné cuántos puntos cuesta', 'error'); return; }
  const data = {
    productoId: p.id, nombre: p.nombreMostrado || p.nombre || '', imagen: p.imagen || '',
    puntos, limitePorCliente: lim > 0 ? lim : null, activo,
    actualizadoEn: firebase.firestore.FieldValue.serverTimestamp(),
  };
  try {
    if (_ptPremioEdit) {
      await db.collection('puntosPremios').doc(_ptPremioEdit).update(data);
    } else {
      data.creadoEn = firebase.firestore.FieldValue.serverTimestamp();
      await db.collection('puntosPremios').add(data);
    }
    if (typeof logAction === 'function') logAction(_ptPremioEdit ? 'editar' : 'crear', 'Premio de puntos: ' + data.nombre, puntos + ' pts' + (data.limitePorCliente ? ' | máx ' + data.limitePorCliente : '') + (activo ? '' : ' | inactivo'));
    showAdminToast(_ptPremioEdit ? 'Premio actualizado' : 'Premio agregado a la tienda de canjes', 'success');
    ptCerrarPremio();
    const s = await db.collection('puntosPremios').get();
    _ptPremios = s.docs.map(d => Object.assign({ id: d.id }, d.data())).sort((a, b) => (a.puntos || 0) - (b.puntos || 0));
    ptRenderPremios();
  } catch (e) { showAdminToast('No se pudo guardar: ' + e.message, 'error'); }
}

async function ptTogglePremio(id, on) {
  const pr = _ptPremios.find(x => x.id === id);
  try {
    await db.collection('puntosPremios').doc(id).update({ activo: !!on, actualizadoEn: firebase.firestore.FieldValue.serverTimestamp() });
    if (pr) pr.activo = !!on;
    if (typeof logAction === 'function') logAction('editar', 'Premio de puntos: ' + ((pr && pr.nombre) || id), on ? 'activado' : 'desactivado');
    ptRenderPremios();
  } catch (e) { showAdminToast('No se pudo cambiar: ' + e.message, 'error'); ptRenderPremios(); }
}

async function ptBorrarPremio(id) {
  const pr = _ptPremios.find(x => x.id === id);
  if (!pr) return;
  if (!await pedirConfirmacion('¿Sacar "' + (pr.nombre || '') + '" de la tienda de canjes? Los canjes ya hechos no se tocan.', { titulo: 'Eliminar premio', peligro: true })) return;
  try {
    await db.collection('puntosPremios').doc(id).delete();
    _ptPremios = _ptPremios.filter(x => x.id !== id);
    if (typeof logAction === 'function') logAction('eliminar', 'Premio de puntos: ' + (pr.nombre || id), pr.puntos + ' pts');
    ptRenderPremios();
  } catch (e) { showAdminToast('No se pudo eliminar: ' + e.message, 'error'); }
}

/* ------------------------------------------------------------------- Clientes */
function ptVence(s) {
  if (!_ptCfg.mesesVencimiento || !(Number(s.saldo) > 0) || !s.ultimaCompra) return null;
  const d = s.ultimaCompra.toDate ? s.ultimaCompra.toDate() : new Date(s.ultimaCompra);
  d.setMonth(d.getMonth() + _ptCfg.mesesVencimiento);
  return d;
}

function ptRenderClientes() {
  const cont = document.getElementById('ptClientesList');
  if (!cont || !_ptCfg) return;
  const q = (document.getElementById('ptCliBuscar')?.value || '').toLowerCase().trim();
  const orden = document.getElementById('ptCliOrden')?.value || 'saldo';
  const porUid = {};
  _ptSaldos.forEach(s => { porUid[s.uid] = s; });
  let lista = _ptSaldos.slice();
  /* Buscando, aparecen tambien los clientes sin puntos: asi se le pueden regalar a cualquiera */
  if (q) {
    Object.keys(_ptClientes).forEach(uid => { if (!porUid[uid]) lista.push({ uid, saldo: 0 }); });
    lista = lista.filter(s => {
      const c = _ptClientes[s.uid] || {};
      return ((c.nombre || '') + ' ' + (c.apellido || '') + ' ' + (c.email || '') + ' ' + (c.telefono || '')).toLowerCase().includes(q);
    });
  }
  lista.sort(orden === 'nombre' ? (a, b) => ptNombreCliente(a.uid).localeCompare(ptNombreCliente(b.uid), 'es')
    : orden === 'ganado' ? (a, b) => (b.ganadoTotal || 0) - (a.ganadoTotal || 0)
    : (a, b) => (b.saldo || 0) - (a.saldo || 0));
  if (!lista.length) {
    cont.innerHTML = '<div class="empty-state" style="padding:2rem"><p>' + (q ? 'Sin resultados' : 'Todavía nadie tiene puntos. Buscá un cliente para regalarle puntos a mano.') + '</p></div>';
    return;
  }
  cont.innerHTML = '<div class="pt-tabla-wrap"><table class="pt-tabla"><thead><tr><th>Cliente</th><th>Saldo</th><th>Ganó</th><th>Usó</th><th>Vence</th></tr></thead><tbody>' +
    lista.slice(0, 300).map(s => {
      const c = _ptClientes[s.uid] || {};
      const v = ptVence(s);
      const pronto = v && (v - Date.now()) < 30 * 86400000;
      return '<tr onclick="ptAbrirCliente(\'' + esc(s.uid) + '\')"><td><b>' + esc(ptNombreCliente(s.uid)) + '</b>' + (c.email ? '<br><small>' + esc(c.email) + '</small>' : '') + '</td>' +
        '<td class="pt-num"><b>' + ptPts(s.saldo) + '</b><br><small>' + ptPesos((s.saldo || 0) * _ptCfg.valorPunto) + '</small></td>' +
        '<td class="pt-num">' + ptPts(s.ganadoTotal) + '</td><td class="pt-num">' + ptPts(s.usadoTotal) + '</td>' +
        '<td' + (pronto ? ' style="color:var(--warning);font-weight:700"' : '') + '>' + (v ? v.toLocaleDateString('es-AR') : '-') + '</td></tr>';
    }).join('') + '</tbody></table></div>';
}

const PT_TIPOS = {
  gano: ['bi-plus-circle', 'Ganó'], uso: ['bi-bag-check', 'Usó'], devolucion: ['bi-arrow-counterclockwise', 'Devuelto'],
  ajuste: ['bi-pencil-square', 'Ajuste'], vencimiento: ['bi-hourglass-bottom', 'Venció'],
};
function ptDetalleMov(m) {
  const partes = [];
  if (m.tipo === 'gano') partes.push('Venta #' + (m.ventaNum || '-') + ' (' + ptPesos(m.monto) + ')');
  if (m.pedidoNum) partes.push('Pedido #' + m.pedidoNum);
  if (m.puntosDescuento) partes.push(ptPts(m.puntosDescuento) + ' pts de descuento (' + ptPesos(m.descuento) + ')');
  (m.canjes || []).forEach(c => partes.push('canje: ' + (c.nombre || '') + (c.cantidad > 1 ? ' x' + c.cantidad : '') + ' (' + ptPts(c.puntos) + ' pts)'));
  if (m.motivo) partes.push(m.motivo);
  if (m.por) partes.push('por ' + m.por);
  return partes.join(' · ');
}

async function ptAbrirCliente(uid) {
  _ptClienteUid = uid;
  const c = _ptClientes[uid] || {};
  const s = _ptSaldos.find(x => x.uid === uid) || { saldo: 0 };
  document.getElementById('ptCliNombre').textContent = ptNombreCliente(uid);
  document.getElementById('ptCliMail').textContent = [c.email, c.telefono].filter(Boolean).join(' · ');
  const v = ptVence(s);
  document.getElementById('ptCliSaldo').innerHTML = '<div class="pt-tiles" style="margin:0">' +
    '<div class="pt-tile"><div class="pt-tile-tit">Saldo</div><strong>' + ptPts(s.saldo) + '</strong><div class="pt-tile-sub">' + ptPesos((s.saldo || 0) * _ptCfg.valorPunto) + '</div></div>' +
    '<div class="pt-tile"><div class="pt-tile-tit">Ganó</div><strong style="color:#67c23a">' + ptPts(s.ganadoTotal) + '</strong></div>' +
    '<div class="pt-tile"><div class="pt-tile-tit">Usó</div><strong>' + ptPts(s.usadoTotal) + '</strong></div>' +
    '<div class="pt-tile"><div class="pt-tile-tit">Vence</div><strong style="font-size:1rem">' + (v ? v.toLocaleDateString('es-AR') : '-') + '</strong></div></div>';
  document.getElementById('ptAjPuntos').value = '';
  document.getElementById('ptAjMotivo').value = '';
  const lista = document.getElementById('ptCliMovs');
  lista.innerHTML = '<p class="pt-vacio">Cargando movimientos...</p>';
  document.getElementById('ptClienteModal').classList.add('show');
  try {
    const snap = await db.collection('puntos').doc(uid).collection('movs').orderBy('fecha', 'desc').limit(100).get();
    if (_ptClienteUid !== uid) return;
    lista.innerHTML = snap.empty ? '<p class="pt-vacio">Sin movimientos.</p>' : snap.docs.map(d => {
      const m = d.data();
      const t = PT_TIPOS[m.tipo] || ['bi-dot', m.tipo || '-'];
      const pts = Number(m.puntos) || 0;
      const anulado = m.tipo === 'gano' && pts === 0;
      return '<div class="pt-mov"><i class="bi ' + t[0] + '"></i><div class="pt-mov-txt"><b>' + t[1] + (anulado ? ' (anulado)' : '') + '</b><small>' + ptFecha(m.fecha) + ' · ' + esc(ptDetalleMov(m)) + '</small></div>' +
        '<span class="pt-mov-pts ' + (m.tipo === 'gano' ? (anulado ? '' : 'mas') : (pts >= 0 ? 'mas' : 'menos')) + '">' + (m.tipo === 'gano' ? (anulado ? '0' : '+' + ptPts(pts)) : (pts > 0 ? '+' : '') + ptPts(pts)) + '</span></div>';
    }).join('');
  } catch (e) {
    lista.innerHTML = '<p class="pt-vacio">No se pudieron cargar: ' + esc(e.message) + '</p>';
  }
}
function ptCerrarCliente() { document.getElementById('ptClienteModal').classList.remove('show'); _ptClienteUid = null; }

async function ptAjustar(signo) {
  const uid = _ptClienteUid;
  if (!uid) return;
  const n = Math.abs(parseInt(document.getElementById('ptAjPuntos').value, 10) || 0) * (signo < 0 ? -1 : 1);
  const motivo = (document.getElementById('ptAjMotivo').value || '').trim().slice(0, 200);
  if (!n) { showAdminToast('Poné cuántos puntos', 'error'); return; }
  if (!motivo) { showAdminToast('Escribí el motivo: queda en los movimientos del cliente', 'error'); document.getElementById('ptAjMotivo').focus(); return; }
  const nombre = ptNombreCliente(uid);
  if (!await pedirConfirmacion((n > 0 ? 'Sumarle ' : 'Restarle ') + ptPts(Math.abs(n)) + ' puntos a ' + nombre + '?', { titulo: 'Ajuste de puntos', peligro: n < 0 })) return;
  const por = (auth.currentUser && auth.currentUser.email) || '-';
  try {
    const ref = db.collection('puntos').doc(uid);
    await db.runTransaction(async t => {
      const s = await t.get(ref);
      const d = s.exists ? s.data() : {};
      const upd = { saldo: (Number(d.saldo) || 0) + n, ajustadoTotal: firebase.firestore.FieldValue.increment(n), actualizadoEn: firebase.firestore.FieldValue.serverTimestamp() };
      /* Sin compras todavia, el regalo arranca la cuenta del vencimiento */
      if (!d.ultimaCompra) upd.ultimaCompra = firebase.firestore.FieldValue.serverTimestamp();
      t.set(ref, upd, { merge: true });
      t.set(ref.collection('movs').doc(), { tipo: 'ajuste', puntos: n, motivo, por, fecha: firebase.firestore.FieldValue.serverTimestamp() });
    });
    if (typeof logAction === 'function') logAction('editar', 'Puntos de ' + nombre + ': ' + (n > 0 ? '+' : '') + n, motivo);
    showAdminToast('Puntos ajustados', 'success');
    const s = await db.collection('puntos').doc(uid).get();
    _ptSaldos = _ptSaldos.filter(x => x.uid !== uid).concat(s.exists ? [Object.assign({ uid }, s.data())] : []);
    ptRenderClientes();
    ptRenderResumen();
    ptAbrirCliente(uid);
  } catch (e) { showAdminToast('No se pudo ajustar: ' + e.message, 'error'); }
}

/* Descuento por puntos que tiene que respetar el panel al editar el pedido o pasarlo a venta.
   Mientras procesarPuntosPedido todavia no corrio (unos segundos despues de confirmar) el pedido
   no tiene puntosEstado: se respeta igual, porque si no, guardar el pedido en ese momento le
   subia el total al cliente. Rechazado, con error o devuelto: no hay descuento. */
function ptDescuentoDePedido(p) {
  if (!p) return null;
  const est = p.puntosEstado;
  if (est && est !== 'aplicado') return null;
  const d = Number(p.puntosDescuento) || 0;
  return d > 0 ? { usar: Number(p.puntosUsar) || 0, descuento: d } : null;
}

/* Renglon "Puntos" en el modal de venta, como el del cupon */
function _pintarPuntosVenta() {
  const old = document.getElementById('ventaPuntosRow');
  if (old) old.remove();
  const pv = window._pedidoPuntosVenta;
  if (!pv || !(Number(pv.descuento) > 0)) return;
  const totalRow = document.querySelector('#ventaModal .venta-total-row');
  if (!totalRow) return;
  const row = document.createElement('div');
  row.id = 'ventaPuntosRow';
  row.style.cssText = 'display:flex;justify-content:space-between;align-items:center;padding:4px 0;color:#a78bfa;font-size:0.85rem;border-top:1px solid var(--border);margin-top:4px';
  row.innerHTML = '<span><i class="bi bi-stars"></i> Puntos' + (pv.usar ? ' (' + ptPts(pv.usar) + ')' : '') + '</span><span style="font-weight:700">-' + ptPesos(pv.descuento) + '</span>';
  totalRow.parentNode.insertBefore(row, totalRow);
}

/* Para los pedidos y las ventas: qué usó de puntos y si hay algo para revisar */
function ptResumenPedidoHtml(p) {
  if (!p) return '';
  const canjes = (p.items || []).filter(i => i && i.canje === true);
  const usar = Number(p.puntosUsar) || 0;
  if (!usar && !canjes.length && !p.puntosEstado) return '';
  const est = p.puntosEstado || 'pendiente';
  const color = { aplicado: '#67c23a', rechazado: 'var(--danger)', error: 'var(--danger)', devuelto: 'var(--text-dim)', pendiente: 'var(--warning)' }[est] || 'var(--text-dim)';
  const txtEst = { aplicado: 'descontados del saldo', rechazado: 'NO se aplicaron', error: 'error al procesar', devuelto: 'devueltos al cliente', pendiente: 'procesando...' }[est] || est;
  return '<div class="pt-ped" style="border-color:' + color + '"><i class="bi bi-stars"></i> <b>Puntos</b>: ' +
    (usar ? ptPts(usar) + ' pts = -' + ptPesos(p.puntosDescuento) : '') +
    (canjes.length ? (usar ? ' · ' : '') + 'canje: ' + canjes.map(i => esc(i.nombre) + (i.cantidad > 1 ? ' x' + i.cantidad : '')).join(', ') : '') +
    ' <span style="color:' + color + ';font-weight:700">(' + txtEst + ')</span>' +
    (p.puntosMotivo && (est === 'rechazado' || est === 'error') ? '<div class="pt-ped-motivo">' + esc(p.puntosMotivo) + ' Cobrale el total sin el descuento' + (canjes.length ? ' y el producto canjeado' : '') + ', o ajustá los puntos a mano en Puntos → Clientes.</div>' : '') +
    '</div>';
}
