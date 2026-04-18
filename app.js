/**
 * YERCO DIETÉTICA - SCRIPT PRINCIPAL
 * Firebase Firestore + Filtros jerárquicos + Búsqueda + Orden + Paginación
 */
const WHATSAPP_NUMBER = '5493515314675';
const PRODUCTS_PER_PAGE = 10;
function optImg(url,w){if(!url||!url.startsWith('http'))return url;return 'https://wsrv.nl/?url='+encodeURIComponent(url)+'&w='+(w||400)+'&q=70&output=webp&default=img/default-product.jpg';}
let productos = [];
let carrito = [];
let categoriaActual = 'Todos';
let subcategoriaActual = null;
let ordenPrecio = 'asc';
let ordenAlfa = null;
let busquedaTexto = '';
let paginaActual = 1;

document.addEventListener('DOMContentLoaded', () => {
    initNavbar(); initParticles(); initContactForm(); initCart();
    loadProductsFromFirebase(); initScrollAnimations();
});

function initNavbar() {
    const navbar = document.getElementById('mainNavbar');
    window.addEventListener('scroll', () => { navbar.classList.toggle('scrolled', window.scrollY > 50); updateActiveNavLink(); });
    document.querySelectorAll('.nav-link').forEach(link => {
        link.addEventListener('click', () => { const c = document.querySelector('.navbar-collapse'); if (c.classList.contains('show')) bootstrap.Collapse.getInstance(c)?.hide(); });
    });
}
function updateActiveNavLink() {
    let cur = '';
    document.querySelectorAll('section[id]').forEach(s => { if (window.scrollY >= s.offsetTop - 100 && window.scrollY < s.offsetTop - 100 + s.offsetHeight) cur = s.id; });
    document.querySelectorAll('.nav-link').forEach(l => l.classList.toggle('active', l.getAttribute('href') === '#' + cur));
}

function initParticles() {
    const c = document.getElementById('particles'); if (!c) return;
    if (window.innerWidth < 768) return;
    const count = window.innerWidth < 1200 ? 6 : 10;
    for (let i = 0; i < count; i++) { const p = document.createElement('div'); p.className='particle'; p.style.left=Math.random()*100+'%'; p.style.top=Math.random()*100+'%'; p.style.animationDelay=Math.random()*15+'s'; p.style.animationDuration=(15+Math.random()*10)+'s'; p.style.width=(5+Math.random()*15)+'px'; p.style.height=p.style.width; c.appendChild(p); }
}

function initContactForm() {
    const form = document.getElementById('contactForm'); if (!form) return;
    form.addEventListener('submit', (e) => { e.preventDefault(); const n=document.getElementById('nombre').value,em=document.getElementById('email').value,m=document.getElementById('mensaje').value; const msg='Hola, soy *'+n+'*\n\nConsulta: '+m+'\n\nMi email de contacto: '+em; window.open('https://wa.me/'+WHATSAPP_NUMBER+'?text='+encodeURIComponent(msg),'_blank'); form.reset(); if(document.getElementById('chatFloatBox'))document.getElementById('chatFloatBox').classList.remove('show'); if(document.getElementById('chatFloatBtn'))document.getElementById('chatFloatBtn').classList.remove('hide'); });
}

async function loadProductsFromFirebase(retries) {
    if (retries === undefined) retries = 2;
    const loading = document.getElementById('productsLoading'); if (loading) loading.classList.add('show');
    try {
        const snap = await db.collection('productos').get();
        productos = snap.docs.map(d => { const r=d.data(); return { id:d.id, nombre:r.nombre||'', precio:r.precio||0, stock:r.stock||0, categoria:r.categoria||'', subcategoria:r.subcategoria||null, imagen:r.imagen||null, descripcion:r.descripcion||r.nombre||'', popular:r.popular||false, oculto:r.oculto===true }; }).filter(p => !p.oculto);
        renderCategoryFilters(getCategoriasConSub(productos)); loadIndexPacks(); aplicarFiltros();
    } catch(e) { console.error(e); if(retries>0){setTimeout(()=>loadProductsFromFirebase(retries-1),1500);return;} showToast('Error al cargar productos.','error'); }
    finally { if (loading) loading.classList.remove('show'); }
}

