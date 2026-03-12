/**
 * YERCO DIETÉTICA - SCRIPT PRINCIPAL
 * Firebase Firestore + Filtros jerárquicos + Búsqueda + Orden + Paginación
 */
const WHATSAPP_NUMBER = '5493515314675';
const PRODUCTS_PER_PAGE = 10;
let productos = [];
let carrito = [];
let categoriaActual = 'Todos';
let subcategoriaActual = null;
let ordenAscendente = true;
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
    for (let i = 0; i < 20; i++) { const p = document.createElement('div'); p.className='particle'; p.style.left=Math.random()*100+'%'; p.style.top=Math.random()*100+'%'; p.style.animationDelay=Math.random()*15+'s'; p.style.animationDuration=(15+Math.random()*10)+'s'; p.style.width=(5+Math.random()*15)+'px'; p.style.height=p.style.width; c.appendChild(p); }
}

function initContactForm() {
    const form = document.getElementById('contactForm'); if (!form) return;
    form.addEventListener('submit', (e) => { e.preventDefault(); const n=document.getElementById('nombre').value,em=document.getElementById('email').value,m=document.getElementById('mensaje').value; window.open('https://wa.me/'+WHATSAPP_NUMBER+'?text='+encodeURIComponent('¡Hola! Soy '+n+'.\nEmail: '+em+'\nMensaje: '+m),'_blank'); form.reset(); if(document.getElementById('chatFloatBox'))document.getElementById('chatFloatBox').classList.remove('show'); if(document.getElementById('chatFloatBtn'))document.getElementById('chatFloatBtn').classList.remove('hide'); });
}

async function loadProductsFromFirebase() {
    const loading = document.getElementById('productsLoading'); if (loading) loading.classList.add('show');
    try {
        const snap = await db.collection('productos').get();
        productos = snap.docs.map(d => { const r=d.data(); return { id:d.id, nombre:r.nombre||'', precio:r.precio||0, stock:r.stock||0, categoria:r.categoria||'', subcategoria:r.subcategoria||null, imagen:r.imagen||null, descripcion:r.descripcion||r.nombre||'' }; });
        renderCategoryFilters(getCategoriasConSub(productos)); aplicarFiltros();
    } catch(e) { console.error(e); showToast('Error al cargar productos.','error'); }
    finally { if (loading) loading.classList.remove('show'); }
}

function getCategoriasConSub(prods) {
    const m = {}; prods.forEach(p => { if(!p.categoria)return; if(!m[p.categoria])m[p.categoria]=new Set(); if(p.subcategoria)m[p.categoria].add(p.subcategoria); }); return m;
}

function aplicarFiltros() {
    let r = [...productos];
    if (categoriaActual !== 'Todos') r = r.filter(p => p.categoria === categoriaActual);
    if (subcategoriaActual) r = r.filter(p => p.subcategoria === subcategoriaActual);
    if (busquedaTexto) { const q=busquedaTexto.toLowerCase(); r=r.filter(p=>(p.nombre||'').toLowerCase().includes(q)||(p.categoria||'').toLowerCase().includes(q)||(p.subcategoria||'').toLowerCase().includes(q)||(p.descripcion||'').toLowerCase().includes(q)); }
    r.sort((a,b) => ordenAscendente ? a.precio-b.precio : b.precio-a.precio);
    renderProductsPaginated(r); updateSortButtonUI();
}

function filterByCategory(cat) { categoriaActual=cat; subcategoriaActual=null; paginaActual=1; aplicarFiltros(); }
function filterBySubCategory(cat,sub) { categoriaActual=cat; subcategoriaActual=sub; paginaActual=1; aplicarFiltros(); }
function onSearchInput(v) { busquedaTexto=v; paginaActual=1; aplicarFiltros(); }
function toggleSortOrder() { ordenAscendente=!ordenAscendente; paginaActual=1; aplicarFiltros(); }
function updateSortButtonUI() { const b=document.getElementById('sortBtn'); if(!b)return; b.innerHTML=ordenAscendente?'<i class="bi bi-sort-numeric-up"></i> Menor precio':'<i class="bi bi-sort-numeric-down-alt"></i> Mayor precio'; }

