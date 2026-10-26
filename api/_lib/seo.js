/**
 * Lo que comparten las paginas que arma el servidor para los buscadores (/producto/:slug y
 * /categoria/:slug) y el sitemap. Vercel no publica como ruta lo que esta en carpetas que
 * empiezan con "_", asi que esto no es un endpoint.
 *
 * Por que existe: la tienda dibuja todo con JavaScript despues de leer Firestore. Antes,
 * /producto/:slug devolvia la portada con otro <title> y nada mas en el cuerpo, asi que para
 * Google las 777 fichas eran la misma pagina que la portada. Ahora cada una lleva en el HTML
 * su propio contenido (nombre, precio, descripcion, categoria, datos estructurados), y cada
 * categoria tiene una pagina propia que se puede encontrar buscando "frutos secos Villa
 * Allende". La tienda arranca igual encima: el cliente ve lo mismo que antes.
 */
const fs = require('fs');
const path = require('path');
const admin = require('firebase-admin');

const SITE_URL = 'https://www.yerco.ar';
const LOGO = SITE_URL + '/img/LOGOS_Mesa%20de%20trabajo%201%20copia%2025.jpg.jpeg';
const ZONA = 'Villa Allende y Mendiolaza';

function getDb() {
  if (!admin.apps.length) {
    const raw = process.env.FIREBASE_SERVICE_ACCOUNT;
    if (!raw) throw new Error('FIREBASE_SERVICE_ACCOUNT no configurada');
    admin.initializeApp({ credential: admin.credential.cert(JSON.parse(raw)) });
  }
  return admin.firestore();
}

const esc = s => String(s == null ? '' : s)
  .replace(/&/g, '&amp;').replace(/"/g, '&quot;').replace(/</g, '&lt;').replace(/>/g, '&gt;');

/* JSON-LD adentro de <script>: lo unico que puede romperlo es un "</script>" en un nombre. */
const ld = obj => '<script type="application/ld+json">' + JSON.stringify(obj).replace(/</g, '\\u003c') + '</script>';

const norm = s => String(s || '').normalize('NFD').replace(/[̀-ͯ]/g, '').toUpperCase().trim();
const slugify = s => norm(s).toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '');

/* Las categorias las carga el comercio desde el panel en mayusculas y abreviadas ("HARINAS,
   FECULAS Y TEXTU."). Para el buscador hace falta un nombre legible y un texto propio. Si
   aparece una categoria nueva que no esta aca, igual tiene pagina: nombre y slug salen solos
   y el texto es el generico. */
const CATEGORIAS = {
  'CEREALES': { slug: 'cereales', nombre: 'Cereales, avenas y granolas',
    intro: 'Avenas, granolas, copos, inflados y barritas para el desayuno o la merienda, de marcas como Lasfor, Nutrifood y 3 Arroyos.' },
  'CONDIMENTOS': { slug: 'condimentos', nombre: 'Condimentos y especias',
    intro: 'Especias, hierbas secas y condimentos para cocinar todos los días: pimentón, orégano, cúrcuma, comino, ajo, pimientas y más.' },
  'REGIONALES Y OTROS': { slug: 'regionales', nombre: 'Regionales, dulces y almacén natural',
    intro: 'Mermeladas, dulce de leche, miel, pasta de maní, endulzantes, galletas, alfajores y leches vegetales.' },
  'HARINAS, FECULAS Y TEXTU.': { slug: 'harinas', nombre: 'Harinas, féculas y texturizados',
    intro: 'Harinas de todo tipo, féculas y proteína texturizada para cocinar y hornear en casa.' },
  'REPOSTERIA': { slug: 'reposteria', nombre: 'Repostería',
    intro: 'Para hornear en casa: levaduras, chocolates y productos de repostería de marcas como Colonial, Levex y Chocolart.' },
  'FRUTAS SECAS': { slug: 'frutos-secos', nombre: 'Frutos secos',
    intro: 'Almendras, nueces, maníes, castañas y otros frutos secos, para picar, para el desayuno o para cocinar.' },
  'SEMILLAS': { slug: 'semillas', nombre: 'Semillas',
    intro: 'Chía, lino, girasol, sésamo, zapallo y otras semillas para sumar a ensaladas, yogures, panes y licuados.' },
  'LEGUMBRES': { slug: 'legumbres', nombre: 'Legumbres',
    intro: 'Lentejas, garbanzos, porotos, arvejas y otras legumbres secas para guisos, hamburguesas vegetales y ensaladas.' },
  'YERBA, TE, INFUS. Y CAFE': { slug: 'yerbas-te-y-cafe', nombre: 'Yerbas, té, infusiones y café',
    intro: 'Yerbas como Tucangua, Ajedrez y Kalena, tés, hierbas para infusión y café tostado.' },
  'SUPLEMENTOS NATURALES': { slug: 'suplementos-naturales', nombre: 'Suplementos naturales',
    intro: 'Spirulina, maca, omega 3, fibra vegetal y otros suplementos de origen natural, de marcas como Origen Perú, Salutaris, Incaico e Io Naturale.' },
  'FRUTAS DESECADAS': { slug: 'frutas-desecadas', nombre: 'Frutas desecadas',
    intro: 'Pasas de uva, ciruelas y otras frutas desecadas, ideales para colaciones, granolas y repostería.' },
  'FRUTAS TROPICALES': { slug: 'frutas-tropicales', nombre: 'Frutas tropicales',
    intro: 'Ananá y otras frutas tropicales deshidratadas, para picar o para sumar a tus preparaciones.' },
  'MIX DE FRUTOS SECOS': { slug: 'mix-de-frutos-secos', nombre: 'Mix de frutos secos',
    intro: 'Mezclas de frutos secos, semillas y frutas desecadas listas para llevar como snack o para el desayuno.' },
  'ACEITES': { slug: 'aceites', nombre: 'Aceites',
    intro: 'Aceite de oliva, de coco y otros aceites para cocinar y condimentar.' },
  'SNACKS': { slug: 'snacks', nombre: 'Snacks',
    intro: 'Maní crocante saborizado, mix salado y otros snacks para picar.' },
  'ARROZ': { slug: 'arroz', nombre: 'Arroz',
    intro: 'Arroz integral, yamaní y otras variedades.' },
  'FIDEOS Y PREMEZCLAS': { slug: 'fideos-y-premezclas', nombre: 'Fideos y premezclas',
    intro: 'Fideos de arroz y premezclas para preparar en casa.' },
};
const _porNorm = {};
Object.keys(CATEGORIAS).forEach(k => { _porNorm[norm(k)] = CATEGORIAS[k]; });

