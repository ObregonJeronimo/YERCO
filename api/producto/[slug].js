/**
 * Función serverless de Vercel: preview Open Graph de un producto.
 * Agregar ?debug=1 a la URL para ver el diagnóstico en JSON.
 */

const fs = require('fs');
const path = require('path');

const PROJECT_ID = 'yerco-bb620';
const FIRESTORE_BASE = `https://firestore.googleapis.com/v1/projects/${PROJECT_ID}/databases/(default)/documents`;
const API_KEY = 'AIzaSyCYTYtrsLipyXeWbOUR7sUm3NPLA0mHvgs';
const SITE_URL = 'https://www.yerco.ar';
const LOGO_FALLBACK = 'https://www.yerco.ar/img/LOGOS_Mesa%20de%20trabajo%201%20copia%2025.jpg.jpeg';

function escapeHtml(str) {
  return (str || '')
    .replace(/&/g, '&amp;')
    .replace(/"/g, '&quot;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;');
}

function leerIndexHtml() {
  const candidatos = [
    path.join(process.cwd(), 'index.html'),
    path.join(process.cwd(), 'public', 'index.html'),
    '/var/task/index.html'
  ];
  for (const ruta of candidatos) {
    try {
      if (fs.existsSync(ruta)) return { html: fs.readFileSync(ruta, 'utf-8'), ruta };
    } catch (e) { /* sigue */ }
  }
  return { html: null, ruta: null };
}

function parseDoc(fields) {
  const getStr = (f) => (fields[f] && fields[f].stringValue !== undefined) ? fields[f].stringValue : null;
  return {
    nombre: getStr('nombreMostrado') || getStr('nombre') || 'Producto',
    imagen: getStr('imagen') || null,
    categoria: getStr('categoria') || '',
    oculto: fields.oculto && fields.oculto.booleanValue === true,
    slug: getStr('slug')
  };
}

async function buscarProductoPorSlug(slug) {
  const diag = {};
  // MÉTODO 1: runQuery con key
  try {
    const query = {
      structuredQuery: {
        from: [{ collectionId: 'productos' }],
        where: { fieldFilter: { field: { fieldPath: 'slug' }, op: 'EQUAL', value: { stringValue: slug } } },
        limit: 1
      }
    };
    const resp = await fetch(`${FIRESTORE_BASE}:runQuery?key=${API_KEY}`, {
      method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(query)
    });
    diag.m1_status = resp.status;
    if (resp.ok) {
      const data = await resp.json();
      const row = Array.isArray(data) ? data.find(r => r.document) : null;
      if (row && row.document) {
        return { producto: parseDoc(row.document.fields || {}), fsStatus: resp.status, encontrado: true, metodo: 'runQuery', diag };
      }
      diag.m1_encontrado = false;
    } else {
      let e=''; try { e = await resp.text(); } catch(_){}
      diag.m1_error = e.slice(0,200);
    }
  } catch (e) { diag.m1_excepcion = e.message; }

  // MÉTODO 2: GET de la colección (lista documentos) y filtrar por slug en JS
  try {
    let pageToken = '';
    for (let i = 0; i < 12; i++) {
      const url = `${FIRESTORE_BASE}/productos?key=${API_KEY}&pageSize=300${pageToken ? '&pageToken=' + encodeURIComponent(pageToken) : ''}`;
      const resp = await fetch(url);
      diag.m2_status = resp.status;
      if (!resp.ok) {
        let e=''; try { e = await resp.text(); } catch(_){}
        diag.m2_error = e.slice(0,200);
        break;
      }
      const data = await resp.json();
      const docs = data.documents || [];
      for (const d of docs) {
        const p = parseDoc(d.fields || {});
        if (p.slug === slug) {
          return { producto: p, fsStatus: 200, encontrado: true, metodo: 'getCollection', diag };
        }
      }
      if (!data.nextPageToken) break;
      pageToken = data.nextPageToken;
    }
    diag.m2_encontrado = false;
  } catch (e) { diag.m2_excepcion = e.message; }

  return { producto: null, fsStatus: diag.m1_status || diag.m2_status || 0, encontrado: false, fsError: JSON.stringify(diag), diag };
}

module.exports = async function handler(req, res) {
  const slug = (req.query.slug || '').toString();
  const debug = req.query.debug === '1';

  const idx = leerIndexHtml();
  let html = idx.html;
  let viaHttp = false;
  if (!html) {
    try {
      const idxResp = await fetch(`${SITE_URL}/index.html`);
      html = await idxResp.text();
      viaHttp = true;
    } catch (e) {
      html = '<html><body>Yerco</body></html>';
    }
  }

  let resultado = { producto: null };
  try {
    if (slug) resultado = await buscarProductoPorSlug(slug);
  } catch (e) {
    resultado = { producto: null, error: e.message };
  }
  const producto = resultado.producto;

  const teniaMarcador = html && html.indexOf('<!--OG_START-->') !== -1;
  let reemplazado = false;

  if (producto && !producto.oculto && html) {
    const titulo = escapeHtml(producto.nombre) + ' | Yerco Dietética';
    const desc = escapeHtml('Conseguilo en Yerco Dietética. Productos naturales y de calidad a la puerta de tu casa.');
    const imagen = producto.imagen ? escapeHtml(producto.imagen) : LOGO_FALLBACK;
    const url = `${SITE_URL}/producto/${escapeHtml(slug)}`;

    const ogTags = `<!--OG_START-->
    <meta property="og:title" content="${titulo}">
    <meta property="og:description" content="${desc}">
    <meta property="og:image" content="${imagen}">
    <meta property="og:url" content="${url}">
    <meta property="og:type" content="product">
    <meta name="twitter:card" content="summary_large_image">
    <meta name="twitter:title" content="${titulo}">
    <meta name="twitter:description" content="${desc}">
    <meta name="twitter:image" content="${imagen}">
    <!--OG_END-->`;

    const before = html;
    html = html.replace(/<!--OG_START-->[\s\S]*?<!--OG_END-->/, ogTags);
    html = html.replace(/<title>[\s\S]*?<\/title>/, `<title>${titulo}</title>`);
    reemplazado = (html !== before);
  }

  if (debug) {
    res.setHeader('Content-Type', 'application/json; charset=utf-8');
    res.status(200).send(JSON.stringify({
      slug,
      indexLeido: !!idx.html,
      indexRuta: idx.ruta,
      viaHttp,
      cwd: process.cwd(),
      teniaMarcador,
      firestoreStatus: resultado.fsStatus,
      encontrado: resultado.encontrado,
      fsError: resultado.fsError || null,
      metodo: resultado.metodo || null,
      diag: resultado.diag || null,
      producto: producto ? { nombre: producto.nombre, imagen: producto.imagen, oculto: producto.oculto } : null,
      reemplazado,
      error: resultado.error || null
    }, null, 2));
    return;
  }

  res.setHeader('Content-Type', 'text/html; charset=utf-8');
  res.setHeader('Cache-Control', 's-maxage=300, stale-while-revalidate=600');
  res.status(200).send(html);
};
