/* Google Analytics 4 de la tienda, cargado sin frenar la pagina: recien despues del evento
   load y cuando el navegador esta libre. Solo en el dominio real (ni en el banco local ni en
   las previews de Vercel). Sin ID no hace nada: el ID sale de la propiedad GA4 del dueno.
   La CSP de vercel.json ya permite https: en scripts y conexiones, no hay que tocarla. */
(function () {
    var ID = 'G-X7BBER2RD3'; /* propiedad "YERCO Web" (cuenta yerco-bb620) */
    if (!ID || !/(^|\.)yerco\.ar$/.test(location.hostname)) return;
    function cargar() {
        var s = document.createElement('script');
        s.async = true;
        s.src = 'https://www.googletagmanager.com/gtag/js?id=' + ID;
        document.head.appendChild(s);
        window.dataLayer = window.dataLayer || [];
        window.gtag = function () { window.dataLayer.push(arguments); };
        window.gtag('js', new Date());
        window.gtag('config', ID);
    }
    function luego() { if ('requestIdleCallback' in window) requestIdleCallback(cargar, { timeout: 3000 }); else setTimeout(cargar, 1500); }
    if (document.readyState === 'complete') luego(); else window.addEventListener('load', luego);
})();