let indexPacks=[];
async function loadIndexPacks() {
    const sec = document.getElementById('packsSection');
    const row = document.getElementById('packsRow');
    if (!sec || !row) return;
    try{
        const snap = await db.collection('packs').get();
        indexPacks = snap.docs.map(d=>({id:d.id,...d.data()}));
        if (!indexPacks.length) { sec.style.display = 'none'; return; }
        sec.style.display = 'block';
        row.innerHTML = indexPacks.map(p => {
            const img = optImg(p.imagen,300) || 'img/default-product.jpg';
            return '<div class="popular-card"><img src="'+esc(img)+'" alt="'+esc(p.nombre)+'" loading="lazy"><div class="popular-card-info"><div class="popular-card-name">'+esc(p.nombre)+'</div><div class="popular-card-price">$'+(p.precioVenta||0).toLocaleString('es-AR')+'</div></div><button class="popular-card-btn" style="background:var(--color-primary-dark)" onclick="showPackDetail(\''+p.id+'\')"><i class="bi bi-eye"></i> Ver productos</button></div>';
        }).join('');
    }catch(e){console.error('Packs error:',e);}
}
function showPackDetail(packId){
    const p=indexPacks.find(x=>x.id===packId);if(!p)return;
    document.getElementById('packDetailTitle').textContent=p.nombre;
    document.getElementById('packDetailItems').innerHTML=(p.items||[]).map(i=>'<div style="display:flex;justify-content:space-between;padding:6px 0;border-bottom:1px solid #eee;font-size:0.92rem"><span>'+esc(i.nombre)+' <span style="color:#999">x'+i.cantidad+'</span></span><span style="font-weight:600">$'+(i.precio*i.cantidad).toLocaleString('es-AR')+'</span></div>').join('');
    document.getElementById('packDetailTotal').innerHTML='<span>Total Pack</span><span style="color:var(--color-primary-dark)">$'+(p.precioVenta||0).toLocaleString('es-AR')+'</span>';
    const addBtn=document.getElementById('packDetailAddBtn');
    addBtn.onclick=()=>{(p.items||[]).forEach(i=>{for(let q=0;q<i.cantidad;q++)addToCart(i.id);});document.getElementById('packDetailModal').style.display='none';showToast('Pack agregado al carrito','success');};
    document.getElementById('packDetailModal').style.display='flex';
}
window.showPackDetail=showPackDetail;

function getCategoriasConSub(prods) {
    const m = {}; prods.forEach(p => { if(!p.categoria)return; if(!m[p.categoria])m[p.categoria]=new Set(); if(p.subcategoria)m[p.categoria].add(p.subcategoria); }); return m;
}

function aplicarFiltros() {
    let r = [...productos];
    if (categoriaActual === 'Populares') r = r.filter(p => p.popular === true);
    else if (categoriaActual !== 'Todos') r = r.filter(p => p.categoria === categoriaActual);
    if (subcategoriaActual) r = r.filter(p => p.subcategoria === subcategoriaActual);
    if (busquedaTexto) { const q=busquedaTexto.toLowerCase(); r=r.filter(p=>(p.nombre||'').toLowerCase().includes(q)||(p.categoria||'').toLowerCase().includes(q)||(p.subcategoria||'').toLowerCase().includes(q)||(p.descripcion||'').toLowerCase().includes(q)); }
    r.sort((a,b)=>{
        if(ordenAlfa){const cmp=(a.nombre||'').localeCompare(b.nombre||'','es');if(cmp!==0)return ordenAlfa==='asc'?cmp:-cmp;}
        if(ordenPrecio){const cmp=a.precio-b.precio;if(cmp!==0)return ordenPrecio==='asc'?cmp:-cmp;}
        return 0;
    });
    renderProductsPaginated(r); updateSortButtonUI();
}

function filterByCategory(cat) { categoriaActual=cat; subcategoriaActual=null; paginaActual=1; aplicarFiltros(); }
function filterBySubCategory(cat,sub) { categoriaActual=cat; subcategoriaActual=sub; paginaActual=1; aplicarFiltros(); }
function onSearchInput(v) { busquedaTexto=v; paginaActual=1; aplicarFiltros(); }
function toggleSortPrice() { if(!ordenPrecio)ordenPrecio='asc';else if(ordenPrecio==='asc')ordenPrecio='desc';else ordenPrecio='asc'; paginaActual=1; aplicarFiltros(); }
function toggleSortAlfa() { if(!ordenAlfa)ordenAlfa='asc';else if(ordenAlfa==='asc')ordenAlfa='desc';else ordenAlfa='asc'; paginaActual=1; aplicarFiltros(); }
function updateSortButtonUI() { const b=document.getElementById('sortBtn'),a=document.getElementById('sortAlfaBtn'); if(b){b.innerHTML=ordenPrecio==='desc'?'<i class="bi bi-sort-numeric-down-alt"></i> Mayor precio':'<i class="bi bi-sort-numeric-up"></i> Menor precio';b.style.borderColor=ordenPrecio?'var(--color-primary)':'';b.style.opacity=ordenPrecio?'1':'0.5';} if(a){a.innerHTML=ordenAlfa==='desc'?'<i class="bi bi-sort-alpha-up-alt"></i> Z-A':'<i class="bi bi-sort-alpha-down"></i> A-Z';a.style.borderColor=ordenAlfa?'var(--color-primary)':'';a.style.opacity=ordenAlfa?'1':'0.5';} }

