/**
 * PROGRAMA DE PUNTOS
 *
 * Por que el saldo vive aca y no en la tienda: el pedido y su total los arma el navegador del
 * cliente, y cualquiera logueado puede tocarlos desde la consola. Si el saldo se escribiera desde
 * ahi, alcanzaria con un update para tener 10.000 puntos. Por eso `puntos/{uid}` solo lo escriben
 * estas funciones (Admin SDK, no pasan por las reglas) y el panel; el cliente solo lo lee.
 *
 * Como se mueve un punto:
 *   - GANA: cuando la VENTA queda "Pago" (puntosVenta). Si despues se marca "No pago", se edita
 *     o se borra, el mismo movimiento se recalcula y el saldo se ajusta solo.
 *   - USA: el cliente pide usar puntos (descuento) y/o canjear premios en el pedido;
 *     procesarPuntosPedido lo revalida contra el saldo y la config, en una transaccion, y recien
 *     ahi descuenta. Si algo no cierra, el pedido queda con puntosEstado 'rechazado' y
 *     revisarPuntos, y no se descuenta nada (igual que revisarPrecio con los precios).
 *   - DEVUELVE: pedido borrado sin venta, o venta (nacida de ese pedido) borrada. Las dos vias
 *     usan el mismo id de movimiento (devol_pedido_{id}), asi que nunca se devuelve dos veces.
 *   - VENCE: si pasan `mesesVencimiento` meses sin comprar (vencerPuntos, todos los dias).
 *
 * Cada cambio de saldo deja su movimiento en puntos/{uid}/movs con un id que lo hace
 * idempotente: si Firestore reintenta una funcion, no se acredita ni descuenta dos veces.
 *
 * Las cuentas de calculo (puntosPorMonto, maxDescuentoPesos, puntosUsables) tienen su gemela en
 * app.js, que las usa para mostrar lo mismo en el checkout: si se cambia una, cambiar la otra.
 */
const {onDocumentCreated, onDocumentDeleted, onDocumentWritten} = require('firebase-functions/v2/firestore');
const {onSchedule} = require('firebase-functions/v2/scheduler');
const {logger} = require('firebase-functions');
const admin = require('firebase-admin');

const REGION = 'southamerica-east1';
const FV = admin.firestore.FieldValue;
const db = () => admin.firestore();

/* Arranca APAGADO: se prende desde el panel despues de probarlo con las cuentas de `probadores`. */
const CONFIG_DEFECTO = {
  activo: false,
  probadores: [],          /* uids que lo ven y lo usan aunque este apagado */
  pesosPorPunto: 1000,     /* cada $1.000 pagados en productos = 1 punto */
  valorPunto: 20,          /* 1 punto = $20 de descuento */
  minimoParaUsar: 50,      /* puntos minimos para poder usarlos como descuento */
  topePorcentaje: 30,      /* los puntos cubren como mucho este % de los productos */
  mesesVencimiento: 12,    /* meses sin comprar hasta que vencen; 0 = no vencen */
  combinarConCupon: true,
};

function num(v, def, min, max) {
  const n = Number(v);
  if (!isFinite(n)) return def;
  return Math.min(max, Math.max(min, n));
}

function normalizarConfig(c) {
  c = c || {};
  return {
    activo: c.activo === true,
    probadores: Array.isArray(c.probadores) ? c.probadores.filter(x => typeof x === 'string') : [],
    pesosPorPunto: Math.round(num(c.pesosPorPunto, CONFIG_DEFECTO.pesosPorPunto, 1, 10000000)),
    valorPunto: num(c.valorPunto, CONFIG_DEFECTO.valorPunto, 0, 1000000),
    minimoParaUsar: Math.round(num(c.minimoParaUsar, CONFIG_DEFECTO.minimoParaUsar, 0, 1000000)),
    topePorcentaje: num(c.topePorcentaje, CONFIG_DEFECTO.topePorcentaje, 0, 100),
    mesesVencimiento: Math.round(num(c.mesesVencimiento, CONFIG_DEFECTO.mesesVencimiento, 0, 120)),
    combinarConCupon: c.combinarConCupon !== false,
  };
}

