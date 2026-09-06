import {
  db, doc, getDoc, updateDoc, collection, getDocs, query, where,
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
}

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
