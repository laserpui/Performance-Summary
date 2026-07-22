"use strict";

const MONTHS = [
  "มกราคม",
  "กุมภาพันธ์",
  "มีนาคม",
  "เมษายน",
  "พฤษภาคม",
  "มิถุนายน",
  "กรกฎาคม",
  "สิงหาคม",
  "กันยายน",
  "ตุลาคม",
  "พฤศจิกายน",
  "ธันวาคม",
];

const SHORT_MONTHS = [
  "ม.ค.",
  "ก.พ.",
  "มี.ค.",
  "เม.ย.",
  "พ.ค.",
  "มิ.ย.",
  "ก.ค.",
  "ส.ค.",
  "ก.ย.",
  "ต.ค.",
  "พ.ย.",
  "ธ.ค.",
];

const KPI_DEFS = [
  {
    id: "capability",
    title: "ความสามารถในการปฏิบัติงาน",
    detail: "ความเหมาะสมระหว่างความยากของงานและความสามารถของผู้ปฏิบัติ",
    weight: 5,
    icon: "briefcase-business",
  },
  {
    id: "quality",
    title: "คุณภาพของงาน",
    detail: "ความถูกต้อง ครบถ้วนสมบูรณ์ และประสิทธิภาพของผลงาน",
    weight: 4,
    icon: "badge-check",
  },
  {
    id: "responsibility",
    title: "ความรับผิดชอบต่อหน้าที่",
    detail: "ความรับผิดชอบต่องานที่ได้รับมอบหมายและการประสานงาน",
    weight: 3,
    icon: "handshake",
  },
  {
    id: "effort",
    title: "ความพยายามอุตสาหะ",
    detail: "การช่วยงานนอกเหนือหน้าที่ การเสียสละ และการอุทิศเวลา",
    weight: 3,
    icon: "rocket",
  },
  {
    id: "punctuality",
    title: "ความตรงต่อเวลา",
    detail: "การขาด การลา การมาสาย และความสม่ำเสมอในการทำงาน",
    weight: 3,
    icon: "clock-3",
  },
  {
    id: "discipline",
    title: "การเคารพกฎระเบียบบริษัท",
    detail: "การปฏิบัติตามคำสั่ง การแต่งกาย และบุคลิกภาพ",
    weight: 2,
    icon: "shield-check",
  },
];

const SEED = [
  ["pongsak", "พงษ์ศักดิ์ จักรพิมพ์", [[80,70,60,70,60,90],[60,70,60,80,60,90],[60,70,70,90,60,90],[100,90,60,100,60,90],[100,100,60,60,60,90],[60,70,60,60,60,90]]],
  ["aeklerd", "เอกเลิศ ตันติยมาศ", [[60,60,70,80,100,100],[60,60,60,90,100,100],[60,60,60,90,100,100],[60,70,60,60,100,100],[60,70,90,70,100,100],[70,70,60,90,100,100]]],
  ["somchai", "สมชาย มูลเงิน", [[60,60,60,80,90,80],[60,50,60,70,100,80],[60,60,60,70,60,80],[60,60,60,50,90,80],[60,60,60,80,100,80],[60,60,60,80,90,80]]],
  ["kansak", "กันต์ศักดิ์ ฉลาดเฉลียว", [[60,60,60,70,90,100],[60,70,60,80,100,100],[60,100,60,80,100,100],[60,60,60,60,100,100],[60,60,60,80,90,100],[60,70,60,60,100,100]]],
  ["kasidet", "กษิเดช อิทธิธนาบุญ", [[100,90,100,100,60,90],[60,100,100,100,60,90],[100,100,100,100,60,90],[70,60,100,70,70,90],[90,80,100,90,60,90],[60,60,80,80,60,90]]],
  ["prawit", "ประวิทย์ ฉลาดเฉลียว", [[60,60,60,60,60,80],[60,80,60,70,70,80],[60,70,60,100,60,80],[70,80,60,60,60,80],[60,80,60,100,100,80],[60,100,70,60,80,80]]],
  ["nattapong", "ณัฐพงษ์ กลิ่นจันทร์", [[60,70,60,100,90,100],[60,60,60,60,80,100],[60,60,60,80,80,100],[80,100,60,60,100,100],[70,80,60,70,90,100],[60,70,100,80,80,100]]],
  ["chatchai", "ชาติชาย น่าบัณฑิต", [[60,50,70,60,100,100],[60,60,60,70,100,100],[60,60,80,100,100,100],[60,60,90,60,100,100],[60,70,60,90,100,100],[60,60,100,100,100,100]]],
  ["thanaboon", "ธนบูรณ์ ศุภชาติสันติ", [[90,100,60,60,60,100],[60,70,60,80,70,90],[100,90,50,60,90,100],[100,90,60,60,100,100],[60,50,60,90,60,100],[100,100,60,80,80,100]]],
  ["aphilak", "อภิลักษณ์ หาไธสง", [[60,70,60,80,80,100],[60,50,60,80,100,100],[60,60,60,100,90,100],[60,60,60,90,80,100],[60,80,60,60,100,100],[60,60,60,70,90,100]]],
  ["phatsapong", "ภาสพงษ์ คำศรี", [[60,60,60,60,60,80],[60,60,60,60,60,80],[60,60,60,60,60,80],[60,60,60,60,60,80],[60,60,60,60,60,80],[60,60,60,60,60,80]]],
  ["jeerasak", "จีรศักดิ์ คำศรี", [[60,60,60,70,60,90],[60,60,60,80,80,90],[60,60,60,100,70,100],[60,60,60,60,60,100],[60,60,60,60,60,100],[60,60,60,100,60,100]]],
];

const PREVIOUS_YEAR_SCORES = {
  pongsak: 78.4090909090909,
  aeklerd: 69.94318181818181,
  somchai: 64.77272727272727,
  kansak: 71.36363636363636,
  kasidet: 85.9659090909091,
  prawit: 69.77272727272727,
  nattapong: 70.9659090909091,
  chatchai: 74.0909090909091,
  thanaboon: 73.80681818181819,
  aphilak: 73.81,
  phatsapong: null,
  jeerasak: null,
};

const LEGACY_STORAGE_KEY = "kpi-flow-2569-v1";
const DEFAULT_SCORE = 60;
const THAI_NAME_COLLATOR = new Intl.Collator("th", { sensitivity: "base", numeric: true });
const ROLE_LABELS = Object.freeze({ viewer: "ผู้ดูรายงาน", evaluator: "ผู้ประเมิน", admin: "ผู้ดูแลระบบ" });

function sortEmployeesByName(list) {
  return [...list].sort((a, b) => THAI_NAME_COLLATOR.compare(a.name, b.name));
}

const DEFAULT_EMPLOYEES = sortEmployeesByName(SEED.map(([id, name]) => ({ id, name })));

let legacyState = readLegacyState();
let state = createInitialState();
let employees = state.employees;
let selectedYear = Number(state.activeYear) || 2569;
let currentView = "dashboard";
let selectedMonth = latestDataMonth(selectedYear);
let selectedEmployee = employees[0]?.id || "";
let historyEmployee = "all";
let chartMode = "monthly";
let chartHitRegions = [];
let databaseStatus = "not-connected";
let databaseMessage = "ยังไม่ได้เข้าสู่ระบบ";
let currentUser = null;
let currentProfile = null;
let appInitialized = false;
let realtimeReloadTimer = null;
let databaseLoadPromise = null;

const els = {
  appShell: document.getElementById("appShell"),
  mobileNav: document.getElementById("mobileNav"),
  authGate: document.getElementById("authGate"),
  loginForm: document.getElementById("loginForm"),
  loginEmail: document.getElementById("loginEmail"),
  loginPassword: document.getElementById("loginPassword"),
  loginButton: document.getElementById("loginButton"),
  authMessage: document.getElementById("authMessage"),
  authConfigHelp: document.getElementById("authConfigHelp"),
  pageTitle: document.getElementById("pageTitle"),
  globalMonth: document.getElementById("globalMonth"),
  globalYear: document.getElementById("globalYear"),
  dashboard: document.getElementById("dashboardView"),
  entry: document.getElementById("entryView"),
  history: document.getElementById("historyView"),
  reports: document.getElementById("reportsView"),
  toast: document.getElementById("toastRegion"),
  notificationDot: document.getElementById("notificationDot"),
  databaseStatusDot: document.getElementById("databaseStatusDot"),
  databaseStatusLabel: document.getElementById("databaseStatusLabel"),
  accountName: document.getElementById("accountName"),
  accountRole: document.getElementById("accountRole"),
  logoutButton: document.getElementById("logoutButton"),
};

function recordKeyFor(year, employeeId, month) {
  return `${year}::${employeeId}::${month}`;
}

function createInitialState() {
  const records = {};
  SEED.forEach(([id, , monthlyScores]) => {
    monthlyScores.forEach((scores, month) => {
      records[recordKeyFor(2569, id, month)] = {
        employeeId: id,
        month,
        scores,
        note: "",
        source: "Excel: สรุปแบบประเมินปี 69.xlsx",
        updatedAt: "2026-07-02T07:05:32.000Z",
        version: 1,
      };
    });
  });
  return {
    schemaVersion: 4,
    activeYear: 2569,
    years: [2569],
    updatedAt: "2026-07-02T07:05:32.000Z",
    employees: DEFAULT_EMPLOYEES.map((person) => ({ ...person })),
    records,
  };
}

function migrateState(saved) {
  const savedEmployees = Array.isArray(saved?.employees)
    ? saved.employees
        .filter((person) => person && typeof person.id === "string" && typeof person.name === "string" && person.name.trim())
        .map((person) => ({ id: person.id, name: person.name.trim() }))
    : [];
  const baseYear = Number(saved?.activeYear || saved?.year) || 2569;
  const records = {};
  Object.entries(saved?.records || {}).forEach(([key, record]) => {
    if (!record || typeof record !== "object") return;
    const parts = key.split("::");
    const employeeId = record.employeeId || parts.at(-2) || parts[0];
    const month = Number.isInteger(Number(record.month)) ? Number(record.month) : Number(parts.at(-1));
    const year = parts.length === 3 && Number.isFinite(Number(parts[0])) ? Number(parts[0]) : baseYear;
    if (!employeeId || !Number.isInteger(month)) return;
    records[recordKeyFor(year, employeeId, month)] = {
      employeeId,
      month,
      scores: Array.isArray(record.scores) ? record.scores.map(Number) : [],
      note: String(record.note || ""),
      source: String(record.source || "Imported data"),
      updatedAt: String(record.updatedAt || ""),
      version: Number(record.version) || 1,
    };
  });
  const recordYears = Object.keys(records)
    .map((key) => Number(key.split("::")[0]))
    .filter(Number.isFinite);
  const years = [...new Set([...(Array.isArray(saved?.years) ? saved.years.map(Number) : []), baseYear, ...recordYears])]
    .filter(Number.isFinite)
    .sort((a, b) => a - b);
  return {
    schemaVersion: 4,
    activeYear: years.includes(baseYear) ? baseYear : years.at(-1) || 2569,
    years,
    updatedAt: String(saved?.updatedAt || ""),
    employees: sortEmployeesByName(savedEmployees),
    records,
  };
}

