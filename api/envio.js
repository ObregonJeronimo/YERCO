/**
 * POST /api/envio {dir}: cuanto sale el envio a esa direccion segun la distancia.
 * POST y no ?dir= en la URL: la direccion de un cliente es un dato personal y las URLs
 * quedan en los logs de Vercel y en el cache del CDN.
 *
 * Joaco hace los envios desde su casa, asi que la distancia se mide desde ahi y no desde
 * el local. Esa direccion es PRIVADA: vive solo en la variable de entorno ENVIO_ORIGEN
 * ("lat,lng") de Vercel, nunca en el codigo. Por lo mismo la respuesta trae solo el
 * PRECIO, no los km ni coordenadas: con la distancia exacta cualquiera podria ubicar la
 * casa probando direcciones.
 *
 * La direccion se busca en OpenStreetMap (Nominatim, gratis). Sus reglas piden un
 * User-Agent propio, no mas de 1 consulta por segundo y no repetir consultas: por eso hay
 * cola y cache en memoria.
 *
 * La tarifa sale de config/pedidos, el mismo documento que edita el panel:
 *   hasta envioKmBase km -> envioPrecio
 *   despues, +envioIncremento por cada envioPasoKm km (o fraccion)
 * El envio gratis por monto NO se aplica aca: lo aplica la tienda sobre este precio.
 *
 * Respuestas: { calculo:false } si no esta configurado (la tienda cobra el precio fijo),
 * { calculo:true, encontrado:true, precio } o { calculo:true, encontrado:false, precio }
 * (no se ubico la direccion: precio base, y el pedido queda "envio a confirmar").
 */
const admin = require('firebase-admin');

const DEF = { envioPrecio: 2000, envioKmBase: 5, envioIncremento: 500, envioPasoKm: 1, envioDistanciaActivo: true };
/* Villa Allende, Mendiolaza, Unquillo, Saldan, Arguello y el norte de Cordoba: fuera de
   este rectangulo no se busca, asi "San Martin 500" no termina en otra provincia. */
const VIEWBOX = '-64.45,-31.12,-64.10,-31.45';
const LOCALIDADES = /allende|mendiolaza|unquillo|sald[aá]n|arg[uü]ello|c[oó]rdoba|r[ií]o ceballos|villa rivera|la calera|cerro norte|el talar|valle escondido|lomas de la carolina/i;
const UA = 'YercoEnvios/1.0 (https://www.yerco.ar; yerco.cba@gmail.com)';

function getDb() {
  if (!admin.apps.length) {
    const raw = process.env.FIREBASE_SERVICE_ACCOUNT;
    if (!raw) throw new Error('FIREBASE_SERVICE_ACCOUNT no configurada');
    admin.initializeApp({ credential: admin.credential.cert(JSON.parse(raw)) });
  }
  return admin.firestore();
}

let _cfg = null, _cfgEn = 0;
async function tarifa() {
  if (_cfg && Date.now() - _cfgEn < 5 * 60 * 1000) return _cfg;
  let d = {};
  try { const s = await getDb().collection('config').doc('pedidos').get(); if (s.exists) d = s.data(); } catch (e) { /* sin Firestore, la tarifa por defecto */ }
  const n = (k, min) => { const v = Number(d[k]); return isFinite(v) && v >= min ? v : DEF[k]; };
  _cfg = {
    activo: typeof d.envioDistanciaActivo === 'boolean' ? d.envioDistanciaActivo : DEF.envioDistanciaActivo,
    hayEnvios: d.haceEnvios !== false,
    base: n('envioPrecio', 0), kmBase: n('envioKmBase', 0), inc: n('envioIncremento', 0), paso: n('envioPasoKm', 0.1)
  };
  _cfgEn = Date.now();
  return _cfg;
}

function precioPorKm(km, t) {
  if (km <= t.kmBase) return t.base;
  return t.base + Math.ceil((km - t.kmBase) / t.paso - 1e-9) * t.inc;
}

function km(a, b) {
  const R = 6371, rad = x => x * Math.PI / 180;
  const dLat = rad(b.lat - a.lat), dLng = rad(b.lng - a.lng);
  const h = Math.sin(dLat / 2) ** 2 + Math.cos(rad(a.lat)) * Math.cos(rad(b.lat)) * Math.sin(dLng / 2) ** 2;
  return 2 * R * Math.asin(Math.sqrt(h));
}