function renderCategoryFilters(mapa) {
    const container = document.getElementById('categoryFilters'); if (!container) return;
    container.innerHTML = '';
    const popBtn = document.createElement('button');
    popBtn.className = 'filter-btn'+(categoriaActual==='Populares'?' active':''); popBtn.innerHTML = '<i class="bi bi-star-fill" style="margin-right:4px"></i>Populares';
    popBtn.addEventListener('click', () => { setActiveFilter(popBtn); hideAllSubFilters(); filterByCategory('Populares'); });
    container.appendChild(popBtn);
    const todosBtn = document.createElement('button');
    todosBtn.className = 'filter-btn'+(categoriaActual==='Todos'?' active':''); todosBtn.textContent = 'Todos';
    todosBtn.addEventListener('click', () => { setActiveFilter(todosBtn); hideAllSubFilters(); filterByCategory('Todos'); });
    container.appendChild(todosBtn);
    Object.keys(mapa).sort((a,b)=>{const yA=a.toUpperCase().startsWith('YERBA')?1:0;const yB=b.toUpperCase().startsWith('YERBA')?1:0;if(yA!==yB)return yA-yB;return a.localeCompare(b);}).forEach(cat => {
        const subs = [...mapa[cat]].sort();
        const wrapper = document.createElement('div'); wrapper.className = 'filter-group';
        const catBtn = document.createElement('button'); catBtn.className = 'filter-btn'; catBtn.textContent = cat;
        const subRow = document.createElement('div'); subRow.className = 'sub-filters-row';
        if (subs.length > 0) {
            const allBtn = document.createElement('button'); allBtn.className = 'sub-btn active'; allBtn.textContent = 'Todo';
            allBtn.addEventListener('click', () => { subRow.querySelectorAll('.sub-btn').forEach(b=>b.classList.remove('active')); allBtn.classList.add('active'); subcategoriaActual=null; paginaActual=1; aplicarFiltros(); });
            subRow.appendChild(allBtn);
            subs.forEach(sub => {
                const subBtn = document.createElement('button'); subBtn.className = 'sub-btn'; subBtn.textContent = sub;
                subBtn.addEventListener('click', () => { subRow.querySelectorAll('.sub-btn').forEach(b=>b.classList.remove('active')); subBtn.classList.add('active'); filterBySubCategory(cat,sub); });
                subRow.appendChild(subBtn);
            });
        }
        catBtn.addEventListener('click', () => { setActiveFilter(catBtn); hideAllSubFilters(); if(subs.length>0)subRow.classList.add('show'); subcategoriaActual=null; paginaActual=1; filterByCategory(cat); });
        wrapper.appendChild(catBtn);
        if (subs.length > 0) wrapper.appendChild(subRow);
        container.appendChild(wrapper);
    });
}
function setActiveFilter(btn) { document.querySelectorAll('#categoryFilters .filter-btn').forEach(b=>b.classList.remove('active')); btn.classList.add('active'); }
function hideAllSubFilters() { document.querySelectorAll('.sub-filters-row').forEach(r=>r.classList.remove('show')); }

function formatPrice(v) { return v.toLocaleString('es-AR',{minimumFractionDigits:0}); }
function esc(s){const d=document.createElement('div');d.textContent=s;return d.innerHTML;}

function renderProductsPaginated(list) {
    const totalPages = Math.ceil(list.length / PRODUCTS_PER_PAGE);
    if (paginaActual > totalPages) paginaActual = totalPages || 1;
    const start = (paginaActual - 1) * PRODUCTS_PER_PAGE;
    const end = start + PRODUCTS_PER_PAGE;
    const pageItems = list.slice(start, end);
    renderProducts(pageItems);
    renderPagination(totalPages, list.length);
}