const titleCase = s => String(s || '').toLowerCase().replace(/(^|\s)\S/g, m => m.toUpperCase());

function infoCategoria(raw) {
  const c = _porNorm[norm(raw)];
  if (c) return Object.assign({ raw }, c);
  return { raw, slug: slugify(raw), nombre: titleCase(raw), intro: '' };
}

/* Productos visibles con lo que hace falta para las paginas. Una sola lectura, cacheada
   unos minutos por instancia: las categorias necesitan todos los productos. */
let _cache = null, _cacheEn = 0;
async function productosVisibles() {
  if (_cache && Date.now() - _cacheEn < 5 * 60 * 1000) return _cache;
  const snap = await getDb().collection('productos')
    .select('slug', 'oculto', 'nombre', 'nombreMostrado', 'precio', 'descuento', 'stock', 'categoria', 'subcategoria', 'imagen', 'descripcion')
    .get();
  const vistos = new Set();
  const lista = [];
  snap.forEach(d => {
    const p = d.data();
    if (!p.slug || p.oculto === true || vistos.has(p.slug)) return;
    vistos.add(p.slug);
    lista.push(Object.assign({ id: d.id }, p));
  });
  _cache = lista; _cacheEn = Date.now();
  return lista;
}

/* Igual que precioFinal() de app.js, para que la ficha del servidor y la tienda digan lo mismo. */
function precioFinal(p) {
  const dsc = Math.min(100, Math.max(0, Number(p.descuento) || 0));
  const base = Number(p.precio) || 0;
  return dsc > 0 ? Math.round(base * (1 - dsc / 100)) : base;
}
const pesos = n => '$' + Math.round(Number(n) || 0).toLocaleString('es-AR');
const nombreDe = p => p.nombreMostrado || p.nombre || 'Producto';
function imagenAbs(u) {
  if (!u) return LOGO;
  if (/^https?:\/\//.test(u)) return u;
  return SITE_URL + '/' + String(u).replace(/^\/+/, '');
}

function leerIndexHtml() {
  const candidatos = [path.join(process.cwd(), 'index.html'), path.join(process.cwd(), 'public', 'index.html'), '/var/task/index.html'];
  for (const ruta of candidatos) {
    try { if (fs.existsSync(ruta)) return fs.readFileSync(ruta, 'utf-8'); } catch (e) { /* sigue */ }
  }
  return null;
}

async function indexHtml() {
  let html = leerIndexHtml();
  if (!html) {
    try { html = await (await fetch(SITE_URL + '/index.html')).text(); } catch (e) { html = null; }
  }
  return html;
}

/**
 * Arma una pagina a partir de la portada: cambia titulo, descripcion, canonical y Open
 * Graph, saca lo que es solo de la portada (texto y preguntas frecuentes, entre marcas
 * HOME_ONLY) y pone el contenido propio arriba de todo. El titulo grande de la portada
 * deja de ser <h1>: el <h1> de la pagina es el del producto o la categoria.
 */
function armarPagina(html, o) {
  const og = `<!--OG_START-->
    <meta property="og:title" content="${esc(o.titulo)}">
    <meta property="og:description" content="${esc(o.desc)}">
    <meta property="og:image" content="${esc(o.imagen || LOGO)}">
    <meta property="og:url" content="${esc(o.url)}">
    <meta property="og:type" content="${esc(o.ogType || 'website')}">
    <link rel="canonical" href="${esc(o.url)}">
    <meta name="twitter:card" content="summary_large_image">
    <meta name="twitter:title" content="${esc(o.titulo)}">
    <meta name="twitter:description" content="${esc(o.desc)}">
    <meta name="twitter:image" content="${esc(o.imagen || LOGO)}">
    <!--OG_END-->`;
  html = html.replace(/<!--OG_START-->[\s\S]*?<!--OG_END-->/, og);
  html = html.replace(/<title>[\s\S]*?<\/title>/, '<title>' + esc(o.titulo) + '</title>');
  html = html.replace(/<meta name="description"[^>]*>/, '<meta name="description" content="' + esc(o.desc) + '">');
  html = html.replace(/<!--HOME_ONLY_START-->[\s\S]*?<!--HOME_ONLY_END-->/g, '');
  html = html.replace(/<h1 class="hero-title">([\s\S]*?)<\/h1>/, '<p class="hero-title">$1</p>');
  html = html.replace(/<section id="inicio"/, o.cuerpo + '\n    <section id="inicio"');
  return html;
}

module.exports = {
  SITE_URL, LOGO, ZONA, getDb, esc, ld, slugify, infoCategoria, productosVisibles,
  precioFinal, pesos, nombreDe, imagenAbs, indexHtml, armarPagina,
};