function habilitadoPara(cfg, uid) {
  return !!uid && (cfg.activo || cfg.probadores.includes(uid));
}

function puntosPorMonto(monto, pesosPorPunto) {
  return monto > 0 && pesosPorPunto > 0 ? Math.floor(monto / pesosPorPunto) : 0;
}

/* Cuanto puede descontarse en $ con puntos sobre `base` (productos, ya sin el cupon). */
function maxDescuentoPesos(cfg, base) {
  return Math.max(0, Math.floor(base * cfg.topePorcentaje / 100));
}

/* Puntos que se usan con el toggle prendido: todo el saldo, hasta el tope. 0 si no llega al minimo. */
function puntosUsables(cfg, saldo, base) {
  if (!(cfg.valorPunto > 0)) return 0;
  const n = Math.min(Math.max(0, Math.floor(saldo)), Math.floor(maxDescuentoPesos(cfg, base) / cfg.valorPunto));
  return n >= Math.max(1, cfg.minimoParaUsar) ? n : 0;
}

const refPuntos = uid => db().collection('puntos').doc(uid);
const refMov = (uid, id) => refPuntos(uid).collection('movs').doc(id);
const refConfig = () => db().collection('config').doc('puntos');

/* ---------------------------------------------------------------------------------------------
   USO: descuento y canjes de un pedido web
   --------------------------------------------------------------------------------------------- */