function readLegacyState() {
  try {
    const saved = JSON.parse(localStorage.getItem(LEGACY_STORAGE_KEY));
    if ([1, 2, 3, 4].includes(saved?.schemaVersion) && saved.records) return migrateState(saved);
  } catch (error) {
    console.warn("อ่านข้อมูลเดิมในเบราว์เซอร์ไม่สำเร็จ", error);
  }
  return null;
}

function purgeLegacyData() {
  localStorage.removeItem(LEGACY_STORAGE_KEY);
  legacyState = null;
}

function recordTimestamp(record) {
  return Date.parse(record?.updatedAt || "") || 0;
}

function mergeLegacyWithRemote(remoteState, browserState) {
  const remote = migrateState(remoteState || createInitialState());
  const browser = migrateState(browserState);
  const employeeMap = new Map(remote.employees.map((person) => [person.id, person]));
  browser.employees.forEach((person) => employeeMap.set(person.id, person));
  const records = { ...remote.records };
  Object.entries(browser.records).forEach(([key, record]) => {
    const remoteRecord = records[key];
    if (!remoteRecord || recordTimestamp(record) >= recordTimestamp(remoteRecord)) records[key] = record;
  });
  const years = [...new Set([...remote.years, ...browser.years].map(Number))]
    .filter(Number.isFinite)
    .sort((a, b) => a - b);
  return {
    schemaVersion: 4,
    activeYear: Math.max(Number(remote.activeYear) || 0, Number(browser.activeYear) || 0) || years.at(-1) || 2569,
    years,
    updatedAt: new Date().toISOString(),
    employees: sortEmployeesByName([...employeeMap.values()]),
    records,
  };
}

function legacyStateSummary() {
  if (!legacyState) return null;
  return {
    employees: legacyState.employees.length,
    records: Object.values(legacyState.records).filter((record) => validScores(record.scores)).length,
    years: legacyState.years.length,
  };
}

function isAdmin() {
  return currentProfile?.role === "admin";
}

function canEditScores() {
  return currentProfile?.role === "evaluator" || isAdmin();
}

function databaseStatusMeta() {
  const statuses = {
    "not-connected": { label: "ยังไม่เชื่อมต่อ", className: "status-offline" },
    syncing: { label: "กำลังซิงก์", className: "status-syncing" },
    connected: { label: "Firebase Firestore พร้อมใช้งาน", className: "status-connected" },
    error: { label: "เชื่อมต่อขัดข้อง", className: "status-error" },
  };
  return statuses[databaseStatus] || statuses["not-connected"];
}

function updateDatabaseStatusElement() {
  const meta = databaseStatusMeta();
  if (els.databaseStatusDot) els.databaseStatusDot.className = `status-dot ${meta.className}`;
  if (els.databaseStatusLabel) els.databaseStatusLabel.textContent = meta.label;
  const badge = document.getElementById("databaseSyncBadge");
  const message = document.getElementById("databaseSyncMessage");
  if (badge) {
    badge.className = `sync-badge ${meta.className}`;
    badge.innerHTML = `<span></span>${meta.label}`;
  }
  if (message) message.textContent = databaseMessage;
}

function setDatabaseStatus(status, message) {
  databaseStatus = status;
  databaseMessage = message;
  updateDatabaseStatusElement();
}

function refreshAfterRemoteState({ preserveSelection = false } = {}) {
  employees = sortEmployeesByName(state.employees || []);
  state.employees = employees;
  if (!preserveSelection || !state.years.includes(selectedYear)) {
    selectedYear = Number(state.activeYear) || state.years.at(-1) || 2569;
  }
  selectedEmployee = employees.some((person) => person.id === selectedEmployee)
    ? selectedEmployee
    : employees[0]?.id || "";
  if (historyEmployee !== "all" && !employees.some((person) => person.id === historyEmployee)) historyEmployee = "all";
  if (!preserveSelection) selectedMonth = latestDataMonth(selectedYear);
  selectedMonth = Math.max(0, Math.min(11, Number(selectedMonth) || 0));
  refreshDateControls();
  updateNotificationStatus();
  if (currentView === "dashboard") renderDashboard();
  if (currentView === "entry") renderEntry();
  if (currentView === "history") renderHistory();
  if (currentView === "reports") renderReports();
}

function applyRemoteState(remoteState, options = {}) {
  state = migrateState(remoteState);
  refreshAfterRemoteState(options);
}

async function loadDatabaseState({ preserveSelection = false, quiet = false } = {}) {
  if (databaseLoadPromise) return databaseLoadPromise;
  setDatabaseStatus("syncing", quiet ? "กำลังอัปเดตข้อมูลล่าสุด" : "กำลังโหลดข้อมูลจาก Firebase Firestore");
  databaseLoadPromise = window.KpiDatabase.loadState()
    .then(async (remoteState) => {
      if (!remoteState.employees.length) {
        if (!isAdmin()) {
          throw new Error("ฐานข้อมูลยังไม่มีข้อมูลตั้งต้น กรุณาให้ Admin เข้าสู่ระบบครั้งแรก");
        }
        setDatabaseStatus("syncing", "กำลังสร้างข้อมูลตั้งต้นใน Firebase Firestore");
        await window.KpiDatabase.resetDatabase(createInitialState());
        remoteState = await window.KpiDatabase.loadState();
      }
      applyRemoteState(remoteState, { preserveSelection });
      setDatabaseStatus("connected", `ซิงก์ล่าสุด ${new Intl.DateTimeFormat("th-TH", { hour: "2-digit", minute: "2-digit" }).format(new Date())} น.`);
      return remoteState;
    })
    .catch((error) => {
      setDatabaseStatus("error", error.message);
      if (!quiet) showToast(`โหลดฐานข้อมูลไม่สำเร็จ: ${error.message}`, "cloud-off");
      throw error;
    })
    .finally(() => {
      databaseLoadPromise = null;
    });
  return databaseLoadPromise;
}

async function pullFirebaseState() {
  if (!requireDatabaseConnection()) return;
  try {
    await loadDatabaseState({ preserveSelection: true });
    showToast("โหลดข้อมูลล่าสุดจาก Firebase Firestore แล้ว");
  } catch (error) {
    // Error is already displayed by loadDatabaseState.
  }
}

function requireDatabaseConnection() {
  if (currentUser && databaseStatus === "connected") return true;
  showToast(databaseStatus === "syncing" ? "กรุณารอให้โหลดข้อมูลเสร็จก่อน" : "กรุณาเข้าสู่ระบบและเชื่อมต่อ Firebase Firestore ก่อน", "cloud-off");
  return false;
}

async function migrateLegacyDataToFirebase() {
  if (!legacyState) {
    showToast("ไม่พบข้อมูลเดิมในเบราว์เซอร์", "search-x");
    return;
  }
  if (!isAdmin()) {
    showToast("เฉพาะผู้ดูแลระบบเท่านั้นที่นำเข้าข้อมูลได้", "shield-alert");
    return;
  }
  if (!requireDatabaseConnection()) return;
  const summary = legacyStateSummary();
  const confirmed = window.confirm(
    `ย้ายข้อมูลเดิมเข้า Firebase Firestore?\n\nพนักงาน ${summary.employees} คน · รายการคะแนน ${summary.records} รายการ · ${summary.years} ปี\n\nระบบจะเก็บรายการที่อัปเดตล่าสุด และลบข้อมูลเดิมในเบราว์เซอร์เมื่อ Firebase Firestore ยืนยันสำเร็จเท่านั้น`
  );
  if (!confirmed) return;
  setDatabaseStatus("syncing", "กำลังรวมและนำเข้าข้อมูลเดิม");
  try {
    const merged = mergeLegacyWithRemote(state, legacyState);
    await window.KpiDatabase.importState(merged);
    purgeLegacyData();
    await loadDatabaseState({ preserveSelection: true, quiet: true });
    showToast("นำเข้าข้อมูลเดิมเข้า Firebase Firestore เรียบร้อยแล้ว");
  } catch (error) {
    setDatabaseStatus("error", `นำเข้าข้อมูลไม่สำเร็จ: ${error.message}`);
    showToast("นำเข้าข้อมูลไม่สำเร็จ แต่ข้อมูลเดิมยังอยู่ในเบราว์เซอร์", "triangle-alert");
  }
}

function updateNotificationStatus() {
  if (!els.notificationDot || !employees.length) return;
  els.notificationDot.hidden = monthlyResults(selectedMonth).length === employees.length;
}

function applyRolePermissions() {
  const entryButtons = document.querySelectorAll('[data-view="entry"]');
  entryButtons.forEach((button) => {
    button.hidden = !canEditScores();
    button.disabled = !canEditScores();
  });
  if (els.accountName) els.accountName.textContent = currentProfile?.display_name || currentUser?.email || "ผู้ใช้งาน";
  if (els.accountRole) els.accountRole.textContent = ROLE_LABELS[currentProfile?.role] || "ผู้ใช้งาน";
}

function showAuthGate(message = "กรุณาเข้าสู่ระบบเพื่อใช้งาน KPI Flow", { configError = false } = {}) {
  if (els.authGate) els.authGate.hidden = false;
  if (els.appShell) els.appShell.hidden = true;
  if (els.mobileNav) els.mobileNav.hidden = true;
  if (els.authMessage) {
    els.authMessage.textContent = message;
    els.authMessage.classList.toggle("error", configError);
  }
  if (els.authConfigHelp) els.authConfigHelp.hidden = !configError;
  if (els.loginForm) els.loginForm.hidden = configError;
}

function showApplication() {
  if (els.authGate) els.authGate.hidden = true;
  if (els.appShell) els.appShell.hidden = false;
  if (els.mobileNav) els.mobileNav.hidden = false;
}

async function handleLoginSubmit(event) {
  event.preventDefault();
  const email = els.loginEmail.value.trim();
  const password = els.loginPassword.value;
  if (!email || !password) return;
  els.loginButton.disabled = true;
  els.loginButton.innerHTML = '<i data-lucide="loader-circle"></i>กำลังเข้าสู่ระบบ';
  setIcons();
  try {
    await window.KpiDatabase.signIn(email, password);
    els.loginPassword.value = "";
    await bootstrapAuthenticatedApp();
  } catch (error) {
    showAuthGate("อีเมลหรือรหัสผ่านไม่ถูกต้อง");
    if (els.authMessage) els.authMessage.classList.add("error");
  } finally {
    els.loginButton.disabled = false;
    els.loginButton.innerHTML = '<i data-lucide="log-in"></i>เข้าสู่ระบบ';
    setIcons();
  }
}

