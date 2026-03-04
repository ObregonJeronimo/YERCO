/**
 * ============================================
 * YERCO DIETÉTICA - CONFIGURACIÓN FIREBASE
 * ============================================
 * 
 * INSTRUCCIONES: Reemplazá los valores de abajo
 * con los de tu proyecto de Firebase.
 */

const firebaseConfig = {
    apiKey: "AIzaSyCYTYtrsLipyXeWbOUR7sUm3NPLA0mHvgs",
    authDomain: "yerco-bb620.firebaseapp.com",
    projectId: "yerco-bb620",
    storageBucket: "yerco-bb620.firebasestorage.app",
    messagingSenderId: "1035002416128",
    appId: "1:1035002416128:web:28ca04eb30b4dce8271ce5"
};

// Inicializar Firebase
firebase.initializeApp(firebaseConfig);

// Referencia a Firestore
const db = firebase.firestore();