async function procesarPedido(pedidoId, snap) {
  const p = snap.data();
  if (!p || p.origen !== 'web') return;
  const items = Array.isArray(p.items) ? p.items : [];
  const lineasCanje = items.filter(i => i && i.canje === true);
  const usar = Math.max(0, Math.floor(Number(p.puntosUsar) || 0));
  const descPedido = Math.max(0, Number(p.puntosDescuento) || 0);
  if (!usar && !lineasCanje.length && !descPedido) return;

  const uid = p.clienteAuthUid || null;
  const rechazar = motivo => snap.ref.update({
    puntosEstado: 'rechazado', puntosMotivo: motivo, revisarPuntos: true,
  });
  if (!uid) return rechazar('El pedido no tiene una cuenta asociada.');

  const res = await db().runTransaction(async t => {
    const movRef = refMov(uid, 'pedido_' + pedidoId);
    const [cfgS, saldoS, movS] = await t.getAll(refConfig(), refPuntos(uid), movRef);
    if (movS.exists) return {ya: true};
    const cfg = normalizarConfig(cfgS.exists ? cfgS.data() : null);
    const errores = [];
    if (!habilitadoPara(cfg, uid)) errores.push('El programa de puntos no está activo');

    /* Canjes: cada linea a $0 tiene que ser un premio activo de ese producto */
    const premioIds = [...new Set(lineasCanje.map(i => String(i.premioId || '')).filter(Boolean))];
    const premSnaps = premioIds.length ? await t.getAll(...premioIds.map(id => db().collection('puntosPremios').doc(id))) : [];
    const premios = {};
    premSnaps.forEach(s => { if (s.exists) premios[s.id] = s.data(); });
    const datosSaldo = saldoS.exists ? saldoS.data() : {};
    const previos = datosSaldo.canjesPorPremio || {};
    const porPremio = {};
    let puntosCanje = 0;
    const canjes = [];
    for (const l of lineasCanje) {
      const pr = premios[l.premioId];
      const cant = Math.max(1, Math.floor(Number(l.cantidad) || 1));
      if (!pr || pr.activo === false || pr.productoId !== l.id) { errores.push('Canje no válido: ' + (l.nombre || l.id)); continue; }
      if (Number(l.precio) !== 0) { errores.push('El canje de ' + (pr.nombre || l.nombre) + ' no viene a $0'); continue; }
      const pts = Math.max(0, Math.round(Number(pr.puntos) || 0));
      if (!pts) { errores.push('El premio ' + (pr.nombre || l.nombre) + ' no tiene valor en puntos'); continue; }
      porPremio[l.premioId] = (porPremio[l.premioId] || 0) + cant;
      const lim = Math.floor(Number(pr.limitePorCliente) || 0);
      if (lim > 0 && (Number(previos[l.premioId]) || 0) + porPremio[l.premioId] > lim) {
        errores.push('Superó el límite de canjes de ' + (pr.nombre || l.nombre));
        continue;
      }
      puntosCanje += pts * cant;
      canjes.push({premioId: l.premioId, productoId: l.id, nombre: pr.nombre || l.nombre || '', cantidad: cant, puntos: pts * cant});
    }

    /* Descuento: se recalcula con la config de AHORA, no se cree el numero del navegador */
    const baseProductos = items.filter(i => i && i.canje !== true)
      .reduce((s, i) => s + (Number(i.precio) || 0) * (Number(i.cantidad) || 0), 0);
    const cupon = p.cupon ? Math.max(0, Number(p.cupon.monto) || 0) : 0;
    const base = Math.max(0, baseProductos - cupon);
    const descEsperado = usar * cfg.valorPunto;
    if (usar > 0) {
      if (p.cupon && !cfg.combinarConCupon) errores.push('Los puntos no se combinan con cupones');
      if (usar < cfg.minimoParaUsar) errores.push('Se necesitan al menos ' + cfg.minimoParaUsar + ' puntos para usarlos');
      if (descEsperado > maxDescuentoPesos(cfg, base)) errores.push('El descuento supera el tope del ' + cfg.topePorcentaje + '%');
    }
    if (Math.abs(descPedido - descEsperado) > 1) errores.push('El descuento del pedido ($' + descPedido + ') no coincide con los puntos usados ($' + descEsperado + ')');

    const saldo = Number(datosSaldo.saldo) || 0;
    const total = usar + puntosCanje;
    if (total > saldo) errores.push('Saldo insuficiente: tenía ' + Math.max(0, saldo) + ' puntos y el pedido usa ' + total);

    if (errores.length) return {errores};

    const ahora = FV.serverTimestamp();
    const upd = {saldo: saldo - total, usadoTotal: FV.increment(total), actualizadoEn: ahora};
    if (Object.keys(porPremio).length) {
      upd.canjesPorPremio = {};
      Object.keys(porPremio).forEach(k => { upd.canjesPorPremio[k] = FV.increment(porPremio[k]); });
    }
    t.set(refPuntos(uid), upd, {merge: true});
    t.set(movRef, {
      tipo: 'uso', puntos: -total, puntosDescuento: usar, descuento: descEsperado, puntosCanje, canjes,
      pedidoId, pedidoNum: p.numero || null, fecha: ahora,
    });
    t.update(snap.ref, {puntosEstado: 'aplicado', puntosAplicados: total});
    return {ok: total};
  });

  if (res.errores) {
    logger.warn('Puntos rechazados en pedido ' + pedidoId, res.errores);
    await rechazar(res.errores.join('. ') + '.');
  }
}

exports.procesarPuntosPedido = onDocumentCreated(
  {document: 'pedidos/{pedidoId}', region: REGION, memory: '256MiB', timeoutSeconds: 60},
  async event => {
    if (!event.data) return;
    try {
      await procesarPedido(event.params.pedidoId, event.data);
    } catch (e) {
      logger.error('Error procesando los puntos del pedido ' + event.params.pedidoId, e);
      await event.data.ref.update({
        puntosEstado: 'error', revisarPuntos: true,
        puntosMotivo: 'No se pudieron procesar los puntos: ' + String(e && e.message || e).slice(0, 200),
      }).catch(() => {});
    }
  }
);

