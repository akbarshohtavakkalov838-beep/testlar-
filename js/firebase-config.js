// js/firebase-config.js
// Firebase v10 modular SDK, loaded straight from Google's CDN (no npm/build step needed).
import { initializeApp } from "https://www.gstatic.com/firebasejs/10.12.2/firebase-app.js";
import { getFirestore } from "https://www.gstatic.com/firebasejs/10.12.2/firebase-firestore.js";

const firebaseConfig = {
  apiKey: "AIzaSyDvSeSdQ-_vR69kjb2mgjifLWqs6IerV9w",
  authDomain: "mockbaza-reyting.firebaseapp.com",
  databaseURL: "https://mockbaza-reyting-default-rtdb.firebaseio.com",
  projectId: "mockbaza-reyting",
  storageBucket: "mockbaza-reyting.firebasestorage.app",
  messagingSenderId: "1094359427655",
  appId: "1:1094359427655:web:4f41b019f85a50482a9f62",
  measurementId: "G-SJKT1SLG6X"
};

export const app = initializeApp(firebaseConfig);
export const db = getFirestore(app);
