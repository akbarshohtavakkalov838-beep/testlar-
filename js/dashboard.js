import {
  db, doc, getDoc, updateDoc, collection, getDocs, query, where, orderBy,
  increment, serverTimestamp, setDoc
} from "./common.js";
import {
  requireStudent, logoutStudent, getScoringThresholds, calcPoints,
  showToast, escapeHtml
} from "./common.js";

const studentId = requireStudent();
if (studentId) init();

let studentData = null;
let levelsCache = [];
let currentLevel = null;
let currentTest = null; // {id, title, level, totalQuestions, answerKey, html}
let thresholds = null;

const $ = (sel) => document.querySelector(sel);
const views = {
  levels: $("#view-levels"),
  tests: $("#view-tests"),
  runner: $("#view-runner"),
  result: $("#view-result"),
};
function showView(name) {
  Object.values(views).forEach(v => v.style.display = "none");
  views[name].style.display = "";
}

document.getElementById("logoutBtn").addEventListener("click", logoutStudent);
document.getElementById("changeLevelBtn").addEventListener("click", () => showView("levels"));
document.getElementById("backToListBtn").addEventListener("click", () => showView("tests"));
document.getElementById("resultBackBtn").addEventListener("click", () => renderTestList(currentLevel));

/* ============ MAIN TABS ============ */
const mainSections = ["overview", "tests", "homework", "attendance", "payment"];
document.querySelectorAll("[data-maintab]").forEach(tab => {
  tab.addEventListener("click", () => {
    document.querySelectorAll("[data-maintab]").forEach(t => t.classList.remove("active"));
    tab.classList.add("active");
    const target = tab.dataset.maintab;
    mainSections.forEach(name => {
      document.getElementById("maintab-" + name).style.display = (name === target) ? "" : "none";
    });
    if (target === "homework") renderHomeworkTab();
    if (target === "attendance") renderAttendanceTab();
    if (target === "payment") renderPaymentTab();
  });
});

async function init() {
  thresholds = await getScoringThresholds();

  const snap = await getDoc(doc(db, "students", studentId));
  if (!snap.exists()) { logoutStudent(); return; }
  studentData = snap.data();
  document.getElementById("studentName").textContent = studentData.name || studentId;
  document.getElementById("pointsVal").textContent = studentData.totalPoints || 0;

  const levelsSnap = await getDocs(collection(db, "levels"));
  levelsCache = levelsSnap.docs
    .map(d => ({ id: d.id, ...d.data() }))
    .sort((a, b) => (a.order || 0) - (b.order || 0));

  renderLevelGrid();

  if (studentData.level) {
    currentLevel = studentData.level;
    renderTestList(currentLevel);
  } else {
    showView("levels");
  }

  renderOverview();
}

/* ============ OVERVIEW TAB ============ */
async function renderOverview() {
  document.getElementById("ovName").textContent = studentData.name || studentId;
  document.getElementById("ovPoints").textContent = studentData.totalPoints || 0;

  // Attendance % over the last 30 days
  const attSnap = await getDocs(collection(db, "students", studentId, "attendance"));
  const records = attSnap.docs.map(d => d.data());
  const cutoff = new Date();
  cutoff.setDate(cutoff.getDate() - 30);
  const recent = records.filter(r => r.date && new Date(r.date) >= cutoff);
  if (recent.length) {
    const came = recent.filter(r => r.status === "keldi").length;
    document.getElementById("ovAttendance").textContent = Math.round((came / recent.length) * 100) + "%";
  } else {
    document.getElementById("ovAttendance").textContent = "—";
  }

  const payEl = document.getElementById("ovPayment");
  if (studentData.paymentStatus === "paid") {
    payEl.textContent = "To'langan ✓";
    payEl.style.color = "var(--green)";
  } else if (studentData.paymentStatus === "unpaid") {
    payEl.textContent = "To'lanmagan";
    payEl.style.color = "var(--red)";
  } else {
    payEl.textContent = "—";
    payEl.style.color = "var(--ink)";
  }

  // Latest 3 homework for the student's level
  const hwEl = document.getElementById("ovHomework");
  if (!studentData.level) {
    hwEl.innerHTML = `<div class="empty">Avval "Testlar" bo'limidan darajangizni tanlang.</div>`;
    return;
  }
  const hwSnap = await getDocs(query(collection(db, "homework"), where("level", "==", studentData.level)));
  const hw = hwSnap.docs.map(d => ({ id: d.id, ...d.data() }))
    .sort((a, b) => (b.createdAt?.seconds || 0) - (a.createdAt?.seconds || 0))
    .slice(0, 3);
  hwEl.innerHTML = hw.length
    ? hw.map(renderHomeworkCard).join("")
    : `<div class="empty">Hozircha uy vazifasi yo'q.</div>`;
}

