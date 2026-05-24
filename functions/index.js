/**
 * YERCO Cloud Functions
 * - notifyTelegramOnNewOrder: dispara mensaje a Telegram cada vez que se crea un pedido web
 *
 * Requiere documento Firestore: config/telegram con campos `token` y `chatId`
 */

const {onDocumentCreated} = require('firebase-functions/v2/firestore');
const {logger} = require('firebase-functions');
const admin = require('firebase-admin');

admin.initializeApp();
const db = admin.firestore();

/** Helper: envia mensaje a Telegram */
async function sendTelegramMessage(token, chatId, text) {
  if (!token || !chatId) {
    logger.warn('Telegram no configurado (falta token o chatId)');
    return false;
  }
  try {
    const url = `https://api.telegram.org/bot${token}/sendMessage`;
    const res = await fetch(url, {
      method: 'POST',
      headers: {'Content-Type': 'application/json'},
      body: JSON.stringify({
        chat_id: chatId,
        text: text,
        parse_mode: 'HTML'
      })
    });
    if (!res.ok) {
      const body = await res.text();
      logger.error('Telegram API error:', res.status, body);
      return false;
    }
    return true;
  } catch (e) {
    logger.error('Error enviando a Telegram:', e);
    return false;
  }
}

/** Helper: escapa caracteres HTML especiales para Telegram parse_mode HTML */
function escHtml(s) {
  if (s == null) return '';
  return String(s)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;');
}

/**
 * Trigger: cada vez que se crea un pedido en Firestore
 * Si el pedido tiene origen='web', notifica a Telegram
 */
exports.notifyTelegramOnNewOrder = onDocumentCreated(
  {
    document: 'pedidos/{pedidoId}',
    region: 'southamerica-east1',
    memory: '256MiB',
    timeoutSeconds: 30
  },
  async (event) => {
    const snap = event.data;
    if (!snap) {
      logger.warn('Sin datos en el evento');
      return;
    }
    const pedido = snap.data();
    /* Solo notificamos pedidos hechos desde la web */
    if (pedido.origen !== 'web') {
      logger.info('Pedido omitido (origen no es web):', event.params.pedidoId);
      return;
    }
    /* Leer configuración de Telegram */
    let token = null;
    let chatId = null;
    try {
      const cfgSnap = await db.collection('config').doc('telegram').get();
      if (cfgSnap.exists) {
        const data = cfgSnap.data();
        token = data.token || null;
        chatId = data.chatId || null;
      }
    } catch (e) {
      logger.error('No se pudo leer config/telegram:', e);
      return;
    }
    if (!token || !chatId) {
      logger.warn('Telegram no está configurado, omito notificación');
      return;
    }
    /* Construir mensaje */
    const num = String(pedido.numero || 0).padStart(5, '0');
    const itemsTxt = (pedido.items || [])
      .map(i => `${escHtml(i.nombre)} x${i.cantidad}`)
      .join(', ');
    let msg = `<b>🛒 Nuevo pedido WEB #${num}</b>\n`;
    msg += `<b>Cliente:</b> ${escHtml(pedido.cliente || '-')}\n`;
    msg += `<b>Tel:</b> ${escHtml(pedido.telefono || '-')}\n`;
    msg += `<b>Entrega:</b> ${pedido.tipoEntrega === 'retiro' ? 'Retiro en local' : 'Envío a domicilio'}\n`;
    if (pedido.direccion) msg += `<b>Dirección:</b> ${escHtml(pedido.direccion)}\n`;
    if (pedido.notas) msg += `<b>Notas:</b> ${escHtml(pedido.notas)}\n`;
    if (itemsTxt) msg += `<b>Items:</b> ${itemsTxt}\n`;
    msg += `<b>Total:</b> $${(pedido.total || 0).toLocaleString('es-AR')}`;
    /* Enviar */
    const ok = await sendTelegramMessage(token, chatId, msg);
    if (ok) {
      logger.info('Notificación Telegram enviada para pedido #' + num);
    } else {
      logger.error('Falló envío Telegram para pedido #' + num);
    }
  }
);


/**
 * RATE LIMITING: bloquea creacion de pedidos si el usuario hizo mas de 5 en la ultima hora
 * Se ejecuta cuando se crea un documento en /pedidos
 */
const {onDocumentCreated: onPedidoCreated} = require('firebase-functions/v2/firestore');

exports.rateLimitPedidos = onDocumentCreated('pedidos/{pedidoId}', async (event) => {
  const data = event.data?.data();
  if (!data) return;

  const uid = data.clienteAuthUid;
  if (!uid) return; // sin uid no podemos limitar

  const ahora = new Date();
  const haceUnaHora = new Date(ahora.getTime() - 60 * 60 * 1000);

  try {
    const snap = await db.collection('pedidos')
      .where('clienteAuthUid', '==', uid)
      .where('creadoEn', '>=', haceUnaHora)
      .get();

    const LIMITE = 5;
    if (snap.size > LIMITE) {
      logger.warn(`Rate limit: UID ${uid} hizo ${snap.size} pedidos en la ultima hora. Eliminando el excedente.`);
      /* Eliminar el pedido recién creado */
      await db.collection('pedidos').doc(event.params.pedidoId).delete();
    }
  } catch (e) {
    logger.error('Error en rateLimitPedidos:', e);
  }
});

/**
 * SANITIZACIÓN SERVER-SIDE: limpia y valida pedidos al crearse
 */
exports.sanitizarPedido = onDocumentCreated('pedidos/{pedidoId}', async (event) => {
  const data = event.data?.data();
  if (!data) return;

  function sanitize(val, maxLen) {
    if (!val) return '';
    return String(val).replace(/[<>"'`\x00-\x1F\x7F]/g, '').trim().slice(0, maxLen);
  }

  try {
    await db.collection('pedidos').doc(event.params.pedidoId).update({
      cliente: sanitize(data.cliente, 120),
      telefono: sanitize(data.telefono, 30).replace(/[^0-9+\-\s()]/g, ''),
      direccion: data.direccion ? sanitize(data.direccion, 200) : null,
      notas: data.notas ? sanitize(data.notas, 500) : null,
    });
  } catch (e) {
    logger.error('Error en sanitizarPedido:', e);
  }
});