function renderCategoryFilters(mapa) {
    const container = document.getElementById('categoryFilters'); if (!container) return;
    container.innerHTML = '';
    const todosBtn = document.createElement('button');
    todosBtn.className = 'filter-btn active'; todosBtn.textContent = 'Todos';
    todosBtn.addEventListener('click', () => { setActiveFilter(todosBtn); hideAllSubFilters(); filterByCategory('Todos'); });
    container.appendChild(todosBtn);
    Object.keys(mapa).sort().forEach(cat => {
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
        const img=p.imagen||'https://via.placeholder.com/400x300?text=Sin+imagen';
        const noStock = p.stock === 0;
        return '<article class="product-card" data-id="'+p.id+'">' +
            '<div class="product-image"><img src="'+img+'" alt="'+p.nombre+'" loading="lazy" onerror="this.src=\'https://via.placeholder.com/400x300?text=Sin+imagen\'">' +
            '<span class="product-category">'+p.categoria+(p.subcategoria?' - '+p.subcategoria:'')+'</span>' +
            (noStock?'<span class="product-stock out">Sin stock</span>':'') +
            '</div>' +
            '<div class="product-info">' +
            '<h3 class="product-name">'+p.nombre+'</h3>' +
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

function updateCartUI() {
    const body=document.getElementById('cartBody'),empty=document.getElementById('cartEmpty'),footer=document.getElementById('cartFooter'),count=document.getElementById('cartCount'),total=document.getElementById('cartTotal'),cta=document.getElementById('ctaCartCount'),ckBtn=document.getElementById('checkoutBtn');
    const ti=carrito.reduce((s,i)=>s+i.cantidad,0),tp=carrito.reduce((s,i)=>s+(i.precio*i.cantidad),0);
    if(count)count.textContent=ti;if(cta)cta.textContent=ti;if(total)total.textContent='$'+formatPrice(tp);
    if(carrito.length===0){if(empty)empty.style.display='block';if(footer)footer.style.display='none';body?.querySelectorAll('.cart-item').forEach(i=>i.remove());}
    else{if(empty)empty.style.display='none';if(footer)footer.style.display='block';renderCartItems();}
    if(ckBtn)ckBtn.disabled=carrito.length===0;
    updateShippingBar(tp);
}
function renderCartItems() {
    const body=document.getElementById('cartBody'),empty=document.getElementById('cartEmpty');if(!body)return;
    body.querySelectorAll('.cart-item').forEach(i=>i.remove());
    carrito.forEach(item=>{const p=productos.find(x=>x.id===item.id),ms=p?p.stock:item.cantidad;const el=document.createElement('div');el.className='cart-item';el.innerHTML='<img src="'+(item.imagen||'https://via.placeholder.com/70x70?text=?')+'" alt="'+item.nombre+'" class="cart-item-image"><div class="cart-item-info"><h4 class="cart-item-name">'+item.nombre+'</h4><span class="cart-item-price">$'+formatPrice(item.precio)+'</span><div class="cart-item-controls"><button class="qty-btn" onclick="updateCartItemQuantity(\''+item.id+'\',-1)"><i class="bi bi-dash"></i></button><span class="qty-value">'+item.cantidad+'</span><button class="qty-btn" onclick="updateCartItemQuantity(\''+item.id+'\',1)"'+(item.cantidad>=ms?' disabled':'')+'><i class="bi bi-plus"></i></button><button class="cart-item-remove" onclick="removeFromCart(\''+item.id+'\')"><i class="bi bi-trash"></i></button></div></div>';body.insertBefore(el,empty);});
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
    let msg='¡Hola! 🌿 Quiero realizar el siguiente pedido:\n\n📦 *DETALLE DEL PEDIDO*\n--------------------\n';let total=0;
    carrito.forEach((item,i)=>{const sub=item.precio*item.cantidad;total+=sub;msg+='🛒 '+(i+1)+'. '+item.nombre+'\n   Cantidad: '+item.cantidad+' x $'+formatPrice(item.precio)+' = $'+formatPrice(sub)+'\n\n';});
    msg+='--------------------\n💰 *TOTAL: $'+formatPrice(total)+'*\n';
    if(total>=100000){msg+='🚚 *ENVIO GRATIS* (compra mayor a $100.000)\n';}
    else{msg+='🚚 Envio: $2.000\n💰 *TOTAL CON ENVIO: $'+formatPrice(total+2000)+'*\n';}
    msg+='\n🙏 ¡Gracias!';
    window.open('https://wa.me/'+WHATSAPP_NUMBER+'?text='+encodeURIComponent(msg),'_blank');showToast('Redirigiendo a WhatsApp...','success');closeCart();
}

function showToast(message,type){type=type||'info';const c=document.getElementById('toastContainer');if(!c)return;const icons={success:'bi-check-circle-fill',error:'bi-exclamation-circle-fill',info:'bi-info-circle-fill'};const t=document.createElement('div');t.className='toast '+type;t.innerHTML='<i class="toast-icon bi '+(icons[type]||icons.info)+'"></i><span class="toast-message">'+message+'</span>';c.appendChild(t);setTimeout(()=>{t.classList.add('removing');setTimeout(()=>t.remove(),300);},3000);}

function initScrollAnimations(){const o=new IntersectionObserver(entries=>{entries.forEach(e=>{if(e.isIntersecting){e.target.classList.add('animate-in');o.unobserve(e.target);}});},{threshold:0.1,rootMargin:'0px 0px -50px 0px'});document.querySelectorAll('.service-card,.feature-card,.product-card').forEach(el=>{el.style.opacity='0';el.style.transform='translateY(30px)';el.style.transition='opacity 0.6s ease, transform 0.6s ease';o.observe(el);});const s=document.createElement('style');s.textContent='.animate-in{opacity:1!important;transform:translateY(0)!important;}';document.head.appendChild(s);}

window.filterByCategory=filterByCategory;window.filterBySubCategory=filterBySubCategory;window.updateProductQuantity=updateProductQuantity;window.addToCart=addToCart;window.updateCartItemQuantity=updateCartItemQuantity;window.removeFromCart=removeFromCart;window.onSearchInput=onSearchInput;window.toggleSortOrder=toggleSortOrder;window.goToPage=goToPage;