/* Devuelve lo que se uso en un pedido. Mismo id de movimiento venga de donde venga (pedido o
   venta borrados), asi que es idempotente. Si el pedido sigue existiendo se lo marca 'devuelto'
   para que una venta nueva hecha desde el no vuelva a cobrar el descuento. */
async function devolverUso(uid, pedidoId, motivo) {
  if (!uid || !pedidoId) return;
  const uso = refMov(uid, 'pedido_' + pedidoId);
  const devol = refMov(uid, 'devol_pedido_' + pedidoId);
  const pedRef = db().collection('pedidos').doc(pedidoId);
  await db().runTransaction(async t => {
    const [usoS, devS, pedS] = await t.getAll(uso, devol, pedRef);
    if (!usoS.exists || devS.exists) return;
    const pts = -(Number(usoS.data().puntos) || 0);
    if (pts <= 0) return;
    const canjes = usoS.data().canjes || [];
    const upd = {saldo: FV.increment(pts), usadoTotal: FV.increment(-pts), actualizadoEn: FV.serverTimestamp()};
    if (canjes.length) {
      upd.canjesPorPremio = {};
      canjes.forEach(c => { upd.canjesPorPremio[c.premioId] = FV.increment(-(Number(c.cantidad) || 0)); });
    }
    t.set(refPuntos(uid), upd, {merge: true});
    t.set(devol, {tipo: 'devolucion', puntos: pts, motivo, pedidoId, pedidoNum: usoS.data().pedidoNum || null, fecha: FV.serverTimestamp()});
    if (pedS.exists) t.update(pedRef, {puntosEstado: 'devuelto'});
  });
}

exports.devolverPuntosPedido = onDocumentDeleted(
  {document: 'pedidos/{pedidoId}', region: REGION, memory: '256MiB', timeoutSeconds: 60},
  async event => {
    const p = event.data && event.data.data();
    if (!p || p.puntosEstado !== 'aplicado' || !p.clienteAuthUid) return;
    /* Si ya se paso a venta, los puntos usados viajan con la venta: se devuelven si se borra ella */
    if (p.ventaId) return;
    try {
      await devolverUso(p.clienteAuthUid, event.params.pedidoId, 'Pedido #' + (p.numero || '') + ' anulado');
    } catch (e) {
      logger.error('No se pudieron devolver los puntos del pedido ' + event.params.pedidoId, e);
    }
  }
);

/* ---------------------------------------------------------------------------------------------
   GANA: ventas pagadas
   --------------------------------------------------------------------------------------------- */
function ventaPagada(v) { return !(v && v.pagado === false); }

async function ajustarGanado(uid, ventaId, venta) {
  const movRef = refMov(uid, 'venta_' + ventaId);
  await db().runTransaction(async t => {
    const [cfgS, movS] = await t.getAll(refConfig(), movRef);
    const cfg = normalizarConfig(cfgS.exists ? cfgS.data() : null);
    const mov = movS.exists ? movS.data() : null;
    const actual = mov ? Number(mov.puntos) || 0 : 0;
    /* Se congela la relacion $/punto del dia que se acredito: si despues se cambia en la
       config y alguien edita una venta vieja, no se le recalcula con la nueva. */
    const ppp = mov && mov.pesosPorPunto ? mov.pesosPorPunto : cfg.pesosPorPunto;
    const base = venta ? Math.max(0, (Number(venta.total) || 0) - (Number(venta.envio) || 0)) : 0;
    const deseado = venta && ventaPagada(venta) ? puntosPorMonto(base, ppp) : 0;
    const delta = deseado - actual;
    if (!delta) return;
    /* Con el programa apagado no se acredita nada nuevo, pero si se descuenta lo de una venta
       que se borra o deja de estar paga. */
    if (delta > 0 && !habilitadoPara(cfg, uid)) return;
    const ahora = FV.serverTimestamp();
    const upd = {saldo: FV.increment(delta), ganadoTotal: FV.increment(delta), actualizadoEn: ahora};
    if (delta > 0) upd.ultimaCompra = ahora;
    t.set(refPuntos(uid), upd, {merge: true});
    t.set(movRef, {
      tipo: 'gano', puntos: deseado, monto: base, pesosPorPunto: ppp, ventaId,
      ventaNum: venta ? venta.numero || null : (mov ? mov.ventaNum || null : null),
      motivo: venta ? (ventaPagada(venta) ? '' : 'Venta marcada como no pagada') : 'Venta eliminada',
      fecha: mov && mov.fecha ? mov.fecha : ahora, actualizadoEn: ahora,
    }, {merge: true});
  });
}