function origen() {
  const m = String(process.env.ENVIO_ORIGEN || '').match(/^\s*(-?\d+(?:\.\d+)?)\s*,\s*(-?\d+(?:\.\d+)?)\s*$/);
  return m ? { lat: Number(m[1]), lng: Number(m[2]) } : null;
}

/* Cola: una consulta a Nominatim por vez y con 1,1 s entre una y otra. */
let _cola = Promise.resolve(), _ultima = 0;
function enCola(fn) {
  const p = _cola.then(async () => {
    const espera = _ultima + 1100 - Date.now();
    if (espera > 0) await new Promise(r => setTimeout(r, espera));
    try { return await fn(); } finally { _ultima = Date.now(); }
  });
  _cola = p.catch(() => {});
  return p;
}

async function nominatim(q) {
  const url = 'https://nominatim.openstreetmap.org/search?format=jsonv2&limit=1&countrycodes=ar&bounded=1' +
    '&viewbox=' + VIEWBOX + '&q=' + encodeURIComponent(q);
  const ctl = new AbortController();
  const t = setTimeout(() => ctl.abort(), 5000);
  try {
    const r = await fetch(url, { headers: { 'User-Agent': UA, 'Accept-Language': 'es' }, signal: ctl.signal });
    if (!r.ok) throw new Error('Nominatim ' + r.status);
    const j = await r.json();
    return j && j[0] ? { lat: Number(j[0].lat), lng: Number(j[0].lon) } : null;
  } finally { clearTimeout(t); }
}

const _geo = new Map(); /* direccion normalizada -> {lat,lng} | null, por instancia */
async function ubicar(dir) {
  const k = dir.toLowerCase();
  if (_geo.has(k)) return _geo.get(k);
  /* Sin localidad se busca solo en Villa Allende y Mendiolaza, donde esta la clientela.
     Una calle sola ("San Martin 500") existe en varios pueblos y en Cordoba capital: si
     se buscara en toda la zona, una calle de Villa Allende que falte en el mapa podia
     caer en la capital y cobrarse como envio lejano. Mejor "no encontrada" (precio base
     y se confirma a mano) que cobrar de mas. */
  const intentos = LOCALIDADES.test(dir) ? [dir + ', Córdoba'] : [dir + ', Villa Allende, Córdoba', dir + ', Mendiolaza, Córdoba'];
  let res = null;
  for (const q of intentos) { res = await enCola(() => nominatim(q)); if (res) break; }
  if (_geo.size > 2000) _geo.clear();
  _geo.set(k, res);
  return res;
}

/* Tope por IP para que nadie use esto para barrer direcciones (por instancia). */
const _ips = new Map();
function demasiadas(ip) {
  const ahora = Date.now(), v = (_ips.get(ip) || []).filter(t => ahora - t < 10 * 60 * 1000);
  v.push(ahora); _ips.set(ip, v);
  if (_ips.size > 5000) _ips.clear();
  return v.length > 30;
}

module.exports = async function handler(req, res) {
  res.setHeader('Content-Type', 'application/json; charset=utf-8');
  const enviar = (code, obj) => {
    res.setHeader('Cache-Control', 'no-store');
    res.statusCode = code; res.end(JSON.stringify(obj));
  };
  if (req.method !== 'POST') return enviar(405, { error: 'usar POST' });
  let body = req.body;
  if (typeof body === 'string') { try { body = JSON.parse(body); } catch (e) { body = {}; } }
  const dir = String((body && body.dir) || '').replace(/[\x00-\x1F<>"`]/g, ' ').replace(/\s+/g, ' ').trim();
  if (dir.length < 4 || dir.length > 200) return enviar(400, { error: 'direccion invalida' });

  const o = origen();
  const t = await tarifa();
  if (!o || !t.activo || !t.hayEnvios) return enviar(200, { calculo: false });

  const ip = String(req.headers['x-forwarded-for'] || '').split(',')[0].trim() || 'x';
  if (demasiadas(ip)) return enviar(429, { error: 'demasiadas consultas' });

  try {
    const p = await ubicar(dir);
    if (!p) return enviar(200, { calculo: true, encontrado: false, precio: t.base });
    return enviar(200, { calculo: true, encontrado: true, precio: precioPorKm(km(o, p), t) });
  } catch (e) {
    /* Nominatim caido o lento: que la tienda siga con el precio fijo y avise. */
    return enviar(503, { error: 'no se pudo calcular' });
  }
};
module.exports._test = { precioPorKm, km };