function renderPagination(totalPages, totalItems) {
    const container = document.getElementById('paginationContainer'); if(!container) return;
    if (totalPages <= 1) { container.innerHTML = ''; return; }
    let html = '<div class="pagination-container">';
    html += '<button onclick="goToPage('+(paginaActual-1)+')"'+(paginaActual===1?' disabled':'')+'><i class="bi bi-chevron-left"></i></button>';
    for (let i = 1; i <= totalPages; i++) {
        if (totalPages <= 7 || i === 1 || i === totalPages || (i >= paginaActual - 1 && i <= paginaActual + 1)) {
            html += '<button onclick="goToPage('+i+')"'+(i===paginaActual?' class="active"':'')+'>'+i+'</button>';
        } else if (i === paginaActual - 2 || i === paginaActual + 2) {
            html += '<span style="padding:0 0.3rem;color:var(--color-text-light)">...</span>';
        }
    }
    html += '<button onclick="goToPage('+(paginaActual+1)+')"'+(paginaActual===totalPages?' disabled':'')+'><i class="bi bi-chevron-right"></i></button>';
    html += '</div>';
    html += '<p class="pagination-info">Mostrando '+(((paginaActual-1)*PRODUCTS_PER_PAGE)+1)+' - '+Math.min(paginaActual*PRODUCTS_PER_PAGE, totalItems)+' de '+totalItems+' productos</p>';
    container.innerHTML = html;
}

function goToPage(page) {
    paginaActual = page;
    aplicarFiltros();
    const section = document.getElementById('productos');
    if (section) section.scrollIntoView({ behavior: 'smooth', block: 'start' });
}

function renderProducts(list) {
    const c = document.getElementById('productsGrid'); if(!c)return;
    if (list.length===0) { c.innerHTML='<div class="empty-products"><i class="bi bi-search" style="font-size:2.5rem;color:var(--color-text-light)"></i><p style="color:var(--color-text-light);margin-top:1rem;font-size:1.05rem">No se encontraron productos</p></div>'; return; }
    c.innerHTML = list.map(p => {
        const ci=carrito.find(i=>i.id===p.id),qty=ci?ci.cantidad:0;
        const img=optImg(p.imagen,400)||'data:image/svg+xml,%3Csvg xmlns=%22http://www.w3.org/2000/svg%22 width=%22400%22 height=%22300%22%3E%3Crect fill=%22%23e8e0d5%22 width=%22400%22 height=%22300%22/%3E%3Ctext x=%22200%22 y=%22155%22 text-anchor=%22middle%22 fill=%22%23999%22 font-size=%2216%22%3ESin imagen%3C/text%3E%3C/svg%3E';
        const noStock = p.stock === 0;
        return '<article class="product-card" data-id="'+p.id+'">' +
            '<div class="product-image"><div class="img-skeleton"></div><img src="'+esc(img)+'" alt="'+esc(p.nombre)+'" loading="lazy" onload="this.style.opacity=1;this.previousElementSibling.style.display=\'none\'" onerror="this.src=\'img/default-product.jpg\';this.style.opacity=1;this.previousElementSibling.style.display=\'none\'" style="opacity:0;transition:opacity 0.3s">' +
            '<span class="product-category">'+esc(p.categoria)+(p.subcategoria?' - '+esc(p.subcategoria):'')+'</span>' +
            (noStock?'<span class="product-stock out">Sin stock</span>':'') +
            '</div>' +
            '<div class="product-info">' +
            '<h3 class="product-name">'+esc(p.nombre)+'</h3>' +
            '<div class="product-footer">' +
            '<span class="product-price">$'+formatPrice(p.precio)+'</span>' +
            '<div class="quantity-controls">' +
            '<button class="qty-btn" onclick="updateProductQuantity(\''+p.id+'\',-1)"'+(qty===0?' disabled':'')+'><i class="bi bi-dash"></i></button>' +
            '<span class="qty-value" id="qty-'+p.id+'">'+qty+'</span>' +
            '<button class="qty-btn" onclick="updateProductQuantity(\''+p.id+'\',1)"'+(noStock||qty>=p.stock?' disabled':'')+'><i class="bi bi-plus"></i></button>' +
            '</div></div>' +
            '<button class="add-to-cart-btn'+(qty>0?' added':'')+'" onclick="addToCart(\''+p.id+'\')"'+(noStock?' disabled':'')+'>' +
            '<i class="bi '+(qty>0?'bi-check-lg':'bi-cart-plus')+'"></i> '+(noStock?'Sin stock':(qty>0?'En el carrito':'Agregar')) +
            '</button></div></article>';
    }).join('');
}