async function bootstrapAuthenticatedApp() {
  showAuthGate("กำลังตรวจสอบสิทธิ์และโหลดฐานข้อมูล");
  currentUser = await window.KpiDatabase.getAuthenticatedUser();
  if (!currentUser) {
    currentProfile = null;
    showAuthGate();
    return;
  }
  try {
    currentProfile = await window.KpiDatabase.getProfile(currentUser.id);
    await loadDatabaseState();
    if (!appInitialized) {
      init();
      appInitialized = true;
    }
    applyRolePermissions();
    showApplication();
    subscribeRealtime();
  } catch (error) {
    currentUser = null;
    currentProfile = null;
    showAuthGate(`เปิดระบบไม่สำเร็จ: ${error.message}`);
    if (els.authMessage) els.authMessage.classList.add("error");
  }
}

function subscribeRealtime() {
  window.KpiDatabase.subscribe(() => {
    window.clearTimeout(realtimeReloadTimer);
    realtimeReloadTimer = window.setTimeout(() => {
      if (currentUser) loadDatabaseState({ preserveSelection: true, quiet: true }).catch(() => undefined);
    }, 500);
  });
}

async function logout() {
  try {
    window.KpiDatabase.unsubscribe();
    await window.KpiDatabase.signOut();
  } catch (error) {
    showToast(error.message, "triangle-alert");
  } finally {
    currentUser = null;
    currentProfile = null;
    setDatabaseStatus("not-connected", "ออกจากระบบแล้ว");
    showAuthGate();
  }
}

async function boot() {
  setIcons();
  els.loginForm?.addEventListener("submit", handleLoginSubmit);
  els.logoutButton?.addEventListener("click", logout);
  try {
    await window.KpiDatabaseReady;
  } catch (error) {
    showAuthGate(`โหลด Firebase SDK ไม่สำเร็จ: ${error.message}`, { configError: true });
    return;
  }
  if (!window.KpiDatabase?.isConfigured()) {
    showAuthGate("ยังไม่ได้ตั้งค่า Firebase กรุณาแก้ไฟล์ docs/firebase-config.js", { configError: true });
    return;
  }
  await bootstrapAuthenticatedApp();
}


function recordKey(employeeId, month) {
  return recordKeyFor(selectedYear, employeeId, month);
}

function getRecordForYear(employeeId, month, year) {
  return state.records[recordKeyFor(year, employeeId, month)] || null;
}

function getRecord(employeeId, month) {
  return getRecordForYear(employeeId, month, selectedYear);
}

function validScores(scores) {
  return Array.isArray(scores) &&
    scores.length === KPI_DEFS.length &&
    scores.every((score) => Number.isFinite(Number(score)) && Number(score) >= 20 && Number(score) <= 100);
}

function calculate(scores) {
  if (!validScores(scores)) return null;
  const weighted = scores.map((score, index) => {
    const gpa = Number(score) / 20 - 1;
    return { gpa, weighted: gpa * KPI_DEFS[index].weight };
  });
  const gpa = weighted.reduce((sum, item) => sum + item.weighted, 0) / 20;
  return {
    gpa,
    percentage: gpa * 25,
    weighted,
  };
}

function latestDataMonth(year = selectedYear) {
  for (let month = 11; month >= 0; month -= 1) {
    if (employees.some((person) => validScores(getRecordForYear(person.id, month, year)?.scores))) return month;
  }
  return 0;
}

function annualAverageForYear(employeeId, year) {
  const values = MONTHS.map((_, month) => calculate(getRecordForYear(employeeId, month, year)?.scores)?.percentage)
    .filter(Number.isFinite);
  return values.length ? values.reduce((sum, value) => sum + value, 0) / values.length : null;
}

function annualAverage(employeeId) {
  return annualAverageForYear(employeeId, selectedYear);
}

function previousYearScoreForYear(employeeId, year) {
  if (year - 1 === 2568) {
    const value = PREVIOUS_YEAR_SCORES[employeeId];
    return Number.isFinite(value) && value > 0 ? value : null;
  }
  return annualAverageForYear(employeeId, year - 1);
}

function previousYearScore(employeeId) {
  return previousYearScoreForYear(employeeId, selectedYear);
}

function previousDepartmentAverage() {
  const values = employees.map((person) => previousYearScore(person.id)).filter(Number.isFinite);
  return values.length ? values.reduce((sum, value) => sum + value, 0) / values.length : null;
}

function yoyDelta(current, previous) {
  return Number.isFinite(current) && Number.isFinite(previous) ? current - previous : null;
}

function formatDelta(value) {
  if (!Number.isFinite(value)) return "ไม่มีข้อมูลเทียบ";
  return `${value >= 0 ? "+" : ""}${formatNumber(value)} คะแนน`;
}

function monthlyResults(month) {
  return employees
    .map((person) => {
      const result = calculate(getRecord(person.id, month)?.scores);
      return result ? { ...person, ...result } : null;
    })
    .filter(Boolean)
    .sort((a, b) => b.percentage - a.percentage);
}

function departmentMonthlyAverage(month) {
  const results = monthlyResults(month);
  return results.length
    ? results.reduce((sum, item) => sum + item.percentage, 0) / results.length
    : null;
}

function formatNumber(value, digits = 1) {
  if (!Number.isFinite(value)) return "—";
  return new Intl.NumberFormat("th-TH", {
    minimumFractionDigits: digits,
    maximumFractionDigits: digits,
  }).format(value);
}

function resultMeta(percentage) {
  if (!Number.isFinite(percentage)) return { label: "ยังไม่ครบ", className: "result-improve" };
  if (percentage >= 90) return { label: "ยอดเยี่ยม", className: "result-excellent" };
  if (percentage >= 80) return { label: "ดีมาก", className: "result-very-good" };
  if (percentage >= 70) return { label: "ดี", className: "result-good" };
  if (percentage >= 60) return { label: "ผ่านเกณฑ์", className: "result-pass" };
  return { label: "ควรปรับปรุง", className: "result-improve" };
}

function initials(name) {
  return name.trim().split(/\s+/).map((part) => part[0]).join("").slice(0, 2);
}

function employeeOptions(selected = "") {
  return employees
    .map((person) => `<option value="${escapeHtml(person.id)}" ${person.id === selected ? "selected" : ""}>${escapeHtml(person.name)}</option>`)
    .join("");
}

function latestEmployeeMonth(employeeId) {
  for (let month = 11; month >= 0; month -= 1) {
    if (validScores(getRecord(employeeId, month)?.scores)) return month;
  }
  return null;
}

function openScoreEditor(employeeId, month = null) {
  selectedEmployee = employeeId;
  const targetMonth = Number.isInteger(month) ? month : latestEmployeeMonth(employeeId);
  if (Number.isInteger(targetMonth)) {
    selectedMonth = targetMonth;
    els.globalMonth.value = String(selectedMonth);
  }
  switchView("entry");
}

function employeeManagerListHtml() {
  return employees.map((person) => {
    const recordCount = MONTHS.filter((_, month) => validScores(getRecord(person.id, month)?.scores)).length;
    return `<li>
      <span class="avatar">${initials(person.name)}</span>
      <span class="employee-manager-name"><strong>${escapeHtml(person.name)}</strong><small>${recordCount} เดือนที่มีคะแนน</small></span>
      <button class="icon-button delete-employee" type="button" data-delete-employee="${person.id}" aria-label="ลบ ${escapeHtml(person.name)}"><i data-lucide="trash-2"></i></button>
    </li>`;
  }).join("");
}

function refreshEmployeeManagerList() {
  const list = document.getElementById("employeeManagerList");
  const count = document.getElementById("employeeManagerCount");
  if (list) list.innerHTML = employeeManagerListHtml();
  if (count) count.textContent = `${employees.length} คน`;
  setIcons();
}

function closeEmployeeManager() {
  document.getElementById("employeeManagerModal")?.remove();
}

function openEmployeeManager() {
  if (!requireDatabaseConnection()) return;
  if (!isAdmin()) {
    showToast("เฉพาะผู้ดูแลระบบเท่านั้นที่จัดการพนักงานได้", "shield-alert");
    return;
  }
  closeEmployeeManager();
  const modal = document.createElement("div");
  modal.id = "employeeManagerModal";
  modal.className = "modal-backdrop";
  modal.innerHTML = `
    <section class="employee-modal glass-card" role="dialog" aria-modal="true" aria-labelledby="employeeManagerTitle">
      <div class="modal-heading">
        <div><p class="eyebrow">TEAM DIRECTORY</p><h2 id="employeeManagerTitle">จัดการรายชื่อพนักงาน</h2></div>
        <button class="icon-button" type="button" data-close-modal aria-label="ปิด"><i data-lucide="x"></i></button>
      </div>
      <form id="addEmployeeForm" class="add-employee-form">
        <div class="field">
          <label for="newEmployeeName">ชื่อ-นามสกุลพนักงาน</label>
          <input id="newEmployeeName" maxlength="80" autocomplete="off" placeholder="เช่น สมศักดิ์ ใจดี" required>
        </div>
        <button class="button button-primary" type="submit"><i data-lucide="user-plus"></i>เพิ่มพนักงาน</button>
      </form>
      <div class="employee-manager-summary"><span>รายชื่อปัจจุบัน</span><strong id="employeeManagerCount">${employees.length} คน</strong></div>
      <ul id="employeeManagerList" class="employee-manager-list">${employeeManagerListHtml()}</ul>
      <p class="modal-note"><i data-lucide="info"></i>การลบพนักงานจะลบคะแนนของบุคคลนั้น แต่ระบบยังเก็บรายละเอียดเดิมไว้ใน Audit Log</p>
    </section>`;
  document.body.appendChild(modal);

  modal.querySelector("[data-close-modal]").addEventListener("click", closeEmployeeManager);
  modal.addEventListener("click", (event) => {
    if (event.target === modal) closeEmployeeManager();
  });
  modal.querySelector("#addEmployeeForm").addEventListener("submit", async (event) => {
    event.preventDefault();
    const form = event.currentTarget;
    const input = modal.querySelector("#newEmployeeName");
    const submitButton = form.querySelector('button[type="submit"]');
    const name = input.value.trim().replace(/\s+/g, " ");
    if (name.length < 2) {
      showToast("กรุณากรอกชื่อพนักงานให้ครบถ้วน", "triangle-alert");
      return;
    }
    if (employees.some((person) => person.name.toLocaleLowerCase("th") === name.toLocaleLowerCase("th"))) {
      showToast("มีชื่อพนักงานนี้อยู่แล้ว", "triangle-alert");
      return;
    }
    const id = `employee-${Date.now().toString(36)}-${crypto.randomUUID().slice(0, 8)}`;
    submitButton.disabled = true;
    try {
      const created = await window.KpiDatabase.addEmployee({ id, name });
      employees = sortEmployeesByName([...employees, created]);
      state.employees = employees;
      selectedEmployee = id;
      input.value = "";
      refreshEmployeeManagerList();
      refreshDateControls();
      showToast(`เพิ่ม ${name} ใน Firebase Firestore แล้ว`);
      if (currentView === "entry") renderEntry();
    } catch (error) {
      showToast(`เพิ่มพนักงานไม่สำเร็จ: ${error.message}`, "triangle-alert");
    } finally {
      submitButton.disabled = false;
    }
  });
  modal.querySelector("#employeeManagerList").addEventListener("click", async (event) => {
    const button = event.target.closest("[data-delete-employee]");
    if (!button) return;
    if (employees.length <= 1) {
      showToast("ต้องมีพนักงานอย่างน้อย 1 คน", "triangle-alert");
      return;
    }
    const id = button.dataset.deleteEmployee;
    const person = employees.find((item) => item.id === id);
    if (!person || !window.confirm(`ลบ ${person.name} และคะแนนทั้งหมดของบุคคลนี้?`)) return;
    button.disabled = true;
    try {
      await window.KpiDatabase.deleteEmployee(id);
      employees = employees.filter((item) => item.id !== id);
      state.employees = employees;
      state.records = Object.fromEntries(Object.entries(state.records).filter(([, record]) => record?.employeeId !== id));
      if (selectedEmployee === id) selectedEmployee = employees[0]?.id || "";
      if (historyEmployee === id) historyEmployee = "all";
      refreshEmployeeManagerList();
      refreshDateControls();
      updateNotificationStatus();
      showToast(`ลบ ${person.name} จาก Firebase Firestore แล้ว`);
      if (currentView === "entry") renderEntry();
    } catch (error) {
      button.disabled = false;
      showToast(`ลบพนักงานไม่สำเร็จ: ${error.message}`, "triangle-alert");
    }
  });
  modal.querySelector("#newEmployeeName").focus();
  setIcons();
}