function renderHomeworkCard(h) {
  return `
    <div class="test-row" style="align-items:flex-start;">
      <div>
        <div style="font-weight:700;">${escapeHtml(h.title)}</div>
        ${h.description ? `<div class="meta" style="margin-top:4px;white-space:pre-wrap;">${escapeHtml(h.description)}</div>` : ""}
        ${h.dueDate ? `<div class="meta" style="margin-top:4px;">Muddat: ${escapeHtml(h.dueDate)}</div>` : ""}
      </div>
    </div>`;
}

/* ============ HOMEWORK TAB ============ */
async function renderHomeworkTab() {
  const el = document.getElementById("homeworkList");
  if (!studentData.level) {
    el.innerHTML = `<div class="empty">Avval "Testlar" bo'limidan darajangizni tanlang.</div>`;
    return;
  }
  const hwSnap = await getDocs(query(collection(db, "homework"), where("level", "==", studentData.level)));
  const hw = hwSnap.docs.map(d => ({ id: d.id, ...d.data() }))
    .sort((a, b) => (b.createdAt?.seconds || 0) - (a.createdAt?.seconds || 0));
  el.innerHTML = hw.length
    ? hw.map(renderHomeworkCard).join("")
    : `<div class="empty">Hozircha uy vazifasi yo'q.</div>`;
}

/* ============ ATTENDANCE TAB ============ */
async function renderAttendanceTab() {
  const attSnap = await getDocs(collection(db, "students", studentId, "attendance"));
  const records = attSnap.docs.map(d => d.data()).sort((a, b) => (b.date || "").localeCompare(a.date || ""));
  const tbody = document.querySelector("#attendanceTable tbody");
  tbody.innerHTML = records.length
    ? records.map(r => `
        <tr>
          <td>${escapeHtml(r.date || "")}</td>
          <td><span class="badge ${r.status === 'keldi' ? 'done' : ''}" style="${r.status !== 'keldi' ? 'background:#FDECEC;color:var(--red);' : ''}">
            ${r.status === "keldi" ? "Keldi" : "Kelmadi"}
          </span></td>
        </tr>`).join("")
    : `<tr><td colspan="2" class="empty">Hali davomat belgilanmagan</td></tr>`;
}

/* ============ PAYMENT TAB ============ */
function renderPaymentTab() {
  const statusEl = document.getElementById("payStatus");
  if (studentData.paymentStatus === "paid") {
    statusEl.textContent = "To'langan ✓";
    statusEl.style.color = "var(--green)";
  } else if (studentData.paymentStatus === "unpaid") {
    statusEl.textContent = "To'lanmagan";
    statusEl.style.color = "var(--red)";
  } else {
    statusEl.textContent = "Kiritilmagan";
    statusEl.style.color = "var(--muted)";
  }
  document.getElementById("payDate").textContent = studentData.paymentDueDate || "—";
  document.getElementById("payNoteWrap").textContent = studentData.paymentNote || "";
}

/* ============ TESTS: level grid ============ */
function renderLevelGrid() {
  const grid = document.getElementById("levelGrid");
  if (!levelsCache.length) {
    grid.innerHTML = `<div class="empty">Hozircha bo'limlar qo'shilmagan. Admin bilan bog'laning.</div>`;
    return;
  }
  grid.innerHTML = levelsCache.map(lv => `
    <button class="level-card ${lv.id === currentLevel ? "active" : ""}" data-level="${lv.id}">
      ${escapeHtml(lv.name)}
    </button>
  `).join("");

  grid.querySelectorAll(".level-card").forEach(btn => {
    btn.addEventListener("click", async () => {
      const slug = btn.dataset.level;
      currentLevel = slug;
      if (studentData.level !== slug) {
        await updateDoc(doc(db, "students", studentId), { level: slug });
        studentData.level = slug;
      }
      renderTestList(slug);
    });
  });
}