// === CARRITO ===
function initCart() {
    const saved=localStorage.getItem('yercoCart'); if(saved){carrito=JSON.parse(saved);updateCartUI();}
    document.getElementById('cartToggle')?.addEventListener('click',openCart);
    document.getElementById('cartClose')?.addEventListener('click',closeCart);
    document.getElementById('cartOverlay')?.addEventListener('click',closeCart);
    document.getElementById('browseProductsBtn')?.addEventListener('click',()=>closeCart());
    document.getElementById('goToCartBtn')?.addEventListener('click',()=>openCart());
    document.getElementById('checkoutBtn')?.addEventListener('click',checkout);
    document.addEventListener('keydown',e=>{if(e.key==='Escape')closeCart();});
}
function openCart(){document.getElementById('cartSidebar')?.classList.add('show');document.getElementById('cartOverlay')?.classList.add('show');document.body.style.overflow='hidden';}
function closeCart(){document.getElementById('cartSidebar')?.classList.remove('show');document.getElementById('cartOverlay')?.classList.remove('show');document.body.style.overflow='';}

function updateProductQuantity(id,ch) {
    const p=productos.find(x=>x.id===id); if(!p)return;
    let idx=carrito.findIndex(i=>i.id===id);
    if(idx===-1&&ch>0){carrito.push({id:p.id,nombre:p.nombre,precio:p.precio,imagen:p.imagen,cantidad:1});showToast(p.nombre+' agregado','success');}
    else if(idx!==-1){const nq=carrito[idx].cantidad+ch;if(nq<=0){carrito.splice(idx,1);showToast(p.nombre+' eliminado','info');}else if(nq<=p.stock){carrito[idx].cantidad=nq;}else{showToast('Stock máximo','error');return;}}
    saveCart();updateCartUI();updateProductCard(id);
}
function addToCart(id) {
    const p=productos.find(x=>x.id===id); if(!p||p.stock===0)return;
    if(carrito.find(i=>i.id===id)){openCart();}else{carrito.push({id:p.id,nombre:p.nombre,precio:p.precio,imagen:p.imagen,cantidad:1});showToast(p.nombre+' agregado','success');saveCart();updateCartUI();updateProductCard(id);}
}
function updateProductCard(id) {
    const p=productos.find(x=>x.id===id),ci=carrito.find(i=>i.id===id),qty=ci?ci.cantidad:0;
    const qe=document.getElementById('qty-'+id);if(qe)qe.textContent=qty;
    const card=document.querySelector('.product-card[data-id="'+id+'"]');
    if(card){const mb=card.querySelector('.qty-btn:first-child'),pb=card.querySelector('.qty-btn:last-child'),ab=card.querySelector('.add-to-cart-btn');if(mb)mb.disabled=qty===0;if(pb)pb.disabled=p.stock===0||qty>=p.stock;if(ab){ab.classList.toggle('added',qty>0);ab.innerHTML=qty>0?'<i class="bi bi-check-lg"></i> En el carrito':'<i class="bi bi-cart-plus"></i> Agregar';}}
}
function updateCartItemQuantity(id,ch){const p=productos.find(x=>x.id===id),idx=carrito.findIndex(i=>i.id===id);if(idx===-1)return;const nq=carrito[idx].cantidad+ch;if(nq<=0)removeFromCart(id);else if(nq<=p.stock){carrito[idx].cantidad=nq;saveCart();updateCartUI();updateProductCard(id);}else showToast('Stock máximo: '+p.stock,'error');}
function removeFromCart(id){const idx=carrito.findIndex(i=>i.id===id);if(idx!==-1){const nm=carrito[idx].nombre;carrito.splice(idx,1);showToast(nm+' eliminado','info');saveCart();updateCartUI();updateProductCard(id);}}
function saveCart(){localStorage.setItem('yercoCart',JSON.stringify(carrito));}
function clearCart(){if(carrito.length===0)return;if(!confirm('Vaciar todo el carrito?'))return;const ids=carrito.map(i=>i.id);carrito=[];saveCart();updateCartUI();ids.forEach(id=>updateProductCard(id));showToast('Carrito vaciado','info');}

