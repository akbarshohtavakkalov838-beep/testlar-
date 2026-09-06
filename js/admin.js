import {
  db, doc, getDoc, setDoc, updateDoc, deleteDoc,
  collection, getDocs, addDoc, serverTimestamp
} from "./common.js";
import {
  loginAdmin, isAdmin, logoutAdmin, showToast, escapeHtml, DEFAULT_THRESHOLDS
} from "./common.js";

let firstTimeSetup = false;

boot();

async function boot() {
  if (isAdmin()) {
    showPanel();
    return;
  }
  const adminDoc = await getDoc(doc(db, "settings", "admin"));
  firstTimeSetup = !adminDoc.exists();
  if (firstTimeSetup) {
    document.getElementById("loginTitle").textContent = "Birinchi marta sozlash";
    document.getElementById("loginSub").textContent = "Admin panel uchun login va parol yarating.";
    document.getElementById("passConfirmWrap").style.display = "";
    document.getElementById("loginBtn").textContent = "Yaratish va kirish";
  }
}

document.getElementById("loginForm").addEventListener("submit", async (e) => {
  e.preventDefault();
  const err = document.getElementById("loginErr");
  err.classList.remove("show");
  const username = document.getElementById("aUser").value.trim();
  const password = document.getElementById("aPass").value;

  if (firstTimeSetup) {
    const p2 = document.getElementById("aPass2").value;
    if (!username || !password) { err.textContent = "Login va parolni kiriting"; err.classList.add("show"); return; }
    if (password !== p2) { err.textContent = "Parollar mos emas"; err.classList.add("show"); return; }
    await setDoc(doc(db, "settings", "admin"), { username, password });
    sessionStorage.setItem("mb_admin", "1");
    showPanel();
    return;
  }

  const res = await loginAdmin(username, password);
  if (res.ok) {
    showPanel();
  } else {
    err.textContent = res.error;
    err.classList.add("show");
  }
});

document.getElementById("logoutBtn").addEventListener("click", logoutAdmin);

function showPanel() {
  document.getElementById("loginShell").style.display = "none";
  document.getElementById("panel").style.display = "";
  initTabs();
  loadStudents();
  loadLevels();
  loadTests();
  loadScoring();
}

/* ---------------- Tabs ---------------- */
function initTabs() {
  document.querySelectorAll(".tab").forEach(tab => {
    tab.addEventListener("click", () => {
      document.querySelectorAll(".tab").forEach(t => t.classList.remove("active"));
      tab.classList.add("active");
      ["students", "levels", "tests", "scoring"].forEach(name => {
        document.getElementById("tab-" + name).style.display = (name === tab.dataset.tab) ? "" : "none";
      });
    });
  });
}

/* ---------------- Students ---------------- */
async function loadStudents() {
  const snap = await getDocs(collection(db, "students"));
  const rows = snap.docs.map(d => ({ id: d.id, ...d.data() }));
  const tbody = document.querySelector("#studentsTable tbody");
  tbody.innerHTML = rows.length ? rows.map(s => `
    <tr>
      <td>${escapeHtml(s.id)}</td>
      <td>${escapeHtml(s.name || "")}</td>
      <td>${escapeHtml(s.level || "—")}</td>
      <td>${s.totalPoints || 0}</td>
      <td><button class="btn ghost small" data-del-student="${s.id}">O'chirish</button></td>
    </tr>`).join("") : `<tr><td colspan="5" class="empty">O'quvchilar yo'q</td></tr>`;

  tbody.querySelectorAll("[data-del-student]").forEach(btn => {
    btn.addEventListener("click", async () => {
      if (!confirm("O'quvchini o'chirishni tasdiqlaysizmi?")) return;
      await deleteDoc(doc(db, "students", btn.dataset.delStudent));
      showToast("O'quvchi o'chirildi");
      loadStudents();
    });
  });
}

document.getElementById("studentForm").addEventListener("submit", async (e) => {
  e.preventDefault();
  const username = document.getElementById("sUsername").value.trim();
  const name = document.getElementById("sName").value.trim();
  const password = document.getElementById("sPassword").value;
  if (!username || !name || !password) return;

  const existing = await getDoc(doc(db, "students", username));
  if (existing.exists()) { showToast("Bu login band"); return; }

  await setDoc(doc(db, "students", username), {
    name, password, level: null, totalPoints: 0, createdAt: serverTimestamp()
  });
  showToast("O'quvchi qo'shildi");
  e.target.reset();
  loadStudents();
});

/* ---------------- Levels ---------------- */
let levelsCache = [];

async function loadLevels() {
  const snap = await getDocs(collection(db, "levels"));
  levelsCache = snap.docs.map(d => ({ id: d.id, ...d.data() })).sort((a, b) => (a.order || 0) - (b.order || 0));

  const tbody = document.querySelector("#levelsTable tbody");
  tbody.innerHTML = levelsCache.length ? levelsCache.map(l => `
    <tr>
      <td>${escapeHtml(l.id)}</td>
      <td>${escapeHtml(l.name)}</td>
      <td>${l.order ?? ""}</td>
      <td><button class="btn ghost small" data-del-level="${l.id}">O'chirish</button></td>
    </tr>`).join("") : `<tr><td colspan="4" class="empty">Bo'limlar yo'q</td></tr>`;

  tbody.querySelectorAll("[data-del-level]").forEach(btn => {
    btn.addEventListener("click", async () => {
      if (!confirm("Bo'limni o'chirishni tasdiqlaysizmi?")) return;
      await deleteDoc(doc(db, "levels", btn.dataset.delLevel));
      showToast("Bo'lim o'chirildi");
      loadLevels();
    });
  });

  const sel = document.getElementById("tLevel");
  sel.innerHTML = levelsCache.map(l => `<option value="${l.id}">${escapeHtml(l.name)}</option>`).join("");
}