function monthOptions(selected = 0, includeAll = false) {
  const all = includeAll ? '<option value="all">ทุกเดือน</option>' : "";
  return all + MONTHS.map((month, index) =>
    `<option value="${index}" ${Number(selected) === index ? "selected" : ""}>${month} ${selectedYear}</option>`
  ).join("");
}

function yearOptions() {
  const years = [...new Set(state.years.map(Number))].sort((a, b) => a - b);
  const baseOptions = years.map((year) =>
    `<option value="${year}" ${year === selectedYear ? "selected" : ""}>พ.ศ. ${year}</option>`
  ).join("");
  if (!isAdmin()) return baseOptions;
  const nextYear = Math.max(...years) + 1;
  return baseOptions + `<option value="${nextYear}">+ เริ่มปี ${nextYear}</option>`;
}

function refreshDateControls() {
  els.globalYear.innerHTML = yearOptions();
  els.globalYear.value = String(selectedYear);
  els.globalMonth.innerHTML = monthOptions(selectedMonth);
  els.globalMonth.value = String(selectedMonth);
}

async function switchEvaluationYear(year) {
  if (!requireDatabaseConnection()) {
    refreshDateControls();
    return;
  }
  const nextYear = Number(year);
  if (!Number.isFinite(nextYear)) return;
  const isNewYear = !state.years.includes(nextYear);
  if (isNewYear && !isAdmin()) {
    showToast("เฉพาะผู้ดูแลระบบเท่านั้นที่เริ่มปีประเมินใหม่ได้", "shield-alert");
    refreshDateControls();
    return;
  }

  if (isNewYear) {
    els.globalYear.disabled = true;
    try {
      const settings = await window.KpiDatabase.addEvaluationYear(nextYear);
      state.years = Array.isArray(settings?.years) ? settings.years.map(Number) : [...state.years, nextYear];
      state.activeYear = Number(settings?.active_year) || nextYear;
      showToast(`เริ่มปีประเมิน ${nextYear} บน Firebase Firestore แล้ว`);
    } catch (error) {
      showToast(`เริ่มปีใหม่ไม่สำเร็จ: ${error.message}`, "triangle-alert");
      refreshDateControls();
      return;
    } finally {
      els.globalYear.disabled = false;
    }
  }

  selectedYear = nextYear;
  selectedMonth = latestDataMonth(selectedYear);
  refreshDateControls();
  updateNotificationStatus();
  if (currentView === "dashboard") renderDashboard();
  if (currentView === "entry") renderEntry();
  if (currentView === "history") renderHistory();
  if (currentView === "reports") renderReports();
}

function setIcons() {
  if (window.lucide) window.lucide.createIcons({ attrs: { "aria-hidden": "true" } });
}

function renderDashboard() {
  const results = monthlyResults(selectedMonth);
  const average = departmentMonthlyAverage(selectedMonth);
  const previousAverage = selectedMonth > 0 ? departmentMonthlyAverage(selectedMonth - 1) : null;
  const change = Number.isFinite(previousAverage) && Number.isFinite(average) ? average - previousAverage : null;
  const top = results[0];
  const completion = results.length / employees.length * 100;
  const annualValues = employees.map((person) => annualAverage(person.id)).filter(Number.isFinite);
  const annualDepartment = annualValues.length
    ? annualValues.reduce((sum, value) => sum + value, 0) / annualValues.length
    : null;
  const previousDepartment = previousDepartmentAverage();
  const departmentYoy = yoyDelta(annualDepartment, previousDepartment);

  els.dashboard.innerHTML = `
    <div class="hero-panel glass-card">
      <div class="hero-copy">
        <p class="hero-kicker">PERFORMANCE SNAPSHOT · ${SHORT_MONTHS[selectedMonth]} ${selectedYear}</p>
        <h2>${top ? `ทีมกำลังเดินหน้าได้ดี<br>${top.name.split(" ")[0]} ทำคะแนนสูงสุดเดือนนี้` : "พร้อมเริ่มบันทึกผลการประเมินประจำเดือน"}</h2>
        <p>${top ? `ภาพรวมแผนกอยู่ที่ ${formatNumber(average)}% จากพนักงานที่ประเมินแล้ว ${results.length} คน` : "เลือกเมนูบันทึกคะแนนเพื่อเพิ่มผลการประเมินของพนักงาน"}</p>
      </div>
      <div class="hero-score">
        <strong>${formatNumber(average)}</strong>
        <span>คะแนนเฉลี่ยแผนก / 100</span>
      </div>
    </div>

    <div class="metric-grid">
      ${metricCard("users-round", "tone-teal", results.length, `ประเมินแล้วจาก ${employees.length} คน`, change)}
      ${metricCard("trophy", "tone-amber", top ? formatNumber(top.percentage) : "—", top ? `อันดับ 1 · ${top.name.split(" ")[0]}` : "ยังไม่มีอันดับ", null)}
      ${metricCard("archive-restore", "tone-violet", formatNumber(previousDepartment), `คะแนนเฉลี่ยฐานปี ${selectedYear - 1}`, null)}
      ${metricCard("chart-spline", "tone-rose", formatNumber(annualDepartment), `เฉลี่ยสะสม ${selectedYear} · ครบ ${formatNumber(completion, 0)}%`, departmentYoy)}
    </div>

    ${renderYearComparison()}

    <div class="dashboard-grid">
      <article class="panel glass-card chart-panel">
        <div class="panel-heading chart-heading">
          <div>
            <h3>${chartMode === "monthly" ? "แนวโน้มคะแนนรายเดือน" : "เปรียบเทียบคะแนนรายปี"}</h3>
            <p>${chartMode === "monthly" ? `ค่าเฉลี่ยแต่ละเดือนของปี ${selectedYear} เทียบกับฐานปี ${selectedYear - 1}` : `คะแนนปี ${selectedYear - 1} เทียบค่าเฉลี่ยสะสมปี ${selectedYear} แยกรายบุคคล`}</p>
          </div>
          <div class="segmented-control" role="group" aria-label="รูปแบบกราฟ">
            <button class="${chartMode === "monthly" ? "active" : ""}" type="button" data-chart-mode="monthly"><i data-lucide="chart-spline"></i>รายเดือน</button>
            <button class="${chartMode === "yearly" ? "active" : ""}" type="button" data-chart-mode="yearly"><i data-lucide="chart-column-big"></i>รายปี</button>
          </div>
        </div>
        <div class="chart-wrap">
          <canvas id="trendCanvas" aria-label="${chartMode === "monthly" ? "กราฟคะแนนเฉลี่ยรายเดือน" : "กราฟเปรียบเทียบคะแนนรายปี"}"></canvas>
          <div id="chartTooltip" class="chart-tooltip" hidden></div>
        </div>
        <div class="chart-legend">
          ${chartMode === "monthly"
            ? `<span><i class="legend-current"></i>ค่าเฉลี่ยปี ${selectedYear}</span><span><i class="legend-baseline"></i>ค่าเฉลี่ยฐานปี ${selectedYear - 1}</span>`
            : `<span><i class="legend-2568"></i>ปี ${selectedYear - 1}</span><span><i class="legend-2569"></i>ปี ${selectedYear} YTD</span>`}
        </div>
      </article>

      <article class="panel glass-card">
        <div class="panel-heading">
          <div>
            <h3>อันดับประจำเดือน</h3>
            <p>${MONTHS[selectedMonth]} ${selectedYear}</p>
          </div>
          <i data-lucide="medal"></i>
        </div>
        ${results.length ? `<div class="ranking-list">${results.slice(0, 6).map((item, index) => `
          <button class="ranking-row" type="button" data-open-employee="${item.id}">
            <span class="rank-number">${index + 1}</span>
            <span class="ranking-name"><strong>${escapeHtml(item.name)}</strong><span>${resultMeta(item.percentage).label}</span></span>
            <span class="ranking-score"><strong>${formatNumber(item.percentage)}</strong><span>GPA ${formatNumber(item.gpa, 2)}</span></span>
          </button>`).join("")}</div>` : emptyState("clipboard-list", "ยังไม่มีคะแนนในเดือนนี้")}
      </article>
    </div>

    <article class="panel glass-card" style="margin-top:16px">
      <div class="panel-heading">
        <div>
          <h3>ค่าเฉลี่ยแยกตามหัวข้อ KPI</h3>
          <p>ใช้คะแนนดิบ 20–100 เพื่อให้เห็นจุดแข็งและโอกาสพัฒนาของทีม</p>
        </div>
      </div>
      ${renderCategoryBars(selectedMonth)}
    </article>
  `;

  document.querySelectorAll("[data-open-employee]").forEach((button) => {
    button.addEventListener("click", () => {
      selectedEmployee = button.dataset.openEmployee;
      switchView("entry");
    });
  });
  document.querySelectorAll("[data-chart-mode]").forEach((button) => {
    button.addEventListener("click", () => {
      chartMode = button.dataset.chartMode;
      renderDashboard();
    });
  });
  requestAnimationFrame(drawTrendChart);
  setIcons();
}