function updateCartUI() {
    const body=document.getElementById('cartBody'),empty=document.getElementById('cartEmpty'),footer=document.getElementById('cartFooter'),count=document.getElementById('cartCount'),total=document.getElementById('cartTotal'),cta=document.getElementById('ctaCartCount'),ckBtn=document.getElementById('checkoutBtn');
    const ti=carrito.reduce((s,i)=>s+i.cantidad,0),tp=carrito.reduce((s,i)=>s+(i.precio*i.cantidad),0);
    if(count)count.textContent=ti;if(cta)cta.textContent=ti;if(total)total.textContent='$'+formatPrice(tp);
    if(carrito.length===0){if(empty)empty.style.display='block';if(footer)footer.style.display='none';body?.querySelectorAll('.cart-item').forEach(i=>i.remove());}
    else{if(empty)empty.style.display='none';if(footer){footer.style.display='';footer.style.removeProperty('display');}renderCartItems();}
    if(ckBtn){ckBtn.disabled=carrito.length===0||tp<30000;if(tp>0&&tp<30000){ckBtn.innerHTML='<i class="bi bi-whatsapp"></i> Minimo $30.000';}else{ckBtn.innerHTML='<i class="bi bi-whatsapp"></i> Comprar por WhatsApp';}}
    updateShippingBar(tp);
}
function renderCartItems() {
    const body=document.getElementById('cartBody'),empty=document.getElementById('cartEmpty');if(!body)return;
    body.querySelectorAll('.cart-item').forEach(i=>i.remove());
    carrito.forEach(item=>{const p=productos.find(x=>x.id===item.id),ms=p?p.stock:item.cantidad;const el=document.createElement('div');el.className='cart-item';el.innerHTML='<img src="'+esc(optImg(item.imagen,100)||'img/default-product.jpg')+'" alt="'+esc(item.nombre)+'" class="cart-item-image"><div class="cart-item-info"><h4 class="cart-item-name">'+esc(item.nombre)+'</h4><span class="cart-item-price">$'+formatPrice(item.precio)+'</span><div class="cart-item-controls"><button class="qty-btn" onclick="updateCartItemQuantity(\''+item.id+'\',-1)"><i class="bi bi-dash"></i></button><span class="qty-value">'+item.cantidad+'</span><button class="qty-btn" onclick="updateCartItemQuantity(\''+item.id+'\',1)"'+(item.cantidad>=ms?' disabled':'')+'><i class="bi bi-plus"></i></button><button class="cart-item-remove" onclick="removeFromCart(\''+item.id+'\')"><i class="bi bi-trash"></i></button></div></div>';body.insertBefore(el,empty);});
}

function updateShippingBar(total) {
    const msg=document.getElementById('shippingMsg'),fill=document.getElementById('shippingBarFill');
    if(!msg||!fill)return;
    const MIN_ORDER=30000,FREE_SHIPPING=100000;
    if(total<MIN_ORDER){const faltan=MIN_ORDER-total;msg.textContent='Faltan $'+formatPrice(faltan)+' para pedido minimo ($30.000)';msg.className='shipping-msg under-min';fill.style.width=(total/FREE_SHIPPING*100)+'%';fill.style.background='#c0392b';}
    else if(total<FREE_SHIPPING){const faltan=FREE_SHIPPING-total;msg.textContent='Faltan $'+formatPrice(faltan)+' para envio gratis!';msg.className='shipping-msg near-free';fill.style.width=(total/FREE_SHIPPING*100)+'%';fill.style.background='#e67e22';}
    else{msg.textContent='Tenes envio gratis!';msg.className='shipping-msg free-shipping';fill.style.width='100%';fill.style.background='var(--color-primary)';}
}

function checkout() {
    if(carrito.length===0){showToast('Carrito vacío','error');return;}
    let msg='Hola! Quiero realizar el siguiente pedido:\n\n*DETALLE DEL PEDIDO*\n--------------------\n';let total=0;
    carrito.forEach((item,i)=>{const sub=item.precio*item.cantidad;total+=sub;msg+=''+(i+1)+'. '+item.nombre+'\n   Cantidad: '+item.cantidad+' x $'+formatPrice(item.precio)+' = $'+formatPrice(sub)+'\n\n';});
    msg+='--------------------\n*TOTAL: $'+formatPrice(total)+'*\n';
    if(total>=100000){msg+='*ENVIO GRATIS* (compra mayor a $100.000)\n';}
    else{msg+='Envio: $2.000\n*TOTAL CON ENVIO: $'+formatPrice(total+2000)+'*\n';}
    msg+='\nGracias!';
    window.open('https://wa.me/'+WHATSAPP_NUMBER+'?text='+encodeURIComponent(msg),'_blank');showToast('Redirigiendo a WhatsApp...','success');closeCart();
}

function showToast(message,type){type=type||'info';const c=document.getElementById('toastContainer');if(!c)return;const icons={success:'bi-check-circle-fill',error:'bi-exclamation-circle-fill',info:'bi-info-circle-fill'};const t=document.createElement('div');t.className='toast '+type;t.innerHTML='<i class="toast-icon bi '+(icons[type]||icons.info)+'"></i><span class="toast-message">'+message+'</span>';c.appendChild(t);setTimeout(()=>{t.classList.add('removing');setTimeout(()=>t.remove(),300);},3000);}

