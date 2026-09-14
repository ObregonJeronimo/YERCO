/**
 * YERCO DIETÉTICA - CONFIGURACIÓN FIREBASE
 */
const firebaseConfig = {
    apiKey: "AIzaSyCYTYtrsLipyXeWbOUR7sUm3NPLA0mHvgs",
    authDomain: (location.hostname === 'yerco.ar' || location.hostname === 'www.yerco.ar') ? location.hostname : "yerco-bb620.firebaseapp.com",
    projectId: "yerco-bb620",
    storageBucket: "yerco-bb620.firebasestorage.app",
    messagingSenderId: "1035002416128",
    appId: "1:1035002416128:web:28ca04eb30b4dce8271ce5"
};

firebase.initializeApp(firebaseConfig);
const db = firebase.firestore();

// App Check - proteccion contra abuso
let appCheckYerco = null;
if(typeof firebase.appCheck === 'function'){
    appCheckYerco = firebase.appCheck();
    appCheckYerco.activate('6Ldkj5ksAAAAAJASQVftQ9SDUba3-pGM5hkObmtl', true);
}

/* =============================================================================
   CUANDO APP CHECK SE CAE UN RATO, NO SE PIERDE LA ESCRITURA
   =============================================================================
   App Check esta APLICADO en Firestore. Si el navegador se queda sin un token
   valido -el reCAPTCHA no respondio, la PC estuvo suspendida, una extension lo
   bloqueo un momento-, Firestore rechaza el pedido con "Missing or insufficient
   permissions", EXACTAMENTE el mismo mensaje que da una cuenta sin permiso. Un
   admin de verdad ve eso y cree que le sacaron el acceso.

   Medido en produccion el 14/09: la misma cuenta admin escribio bien a las 14:01,
   fallo al conectar un producto como hijo, y a las 14:10 volvio a escribir bien.
   Las metricas de App Check marcan 22 pedidos rechazados por token invalido justo
   entre las 14:05 y las 14:15, y cero en las dos horas alrededor. Del 21/08 al
   14/09 hubo rechazos asi en 17 de 25 dias.

   Lo que se hace: ante un permission-denied se pide un token NUEVO a App Check
   (getToken(true)) y se reintenta UNA sola vez. Una cuenta que de verdad no tiene
   permiso vuelve a ser rechazada en el reintento, asi que las reglas siguen
   mandando: esto no abre nada, solo cubre el hueco del token.

   Un reintento es seguro: un pedido rechazado por las reglas no escribio nada.

   LA EXCEPCION ES EL LOTE (batch). Firestore marca el lote como usado apenas se
   llama a commit(), aunque falle, y un segundo commit() tira "A write batch can no
   longer be used". Ahi se renueva el token -para que el proximo intento ande- y se
   avisa con el mensaje claro, sin reintentar.
   ============================================================================= */
(function () {
    const fsNs = firebase.firestore;
    if (!fsNs || !appCheckYerco || typeof appCheckYerco.getToken !== 'function') return;

    const MARCA = '__reintentoAppCheck';
    const AVISO = 'No se pudo guardar: el navegador perdio la verificacion de seguridad. ' +
                  'Recarga la pagina (F5) y proba de nuevo. Si sigue pasando, avisa: ' +
                  'puede ser una extension o un bloqueador de anuncios.';

    function esDenegado(e) {
        return !!e && (e.code === 'permission-denied' ||
                       /insufficient permissions/i.test(String(e.message || '')));
    }
    function avisoClaro(e) {
        const err = new Error(AVISO);
        err.code = e && e.code;
        err.original = e;
        return err;
    }
    async function tokenNuevo() {
        try { await appCheckYerco.getToken(true); return true; }
        catch (e) { return false; }
    }

    function conReintento(proto, metodo) {
        if (!proto || typeof proto[metodo] !== 'function' || proto[metodo][MARCA]) return;
        const original = proto[metodo];
        const envuelto = function () {
            const self = this, args = arguments;
            return original.apply(self, args).catch(async function (e) {
                if (!esDenegado(e)) throw e;
                if (!(await tokenNuevo())) throw avisoClaro(e);
                try { return await original.apply(self, args); }
                catch (e2) { throw esDenegado(e2) ? avisoClaro(e2) : e2; }
            });
        };
        envuelto[MARCA] = true;
        proto[metodo] = envuelto;
    }

    function sinReintento(proto, metodo) {
        if (!proto || typeof proto[metodo] !== 'function' || proto[metodo][MARCA]) return;
        const original = proto[metodo];
        const envuelto = function () {
            return original.apply(this, arguments).catch(async function (e) {
                if (!esDenegado(e)) throw e;
                await tokenNuevo();
                throw avisoClaro(e);
            });
        };
        envuelto[MARCA] = true;
        proto[metodo] = envuelto;
    }

    const doc = fsNs.DocumentReference && fsNs.DocumentReference.prototype;
    ['set', 'update', 'delete', 'get'].forEach(m => conReintento(doc, m));
    conReintento(fsNs.CollectionReference && fsNs.CollectionReference.prototype, 'add');
    conReintento(fsNs.Query && fsNs.Query.prototype, 'get');
    sinReintento(fsNs.WriteBatch && fsNs.WriteBatch.prototype, 'commit');
})();