function renderYearComparison() {
  const comparable = employees
    .map((person) => {
      const previous = previousYearScore(person.id);
      const current = annualAverage(person.id);
      const delta = yoyDelta(current, previous);
      return Number.isFinite(previous) && Number.isFinite(current)
        ? { ...person, previous, current, delta }
        : null;
    })
    .filter(Boolean)
    .sort((a, b) => THAI_NAME_COLLATOR.compare(a.name, b.name));

  return `
    <article class="panel glass-card yoy-panel">
      <div class="panel-heading">
        <div>
          <h3>เปรียบเทียบผลงานปีต่อปี</h3>
          <p>คะแนนปี ${selectedYear - 1} เทียบกับค่าเฉลี่ยสะสมปี ${selectedYear} เฉพาะพนักงานที่มีข้อมูลทั้งสองปี</p>
        </div>
        <span class="weight-chip">${selectedYear - 1} → ${selectedYear}</span>
      </div>
      <div class="yoy-list">
        ${comparable.map((person) => `
          <button class="yoy-row" type="button" data-open-employee="${person.id}">
            <span class="yoy-person"><strong>${escapeHtml(person.name)}</strong><small>${formatDelta(person.delta)}</small></span>
            <span class="yoy-bars">
              <span class="yoy-bar"><i class="year-2568" style="width:${person.previous}%"></i></span>
              <span class="yoy-bar"><i class="year-2569" style="width:${person.current}%"></i></span>
            </span>
            <span class="yoy-values">
              <span><small>${selectedYear - 1}</small><strong>${formatNumber(person.previous)}</strong></span>
              <span><small>${selectedYear}</small><strong>${formatNumber(person.current)}</strong></span>
              <span class="yoy-change ${person.delta >= 0 ? "is-up" : "is-down"}"><i data-lucide="${person.delta >= 0 ? "trending-up" : "trending-down"}"></i>${person.delta >= 0 ? "+" : ""}${formatNumber(person.delta)}</span>
            </span>
          </button>`).join("")}
      </div>
      <p class="yoy-legend"><span><i class="legend-2568"></i>ปี ${selectedYear - 1}</span><span><i class="legend-2569"></i>ปี ${selectedYear} (เฉลี่ยสะสม)</span></p>
    </article>`;
}

function metricCard(icon, tone, value, label, change) {
  const trend = Number.isFinite(change)
    ? `<span class="metric-trend ${change >= 0 ? "is-up" : "is-down"}"><i data-lucide="${change >= 0 ? "trending-up" : "trending-down"}"></i>${change >= 0 ? "+" : ""}${formatNumber(change)} จุด</span>`
    : "";
  return `
    <article class="metric-card glass-card">
      <div class="metric-card-head"><span class="metric-icon ${tone}"><i data-lucide="${icon}"></i></span>${trend}</div>
      <strong>${value}</strong><span>${label}</span>
    </article>`;
}

function renderCategoryBars(month) {
  const records = employees
    .map((person) => getRecord(person.id, month))
    .filter((record) => validScores(record?.scores));
  if (!records.length) return emptyState("chart-bar-big", "ยังไม่มีข้อมูลสำหรับเปรียบเทียบ");
  return `<div class="category-bars">${KPI_DEFS.map((kpi, index) => {
    const average = records.reduce((sum, record) => sum + Number(record.scores[index]), 0) / records.length;
    return `<div>
      <div class="category-bar-head"><span>${kpi.title}</span><strong>${formatNumber(average)}</strong></div>
      <div class="bar-track"><div class="bar-fill" style="width:${Math.max(0, Math.min(100, average))}%"></div></div>
    </div>`;
  }).join("")}</div>`;
}

function emptyState(icon, text) {
  return `<div class="empty-state"><div><i data-lucide="${icon}"></i><p>${text}</p></div></div>`;
}

function drawTrendChart() {
  const canvas = document.getElementById("trendCanvas");
  if (!canvas) return;
  const rect = canvas.getBoundingClientRect();
  const dpr = window.devicePixelRatio || 1;
  canvas.width = Math.max(1, rect.width * dpr);
  canvas.height = Math.max(1, rect.height * dpr);
  const ctx = canvas.getContext("2d");
  ctx.scale(dpr, dpr);
  chartHitRegions = [];
  ctx.clearRect(0, 0, rect.width, rect.height);
  if (chartMode === "yearly") {
    drawYearlyChart(ctx, rect.width, rect.height);
  } else {
    drawMonthlyChart(ctx, rect.width, rect.height);
  }
  bindChartInteractions(canvas);
}

function drawChartGrid(ctx, width, height, pad) {
  const plotH = height - pad.top - pad.bottom;
  ctx.save();
  ctx.font = '11px "Sarabun", sans-serif';
  ctx.lineWidth = 1;
  [0, 25, 50, 75, 100].forEach((tick) => {
    const y = pad.top + (100 - tick) / 100 * plotH;
    ctx.strokeStyle = "rgba(47, 75, 89, .08)";
    ctx.beginPath();
    ctx.moveTo(pad.left, y);
    ctx.lineTo(width - pad.right, y);
    ctx.stroke();
    ctx.fillStyle = "#7f8e98";
    ctx.textAlign = "right";
    ctx.fillText(String(tick), pad.left - 8, y + 4);
  });
  ctx.restore();
}

function drawMonthlyChart(ctx, width, height) {
  const pad = { top: 20, right: 20, bottom: 38, left: 42 };
  const plotW = width - pad.left - pad.right;
  const plotH = height - pad.top - pad.bottom;
  const baseline = previousDepartmentAverage();
  const values = MONTHS.map((_, index) => departmentMonthlyAverage(index));
  drawChartGrid(ctx, width, height, pad);

  if (Number.isFinite(baseline)) {
    const baselineY = pad.top + (100 - baseline) / 100 * plotH;
    ctx.save();
    ctx.setLineDash([6, 5]);
    ctx.strokeStyle = "#8467e8";
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.moveTo(pad.left, baselineY);
    ctx.lineTo(width - pad.right, baselineY);
    ctx.stroke();
    ctx.restore();
  }

  const points = values.map((value, index) => ({
    x: pad.left + index / 11 * plotW,
    y: Number.isFinite(value) ? pad.top + (100 - value) / 100 * plotH : null,
    value,
    month: index,
  }));
  ctx.font = '11px "Sarabun", sans-serif';
  ctx.textAlign = "center";
  points.forEach((point, index) => {
    ctx.fillStyle = "#7f8e98";
    ctx.fillText(SHORT_MONTHS[index], point.x, height - 10);
  });
  const valid = points.filter((point) => point.y !== null);
  if (!valid.length) return;

  const gradient = ctx.createLinearGradient(0, pad.top, 0, height - pad.bottom);
  gradient.addColorStop(0, "rgba(15,139,141,.28)");
  gradient.addColorStop(1, "rgba(15,139,141,0)");
  ctx.beginPath();
  valid.forEach((point, index) => index ? ctx.lineTo(point.x, point.y) : ctx.moveTo(point.x, point.y));
  ctx.lineTo(valid[valid.length - 1].x, height - pad.bottom);
  ctx.lineTo(valid[0].x, height - pad.bottom);
  ctx.closePath();
  ctx.fillStyle = gradient;
  ctx.fill();
  ctx.beginPath();
  valid.forEach((point, index) => index ? ctx.lineTo(point.x, point.y) : ctx.moveTo(point.x, point.y));
  ctx.strokeStyle = "#0f8b8d";
  ctx.lineWidth = 3;
  ctx.lineCap = "round";
  ctx.lineJoin = "round";
  ctx.stroke();

  valid.forEach((point) => {
    ctx.beginPath();
    ctx.arc(point.x, point.y, 5, 0, Math.PI * 2);
    ctx.fillStyle = "#ffffff";
    ctx.fill();
    ctx.strokeStyle = "#0f8b8d";
    ctx.lineWidth = 3;
    ctx.stroke();
    chartHitRegions.push({
      kind: "point", x: point.x, y: point.y, radius: 12,
      title: `${MONTHS[point.month]} ${selectedYear}`,
      lines: [`เฉลี่ยแผนก ${formatNumber(point.value)}`, `ฐานปี ${selectedYear - 1} ${formatNumber(baseline)}`],
    });
  });
}

function drawYearlyChart(ctx, width, height) {
  const people = employees.map((person) => ({
    ...person,
    previous: previousYearScore(person.id),
    current: annualAverage(person.id),
  })).filter((person) => Number.isFinite(person.previous) || Number.isFinite(person.current));
  const pad = { top: 20, right: 18, bottom: width < 560 ? 76 : 54, left: 42 };
  const plotW = width - pad.left - pad.right;
  const plotH = height - pad.top - pad.bottom;
  drawChartGrid(ctx, width, height, pad);
  if (!people.length) return;
  const groupW = plotW / people.length;
  const barW = Math.max(5, Math.min(16, groupW * 0.28));
  ctx.font = '10px "Sarabun", sans-serif';

  people.forEach((person, index) => {
    const center = pad.left + groupW * index + groupW / 2;
    const bars = [
      { year: selectedYear - 1, value: person.previous, x: center - barW - 2, color: "#b7a9e9" },
      { year: selectedYear, value: person.current, x: center + 2, color: "#0f8b8d" },
    ];
    bars.forEach((bar) => {
      if (!Number.isFinite(bar.value)) return;
      const y = pad.top + (100 - Math.max(0, Math.min(100, bar.value))) / 100 * plotH;
      const barHeight = height - pad.bottom - y;
      ctx.fillStyle = bar.color;
      ctx.beginPath();
      ctx.roundRect(bar.x, y, barW, barHeight, [4, 4, 0, 0]);
      ctx.fill();
      chartHitRegions.push({
        kind: "rect", x: bar.x, y, width: barW, height: barHeight, employeeId: person.id,
        title: person.name, lines: [`ปี ${bar.year} · ${formatNumber(bar.value)} คะแนน`],
      });
    });
    const label = person.name.split(" ")[0];
    ctx.save();
    ctx.fillStyle = "#6d7d88";
    if (width < 560) {
      ctx.translate(center + 3, height - pad.bottom + 10);
      ctx.rotate(-Math.PI / 4);
      ctx.textAlign = "right";
      ctx.fillText(label, 0, 0);
    } else {
      ctx.textAlign = "center";
      ctx.fillText(label, center, height - 15);
    }
    ctx.restore();
  });
}

