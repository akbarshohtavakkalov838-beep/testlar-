// js/common.js
import { db } from "./firebase-config.js";
import {
  doc, getDoc, setDoc, updateDoc, deleteDoc,
  collection, getDocs, addDoc, query, where, orderBy,
  increment, serverTimestamp
} from "https://www.gstatic.com/firebasejs/10.12.2/firebase-firestore.js";

export {
  db, doc, getDoc, setDoc, updateDoc, deleteDoc,
  collection, getDocs, addDoc, query, where, orderBy,
  increment, serverTimestamp
};

/* ============ STUDENT AUTH ============ */
// NOTE (security caveat): passwords are stored and checked in plain text
// in Firestore. That's fine for a small closed group of 15 students that
// Shox manages by hand, but it is NOT safe for a public sign-up product -
// see README for a stronger alternative if this ever grows.

export async function loginStudent(username, password) {
  username = (username || "").trim();
  if (!username || !password) return { ok: false, error: "Login va parolni kiriting" };
  const ref = doc(db, "students", username);
  const snap = await getDoc(ref);
  if (!snap.exists()) return { ok: false, error: "Bunday foydalanuvchi topilmadi" };
  const data = snap.data();
  if (data.password !== password) return { ok: false, error: "Parol noto'g'ri" };
  localStorage.setItem("mb_student", username);
  return { ok: true, data };
}

export function getCurrentStudentId() {
  return localStorage.getItem("mb_student");
}

export function logoutStudent() {
  localStorage.removeItem("mb_student");
  window.location.href = "index.html";
}

export function requireStudent() {
  const id = getCurrentStudentId();
  if (!id) { window.location.href = "index.html"; return null; }
  return id;
}

/* ============ ADMIN AUTH ============ */
// Admin login/password live in Firestore at settings/admin so Shox can
// change them without touching code. First run: see README for how to
// create that document.

export async function loginAdmin(username, password) {
  username = (username || "").trim();
  const ref = doc(db, "settings", "admin");
  const snap = await getDoc(ref);
  if (!snap.exists()) return { ok: false, error: "Admin sozlamalari topilmadi (README'ni ko'ring)" };
  const data = snap.data();
  if (data.username !== username || data.password !== password) {
    return { ok: false, error: "Login yoki parol noto'g'ri" };
  }
  sessionStorage.setItem("mb_admin", "1");
  return { ok: true };
}

export function isAdmin() {
  return sessionStorage.getItem("mb_admin") === "1";
}

export function requireAdmin() {
  if (!isAdmin()) { window.location.href = "admin.html"; return false; }
  return true;
}

export function logoutAdmin() {
  sessionStorage.removeItem("mb_admin");
  window.location.href = "admin.html";
}

/* ============ SCORING ============ */
// Default rule matches Shox's example: 30 savoldan 28-29 to'g'ri = 10 ball,
// 26-27 to'g'ri = 5 ball. Expressed as % thresholds so it scales to tests
// of any length. Editable from the admin panel (stored at settings/scoring).

export const DEFAULT_THRESHOLDS = [
  { minPercent: 0.9333, points: 10 },
  { minPercent: 0.8666, points: 5 }
];

export async function getScoringThresholds() {
  const ref = doc(db, "settings", "scoring");
  const snap = await getDoc(ref);
  if (snap.exists() && Array.isArray(snap.data().thresholds) && snap.data().thresholds.length) {
    return snap.data().thresholds.slice().sort((a, b) => b.minPercent - a.minPercent);
  }
  return DEFAULT_THRESHOLDS;
}

export function calcPoints(correct, total, thresholds) {
  if (!total) return 0;
  const pct = correct / total;
  for (const t of thresholds) {
    if (pct >= t.minPercent) return t.points;
  }
  return 0;
}

/* ============ MISC UI ============ */
export function showToast(msg, ms = 2600) {
  let el = document.getElementById("mb-toast");
  if (!el) {
    el = document.createElement("div");
    el.id = "mb-toast";
    el.className = "toast";
    document.body.appendChild(el);
  }
  el.textContent = msg;
  el.classList.add("show");
  clearTimeout(el._t);
  el._t = setTimeout(() => el.classList.remove("show"), ms);
}

export function escapeHtml(str) {
  return String(str).replace(/[&<>"']/g, (c) => ({
    "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;"
  }[c]));
}