function initScrollAnimations(){if(window.innerWidth<768||window.matchMedia('(prefers-reduced-motion:reduce)').matches)return;const o=new IntersectionObserver(entries=>{entries.forEach(e=>{if(e.isIntersecting){e.target.classList.add('animate-in');o.unobserve(e.target);}});},{threshold:0.1,rootMargin:'0px 0px -50px 0px'});document.querySelectorAll('.service-card,.feature-card,.product-card').forEach(el=>{el.style.opacity='0';el.style.transform='translateY(30px)';el.style.transition='opacity 0.6s ease, transform 0.6s ease';o.observe(el);});const s=document.createElement('style');s.textContent='.animate-in{opacity:1!important;transform:translateY(0)!important;}';document.head.appendChild(s);}

function toggleCategoryFilters(){const f=document.getElementById('categoryFilters');const btn=document.getElementById('toggleCatsBtn');f.classList.toggle('cat-hidden');if(f.classList.contains('cat-hidden')){btn.innerHTML='<i class="bi bi-funnel"></i> Categorias';}else{btn.innerHTML='<i class="bi bi-funnel-fill"></i> Categorias';}}

window.filterByCategory=filterByCategory;window.filterBySubCategory=filterBySubCategory;window.updateProductQuantity=updateProductQuantity;window.addToCart=addToCart;window.updateCartItemQuantity=updateCartItemQuantity;window.removeFromCart=removeFromCart;window.onSearchInput=onSearchInput;window.toggleSortPrice=toggleSortPrice;window.toggleSortAlfa=toggleSortAlfa;window.goToPage=goToPage;window.toggleCategoryFilters=toggleCategoryFilters;window.scrollToProduct=scrollToProduct;

// Cargar contenido editable desde Firestore
async function loadSiteContent(){try{const snap=await db.collection('config').doc('siteContent').get();if(!snap.exists)return;const d=snap.data();const s=(id,val)=>{const el=document.querySelector(id);if(el&&val)el.textContent=val;};s('.hero-badge span',d.heroBadge);const tl=document.querySelectorAll('.title-line');if(tl[0]&&d.heroTitle1)tl[0].textContent=d.heroTitle1;const th=document.querySelectorAll('.title-highlight');if(th[0]&&d.heroTitle2)th[0].textContent=d.heroTitle2;s('.hero-subtitle',d.heroSubtitle);const stats=document.querySelectorAll('.stat-item');if(stats[0]&&d.stat1Num){stats[0].querySelector('.stat-number').textContent=d.stat1Num;stats[0].querySelector('.stat-label').textContent=d.stat1Label||'';}if(stats[1]&&d.stat2Num){stats[1].querySelector('.stat-number').textContent=d.stat2Num;stats[1].querySelector('.stat-label').textContent=d.stat2Label||'';}s('.why-us-section .section-tag',d.nosotrosTag);s('.why-us-section .section-title',d.nosotrosTitulo);s('.why-us-text',d.nosotrosTexto);const badges=document.querySelectorAll('.trust-badge span');if(badges[0]&&d.badge1)badges[0].textContent=d.badge1;if(badges[1]&&d.badge2)badges[1].textContent=d.badge2;const cards=document.querySelectorAll('.feature-card');if(cards[0]){if(d.card1t)cards[0].querySelector('h4').textContent=d.card1t;if(d.card1p)cards[0].querySelector('p').textContent=d.card1p;}if(cards[1]){if(d.card2t)cards[1].querySelector('h4').textContent=d.card2t;if(d.card2p)cards[1].querySelector('p').textContent=d.card2p;}if(cards[2]){if(d.card3t)cards[2].querySelector('h4').textContent=d.card3t;if(d.card3p)cards[2].querySelector('p').textContent=d.card3p;}if(cards[3]){if(d.card4t)cards[3].querySelector('h4').textContent=d.card4t;if(d.card4p)cards[3].querySelector('p').textContent=d.card4p;}s('.cta-title',d.ctaTitulo);s('.cta-text',d.ctaTexto);s('.footer-description',d.footerDesc);if(d.instagram){const ig=document.querySelector('.social-links a[aria-label="Instagram"]');if(ig)ig.href=d.instagram;}if(d.whatsapp){const wa=document.querySelectorAll('a[href*="wa.me"]');wa.forEach(a=>{const oldHref=a.href;a.href=a.href.replace(/wa\.me\/[0-9]+/,'wa.me/'+d.whatsapp);});}if(d.email){const em=document.querySelector('.social-links a[aria-label="Email"]');if(em)em.href='mailto:'+d.email;}if(d.heroImg&&d.heroImg.startsWith('http')){const ho=document.querySelector('.hero-overlay');if(ho){ho.style.backgroundImage='url('+d.heroImg+')';ho.style.backgroundSize='cover';ho.style.backgroundPosition='center';ho.style.opacity='0.35';}}else{const ho=document.querySelector('.hero-overlay');if(ho)ho.style.opacity='0.35';}if(d.ctaImg&&d.ctaImg.startsWith('http')){const cta=document.querySelector('.cta-background');if(cta){const st=document.createElement('style');st.textContent='.cta-background::before{background-image:url('+d.ctaImg+')!important}';document.head.appendChild(st);}}if(d.logoIcon&&d.logoIcon.startsWith('http')){const li=document.querySelector('.logo-img');if(li)li.src=d.logoIcon;}if(d.logoText&&d.logoText.startsWith('http')){const lt=document.querySelector('.brand-text-img');if(lt)lt.src=d.logoText;}if(d.logoFooter&&d.logoFooter.startsWith('http')){const lf=document.querySelector('.footer-brand img');if(lf)lf.src=d.logoFooter;}}catch(e){console.log('Site content not loaded:',e);}}
loadSiteContent();