function bindChartInteractions(canvas) {
  const tooltip = document.getElementById("chartTooltip");
  if (!tooltip) return;
  const findRegion = (x, y) => chartHitRegions.find((region) => {
    if (region.kind === "point") return Math.hypot(x - region.x, y - region.y) <= region.radius;
    return x >= region.x && x <= region.x + region.width && y >= region.y && y <= region.y + region.height;
  });
  canvas.onmousemove = (event) => {
    const rect = canvas.getBoundingClientRect();
    const x = event.clientX - rect.left;
    const y = event.clientY - rect.top;
    const region = findRegion(x, y);
    if (!region) {
      tooltip.hidden = true;
      canvas.style.cursor = "default";
      return;
    }
    tooltip.innerHTML = `<strong>${escapeHtml(region.title)}</strong>${region.lines.map((line) => `<span>${escapeHtml(line)}</span>`).join("")}`;
    tooltip.hidden = false;
    tooltip.style.left = `${Math.max(8, Math.min(x + 12, rect.width - 190))}px`;
    tooltip.style.top = `${Math.max(8, y - 66)}px`;
    canvas.style.cursor = region.employeeId ? "pointer" : "crosshair";
  };
  canvas.onmouseleave = () => { tooltip.hidden = true; };
  canvas.onclick = (event) => {
    const rect = canvas.getBoundingClientRect();
    const region = findRegion(event.clientX - rect.left, event.clientY - rect.top);
    if (region?.employeeId) openScoreEditor(region.employeeId);
  };
}

function renderEntry() {
  if (!canEditScores()) {
    els.entry.innerHTML = `<div class="empty-state glass-card"><i data-lucide="shield-alert"></i><p>บัญชีนี้มีสิทธิ์ดูรายงานเท่านั้น</p></div>`;
    setIcons();
    return;
  }
  const person = employees.find((item) => item.id === selectedEmployee) || employees[0];
  const record = getRecord(person.id, selectedMonth);
  const scores = validScores(record?.scores) ? [...record.scores] : Array(KPI_DEFS.length).fill(DEFAULT_SCORE);
  const note = record?.note || "";
  const isEditing = Boolean(record && validScores(record.scores));

  els.entry.innerHTML = `
    <div class="entry-toolbar glass-card">
      <div class="field-group">
        <div class="field">
          <label for="employeeSelect">พนักงาน</label>
          <select id="employeeSelect" class="employee-select">${employeeOptions(person.id)}</select>
        </div>
        <div class="field">
          <label for="entryMonth">เดือนประเมิน</label>
          <select id="entryMonth">${monthOptions(selectedMonth)}</select>
        </div>
      </div>
      <div class="entry-toolbar-actions">
        <span class="record-state ${isEditing ? "editing" : "new"}"><i data-lucide="${isEditing ? "pencil-line" : "sparkles"}"></i>${isEditing ? "กำลังแก้ไขข้อมูลเดิม" : "รายการใหม่ · เริ่มต้นที่ 60"}</span>
        ${isAdmin() ? `<button id="manageEmployees" class="button button-secondary" type="button"><i data-lucide="users-round"></i>จัดการพนักงาน</button>` : ""}
      </div>
    </div>

    <div class="entry-layout">
      <div class="kpi-list">
        ${KPI_DEFS.map((kpi, index) => `
          <article class="kpi-input-card glass-card" data-kpi-index="${index}">
            <div class="kpi-copy">
              <span class="kpi-icon"><i data-lucide="${kpi.icon}"></i></span>
              <div>
                <h3>${kpi.title}</h3>
                <p>${kpi.detail}</p>
                <span class="weight-chip">น้ำหนัก ${kpi.weight} คะแนน</span>
              </div>
            </div>
            <div class="score-controls">
              <input class="score-range" type="range" min="20" max="100" step="5" value="${scores[index]}" aria-label="${kpi.title}">
              <div class="range-labels"><span>20</span><span>60</span><span>100</span></div>
              <input class="score-number" type="number" min="20" max="100" step="5" value="${scores[index]}" aria-label="คะแนน ${kpi.title}">
              <div class="score-meta"><span>GPA <strong data-gpa>${formatNumber(scores[index] / 20 - 1, 2)}</strong></span><span>ถ่วงน้ำหนัก <strong data-weighted>${formatNumber((scores[index] / 20 - 1) * kpi.weight, 2)}</strong></span></div>
            </div>
          </article>`).join("")}
      </div>

      <aside class="score-summary glass-card">
        <div class="employee-profile">
          <span class="avatar">${initials(person.name)}</span>
          <span><strong>${escapeHtml(person.name)}</strong><span>${MONTHS[selectedMonth]} ${selectedYear}</span></span>
        </div>
        <div class="score-ring" id="scoreRing">
          <div class="score-ring-content"><strong id="livePercentage">—</strong><span>คะแนนรวม / 100</span></div>
        </div>
        <span class="result-badge" id="liveResult">กำลังคำนวณ</span>
        <div class="summary-stats">
          <div class="summary-stat"><strong id="liveGpa">—</strong><span>GPA รวม</span></div>
          <div class="summary-stat"><strong>20</strong><span>น้ำหนักรวม</span></div>
        </div>
        <div class="field note-field">
          <label for="evaluationNote">หมายเหตุผู้ประเมิน</label>
          <textarea id="evaluationNote" maxlength="2000" placeholder="บันทึกผลงาน จุดเด่น หรือข้อเสนอแนะ...">${escapeHtml(note)}</textarea>
        </div>
        <div class="form-actions">
          <button id="saveScores" class="button button-primary" type="button"><i data-lucide="${isEditing ? "refresh-cw" : "save"}"></i>${isEditing ? "อัปเดตคะแนน" : "บันทึกคะแนน"}</button>
          <button id="clearScores" class="button button-ghost" type="button" aria-label="ล้างฟอร์ม"><i data-lucide="rotate-ccw"></i></button>
        </div>
      </aside>
    </div>
  `;

  document.getElementById("employeeSelect").addEventListener("change", (event) => {
    selectedEmployee = event.target.value;
    renderEntry();
  });
  document.getElementById("entryMonth").addEventListener("change", (event) => {
    selectedMonth = Number(event.target.value);
    els.globalMonth.value = String(selectedMonth);
    renderEntry();
  });
  document.querySelectorAll(".kpi-input-card").forEach((card) => {
    const range = card.querySelector(".score-range");
    const number = card.querySelector(".score-number");
    const sync = (source, target) => {
      const next = Math.max(20, Math.min(100, Number(source.value) || 20));
      source.value = String(next);
      target.value = String(next);
      updateLiveScore();
    };
    range.addEventListener("input", () => sync(range, number));
    number.addEventListener("input", () => sync(number, range));
  });
  document.getElementById("manageEmployees")?.addEventListener("click", openEmployeeManager);
  document.getElementById("saveScores").addEventListener("click", saveEntry);
  document.getElementById("clearScores").addEventListener("click", () => {
    document.querySelectorAll(".score-range, .score-number").forEach((input) => input.value = String(DEFAULT_SCORE));
    document.getElementById("evaluationNote").value = "";
    updateLiveScore();
  });
  updateLiveScore();
  setIcons();
}

function entryScores() {
  return [...document.querySelectorAll(".kpi-input-card .score-number")].map((input) => Number(input.value));
}

function updateLiveScore() {
  const scores = entryScores();
  const result = calculate(scores);
  document.querySelectorAll(".kpi-input-card").forEach((card, index) => {
    const score = scores[index];
    card.querySelector("[data-gpa]").textContent = formatNumber(score / 20 - 1, 2);
    card.querySelector("[data-weighted]").textContent = formatNumber((score / 20 - 1) * KPI_DEFS[index].weight, 2);
  });
  if (!result) return;
  const meta = resultMeta(result.percentage);
  document.getElementById("livePercentage").textContent = formatNumber(result.percentage);
  document.getElementById("liveGpa").textContent = formatNumber(result.gpa, 2);
  const badge = document.getElementById("liveResult");
  badge.textContent = meta.label;
  badge.className = `result-badge ${meta.className}`;
  document.getElementById("scoreRing").style.setProperty("--score-angle", `${Math.max(0, Math.min(100, result.percentage)) * 3.6}deg`);
}

async function saveEntry() {
  if (!requireDatabaseConnection()) return;
  if (!canEditScores()) {
    showToast("บัญชีนี้ไม่มีสิทธิ์บันทึกคะแนน", "shield-alert");
    return;
  }
  const scores = entryScores();
  if (!validScores(scores)) {
    showToast("กรุณากรอกคะแนนทุกหัวข้อระหว่าง 20–100 และเพิ่มทีละ 5", "triangle-alert");
    return;
  }
  const existing = getRecord(selectedEmployee, selectedMonth);
  const saveButton = document.getElementById("saveScores");
  saveButton.disabled = true;
  saveButton.innerHTML = '<i data-lucide="loader-circle"></i>กำลังบันทึก';
  setIcons();
  try {
    const saved = await window.KpiDatabase.saveEvaluation({
      employeeId: selectedEmployee,
      year: selectedYear,
      month: selectedMonth,
      scores,
      note: document.getElementById("evaluationNote").value.trim(),
      expectedVersion: Number(existing?.version) || 0,
    });
    state.records[recordKey(selectedEmployee, selectedMonth)] = {
      employeeId: saved.employee_id,
      month: Number(saved.month),
      scores: saved.scores.map(Number),
      note: saved.note || "",
      source: saved.source || "KPI Flow",
      updatedAt: saved.updated_at || new Date().toISOString(),
      version: Number(saved.version) || 1,
    };
    renderEntry();
    updateNotificationStatus();
    showToast(`${existing ? "อัปเดต" : "บันทึก"}คะแนน ${MONTHS[selectedMonth]} บน Firebase Firestore แล้ว`);
  } catch (error) {
    if (error.code === "VERSION_CONFLICT" || String(error.message).includes("VERSION_CONFLICT")) {
      showToast("ข้อมูลนี้ถูกแก้ไขจากอุปกรณ์อื่น ระบบกำลังโหลดข้อมูลล่าสุด", "refresh-cw");
      await loadDatabaseState({ preserveSelection: true, quiet: true }).catch(() => undefined);
    } else {
      showToast(`บันทึกคะแนนไม่สำเร็จ: ${error.message}`, "triangle-alert");
      saveButton.disabled = false;
      saveButton.innerHTML = '<i data-lucide="save"></i>ลองบันทึกอีกครั้ง';
      setIcons();
    }
  }
}