exports.puntosVenta = onDocumentWritten(
  {document: 'ventas/{ventaId}', region: REGION, memory: '256MiB', timeoutSeconds: 60},
  async event => {
    const antes = event.data.before.exists ? event.data.before.data() : null;
    const despues = event.data.after.exists ? event.data.after.data() : null;
    const ventaId = event.params.ventaId;
    const uidAntes = antes && antes.clienteAuthUid;
    const uidDespues = despues && despues.clienteAuthUid;
    try {
      /* Si se cambio el cliente de la venta, al anterior se le saca lo que habia ganado */
      if (uidAntes && uidAntes !== uidDespues) await ajustarGanado(uidAntes, ventaId, null);
      if (uidDespues) await ajustarGanado(uidDespues, ventaId, despues);
      /* Venta borrada que habia usado puntos de un pedido: se devuelven */
      if (!despues && antes && antes.pedidoId && Number(antes.puntosUsados) > 0 && uidAntes) {
        await devolverUso(uidAntes, antes.pedidoId, 'Venta #' + (antes.numero || '') + ' eliminada');
      }
    } catch (e) {
      logger.error('Error ajustando los puntos de la venta ' + ventaId, e);
    }
  }
);

/* ---------------------------------------------------------------------------------------------
   VENCE: X meses sin comprar
   --------------------------------------------------------------------------------------------- */
exports.vencerPuntos = onSchedule(
  {schedule: 'every day 04:00', timeZone: 'America/Argentina/Cordoba', region: REGION, memory: '256MiB', timeoutSeconds: 300},
  async () => {
    const cfgS = await refConfig().get();
    const cfg = normalizarConfig(cfgS.exists ? cfgS.data() : null);
    if (!cfg.mesesVencimiento) return;
    const corte = new Date();
    corte.setMonth(corte.getMonth() - cfg.mesesVencimiento);
    const snap = await db().collection('puntos').where('ultimaCompra', '<', corte).get();
    const hoy = new Date().toISOString().slice(0, 10);
    let vencidos = 0;
    for (const d of snap.docs) {
      try {
        await db().runTransaction(async t => {
          const s = await t.get(d.ref);
          const saldo = Number(s.data().saldo) || 0;
          const uc = s.data().ultimaCompra;
          if (saldo <= 0 || !uc || uc.toDate() >= corte) return;
          t.update(d.ref, {saldo: 0, vencidoTotal: FV.increment(saldo), actualizadoEn: FV.serverTimestamp()});
          t.set(d.ref.collection('movs').doc('venc_' + hoy), {
            tipo: 'vencimiento', puntos: -saldo, fecha: FV.serverTimestamp(),
            motivo: 'Vencieron por pasar ' + cfg.mesesVencimiento + ' meses sin comprar',
          });
          vencidos++;
        });
      } catch (e) {
        logger.error('No se pudieron vencer los puntos de ' + d.id, e);
      }
    }
    if (vencidos) logger.info('Puntos vencidos en ' + vencidos + ' cuentas');
  }
);

/* Para probar las cuentas sin desplegar (node -e) */
exports._calc = {normalizarConfig, habilitadoPara, puntosPorMonto, maxDescuentoPesos, puntosUsables, CONFIG_DEFECTO};