// === REVIEWS ===
let allReviewsIndex=[];let rvFilter='all';let rvPage=0;
async function loadReviews(){
    const grid=document.getElementById('reviewsGrid');if(!grid)return;
    try{
        const snap=await db.collection('resenas').orderBy('fecha','desc').limit(50).get();
        allReviewsIndex=snap.docs.filter(d=>{const r=d.data();return r.visible===true&&r.usado===true;}).map(d=>{const r=d.data();return{...r,fecha:r.fecha&&r.fecha.toDate?r.fecha.toDate():new Date()};});
        const filtersEl=document.getElementById('reviewsFilters');
        if(filtersEl)filtersEl.style.display=allReviewsIndex.length>0?'flex':'none';
        rvPage=0;renderReviewsIndex();
    }catch(e){console.error('Reviews error:',e);grid.innerHTML='';}
}
function filterReviews(f){
    rvFilter=f;rvPage=0;
    document.querySelectorAll('.rv-filter-btn').forEach(b=>b.classList.remove('active'));
    event.target.classList.add('active');
    renderReviewsIndex();
}
window.filterReviews=filterReviews;
function rvGoPage(p){rvPage=p;renderReviewsIndex();document.getElementById('resenas').scrollIntoView({behavior:'smooth'});}
window.rvGoPage=rvGoPage;
function renderReviewsIndex(){
    const grid=document.getElementById('reviewsGrid');if(!grid)return;
    let items=allReviewsIndex;
    if(rvFilter==='positive')items=items.filter(r=>(r.estrellas||0)>=3);
    else if(rvFilter==='negative')items=items.filter(r=>(r.estrellas||0)<=2);
    else if(typeof rvFilter==='number')items=items.filter(r=>(r.estrellas||0)===rvFilter);
    const isMobile=window.innerWidth<=768;
    const perPage=isMobile?4:10;
    const pages=Math.ceil(items.length/perPage)||1;
    if(rvPage>=pages)rvPage=pages-1;
    const shown=items.slice(rvPage*perPage,(rvPage+1)*perPage);
    if(!shown.length){grid.innerHTML='<div style="text-align:center;padding:2rem;color:#999;grid-column:1/-1"><p>'+(rvFilter==='all'?'Aun no hay opiniones.':'No hay opiniones con este filtro.')+'</p></div>';document.getElementById('reviewsPager').innerHTML='';return;}
    grid.innerHTML=shown.map(r=>{
        const stars='&#9733;'.repeat(r.estrellas||0)+'&#9734;'.repeat(5-(r.estrellas||0));
        const fecha=r.fecha.toLocaleDateString('es-AR');
        const hora=r.fecha.toLocaleTimeString('es-AR',{hour:'2-digit',minute:'2-digit'});
        return '<div class="review-card"><div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:0.3rem"><div class="review-stars">'+stars+'</div><span class="review-date">'+fecha+' '+hora+'</span></div><div class="review-text">"'+esc(r.comentario||'')+'"</div><div class="review-author">'+esc(r.nombre||'')+'</div></div>';
    }).join('');
    const pg=document.getElementById('reviewsPager');
    if(pages>1){pg.innerHTML='<button onclick="rvGoPage('+(rvPage-1)+')" style="padding:0.4rem 1rem;border:1px solid #ccc;border-radius:8px;background:white;cursor:pointer"'+(rvPage===0?' disabled':'')+'>Ant</button><span style="padding:0.4rem 0.5rem;font-size:0.85rem;color:#666">'+(rvPage+1)+'/'+pages+'</span><button onclick="rvGoPage('+(rvPage+1)+')" style="padding:0.4rem 1rem;border:1px solid #ccc;border-radius:8px;background:white;cursor:pointer"'+(rvPage>=pages-1?' disabled':'')+'>Sig</button>';}else{pg.innerHTML='';}
}
loadReviews();

