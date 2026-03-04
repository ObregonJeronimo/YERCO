/**
 * ============================================
 * YERCO DIETÉTICA - CONFIGURACIÓN FIREBASE
 * ============================================
 * 
 * INSTRUCCIONES: Reemplazá los valores de abajo
 * con los de tu proyecto de Firebase.
 */

const firebaseConfig = {
    apiKey: "TU_API_KEY",
    authDomain: "TU_PROYECTO.firebaseapp.com",
    projectId: "TU_PROJECT_ID",
    storageBucket: "TU_PROYECTO.firebasestorage.app",
    messagingSenderId: "TU_SENDER_ID",
    appId: "TU_APP_ID"
};

// Inicializar Firebase
firebase.initializeApp(firebaseConfig);

// Referencia a Firestore
const db = firebase.firestore();