async function renderTestList(levelSlug) {
  currentLevel = levelSlug;
  const levelInfo = levelsCache.find(l => l.id === levelSlug);
  document.getElementById("levelTitle").textContent = levelInfo ? levelInfo.name + " testlari" : "Testlar";

  const q = query(collection(db, "tests"), where("level", "==", levelSlug));
  const testsSnap = await getDocs(q);
  const tests = testsSnap.docs.map(d => ({ id: d.id, ...d.data() }));

  const resultsSnap = await getDocs(collection(db, "students", studentId, "results"));
  const doneMap = {};
  resultsSnap.docs.forEach(d => doneMap[d.id] = d.data());

  const listEl = document.getElementById("testList");
  if (!tests.length) {
    listEl.innerHTML = `<div class="empty">Bu bo'limda hali test yo'q.</div>`;
  } else {
    listEl.innerHTML = tests.map(t => {
      const done = doneMap[t.id];
      return `
        <div class="test-row">
          <div>
            <div style="font-weight:700;">${escapeHtml(t.title)}</div>
            <div class="meta">${t.totalQuestions} ta savol</div>
          </div>
          <div style="display:flex;align-items:center;gap:12px;">
            ${done
              ? `<span class="badge done">${done.correct}/${done.total} · +${done.points} ball</span>`
              : `<span class="badge todo">Boshlanmagan</span>`}
            <button class="btn small ${done ? "secondary" : ""}" data-test="${t.id}">
              ${done ? "Natijani ko'rish" : "Boshlash"}
            </button>
          </div>
        </div>`;
    }).join("");

    listEl.querySelectorAll("[data-test]").forEach(btn => {
      btn.addEventListener("click", () => {
        const test = tests.find(t => t.id === btn.dataset.test);
        const done = doneMap[test.id];
        if (done) {
          showResult(test.title, done.correct, done.total, done.points);
        } else {
          openTest(test);
        }
      });
    });
  }
  showView("tests");
}

function openTest(test) {
  currentTest = test;
  document.getElementById("runnerTitle").textContent = test.title;
  const frame = document.getElementById("testFrame");
  frame.srcdoc = test.html;
  showView("runner");
}

document.getElementById("finishTestBtn").addEventListener("click", async () => {
  if (!currentTest) return;
  const frame = document.getElementById("testFrame");
  let idoc;
  try {
    idoc = frame.contentDocument;
  } catch (e) {
    showToast("Test faylini o'qib bo'lmadi");
    return;
  }

  const total = currentTest.totalQuestions;
  const answerKey = currentTest.answerKey || [];
  let correct = 0;
  let answered = 0;

  for (let i = 1; i <= total; i++) {
    const checked = idoc.querySelector(`input[name="q${i}"]:checked`);
    if (checked) {
      answered++;
      const val = (checked.value || "").trim().toLowerCase();
      const key = (answerKey[i - 1] || "").trim().toLowerCase();
      if (val && key && val === key) correct++;
    }
  }

  if (answered < total) {
    const ok = confirm(`Siz ${total} tadan faqat ${answered} tasiga javob berdingiz. Shunday ham yakunlansinmi?`);
    if (!ok) return;
  }

  const points = calcPoints(correct, total, thresholds);

  await setDoc(doc(db, "students", studentId, "results", currentTest.id), {
    testTitle: currentTest.title,
    level: currentTest.level,
    correct, total, points,
    date: serverTimestamp()
  });
  await updateDoc(doc(db, "students", studentId), {
    totalPoints: increment(points)
  });

  studentData.totalPoints = (studentData.totalPoints || 0) + points;
  document.getElementById("pointsVal").textContent = studentData.totalPoints;

  showResult(currentTest.title, correct, total, points);
});

function showResult(title, correct, total, points) {
  document.getElementById("resultTestTitle").textContent = title;
  document.getElementById("resultScore").textContent = `${correct}/${total}`;
  document.getElementById("resultPoints").textContent = `+${points} ball`;
  showView("result");
}