function renderHistory() {
  const cards = employees.map((person) => {
    const average = annualAverage(person.id);
    const values = MONTHS.map((_, month) => calculate(getRecord(person.id, month)?.scores)?.percentage);
    const completed = values.filter(Number.isFinite).length;
    const previous = previousYearScore(person.id);
    const delta = yoyDelta(average, previous);
    const meta = resultMeta(average);
    return { ...person, average, previous, delta, values, completed, meta };
  }).sort((a, b) => THAI_NAME_COLLATOR.compare(a.name, b.name));

  const selectedPeople = historyEmployee === "all"
    ? cards
    : cards.filter((person) => person.id === historyEmployee);

  els.history.innerHTML = `
    <div class="history-toolbar glass-card">
      <div class="section-heading">
        <span class="section-icon tone-violet"><i data-lucide="users"></i></span>
        <div><h3>ผลประเมินสะสมรายบุคคล</h3><p class="section-copy">เฉลี่ยเฉพาะเดือนที่มีคะแนนครบ 6 หัวข้อ</p></div>
      </div>
      <div class="field">
        <label for="historyEmployee">กรองพนักงาน</label>
        <select id="historyEmployee"><option value="all">พนักงานทุกคน</option>${employeeOptions(historyEmployee)}</select>
      </div>
    </div>

    <div class="history-grid">
      ${selectedPeople.map((person, index) => `
        <article class="person-card glass-card">
          <div class="person-card-top">
            <span class="avatar">${initials(person.name)}</span>
            <span><strong>${escapeHtml(person.name)}</strong><span>เรียงตามลำดับตัวอักษร · ${person.completed} เดือน</span></span>
          </div>
          <div class="person-score">
            <div><strong>${formatNumber(person.average)}</strong><span>คะแนนเฉลี่ย · ${person.completed} เดือน</span></div>
            <div class="mini-trend" aria-label="แนวโน้มคะแนน">${person.values.map((value) => `<i style="height:${Number.isFinite(value) ? Math.max(4, value / 100 * 34) : 4}px;opacity:${Number.isFinite(value) ? 1 : .15}"></i>`).join("")}</div>
          </div>
          <div class="yoy-inline">
            <span><small>ปี ${selectedYear - 1}</small><strong>${formatNumber(person.previous)}</strong></span>
            <span><small>ผลต่าง YoY</small><strong class="${Number.isFinite(person.delta) && person.delta >= 0 ? "delta-up" : "delta-down"}">${formatDelta(person.delta)}</strong></span>
          </div>
          <span class="result-badge ${person.meta.className}" style="margin:14px 0 0">${person.meta.label}</span>
          <button class="button button-ghost person-edit-button" type="button" data-edit-latest="${person.id}" ${person.completed ? "" : "disabled"}><i data-lucide="pencil-line"></i>${person.completed ? "แก้ไขคะแนนล่าสุด" : "ยังไม่มีคะแนน"}</button>
        </article>`).join("")}
    </div>

    <article class="panel table-panel glass-card">
      <div class="panel-heading">
        <div><h3>ตารางคะแนนรายเดือน</h3><p>คะแนนรวมเต็ม 100</p></div>
        <button class="button button-secondary" id="printHistory" type="button"><i data-lucide="printer"></i>พิมพ์รายงาน</button>
      </div>
      <div class="table-scroll">
        <table class="data-table">
          <thead><tr><th>พนักงาน</th><th class="numeric">${selectedYear - 1}</th><th class="numeric">${selectedYear} YTD</th><th class="numeric">ผลต่าง</th>${SHORT_MONTHS.map((month) => `<th class="numeric">${month}</th>`).join("")}</tr></thead>
          <tbody>${selectedPeople.map((person) => `<tr>
            <td><strong>${escapeHtml(person.name)}</strong></td>
            <td class="numeric">${formatNumber(person.previous)}</td>
            <td class="numeric"><span class="score-pill ${person.meta.className}">${formatNumber(person.average)}</span></td>
            <td class="numeric"><strong class="${Number.isFinite(person.delta) && person.delta >= 0 ? "delta-up" : "delta-down"}">${Number.isFinite(person.delta) ? `${person.delta >= 0 ? "+" : ""}${formatNumber(person.delta)}` : "—"}</strong></td>
            ${person.values.map((value, month) => `<td class="numeric">${Number.isFinite(value) ? `<button class="score-cell-button" type="button" data-edit-score="${person.id}" data-edit-month="${month}" aria-label="แก้ไขคะแนน ${MONTHS[month]} ของ ${escapeHtml(person.name)}">${formatNumber(value)}<i data-lucide="pencil"></i></button>` : "—"}</td>`).join("")}
          </tr>`).join("")}</tbody>
        </table>
      </div>
    </article>
  `;

  document.getElementById("historyEmployee").addEventListener("change", (event) => {
    historyEmployee = event.target.value;
    renderHistory();
  });
  document.querySelectorAll("[data-edit-latest]").forEach((button) => {
    button.addEventListener("click", () => openScoreEditor(button.dataset.editLatest));
  });
  document.querySelectorAll("[data-edit-score]").forEach((button) => {
    button.addEventListener("click", () => openScoreEditor(button.dataset.editScore, Number(button.dataset.editMonth)));
  });
  document.getElementById("printHistory").addEventListener("click", () => window.print());
  setIcons();
}

function closeResetDialog() {
  document.getElementById("resetPasswordModal")?.remove();
}

async function resetAllData() {
  if (!requireDatabaseConnection()) return;
  if (!isAdmin()) {
    showToast("เฉพาะผู้ดูแลระบบเท่านั้นที่รีเซ็ตข้อมูลได้", "shield-alert");
    return;
  }
  setDatabaseStatus("syncing", "กำลังรีเซ็ตฐานข้อมูล Firebase Firestore");
  try {
    await window.KpiDatabase.resetDatabase(createInitialState());
    await loadDatabaseState({ quiet: true });
    closeResetDialog();
    renderReports();
    showToast("รีเซ็ตฐานข้อมูล Firebase Firestore เรียบร้อยแล้ว");
  } catch (error) {
    setDatabaseStatus("error", error.message);
    showToast(`รีเซ็ตข้อมูลไม่สำเร็จ: ${error.message}`, "triangle-alert");
  }
}

function openResetDialog() {
  if (!requireDatabaseConnection()) return;
  if (!isAdmin()) {
    showToast("เฉพาะผู้ดูแลระบบเท่านั้นที่รีเซ็ตข้อมูลได้", "shield-alert");
    return;
  }
  closeResetDialog();
  const modal = document.createElement("div");
  modal.id = "resetPasswordModal";
  modal.className = "modal-backdrop";
  modal.innerHTML = `
    <section class="employee-modal reset-modal glass-card" role="dialog" aria-modal="true" aria-labelledby="resetDialogTitle">
      <div class="modal-heading">
        <div><p class="eyebrow">ADMIN CONFIRMATION</p><h2 id="resetDialogTitle">ยืนยันก่อนรีเซ็ตข้อมูล</h2></div>
        <button class="icon-button" type="button" data-close-reset aria-label="ปิด"><i data-lucide="x"></i></button>
      </div>
      <p class="reset-warning"><i data-lucide="triangle-alert"></i>การรีเซ็ตจะลบข้อมูลทุกปีและกลับไปใช้ข้อมูลตั้งต้นจาก Excel</p>
      <form id="resetPasswordForm">
        <div class="field password-field">
          <label for="resetConfirmation">พิมพ์คำว่า RESET เพื่อยืนยัน</label>
          <input id="resetConfirmation" autocomplete="off" placeholder="RESET" required>
        </div>
        <p id="resetPasswordError" class="form-error" hidden>กรุณาพิมพ์ RESET ให้ถูกต้อง</p>
        <button class="button button-danger" type="submit"><i data-lucide="rotate-ccw"></i>ยืนยันรีเซ็ตข้อมูล</button>
      </form>
      <p class="modal-note"><i data-lucide="shield-check"></i>Firebase Firestore ตรวจสิทธิ์ Admin ที่ฐานข้อมูลอีกครั้งก่อนดำเนินการ</p>
    </section>`;
  document.body.appendChild(modal);
  modal.querySelector("[data-close-reset]").addEventListener("click", closeResetDialog);
  modal.addEventListener("click", (event) => { if (event.target === modal) closeResetDialog(); });
  modal.querySelector("#resetPasswordForm").addEventListener("submit", async (event) => {
    event.preventDefault();
    const input = modal.querySelector("#resetConfirmation");
    const error = modal.querySelector("#resetPasswordError");
    if (input.value.trim().toUpperCase() !== "RESET") {
      error.hidden = false;
      input.select();
      return;
    }
    error.hidden = true;
    if (window.confirm("ยืนยันลบข้อมูลทุกปีและกลับเป็นข้อมูลตั้งต้น?")) await resetAllData();
  });
  modal.querySelector("#resetConfirmation").focus();
  setIcons();
}

function exportYearOptions() {
  return `<option value="${selectedYear}">ปี ${selectedYear}</option>` +
    state.years
      .filter((year) => Number(year) !== selectedYear)
      .sort((a, b) => a - b)
      .map((year) => `<option value="${year}">ปี ${year}</option>`)
      .join("") +
    '<option value="all">ทุกปี</option>';
}

function exportMonthOptions(selectedMonthIndex) {
  return MONTHS.map((month, index) =>
    `<option value="${index}" ${index === selectedMonthIndex ? "selected" : ""}>${month}</option>`
  ).join("");
}

function legacyMigrationPanel() {
  const summary = legacyStateSummary();
  if (!summary || !isAdmin()) return "";
  const canMigrate = databaseStatus === "connected";
  return `<div class="notice-panel legacy-migration-panel glass-card">
    <i data-lucide="archive-restore"></i>
    <div><strong>พบข้อมูลเดิมในเบราว์เซอร์</strong>
      <span>พนักงาน ${summary.employees} คน · รายการคะแนน ${summary.records} รายการ · ${summary.years} ปี ข้อมูลนี้จะยังไม่ถูกลบจนกว่า Firebase Firestore จะยืนยันสำเร็จ</span>
    </div>
    <button class="button button-primary" id="migrateLegacyData" type="button" ${canMigrate ? "" : "disabled"}><i data-lucide="cloud-upload"></i>ย้ายข้อมูลเดิมเข้า Firebase Firestore</button>
  </div>`;
}

function googleConnectionCard() {
  const meta = databaseStatusMeta();
  return `<article class="report-card glass-card database-card">
    <span class="report-icon tone-blue"><i data-lucide="database-zap"></i></span>
    <h3>Firebase Firestore Database</h3>
    <p id="databaseSyncMessage">${escapeHtml(databaseMessage)}</p>
    <div class="database-card-actions">
      <span id="databaseSyncBadge" class="sync-badge ${meta.className}"><span></span>${meta.label}</span>
      <button class="button button-secondary" id="reloadDatabase" type="button" ${databaseStatus === "syncing" ? "disabled" : ""}><i data-lucide="refresh-cw"></i>โหลดข้อมูลล่าสุด</button>
    </div>
  </article>`;
}