document.getElementById("levelForm").addEventListener("submit", async (e) => {
  e.preventDefault();
  const slug = document.getElementById("lSlug").value.trim().toLowerCase().replace(/\s+/g, "-");
  const name = document.getElementById("lName").value.trim();
  const order = Number(document.getElementById("lOrder").value) || 0;
  if (!slug || !name) return;

  await setDoc(doc(db, "levels", slug), { name, order });
  showToast("Bo'lim qo'shildi");
  e.target.reset();
  loadLevels();
});

/* ---------------- Tests ---------------- */
async function loadTests() {
  const snap = await getDocs(collection(db, "tests"));
  const rows = snap.docs.map(d => ({ id: d.id, ...d.data() }));
  const tbody = document.querySelector("#testsTable tbody");
  tbody.innerHTML = rows.length ? rows.map(t => `
    <tr>
      <td>${escapeHtml(t.title)}</td>
      <td>${escapeHtml(t.level)}</td>
      <td>${t.totalQuestions}</td>
      <td><button class="btn ghost small" data-del-test="${t.id}">O'chirish</button></td>
    </tr>`).join("") : `<tr><td colspan="4" class="empty">Testlar yo'q</td></tr>`;

  tbody.querySelectorAll("[data-del-test]").forEach(btn => {
    btn.addEventListener("click", async () => {
      if (!confirm("Testni o'chirishni tasdiqlaysizmi?")) return;
      await deleteDoc(doc(db, "tests", btn.dataset.delTest));
      showToast("Test o'chirildi");
      loadTests();
    });
  });
}

document.getElementById("testForm").addEventListener("submit", async (e) => {
  e.preventDefault();
  const title = document.getElementById("tTitle").value.trim();
  const level = document.getElementById("tLevel").value;
  const total = Number(document.getElementById("tTotal").value);
  const keyRaw = document.getElementById("tKey").value.trim();
  const html = document.getElementById("tHtml").value;

  const answerKey = keyRaw.split(",").map(s => s.trim()).filter(Boolean);
  if (!level) { showToast("Avval bo'lim qo'shing"); return; }
  if (answerKey.length !== total) {
    showToast(`Kalitda ${answerKey.length} ta javob bor, lekin savollar soni ${total}`);
    return;
  }

  await addDoc(collection(db, "tests"), {
    title, level, totalQuestions: total, answerKey, html, createdAt: serverTimestamp()
  });
  showToast("Test qo'shildi");
  e.target.reset();
  loadTests();
});

/* ---------------- Scoring ---------------- */
async function loadScoring() {
  const snap = await getDoc(doc(db, "settings", "scoring"));
  const thresholds = (snap.exists() && snap.data().thresholds?.length)
    ? snap.data().thresholds
    : DEFAULT_THRESHOLDS;
  renderThresholdRows(thresholds);
}

function renderThresholdRows(thresholds) {
  const wrap = document.getElementById("thresholdRows");
  wrap.innerHTML = "";
  thresholds.forEach(t => addThresholdRow(Math.round(t.minPercent * 10000) / 100, t.points));
}

function addThresholdRow(percent = 90, points = 5) {
  const wrap = document.getElementById("thresholdRows");
  const row = document.createElement("div");
  row.style.cssText = "display:flex;gap:10px;align-items:center;margin-bottom:10px;";
  row.innerHTML = `
    <input type="number" step="0.1" class="th-percent" value="${percent}" style="flex:1;padding:10px;border-radius:8px;border:1.5px solid var(--line);">
    <span style="color:var(--muted);font-size:13px;">% dan yuqori bo'lsa</span>
    <input type="number" class="th-points" value="${points}" style="width:90px;padding:10px;border-radius:8px;border:1.5px solid var(--line);">
    <span style="color:var(--muted);font-size:13px;">ball</span>
    <button type="button" class="btn ghost small" data-remove-row>✕</button>
  `;
  row.querySelector("[data-remove-row]").addEventListener("click", () => row.remove());
  wrap.appendChild(row);
}

document.getElementById("addThresholdBtn").addEventListener("click", () => addThresholdRow());

document.getElementById("saveScoringBtn").addEventListener("click", async () => {
  const rows = document.querySelectorAll("#thresholdRows > div");
  const thresholds = Array.from(rows).map(r => ({
    minPercent: Number(r.querySelector(".th-percent").value) / 100,
    points: Number(r.querySelector(".th-points").value)
  })).sort((a, b) => b.minPercent - a.minPercent);

  await setDoc(doc(db, "settings", "scoring"), { thresholds });
  showToast("Ball qoidasi saqlandi");
});
