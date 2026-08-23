/* =============================================================================
   DATOS DEL NEGOCIO  —  YERCO
   =============================================================================
   Fuente unica de los datos del negocio para el PANEL DE ADMIN.

   Portado desde brotesdietetica, pero recortado a proposito. Alla este archivo
   tambien hidrataba la tienda (hidratarDOM / aplicarContenidoDelPanel); aca no,
   porque YERCO ya resuelve eso con loadSiteContent() en app.js, que lee
   config/siteContent de Firestore. Meter las dos cosas seria pisar el contenido
   que el Editor Web guarda desde el panel.

   Entonces: lo de abajo son los valores que consume el ADMIN. Lo que se ve en la
   tienda se sigue editando desde /admin -> Editor Web, sin tocar codigo.
   ============================================================================= */

const NEGOCIO = {

  /* ---- Identidad ---- */
  nombre: 'YERCO',
  nombreCorto: 'YERCO',

  /* ---- Contacto ----
     Ojo: el numero que usa la TIENDA sale de config/siteContent (campo whatsapp).
     Este es el mismo valor, pero como respaldo para lo que imprime el admin. */
  whatsapp: '5493515314675',
  telefonoDisplay: '+54 9 351 531-4675',
  telefonoLink: '+5493515314675',
  email: 'yerco.cba@gmail.com',
  instagram: 'yerco.diet',
  instagramUrl: 'https://instagram.com/yerco.diet',

  /* ---- Sitio ---- */
  sitioUrl: 'https://www.yerco.ar',

  /* ---- Proyecto Firebase ---- */
  _PROYECTO: 'yerco-bb620',

  /* ---- Duenio ----
     Coincide con la salida de emergencia de firestore.rules: si /admins queda
     vacio o alguien se saca a si mismo, este mail sigue entrando. */
  mailDuenio: 'jeroobregon03@gmail.com',

  /* ---- Quien desarrolla el sitio ----
     El link del footer lleva class="wa-dev" A PROPOSITO: app.js reescribe todos
     los links de wa.me con el numero del negocio EXCEPTO los .wa-dev. Si le
     sacas esa clase, el contacto del desarrollador pasa a apuntar al local. */
  dev: {
    nombre: 'Deft Software Solutions',
    whatsapp: '5493512067970',
    telefonoDisplay: '+54 9 351 206-7970'
  }
};

/* ---- Formato de los numeros de pedido y de venta ----
   Son los formatos que YERCO ya venia usando; se centralizan aca para que el
   ticket, el listado y el PDF no se contradigan. */

/** Pedido de la tienda web: 5 digitos. */
NEGOCIO.nroPedido = function (n) {
  return '#' + String(Number(n) || 0).padStart(5, '0');
};

/** Venta del mostrador: 6 digitos. */
NEGOCIO.nroVenta = function (n) {
  return '#' + String(Number(n) || 0).padStart(6, '0');
};

/* Link de WhatsApp del negocio, con texto opcional. */
NEGOCIO.waLink = function (texto) {
  return 'https://wa.me/' + NEGOCIO.whatsapp +
         (texto ? '?text=' + encodeURIComponent(texto) : '');
};

/* Link de WhatsApp del desarrollador. */
NEGOCIO.waDevLink = function (texto) {
  return 'https://wa.me/' + NEGOCIO.dev.whatsapp +
         (texto ? '?text=' + encodeURIComponent(texto) : '');
};

if (typeof window !== 'undefined') window.NEGOCIO = NEGOCIO;
