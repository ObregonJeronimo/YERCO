/**
 * /producto/:slug (rewrite en vercel.json). Devuelve la tienda con la ficha del producto ya
 * escrita en el HTML: nombre, precio, descripcion, categoria y datos estructurados (Product +
 * migas), para que Google y los previews de WhatsApp/Instagram la vean sin ejecutar nada.
 * Despues arranca la tienda normal y app.js abre el producto en su ventana, como siempre.
 *
 * Producto inexistente u oculto: 404 con noindex (antes devolvia la portada con 200 y Google
 * la podia indexar como una copia de la portada).
 */
const S = require('../_lib/seo');

async function buscarProductoPorSlug(slug) {
  const snap = await S.getDb().collection('productos').where('slug', '==', slug).limit(1).get();
  if (snap.empty) return null;
  return Object.assign({ id: snap.docs[0].id }, snap.docs[0].data());
}

/* Descripcion e informacion nutricional se cargan con saltos de linea en el panel. */
const conSaltos = s => S.esc(s).replace(/\r?\n/g, '<br>');

function cuerpoFicha(p, cat, hermanos, url) {
  const nombre = S.nombreDe(p);
  const final = S.precioFinal(p);
  const dsc = Math.min(100, Math.max(0, Number(p.descuento) || 0));
  const sinStock = Number(p.stock) === 0;
  const desc = (p.descripcion && p.descripcion.trim() && p.descripcion.trim() !== (p.nombre || '').trim()) ? p.descripcion.trim() : '';
  const img = S.imagenAbs(p.imagen);
  const vn = String(p.valoresNutricionales || '').trim();
  const catUrl = S.SITE_URL + '/categoria/' + cat.slug;

  const datos = [{
    '@context': 'https://schema.org', '@type': 'Product', name: nombre, image: [img], url,
    sku: p.id, category: cat.nombre,
    description: desc || (nombre + ' en Yerco Dietética, Villa Allende. Envío a domicilio a ' + S.ZONA + '.'),
    offers: {
      '@type': 'Offer', url, priceCurrency: 'ARS', price: final,
      availability: sinStock ? 'https://schema.org/OutOfStock' : 'https://schema.org/InStock',
      itemCondition: 'https://schema.org/NewCondition',
      seller: { '@type': 'Organization', name: 'Yerco Dietética' },
    },
  }, {
    '@context': 'https://schema.org', '@type': 'BreadcrumbList', itemListElement: [
      { '@type': 'ListItem', position: 1, name: 'Inicio', item: S.SITE_URL + '/' },
      { '@type': 'ListItem', position: 2, name: cat.nombre, item: catUrl },
      { '@type': 'ListItem', position: 3, name: nombre, item: url },
    ],
  }];

  const mas = hermanos.length
    ? '<div class="seo-mas"><h2>Más ' + S.esc(cat.nombre.toLowerCase()) + '</h2><ul>' +
      hermanos.map(h => '<li><a href="/producto/' + encodeURIComponent(h.slug) + '">' + S.esc(S.nombreDe(h)) + '</a> <span>' + S.pesos(S.precioFinal(h)) + '</span></li>').join('') +
      '</ul><a class="seo-vertodo" href="/categoria/' + cat.slug + '">Ver todo en ' + S.esc(cat.nombre) + '</a></div>'
    : '';

  return `<section class="seo-pagina" id="seoFicha">${datos.map(S.ld).join('')}<div class="container">
      <nav class="seo-migas" aria-label="Estás en"><a href="/">Inicio</a><span>›</span><a href="/categoria/${cat.slug}">${S.esc(cat.nombre)}</a><span>›</span><span>${S.esc(nombre)}</span></nav>
      <div class="seo-ficha">
        <img src="${S.esc(img)}" alt="${S.esc(nombre)}" width="320" height="320">
        <div class="seo-ficha-info">
          <h1>${S.esc(nombre)}</h1>
          <p class="seo-precio">${S.pesos(final)}${dsc > 0 ? ' <s>' + S.pesos(p.precio) + '</s> <span class="seo-dsc">-' + Math.round(dsc) + '%</span>' : ''}</p>
          <p class="seo-stock${sinStock ? ' sin' : ''}">${sinStock ? 'Sin stock por ahora' : 'Disponible'}</p>
          ${desc ? '<div class="seo-desc">' + conSaltos(desc) + '</div>' : ''}
          ${vn ? '<h2>Información nutricional</h2><div class="seo-vn">' + conSaltos(vn) + (/aproximad|orientativ/i.test(vn) ? '' : '<br><small>Valores aproximados de referencia; pueden variar según el lote y la marca.</small>') + '</div>' : ''}
          <p class="seo-envio">Envío a domicilio en ${S.ZONA}, o retiro sin cargo en Tablada 16, Villa Allende.</p>
          <a class="btn btn-primary-custom" href="#productos" onclick="if(typeof openProductDetailModal==='function'){openProductDetailModal('${S.esc(p.id)}');return false;}">Comprar</a>
        </div>
      </div>
      ${mas}
    </div></section>`;
}

module.exports = async function handler(req, res) {
  const slug = (req.query.slug || '').toString();
  let html = await S.indexHtml();
  if (!html) html = '<html><body>Yerco Dietética</body></html>';

  let p = null;
  try { if (slug) p = await buscarProductoPorSlug(slug); } catch (e) { p = null; }

  res.setHeader('Content-Type', 'text/html; charset=utf-8');

  if (!p || p.oculto === true) {
    /* La tienda igual arranca y muestra "Producto no encontrado"; para el buscador es un 404. */
    html = html.replace('<head>', '<head>\n    <meta name="robots" content="noindex">');
    res.setHeader('Cache-Control', 's-maxage=60');
    return res.status(404).send(html);
  }

  const cat = S.infoCategoria(p.categoria || 'Productos');
  let hermanos = [];
  try {
    hermanos = (await S.productosVisibles())
      .filter(h => h.categoria === p.categoria && h.slug !== p.slug)
      .sort((a, b) => (b.stock > 0) - (a.stock > 0) || S.nombreDe(a).localeCompare(S.nombreDe(b), 'es'))
      .slice(0, 8);
  } catch (e) { /* sin la lista, la ficha sale igual sin "Más ..." */ }

  const nombre = S.nombreDe(p);
  const url = S.SITE_URL + '/producto/' + encodeURIComponent(slug);
  html = S.armarPagina(html, {
    titulo: nombre + ' | Yerco Dietética Villa Allende',
    desc: nombre + ' a ' + S.pesos(S.precioFinal(p)) + ' en Yerco Dietética. Envío a domicilio en ' + S.ZONA + ' o retiro en Villa Allende.',
    url, imagen: S.imagenAbs(p.imagen), ogType: 'product',
    cuerpo: cuerpoFicha(p, cat, hermanos, url),
  });

  res.setHeader('Cache-Control', 's-maxage=300, stale-while-revalidate=600');
  res.status(200).send(html);
};