function renderReports() {
  const recordCount = Object.values(state.records).filter((record) => validScores(record.scores)).length;
  const databaseReady = databaseStatus === "connected";
  const connectionCard = googleConnectionCard();
  const databaseNotice = databaseReady
    ? `ข้อมูลพนักงาน คะแนน และประวัติอ่านจาก Firebase Firestore โดยบันทึกเฉพาะรายการที่เปลี่ยน ปัจจุบันมีรายการประเมินสมบูรณ์ ${recordCount} รายการ`
    : databaseMessage;
  els.reports.innerHTML = `
    <div class="report-grid">
      <article class="report-card export-range-card glass-card">
        <span class="report-icon tone-teal"><i data-lucide="file-spreadsheet"></i></span>
        <h3>ส่งออก CSV ตามช่วงเดือน</h3>
        <p>เลือกปี เดือนเริ่มต้น และเดือนสิ้นสุดก่อนดาวน์โหลดไปใช้ใน Excel หรือ Google Sheets</p>
        <div class="export-filter-grid">
          <label>ปี<select id="exportYear">${exportYearOptions()}</select></label>
          <label>ตั้งแต่<select id="exportStartMonth">${exportMonthOptions(0)}</select></label>
          <label>ถึง<select id="exportEndMonth">${exportMonthOptions(selectedMonth)}</select></label>
        </div>
        <button class="button button-secondary" id="exportCsv" type="button" ${databaseReady ? "" : "disabled"}><i data-lucide="file-down"></i>ดาวน์โหลด CSV</button>
      </article>
      ${connectionCard}
    </div>

    ${legacyMigrationPanel()}

    <div class="notice-panel glass-card">
      <i data-lucide="${databaseReady ? "shield-check" : "cloud-off"}"></i>
      <div><strong>${databaseReady ? "เชื่อมต่อ Firebase Authentication และ Security Rules แล้ว" : "การเชื่อมต่อฐานข้อมูลขัดข้อง"}</strong><span>${escapeHtml(databaseNotice)}</span></div>
    </div>

    <div class="notice-panel glass-card">
      <i data-lucide="git-compare-arrows"></i>
      <div><strong>ฐานเปรียบเทียบปี ${selectedYear - 1}</strong><span>${selectedYear === 2569 ? "ปีแรกใช้คะแนนย้อนหลังจาก Excel จำนวน 10 คน" : `ใช้ค่าเฉลี่ยสะสมของปี ${selectedYear - 1} เป็นฐานอัตโนมัติ`} รายการที่ไม่มีข้อมูลจะไม่ถูกนำไปเฉลี่ย</span></div>
    </div>

    <article class="formula-card glass-card">
      <div class="section-heading">
        <span class="section-icon tone-teal"><i data-lucide="calculator"></i></span>
        <div><h3>หลักการคำนวณที่ถอดจากไฟล์ Excel</h3><p class="section-copy">รักษาน้ำหนักและสูตรเดิม พร้อมแก้การเฉลี่ยเดือนว่างให้ถูกต้อง</p></div>
      </div>
      <div class="formula-flow">
        <div class="formula-step"><strong>1 · คะแนนดิบ</strong><span>กรอก 20–100 เพิ่มทีละ 5</span></div>
        <div class="formula-step"><strong>2 · แปลง GPA</strong><span>คะแนน ÷ 20 − 1</span></div>
        <div class="formula-step"><strong>3 · ถ่วงน้ำหนัก</strong><span>GPA × น้ำหนัก รวม 20</span></div>
        <div class="formula-step"><strong>4 · คะแนนรวม</strong><span>GPA รวม × 25 = ร้อยละ</span></div>
      </div>
    </article>

    ${isAdmin() ? `<div class="notice-panel glass-card">
      <i data-lucide="triangle-alert"></i>
      <div><strong>เริ่มใหม่จากไฟล์ต้นฉบับ</strong><span>เฉพาะ Admin เท่านั้น การรีเซ็ตทำเป็นชุดคำสั่งที่จำกัดสิทธิ์และบันทึก Audit Log</span></div>
      <button class="button button-danger" id="resetData" type="button" ${databaseReady ? "" : "disabled"}><i data-lucide="rotate-ccw"></i>รีเซ็ตข้อมูล</button>
    </div>` : ""}
  `;

  document.getElementById("exportCsv")?.addEventListener("click", exportCsv);
  document.getElementById("resetData")?.addEventListener("click", openResetDialog);
  document.getElementById("migrateLegacyData")?.addEventListener("click", migrateLegacyDataToFirebase);
  document.getElementById("reloadDatabase")?.addEventListener("click", pullFirebaseState);
  updateDatabaseStatusElement();
  setIcons();
}

function reportCard(icon, tone, title, copy, id, buttonText) {
  return `<article class="report-card glass-card">
    <span class="report-icon ${tone}"><i data-lucide="${icon}"></i></span>
    <h3>${title}</h3><p>${copy}</p>
    <button class="button button-secondary" id="${id}" type="button"><i data-lucide="${icon}"></i>${buttonText}</button>
  </article>`;
}

function exportCsv() {
  if (!requireDatabaseConnection()) return;
  const yearValue = document.getElementById("exportYear").value;
  const startMonth = Number(document.getElementById("exportStartMonth").value);
  const endMonth = Number(document.getElementById("exportEndMonth").value);
  if (!Number.isInteger(startMonth) || !Number.isInteger(endMonth) || startMonth > endMonth) {
    showToast("เดือนเริ่มต้นต้องไม่เกินเดือนสิ้นสุด", "triangle-alert");
    return;
  }

  const exportYears = yearValue === "all"
    ? [...state.years].map(Number).sort((a, b) => a - b)
    : [Number(yearValue)];
  const header = ["ปี", "เดือน", "พนักงาน", "คะแนนปีก่อน", "ค่าเฉลี่ยสะสมปีปัจจุบัน", "ผลต่าง YoY", ...KPI_DEFS.map((item) => item.title), "GPA รวม", "คะแนนรวม", "ผลประเมิน", "หมายเหตุ"];
  const rows = [header];

  exportYears.forEach((year) => {
    employees.forEach((person) => {
      const previous = previousYearScoreForYear(person.id, year);
      const currentYtd = annualAverageForYear(person.id, year);
      const delta = yoyDelta(currentYtd, previous);
      for (let month = startMonth; month <= endMonth; month += 1) {
        const record = getRecordForYear(person.id, month, year);
        const result = calculate(record?.scores);
        if (!result) continue;
        rows.push([
          year,
          MONTHS[month],
          person.name,
          Number.isFinite(previous) ? previous.toFixed(2) : "",
          Number.isFinite(currentYtd) ? currentYtd.toFixed(2) : "",
          Number.isFinite(delta) ? delta.toFixed(2) : "",
          ...record.scores,
          result.gpa.toFixed(2),
          result.percentage.toFixed(2),
          resultMeta(result.percentage).label,
          record.note || "",
        ]);
      }
    });
  });

  if (rows.length === 1) {
    showToast("ไม่พบคะแนนในปีและช่วงเดือนที่เลือก", "search-x");
    return;
  }

  const csv = "\uFEFF" + rows.map((row) => row.map(csvCell).join(",")).join("\r\n");
  const yearLabel = yearValue === "all" ? "all-years" : yearValue;
  const filename = `kpi-flow-${yearLabel}-month-${String(startMonth + 1).padStart(2, "0")}-to-${String(endMonth + 1).padStart(2, "0")}.csv`;
  downloadBlob(new Blob([csv], { type: "text/csv;charset=utf-8" }), filename);
  showToast(`ดาวน์โหลด CSV เดือน${MONTHS[startMonth]}–${MONTHS[endMonth]}แล้ว`);
}

function csvCell(value) {
  let text = String(value ?? "");
  if (/^[=+\-@]/.test(text)) text = `'${text}`;
  return /[",\r\n]/.test(text) ? `"${text.replaceAll('"', '""')}"` : text;
}



function downloadBlob(blob, filename) {
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = filename;
  link.click();
  URL.revokeObjectURL(url);
}



function escapeHtml(value) {
  return String(value ?? "")
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#039;");
}

function showToast(message, icon = "circle-check-big") {
  const toast = document.createElement("div");
  toast.className = "toast";
  toast.innerHTML = `<i data-lucide="${icon}"></i><span>${escapeHtml(message)}</span>`;
  els.toast.appendChild(toast);
  setIcons();
  window.setTimeout(() => toast.remove(), 3600);
}

function switchView(view) {
  if (!currentUser || databaseStatus !== "connected") {
    showToast("กรุณาเข้าสู่ระบบและรอให้โหลดฐานข้อมูลเสร็จก่อน", "cloud-off");
    return;
  }
  if (view === "entry" && !canEditScores()) {
    showToast("บัญชีนี้มีสิทธิ์ดูรายงานเท่านั้น", "shield-alert");
    view = "dashboard";
  }
  currentView = view;
  const titleMap = {
    dashboard: "ภาพรวม KPI",
    entry: "บันทึกคะแนนพนักงาน",
    history: "ประวัติและผลงานรายบุคคล",
    reports: "รายงานและฐานข้อมูล",
  };
  els.pageTitle.textContent = titleMap[view];
  document.querySelectorAll(".view").forEach((section) => section.classList.remove("active"));
  document.getElementById(`${view}View`).classList.add("active");
  document.querySelectorAll("[data-view]").forEach((button) => {
    button.classList.toggle("active", button.dataset.view === view);
  });
  if (view === "dashboard") renderDashboard();
  if (view === "entry") renderEntry();
  if (view === "history") renderHistory();
  if (view === "reports") renderReports();
  window.location.hash = view;
  window.scrollTo({ top: 0, behavior: "smooth" });
}

function init() {
  refreshDateControls();
  els.globalYear.addEventListener("change", (event) => switchEvaluationYear(event.target.value));
  els.globalMonth.addEventListener("change", (event) => {
    selectedMonth = Number(event.target.value);
    updateNotificationStatus();
    if (currentView === "dashboard") renderDashboard();
    if (currentView === "entry") renderEntry();
  });
  document.querySelectorAll("[data-view]").forEach((button) => {
    button.addEventListener("click", () => switchView(button.dataset.view));
  });
  document.getElementById("notificationsButton").addEventListener("click", () => {
    const missing = employees.length - monthlyResults(selectedMonth).length;
    showToast(missing > 0 ? `เดือนนี้ยังขาดผลประเมิน ${missing} คน` : "บันทึกคะแนนครบทุกคนแล้ว", missing > 0 ? "bell-ring" : "circle-check-big");
  });
  document.addEventListener("keydown", (event) => {
    if (event.key === "Escape") {
      closeEmployeeManager();
      closeResetDialog();
    }
  });
  window.addEventListener("resize", () => {
    if (currentView === "dashboard") drawTrendChart();
  });

  const hashView = window.location.hash.replace("#", "");
  const requestedView = ["dashboard", "entry", "history", "reports"].includes(hashView) ? hashView : "dashboard";
  const initialView = requestedView === "entry" && !canEditScores() ? "dashboard" : requestedView;
  updateNotificationStatus();
  switchView(initialView);
}

window.addEventListener("DOMContentLoaded", boot);
