"use strict";

const VIEW_TITLES = Object.freeze({
  dashboard: "ภาพรวมระบบ",
  employees: "ฐานข้อมูลพนักงานกลาง",
  service: "Service Incentive",
  performance: "Performance Summary",
  workday: "Workday Insight",
  monthly: "Monthly Performance",
  closing: "ศูนย์ปิดรอบเดือน",
  system: "ระบบและสำรองข้อมูล",
});

const MONTHLY_ALL_EMPLOYEES_ID = "__ALL_ACTIVE_EMPLOYEES__";
const MONTHLY_SCORE_OPTIONS = Object.freeze(Array.from({ length: 15 }, (_, index) => Number((-0.5 + index * 0.25).toFixed(2))));
const MONTHLY_CRITERIA = Object.freeze([
  { id: "C1", name: "ความสามารถในการปฏิบัติงาน", normalScore: 1.00, minPercent: 50, rankEnabled: true },
  { id: "C2", name: "คุณภาพของงาน", normalScore: 1.00, minPercent: 50, rankEnabled: true },
  { id: "C3", name: "ความรับผิดชอบต่องานที่ได้รับมอบหมาย", normalScore: 1.00, minPercent: 50, rankEnabled: true },
  { id: "C4", name: "ความพยายามอุตสาหะในการทำงาน", normalScore: 1.00, minPercent: 50, rankEnabled: true },
  { id: "C5", name: "การเคารพกฎระเบียบของบริษัท", normalScore: 1.50, minPercent: 66.70, rankEnabled: false },
]);
const MONTHLY_STATUSES = Object.freeze([
  { id: "WORK", name: "ทำงาน", countsAsWork: true },
  { id: "WEEKEND_WORK", name: "ทำงานวันหยุด", countsAsWork: true },
  { id: "SICK_LEAVE", name: "ลาป่วย", countsAsWork: false },
  { id: "PERSONAL_LEAVE", name: "ลากิจ", countsAsWork: false },
  { id: "VACATION", name: "พักร้อน", countsAsWork: false },
  { id: "COMP_OFF", name: "ชดเชย", countsAsWork: false },
  { id: "HOLIDAY", name: "วันหยุด", countsAsWork: false },
]);
const MONTHLY_STATUS_MAP = Object.freeze(Object.fromEntries(MONTHLY_STATUSES.map((status) => [status.id, status])));

const PERFORMANCE_MONTHS = Object.freeze(["มกราคม", "กุมภาพันธ์", "มีนาคม", "เมษายน", "พฤษภาคม", "มิถุนายน", "กรกฎาคม", "สิงหาคม", "กันยายน", "ตุลาคม", "พฤศจิกายน", "ธันวาคม"]);
const PERFORMANCE_SHORT_MONTHS = Object.freeze(["ม.ค.", "ก.พ.", "มี.ค.", "เม.ย.", "พ.ค.", "มิ.ย.", "ก.ค.", "ส.ค.", "ก.ย.", "ต.ค.", "พ.ย.", "ธ.ค."]);
const PERFORMANCE_KPIS = Object.freeze([
  { id: "capability", title: "ความสามารถในการปฏิบัติงาน", weight: 5, icon: "briefcase-business" },
  { id: "quality", title: "คุณภาพของงาน", weight: 4, icon: "badge-check" },
  { id: "responsibility", title: "ความรับผิดชอบต่อหน้าที่", weight: 3, icon: "handshake" },
  { id: "effort", title: "ความพยายามอุตสาหะ", weight: 3, icon: "rocket" },
  { id: "punctuality", title: "ความตรงต่อเวลา", weight: 3, icon: "clock-3" },
  { id: "discipline", title: "การเคารพกฎระเบียบบริษัท", weight: 2, icon: "shield-check" },
]);
const PERFORMANCE_DEFAULT_SCORE = 60;
const PERFORMANCE_GPA_INCENTIVE_BANDS = Object.freeze([
  { min: 3.80, max: 4.00, amount: 3000, label: "3.80–4.00" },
  { min: 3.60, max: 3.79, amount: 2000, label: "3.60–3.79" },
  { min: 3.40, max: 3.59, amount: 1500, label: "3.40–3.59" },
  { min: 3.10, max: 3.39, amount: 1000, label: "3.10–3.39" },
  { min: 2.80, max: 3.09, amount: 750, label: "2.80–3.09" },
  { min: 2.50, max: 2.79, amount: 500, label: "2.50–2.79" },
  { min: 2.00, max: 2.49, amount: 0, label: "2.00–2.49" },
  { min: 1.00, max: 1.99, amount: -1000, label: "1.00–1.99" },
  { min: 0.50, max: 0.99, amount: -2000, label: "0.50–0.99" },
]);

// ข้อมูลย้อนหลังปี 2568 จากไฟล์ต้นฉบับมีเฉพาะคะแนนเฉลี่ยประจำปีรายบุคคล
// ไม่พบคะแนนรายเดือนหรือคะแนนแยก 6 หัวข้อ จึงแสดงแบบ Read-only โดยไม่สร้างข้อมูลขึ้นใหม่
const PERFORMANCE_LEGACY_ANNUAL_YEAR = 2568;
const PERFORMANCE_LEGACY_ANNUAL_SOURCE = "Excel: สรุปแบบประเมินปี 69.xlsx · ชีต รายบุคคล";
const PERFORMANCE_LEGACY_ANNUAL_SCORES = Object.freeze({
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
});

const state = {
  user: null,
  profile: null,
  currentView: "dashboard",
  loading: false,
  employees: [],
  incentives: [],
  evaluationSummary: { count: 0, years: [], latestUpdatedAt: "" },
  performanceSettings: { activeYear: new Date().getFullYear() + 543, years: [new Date().getFullYear() + 543], updatedAt: "" },
  performanceEvaluations: [],
  performanceDataKey: "",
  performanceLoading: false,
  performanceTab: "dashboard",
  performanceSyncData: null,
  performanceSyncLoading: false,
  performanceSyncKey: "",
  performanceIncentiveData: null,
  performanceIncentiveLoading: false,
  performanceIncentiveKey: "",
  performanceManualOverride: false,
  performanceYear: new Date().getFullYear() + 543,
  performanceMonth: new Date().getMonth(),
  performanceEmployeeId: "",
  performanceHistoryEmployeeId: "all",
  employee360Month: currentYearMonth(),
  employee360EmployeeId: "",
  employee360Data: null,
  employee360Loading: false,
  migrationStatus: null,
  serviceMonth: "",
  serviceEmployeeId: "",
  employeeSearch: "",
  attendanceMonthly: [],
  leaveRecords: [],
  workdaySettings: null,
  workdayDataKey: "",
  workdayLoading: false,
  workdayTab: "attendance",
  workdayMonth: "",
  workdayYear: new Date().getFullYear(),
  attendanceEmployeeId: "",
  leaveEmployeeId: "",
  leaveTypeFilter: "",
  leaveEditingId: "",
  monthlyEntries: [],
  monthlyOverrides: [],
  monthlyStatus: { status: "OPEN" },
  monthlyDataKey: "",
  monthlyLoading: false,
  monthlyTab: "summary",
  monthlyMonth: new Date().toISOString().slice(0, 7),
  monthlyEmployeeId: "",
  monthlyDate: "",
  monthlyEntryStatus: "WORK",
  monthlyEditingId: "",
  monthlyHistoryEmployeeId: "",
  monthlyHistoryDate: "",
  closingMonth: currentYearMonth(),
  closingData: null,
  closingDataKey: "",
  closingLoading: false,
  systemSnapshot: null,
  systemHealth: null,
  systemLoading: false,
  systemLastBackup: null,
};

const els = {};

function cacheElements() {
  [
    "authGate", "authMessage", "loginForm", "loginEmail", "loginPassword", "loginButton", "authConfigHelp",
    "appShell", "mobileNav", "pageTitle", "databaseStatusDot", "databaseStatusLabel", "accountName", "accountRole",
    "logoutButton", "refreshButton", "syncBadge", "dashboardView", "employeesView", "serviceView", "performanceView",
    "workdayView", "monthlyView", "closingView", "systemView", "modalRoot", "toastRegion",
  ].forEach((id) => { els[id] = document.getElementById(id); });
}

function escapeHtml(value) {
  return String(value ?? "")
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#039;");
}

function formatMoney(value) {
  return new Intl.NumberFormat("th-TH", { minimumFractionDigits: 0, maximumFractionDigits: 2 }).format(Number(value) || 0);
}

function formatDate(value) {
  if (!value) return "-";
  const parsed = new Date(value);
  if (Number.isNaN(parsed.getTime())) return String(value);
  return new Intl.DateTimeFormat("th-TH", { dateStyle: "medium", timeStyle: "short" }).format(parsed);
}

function formatDateOnly(value) {
  if (!value) return "-";
  const parsed = new Date(`${String(value).slice(0, 10)}T00:00:00`);
  if (Number.isNaN(parsed.getTime())) return String(value);
  return new Intl.DateTimeFormat("th-TH", { dateStyle: "medium" }).format(parsed);
}

function formatNumber(value, maximumFractionDigits = 1) {
  return new Intl.NumberFormat("th-TH", { maximumFractionDigits }).format(Number(value) || 0);
}

function currentYearMonth() {
  const now = new Date();
  return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}`;
}

function employeeMap() {
  return new Map(state.employees.map((employee) => [employee.id, employee]));
}

function activeEmployees() {
  return state.employees.filter((employee) => employee.isActive);
}

function nextEmployeeCode() {
  const max = state.employees.reduce((highest, employee) => {
    const match = /^EMP(\d+)$/i.exec(String(employee.employeeCode || ""));
    return match ? Math.max(highest, Number(match[1])) : highest;
  }, 0);
  return `EMP${String(max + 1).padStart(3, "0")}`;
}

function nextEmployeeSortOrder() {
  return state.employees.reduce((highest, employee) => Math.max(highest, Number(employee.sortOrder) || 0), 0) + 1;
}

function getLatestIncentiveMonth() {
  return state.incentives.map((record) => record.yearMonth).filter(Boolean).sort().at(-1) || currentYearMonth();
}

function recordsForMonth(yearMonth) {
  return state.incentives.filter((record) => record.yearMonth === yearMonth);
}

function sumRecords(records) {
  return records.reduce((total, record) => ({
    salesAmount: total.salesAmount + record.salesAmount,
    evaluationAmount: total.evaluationAmount + record.evaluationAmount,
    timeAmount: total.timeAmount + record.timeAmount,
    totalAmount: total.totalAmount + record.totalAmount,
  }), { salesAmount: 0, evaluationAmount: 0, timeAmount: 0, totalAmount: 0 });
}

function ensureIcons() {
  if (window.lucide) window.lucide.createIcons({ attrs: { "stroke-width": 1.9 } });
}

function setSyncStatus(status, label) {
  const classes = ["status-online", "status-syncing", "status-offline", "status-error"];
  els.databaseStatusDot.classList.remove(...classes);
  els.databaseStatusDot.classList.add(`status-${status}`);
  els.databaseStatusLabel.textContent = label;
  const badgeDot = els.syncBadge.querySelector(".status-dot");
  badgeDot.classList.remove(...classes);
  badgeDot.classList.add(`status-${status}`);
  els.syncBadge.querySelector("span:last-child").textContent = label;
}

function setBusy(isBusy, label = "กำลังโหลดข้อมูล") {
  state.loading = isBusy;
  els.refreshButton.disabled = isBusy;
  els.refreshButton.querySelector("svg")?.classList.toggle("spin", isBusy);
  setSyncStatus(isBusy ? "syncing" : "online", isBusy ? label : "เชื่อมต่อแล้ว");
}

function showToast(message, type = "success", timeout = 4200) {
  const toast = document.createElement("div");
  toast.className = `toast toast-${type}`;
  const icon = type === "error" ? "circle-alert" : type === "warning" ? "triangle-alert" : "circle-check";
  toast.innerHTML = `<i data-lucide="${icon}"></i><div>${escapeHtml(message)}</div>`;
  els.toastRegion.appendChild(toast);
  ensureIcons();
  window.setTimeout(() => toast.remove(), timeout);
}

function showAuthMessage(message, isError = false) {
  els.authMessage.textContent = message;
  els.authMessage.style.color = isError ? "var(--danger)" : "var(--muted)";
}

function setVisibleApp(isVisible) {
  els.authGate.hidden = isVisible;
  els.appShell.hidden = !isVisible;
  els.mobileNav.hidden = !isVisible;
}

function showView(viewName) {
  if (!VIEW_TITLES[viewName]) return;
  state.currentView = viewName;
  els.pageTitle.textContent = VIEW_TITLES[viewName];
  document.querySelectorAll(".view").forEach((view) => view.classList.remove("active"));
  document.getElementById(`${viewName}View`)?.classList.add("active");
  document.querySelectorAll("[data-view]").forEach((button) => button.classList.toggle("active", button.dataset.view === viewName));
  window.location.hash = viewName;
  renderCurrentView();
  if (viewName === "performance") void refreshPerformanceData().then(() => {
    if (state.performanceTab === "sync" && !isLegacyAnnualPerformanceYear()) void refreshPerformanceSyncData();
    if (state.performanceTab === "incentive" && !isLegacyAnnualPerformanceYear()) void refreshPerformanceIncentiveData();
    if (state.performanceTab === "employee360" && !state.employee360Data) void refreshEmployee360Data();
  });
  if (viewName === "workday") void refreshWorkdayData();
  if (viewName === "monthly") void refreshMonthlyData();
  if (viewName === "closing") void refreshClosingData({ force: true, quiet: true });
  if (viewName === "system") void refreshSystemHealth({ quiet: true });
  window.scrollTo({ top: 0, behavior: "smooth" });
}

async function refreshData({ quiet = false } = {}) {
  if (!state.user) return;
  if (!quiet) setBusy(true);
  try {
    const snapshot = await window.EmployeeHubDatabase.loadHubSnapshot("");
    state.employees = snapshot.employees;
    state.incentives = snapshot.incentives;
    state.evaluationSummary = snapshot.evaluationSummary;
    state.migrationStatus = snapshot.migrationStatus;
    if (!state.performanceYear) state.performanceYear = snapshot.evaluationSummary.years.at(-1) || new Date().getFullYear() + 543;
    if (!state.performanceEmployeeId) state.performanceEmployeeId = snapshot.employees.find((employee) => employee.isActive)?.id || "";
    if (!state.employee360EmployeeId) state.employee360EmployeeId = snapshot.employees.find((employee) => employee.isActive)?.id || "";
    if (!state.serviceMonth) state.serviceMonth = getLatestIncentiveMonth();
    if (!state.workdayMonth) {
      state.workdayMonth = state.serviceMonth || currentYearMonth();
      state.workdayYear = Number(state.workdayMonth.slice(0, 4)) || new Date().getFullYear();
    }
    setSyncStatus("online", "เชื่อมต่อแล้ว");
    renderCurrentView();
    if (state.currentView === "workday") await refreshWorkdayData({ quiet: true });
  } catch (error) {
    console.error(error);
    setSyncStatus("error", "โหลดข้อมูลไม่สำเร็จ");
    if (!quiet) showToast(error.message || "โหลดข้อมูลไม่สำเร็จ", "error");
  } finally {
    state.loading = false;
    els.refreshButton.disabled = false;
  }
}

function renderCurrentView() {
  const renderers = {
    dashboard: renderDashboard,
    employees: renderEmployees,
    service: renderService,
    performance: renderPerformance,
    workday: renderWorkday,
    monthly: renderMonthly,
    closing: renderClosing,
    system: renderSystem,
  };
  renderers[state.currentView]?.();
  ensureIcons();
}

function moduleCard({ icon, title, description, status, statusClass, view }) {
  return `
    <article class="module-card">
      <div class="module-card-top">
        <span class="module-icon"><i data-lucide="${icon}"></i></span>
        <span class="badge ${statusClass}">${escapeHtml(status)}</span>
      </div>
      <div><h3>${escapeHtml(title)}</h3><p>${escapeHtml(description)}</p></div>
      <button class="button button-ghost button-small" data-view="${view}" type="button">เปิดโมดูล <i data-lucide="arrow-right"></i></button>
    </article>`;
}

function renderDashboard() {
  const month = state.serviceMonth || getLatestIncentiveMonth();
  const monthRecords = recordsForMonth(month);
  const totals = sumRecords(monthRecords);
  const activeCount = activeEmployees().length;
  const workdayReady = Boolean(state.migrationStatus?.workdayMigrationId);
  const workdayCounts = state.migrationStatus?.workdayCounts || {};
  const employeesById = employeeMap();
  const topRows = [...monthRecords]
    .sort((a, b) => b.totalAmount - a.totalAmount)
    .slice(0, 5);
  const maxTop = Math.max(1, ...topRows.map((row) => Math.abs(row.totalAmount)));

  els.dashboardView.innerHTML = `
    <div class="page-grid">
      <div class="kpi-grid">
        <article class="kpi-card">
          <div class="kpi-head"><span>พนักงานใช้งาน</span><span class="kpi-icon"><i data-lucide="users-round"></i></span></div>
          <div class="kpi-value">${activeCount}</div><div class="kpi-note">จากฐานข้อมูลกลางทั้งหมด ${state.employees.length} คน</div>
        </article>
        <article class="kpi-card">
          <div class="kpi-head"><span>Service Incentive ${escapeHtml(month)}</span><span class="kpi-icon"><i data-lucide="badge-dollar-sign"></i></span></div>
          <div class="kpi-value ${totals.totalAmount < 0 ? "negative" : ""}">${formatMoney(totals.totalAmount)}</div><div class="kpi-note">${monthRecords.length} รายการ</div>
        </article>
        <article class="kpi-card">
          <div class="kpi-head"><span>Performance Summary</span><span class="kpi-icon"><i data-lucide="chart-no-axes-combined"></i></span></div>
          <div class="kpi-value">${state.evaluationSummary.count}</div><div class="kpi-note">ข้อมูลประเมินใน Firestore</div>
        </article>
        <article class="kpi-card">
          <div class="kpi-head"><span>Workday Insight</span><span class="kpi-icon"><i data-lucide="calendar-clock"></i></span></div>
          <div class="kpi-value">${workdayReady ? (Number(workdayCounts.attendanceMonthly) || 0) + (Number(workdayCounts.leaveRecords) || 0) : "รอ"}</div><div class="kpi-note">${workdayReady ? `เวลา ${Number(workdayCounts.attendanceMonthly) || 0} · วันลา ${Number(workdayCounts.leaveRecords) || 0}` : "ยังไม่มีข้อมูล"}</div>
        </article>
      </div>

      <div class="module-grid">
        ${moduleCard({ icon: "users-round", title: "Employee Master", description: "รายชื่อ รหัสพนักงาน วันที่เริ่มงาน และ Legacy IDs", status: state.employees.length ? "เชื่อมต่อแล้ว" : "ยังไม่มีข้อมูล", statusClass: state.employees.length ? "badge-ready" : "badge-progress", view: "employees" })}
        ${moduleCard({ icon: "badge-dollar-sign", title: "Service Incentive", description: "บันทึกยอดขาย ประเมิน เวลา และยอดรวมรายเดือน", status: state.incentives.length ? "ใช้งานได้" : "ยังไม่มีข้อมูล", statusClass: state.incentives.length ? "badge-ready" : "badge-progress", view: "service" })}
        ${moduleCard({ icon: "chart-no-axes-combined", title: "Performance Summary", description: "บันทึกคะแนน KPI ประวัติ รายงาน และ Employee 360° ใน Web เดียว", status: "ใช้งานได้", statusClass: "badge-ready", view: "performance" })}
        ${moduleCard({ icon: "calendar-clock", title: "Workday Insight", description: "เวลาสายรายเดือน วันลา และสรุปสิทธิ์", status: workdayReady ? "ใช้งานได้" : "ยังไม่มีข้อมูล", statusClass: workdayReady ? "badge-ready" : "badge-progress", view: "workday" })}
        ${moduleCard({ icon: "clipboard-check", title: "Monthly Performance", description: "คะแนนรายวัน สถานะการทำงาน วันทำงานจริง และการปิดเดือน", status: state.migrationStatus?.monthlyPerformanceMigrationId ? "ใช้งานได้" : "ยังไม่มีข้อมูล", statusClass: state.migrationStatus?.monthlyPerformanceMigrationId ? "badge-ready" : "badge-progress", view: "monthly" })}
        ${moduleCard({ icon: "calendar-check-2", title: "ศูนย์ปิดรอบเดือน", description: "ตรวจ Workday, Monthly, Score Sync, GPA → เงินประเมิน และ Service Incentive ในหน้าเดียว", status: "พร้อมตรวจ", statusClass: "badge-ready", view: "closing" })}
        ${moduleCard({ icon: "shield-check", title: "ระบบและสำรองข้อมูล", description: "ตรวจความสมบูรณ์ของข้อมูล ดาวน์โหลด Backup และตรวจรายการ Production", status: state.systemHealth?.status === "ok" ? "ระบบปกติ" : "พร้อมตรวจ", statusClass: state.systemHealth?.status === "ok" ? "badge-ready" : "badge-progress", view: "system" })}
      </div>

      <div class="split-grid">
        <article class="panel">
          <div class="panel-head"><div><h2>สรุป Service Incentive</h2><p>ข้อมูลเดือน ${escapeHtml(month)}</p></div><button class="button button-secondary button-small" data-view="service" type="button">จัดการข้อมูล</button></div>
          <div class="progress-list">
            ${[
              ["ขายของ", totals.salesAmount, "#"], ["ประเมิน", totals.evaluationAmount, "#"], ["เวลา", totals.timeAmount, "#"],
            ].map(([label, amount]) => `
              <div class="progress-row"><span>${label}</span><div class="progress-track"><div class="progress-bar" style="width:${Math.min(100, Math.abs(amount) / Math.max(1, Math.abs(totals.totalAmount), Math.abs(amount)) * 100)}%"></div></div><strong class="${amount < 0 ? "negative" : ""}">${formatMoney(amount)}</strong></div>`).join("")}
          </div>
        </article>
        <article class="panel">
          <div class="panel-head"><div><h2>Top 5 ประจำเดือน</h2><p>เรียงตามยอดรวม Service Incentive</p></div></div>
          ${topRows.length ? `<div class="progress-list">${topRows.map((row) => {
            const employee = employeesById.get(row.employeeId);
            return `<div class="progress-row"><span>${escapeHtml(employee?.fullName || row.employeeId)}</span><div class="progress-track"><div class="progress-bar" style="width:${Math.min(100, Math.abs(row.totalAmount) / maxTop * 100)}%"></div></div><strong class="${row.totalAmount < 0 ? "negative" : ""}">${formatMoney(row.totalAmount)}</strong></div>`;
          }).join("")}</div>` : `<div class="empty-state"><i data-lucide="inbox"></i><p>ยังไม่มีข้อมูลเดือนนี้</p></div>`}
        </article>
      </div>
    </div>`;
}

function renderEmployees() {
  const query = state.employeeSearch.trim().toLocaleLowerCase("th");
  const rows = state.employees;
  const visibleCount = rows.filter((employee) => {
    if (!query) return true;
    return `${employee.employeeCode} ${employee.fullName}`.toLocaleLowerCase("th").includes(query);
  }).length;

  els.employeesView.innerHTML = `
    <div class="page-grid">
      <article class="panel">
        <div class="panel-head">
          <div><h2>Employee Master</h2><p>รหัสกลางที่ทุกโมดูลจะใช้ร่วมกัน</p></div>
          <div class="panel-actions"><button id="addEmployeeButton" class="button button-primary" type="button"><i data-lucide="user-plus"></i>เพิ่มพนักงาน</button></div>
        </div>
        <div class="toolbar"><input id="employeeSearch" class="toolbar-grow" type="search" placeholder="ค้นหาชื่อหรือรหัสพนักงาน" value="${escapeHtml(state.employeeSearch)}" /><span id="employeeCountBadge" class="badge badge-ready">${visibleCount} รายการ</span></div>
        <div class="table-wrap">
          <table>
            <thead><tr><th>ลำดับ</th><th>รหัส</th><th>ชื่อพนักงาน</th><th>วันที่เริ่มงาน</th><th>สถานะ</th><th>Legacy IDs</th><th></th></tr></thead>
            <tbody>${rows.map((employee) => `
              <tr data-employee-search="${escapeHtml(`${employee.employeeCode} ${employee.fullName}`.toLocaleLowerCase("th"))}" ${query && !`${employee.employeeCode} ${employee.fullName}`.toLocaleLowerCase("th").includes(query) ? "hidden" : ""}>
                <td>${employee.sortOrder || "-"}</td>
                <td><strong>${escapeHtml(employee.employeeCode || "-")}</strong></td>
                <td>${escapeHtml(employee.fullName)}</td>
                <td>${escapeHtml(employee.startDate || "-")}</td>
                <td><span class="badge ${employee.isActive ? "badge-ready" : "badge-planned"}">${employee.isActive ? "ใช้งาน" : "ปิดใช้งาน"}</span></td>
                <td><small>Monthly: ${escapeHtml(employee.legacyIds.monthlyPerformance || "-")}<br>Service: ${escapeHtml(employee.legacyIds.serviceIncentive || "-")}<br>Workday: ${escapeHtml(employee.legacyIds.workdayInsight || "-")}</small></td>
                <td><div class="actions-cell"><button class="icon-button edit-employee" data-id="${escapeHtml(employee.id)}" type="button" aria-label="แก้ไข"><i data-lucide="pencil"></i></button></div></td>
              </tr>`).join("") || `<tr><td colspan="7"><div class="empty-state"><i data-lucide="users"></i><p>ยังไม่มีรายชื่อพนักงาน</p></div></td></tr>`}</tbody>
          </table>
        </div>
      </article>
      <div class="notice notice-info"><i data-lucide="info"></i><div><strong>โครงสร้างร่วมกับ Performance Summary</strong><br>ฟิลด์ <code>name</code> ยังคงไว้เพื่อให้ Web Performance Summary เดิมทำงานได้ และเพิ่ม <code>fullName</code>, <code>employeeCode</code>, <code>startDate</code> และ <code>legacyIds</code> สำหรับ Web รวม</div></div>
    </div>`;

  document.getElementById("employeeSearch")?.addEventListener("input", (event) => {
    state.employeeSearch = event.target.value;
    const search = state.employeeSearch.trim().toLocaleLowerCase("th");
    let visible = 0;
    els.employeesView.querySelectorAll("tbody tr[data-employee-search]").forEach((row) => {
      const match = !search || row.dataset.employeeSearch.includes(search);
      row.hidden = !match;
      if (match) visible += 1;
    });
    const badge = document.getElementById("employeeCountBadge");
    if (badge) badge.textContent = `${visible} รายการ`;
  });
  document.getElementById("addEmployeeButton")?.addEventListener("click", () => openEmployeeModal());
  els.employeesView.querySelectorAll(".edit-employee").forEach((button) => button.addEventListener("click", () => {
    openEmployeeModal(state.employees.find((employee) => employee.id === button.dataset.id));
  }));
}

function openEmployeeModal(employee = null) {
  const isEdit = Boolean(employee);
  els.modalRoot.innerHTML = `
    <div class="modal-backdrop" role="presentation">
      <section class="modal-card" role="dialog" aria-modal="true" aria-labelledby="employeeModalTitle">
        <div class="modal-head"><div><p class="eyebrow">EMPLOYEE MASTER</p><h2 id="employeeModalTitle">${isEdit ? "แก้ไขพนักงาน" : "เพิ่มพนักงาน"}</h2></div><button id="closeModalButton" class="icon-button" type="button" aria-label="ปิด"><i data-lucide="x"></i></button></div>
        <form id="employeeForm">
          <div class="form-grid">
            <div class="field"><label for="employeeCode">รหัสพนักงาน</label><input id="employeeCode" maxlength="20" value="${escapeHtml(employee?.employeeCode || nextEmployeeCode())}" placeholder="EMP013" /></div>
            <div class="field"><label for="employeeStartDate">วันที่เริ่มงาน</label><input id="employeeStartDate" type="date" value="${escapeHtml(employee?.startDate || "")}" /></div>
            <div class="field field-full"><label for="employeeFullName">ชื่อพนักงาน</label><input id="employeeFullName" maxlength="100" required value="${escapeHtml(employee?.fullName || "")}" /></div>
            <div class="field"><label for="employeeSortOrder">ลำดับแสดงผล</label><input id="employeeSortOrder" type="number" min="0" value="${employee?.sortOrder || nextEmployeeSortOrder()}" /></div>
            <div class="field"><label for="employeeActive">สถานะ</label><select id="employeeActive"><option value="true" ${employee?.isActive !== false ? "selected" : ""}>ใช้งาน</option><option value="false" ${employee?.isActive === false ? "selected" : ""}>ปิดใช้งาน</option></select></div>
          </div>
          <div class="form-actions"><button class="button button-primary" type="submit"><i data-lucide="save"></i>บันทึก</button><button id="cancelEmployeeButton" class="button button-ghost" type="button">ยกเลิก</button></div>
        </form>
      </section>
    </div>`;
  ensureIcons();
  const close = () => { els.modalRoot.innerHTML = ""; };
  document.getElementById("closeModalButton").addEventListener("click", close);
  document.getElementById("cancelEmployeeButton").addEventListener("click", close);
  els.modalRoot.querySelector(".modal-backdrop").addEventListener("click", (event) => { if (event.target === event.currentTarget) close(); });
  document.getElementById("employeeFullName").focus();
  document.getElementById("employeeForm").addEventListener("submit", async (event) => {
    event.preventDefault();
    const submit = event.submitter;
    submit.disabled = true;
    try {
      await window.EmployeeHubDatabase.saveEmployee({
        id: employee?.id,
        employeeCode: document.getElementById("employeeCode").value,
        fullName: document.getElementById("employeeFullName").value,
        startDate: document.getElementById("employeeStartDate").value,
        sortOrder: document.getElementById("employeeSortOrder").value,
        isActive: document.getElementById("employeeActive").value === "true",
        expectedVersion: employee?.version || 0,
        legacyIds: employee?.legacyIds || {},
      });
      close();
      showToast("บันทึกข้อมูลพนักงานแล้ว");
      await refreshData({ quiet: true });
    } catch (error) {
      if (error.code === "VERSION_CONFLICT") showToast("ข้อมูลพนักงานถูกแก้ไขแล้ว กรุณาโหลดใหม่", "warning");
      else showToast(error.message, "error");
    } finally {
      submit.disabled = false;
    }
  });
}

function serviceRecordForSelection() {
  return state.incentives.find((record) => record.yearMonth === state.serviceMonth && record.employeeId === state.serviceEmployeeId) || null;
}

function renderService() {
  if (!state.serviceMonth) state.serviceMonth = getLatestIncentiveMonth();
  const employeesById = employeeMap();
  const monthRecords = recordsForMonth(state.serviceMonth);
  const totals = sumRecords(monthRecords);
  const selectedRecord = serviceRecordForSelection();
  const sortedRows = [...monthRecords].sort((a, b) => {
    const employeeA = employeesById.get(a.employeeId);
    const employeeB = employeesById.get(b.employeeId);
    return (Number(employeeA?.sortOrder) || 999999) - (Number(employeeB?.sortOrder) || 999999)
      || String(employeeA?.fullName || a.employeeId).localeCompare(String(employeeB?.fullName || b.employeeId), "th");
  });

  els.serviceView.innerHTML = `
    <div class="page-grid">
      <div class="split-grid">
        <article class="panel">
          <div class="panel-head"><div><h2>บันทึก Service Incentive</h2><p>หนึ่งพนักงานต่อหนึ่งเดือน ระบบจะอัปเดตรายการเดิมอัตโนมัติ</p></div></div>
          <form id="serviceForm">
            <div class="form-grid">
              <div class="field"><label for="serviceMonth">เดือน</label><input id="serviceMonth" type="month" required value="${escapeHtml(state.serviceMonth)}" /></div>
              <div class="field"><label for="serviceEmployee">พนักงาน</label><select id="serviceEmployee" required><option value="">เลือกพนักงาน</option>${activeEmployees().map((employee) => `<option value="${escapeHtml(employee.id)}" ${state.serviceEmployeeId === employee.id ? "selected" : ""}>${escapeHtml(employee.employeeCode ? `${employee.employeeCode} · ${employee.fullName}` : employee.fullName)}</option>`).join("")}</select></div>
              <div class="field"><label for="salesAmount">ขายของ</label><input id="salesAmount" type="number" step="0.01" value="${selectedRecord?.salesAmount ?? 0}" /></div>
              <div class="field"><label for="evaluationAmount">ประเมิน</label><input id="evaluationAmount" type="number" step="0.01" value="${selectedRecord?.evaluationAmount ?? 0}" /></div>
              <div class="field field-full"><label for="timeAmount">เวลา</label><input id="timeAmount" type="number" step="0.01" value="${selectedRecord?.timeAmount ?? 0}" /><span class="field-help">รองรับค่าติดลบ เช่น -100</span></div>
              <div class="amount-preview field-full"><span>ยอดรวม</span><strong id="serviceTotalPreview" class="${(selectedRecord?.totalAmount || 0) < 0 ? "negative" : ""}">${formatMoney(selectedRecord?.totalAmount || 0)}</strong></div>
            </div>
            <div class="form-actions"><button class="button button-primary" type="submit"><i data-lucide="save"></i>${selectedRecord ? "อัปเดตรายการ" : "บันทึกรายการ"}</button><button id="clearServiceForm" class="button button-ghost" type="button">ล้างฟอร์ม</button></div>
          </form>
        </article>

        <article class="panel">
          <div class="panel-head"><div><h2>สรุปเดือน ${escapeHtml(state.serviceMonth)}</h2><p>${monthRecords.length} จาก ${activeEmployees().length} พนักงาน</p></div><button id="exportServiceButton" class="button button-secondary button-small" type="button"><i data-lucide="file-down"></i>Export CSV</button></div>
          <div class="kpi-grid" style="grid-template-columns:repeat(2,minmax(0,1fr))">
            <article class="kpi-card"><div class="kpi-head"><span>ขายของ</span><span class="kpi-icon"><i data-lucide="shopping-bag"></i></span></div><div class="kpi-value">${formatMoney(totals.salesAmount)}</div></article>
            <article class="kpi-card"><div class="kpi-head"><span>ประเมิน</span><span class="kpi-icon"><i data-lucide="clipboard-check"></i></span></div><div class="kpi-value">${formatMoney(totals.evaluationAmount)}</div></article>
            <article class="kpi-card"><div class="kpi-head"><span>เวลา</span><span class="kpi-icon"><i data-lucide="clock-3"></i></span></div><div class="kpi-value ${totals.timeAmount < 0 ? "negative" : ""}">${formatMoney(totals.timeAmount)}</div></article>
            <article class="kpi-card"><div class="kpi-head"><span>ยอดรวม</span><span class="kpi-icon"><i data-lucide="circle-dollar-sign"></i></span></div><div class="kpi-value ${totals.totalAmount < 0 ? "negative" : ""}">${formatMoney(totals.totalAmount)}</div></article>
          </div>
        </article>
      </div>

      <article class="panel">
        <div class="panel-head"><div><h2>รายการประจำเดือน</h2><p>แก้ไขหรือลบเฉพาะรายการที่เลือก</p></div></div>
        <div class="table-wrap"><table>
          <thead><tr><th>รหัส</th><th>ชื่อพนักงาน</th><th class="money">ขายของ</th><th class="money">ประเมิน</th><th class="money">เวลา</th><th class="money">ยอดรวม</th><th>แก้ไขล่าสุด</th><th></th></tr></thead>
          <tbody>${sortedRows.map((record) => {
            const employee = employeesById.get(record.employeeId);
            return `<tr>
              <td>${escapeHtml(employee?.employeeCode || "-")}</td><td>${escapeHtml(employee?.fullName || record.employeeId)}</td>
              <td class="money">${formatMoney(record.salesAmount)}</td><td class="money">${formatMoney(record.evaluationAmount)}</td><td class="money ${record.timeAmount < 0 ? "negative" : ""}">${formatMoney(record.timeAmount)}</td><td class="money ${record.totalAmount < 0 ? "negative" : ""}"><strong>${formatMoney(record.totalAmount)}</strong></td>
              <td>${formatDate(record.updatedAt)}</td><td><div class="actions-cell"><button class="icon-button edit-incentive" data-id="${escapeHtml(record.id)}" type="button" aria-label="แก้ไข"><i data-lucide="pencil"></i></button><button class="icon-button delete-incentive" data-id="${escapeHtml(record.id)}" type="button" aria-label="ลบ"><i data-lucide="trash-2"></i></button></div></td>
            </tr>`;
          }).join("") || `<tr><td colspan="8"><div class="empty-state"><i data-lucide="inbox"></i><p>ยังไม่มีข้อมูลเดือนนี้</p></div></td></tr>`}</tbody>
        </table></div>
      </article>
    </div>`;

  const form = document.getElementById("serviceForm");
  const monthInput = document.getElementById("serviceMonth");
  const employeeInput = document.getElementById("serviceEmployee");
  const amountInputs = ["salesAmount", "evaluationAmount", "timeAmount"].map((id) => document.getElementById(id));
  const updatePreview = () => {
    const total = amountInputs.reduce((sum, input) => sum + (Number(input.value) || 0), 0);
    const preview = document.getElementById("serviceTotalPreview");
    preview.textContent = formatMoney(total);
    preview.classList.toggle("negative", total < 0);
  };
  amountInputs.forEach((input) => input.addEventListener("input", updatePreview));
  monthInput.addEventListener("change", () => { state.serviceMonth = monthInput.value; state.serviceEmployeeId = ""; renderService(); ensureIcons(); });
  employeeInput.addEventListener("change", () => { state.serviceEmployeeId = employeeInput.value; renderService(); ensureIcons(); });
  document.getElementById("clearServiceForm").addEventListener("click", () => { state.serviceEmployeeId = ""; renderService(); ensureIcons(); });
  document.getElementById("exportServiceButton").addEventListener("click", exportServiceCsv);
  form.addEventListener("submit", async (event) => {
    event.preventDefault();
    if (!state.serviceEmployeeId) return showToast("กรุณาเลือกพนักงาน", "warning");
    const submit = event.submitter;
    submit.disabled = true;
    const existing = serviceRecordForSelection();
    try {
      await window.EmployeeHubDatabase.saveServiceIncentive({
        employeeId: state.serviceEmployeeId,
        yearMonth: state.serviceMonth,
        salesAmount: document.getElementById("salesAmount").value,
        evaluationAmount: document.getElementById("evaluationAmount").value,
        timeAmount: document.getElementById("timeAmount").value,
        expectedVersion: existing?.version || 0,
      });
      state.performanceIncentiveKey = "";
      state.performanceIncentiveData = null;
      state.closingDataKey = "";
      showToast(existing ? "อัปเดต Service Incentive แล้ว" : "บันทึก Service Incentive แล้ว");
      await refreshData({ quiet: true });
    } catch (error) {
      if (error.code === "VERSION_CONFLICT") showToast("ข้อมูลรายการนี้เปลี่ยนแล้ว กรุณาโหลดใหม่", "warning");
      else showToast(error.message, "error");
    } finally { submit.disabled = false; }
  });

  els.serviceView.querySelectorAll(".edit-incentive").forEach((button) => button.addEventListener("click", () => {
    const record = state.incentives.find((item) => item.id === button.dataset.id);
    if (!record) return;
    state.serviceMonth = record.yearMonth;
    state.serviceEmployeeId = record.employeeId;
    renderService(); ensureIcons(); window.scrollTo({ top: 0, behavior: "smooth" });
  }));
  els.serviceView.querySelectorAll(".delete-incentive").forEach((button) => button.addEventListener("click", async () => {
    const record = state.incentives.find((item) => item.id === button.dataset.id);
    if (!record) return;
    const employee = employeesById.get(record.employeeId);
    if (!window.confirm(`ต้องการลบ Service Incentive ของ ${employee?.fullName || record.employeeId} เดือน ${record.yearMonth} ใช่หรือไม่?`)) return;
    button.disabled = true;
    try {
      await window.EmployeeHubDatabase.deleteServiceIncentive(record.id);
      showToast("ลบรายการแล้ว");
      if (state.serviceEmployeeId === record.employeeId) state.serviceEmployeeId = "";
      await refreshData({ quiet: true });
    } catch (error) { showToast(error.message, "error"); }
  }));
}

function csvSafe(value) {
  let text = String(value ?? "");
  if (/^[=+\-@]/.test(text)) text = `'${text}`;
  return `"${text.replaceAll('"', '""')}"`;
}

function exportServiceCsv() {
  const records = recordsForMonth(state.serviceMonth);
  if (!records.length) return showToast("ไม่มีข้อมูลสำหรับ Export", "warning");
  const employeesById = employeeMap();
  const sortedRecords = [...records].sort((a, b) => {
    const employeeA = employeesById.get(a.employeeId);
    const employeeB = employeesById.get(b.employeeId);
    return (Number(employeeA?.sortOrder) || 999999) - (Number(employeeB?.sortOrder) || 999999)
      || String(employeeA?.fullName || a.employeeId).localeCompare(String(employeeB?.fullName || b.employeeId), "th");
  });
  const rows = [["เดือน", "รหัสพนักงาน", "ชื่อพนักงาน", "ขายของ", "ประเมิน", "เวลา", "ยอดรวม", "แก้ไขล่าสุด"]];
  sortedRecords.forEach((record) => {
    const employee = employeesById.get(record.employeeId);
    rows.push([record.yearMonth, employee?.employeeCode || "", employee?.fullName || record.employeeId, record.salesAmount, record.evaluationAmount, record.timeAmount, record.totalAmount, record.updatedAt]);
  });
  const csv = `\ufeff${rows.map((row) => row.map(csvSafe).join(",")).join("\r\n")}`;
  const url = URL.createObjectURL(new Blob([csv], { type: "text/csv;charset=utf-8" }));
  const link = document.createElement("a");
  link.href = url;
  link.download = `service-incentive-${state.serviceMonth}.csv`;
  link.click();
  URL.revokeObjectURL(url);
  showToast("Export CSV เรียบร้อยแล้ว");
}

function performanceRecord(employeeId, month, year = state.performanceYear) {
  return state.performanceEvaluations.find((record) => record.employeeId === employeeId && record.month === Number(month) && record.year === Number(year)) || null;
}

function calculatePerformanceSummary(scores) {
  if (!Array.isArray(scores) || scores.length !== PERFORMANCE_KPIS.length) return null;
  const normalized = scores.map(Number);
  if (normalized.some((score) => !Number.isFinite(score))) return null;
  const weighted = normalized.map((score, index) => {
    const gpa = score / 20 - 1;
    return { gpa, weighted: gpa * PERFORMANCE_KPIS[index].weight };
  });
  const gpa = weighted.reduce((sum, row) => sum + row.weighted, 0) / 20;
  return { gpa, percentage: gpa * 25 };
}

function roundedPerformanceGpa(value) {
  return Math.round((Number(value) + Number.EPSILON) * 100) / 100;
}

function performanceGpaIncentiveMeta(gpa) {
  const roundedGpa = roundedPerformanceGpa(gpa);
  if (!Number.isFinite(roundedGpa)) return null;
  const band = PERFORMANCE_GPA_INCENTIVE_BANDS.find((item) => roundedGpa >= item.min && roundedGpa <= item.max);
  return band ? { ...band, gpa: roundedGpa } : null;
}

function performanceResultMeta(percentage) {
  if (!Number.isFinite(percentage)) return { label: "ยังไม่ครบ", className: "badge-planned" };
  if (percentage >= 90) return { label: "ยอดเยี่ยม", className: "badge-ready" };
  if (percentage >= 80) return { label: "ดีมาก", className: "badge-ready" };
  if (percentage >= 70) return { label: "ดี", className: "badge-planned" };
  if (percentage >= 60) return { label: "ผ่านเกณฑ์", className: "badge-progress" };
  return { label: "ควรปรับปรุง", className: "badge-danger" };
}

function latestPerformanceMonth(records = state.performanceEvaluations) {
  const months = records.filter((record) => record.year === Number(state.performanceYear)).map((record) => Number(record.month)).filter((month) => month >= 0 && month <= 11);
  return months.length ? Math.max(...months) : new Date().getMonth();
}

function isLegacyAnnualPerformanceYear(year = state.performanceYear) {
  return Number(year) === PERFORMANCE_LEGACY_ANNUAL_YEAR;
}

function legacyAnnualPerformanceRows() {
  const employeesById = employeeMap();
  const rows = Object.entries(PERFORMANCE_LEGACY_ANNUAL_SCORES)
    .map(([employeeId, score]) => {
      const percentage = Number(score);
      const employee = employeesById.get(employeeId);
      return Number.isFinite(percentage) && percentage > 0 && employee
        ? { employeeId, employee, percentage }
        : null;
    })
    .filter(Boolean)
    .sort((a, b) => b.percentage - a.percentage || (Number(a.employee?.sortOrder) || 999999) - (Number(b.employee?.sortOrder) || 999999));
  let previousScore = null;
  let currentRank = 0;
  return rows.map((row, index) => {
    if (previousScore === null || Math.abs(row.percentage - previousScore) > 0.000001) currentRank = index + 1;
    previousScore = row.percentage;
    return { ...row, rank: currentRank };
  });
}

function performanceYearOptions() {
  const years = [...new Set([PERFORMANCE_LEGACY_ANNUAL_YEAR, ...(state.performanceSettings.years || []), ...(state.evaluationSummary.years || []), Number(state.performanceYear)])].filter(Number.isFinite).sort((a, b) => b - a);
  return years.map((year) => `<option value="${year}" ${year === Number(state.performanceYear) ? "selected" : ""}>${year}</option>`).join("");
}

function performanceMonthOptions() {
  return PERFORMANCE_MONTHS.map((month, index) => `<option value="${index}" ${index === Number(state.performanceMonth) ? "selected" : ""}>${month}</option>`).join("");
}

function performanceTabButton(tab, icon, label) {
  return `<button class="tab-button ${state.performanceTab === tab ? "active" : ""}" data-performance-tab="${tab}" type="button"><i data-lucide="${icon}"></i><span>${label}</span></button>`;
}

async function refreshPerformanceData({ force = false, quiet = false } = {}) {
  if (!state.user) return;
  const key = String(state.performanceYear || "");
  if (!force && state.performanceDataKey === key && !state.performanceLoading) return;
  state.performanceLoading = true;
  if (!quiet) setSyncStatus("syncing", "กำลังโหลด Performance Summary");
  if (state.currentView === "performance") renderPerformance();
  if (isLegacyAnnualPerformanceYear()) {
    state.performanceEvaluations = [];
    state.performanceDataKey = key;
    state.performanceLoading = false;
    setSyncStatus("online", "โหลดข้อมูลย้อนหลังปี 2568 แล้ว");
    if (state.currentView === "performance") renderPerformance();
    return;
  }
  try {
    const snapshot = await window.EmployeeHubDatabase.loadPerformanceSnapshot(state.performanceYear);
    state.performanceSettings = snapshot.settings;
    state.performanceEvaluations = snapshot.evaluations;
    state.performanceYear = Number(snapshot.settings.activeYear) || Number(state.performanceYear);
    state.performanceDataKey = String(state.performanceYear);
    if (!state.performanceEvaluations.some((record) => record.month === Number(state.performanceMonth))) {
      state.performanceMonth = latestPerformanceMonth(state.performanceEvaluations);
    }
    setSyncStatus("online", "เชื่อมต่อแล้ว");
    if (state.currentView === "performance") renderPerformance();
  } catch (error) {
    console.error(error);
    setSyncStatus("error", "โหลด Performance ไม่สำเร็จ");
    if (!quiet) showToast(error.message || "โหลด Performance Summary ไม่สำเร็จ", "error");
  } finally {
    state.performanceLoading = false;
  }
}

function performanceResultsForMonth() {
  const employeesById = employeeMap();
  const sorted = state.performanceEvaluations
    .filter((record) => record.year === Number(state.performanceYear) && record.month === Number(state.performanceMonth))
    .map((record) => {
      const employee = employeesById.get(record.employeeId);
      const result = calculatePerformanceSummary(record.scores);
      return result ? { ...record, ...result, employee } : null;
    })
    .filter(Boolean)
    .sort((a, b) => b.percentage - a.percentage || (Number(a.employee?.sortOrder) || 999999) - (Number(b.employee?.sortOrder) || 999999));
  let previousScore = null;
  let currentRank = 0;
  return sorted.map((row, index) => {
    if (previousScore === null || Math.abs(row.percentage - previousScore) > 0.000001) currentRank = index + 1;
    previousScore = row.percentage;
    return { ...row, rank: currentRank };
  });
}

function renderPerformance() {
  const legacyAnnual = isLegacyAnnualPerformanceYear();
  if (legacyAnnual && ["entry", "sync", "incentive"].includes(state.performanceTab)) state.performanceTab = "dashboard";
  const firstLoading = state.performanceLoading && !state.performanceDataKey;
  els.performanceView.innerHTML = `
    <div class="page-grid">
      <article class="panel performance-hero">
        <div class="panel-head"><div><h2>Performance Summary</h2><p>${legacyAnnual ? "ข้อมูลปี 2568 เป็นคะแนนสรุปรายปีจากไฟล์ต้นฉบับ และเปิดดูแบบ Read-only" : "บันทึกและวิเคราะห์คะแนน KPI รายเดือนจากฐานข้อมูล Firebase เดิม"}</p></div><span class="badge badge-ready">Phase 6.1</span></div>
        <div class="performance-toolbar">
          <div class="field compact-field"><label for="performanceYearPicker">ปีประเมิน</label><select id="performanceYearPicker">${performanceYearOptions()}</select></div>
          <div class="field compact-field"><label for="performanceMonthPicker">${legacyAnnual ? "รูปแบบข้อมูล" : "เดือน"}</label><select id="performanceMonthPicker" ${legacyAnnual ? "disabled" : ""}>${legacyAnnual ? '<option value="annual">สรุปรายปี</option>' : performanceMonthOptions()}</select></div>
        </div>
        <div class="tab-list" role="tablist" aria-label="Performance Summary">
          ${performanceTabButton("dashboard", "layout-dashboard", "ภาพรวม")}
          ${legacyAnnual ? "" : performanceTabButton("entry", "square-pen", "บันทึกคะแนน")}
          ${legacyAnnual ? "" : performanceTabButton("sync", "refresh-cw", "เชื่อมคะแนน")}
          ${legacyAnnual ? "" : performanceTabButton("incentive", "coins", "เงินประเมิน")}
          ${performanceTabButton("history", "history", "ประวัติ")}
          ${performanceTabButton("reports", "file-down", "รายงาน")}
          ${performanceTabButton("employee360", "scan-face", "รายงานรวม 360°")}
        </div>
      </article>
      ${firstLoading ? `<div class="loading-skeleton"></div>` : renderPerformanceTabContent()}
    </div>`;

  document.getElementById("performanceYearPicker")?.addEventListener("change", (event) => {
    state.performanceYear = Number(event.target.value);
    if (isLegacyAnnualPerformanceYear() && ["entry", "sync", "incentive"].includes(state.performanceTab)) state.performanceTab = "dashboard";
    state.performanceDataKey = "";
    state.performanceSyncKey = "";
    state.performanceSyncData = null;
    state.performanceIncentiveKey = "";
    state.performanceIncentiveData = null;
    state.performanceManualOverride = false;
    void refreshPerformanceData({ force: true }).then(() => {
      if (state.performanceTab === "sync" && !isLegacyAnnualPerformanceYear()) void refreshPerformanceSyncData({ force: true });
      if (state.performanceTab === "incentive" && !isLegacyAnnualPerformanceYear()) void refreshPerformanceIncentiveData({ force: true });
    });
  });
  document.getElementById("performanceMonthPicker")?.addEventListener("change", (event) => {
    if (isLegacyAnnualPerformanceYear()) return;
    state.performanceMonth = Number(event.target.value);
    state.performanceSyncKey = "";
    state.performanceSyncData = null;
    state.performanceIncentiveKey = "";
    state.performanceIncentiveData = null;
    state.performanceManualOverride = false;
    renderPerformance();
    if (state.performanceTab === "sync") void refreshPerformanceSyncData({ force: true });
    if (state.performanceTab === "incentive") void refreshPerformanceIncentiveData({ force: true });
  });
  els.performanceView.querySelectorAll("[data-performance-tab]").forEach((button) => button.addEventListener("click", () => {
    state.performanceTab = button.dataset.performanceTab;
    state.performanceManualOverride = false;
    renderPerformance();
    if (state.performanceTab === "employee360" && !state.employee360Data) void refreshEmployee360Data();
    if (state.performanceTab === "sync" && !isLegacyAnnualPerformanceYear()) void refreshPerformanceSyncData();
    if (state.performanceTab === "incentive" && !isLegacyAnnualPerformanceYear()) void refreshPerformanceIncentiveData();
  }));
  bindPerformanceTabEvents();
  ensureIcons();
}

function renderPerformanceTabContent() {
  if (isLegacyAnnualPerformanceYear() && ["entry", "sync", "incentive"].includes(state.performanceTab)) return renderLegacyAnnualPerformanceDashboard();
  if (state.performanceTab === "entry") return renderPerformanceEntry();
  if (state.performanceTab === "sync") return renderPerformanceSync();
  if (state.performanceTab === "incentive") return renderPerformanceIncentiveSync();
  if (state.performanceTab === "history") return renderPerformanceHistory();
  if (state.performanceTab === "reports") return renderPerformanceReports();
  if (state.performanceTab === "employee360") return renderEmployee360();
  return renderPerformanceDashboard();
}

function renderLegacyAnnualPerformanceDashboard() {
  const rows = legacyAnnualPerformanceRows();
  const activeCount = activeEmployees().length;
  const average = rows.length ? rows.reduce((sum, row) => sum + row.percentage, 0) / rows.length : 0;
  const top = rows[0] || null;
  return `
    <div class="notice notice-info"><i data-lucide="archive"></i><div><strong>ข้อมูลย้อนหลังปี 2568</strong><br>ไฟล์ต้นฉบับเก็บเฉพาะคะแนนเฉลี่ยประจำปีรายบุคคล ไม่พบคะแนนรายเดือนหรือคะแนนแยก 6 หัวข้อ ระบบจึงแสดงข้อมูลนี้แบบ Read-only และไม่สร้างรายละเอียดที่ไม่มีในต้นฉบับ</div></div>
    <div class="kpi-grid">
      <article class="kpi-card"><div class="kpi-head"><span>คะแนนเฉลี่ยแผนก</span><span class="kpi-icon"><i data-lucide="gauge"></i></span></div><div class="kpi-value">${rows.length ? formatNumber(average, 1) : "-"}</div><div class="kpi-note">ปี ${PERFORMANCE_LEGACY_ANNUAL_YEAR}</div></article>
      <article class="kpi-card"><div class="kpi-head"><span>อันดับ 1</span><span class="kpi-icon"><i data-lucide="trophy"></i></span></div><div class="kpi-value">${top ? formatNumber(top.percentage, 1) : "-"}</div><div class="kpi-note">${escapeHtml(top?.employee?.fullName || "ยังไม่มีข้อมูล")}</div></article>
      <article class="kpi-card"><div class="kpi-head"><span>มีข้อมูลย้อนหลัง</span><span class="kpi-icon"><i data-lucide="database"></i></span></div><div class="kpi-value">${rows.length}/${activeCount}</div><div class="kpi-note">รายบุคคล</div></article>
      <article class="kpi-card"><div class="kpi-head"><span>รูปแบบข้อมูล</span><span class="kpi-icon"><i data-lucide="calendar-range"></i></span></div><div class="kpi-value">รายปี</div><div class="kpi-note">ไม่มีรายละเอียดรายเดือน</div></article>
    </div>
    <div class="split-grid">
      <article class="panel">
        <div class="panel-head"><div><h2>อันดับประจำปี 2568</h2><p>เรียงจากคะแนนเฉลี่ยประจำปีในไฟล์ต้นฉบับ</p></div></div>
        ${rows.length ? `<div class="ranking-list">${rows.map((row) => `<div class="ranking-row"><span class="rank-number">${row.rank}</span><span class="ranking-name"><strong>${escapeHtml(row.employee.fullName)}</strong><small>${escapeHtml(row.employee.employeeCode || "")}</small></span><span class="ranking-score"><strong>${formatNumber(row.percentage, 1)}</strong><small>คะแนนเฉลี่ยประจำปี</small></span></div>`).join("")}</div>` : `<div class="empty-state"><i data-lucide="clipboard-x"></i><p>ไม่พบข้อมูลย้อนหลัง</p></div>`}
      </article>
      <article class="panel">
        <div class="panel-head"><div><h2>ขอบเขตข้อมูลต้นฉบับ</h2><p>เพื่อป้องกันการแสดงข้อมูลเกินกว่าหลักฐานที่มี</p></div></div>
        <div class="summary-row"><span>มีคะแนนเฉลี่ยประจำปี</span><strong>${rows.length} คน</strong></div>
        <div class="summary-row"><span>ไม่มีคะแนนในต้นฉบับ</span><strong>${Math.max(0, activeCount - rows.length)} คน</strong></div>
        <div class="summary-row"><span>คะแนนรายเดือน</span><strong>ไม่มีข้อมูล</strong></div>
        <div class="summary-row"><span>คะแนนแยก 6 หัวข้อ</span><strong>ไม่มีข้อมูล</strong></div>
        <div class="notice notice-warning"><i data-lucide="shield-check"></i><div>ปี 2568 ไม่เปิดให้บันทึก แก้ไข หรือเชื่อมคะแนน เพราะต้นฉบับรองรับเฉพาะผลสรุปรายปี</div></div>
      </article>
    </div>`;
}

function renderPerformanceDashboard() {
  if (isLegacyAnnualPerformanceYear()) return renderLegacyAnnualPerformanceDashboard();
  const allResults = performanceResultsForMonth();
  const results = allResults.filter((row) => row.disciplinePending !== true);
  const pendingCount = allResults.filter((row) => row.disciplinePending === true).length;
  const activeCount = activeEmployees().length;
  const average = results.length ? results.reduce((sum, row) => sum + row.percentage, 0) / results.length : 0;
  const top = results[0] || null;
  const completion = activeCount ? results.length / activeCount * 100 : 0;
  const categoryAverages = PERFORMANCE_KPIS.map((kpi, index) => ({
    ...kpi,
    average: results.length ? results.reduce((sum, row) => sum + Number(row.scores[index] || 0), 0) / results.length : 0,
  }));
  return `
    <div class="kpi-grid">
      <article class="kpi-card"><div class="kpi-head"><span>คะแนนเฉลี่ย</span><span class="kpi-icon"><i data-lucide="gauge"></i></span></div><div class="kpi-value">${results.length ? formatNumber(average, 1) : "-"}</div><div class="kpi-note">${PERFORMANCE_MONTHS[state.performanceMonth]} ${state.performanceYear}</div></article>
      <article class="kpi-card"><div class="kpi-head"><span>อันดับ 1</span><span class="kpi-icon"><i data-lucide="trophy"></i></span></div><div class="kpi-value">${top ? formatNumber(top.percentage, 1) : "-"}</div><div class="kpi-note">${escapeHtml(top?.employee?.fullName || "ยังไม่มีข้อมูล")}</div></article>
      <article class="kpi-card"><div class="kpi-head"><span>ประเมินแล้ว</span><span class="kpi-icon"><i data-lucide="circle-check-big"></i></span></div><div class="kpi-value">${results.length}/${activeCount}</div><div class="kpi-note">ครบ ${formatNumber(completion, 0)}%</div></article>
      <article class="kpi-card"><div class="kpi-head"><span>รอกรอกหัวข้อ 6</span><span class="kpi-icon"><i data-lucide="circle-alert"></i></span></div><div class="kpi-value">${pendingCount}</div><div class="kpi-note">ยังไม่รวมในอันดับและค่าเฉลี่ย</div></article>
    </div>
    <div class="split-grid">
      <article class="panel">
        <div class="panel-head"><div><h2>อันดับประจำเดือน</h2><p>คะแนนรวมจาก GPA ถ่วงน้ำหนัก</p></div></div>
        ${results.length ? `<div class="ranking-list">${results.map((row, index) => `<button class="ranking-row performance-open-entry" data-employee-id="${escapeHtml(row.employeeId)}" type="button"><span class="rank-number">${row.rank}</span><span class="ranking-name"><strong>${escapeHtml(row.employee?.fullName || row.employeeId)}</strong><small>${escapeHtml(row.employee?.employeeCode || "")}</small></span><span class="ranking-score"><strong>${formatNumber(row.percentage, 1)}</strong><small>GPA ${formatNumber(row.gpa, 2)}</small></span></button>`).join("")}</div>` : `<div class="empty-state"><i data-lucide="clipboard-x"></i><p>ยังไม่มีคะแนนเดือนนี้</p></div>`}
      </article>
      <article class="panel">
        <div class="panel-head"><div><h2>คะแนนเฉลี่ยรายหัวข้อ</h2><p>คะแนนดิบ 20–100</p></div></div>
        <div class="progress-list">${categoryAverages.map((row) => `<div class="progress-row"><span>${escapeHtml(row.title)}</span><div class="progress-track"><div class="progress-bar" style="width:${Math.max(0, Math.min(100, row.average))}%"></div></div><strong>${results.length ? formatNumber(row.average, 1) : "-"}</strong></div>`).join("")}</div>
      </article>
    </div>`;
}

function performanceScoreOptions(selected) {
  const rows = [];
  for (let score = 20; score <= 100; score += 5) rows.push(`<option value="${score}" ${score === Number(selected) ? "selected" : ""}>${score}</option>`);
  return rows.join("");
}


function performanceSyncYearMonth() {
  const gregorianYear = Number(state.performanceYear) - 543;
  return `${gregorianYear}-${String(Number(state.performanceMonth) + 1).padStart(2, "0")}`;
}

function performanceSyncRevision(records = [], extra = []) {
  const parts = records
    .map((record) => `${record.id || ""}:${Number(record.version) || 0}:${record.updatedAt || ""}`)
    .sort();
  return [...parts, ...extra.map((value) => String(value ?? ""))].join("|");
}

async function refreshPerformanceSyncData({ force = false, quiet = false } = {}) {
  if (!state.user) return;
  const yearMonth = performanceSyncYearMonth();
  if (!force && state.performanceSyncKey === yearMonth && state.performanceSyncData && !state.performanceSyncLoading) return;
  state.performanceSyncLoading = true;
  if (!quiet) setSyncStatus("syncing", "กำลังตรวจคะแนนต้นทาง");
  if (state.currentView === "performance" && state.performanceTab === "sync") renderPerformance();
  try {
    state.performanceSyncData = await window.EmployeeHubDatabase.loadPerformanceScoreSyncSnapshot(yearMonth);
    state.performanceSyncKey = yearMonth;
    setSyncStatus("online", "เชื่อมต่อแล้ว");
  } catch (error) {
    console.error(error);
    setSyncStatus("error", "ตรวจคะแนนต้นทางไม่สำเร็จ");
    if (!quiet) showToast(error.message || "โหลดข้อมูลเชื่อมคะแนนไม่สำเร็จ", "error", 6500);
  } finally {
    state.performanceSyncLoading = false;
    if (state.currentView === "performance" && state.performanceTab === "sync") renderPerformance();
  }
}

function buildPerformanceSyncRowsFromData(data, performanceMonth = state.performanceMonth, employees = sortedActiveEmployees()) {
  if (!data) return [];
  const monthly = calculateMonthlySummaryFromData(data.monthlyEntries || [], data.monthlyOverrides || [], state.employees);
  const monthlyByEmployee = new Map(monthly.rows.map((row) => [row.employeeId, row]));
  const attendanceByEmployee = new Map((data.attendance || []).map((row) => [row.employeeId, row]));
  const evaluationByEmployee = new Map((data.evaluations || []).map((row) => [row.employeeId, row]));
  const entriesByEmployee = new Map();
  (data.monthlyEntries || []).forEach((entry) => {
    if (!entriesByEmployee.has(entry.employeeId)) entriesByEmployee.set(entry.employeeId, []);
    entriesByEmployee.get(entry.employeeId).push(entry);
  });
  const overrideByEmployee = new Map((data.monthlyOverrides || []).map((row) => [row.employeeId, row]));
  const monthClosed = String(data.monthStatus?.status || "OPEN") === "CLOSED";

  return employees.map((employee) => {
    const monthlyRow = monthlyByEmployee.get(employee.id) || null;
    const attendance = attendanceByEmployee.get(employee.id) || null;
    const evaluation = evaluationByEmployee.get(employee.id) || (performanceMonth === state.performanceMonth ? performanceRecord(employee.id, performanceMonth) : null);
    const monthlyScores = monthlyRow
      ? ["C1", "C2", "C3", "C4"].map((criterionId) => Number(monthlyRow.criteria?.[criterionId]?.incentivePercent))
      : [];
    const monthlyReady = monthClosed
      && Number(monthlyRow?.actualWorkDays) > 0
      && monthlyScores.length === 4
      && monthlyScores.every((score) => Number.isInteger(score) && score >= 20 && score <= 100 && score % 5 === 0);
    const punctuality = Number(attendance?.lateScore);
    const workdayReady = Boolean(attendance) && Number.isInteger(punctuality) && punctuality >= 20 && punctuality <= 100 && punctuality % 5 === 0;
    const sourceScores = monthlyReady && workdayReady ? [...monthlyScores, punctuality] : [];
    const employeeEntries = entriesByEmployee.get(employee.id) || [];
    const override = overrideByEmployee.get(employee.id) || null;
    const monthlyRevision = performanceSyncRevision(employeeEntries, [override?.version || 0, data.monthStatus?.version || 0, data.monthStatus?.status || "OPEN"]);
    const workdayRevision = attendance ? performanceSyncRevision([attendance]) : "";
    const previousMonthlyRevision = evaluation?.sourceSync?.monthlyPerformance?.sourceRevision || "";
    const previousWorkdayRevision = evaluation?.sourceSync?.workdayInsight?.sourceRevision || "";
    const targetMatches = sourceScores.length === 5
      && Array.isArray(evaluation?.scores)
      && sourceScores.every((score, index) => Number(evaluation.scores[index]) === score);
    let status = "READY";
    let reason = "พร้อมส่ง";
    if (!monthClosed) {
      status = "MONTH_OPEN";
      reason = "Monthly Performance ยังไม่ปิดเดือน";
    } else if (!monthlyReady) {
      status = "MONTHLY_INCOMPLETE";
      reason = "คะแนน Inc. หัวข้อ 1–4 ไม่ครบ";
    } else if (!workdayReady) {
      status = "WORKDAY_MISSING";
      reason = "ยังไม่มีคะแนนเวลาประจำเดือน";
    } else if (evaluation?.sourceSync && previousMonthlyRevision === monthlyRevision && previousWorkdayRevision === workdayRevision && targetMatches) {
      status = "SYNCED";
      reason = "ส่งแล้วและตรงกับต้นทาง";
    } else if (evaluation?.sourceSync) {
      status = "SOURCE_CHANGED";
      reason = "ต้นทางเปลี่ยน ต้องส่งใหม่";
    } else if (evaluation) {
      status = "DESTINATION_EXISTS";
      reason = "มีข้อมูลปลายทางเดิม จะอัปเดตเฉพาะหัวข้อ 1–5";
    }
    return {
      employee,
      monthlyRow,
      attendance,
      evaluation,
      monthlyScores,
      punctuality: workdayReady ? punctuality : null,
      sourceScores,
      monthlyRevision,
      workdayRevision,
      status,
      reason,
      ready: ["READY", "SOURCE_CHANGED", "DESTINATION_EXISTS"].includes(status),
      disciplineScore: Number(evaluation?.scores?.[5]) || PERFORMANCE_DEFAULT_SCORE,
      disciplinePending: evaluation ? evaluation.disciplinePending === true : true,
    };
  });
}


function buildPerformanceSyncRows() {
  return buildPerformanceSyncRowsFromData(state.performanceSyncData, state.performanceMonth, sortedActiveEmployees());
}

function performanceSyncStatusBadge(status) {
  return ({
    READY: "badge-ready",
    SYNCED: "badge-info",
    SOURCE_CHANGED: "badge-progress",
    DESTINATION_EXISTS: "badge-progress",
    MONTH_OPEN: "badge-danger",
    MONTHLY_INCOMPLETE: "badge-danger",
    WORKDAY_MISSING: "badge-danger",
  })[status] || "badge-planned";
}

function renderPerformanceSync() {
  if (state.performanceSyncLoading && !state.performanceSyncData) return `<div class="loading-skeleton"></div>`;
  const data = state.performanceSyncData;
  if (!data) {
    return `<article class="panel"><div class="empty-state"><i data-lucide="refresh-cw"></i><p>กำลังโหลดข้อมูลเชื่อมคะแนน</p></div></article>`;
  }
  const rows = buildPerformanceSyncRows();
  const readyCount = rows.filter((row) => row.ready).length;
  const syncedCount = rows.filter((row) => row.status === "SYNCED").length;
  const issueCount = rows.filter((row) => !row.ready && row.status !== "SYNCED").length;
  const monthClosed = String(data.monthStatus?.status || "OPEN") === "CLOSED";
  return `
    <div class="page-grid">
      <article class="panel score-sync-hero">
        <div class="panel-head"><div><h2>Monthly Score Sync Center</h2><p>ส่งคะแนน Inc. 1–4 และคะแนนเวลาไป Performance Summary หลังตรวจสอบ</p></div><span class="badge ${monthClosed ? "badge-ready" : "badge-danger"}">${monthClosed ? "Monthly ปิดเดือนแล้ว" : "Monthly ยังไม่ปิดเดือน"}</span></div>
        <div class="kpi-grid compact-kpi-grid">
          <article class="kpi-card"><div class="kpi-head"><span>พร้อมส่ง</span><span class="kpi-icon"><i data-lucide="send"></i></span></div><div class="kpi-value">${readyCount}</div></article>
          <article class="kpi-card"><div class="kpi-head"><span>ส่งแล้ว</span><span class="kpi-icon"><i data-lucide="circle-check"></i></span></div><div class="kpi-value">${syncedCount}</div></article>
          <article class="kpi-card"><div class="kpi-head"><span>ต้องตรวจสอบ</span><span class="kpi-icon"><i data-lucide="triangle-alert"></i></span></div><div class="kpi-value">${issueCount}</div></article>
        </div>
        <div class="notice notice-info"><i data-lucide="shield-check"></i><div>ระบบอัปเดตเฉพาะหัวข้อ 1–5 และรักษาคะแนน <strong>การเคารพกฎระเบียบบริษัท</strong> ไว้เสมอ รายการที่ยังไม่เคยกรอกหัวข้อ 6 จะใช้ค่าเริ่มต้น 60 พร้อมสถานะ “รอกรอก”</div></div>
        <div class="form-actions"><button id="refreshPerformanceSync" class="button button-secondary" type="button"><i data-lucide="scan-search"></i>ตรวจสอบคะแนนใหม่</button><button id="syncReadyPerformanceScores" class="button button-primary" type="button" ${readyCount ? "" : "disabled"}><i data-lucide="send"></i>ส่งคะแนนที่พร้อม (${readyCount})</button></div>
      </article>
      <article class="panel">
        <div class="panel-head"><div><h2>Preview คะแนน ${PERFORMANCE_MONTHS[state.performanceMonth]} ${state.performanceYear}</h2><p>Inc. 1–4 มาจาก Monthly Performance · เวลา มาจาก Workday Insight</p></div></div>
        <div class="table-wrap score-sync-table"><table><thead><tr><th>พนักงาน</th><th class="money">Inc.1</th><th class="money">Inc.2</th><th class="money">Inc.3</th><th class="money">Inc.4</th><th class="money">เวลา</th><th class="money">กฎระเบียบ</th><th>สถานะ</th><th></th></tr></thead><tbody>
          ${rows.map((row) => `<tr><td><strong>${escapeHtml(row.employee.employeeCode)}</strong><br><small>${escapeHtml(row.employee.fullName)}</small></td>${[0,1,2,3].map((index) => `<td class="money"><strong>${Number.isFinite(row.monthlyScores[index]) ? row.monthlyScores[index] : "-"}</strong></td>`).join("")}<td class="money"><strong>${Number.isFinite(row.punctuality) ? row.punctuality : "-"}</strong></td><td class="money"><strong>${row.disciplineScore}</strong><br><small>${row.disciplinePending ? "รอกรอก" : "กรอกแล้ว"}</small></td><td><span class="badge ${performanceSyncStatusBadge(row.status)}">${escapeHtml(row.reason)}</span></td><td><button class="button button-small ${row.ready ? "button-primary" : "button-ghost"} sync-performance-row" data-employee-id="${escapeHtml(row.employee.id)}" type="button" ${row.ready ? "" : "disabled"}><i data-lucide="send"></i>ส่ง</button></td></tr>`).join("")}
        </tbody></table></div>
      </article>
    </div>`;
}

async function syncPerformanceRows(rows) {
  const readyRows = rows.filter((row) => row.ready);
  if (!readyRows.length) return showToast("ไม่มีรายการพร้อมส่ง", "warning");
  const overwriteCount = readyRows.filter((row) => row.evaluation).length;
  const confirmed = window.confirm(`กำลังส่งคะแนน ${readyRows.length} คน${overwriteCount ? ` และอัปเดตข้อมูลเดิม ${overwriteCount} คน` : ""}\n\nระบบจะไม่เปลี่ยนคะแนนการเคารพกฎระเบียบบริษัท ยืนยันดำเนินการหรือไม่?`);
  if (!confirmed) return;
  setBusy(true, "กำลังส่งคะแนนไป Performance Summary");
  let success = 0;
  const errors = [];
  for (const row of readyRows) {
    try {
      const saved = await window.EmployeeHubDatabase.syncPerformanceEvaluationFromSources({
        employeeId: row.employee.id,
        yearMonth: performanceSyncYearMonth(),
        sourceScores: row.sourceScores,
        monthlyRevision: row.monthlyRevision,
        workdayRevision: row.workdayRevision,
        expectedVersion: row.evaluation?.version || 0,
      });
      state.performanceEvaluations = state.performanceEvaluations.filter((record) => record.id !== saved.id).concat(saved);
      success += 1;
    } catch (error) {
      console.error(error);
      errors.push(`${row.employee.employeeCode}: ${error.message || "ไม่สำเร็จ"}`);
    }
  }
  state.performanceSyncKey = "";
  state.performanceIncentiveKey = "";
  state.performanceIncentiveData = null;
  await refreshPerformanceSyncData({ force: true, quiet: true });
  setBusy(false);
  if (errors.length) showToast(`ส่งสำเร็จ ${success} คน · ไม่สำเร็จ ${errors.length} คน\n${errors.slice(0, 3).join("\n")}`, "warning", 9000);
  else showToast(`ส่งคะแนนสำเร็จ ${success} คน`);
}


function performanceIncentiveYearMonth() {
  return performanceSyncYearMonth();
}

async function refreshPerformanceIncentiveData({ force = false, quiet = false } = {}) {
  if (!state.user || isLegacyAnnualPerformanceYear()) return;
  const yearMonth = performanceIncentiveYearMonth();
  if (!force && state.performanceIncentiveKey === yearMonth && state.performanceIncentiveData && !state.performanceIncentiveLoading) return;
  state.performanceIncentiveLoading = true;
  if (!quiet) setSyncStatus("syncing", "กำลังตรวจเงินประเมินจาก GPA");
  if (state.currentView === "performance" && state.performanceTab === "incentive") renderPerformance();
  try {
    state.performanceIncentiveData = await window.EmployeeHubDatabase.loadPerformanceIncentiveSyncSnapshot(yearMonth);
    state.performanceIncentiveKey = yearMonth;
    setSyncStatus("online", "เชื่อมต่อแล้ว");
  } catch (error) {
    console.error(error);
    setSyncStatus("error", "ตรวจเงินประเมินไม่สำเร็จ");
    if (!quiet) showToast(error.message || "โหลดข้อมูลเงินประเมินไม่สำเร็จ", "error", 6500);
  } finally {
    state.performanceIncentiveLoading = false;
    if (state.currentView === "performance" && state.performanceTab === "incentive") renderPerformance();
  }
}

function buildPerformanceIncentiveRowsFromData(data, employees = sortedActiveEmployees()) {
  if (!data) return [];
  const evaluationByEmployee = new Map((data.evaluations || []).map((row) => [row.employeeId, row]));
  const incentiveByEmployee = new Map((data.incentives || []).map((row) => [row.employeeId, row]));
  return employees.map((employee) => {
    const evaluation = evaluationByEmployee.get(employee.id) || null;
    const incentive = incentiveByEmployee.get(employee.id) || null;
    const result = evaluation ? calculatePerformanceSummary(evaluation.scores) : null;
    const meta = result ? performanceGpaIncentiveMeta(result.gpa) : null;
    const currentAmount = incentive ? Number(incentive.evaluationAmount) : null;
    let status = "READY";
    let reason = "พร้อมส่ง";
    if (!evaluation) {
      status = "PERFORMANCE_MISSING";
      reason = "ยังไม่มี Performance Summary";
    } else if (evaluation.disciplinePending === true) {
      status = "DISCIPLINE_PENDING";
      reason = "ยังไม่ได้กรอกคะแนนกฎระเบียบ";
    } else if (!result) {
      status = "INVALID_PERFORMANCE";
      reason = "คะแนน Performance ไม่สมบูรณ์";
    } else if (!meta) {
      status = "NOT_APPLICABLE";
      reason = "GPA ต่ำกว่า 0.50 ไม่อยู่ในเกณฑ์ที่กำหนด";
    } else if (incentive && Math.abs(Number(currentAmount) - Number(meta.amount)) < 0.011) {
      status = "SYNCED";
      reason = "เงินประเมินตรงกับ GPA แล้ว";
    } else if (incentive) {
      status = "AMOUNT_CHANGED";
      reason = "GPA หรือเงินประเมินเปลี่ยน ต้องส่งใหม่";
    }
    return {
      employee,
      evaluation,
      incentive,
      gpa: result ? roundedPerformanceGpa(result.gpa) : null,
      percentage: result?.percentage ?? null,
      expectedAmount: meta?.amount ?? null,
      bandLabel: meta?.label || "",
      currentAmount,
      status,
      reason,
      ready: ["READY", "AMOUNT_CHANGED"].includes(status),
    };
  });
}

function buildPerformanceIncentiveRows() {
  return buildPerformanceIncentiveRowsFromData(state.performanceIncentiveData, sortedActiveEmployees());
}

function performanceIncentiveStatusBadge(status) {
  return ({
    READY: "badge-ready",
    SYNCED: "badge-info",
    AMOUNT_CHANGED: "badge-progress",
    PERFORMANCE_MISSING: "badge-danger",
    DISCIPLINE_PENDING: "badge-danger",
    INVALID_PERFORMANCE: "badge-danger",
    NOT_APPLICABLE: "badge-planned",
  })[status] || "badge-planned";
}

function renderPerformanceIncentiveSync() {
  if (state.performanceIncentiveLoading && !state.performanceIncentiveData) return `<div class="loading-skeleton"></div>`;
  const data = state.performanceIncentiveData;
  if (!data) return `<article class="panel"><div class="empty-state"><i data-lucide="coins"></i><p>กำลังโหลดข้อมูลเงินประเมิน</p></div></article>`;
  const rows = buildPerformanceIncentiveRows();
  const readyCount = rows.filter((row) => row.ready).length;
  const syncedCount = rows.filter((row) => row.status === "SYNCED").length;
  const notApplicableCount = rows.filter((row) => row.status === "NOT_APPLICABLE").length;
  const issueCount = rows.filter((row) => !row.ready && !["SYNCED", "NOT_APPLICABLE"].includes(row.status)).length;
  return `
    <div class="page-grid">
      <article class="panel score-sync-hero">
        <div class="panel-head"><div><h2>GPA → Service Incentive</h2><p>คำนวณเงินจาก GPA ที่กรอกครบแล้ว และส่งไปช่อง “ประเมิน” ของเดือนเดียวกัน</p></div><span class="badge badge-ready">Phase 6.1</span></div>
        <div class="kpi-grid compact-kpi-grid">
          <article class="kpi-card"><div class="kpi-head"><span>พร้อมส่ง</span><span class="kpi-icon"><i data-lucide="send"></i></span></div><div class="kpi-value">${readyCount}</div></article>
          <article class="kpi-card"><div class="kpi-head"><span>ส่งแล้ว</span><span class="kpi-icon"><i data-lucide="circle-check"></i></span></div><div class="kpi-value">${syncedCount}</div></article>
          <article class="kpi-card"><div class="kpi-head"><span>ไม่เข้าเกณฑ์</span><span class="kpi-icon"><i data-lucide="circle-minus"></i></span></div><div class="kpi-value">${notApplicableCount}</div></article>
          <article class="kpi-card"><div class="kpi-head"><span>ต้องตรวจสอบ</span><span class="kpi-icon"><i data-lucide="triangle-alert"></i></span></div><div class="kpi-value">${issueCount}</div></article>
        </div>
        <div class="notice notice-info"><i data-lucide="shield-check"></i><div>ระบบปัด GPA เป็นทศนิยม 2 ตำแหน่งก่อนเทียบเกณฑ์ และอัปเดตเฉพาะช่อง <strong>ประเมิน</strong> โดยเก็บยอดขายของและยอดเวลาเดิมไว้ GPA ต่ำกว่า 0.50 จะแสดงว่าไม่เข้าเกณฑ์และไม่ส่งข้อมูลอัตโนมัติ</div></div>
        <div class="performance-band-list">${PERFORMANCE_GPA_INCENTIVE_BANDS.map((band) => `<span class="badge badge-planned">GPA ${band.label} = ${formatMoney(band.amount)}</span>`).join("")}</div>
        <div class="form-actions"><button id="refreshPerformanceIncentive" class="button button-secondary" type="button"><i data-lucide="scan-search"></i>ตรวจสอบใหม่</button><button id="syncReadyPerformanceIncentives" class="button button-primary" type="button" ${readyCount ? "" : "disabled"}><i data-lucide="send"></i>ส่งเงินที่พร้อม (${readyCount})</button></div>
      </article>
      <article class="panel">
        <div class="panel-head"><div><h2>Preview เงินประเมิน ${PERFORMANCE_MONTHS[state.performanceMonth]} ${state.performanceYear}</h2><p>พนักงานและเดือนเดียวกันใน Performance Summary และ Service Incentive</p></div></div>
        <div class="table-wrap score-sync-table"><table><thead><tr><th>พนักงาน</th><th class="money">GPA</th><th>เกณฑ์</th><th class="money">ประเมินเดิม</th><th class="money">ประเมินใหม่</th><th>สถานะ</th><th></th></tr></thead><tbody>
          ${rows.map((row) => `<tr><td><strong>${escapeHtml(row.employee.employeeCode)}</strong><br><small>${escapeHtml(row.employee.fullName)}</small></td><td class="money"><strong>${Number.isFinite(row.gpa) ? formatNumber(row.gpa, 2) : "-"}</strong></td><td>${escapeHtml(row.bandLabel || "-")}</td><td class="money ${Number(row.currentAmount) < 0 ? "negative" : ""}">${row.incentive ? formatMoney(row.currentAmount) : "-"}</td><td class="money ${Number(row.expectedAmount) < 0 ? "negative" : ""}"><strong>${Number.isFinite(row.expectedAmount) ? formatMoney(row.expectedAmount) : "-"}</strong></td><td><span class="badge ${performanceIncentiveStatusBadge(row.status)}">${escapeHtml(row.reason)}</span></td><td><button class="button button-small ${row.ready ? "button-primary" : "button-ghost"} sync-performance-incentive-row" data-employee-id="${escapeHtml(row.employee.id)}" type="button" ${row.ready ? "" : "disabled"}><i data-lucide="send"></i>ส่ง</button></td></tr>`).join("")}
        </tbody></table></div>
      </article>
    </div>`;
}

async function syncPerformanceIncentiveRows(rows) {
  const readyRows = rows.filter((row) => row.ready);
  if (!readyRows.length) return showToast("ไม่มีรายการเงินประเมินพร้อมส่ง", "warning");
  const updateCount = readyRows.filter((row) => row.incentive).length;
  const confirmed = window.confirm(`กำลังส่งเงินประเมิน ${readyRows.length} คน${updateCount ? ` และอัปเดตรายการเดิม ${updateCount} คน` : ""}\n\nระบบจะเปลี่ยนเฉพาะช่องประเมิน ยืนยันดำเนินการหรือไม่?`);
  if (!confirmed) return;
  setBusy(true, "กำลังส่งเงินประเมินไป Service Incentive");
  let success = 0;
  const errors = [];
  for (const row of readyRows) {
    try {
      const result = await window.EmployeeHubDatabase.syncPerformanceGpaToServiceIncentive({
        employeeId: row.employee.id,
        yearMonth: performanceIncentiveYearMonth(),
        expectedEvaluationVersion: row.evaluation?.version || 0,
        expectedIncentiveVersion: row.incentive?.version || 0,
      });
      const saved = result.incentive;
      state.incentives = state.incentives.filter((record) => record.id !== saved.id).concat(saved);
      if (state.performanceIncentiveData) {
        state.performanceIncentiveData.incentives = (state.performanceIncentiveData.incentives || []).filter((record) => record.id !== saved.id).concat(saved);
      }
      success += 1;
    } catch (error) {
      console.error(error);
      errors.push(`${row.employee.employeeCode}: ${error.message || "ไม่สำเร็จ"}`);
    }
  }
  state.performanceIncentiveKey = "";
  await refreshPerformanceIncentiveData({ force: true, quiet: true });
  state.closingDataKey = "";
  setBusy(false);
  if (errors.length) showToast(`ส่งสำเร็จ ${success} คน · ไม่สำเร็จ ${errors.length} คน\n${errors.slice(0, 3).join("\n")}`, "warning", 9000);
  else showToast(`ส่งเงินประเมินสำเร็จ ${success} คน`);
}

function performanceScoreSourceLabel(existing, index) {
  const key = PERFORMANCE_KPIS[index]?.id;
  const source = existing?.scoreSources?.[key];
  if (source === "monthlyPerformance") return "จาก Monthly Performance";
  if (source === "workdayInsight") return "จาก Workday Insight";
  if (source === "manualOverride") return "แก้ไขด้วยตนเอง";
  if (index === 5) return existing?.disciplinePending ? "รอกรอกด้วยตนเอง" : "กรอกด้วยตนเอง";
  return "กรอกด้วยตนเอง";
}

function renderPerformanceEntry() {
  const employees = sortedActiveEmployees();
  const existing = performanceRecord(state.performanceEmployeeId, state.performanceMonth);
  const scores = existing?.scores?.length === 6 ? existing.scores : Array(6).fill(PERFORMANCE_DEFAULT_SCORE);
  const result = calculatePerformanceSummary(scores);
  const hasAutoSources = Boolean(existing?.sourceSync?.monthlyPerformance || existing?.sourceSync?.workdayInsight);
  const autoLocked = hasAutoSources && !state.performanceManualOverride;
  return `
    <div class="split-grid performance-entry-grid">
      <article class="panel">
        <div class="panel-head"><div><h2>${existing ? "แก้ไขคะแนน" : "บันทึกคะแนนใหม่"}</h2><p>${PERFORMANCE_MONTHS[state.performanceMonth]} ${state.performanceYear}</p></div><span class="badge ${existing ? "badge-info" : "badge-planned"}">${existing ? `Version ${existing.version}` : "ยังไม่มีข้อมูล"}</span></div>
        ${hasAutoSources ? `<div class="notice ${state.performanceManualOverride ? "notice-warning" : "notice-info"}"><i data-lucide="${state.performanceManualOverride ? "triangle-alert" : "link-2"}"></i><div>${state.performanceManualOverride ? "กำลังแก้คะแนนต้นทางด้วยตนเอง ระบบจะบันทึกเหตุผลและติดสถานะ Manual Override" : "หัวข้อ 1–5 เชื่อมจากระบบต้นทางและถูกล็อกไว้ หัวข้อการเคารพกฎระเบียบบริษัทให้กรอกเอง"}</div></div>` : ""}
        <form id="performanceEntryForm">
          <div class="field"><label for="performanceEmployee">พนักงาน</label><select id="performanceEmployee" required><option value="">เลือกพนักงาน</option>${employees.map((employee) => `<option value="${escapeHtml(employee.id)}" ${employee.id === state.performanceEmployeeId ? "selected" : ""}>${escapeHtml(`${employee.employeeCode} · ${employee.fullName}`)}</option>`).join("")}</select></div>
          <div class="performance-score-grid">${PERFORMANCE_KPIS.map((kpi, index) => `<label class="performance-score-card ${autoLocked && index < 5 ? "score-card-locked" : ""}"><span class="performance-score-icon"><i data-lucide="${kpi.icon}"></i></span><span><strong>${escapeHtml(kpi.title)}</strong><small>น้ำหนัก ${kpi.weight} · ${escapeHtml(performanceScoreSourceLabel(existing, index))}</small></span><select class="performance-score-input" data-score-index="${index}" ${autoLocked && index < 5 ? "disabled" : ""}>${performanceScoreOptions(scores[index])}</select></label>`).join("")}</div>
          ${state.performanceManualOverride ? `<div class="field"><label for="performanceOverrideReason">เหตุผลการแก้ไขคะแนนอัตโนมัติ</label><textarea id="performanceOverrideReason" maxlength="500" required placeholder="ระบุเหตุผลและเอกสารอ้างอิง"></textarea></div>` : ""}
          <div class="field"><label for="performanceNote">หมายเหตุ</label><textarea id="performanceNote" maxlength="2000" placeholder="ผลงาน จุดเด่น หรือข้อเสนอแนะ">${escapeHtml(existing?.note || "")}</textarea></div>
          <div class="form-actions"><button class="button button-primary" type="submit"><i data-lucide="save"></i>${existing ? "อัปเดตคะแนน" : "บันทึกคะแนน"}</button>${hasAutoSources ? `<button id="togglePerformanceOverride" class="button button-secondary" type="button"><i data-lucide="${state.performanceManualOverride ? "lock" : "lock-open"}"></i>${state.performanceManualOverride ? "ยกเลิกการแก้ไขต้นทาง" : "แก้คะแนนต้นทางด้วยตนเอง"}</button>` : `<button id="resetPerformanceScores" class="button button-ghost" type="button">ตั้งค่า 60 ทุกหัวข้อ</button>`}</div>
        </form>
      </article>
      <aside class="panel performance-live-summary">
        <div class="panel-head"><div><h2>ผลคำนวณทันที</h2><p>GPA ถ่วงน้ำหนักรวม 20</p></div></div>
        <div class="performance-score-ring"><strong id="performanceLivePercentage">${formatNumber(result?.percentage || 0, 1)}</strong><span>คะแนน / 100</span></div>
        <div class="summary-row"><span>GPA รวม</span><strong id="performanceLiveGpa">${formatNumber(result?.gpa || 0, 2)}</strong></div>
        <div class="summary-row"><span>ระดับผลลัพธ์</span><strong id="performanceLiveLabel">${performanceResultMeta(result?.percentage).label}</strong></div>
        ${existing?.disciplinePending ? `<div class="notice notice-warning"><i data-lucide="circle-alert"></i><div>หัวข้อการเคารพกฎระเบียบบริษัทยังเป็นค่าเริ่มต้น กรุณาตรวจและบันทึกด้วยตนเอง</div></div>` : ""}
      </aside>
    </div>`;
}

function currentPerformanceEntryScores() {
  return [...document.querySelectorAll(".performance-score-input")].map((input) => Number(input.value));
}

function updatePerformanceEntryPreview() {
  const result = calculatePerformanceSummary(currentPerformanceEntryScores());
  if (!result) return;
  document.getElementById("performanceLivePercentage").textContent = formatNumber(result.percentage, 1);
  document.getElementById("performanceLiveGpa").textContent = formatNumber(result.gpa, 2);
  document.getElementById("performanceLiveLabel").textContent = performanceResultMeta(result.percentage).label;
}

function renderPerformanceHistory() {
  const employees = sortedActiveEmployees();
  const visible = state.performanceHistoryEmployeeId === "all" ? employees : employees.filter((employee) => employee.id === state.performanceHistoryEmployeeId);
  if (isLegacyAnnualPerformanceYear()) {
    return `
      <article class="panel">
        <div class="panel-head"><div><h2>ประวัติรายบุคคล ปี ${PERFORMANCE_LEGACY_ANNUAL_YEAR}</h2><p>ข้อมูลสรุปรายปีแบบ Read-only จากไฟล์ต้นฉบับ</p></div><div class="field compact-field"><label for="performanceHistoryEmployee">พนักงาน</label><select id="performanceHistoryEmployee"><option value="all">พนักงานทุกคน</option>${employees.map((employee) => `<option value="${escapeHtml(employee.id)}" ${employee.id === state.performanceHistoryEmployeeId ? "selected" : ""}>${escapeHtml(`${employee.employeeCode} · ${employee.fullName}`)}</option>`).join("")}</select></div></div>
        <div class="notice notice-info"><i data-lucide="info"></i><div>ปี 2568 มีเฉพาะคะแนนเฉลี่ยประจำปี จึงไม่มีช่องคะแนนรายเดือนหรือปุ่มแก้ไข</div></div>
        <div class="table-wrap"><table><thead><tr><th>รหัส</th><th>ชื่อพนักงาน</th><th class="money">คะแนนเฉลี่ยประจำปี</th><th>สถานะ</th><th>แหล่งข้อมูล</th></tr></thead><tbody>${visible.map((employee) => {
          const score = Number(PERFORMANCE_LEGACY_ANNUAL_SCORES[employee.id]);
          const hasScore = Number.isFinite(score) && score > 0;
          return `<tr><td><strong>${escapeHtml(employee.employeeCode)}</strong></td><td>${escapeHtml(employee.fullName)}</td><td class="money"><strong>${hasScore ? formatNumber(score, 1) : "-"}</strong></td><td><span class="badge ${hasScore ? "badge-ready" : "badge-planned"}">${hasScore ? "มีข้อมูล" : "ไม่มีข้อมูลในต้นฉบับ"}</span></td><td>${hasScore ? escapeHtml(PERFORMANCE_LEGACY_ANNUAL_SOURCE) : "-"}</td></tr>`;
        }).join("")}</tbody></table></div>
      </article>`;
  }
  const rows = visible.map((employee) => {
    const values = PERFORMANCE_MONTHS.map((_, month) => {
      const record = performanceRecord(employee.id, month);
      return record && record.disciplinePending !== true ? calculatePerformanceSummary(record.scores)?.percentage : null;
    });
    const completed = values.filter(Number.isFinite);
    return { employee, values, average: completed.length ? completed.reduce((sum, value) => sum + value, 0) / completed.length : null };
  });
  return `
    <article class="panel">
      <div class="panel-head"><div><h2>ประวัติรายบุคคล ปี ${state.performanceYear}</h2><p>คะแนนรวมรายเดือนและค่าเฉลี่ยสะสม</p></div><div class="field compact-field"><label for="performanceHistoryEmployee">พนักงาน</label><select id="performanceHistoryEmployee"><option value="all">พนักงานทุกคน</option>${employees.map((employee) => `<option value="${escapeHtml(employee.id)}" ${employee.id === state.performanceHistoryEmployeeId ? "selected" : ""}>${escapeHtml(`${employee.employeeCode} · ${employee.fullName}`)}</option>`).join("")}</select></div></div>
      <div class="table-wrap performance-history-table"><table><thead><tr><th>รหัส</th><th>ชื่อพนักงาน</th><th class="money">เฉลี่ย</th>${PERFORMANCE_SHORT_MONTHS.map((month) => `<th class="money">${month}</th>`).join("")}</tr></thead><tbody>${rows.map((row) => `<tr><td><strong>${escapeHtml(row.employee.employeeCode)}</strong></td><td>${escapeHtml(row.employee.fullName)}</td><td class="money"><strong>${Number.isFinite(row.average) ? formatNumber(row.average, 1) : "-"}</strong></td>${row.values.map((value, month) => `<td class="money">${Number.isFinite(value) ? `<button class="score-cell-button performance-edit-cell" type="button" data-employee-id="${escapeHtml(row.employee.id)}" data-month="${month}">${formatNumber(value, 1)}<i data-lucide="pencil"></i></button>` : "-"}</td>`).join("")}</tr>`).join("")}</tbody></table></div>
    </article>`;
}

function renderPerformanceReports() {
  if (isLegacyAnnualPerformanceYear()) {
    const rows = legacyAnnualPerformanceRows();
    return `
      <div class="split-grid">
        <article class="panel"><div class="panel-head"><div><h2>ส่งออกรายงานปี ${PERFORMANCE_LEGACY_ANNUAL_YEAR}</h2><p>คะแนนเฉลี่ยประจำปีรายบุคคลจากไฟล์ต้นฉบับ</p></div></div><div class="kpi-grid compact-kpi-grid"><article class="kpi-card"><div class="kpi-head"><span>มีข้อมูล</span><span class="kpi-icon"><i data-lucide="database"></i></span></div><div class="kpi-value">${rows.length}</div></article><article class="kpi-card"><div class="kpi-head"><span>รูปแบบ</span><span class="kpi-icon"><i data-lucide="calendar-range"></i></span></div><div class="kpi-value">รายปี</div></article></div><div class="form-actions"><button id="exportPerformanceCsv" class="button button-primary" type="button"><i data-lucide="file-down"></i>Export CSV ปี ${PERFORMANCE_LEGACY_ANNUAL_YEAR}</button></div></article>
        <article class="panel"><div class="panel-head"><div><h2>ข้อจำกัดของรายงาน</h2><p>รักษาข้อมูลตามต้นฉบับโดยไม่เติมรายละเอียดที่ไม่มี</p></div></div><div class="notice notice-warning"><i data-lucide="triangle-alert"></i><div>CSV ปี 2568 จะมีเฉพาะคะแนนเฉลี่ยประจำปี ไม่มีเดือน คะแนน 6 หัวข้อ GPA หรือสถานะ Sync</div></div></article>
      </div>`;
  }
  const records = state.performanceEvaluations.filter((record) => record.year === Number(state.performanceYear));
  const evaluatedEmployees = new Set(records.map((record) => record.employeeId)).size;
  return `
    <div class="split-grid">
      <article class="panel"><div class="panel-head"><div><h2>ส่งออกรายงาน</h2><p>ข้อมูลคะแนนครบ 6 หัวข้อ พร้อม GPA และคะแนนรวม</p></div></div><div class="kpi-grid compact-kpi-grid"><article class="kpi-card"><div class="kpi-head"><span>รายการ</span><span class="kpi-icon"><i data-lucide="database"></i></span></div><div class="kpi-value">${records.length}</div></article><article class="kpi-card"><div class="kpi-head"><span>พนักงาน</span><span class="kpi-icon"><i data-lucide="users"></i></span></div><div class="kpi-value">${evaluatedEmployees}</div></article></div><div class="form-actions"><button id="exportPerformanceCsv" class="button button-primary" type="button"><i data-lucide="file-down"></i>Export CSV ปี ${state.performanceYear}</button></div></article>
      <article class="panel"><div class="panel-head"><div><h2>เริ่มปีประเมินใหม่</h2><p>เพิ่มปีโดยไม่ลบข้อมูลปีเดิม</p></div></div><div class="notice notice-info"><i data-lucide="info"></i><div>ปีประเมินใช้พุทธศักราช เช่น 2570</div></div><div class="form-actions"><button id="addPerformanceYear" class="button button-secondary" type="button"><i data-lucide="calendar-plus"></i>เพิ่มปีประเมิน</button></div></article>
    </div>`;
}

function exportPerformanceCsv() {
  const employeesById = employeeMap();
  if (isLegacyAnnualPerformanceYear()) {
    const rows = [["ปี", "รหัสพนักงาน", "ชื่อพนักงาน", "คะแนนเฉลี่ยประจำปี", "สถานะ", "แหล่งข้อมูล"]];
    sortedActiveEmployees().forEach((employee) => {
      const score = Number(PERFORMANCE_LEGACY_ANNUAL_SCORES[employee.id]);
      const hasScore = Number.isFinite(score) && score > 0;
      rows.push([PERFORMANCE_LEGACY_ANNUAL_YEAR, employee.employeeCode || "", employee.fullName, hasScore ? score.toFixed(2) : "", hasScore ? "มีข้อมูล" : "ไม่มีข้อมูลในต้นฉบับ", hasScore ? PERFORMANCE_LEGACY_ANNUAL_SOURCE : ""]);
    });
    downloadCsv(rows, `performance-summary-${PERFORMANCE_LEGACY_ANNUAL_YEAR}-annual.csv`);
    return;
  }
  const rows = [["ปี", "เดือน", "รหัสพนักงาน", "ชื่อพนักงาน", ...PERFORMANCE_KPIS.map((kpi) => kpi.title), "GPA", "คะแนนรวม", "ระดับ", "สถานะ Sync", "หัวข้อ 6", "หมายเหตุ", "แก้ไขล่าสุด"]];
  state.performanceEvaluations.filter((record) => record.year === Number(state.performanceYear)).sort((a, b) => a.month - b.month || (Number(employeesById.get(a.employeeId)?.sortOrder) || 999999) - (Number(employeesById.get(b.employeeId)?.sortOrder) || 999999)).forEach((record) => {
    const employee = employeesById.get(record.employeeId);
    const result = calculatePerformanceSummary(record.scores);
    rows.push([record.year, PERFORMANCE_MONTHS[record.month], employee?.employeeCode || "", employee?.fullName || record.employeeId, ...record.scores, result?.gpa?.toFixed(2) || "", result?.percentage?.toFixed(2) || "", performanceResultMeta(result?.percentage).label, record.syncStatus || "manual", record.disciplinePending ? "รอกรอก" : "กรอกแล้ว", record.note, record.updatedAt]);
  });
  downloadCsv(rows, `performance-summary-${state.performanceYear}.csv`);
}

function calculateEmployeeMonthly360(employeeId, data) {
  const entries = (data?.monthlyEntries || []).filter((entry) => entry.employeeId === employeeId);
  const override = (data?.monthlyOverrides || []).find((row) => row.employeeId === employeeId);
  const autoWorkDays = new Set(entries.filter((entry) => monthlyStatusDefinition(entry.status).countsAsWork).map((entry) => entry.date)).size;
  const actualWorkDays = Number.isFinite(Number(override?.actualWorkDaysOverride)) ? Number(override.actualWorkDaysOverride) : autoWorkDays;
  if (!entries.length || actualWorkDays <= 0) return null;
  const percentages = MONTHLY_CRITERIA.map((criterion) => {
    const total = entries.reduce((sum, entry) => sum + Number(entry.scores?.[criterion.id] || 0), 0);
    const average = total / actualWorkDays;
    return average > 0 ? ((average - 0.5) / average) * 100 : 0;
  });
  return { actualWorkDays, percentage: percentages.reduce((sum, value) => sum + value, 0) / percentages.length };
}

async function refreshEmployee360Data({ quiet = false } = {}) {
  if (!state.user || !state.employee360Month || !state.employee360EmployeeId) return;
  state.employee360Loading = true;
  if (!quiet) setSyncStatus("syncing", "กำลังโหลดรายงานรวม");
  if (state.currentView === "performance" && state.performanceTab === "employee360") renderPerformance();
  try {
    state.employee360Data = await window.EmployeeHubDatabase.loadEmployee360Snapshot(state.employee360Month, state.employee360EmployeeId);
    setSyncStatus("online", "เชื่อมต่อแล้ว");
    if (state.currentView === "performance" && state.performanceTab === "employee360") renderPerformance();
  } catch (error) {
    console.error(error);
    showToast(error.message || "โหลดรายงานรวมไม่สำเร็จ", "error");
  } finally {
    state.employee360Loading = false;
  }
}

function renderEmployee360() {
  const employees = sortedActiveEmployees();
  const employee = employeeMap().get(state.employee360EmployeeId);
  const data = state.employee360Data;
  const incentive = data?.incentives?.[0] || null;
  const attendance = data?.attendance?.[0] || null;
  const leaveDays = (data?.leaveRecords || []).reduce((sum, row) => sum + Number(row.days || 0), 0);
  const evaluation = data?.evaluations?.[0] || null;
  const performance = evaluation && evaluation.disciplinePending !== true ? calculatePerformanceSummary(evaluation.scores) : null;
  const monthly = calculateEmployeeMonthly360(state.employee360EmployeeId, data);
  return `
    <article class="panel">
      <div class="panel-head"><div><h2>รายงานรวมพนักงาน 360°</h2><p>ข้อมูลจากทุกโมดูลในเดือนเดียวกัน</p></div><button id="printEmployee360" class="button button-secondary button-small" type="button"><i data-lucide="printer"></i>พิมพ์</button></div>
      <div class="form-grid employee360-controls"><div class="field"><label for="employee360Month">เดือน</label><input id="employee360Month" type="month" value="${escapeHtml(state.employee360Month)}" /></div><div class="field"><label for="employee360Employee">พนักงาน</label><select id="employee360Employee">${employees.map((row) => `<option value="${escapeHtml(row.id)}" ${row.id === state.employee360EmployeeId ? "selected" : ""}>${escapeHtml(`${row.employeeCode} · ${row.fullName}`)}</option>`).join("")}</select></div></div>
      ${state.employee360Loading ? `<div class="loading-skeleton"></div>` : `<div id="employee360Report" class="employee360-report"><div class="employee360-head"><div><p class="eyebrow">EMPLOYEE 360° REPORT</p><h2>${escapeHtml(employee?.fullName || "เลือกพนักงาน")}</h2><span>${escapeHtml(employee?.employeeCode || "")} · เดือน ${escapeHtml(state.employee360Month)}</span></div></div><div class="kpi-grid"><article class="kpi-card"><div class="kpi-head"><span>Performance Summary</span><span class="kpi-icon"><i data-lucide="chart-no-axes-combined"></i></span></div><div class="kpi-value">${performance ? formatNumber(performance.percentage, 1) : "-"}</div><div class="kpi-note">${performance ? performanceResultMeta(performance.percentage).label : (evaluation?.disciplinePending ? "รอกรอกกฎระเบียบ" : "ยังไม่มีข้อมูล")}</div></article><article class="kpi-card"><div class="kpi-head"><span>Monthly Performance</span><span class="kpi-icon"><i data-lucide="clipboard-check"></i></span></div><div class="kpi-value">${monthly ? formatNumber(monthly.percentage, 1) : "-"}</div><div class="kpi-note">${monthly ? `${monthly.actualWorkDays} วันทำงาน` : "ยังไม่มีข้อมูล"}</div></article><article class="kpi-card"><div class="kpi-head"><span>คะแนนเวลา</span><span class="kpi-icon"><i data-lucide="clock-3"></i></span></div><div class="kpi-value">${attendance ? attendance.lateScore : "-"}</div><div class="kpi-note">${attendance ? `${attendance.lateMinutes} นาทีสาย` : "ยังไม่มีข้อมูล"}</div></article><article class="kpi-card"><div class="kpi-head"><span>วันลา</span><span class="kpi-icon"><i data-lucide="calendar-off"></i></span></div><div class="kpi-value">${formatNumber(leaveDays, 1)}</div><div class="kpi-note">รวมทุกประเภทในเดือน</div></article><article class="kpi-card"><div class="kpi-head"><span>Service Incentive</span><span class="kpi-icon"><i data-lucide="badge-dollar-sign"></i></span></div><div class="kpi-value ${incentive?.totalAmount < 0 ? "negative" : ""}">${incentive ? formatMoney(incentive.totalAmount) : "-"}</div><div class="kpi-note">ขาย ${incentive ? formatMoney(incentive.salesAmount) : "-"} · ประเมิน ${incentive ? formatMoney(incentive.evaluationAmount) : "-"} · เวลา ${incentive ? formatMoney(incentive.timeAmount) : "-"}</div></article></div></div>`}
    </article>`;
}

function bindPerformanceTabEvents() {
  document.querySelectorAll(".performance-open-entry").forEach((button) => button.addEventListener("click", () => {
    state.performanceEmployeeId = button.dataset.employeeId;
    state.performanceTab = "entry";
    renderPerformance();
  }));
  document.getElementById("performanceEmployee")?.addEventListener("change", (event) => { state.performanceEmployeeId = event.target.value; state.performanceManualOverride = false; renderPerformance(); });
  document.querySelectorAll(".performance-score-input").forEach((input) => input.addEventListener("change", updatePerformanceEntryPreview));
  document.getElementById("resetPerformanceScores")?.addEventListener("click", () => { document.querySelectorAll(".performance-score-input").forEach((input) => { input.value = String(PERFORMANCE_DEFAULT_SCORE); }); updatePerformanceEntryPreview(); });
  document.getElementById("togglePerformanceOverride")?.addEventListener("click", () => { state.performanceManualOverride = !state.performanceManualOverride; renderPerformance(); });
  document.getElementById("refreshPerformanceSync")?.addEventListener("click", () => { state.performanceSyncKey = ""; void refreshPerformanceSyncData({ force: true }); });
  document.getElementById("syncReadyPerformanceScores")?.addEventListener("click", () => void syncPerformanceRows(buildPerformanceSyncRows()));
  document.getElementById("refreshPerformanceIncentive")?.addEventListener("click", () => { state.performanceIncentiveKey = ""; void refreshPerformanceIncentiveData({ force: true }); });
  document.getElementById("syncReadyPerformanceIncentives")?.addEventListener("click", () => void syncPerformanceIncentiveRows(buildPerformanceIncentiveRows()));
  document.querySelectorAll(".sync-performance-incentive-row").forEach((button) => button.addEventListener("click", () => {
    const row = buildPerformanceIncentiveRows().find((item) => item.employee.id === button.dataset.employeeId);
    if (row) void syncPerformanceIncentiveRows([row]);
  }));
  document.querySelectorAll(".sync-performance-row").forEach((button) => button.addEventListener("click", () => {
    const row = buildPerformanceSyncRows().find((item) => item.employee.id === button.dataset.employeeId);
    if (row) void syncPerformanceRows([row]);
  }));
  document.getElementById("performanceEntryForm")?.addEventListener("submit", async (event) => {
    event.preventDefault();
    const existing = performanceRecord(state.performanceEmployeeId, state.performanceMonth);
    const scores = currentPerformanceEntryScores();
    const overrideReason = String(document.getElementById("performanceOverrideReason")?.value || "").trim();
    if (state.performanceManualOverride && !overrideReason) return showToast("กรุณาระบุเหตุผลการแก้คะแนนต้นทาง", "warning");
    const scoreSources = { ...(existing?.scoreSources || {}) };
    const manualOverrides = { ...(existing?.manualOverrides || {}) };
    if (state.performanceManualOverride && existing) {
      PERFORMANCE_KPIS.slice(0, 5).forEach((kpi, index) => {
        if (Number(scores[index]) !== Number(existing.scores?.[index])) {
          scoreSources[kpi.id] = "manualOverride";
          manualOverrides[kpi.id] = { originalScore: Number(existing.scores?.[index]), newScore: Number(scores[index]), reason: overrideReason };
        }
      });
    }
    scoreSources.discipline = "manual";
    try {
      const saved = await window.EmployeeHubDatabase.savePerformanceEvaluation({
        employeeId: state.performanceEmployeeId,
        year: state.performanceYear,
        month: state.performanceMonth,
        scores,
        note: document.getElementById("performanceNote").value,
        expectedVersion: existing?.version || 0,
        sourceSync: existing?.sourceSync || {},
        scoreSources,
        syncStatus: state.performanceManualOverride ? "manual_override" : (existing?.syncStatus || "manual"),
        disciplinePending: false,
        manualOverrides,
        source: state.performanceManualOverride ? "Employee Management Hub · Manual Override" : "Employee Management Hub · Performance Summary",
      });
      state.performanceEvaluations = state.performanceEvaluations.filter((row) => row.id !== saved.id).concat(saved);
      if (!existing) state.evaluationSummary.count += 1;
      state.evaluationSummary.latestUpdatedAt = saved.updatedAt || new Date().toISOString();
      state.performanceManualOverride = false;
      state.performanceSyncKey = "";
      state.performanceIncentiveKey = "";
      state.performanceIncentiveData = null;
      state.closingDataKey = "";
      showToast("บันทึก Performance Summary เรียบร้อยแล้ว");
      renderPerformance();
    } catch (error) { showToast(error.message || "บันทึกคะแนนไม่สำเร็จ", "error", 6500); }
  });
  document.getElementById("performanceHistoryEmployee")?.addEventListener("change", (event) => { state.performanceHistoryEmployeeId = event.target.value; renderPerformance(); });
  document.querySelectorAll(".performance-edit-cell").forEach((button) => button.addEventListener("click", () => { state.performanceEmployeeId = button.dataset.employeeId; state.performanceMonth = Number(button.dataset.month); state.performanceTab = "entry"; state.performanceManualOverride = false; renderPerformance(); }));
  document.getElementById("exportPerformanceCsv")?.addEventListener("click", exportPerformanceCsv);
  document.getElementById("addPerformanceYear")?.addEventListener("click", async () => {
    const suggested = Math.max(...(state.performanceSettings.years || [state.performanceYear])) + 1;
    const value = window.prompt("ระบุปีประเมินใหม่ (พ.ศ.)", String(suggested));
    if (!value) return;
    try { const result = await window.EmployeeHubDatabase.addPerformanceYear(value); state.performanceSettings = { ...state.performanceSettings, ...result }; state.performanceYear = Number(result.activeYear); state.performanceDataKey = ""; await refreshPerformanceData({ force: true }); showToast("เพิ่มปีประเมินเรียบร้อยแล้ว"); } catch (error) { showToast(error.message, "error"); }
  });
  document.getElementById("employee360Month")?.addEventListener("change", (event) => { state.employee360Month = event.target.value || currentYearMonth(); state.employee360Data = null; void refreshEmployee360Data(); });
  document.getElementById("employee360Employee")?.addEventListener("change", (event) => { state.employee360EmployeeId = event.target.value; state.employee360Data = null; void refreshEmployee360Data(); });
  document.getElementById("printEmployee360")?.addEventListener("click", () => window.print());
}

const LEAVE_TYPE_LABELS = Object.freeze({
  sick: "ลาป่วย",
  personal: "ลากิจ",
  vacation: "ลาพักร้อน",
  other: "ลาอื่นๆ",
});

function normalizedLeaveType(type) {
  return type === "ordination" ? "other" : type;
}

function calculateLateScore(lateMinutes) {
  const minutes = Math.max(0, Math.trunc(Number(lateMinutes) || 0));
  if (minutes <= 29) return 100;
  if (minutes <= 59) return 90;
  if (minutes <= 89) return 80;
  if (minutes <= 119) return 70;
  return 60;
}

function workdayDataKey() {
  return `${state.workdayMonth}|${state.workdayYear}`;
}

async function refreshWorkdayData({ force = false, quiet = false } = {}) {
  if (!state.user || !state.workdayMonth) return;
  const key = workdayDataKey();
  if (!force && state.workdayDataKey === key && !state.workdayLoading) return;
  state.workdayLoading = true;
  if (!quiet) setBusy(true, "กำลังโหลด Workday Insight");
  if (state.currentView === "workday") renderWorkday();
  try {
    const snapshot = await window.EmployeeHubDatabase.loadWorkdaySnapshot(state.workdayMonth, state.workdayYear);
    state.attendanceMonthly = snapshot.attendanceMonthly;
    state.leaveRecords = snapshot.leaveRecords;
    state.workdaySettings = snapshot.settings;
    state.workdayDataKey = key;
    setSyncStatus("online", "เชื่อมต่อแล้ว");
  } catch (error) {
    console.error(error);
    setSyncStatus("error", "โหลด Workday ไม่สำเร็จ");
    if (!quiet) showToast(error.message || "โหลด Workday Insight ไม่สำเร็จ", "error");
  } finally {
    state.workdayLoading = false;
    state.loading = false;
    els.refreshButton.disabled = false;
    if (state.currentView === "workday") renderWorkday();
  }
}

function selectedAttendanceRecord() {
  return state.attendanceMonthly.find((record) => record.employeeId === state.attendanceEmployeeId && record.yearMonth === state.workdayMonth) || null;
}

function selectedLeaveRecord() {
  return state.leaveRecords.find((record) => record.id === state.leaveEditingId) || null;
}

function leaveTypeLabel(type) {
  const normalizedType = normalizedLeaveType(type);
  return LEAVE_TYPE_LABELS[normalizedType] || normalizedType || "ไม่ระบุ";
}

function leaveTypeBadge(type) {
  const classes = {
    sick: "badge-danger",
    personal: "badge-progress",
    vacation: "badge-ready",
    other: "badge-planned",
  };
  return classes[normalizedLeaveType(type)] || "badge-planned";
}

function sortedActiveEmployees() {
  return [...activeEmployees()].sort((a, b) => (Number(a.sortOrder) || 999999) - (Number(b.sortOrder) || 999999) || a.fullName.localeCompare(b.fullName, "th"));
}

function fullYearsBetween(startDate, referenceDate) {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(String(startDate || ""))) return 0;
  const start = new Date(`${startDate}T00:00:00`);
  const reference = new Date(`${referenceDate}T00:00:00`);
  if (Number.isNaN(start.getTime()) || Number.isNaN(reference.getTime()) || reference < start) return 0;
  let years = reference.getFullYear() - start.getFullYear();
  const beforeAnniversary = reference.getMonth() < start.getMonth()
    || (reference.getMonth() === start.getMonth() && reference.getDate() < start.getDate());
  if (beforeAnniversary) years -= 1;
  return Math.max(0, years);
}

function vacationEntitlement(employee, year, settings) {
  if (!settings?.configured) return null;
  const referenceDate = settings.vacationReference === "yearEnd" ? `${year}-12-31` : `${year}-01-01`;
  const years = fullYearsBetween(employee.startDate, referenceDate);
  if (years >= 15) return Number(settings.vacationAfter15Years) || 15;
  if (years >= 12) return Number(settings.vacationAfter12Years) || 14;
  if (years >= 9) return Number(settings.vacationAfter9Years) || 12;
  if (years >= 6) return Number(settings.vacationAfter6Years) || 10;
  if (years >= 3) return Number(settings.vacationAfter3Years) || 8;
  if (years >= 1) return Number(settings.vacationAfter1Year) || 6;
  return 0;
}

function workdayTabButton(tab, icon, label) {
  return `<button class="tab-button ${state.workdayTab === tab ? "active" : ""}" data-workday-tab="${tab}" type="button"><i data-lucide="${icon}"></i><span>${label}</span></button>`;
}

function renderWorkday() {
  const imported = Boolean(state.migrationStatus?.workdayMigrationId);
  const loadingFirstTime = state.workdayLoading && !state.workdayDataKey;
  const counts = state.migrationStatus?.workdayCounts || {};

  els.workdayView.innerHTML = `
    <div class="page-grid">
      <article class="panel workday-hero">
        <div class="panel-head">
          <div><h2>Workday Insight</h2><p>เวลาสายรายเดือน วันลา และสรุปสิทธิ์จาก Employee Master กลาง</p></div>
          <span class="badge ${imported ? "badge-ready" : "badge-progress"}">${imported ? "Phase 2 พร้อมใช้งาน" : "ยังไม่มีข้อมูล"}</span>
        </div>
        ${imported
          ? `<div class="notice notice-success"><i data-lucide="circle-check"></i><div>นำเข้าข้อมูลแล้ว: เวลาสาย <strong>${Number(counts.attendanceMonthly) || 0}</strong> รายการ · วันลา <strong>${Number(counts.leaveRecords) || 0}</strong> รายการ</div></div>`
          : `<div class="notice notice-warning"><i data-lucide="triangle-alert"></i><div>ไม่พบข้อมูล Workday เดิมในระบบ Production หากจำเป็นต้องกู้หรือนำเข้าข้อมูลย้อนหลัง ให้ใช้ชุด Migration Tools Archive ภายในบริษัท</div></div>`}
        <div class="tab-list" role="tablist" aria-label="Workday Insight">
          ${workdayTabButton("attendance", "clock-3", "เวลาสาย")}
          ${workdayTabButton("leave", "calendar-off", "วันลา")}
          ${workdayTabButton("balance", "calculator", "สิทธิ์ลาคงเหลือ")}
        </div>
      </article>
      ${loadingFirstTime ? `<div class="loading-skeleton"></div>` : renderWorkdayTabContent()}
    </div>`;

  els.workdayView.querySelectorAll("[data-workday-tab]").forEach((button) => button.addEventListener("click", () => {
    state.workdayTab = button.dataset.workdayTab;
    state.leaveEditingId = "";
    renderWorkday();
    ensureIcons();
  }));
  bindWorkdayTabEvents();
  ensureIcons();
}

function renderWorkdayTabContent() {
  if (state.workdayTab === "leave") return renderLeaveSection();
  if (state.workdayTab === "balance") return renderLeaveBalanceSection();
  return renderAttendanceSection();
}

function renderAttendanceSection() {
  const employees = sortedActiveEmployees();
  const recordsByEmployee = new Map(state.attendanceMonthly.map((record) => [record.employeeId, record]));
  const selected = selectedAttendanceRecord();
  const records = state.attendanceMonthly.filter((record) => record.yearMonth === state.workdayMonth);
  const totalMinutes = records.reduce((sum, record) => sum + record.lateMinutes, 0);
  const averageScore = records.length ? records.reduce((sum, record) => sum + record.lateScore, 0) / records.length : 0;
  const missingCount = Math.max(0, employees.length - records.length);
  const previewMinutes = selected?.lateMinutes ?? 0;

  return `
    <div class="split-grid workday-entry-grid">
      <article class="panel">
        <div class="panel-head"><div><h2>บันทึกเวลาสายรายเดือน</h2><p>หนึ่งพนักงานต่อหนึ่งเดือน คะแนนคำนวณอัตโนมัติ</p></div></div>
        <form id="attendanceForm">
          <div class="form-grid">
            <div class="field"><label for="workdayMonth">เดือน</label><input id="workdayMonth" type="month" required value="${escapeHtml(state.workdayMonth)}" /></div>
            <div class="field"><label for="attendanceEmployee">พนักงาน</label><select id="attendanceEmployee" required><option value="">เลือกพนักงาน</option>${employees.map((employee) => `<option value="${escapeHtml(employee.id)}" ${employee.id === state.attendanceEmployeeId ? "selected" : ""}>${escapeHtml(`${employee.employeeCode} · ${employee.fullName}`)}</option>`).join("")}</select></div>
            <div class="field field-full"><label for="lateMinutes">นาทีสายรวมทั้งเดือน</label><input id="lateMinutes" type="number" min="0" step="1" value="${previewMinutes}" required /></div>
            <div class="score-preview field-full"><span>คะแนนเวลา</span><strong id="lateScorePreview">${calculateLateScore(previewMinutes)}</strong><small>0–29 = 100 · 30–59 = 90 · 60–89 = 80 · 90–119 = 70 · 120+ = 60</small></div>
          </div>
          <div class="form-actions"><button class="button button-primary" type="submit"><i data-lucide="save"></i>${selected ? "อัปเดตเวลาสาย" : "บันทึกเวลาสาย"}</button><button id="clearAttendanceForm" class="button button-ghost" type="button">ล้างฟอร์ม</button></div>
        </form>
      </article>
      <article class="panel">
        <div class="panel-head"><div><h2>สรุปเดือน ${escapeHtml(state.workdayMonth)}</h2><p>ไม่เติมข้อมูลที่ไม่มีแถวต้นฉบับเป็น 0 โดยอัตโนมัติ</p></div><button id="exportAttendanceButton" class="button button-secondary button-small" type="button"><i data-lucide="file-down"></i>Export CSV</button></div>
        <div class="kpi-grid compact-kpi-grid">
          <article class="kpi-card"><div class="kpi-head"><span>บันทึกแล้ว</span><span class="kpi-icon"><i data-lucide="database"></i></span></div><div class="kpi-value">${records.length}/${employees.length}</div></article>
          <article class="kpi-card"><div class="kpi-head"><span>นาทีสายรวม</span><span class="kpi-icon"><i data-lucide="timer"></i></span></div><div class="kpi-value">${formatNumber(totalMinutes, 0)}</div></article>
          <article class="kpi-card"><div class="kpi-head"><span>คะแนนเฉลี่ย</span><span class="kpi-icon"><i data-lucide="gauge"></i></span></div><div class="kpi-value">${records.length ? formatNumber(averageScore, 1) : "-"}</div></article>
          <article class="kpi-card"><div class="kpi-head"><span>ยังไม่บันทึก</span><span class="kpi-icon"><i data-lucide="circle-dashed"></i></span></div><div class="kpi-value">${missingCount}</div></article>
        </div>
      </article>
    </div>
    <article class="panel">
      <div class="panel-head"><div><h2>เวลาสายพนักงานประจำเดือน</h2><p>เรียงตามรหัสพนักงานและอายุงาน</p></div></div>
      <div class="table-wrap"><table>
        <thead><tr><th>รหัส</th><th>ชื่อพนักงาน</th><th class="money">นาทีสาย</th><th class="money">คะแนน</th><th>สถานะ</th><th>แก้ไขล่าสุด</th><th></th></tr></thead>
        <tbody>${employees.map((employee) => {
          const record = recordsByEmployee.get(employee.id);
          return `<tr><td><strong>${escapeHtml(employee.employeeCode)}</strong></td><td>${escapeHtml(employee.fullName)}</td><td class="money">${record ? formatNumber(record.lateMinutes, 0) : "-"}</td><td class="money">${record ? `<strong>${record.lateScore}</strong>` : "-"}</td><td><span class="badge ${record ? "badge-ready" : "badge-planned"}">${record ? "บันทึกแล้ว" : "ยังไม่มีข้อมูล"}</span></td><td>${record ? formatDate(record.updatedAt) : "-"}</td><td><div class="actions-cell"><button class="icon-button edit-attendance" data-employee-id="${escapeHtml(employee.id)}" type="button" aria-label="${record ? "แก้ไข" : "เพิ่ม"}"><i data-lucide="${record ? "pencil" : "plus"}"></i></button>${record ? `<button class="icon-button delete-attendance" data-id="${escapeHtml(record.id)}" data-employee-id="${escapeHtml(employee.id)}" type="button" aria-label="ลบ"><i data-lucide="trash-2"></i></button>` : ""}</div></td></tr>`;
        }).join("")}</tbody>
      </table></div>
    </article>`;
}

function renderLeaveSection() {
  const employees = sortedActiveEmployees();
  const editing = selectedLeaveRecord();
  const editingType = normalizedLeaveType(editing?.leaveType);
  const filtered = state.leaveRecords.filter((record) => {
    if (record.year !== Number(state.workdayYear)) return false;
    if (state.leaveEmployeeId && record.employeeId !== state.leaveEmployeeId) return false;
    if (state.leaveTypeFilter && normalizedLeaveType(record.leaveType) !== state.leaveTypeFilter) return false;
    return true;
  });
  const employeesById = employeeMap();
  const totalDays = filtered.reduce((sum, record) => sum + record.days, 0);
  const typeTotals = Object.keys(LEAVE_TYPE_LABELS).map((type) => [
    type,
    filtered
      .filter((record) => normalizedLeaveType(record.leaveType) === type)
      .reduce((sum, record) => sum + record.days, 0),
  ]);

  return `
    <div class="split-grid workday-entry-grid">
      <article class="panel">
        <div class="panel-head"><div><h2>${editing ? "แก้ไขวันลา" : "บันทึกวันลา"}</h2><p>รองรับลาป่วย ลากิจ ลาพักร้อน และลาอื่นๆ โดยระบุรายละเอียดของลาอื่นๆ ในช่องหมายเหตุ</p></div>${editing ? `<span class="badge badge-progress">กำลังแก้ไข</span>` : ""}</div>
        <form id="leaveForm">
          <div class="form-grid">
            <div class="field"><label for="leaveEmployee">พนักงาน</label><select id="leaveEmployee" required><option value="">เลือกพนักงาน</option>${employees.map((employee) => `<option value="${escapeHtml(employee.id)}" ${(editing?.employeeId || "") === employee.id ? "selected" : ""}>${escapeHtml(`${employee.employeeCode} · ${employee.fullName}`)}</option>`).join("")}</select></div>
            <div class="field"><label for="leaveDate">วันที่เริ่มลา</label><input id="leaveDate" type="date" required value="${escapeHtml(editing?.date || `${state.workdayYear}-01-01`)}" /></div>
            <div class="field"><label for="leaveType">ประเภท</label><select id="leaveType" required>${Object.entries(LEAVE_TYPE_LABELS).map(([type, label]) => `<option value="${type}" ${editingType === type ? "selected" : ""}>${label}</option>`).join("")}</select></div>
            <div class="field"><label for="leaveDays">จำนวนวัน</label><input id="leaveDays" type="number" min="0.5" max="365" step="0.5" required value="${editing?.days ?? 1}" /></div>
            <div class="field field-full"><label for="leaveNote">หมายเหตุ</label><textarea id="leaveNote" maxlength="1000" placeholder="ระบุรายละเอียดของลาอื่นๆ">${escapeHtml(editing?.note || "")}</textarea></div>
            <label class="check-field field-full"><input id="leaveExcludeHolidays" type="checkbox" ${editing?.excludeHolidays ? "checked" : ""} /><span>นับเฉพาะวันทำงาน ไม่รวมวันหยุด</span></label>
          </div>
          <div class="form-actions"><button class="button button-primary" type="submit"><i data-lucide="save"></i>${editing ? "อัปเดตวันลา" : "บันทึกวันลา"}</button><button id="clearLeaveForm" class="button button-ghost" type="button">${editing ? "ยกเลิกแก้ไข" : "ล้างฟอร์ม"}</button></div>
        </form>
      </article>
      <article class="panel">
        <div class="panel-head"><div><h2>สรุปวันลา พ.ศ. ${Number(state.workdayYear) + 543}</h2><p>รวมตามตัวกรองที่เลือก</p></div><button id="exportLeaveButton" class="button button-secondary button-small" type="button"><i data-lucide="file-down"></i>Export CSV</button></div>
        <div class="kpi-grid compact-kpi-grid">
          <article class="kpi-card"><div class="kpi-head"><span>รายการ</span><span class="kpi-icon"><i data-lucide="list"></i></span></div><div class="kpi-value">${filtered.length}</div></article>
          <article class="kpi-card"><div class="kpi-head"><span>วันลารวม</span><span class="kpi-icon"><i data-lucide="calendar-minus-2"></i></span></div><div class="kpi-value">${formatNumber(totalDays)}</div></article>
          ${typeTotals.filter(([, days]) => days > 0).slice(0, 2).map(([type, days]) => `<article class="kpi-card"><div class="kpi-head"><span>${leaveTypeLabel(type)}</span><span class="kpi-icon"><i data-lucide="calendar-days"></i></span></div><div class="kpi-value">${formatNumber(days)}</div></article>`).join("")}
        </div>
      </article>
    </div>
    <article class="panel">
      <div class="panel-head"><div><h2>ประวัติวันลา</h2><p>${filtered.length} รายการจากปีที่เลือก</p></div></div>
      <div class="toolbar">
        <select id="leaveYearFilter"><option value="${state.workdayYear}">พ.ศ. ${Number(state.workdayYear) + 543}</option>${[...new Set(state.leaveRecords.map((record) => record.year))].filter((year) => year !== Number(state.workdayYear)).sort((a,b)=>b-a).map((year)=>`<option value="${year}">พ.ศ. ${year+543}</option>`).join("")}</select>
        <select id="leaveEmployeeFilter" class="toolbar-grow"><option value="">พนักงานทุกคน</option>${employees.map((employee) => `<option value="${escapeHtml(employee.id)}" ${state.leaveEmployeeId === employee.id ? "selected" : ""}>${escapeHtml(`${employee.employeeCode} · ${employee.fullName}`)}</option>`).join("")}</select>
        <select id="leaveTypeFilter"><option value="">ทุกประเภท</option>${Object.entries(LEAVE_TYPE_LABELS).map(([type, label]) => `<option value="${type}" ${state.leaveTypeFilter === type ? "selected" : ""}>${label}</option>`).join("")}</select>
      </div>
      <div class="table-wrap"><table>
        <thead><tr><th>วันที่</th><th>รหัส</th><th>ชื่อพนักงาน</th><th>ประเภท</th><th class="money">จำนวนวัน</th><th>หมายเหตุ</th><th>แก้ไขล่าสุด</th><th></th></tr></thead>
        <tbody>${filtered.map((record) => {
          const employee = employeesById.get(record.employeeId);
          return `<tr><td>${formatDateOnly(record.date)}</td><td>${escapeHtml(employee?.employeeCode || "-")}</td><td>${escapeHtml(employee?.fullName || record.employeeId)}</td><td><span class="badge ${leaveTypeBadge(record.leaveType)}">${escapeHtml(leaveTypeLabel(record.leaveType))}</span>${record.excludeHolidays ? `<small class="table-note">ไม่รวมวันหยุด</small>` : ""}</td><td class="money">${formatNumber(record.days)}</td><td>${escapeHtml(record.note || "-")}${record.migrationAdjustment ? `<small class="table-note">${escapeHtml(record.migrationAdjustment)}</small>` : ""}</td><td>${formatDate(record.updatedAt)}</td><td><div class="actions-cell"><button class="icon-button edit-leave" data-id="${escapeHtml(record.id)}" type="button" aria-label="แก้ไข"><i data-lucide="pencil"></i></button><button class="icon-button delete-leave" data-id="${escapeHtml(record.id)}" type="button" aria-label="ลบ"><i data-lucide="trash-2"></i></button></div></td></tr>`;
        }).join("") || `<tr><td colspan="8"><div class="empty-state"><i data-lucide="calendar-x"></i><p>ไม่พบข้อมูลวันลาตามตัวกรอง</p></div></td></tr>`}</tbody>
      </table></div>
    </article>`;
}

function renderLeaveBalanceSection() {
  const employees = sortedActiveEmployees();
  const settings = state.workdaySettings || { configured: false };
  const records = state.leaveRecords.filter((record) => record.year === Number(state.workdayYear));
  const usedByEmployee = new Map();
  records.forEach((record) => {
    if (!usedByEmployee.has(record.employeeId)) usedByEmployee.set(record.employeeId, {});
    const row = usedByEmployee.get(record.employeeId);
    const normalizedType = normalizedLeaveType(record.leaveType);
    row[normalizedType] = (row[normalizedType] || 0) + record.days;
  });

  return `
    <article class="panel">
      <div class="panel-head"><div><h2>สิทธิ์ลาคงเหลือ พ.ศ. ${Number(state.workdayYear) + 543}</h2><p>คำนวณจากวันลาที่บันทึกและกฎบริษัทที่ตั้งค่า</p></div><div class="panel-actions"><select id="balanceYearFilter">${[state.workdayYear, ...[...new Set(state.leaveRecords.map((record) => record.year))].filter((year) => year !== Number(state.workdayYear)).sort((a,b)=>b-a)].map((year)=>`<option value="${year}" ${Number(year)===Number(state.workdayYear)?"selected":""}>พ.ศ. ${Number(year)+543}</option>`).join("")}</select><button id="workdaySettingsButton" class="button button-secondary button-small" type="button"><i data-lucide="settings-2"></i>ตั้งค่าสิทธิ์</button></div></div>
      ${settings.configured
        ? `<div class="notice notice-info"><i data-lucide="info"></i><div>พักร้อนตามเกณฑ์ 6/8/10/12/14/15 วัน และคำนวณอายุงาน ณ <strong>${settings.vacationReference === "yearEnd" ? "สิ้นปี" : "วันที่ 1 มกราคม"}</strong> · อัปเดต ${formatDate(settings.updatedAt)}</div></div>`
        : `<div class="notice notice-warning"><i data-lucide="triangle-alert"></i><div><strong>ยังไม่ได้ตั้งค่าสิทธิ์วันลาของบริษัท</strong><br>ระบบจะแสดงจำนวนวันที่ใช้แล้ว แต่ยังไม่แสดงยอดคงเหลือจนกว่าจะบันทึกกฎในปุ่ม “ตั้งค่าสิทธิ์”</div></div>`}
      <div class="table-wrap" style="margin-top:16px"><table class="balance-table">
        <thead><tr><th>รหัส</th><th>ชื่อพนักงาน</th><th>อายุงาน</th><th class="money">ลาป่วย ใช้/สิทธิ์/คงเหลือ</th><th class="money">ลากิจ ใช้/สิทธิ์/คงเหลือ</th><th class="money">พักร้อน ใช้/สิทธิ์/คงเหลือ</th><th class="money">ลาอื่นๆ</th></tr></thead>
        <tbody>${employees.map((employee) => {
          const used = usedByEmployee.get(employee.id) || {};
          const refDate = settings.vacationReference === "yearEnd" ? `${state.workdayYear}-12-31` : `${state.workdayYear}-01-01`;
          const serviceYears = fullYearsBetween(employee.startDate, refDate);
          const vacationAllowed = vacationEntitlement(employee, Number(state.workdayYear), settings);
          const cells = [
            [used.sick || 0, settings.configured ? settings.sickAnnualDays : null],
            [used.personal || 0, settings.configured ? settings.personalAnnualDays : null],
            [used.vacation || 0, vacationAllowed],
          ].map(([usedDays, allowed]) => allowed === null ? `${formatNumber(usedDays)} / - / -` : `${formatNumber(usedDays)} / ${formatNumber(allowed)} / <strong class="${allowed-usedDays<0?"negative":"positive"}">${formatNumber(allowed-usedDays)}</strong>`);
          const otherLeaveUsed = Number(used.other) || 0;
          return `<tr><td><strong>${escapeHtml(employee.employeeCode)}</strong></td><td>${escapeHtml(employee.fullName)}</td><td>${serviceYears} ปี</td><td class="money">${cells[0]}</td><td class="money">${cells[1]}</td><td class="money">${cells[2]}</td><td class="money">${formatNumber(otherLeaveUsed)}</td></tr>`;
        }).join("")}</tbody>
      </table></div>
    </article>`;
}

function bindWorkdayTabEvents() {
  if (state.workdayTab === "attendance") bindAttendanceEvents();
  if (state.workdayTab === "leave") bindLeaveEvents();
  if (state.workdayTab === "balance") bindLeaveBalanceEvents();
}

function bindAttendanceEvents() {
  const monthInput = document.getElementById("workdayMonth");
  const employeeInput = document.getElementById("attendanceEmployee");
  const lateInput = document.getElementById("lateMinutes");
  monthInput?.addEventListener("change", () => {
    state.workdayMonth = monthInput.value;
    state.workdayYear = Number(monthInput.value.slice(0, 4)) || state.workdayYear;
    state.attendanceEmployeeId = "";
    state.workdayDataKey = "";
    void refreshWorkdayData({ force: true });
  });
  employeeInput?.addEventListener("change", () => {
    state.attendanceEmployeeId = employeeInput.value;
    renderWorkday();
  });
  lateInput?.addEventListener("input", () => {
    const preview = document.getElementById("lateScorePreview");
    if (preview) preview.textContent = String(calculateLateScore(lateInput.value));
  });
  document.getElementById("clearAttendanceForm")?.addEventListener("click", () => {
    state.attendanceEmployeeId = "";
    renderWorkday();
  });
  document.getElementById("attendanceForm")?.addEventListener("submit", async (event) => {
    event.preventDefault();
    if (!state.attendanceEmployeeId) return showToast("กรุณาเลือกพนักงาน", "warning");
    const existing = selectedAttendanceRecord();
    const submit = event.submitter;
    submit.disabled = true;
    try {
      await window.EmployeeHubDatabase.saveAttendanceMonthly({
        employeeId: state.attendanceEmployeeId,
        yearMonth: state.workdayMonth,
        lateMinutes: document.getElementById("lateMinutes").value,
        expectedVersion: existing?.version || 0,
      });
      showToast(existing ? "อัปเดตเวลาสายแล้ว" : "บันทึกเวลาสายแล้ว");
      state.workdayDataKey = "";
      await refreshWorkdayData({ force: true, quiet: true });
    } catch (error) {
      if (error.code === "VERSION_CONFLICT") showToast("ข้อมูลเวลาสายเปลี่ยนแล้ว กรุณาโหลดใหม่", "warning");
      else showToast(error.message, "error");
    } finally { submit.disabled = false; }
  });
  document.getElementById("exportAttendanceButton")?.addEventListener("click", exportAttendanceCsv);
  els.workdayView.querySelectorAll(".edit-attendance").forEach((button) => button.addEventListener("click", () => {
    state.attendanceEmployeeId = button.dataset.employeeId;
    renderWorkday();
    window.scrollTo({ top: 0, behavior: "smooth" });
  }));
  els.workdayView.querySelectorAll(".delete-attendance").forEach((button) => button.addEventListener("click", async () => {
    const employee = employeeMap().get(button.dataset.employeeId);
    if (!window.confirm(`ต้องการลบเวลาสายของ ${employee?.fullName || button.dataset.employeeId} เดือน ${state.workdayMonth} ใช่หรือไม่?`)) return;
    button.disabled = true;
    try {
      await window.EmployeeHubDatabase.deleteAttendanceMonthly(button.dataset.id);
      showToast("ลบข้อมูลเวลาสายแล้ว");
      if (state.attendanceEmployeeId === button.dataset.employeeId) state.attendanceEmployeeId = "";
      state.workdayDataKey = "";
      await refreshWorkdayData({ force: true, quiet: true });
    } catch (error) { showToast(error.message, "error"); }
  }));
}

function bindLeaveEvents() {
  document.getElementById("leaveYearFilter")?.addEventListener("change", (event) => {
    state.workdayYear = Number(event.target.value);
    state.leaveEditingId = "";
    state.workdayDataKey = "";
    void refreshWorkdayData({ force: true });
  });
  document.getElementById("leaveEmployeeFilter")?.addEventListener("change", (event) => { state.leaveEmployeeId = event.target.value; renderWorkday(); });
  document.getElementById("leaveTypeFilter")?.addEventListener("change", (event) => { state.leaveTypeFilter = event.target.value; renderWorkday(); });
  document.getElementById("clearLeaveForm")?.addEventListener("click", () => { state.leaveEditingId = ""; renderWorkday(); });
  document.getElementById("leaveForm")?.addEventListener("submit", async (event) => {
    event.preventDefault();
    const editing = selectedLeaveRecord();
    const submit = event.submitter;
    submit.disabled = true;
    try {
      const result = await window.EmployeeHubDatabase.saveLeaveRecord({
        id: editing?.id,
        employeeId: document.getElementById("leaveEmployee").value,
        date: document.getElementById("leaveDate").value,
        leaveType: document.getElementById("leaveType").value,
        days: document.getElementById("leaveDays").value,
        note: document.getElementById("leaveNote").value,
        excludeHolidays: document.getElementById("leaveExcludeHolidays").checked,
        expectedVersion: editing?.version || 0,
      });
      showToast(editing ? "อัปเดตวันลาแล้ว" : "บันทึกวันลาแล้ว");
      state.workdayYear = result.year;
      state.leaveEditingId = "";
      state.workdayDataKey = "";
      await refreshWorkdayData({ force: true, quiet: true });
    } catch (error) {
      if (error.code === "VERSION_CONFLICT") showToast("ข้อมูลวันลาเปลี่ยนแล้ว กรุณาโหลดใหม่", "warning");
      else showToast(error.message, "error");
    } finally { submit.disabled = false; }
  });
  document.getElementById("exportLeaveButton")?.addEventListener("click", exportLeaveCsv);
  els.workdayView.querySelectorAll(".edit-leave").forEach((button) => button.addEventListener("click", () => {
    state.leaveEditingId = button.dataset.id;
    renderWorkday();
    window.scrollTo({ top: 0, behavior: "smooth" });
  }));
  els.workdayView.querySelectorAll(".delete-leave").forEach((button) => button.addEventListener("click", async () => {
    const record = state.leaveRecords.find((row) => row.id === button.dataset.id);
    const employee = employeeMap().get(record?.employeeId);
    if (!record || !window.confirm(`ต้องการลบ ${leaveTypeLabel(record.leaveType)} ของ ${employee?.fullName || record.employeeId} วันที่ ${formatDateOnly(record.date)} ใช่หรือไม่?`)) return;
    button.disabled = true;
    try {
      await window.EmployeeHubDatabase.deleteLeaveRecord(record.id);
      showToast("ลบวันลาแล้ว");
      if (state.leaveEditingId === record.id) state.leaveEditingId = "";
      state.workdayDataKey = "";
      await refreshWorkdayData({ force: true, quiet: true });
    } catch (error) { showToast(error.message, "error"); }
  }));
}

function bindLeaveBalanceEvents() {
  document.getElementById("balanceYearFilter")?.addEventListener("change", (event) => {
    state.workdayYear = Number(event.target.value);
    state.workdayDataKey = "";
    void refreshWorkdayData({ force: true });
  });
  document.getElementById("workdaySettingsButton")?.addEventListener("click", openWorkdaySettingsModal);
}

function openWorkdaySettingsModal() {
  const settings = state.workdaySettings || {};
  els.modalRoot.innerHTML = `
    <div class="modal-backdrop"><section class="modal-card" role="dialog" aria-modal="true" aria-labelledby="workdaySettingsTitle">
      <div class="modal-head"><div><p class="eyebrow">WORKDAY SETTINGS</p><h2 id="workdaySettingsTitle">ตั้งค่าสิทธิ์วันลา</h2></div><button id="closeModalButton" class="icon-button" type="button"><i data-lucide="x"></i></button></div>
      <div class="notice notice-warning"><i data-lucide="triangle-alert"></i><div>กรอกสิทธิลาป่วยและลากิจตามระเบียบบริษัท ส่วนพักร้อนใช้เกณฑ์ที่ได้รับการยืนยันแล้ว</div></div>
      <form id="workdaySettingsForm" style="margin-top:16px">
        <div class="form-grid">
          <div class="field"><label for="sickAnnualDays">ลาป่วยต่อปี</label><input id="sickAnnualDays" type="number" min="0" max="365" step="0.5" required value="${settings.sickAnnualDays ?? ""}" /></div>
          <div class="field"><label for="personalAnnualDays">ลากิจต่อปี</label><input id="personalAnnualDays" type="number" min="0" max="365" step="0.5" required value="${settings.personalAnnualDays ?? ""}" /></div>
          <div class="field field-full"><label>เกณฑ์วันลาพักร้อนตามอายุงาน</label><div class="table-wrap compact-policy-table"><table><thead><tr><th>อายุงาน</th><th class="money">สิทธิ์พักร้อน</th></tr></thead><tbody><tr><td>ครบ 1–2 ปี</td><td class="money">6 วัน</td></tr><tr><td>ครบ 3–5 ปี</td><td class="money">8 วัน</td></tr><tr><td>ครบ 6–8 ปี</td><td class="money">10 วัน</td></tr><tr><td>ครบ 9–11 ปี</td><td class="money">12 วัน</td></tr><tr><td>ครบ 12–14 ปี</td><td class="money">14 วัน</td></tr><tr><td>ครบ 15 ปีขึ้นไป</td><td class="money">15 วัน</td></tr></tbody></table></div></div>
          <div class="field"><label for="vacationReference">คำนวณอายุงาน ณ</label><select id="vacationReference"><option value="jan1" ${settings.vacationReference !== "yearEnd" ? "selected" : ""}>วันที่ 1 มกราคมของปี</option><option value="yearEnd" ${settings.vacationReference === "yearEnd" ? "selected" : ""}>วันที่ 31 ธันวาคมของปี</option></select></div>
          <div class="field field-full"><label for="workdaySettingsNote">หมายเหตุระเบียบบริษัท</label><textarea id="workdaySettingsNote" maxlength="1000">${escapeHtml(settings.note || "")}</textarea></div>
        </div>
        <div class="form-actions"><button class="button button-primary" type="submit"><i data-lucide="save"></i>บันทึกกฎสิทธิ์วันลา</button><button id="cancelWorkdaySettings" class="button button-ghost" type="button">ยกเลิก</button></div>
      </form>
    </section></div>`;
  ensureIcons();
  const close = () => { els.modalRoot.innerHTML = ""; };
  document.getElementById("closeModalButton").addEventListener("click", close);
  document.getElementById("cancelWorkdaySettings").addEventListener("click", close);
  document.getElementById("workdaySettingsForm").addEventListener("submit", async (event) => {
    event.preventDefault();
    const submit = event.submitter;
    submit.disabled = true;
    try {
      state.workdaySettings = await window.EmployeeHubDatabase.saveWorkdaySettings({
        sickAnnualDays: document.getElementById("sickAnnualDays").value,
        personalAnnualDays: document.getElementById("personalAnnualDays").value,
        vacationReference: document.getElementById("vacationReference").value,
        note: document.getElementById("workdaySettingsNote").value,
      });
      close();
      showToast("บันทึกสิทธิ์วันลาแล้ว");
      renderWorkday();
    } catch (error) { showToast(error.message, "error"); }
    finally { submit.disabled = false; }
  });
}

function downloadCsv(rows, filename) {
  const csv = `\ufeff${rows.map((row) => row.map(csvSafe).join(",")).join("\r\n")}`;
  const url = URL.createObjectURL(new Blob([csv], { type: "text/csv;charset=utf-8" }));
  const link = document.createElement("a");
  link.href = url;
  link.download = filename;
  link.click();
  URL.revokeObjectURL(url);
  showToast("Export CSV เรียบร้อยแล้ว");
}

function exportAttendanceCsv() {
  const recordsByEmployee = new Map(state.attendanceMonthly.map((record) => [record.employeeId, record]));
  const rows = [["เดือน", "รหัสพนักงาน", "ชื่อพนักงาน", "นาทีสาย", "คะแนนเวลา", "สถานะข้อมูล", "แก้ไขล่าสุด"]];
  sortedActiveEmployees().forEach((employee) => {
    const record = recordsByEmployee.get(employee.id);
    rows.push([state.workdayMonth, employee.employeeCode, employee.fullName, record?.lateMinutes ?? "", record?.lateScore ?? "", record ? "บันทึกแล้ว" : "ยังไม่มีข้อมูล", record?.updatedAt || ""]);
  });
  downloadCsv(rows, `workday-attendance-${state.workdayMonth}.csv`);
}

function exportLeaveCsv() {
  const employeesById = employeeMap();
  const records = state.leaveRecords.filter((record) => record.year === Number(state.workdayYear)
    && (!state.leaveEmployeeId || record.employeeId === state.leaveEmployeeId)
    && (!state.leaveTypeFilter || normalizedLeaveType(record.leaveType) === state.leaveTypeFilter));
  if (!records.length) return showToast("ไม่มีข้อมูลวันลาสำหรับ Export", "warning");
  const rows = [["วันที่", "รหัสพนักงาน", "ชื่อพนักงาน", "ประเภท", "จำนวนวัน", "ไม่รวมวันหยุด", "หมายเหตุ", "แก้ไขล่าสุด"]];
  records.forEach((record) => {
    const employee = employeesById.get(record.employeeId);
    rows.push([record.date, employee?.employeeCode || "", employee?.fullName || record.employeeId, leaveTypeLabel(record.leaveType), record.days, record.excludeHolidays ? "ใช่" : "ไม่", record.note, record.updatedAt]);
  });
  downloadCsv(rows, `workday-leave-${state.workdayYear}.csv`);
}


function monthlyStatusDefinition(statusId) {
  return MONTHLY_STATUS_MAP[statusId] || MONTHLY_STATUS_MAP.WORK;
}

function monthlyStatusLabel(statusId) {
  return monthlyStatusDefinition(statusId).name;
}

function monthlyStatusBadge(statusId) {
  const classes = {
    WORK: "badge-ready",
    WEEKEND_WORK: "badge-ready",
    SICK_LEAVE: "badge-danger",
    PERSONAL_LEAVE: "badge-progress",
    VACATION: "badge-ready",
    COMP_OFF: "badge-planned",
    HOLIDAY: "badge-planned",
  };
  return classes[statusId] || "badge-planned";
}

function monthlyMonthStatusLabel(statusId) {
  return ({ OPEN: "เปิดกรอกข้อมูล", REVIEW: "รอตรวจสอบ", CLOSED: "ปิดเดือนแล้ว" })[statusId] || "เปิดกรอกข้อมูล";
}

function monthlyMonthStatusBadge(statusId) {
  return ({ OPEN: "badge-ready", REVIEW: "badge-progress", CLOSED: "badge-danger" })[statusId] || "badge-ready";
}

function monthlyIsClosed() {
  return String(state.monthlyStatus?.status || "OPEN") === "CLOSED";
}

function monthlyDefaultDate() {
  const now = new Date();
  const today = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}-${String(now.getDate()).padStart(2, "0")}`;
  return today.startsWith(state.monthlyMonth) ? today : `${state.monthlyMonth}-01`;
}

function monthlyEntryById(id) {
  return state.monthlyEntries.find((entry) => entry.id === id) || null;
}

function monthlySelectedEntry() {
  if (state.monthlyEditingId) return monthlyEntryById(state.monthlyEditingId);
  if (!state.monthlyEmployeeId || state.monthlyEmployeeId === MONTHLY_ALL_EMPLOYEES_ID || !state.monthlyDate) return null;
  return state.monthlyEntries.find((entry) => entry.employeeId === state.monthlyEmployeeId && entry.date === state.monthlyDate) || null;
}

function monthlyRound2(value) {
  return Math.round((Number(value) + Number.EPSILON) * 100) / 100;
}

function createMonthlyIncentiveRange(maxPercent, minPercent = 50) {
  const maxScore = monthlyRound2(Math.max(minPercent, Number(maxPercent) || minPercent));
  if (maxScore <= minPercent) {
    return { maxScore, step: 0, equalAtBase: true, bands: [{ min: minPercent, max: minPercent, incentive: 60 }] };
  }
  const step = monthlyRound2((maxScore - minPercent) / 5);
  const bands = [];
  let upper = maxScore;
  [100, 90, 80, 70, 60].forEach((incentive) => {
    const lower = monthlyRound2(upper - step);
    bands.push({ min: lower, max: upper, incentive });
    upper = monthlyRound2(lower - 0.01);
  });
  return { maxScore, step, equalAtBase: false, bands };
}

function monthlyIncentiveFromRange(scoreValue, range, hasWorkDays) {
  if (!hasWorkDays) return 0;
  const score = monthlyRound2(scoreValue);
  if (range.equalAtBase) return score >= 50 ? 60 : 50;
  if (score > range.maxScore) return 100;
  const band = range.bands.find((item) => score >= item.min && score <= item.max);
  return band ? band.incentive : 50;
}

function calculateMonthlySummaryFromData(entries = [], overrides = [], employees = []) {
  const overrideMap = new Map(overrides.map((item) => [item.employeeId, Number(item.actualWorkDaysOverride)]));
  const employeesWithEntries = new Set(entries.map((entry) => entry.employeeId));
  const rows = employees
    .filter((employee) => employee.isActive || employeesWithEntries.has(employee.id))
    .sort((a, b) => (Number(a.sortOrder) || 999999) - (Number(b.sortOrder) || 999999) || a.fullName.localeCompare(b.fullName, "th"))
    .map((employee) => {
      const employeeEntries = entries.filter((entry) => entry.employeeId === employee.id);
      const autoWorkDays = new Set(employeeEntries.filter((entry) => monthlyStatusDefinition(entry.status).countsAsWork).map((entry) => entry.date)).size;
      const isOverridden = overrideMap.has(employee.id) && Number.isFinite(overrideMap.get(employee.id));
      const actualWorkDays = isOverridden ? overrideMap.get(employee.id) : autoWorkDays;
      const offDayEntries = employeeEntries.filter((entry) => !monthlyStatusDefinition(entry.status).countsAsWork && Object.keys(entry.scores || {}).length > 0);
      const criteria = {};
      MONTHLY_CRITERIA.forEach((criterion) => {
        const totalScore = employeeEntries.reduce((sum, entry) => sum + Number(entry.scores?.[criterion.id] || 0), 0);
        const averageScore = actualWorkDays > 0 ? totalScore / actualWorkDays : 0;
        const performancePercent = averageScore > 0 ? ((averageScore - 0.5) / averageScore) * 100 : 0;
        criteria[criterion.id] = { totalScore, averageScore, performancePercent, incentivePercent: null };
      });
      return {
        employeeId: employee.id,
        employeeCode: employee.employeeCode,
        employeeName: employee.fullName,
        autoWorkDays,
        actualWorkDays,
        isOverridden,
        criteria,
        offDayPerformanceDays: new Set(offDayEntries.map((entry) => entry.date)).size,
        offDayPerformanceScore: offDayEntries.reduce((sum, entry) => sum + Object.values(entry.scores || {}).reduce((sub, value) => sub + Number(value || 0), 0), 0),
      };
    });

  const incentiveRanges = {};
  MONTHLY_CRITERIA.filter((criterion) => criterion.rankEnabled).forEach((criterion) => {
    const values = [criterion.minPercent, ...rows.filter((row) => row.actualWorkDays > 0).map((row) => monthlyRound2(row.criteria[criterion.id].performancePercent))];
    const range = createMonthlyIncentiveRange(Math.max(...values), criterion.minPercent);
    incentiveRanges[criterion.id] = range;
    rows.forEach((row) => {
      row.criteria[criterion.id].incentivePercent = monthlyIncentiveFromRange(
        row.criteria[criterion.id].performancePercent,
        range,
        row.actualWorkDays > 0
      );
    });
  });

  rows.forEach((row) => {
    const performance14 = MONTHLY_CRITERIA.filter((criterion) => criterion.rankEnabled).map((criterion) => row.criteria[criterion.id].performancePercent);
    const performanceAll = MONTHLY_CRITERIA.map((criterion) => row.criteria[criterion.id].performancePercent);
    const incentives = MONTHLY_CRITERIA.filter((criterion) => criterion.rankEnabled).map((criterion) => row.criteria[criterion.id].incentivePercent);
    row.overallPerformance14 = performance14.reduce((sum, value) => sum + value, 0) / performance14.length;
    row.overallPerformance = performanceAll.reduce((sum, value) => sum + value, 0) / performanceAll.length;
    row.overallIncentive = incentives.reduce((sum, value) => sum + value, 0) / incentives.length;
  });
  return { rows, incentiveRanges };
}

function calculateMonthlySummary() {
  return calculateMonthlySummaryFromData(state.monthlyEntries, state.monthlyOverrides, state.employees);
}

function validateMonthlyDataRecords(entries, overrides, employees, monthKey) {
  const safeEntries = Array.isArray(entries) ? entries : [];
  const safeOverrides = Array.isArray(overrides) ? overrides : [];
  const safeEmployees = Array.isArray(employees) ? employees : [];
  const issues = [];
  const employeeIds = new Set(safeEmployees.map((employee) => employee.id));
  safeEntries.forEach((entry) => {
    const status = monthlyStatusDefinition(entry.status);
    const scoreValues = Object.values(entry.scores || {}).filter((value) => value !== "" && value !== null && value !== undefined);
    if (!employeeIds.has(entry.employeeId)) issues.push({ severity: "ERROR", code: "UNKNOWN_EMPLOYEE", message: "ไม่พบพนักงานใน Employee Master", details: entry });
    if (!MONTHLY_STATUS_MAP[entry.status]) issues.push({ severity: "ERROR", code: "UNKNOWN_STATUS", message: "พบสถานะที่ระบบไม่รู้จัก", details: entry });
    if (status.countsAsWork && scoreValues.length !== MONTHLY_CRITERIA.length) issues.push({ severity: "ERROR", code: "WORK_MISSING_SCORES", message: "สถานะทำงานแต่คะแนนไม่ครบ 5 หัวข้อ", details: entry });
    if (!status.countsAsWork && scoreValues.length > 0 && !String(entry.note || "").trim()) issues.push({ severity: "ERROR", code: "OFFDAY_SCORE_WITHOUT_NOTE", message: "มีคะแนนวันลา/วันหยุดแต่ไม่มีหมายเหตุ", details: entry });
    scoreValues.forEach((value) => {
      const numeric = Number(value);
      const validCurrent = numeric >= -0.5 && numeric <= 3 && Math.abs((numeric + 0.5) * 4 - Math.round((numeric + 0.5) * 4)) < 0.0001;
      const validLegacy = entry.legacyException === true && numeric === 3.5;
      if (!validCurrent && !validLegacy) issues.push({ severity: "WARNING", code: "LEGACY_SCORE_OUT_OF_RANGE", message: "คะแนนอยู่นอกช่วงปัจจุบัน", details: { entryId: entry.id, score: numeric } });
    });
  });
  const calculated = calculateMonthlySummaryFromData(safeEntries, safeOverrides, safeEmployees);
  calculated.rows.forEach((row) => {
    const totalScore = MONTHLY_CRITERIA.reduce((sum, criterion) => sum + Number(row.criteria[criterion.id].totalScore || 0), 0);
    if (row.actualWorkDays === 0 && totalScore !== 0) issues.push({ severity: "ERROR", code: "SCORE_WITH_ZERO_WORKDAYS", message: "มีคะแนนแต่วันทำงานจริงเป็น 0", details: { employeeId: row.employeeId } });
    if (row.isOverridden && row.actualWorkDays !== row.autoWorkDays) issues.push({ severity: "INFO", code: "WORKDAY_OVERRIDE", message: "วันทำงานจริงถูกกำหนดเองและต่างจาก Auto", details: { employeeId: row.employeeId, autoWorkDays: row.autoWorkDays, actualWorkDays: row.actualWorkDays } });
  });
  safeEmployees.filter((employee) => employee.isActive).forEach((employee) => {
    if (!safeEntries.some((entry) => entry.employeeId === employee.id)) issues.push({ severity: "WARNING", code: "NO_MONTH_DATA", message: "พนักงานไม่มีข้อมูลในเดือนนี้", details: { employeeId: employee.id } });
  });
  const counts = { error: 0, warning: 0, info: 0 };
  issues.forEach((issue) => { counts[issue.severity.toLowerCase()] += 1; });
  return { monthKey, checkedAt: new Date().toISOString(), passed: counts.error === 0, counts, totalIssues: issues.length, issues };
}

function validateMonthlyData() {
  return validateMonthlyDataRecords(state.monthlyEntries, state.monthlyOverrides, state.employees, state.monthlyMonth);
}

async function refreshMonthlyData({ force = false, quiet = false } = {}) {
  if (!state.user || !state.monthlyMonth) return;
  const key = state.monthlyMonth;
  if (!force && state.monthlyDataKey === key) return;
  state.monthlyLoading = true;
  if (!quiet) setSyncStatus("syncing", "กำลังโหลด Monthly Performance");
  try {
    const snapshot = await window.EmployeeHubDatabase.loadMonthlyPerformanceSnapshot(state.monthlyMonth);
    state.monthlyEntries = snapshot.entries;
    state.monthlyOverrides = snapshot.overrides;
    state.monthlyStatus = snapshot.monthStatus;
    state.monthlyDataKey = key;
    if (!state.monthlyDate || !state.monthlyDate.startsWith(state.monthlyMonth)) state.monthlyDate = monthlyDefaultDate();
    setSyncStatus("online", "เชื่อมต่อแล้ว");
    if (state.currentView === "monthly") renderMonthly();
  } catch (error) {
    console.error(error);
    setSyncStatus("error", "โหลด Monthly ไม่สำเร็จ");
    if (!quiet) showToast(error.message || "โหลด Monthly Performance ไม่สำเร็จ", "error");
  } finally {
    state.monthlyLoading = false;
  }
}

function monthlyTabButton(tab, icon, label) {
  return `<button class="tab-button ${state.monthlyTab === tab ? "active" : ""}" data-monthly-tab="${tab}" type="button"><i data-lucide="${icon}"></i><span>${label}</span></button>`;
}

function renderMonthly() {
  const imported = Boolean(state.migrationStatus?.monthlyPerformanceMigrationId);
  const counts = state.migrationStatus?.monthlyPerformanceCounts || {};
  const firstLoading = state.monthlyLoading && !state.monthlyDataKey;
  const status = String(state.monthlyStatus?.status || "OPEN");
  els.monthlyView.innerHTML = `
    <div class="page-grid">
      <article class="panel monthly-hero">
        <div class="panel-head">
          <div><h2>Monthly Performance</h2><p>คะแนนรายวัน สถานะการทำงาน วันทำงานจริง และการปิดเดือน</p></div>
          <span class="badge ${imported ? "badge-ready" : "badge-progress"}">${imported ? "Phase 3 พร้อมใช้งาน" : "ควรตรวจสอบ"}</span>
        </div>
        ${imported
          ? `<div class="notice notice-success"><i data-lucide="circle-check"></i><div>นำเข้าข้อมูลแล้ว: รายวัน <strong>${Number(counts.dailyPerformanceEntries) || 0}</strong> รายการ · Overrides <strong>${Number(counts.monthlyPerformanceOverrides) || 0}</strong> รายการ</div></div>`
          : `<div class="notice notice-warning"><i data-lucide="triangle-alert"></i><div>ไม่พบข้อมูล Monthly Performance เดิมในระบบ Production หากจำเป็นต้องกู้หรือนำเข้าข้อมูลย้อนหลัง ให้ใช้ชุด Migration Tools Archive ภายในบริษัท</div></div>`}
        <div class="monthly-toolbar">
          <div class="field compact-field"><label for="monthlyMonthPicker">เดือนประเมิน</label><input id="monthlyMonthPicker" type="month" value="${escapeHtml(state.monthlyMonth)}" /></div>
          <span class="badge ${monthlyMonthStatusBadge(status)}">${monthlyMonthStatusLabel(status)}</span>
        </div>
        <div class="tab-list" role="tablist" aria-label="Monthly Performance">
          ${monthlyTabButton("summary", "chart-column-big", "ภาพรวม")}
          ${monthlyTabButton("entry", "square-pen", "บันทึกรายวัน")}
          ${monthlyTabButton("history", "list-filter", "รายการข้อมูล")}
          ${monthlyTabButton("overrides", "calendar-cog", "วันทำงานจริง")}
          ${monthlyTabButton("control", "shield-check", "ควบคุมเดือน")}
        </div>
      </article>
      ${firstLoading ? `<div class="loading-skeleton"></div>` : renderMonthlyTabContent()}
    </div>`;

  document.getElementById("monthlyMonthPicker")?.addEventListener("change", (event) => {
    state.monthlyMonth = event.target.value || currentYearMonth();
    state.monthlyDate = monthlyDefaultDate();
    state.monthlyDataKey = "";
    state.monthlyEditingId = "";
    void refreshMonthlyData({ force: true });
  });
  els.monthlyView.querySelectorAll("[data-monthly-tab]").forEach((button) => button.addEventListener("click", () => {
    state.monthlyTab = button.dataset.monthlyTab;
    state.monthlyEditingId = "";
    renderMonthly();
  }));
  bindMonthlyTabEvents();
  ensureIcons();
}

function renderMonthlyTabContent() {
  if (state.monthlyTab === "entry") return renderMonthlyEntrySection();
  if (state.monthlyTab === "history") return renderMonthlyHistorySection();
  if (state.monthlyTab === "overrides") return renderMonthlyOverridesSection();
  if (state.monthlyTab === "control") return renderMonthlyControlSection();
  return renderMonthlySummarySection();
}

function renderMonthlySummarySection() {
  const calculated = calculateMonthlySummary();
  const rows = calculated.rows;
  const averagePerformance = rows.length ? rows.reduce((sum, row) => sum + Number(row.overallPerformance14 || 0), 0) / rows.length : 0;
  const averageIncentive = rows.length ? rows.reduce((sum, row) => sum + Number(row.overallIncentive || 0), 0) / rows.length : 0;
  return `
    <article class="panel">
      <div class="panel-head"><div><h2>สรุปประจำเดือน ${escapeHtml(state.monthlyMonth)}</h2><p>สูตรคำนวณตรงกับ Monthly Performance V3.0.2 เดิม</p></div><button id="exportMonthlySummaryButton" class="button button-secondary button-small" type="button"><i data-lucide="download"></i>Export CSV</button></div>
      <div class="compact-kpi-grid">
        <div class="compact-kpi"><span>รายการรายวัน</span><strong>${state.monthlyEntries.length}</strong></div>
        <div class="compact-kpi"><span>พนักงานมีข้อมูล</span><strong>${new Set(state.monthlyEntries.map((entry) => entry.employeeId)).size}</strong></div>
        <div class="compact-kpi"><span>Performance เฉลี่ย 1–4</span><strong>${formatNumber(averagePerformance, 2)}%</strong></div>
        <div class="compact-kpi"><span>Incentive เฉลี่ย</span><strong>${formatNumber(averageIncentive, 1)}%</strong></div>
      </div>
      <div class="table-wrap monthly-summary-table"><table>
        <thead><tr><th>รหัส</th><th>พนักงาน</th><th class="money">วันทำงาน</th>${MONTHLY_CRITERIA.map((criterion, index) => `<th class="money">หัวข้อ ${index + 1}${criterion.rankEnabled ? " / Inc." : ""}</th>`).join("")}<th class="money">เฉลี่ย 1–4</th><th class="money">เฉลี่ย 1–5</th><th class="money">Inc. รวม</th></tr></thead>
        <tbody>${rows.map((row) => `<tr>
          <td><strong>${escapeHtml(row.employeeCode || "-")}</strong></td>
          <td>${escapeHtml(row.employeeName)}${row.offDayPerformanceDays ? `<span class="table-note">คะแนนวันหยุด ${row.offDayPerformanceDays} วัน</span>` : ""}</td>
          <td class="money">${formatNumber(row.actualWorkDays, 0)}${row.isOverridden ? `<span class="table-note">Auto ${formatNumber(row.autoWorkDays, 0)}</span>` : ""}</td>
          ${MONTHLY_CRITERIA.map((criterion) => {
            const item = row.criteria[criterion.id];
            const level = item.performancePercent >= criterion.minPercent ? "score-good" : "score-low";
            return `<td class="money ${level}"><strong>${formatNumber(item.performancePercent, 2)}%</strong>${criterion.rankEnabled ? `<span class="table-note">Inc. ${formatNumber(item.incentivePercent, 0)}%</span>` : ""}</td>`;
          }).join("")}
          <td class="money"><strong>${formatNumber(row.overallPerformance14, 2)}%</strong></td>
          <td class="money"><strong>${formatNumber(row.overallPerformance, 2)}%</strong></td>
          <td class="money"><strong>${formatNumber(row.overallIncentive, 1)}%</strong></td>
        </tr>`).join("") || `<tr><td colspan="11"><div class="empty-state"><i data-lucide="inbox"></i><p>ยังไม่มีข้อมูลเดือนนี้</p></div></td></tr>`}</tbody>
      </table></div>
    </article>
    <article class="panel">
      <div class="panel-head"><div><h2>ช่วง Incentive</h2><p>คำนวณแบบ Dynamic Range จากคะแนนสูงสุดของเดือน</p></div></div>
      <div class="range-grid">${MONTHLY_CRITERIA.filter((criterion) => criterion.rankEnabled).map((criterion, index) => {
        const range = calculated.incentiveRanges[criterion.id];
        return `<article class="range-card"><h3>หัวข้อ ${index + 1}: ${escapeHtml(criterion.name)}</h3><table><tbody>${range.bands.map((band) => `<tr><td>${formatNumber(band.min, 2)}–${formatNumber(band.max, 2)}</td><td class="money">${band.incentive}%</td></tr>`).join("")}<tr><td>ต่ำกว่าช่วง</td><td class="money">50%</td></tr></tbody></table></article>`;
      }).join("")}</div>
    </article>`;
}

function monthlyEmployeeOptions(selectedId, includeAll = false) {
  return `${includeAll ? `<option value="${MONTHLY_ALL_EMPLOYEES_ID}" ${selectedId === MONTHLY_ALL_EMPLOYEES_ID ? "selected" : ""}>พนักงานทุกคน</option>` : ""}${sortedActiveEmployees().map((employee) => `<option value="${escapeHtml(employee.id)}" ${employee.id === selectedId ? "selected" : ""}>${escapeHtml(employee.employeeCode)} · ${escapeHtml(employee.fullName)}</option>`).join("")}`;
}

function renderMonthlyEntrySection() {
  const editing = monthlySelectedEntry();
  const selectedEmployeeId = editing?.employeeId || state.monthlyEmployeeId || sortedActiveEmployees()[0]?.id || "";
  const selectedDate = editing?.date || state.monthlyDate || monthlyDefaultDate();
  const selectedStatus = editing?.status || state.monthlyEntryStatus || "WORK";
  const selectedDefinition = monthlyStatusDefinition(selectedStatus);
  const hasScores = Object.keys(editing?.scores || {}).length > 0;
  const offDayPerformance = !selectedDefinition.countsAsWork && hasScores;
  const locked = monthlyIsClosed();
  return `
    <div class="split-grid monthly-entry-grid">
      <article class="panel">
        <div class="panel-head"><div><h2>${editing ? "แก้ไขข้อมูลรายวัน" : "บันทึกข้อมูลรายวัน"}</h2><p>คะแนน −0.50 ถึง 3.00 เพิ่มครั้งละ 0.25</p></div><span class="badge ${monthlyMonthStatusBadge(state.monthlyStatus?.status)}">${monthlyMonthStatusLabel(state.monthlyStatus?.status)}</span></div>
        ${locked ? `<div class="notice notice-warning"><i data-lucide="lock-keyhole"></i><div>เดือนนี้ถูกปิดแล้ว ต้องเปิดเดือนกลับมาแก้ไขก่อน</div></div>` : ""}
        <form id="monthlyEntryForm">
          <div class="form-grid">
            <div class="field"><label for="monthlyEntryDate">วันที่</label><input id="monthlyEntryDate" type="date" min="${state.monthlyMonth}-01" max="${state.monthlyMonth}-31" value="${escapeHtml(selectedDate)}" required ${locked ? "disabled" : ""} /></div>
            <div class="field"><label for="monthlyEntryEmployee">พนักงาน</label><select id="monthlyEntryEmployee" required ${editing || locked ? "disabled" : ""}>${monthlyEmployeeOptions(selectedEmployeeId, !editing)}</select></div>
            <div class="field"><label for="monthlyEntryStatus">สถานะ</label><select id="monthlyEntryStatus" required ${locked ? "disabled" : ""}>${MONTHLY_STATUSES.map((status) => `<option value="${status.id}" ${status.id === selectedStatus ? "selected" : ""}>${escapeHtml(status.name)}</option>`).join("")}</select></div>
            <div class="field"><label>คะแนนนอกวันทำงาน</label><label class="check-field"><input id="monthlyOffDayPerformance" type="checkbox" ${offDayPerformance ? "checked" : ""} ${selectedDefinition.countsAsWork || locked ? "disabled" : ""} /> ทำคะแนนในวันลา/วันหยุด</label></div>
          </div>
          <div id="monthlyCriteriaGrid" class="criteria-grid">${MONTHLY_CRITERIA.map((criterion, index) => {
            const value = editing?.scores?.[criterion.id] ?? criterion.normalScore;
            return `<label class="criterion-card field"><span class="criterion-title">${index + 1}. ${escapeHtml(criterion.name)}</span><select data-monthly-criterion="${criterion.id}" ${locked || (!selectedDefinition.countsAsWork && !offDayPerformance) ? "disabled" : ""}>${MONTHLY_SCORE_OPTIONS.map((score) => `<option value="${score}" ${Number(score) === Number(value) ? "selected" : ""}>${Number(score).toFixed(2)}</option>`).join("")}${Number(value) === 3.5 ? `<option value="3.5" selected>3.50 · ประวัติพิเศษ</option>` : ""}</select><span class="criterion-hint">พื้นฐาน ${criterion.normalScore.toFixed(2)}</span></label>`;
          }).join("")}</div>
          <div class="field" style="margin-top:14px"><label for="monthlyEntryNote">หมายเหตุ</label><textarea id="monthlyEntryNote" maxlength="1000" ${locked ? "disabled" : ""}>${escapeHtml(editing?.note || "")}</textarea><span class="field-help">กรณีทำคะแนนในวันลา/วันหยุดต้องระบุหมายเหตุ</span></div>
          <div class="form-actions"><button class="button button-primary" type="submit" ${locked ? "disabled" : ""}><i data-lucide="save"></i>${editing ? "บันทึกการแก้ไข" : "บันทึกรายวัน"}</button><button id="clearMonthlyEntryForm" class="button button-ghost" type="button"><i data-lucide="rotate-ccw"></i>ล้างฟอร์ม</button></div>
        </form>
      </article>
      <article class="panel">
        <div class="panel-head"><div><h2>คำอธิบายคะแนน</h2><p>เกณฑ์เดิมจาก Monthly Performance V3.0.2</p></div></div>
        <div class="notice notice-info"><i data-lucide="info"></i><div>หัวข้อ 1–4 ใช้จัดช่วง Incentive แบบเปรียบเทียบภายในเดือน ส่วนหัวข้อ 5 ใช้คำนวณ Performance รวมแต่ไม่จัดอันดับ Incentive</div></div>
        <div class="score-guide"><div><strong>−0.50 ถึง 0.75</strong><span>ต่ำกว่าค่าพื้นฐาน</span></div><div><strong>1.00</strong><span>ค่าพื้นฐานหัวข้อ 1–4</span></div><div><strong>1.50</strong><span>ค่าพื้นฐานหัวข้อ 5</span></div><div><strong>สูงสุด 3.00</strong><span>เพิ่มครั้งละ 0.25</span></div></div>
      </article>
    </div>`;
}

function renderMonthlyHistorySection() {
  const employeesById = employeeMap();
  const rows = state.monthlyEntries
    .filter((entry) => !state.monthlyHistoryEmployeeId || entry.employeeId === state.monthlyHistoryEmployeeId)
    .filter((entry) => !state.monthlyHistoryDate || entry.date === state.monthlyHistoryDate)
    .sort((a, b) => b.date.localeCompare(a.date) || (employeesById.get(a.employeeId)?.sortOrder || 9999) - (employeesById.get(b.employeeId)?.sortOrder || 9999));
  return `
    <article class="panel">
      <div class="panel-head"><div><h2>รายการข้อมูลรายวัน</h2><p>${rows.length} จาก ${state.monthlyEntries.length} รายการในเดือน ${escapeHtml(state.monthlyMonth)}</p></div><button id="exportMonthlyEntriesButton" class="button button-secondary button-small" type="button"><i data-lucide="download"></i>Export CSV</button></div>
      <div class="toolbar monthly-filter-toolbar">
        <div class="field compact-field"><label for="monthlyHistoryEmployee">พนักงาน</label><select id="monthlyHistoryEmployee"><option value="">ทุกคน</option>${monthlyEmployeeOptions(state.monthlyHistoryEmployeeId)}</select></div>
        <div class="field compact-field"><label for="monthlyHistoryDate">วันที่</label><input id="monthlyHistoryDate" type="date" min="${state.monthlyMonth}-01" max="${state.monthlyMonth}-31" value="${escapeHtml(state.monthlyHistoryDate)}" /></div>
        <button id="clearMonthlyHistoryFilter" class="button button-ghost button-small" type="button"><i data-lucide="x"></i>ล้างตัวกรอง</button>
      </div>
      <div class="table-wrap monthly-history-table"><table><thead><tr><th>วันที่</th><th>พนักงาน</th><th>สถานะ</th>${MONTHLY_CRITERIA.map((_, index) => `<th class="money">C${index + 1}</th>`).join("")}<th>หมายเหตุ</th><th>จัดการ</th></tr></thead><tbody>${rows.map((entry) => {
        const employee = employeesById.get(entry.employeeId);
        return `<tr><td>${formatDateOnly(entry.date)}</td><td><strong>${escapeHtml(employee?.employeeCode || "-")}</strong><span class="table-note">${escapeHtml(employee?.fullName || entry.employeeId)}</span></td><td><span class="badge ${monthlyStatusBadge(entry.status)}">${escapeHtml(monthlyStatusLabel(entry.status))}</span>${entry.legacyException ? `<span class="table-note">มีคะแนนประวัติพิเศษ</span>` : ""}</td>${MONTHLY_CRITERIA.map((criterion) => `<td class="money">${entry.scores?.[criterion.id] === undefined ? "-" : Number(entry.scores[criterion.id]).toFixed(2)}</td>`).join("")}<td>${escapeHtml(entry.note || "-")}</td><td><div class="table-actions"><button class="icon-button edit-monthly-entry" data-id="${escapeHtml(entry.id)}" type="button" title="แก้ไข"><i data-lucide="pencil"></i></button><button class="icon-button danger delete-monthly-entry" data-id="${escapeHtml(entry.id)}" type="button" title="ลบ" ${monthlyIsClosed() ? "disabled" : ""}><i data-lucide="trash-2"></i></button></div></td></tr>`;
      }).join("") || `<tr><td colspan="11"><div class="empty-state"><i data-lucide="inbox"></i><p>ไม่พบข้อมูลตามตัวกรอง</p></div></td></tr>`}</tbody></table></div>
    </article>`;
}

function renderMonthlyOverridesSection() {
  const calculated = calculateMonthlySummary();
  const overridesByEmployee = new Map(state.monthlyOverrides.map((record) => [record.employeeId, record]));
  return `
    <article class="panel">
      <div class="panel-head"><div><h2>กำหนดวันทำงานจริง</h2><p>ใช้ Override เฉพาะกรณีวันทำงานจริงต่างจากจำนวนวันที่ระบบคำนวณอัตโนมัติ</p></div></div>
      ${monthlyIsClosed() ? `<div class="notice notice-warning"><i data-lucide="lock-keyhole"></i><div>เดือนนี้ถูกปิดแล้ว ไม่สามารถแก้วันทำงานจริงได้</div></div>` : ""}
      <div class="table-wrap"><table><thead><tr><th>รหัส</th><th>พนักงาน</th><th class="money">Auto</th><th class="money">วันทำงานจริง</th><th>สถานะ</th><th>จัดการ</th></tr></thead><tbody>${calculated.rows.map((row) => {
        const record = overridesByEmployee.get(row.employeeId);
        return `<tr><td><strong>${escapeHtml(row.employeeCode)}</strong></td><td>${escapeHtml(row.employeeName)}</td><td class="money">${formatNumber(row.autoWorkDays, 0)}</td><td><input class="monthly-override-input compact-number-input" data-employee-id="${escapeHtml(row.employeeId)}" type="number" min="0" max="31" step="1" value="${record ? escapeHtml(record.actualWorkDaysOverride) : ""}" placeholder="Auto" ${monthlyIsClosed() ? "disabled" : ""} /></td><td>${record ? `<span class="badge badge-progress">กำหนดเอง</span>` : `<span class="badge badge-ready">Auto</span>`}</td><td><div class="table-actions"><button class="button button-secondary button-small save-monthly-override" data-employee-id="${escapeHtml(row.employeeId)}" type="button" ${monthlyIsClosed() ? "disabled" : ""}><i data-lucide="save"></i>บันทึก</button>${record ? `<button class="button button-ghost button-small clear-monthly-override" data-id="${escapeHtml(record.id)}" type="button" ${monthlyIsClosed() ? "disabled" : ""}><i data-lucide="x"></i>ใช้ Auto</button>` : ""}</div></td></tr>`;
      }).join("")}</tbody></table></div>
    </article>`;
}

function renderMonthlyControlSection() {
  const validation = validateMonthlyData();
  const status = String(state.monthlyStatus?.status || "OPEN");
  const employeesById = employeeMap();
  return `
    <article class="panel">
      <div class="panel-head"><div><h2>ควบคุมเดือน ${escapeHtml(state.monthlyMonth)}</h2><p>ตรวจสอบ ส่งตรวจ ปิดเดือน หรือเปิดกลับมาแก้ไข</p></div><span class="badge ${monthlyMonthStatusBadge(status)}">${monthlyMonthStatusLabel(status)}</span></div>
      <div class="compact-kpi-grid"><div class="compact-kpi"><span>ข้อผิดพลาด</span><strong class="${validation.counts.error ? "negative" : ""}">${validation.counts.error}</strong></div><div class="compact-kpi"><span>คำเตือน</span><strong>${validation.counts.warning}</strong></div><div class="compact-kpi"><span>ข้อมูล</span><strong>${validation.counts.info}</strong></div><div class="compact-kpi"><span>ผลตรวจ</span><strong>${validation.passed ? "ผ่าน" : "ไม่ผ่าน"}</strong></div></div>
      <div class="form-actions"><button id="validateMonthlyButton" class="button button-secondary" type="button"><i data-lucide="scan-search"></i>ตรวจสอบเดือน</button>${status === "OPEN" ? `<button id="reviewMonthlyButton" class="button button-secondary" type="button"><i data-lucide="send"></i>ส่งตรวจ</button><button id="closeMonthlyButton" class="button button-primary" type="button" ${validation.passed ? "" : "disabled"}><i data-lucide="lock-keyhole"></i>ปิดเดือน</button>` : ""}${status === "REVIEW" ? `<button id="closeMonthlyButton" class="button button-primary" type="button" ${validation.passed ? "" : "disabled"}><i data-lucide="lock-keyhole"></i>ปิดเดือน</button><button id="reopenMonthlyButton" class="button button-ghost" type="button"><i data-lucide="lock-keyhole-open"></i>เปิดแก้ไข</button>` : ""}${status === "CLOSED" ? `<button id="reopenMonthlyButton" class="button button-primary" type="button"><i data-lucide="lock-keyhole-open"></i>เปิดเดือนกลับมาแก้ไข</button>` : ""}</div>
      ${state.monthlyStatus?.updatedAt ? `<p class="policy-note">อัปเดตสถานะล่าสุด ${formatDate(state.monthlyStatus.updatedAt)}${state.monthlyStatus.reason ? ` · ${escapeHtml(state.monthlyStatus.reason)}` : ""}</p>` : ""}
    </article>
    <article class="panel">
      <div class="panel-head"><div><h2>ผลการตรวจสอบ</h2><p>แสดงสูงสุด 100 รายการ</p></div></div>
      ${validation.issues.length ? `<div class="validation-list">${validation.issues.slice(0, 100).map((issue) => {
        const employee = employeesById.get(issue.details?.employeeId);
        return `<div class="validation-item validation-${issue.severity.toLowerCase()}"><span>${escapeHtml(issue.severity)}</span><div><strong>${escapeHtml(issue.message)}</strong><small>${employee ? `${escapeHtml(employee.employeeCode)} · ${escapeHtml(employee.fullName)}` : escapeHtml(issue.code)}</small></div></div>`;
      }).join("")}</div>` : `<div class="notice notice-success"><i data-lucide="circle-check"></i><div>ไม่พบข้อผิดพลาดหรือคำเตือนในเดือนนี้</div></div>`}
    </article>`;
}

function updateMonthlyScoreState() {
  const statusSelect = document.getElementById("monthlyEntryStatus");
  const offDayCheckbox = document.getElementById("monthlyOffDayPerformance");
  if (!statusSelect || !offDayCheckbox) return;
  const definition = monthlyStatusDefinition(statusSelect.value);
  offDayCheckbox.disabled = definition.countsAsWork || monthlyIsClosed();
  if (definition.countsAsWork) offDayCheckbox.checked = false;
  const allowScores = definition.countsAsWork || offDayCheckbox.checked;
  document.querySelectorAll("[data-monthly-criterion]").forEach((select) => { select.disabled = monthlyIsClosed() || !allowScores; });
}

function bindMonthlyTabEvents() {
  if (state.monthlyTab === "entry") bindMonthlyEntryEvents();
  if (state.monthlyTab === "history") bindMonthlyHistoryEvents();
  if (state.monthlyTab === "overrides") bindMonthlyOverrideEvents();
  if (state.monthlyTab === "control") bindMonthlyControlEvents();
  if (state.monthlyTab === "summary") document.getElementById("exportMonthlySummaryButton")?.addEventListener("click", exportMonthlySummaryCsv);
}

function bindMonthlyEntryEvents() {
  const employeeSelect = document.getElementById("monthlyEntryEmployee");
  const dateInput = document.getElementById("monthlyEntryDate");
  const statusSelect = document.getElementById("monthlyEntryStatus");
  const offDayCheckbox = document.getElementById("monthlyOffDayPerformance");
  employeeSelect?.addEventListener("change", () => { state.monthlyEmployeeId = employeeSelect.value; state.monthlyEditingId = ""; renderMonthly(); });
  dateInput?.addEventListener("change", () => { state.monthlyDate = dateInput.value; state.monthlyEditingId = ""; renderMonthly(); });
  statusSelect?.addEventListener("change", () => { state.monthlyEntryStatus = statusSelect.value; updateMonthlyScoreState(); });
  offDayCheckbox?.addEventListener("change", updateMonthlyScoreState);
  document.getElementById("clearMonthlyEntryForm")?.addEventListener("click", () => {
    state.monthlyEditingId = "";
    state.monthlyEmployeeId = "";
    state.monthlyEntryStatus = "WORK";
    state.monthlyDate = monthlyDefaultDate();
    renderMonthly();
  });
  document.getElementById("monthlyEntryForm")?.addEventListener("submit", async (event) => {
    event.preventDefault();
    const selectedEmployeeId = employeeSelect.value;
    const date = dateInput.value;
    const existingForSelection = selectedEmployeeId && selectedEmployeeId !== MONTHLY_ALL_EMPLOYEES_ID
      ? state.monthlyEntries.find((entry) => entry.employeeId === selectedEmployeeId && entry.date === date) || null
      : null;
    const editing = state.monthlyEditingId ? monthlySelectedEntry() : existingForSelection;
    const employeeId = editing?.employeeId || selectedEmployeeId;
    if (!employeeId) return showToast("กรุณาเลือกพนักงาน", "warning");
    const status = statusSelect.value;
    const definition = monthlyStatusDefinition(status);
    const allowScores = definition.countsAsWork || offDayCheckbox.checked;
    const scores = {};
    if (allowScores) document.querySelectorAll("[data-monthly-criterion]").forEach((select) => { scores[select.dataset.monthlyCriterion] = Number(select.value); });
    const note = document.getElementById("monthlyEntryNote").value.trim();
    if (!definition.countsAsWork && Object.keys(scores).length && !note) return showToast("ทำคะแนนในวันลา/วันหยุดต้องระบุหมายเหตุ", "warning");
    const submit = event.submitter;
    submit.disabled = true;
    try {
      if (employeeId === MONTHLY_ALL_EMPLOYEES_ID) {
        if (!window.confirm(`ยืนยันบันทึกข้อมูลวันที่ ${formatDateOnly(date)} ให้พนักงานใช้งานทุกคน ${activeEmployees().length} คนหรือไม่?`)) return;
        const result = await window.EmployeeHubDatabase.saveDailyPerformanceEntriesBatch({
          employeeIds: sortedActiveEmployees().map((employee) => employee.id), date, status, note, scores,
        });
        showToast(`บันทึกพนักงานทุกคนสำเร็จ ${result.count} รายการ`);
      } else {
        await window.EmployeeHubDatabase.saveDailyPerformanceEntry({
          id: editing?.id, employeeId, date, status, note, scores,
          expectedVersion: editing?.version || 0,
          legacyException: editing?.legacyException === true,
        });
        showToast(editing ? "อัปเดตข้อมูลรายวันแล้ว" : "บันทึกข้อมูลรายวันแล้ว");
      }
      state.monthlyEditingId = "";
      state.monthlyEmployeeId = employeeId === MONTHLY_ALL_EMPLOYEES_ID ? "" : employeeId;
      state.monthlyDate = date;
      state.monthlyDataKey = "";
      await refreshMonthlyData({ force: true, quiet: true });
    } catch (error) {
      if (error.code === "VERSION_CONFLICT") showToast("ข้อมูลรายการนี้เปลี่ยนแล้ว กรุณาโหลดใหม่", "warning");
      else showToast(error.message, "error", 6500);
    } finally { submit.disabled = false; }
  });
}

function bindMonthlyHistoryEvents() {
  document.getElementById("monthlyHistoryEmployee")?.addEventListener("change", (event) => { state.monthlyHistoryEmployeeId = event.target.value; renderMonthly(); });
  document.getElementById("monthlyHistoryDate")?.addEventListener("change", (event) => { state.monthlyHistoryDate = event.target.value; renderMonthly(); });
  document.getElementById("clearMonthlyHistoryFilter")?.addEventListener("click", () => { state.monthlyHistoryEmployeeId = ""; state.monthlyHistoryDate = ""; renderMonthly(); });
  document.getElementById("exportMonthlyEntriesButton")?.addEventListener("click", exportMonthlyEntriesCsv);
  els.monthlyView.querySelectorAll(".edit-monthly-entry").forEach((button) => button.addEventListener("click", () => {
    const entry = monthlyEntryById(button.dataset.id);
    if (!entry) return;
    state.monthlyEditingId = entry.id;
    state.monthlyEmployeeId = entry.employeeId;
    state.monthlyDate = entry.date;
    state.monthlyEntryStatus = entry.status;
    state.monthlyTab = "entry";
    renderMonthly();
    window.scrollTo({ top: 0, behavior: "smooth" });
  }));
  els.monthlyView.querySelectorAll(".delete-monthly-entry").forEach((button) => button.addEventListener("click", async () => {
    const entry = monthlyEntryById(button.dataset.id);
    const employee = employeeMap().get(entry?.employeeId);
    if (!entry || !window.confirm(`ต้องการลบข้อมูล ${employee?.fullName || entry.employeeId} วันที่ ${formatDateOnly(entry.date)} ใช่หรือไม่?`)) return;
    button.disabled = true;
    try {
      await window.EmployeeHubDatabase.deleteDailyPerformanceEntry(entry.id);
      showToast("ลบข้อมูลรายวันแล้ว");
      state.monthlyDataKey = "";
      await refreshMonthlyData({ force: true, quiet: true });
    } catch (error) { showToast(error.message, "error"); }
  }));
}

function bindMonthlyOverrideEvents() {
  els.monthlyView.querySelectorAll(".save-monthly-override").forEach((button) => button.addEventListener("click", async () => {
    const employeeId = button.dataset.employeeId;
    const input = els.monthlyView.querySelector(`.monthly-override-input[data-employee-id="${CSS.escape(employeeId)}"]`);
    if (!input || input.value === "") return showToast("กรุณากรอกจำนวนวันทำงานจริง", "warning");
    const existing = state.monthlyOverrides.find((record) => record.employeeId === employeeId);
    button.disabled = true;
    try {
      await window.EmployeeHubDatabase.saveMonthlyPerformanceOverride({ employeeId, yearMonth: state.monthlyMonth, actualWorkDaysOverride: input.value, expectedVersion: existing?.version || 0 });
      showToast("บันทึกวันทำงานจริงแล้ว");
      state.monthlyDataKey = "";
      await refreshMonthlyData({ force: true, quiet: true });
    } catch (error) { showToast(error.message, "error"); }
  }));
  els.monthlyView.querySelectorAll(".clear-monthly-override").forEach((button) => button.addEventListener("click", async () => {
    if (!window.confirm("ยืนยันล้าง Override และกลับไปใช้จำนวนวันทำงาน Auto หรือไม่?")) return;
    button.disabled = true;
    try {
      await window.EmployeeHubDatabase.deleteMonthlyPerformanceOverride(button.dataset.id);
      showToast("กลับไปใช้วันทำงาน Auto แล้ว");
      state.monthlyDataKey = "";
      await refreshMonthlyData({ force: true, quiet: true });
    } catch (error) { showToast(error.message, "error"); }
  }));
}

function showMonthlyValidationModal(validation) {
  const employeesById = employeeMap();
  els.modalRoot.innerHTML = `<div class="modal-backdrop"><section class="modal-card modal-wide" role="dialog" aria-modal="true" aria-labelledby="monthlyValidationTitle"><div class="modal-head"><div><p class="eyebrow">MONTH VALIDATION</p><h2 id="monthlyValidationTitle">ผลตรวจเดือน ${escapeHtml(state.monthlyMonth)}</h2></div><button id="closeModalButton" class="icon-button" type="button"><i data-lucide="x"></i></button></div><div class="compact-kpi-grid"><div class="compact-kpi"><span>ข้อผิดพลาด</span><strong>${validation.counts.error}</strong></div><div class="compact-kpi"><span>คำเตือน</span><strong>${validation.counts.warning}</strong></div><div class="compact-kpi"><span>ข้อมูล</span><strong>${validation.counts.info}</strong></div><div class="compact-kpi"><span>ผลตรวจ</span><strong>${validation.passed ? "ผ่าน" : "ไม่ผ่าน"}</strong></div></div>${validation.issues.length ? `<div class="validation-list">${validation.issues.slice(0, 100).map((issue) => { const employee = employeesById.get(issue.details?.employeeId); return `<div class="validation-item validation-${issue.severity.toLowerCase()}"><span>${escapeHtml(issue.severity)}</span><div><strong>${escapeHtml(issue.message)}</strong><small>${employee ? `${escapeHtml(employee.employeeCode)} · ${escapeHtml(employee.fullName)}` : escapeHtml(issue.code)}</small></div></div>`; }).join("")}</div>` : `<div class="notice notice-success"><i data-lucide="circle-check"></i><div>ไม่พบปัญหา</div></div>`}<div class="form-actions"><button id="closeMonthlyValidation" class="button button-primary" type="button">ปิด</button></div></section></div>`;
  ensureIcons();
  const close = () => { els.modalRoot.innerHTML = ""; };
  document.getElementById("closeModalButton").addEventListener("click", close);
  document.getElementById("closeMonthlyValidation").addEventListener("click", close);
}

async function changeMonthlyStatus(nextStatus) {
  const validation = validateMonthlyData();
  let reason = "";
  if (nextStatus === "CLOSED") {
    if (!validation.passed) { showMonthlyValidationModal(validation); return showToast("ยังมีข้อผิดพลาด ไม่สามารถปิดเดือนได้", "warning"); }
    if (!window.confirm(`ยืนยันปิดเดือน ${state.monthlyMonth} หรือไม่? หลังปิดแล้วจะไม่สามารถแก้ข้อมูลจนกว่าจะเปิดเดือนกลับมา`)) return;
  } else if (nextStatus === "REVIEW") {
    if (!window.confirm(`ส่งเดือน ${state.monthlyMonth} เข้าสถานะรอตรวจสอบหรือไม่?`)) return;
  } else if (nextStatus === "OPEN") {
    reason = window.prompt("กรุณาระบุเหตุผลในการเปิดเดือนกลับมาแก้ไข:") || "";
    if (!reason.trim()) return showToast("ต้องระบุเหตุผลในการเปิดเดือน", "warning");
  }
  try {
    state.monthlyStatus = await window.EmployeeHubDatabase.setMonthlyPerformanceMonthStatus({ yearMonth: state.monthlyMonth, status: nextStatus, reason, validation });
    showToast(nextStatus === "CLOSED" ? "ปิดเดือนเรียบร้อยแล้ว" : "เปลี่ยนสถานะเดือนแล้ว");
    renderMonthly();
  } catch (error) { showToast(error.message, "error", 6500); }
}

function bindMonthlyControlEvents() {
  document.getElementById("validateMonthlyButton")?.addEventListener("click", () => showMonthlyValidationModal(validateMonthlyData()));
  document.getElementById("reviewMonthlyButton")?.addEventListener("click", () => changeMonthlyStatus("REVIEW"));
  document.getElementById("closeMonthlyButton")?.addEventListener("click", () => changeMonthlyStatus("CLOSED"));
  document.getElementById("reopenMonthlyButton")?.addEventListener("click", () => changeMonthlyStatus("OPEN"));
}

function exportMonthlySummaryCsv() {
  const calculated = calculateMonthlySummary();
  const rows = [["เดือน", "รหัสพนักงาน", "ชื่อพนักงาน", "วันทำงาน Auto", "วันทำงานจริง", ...MONTHLY_CRITERIA.flatMap((criterion) => [criterion.name, ...(criterion.rankEnabled ? [`Incentive ${criterion.id}`] : [])]), "Performance 1–4", "Performance 1–5", "Incentive รวม"]];
  calculated.rows.forEach((row) => rows.push([state.monthlyMonth, row.employeeCode, row.employeeName, row.autoWorkDays, row.actualWorkDays, ...MONTHLY_CRITERIA.flatMap((criterion) => [row.criteria[criterion.id].performancePercent, ...(criterion.rankEnabled ? [row.criteria[criterion.id].incentivePercent] : [])]), row.overallPerformance14, row.overallPerformance, row.overallIncentive]));
  downloadCsv(rows, `monthly-performance-summary-${state.monthlyMonth}.csv`);
}

function exportMonthlyEntriesCsv() {
  const employeesById = employeeMap();
  const rows = [["วันที่", "รหัสพนักงาน", "ชื่อพนักงาน", "สถานะ", ...MONTHLY_CRITERIA.map((criterion) => criterion.name), "หมายเหตุ", "Legacy Exception", "แก้ไขล่าสุด"]];
  state.monthlyEntries.filter((entry) => !state.monthlyHistoryEmployeeId || entry.employeeId === state.monthlyHistoryEmployeeId).filter((entry) => !state.monthlyHistoryDate || entry.date === state.monthlyHistoryDate).forEach((entry) => { const employee = employeesById.get(entry.employeeId); rows.push([entry.date, employee?.employeeCode || "", employee?.fullName || entry.employeeId, monthlyStatusLabel(entry.status), ...MONTHLY_CRITERIA.map((criterion) => entry.scores?.[criterion.id] ?? ""), entry.note, entry.legacyException ? "ใช่" : "ไม่", entry.updatedAt]); });
  downloadCsv(rows, `monthly-performance-entries-${state.monthlyMonth}.csv`);
}


/* Phase 6 · Month-End Closing Center */
function closingMonthParts(yearMonth = state.closingMonth) {
  const match = /^(\d{4})-(\d{2})$/.exec(String(yearMonth || ""));
  const year = match ? Number(match[1]) : new Date().getFullYear();
  const month = match ? Number(match[2]) : new Date().getMonth() + 1;
  return { year, month, performanceYear: year + 543, performanceMonth: month - 1 };
}

function employeesEligibleForMonth(yearMonth = state.closingMonth) {
  const { year, month } = closingMonthParts(yearMonth);
  const monthEnd = `${year}-${String(month).padStart(2, "0")}-${String(new Date(year, month, 0).getDate()).padStart(2, "0")}`;
  return sortedActiveEmployees().filter((employee) => !employee.startDate || String(employee.startDate).slice(0, 10) <= monthEnd);
}

async function refreshClosingData({ force = false, quiet = false } = {}) {
  if (!state.user || !state.closingMonth) return;
  const key = state.closingMonth;
  if (!force && state.closingDataKey === key && state.closingData) return;
  state.closingLoading = true;
  if (!quiet) setSyncStatus("syncing", "กำลังตรวจรอบเดือน");
  if (state.currentView === "closing") renderClosing();
  try {
    const [syncSnapshot, incentives] = await Promise.all([
      window.EmployeeHubDatabase.loadPerformanceScoreSyncSnapshot(key),
      window.EmployeeHubDatabase.loadServiceIncentives(key),
    ]);
    state.closingData = { syncSnapshot, incentives };
    state.closingDataKey = key;
    setSyncStatus("online", "เชื่อมต่อแล้ว");
  } catch (error) {
    console.error(error);
    setSyncStatus("error", "ตรวจรอบเดือนไม่สำเร็จ");
    if (!quiet) showToast(error.message || "โหลดข้อมูลปิดรอบเดือนไม่สำเร็จ", "error", 6500);
  } finally {
    state.closingLoading = false;
    if (state.currentView === "closing") renderClosing();
  }
}

function buildClosingSummary() {
  const data = state.closingData;
  if (!data?.syncSnapshot) return null;
  const eligibleEmployees = employeesEligibleForMonth(state.closingMonth);
  const eligibleIds = new Set(eligibleEmployees.map((employee) => employee.id));
  const snapshot = data.syncSnapshot;
  const { performanceMonth } = closingMonthParts(state.closingMonth);
  const syncRows = buildPerformanceSyncRowsFromData(snapshot, performanceMonth, eligibleEmployees);
  const attendanceByEmployee = new Map((snapshot.attendance || []).filter((row) => eligibleIds.has(row.employeeId)).map((row) => [row.employeeId, row]));
  const monthlyEmployeeIds = new Set((snapshot.monthlyEntries || []).filter((row) => eligibleIds.has(row.employeeId)).map((row) => row.employeeId));
  const incentiveByEmployee = new Map((data.incentives || []).filter((row) => eligibleIds.has(row.employeeId)).map((row) => [row.employeeId, row]));
  const performanceIncentiveRows = buildPerformanceIncentiveRowsFromData({ evaluations: snapshot.evaluations || [], incentives: data.incentives || [] }, eligibleEmployees);
  const performanceIncentiveByEmployee = new Map(performanceIncentiveRows.map((row) => [row.employee.id, row]));
  const validationEmployees = state.employees.map((employee) => ({ ...employee, isActive: eligibleIds.has(employee.id) }));
  const validation = validateMonthlyDataRecords(snapshot.monthlyEntries || [], snapshot.monthlyOverrides || [], validationEmployees, state.closingMonth);
  const monthClosed = String(snapshot.monthStatus?.status || "OPEN") === "CLOSED";
  const attendanceIsValid = (record) => { const score = Number(record?.lateScore); return Boolean(record) && Number.isInteger(score) && score >= 20 && score <= 100 && score % 5 === 0; };
  const disciplineIsValid = (row) => { const score = Number(row?.evaluation?.scores?.[5]); return Boolean(row?.evaluation) && row.disciplinePending !== true && Number.isInteger(score) && score >= 20 && score <= 100 && score % 5 === 0; };
  const attendanceComplete = eligibleEmployees.filter((employee) => attendanceIsValid(attendanceByEmployee.get(employee.id))).length;
  const monthlyComplete = eligibleEmployees.filter((employee) => monthlyEmployeeIds.has(employee.id)).length;
  const syncedCount = syncRows.filter((row) => row.status === "SYNCED").length;
  const disciplineCount = syncRows.filter(disciplineIsValid).length;
  const incentiveCount = eligibleEmployees.filter((employee) => incentiveByEmployee.has(employee.id)).length;
  const gpaIncentiveCount = performanceIncentiveRows.filter((row) => ["SYNCED", "NOT_APPLICABLE"].includes(row.status)).length;
  const requiredSteps = [
    {
      id: "workday",
      icon: "clock-3",
      title: "1. Workday Insight",
      description: "บันทึกคะแนนเวลาของพนักงานประจำเดือน",
      done: eligibleEmployees.length > 0 && attendanceComplete === eligibleEmployees.length,
      count: `${attendanceComplete}/${eligibleEmployees.length}`,
      actionLabel: "เปิด Workday",
    },
    {
      id: "monthly",
      icon: "clipboard-check",
      title: "2. Monthly Performance",
      description: `ข้อมูลครบ ${monthlyComplete}/${eligibleEmployees.length} คน · ตรวจพบ Error ${validation.counts.error}`,
      done: monthClosed && validation.passed && monthlyComplete === eligibleEmployees.length,
      count: monthClosed ? "CLOSED" : String(snapshot.monthStatus?.status || "OPEN"),
      actionLabel: "ควบคุมเดือน",
    },
    {
      id: "sync",
      icon: "send",
      title: "3. เชื่อมคะแนน",
      description: "ส่ง Inc. 1–4 และคะแนนเวลาไป Performance Summary",
      done: eligibleEmployees.length > 0 && syncedCount === eligibleEmployees.length,
      count: `${syncedCount}/${eligibleEmployees.length}`,
      actionLabel: "เปิด Score Sync",
    },
    {
      id: "discipline",
      icon: "shield-check",
      title: "4. กฎระเบียบบริษัท",
      description: "กรอกคะแนนหัวข้อที่ 6 ด้วยตนเองให้ครบ",
      done: eligibleEmployees.length > 0 && disciplineCount === eligibleEmployees.length,
      count: `${disciplineCount}/${eligibleEmployees.length}`,
      actionLabel: "กรอกคะแนน",
    },
    {
      id: "gpaIncentive",
      icon: "coins",
      title: "5. เงินประเมินจาก GPA",
      description: "ส่งจำนวนเงินจาก GPA ไปช่องประเมิน หรือยืนยันว่าไม่เข้าเกณฑ์",
      done: eligibleEmployees.length > 0 && gpaIncentiveCount === eligibleEmployees.length,
      count: `${gpaIncentiveCount}/${eligibleEmployees.length}`,
      actionLabel: "เปิดเงินประเมิน",
    },
  ];
  const recommendedSteps = [
    {
      id: "service",
      icon: "badge-dollar-sign",
      title: "Service Incentive",
      description: "ตรวจว่ามีพนักงานครบทุกคน แม้ยอดเดือนนั้นเป็น 0",
      done: eligibleEmployees.length > 0 && incentiveCount === eligibleEmployees.length,
      count: `${incentiveCount}/${eligibleEmployees.length}`,
      actionLabel: "เปิด Incentive",
    },
    {
      id: "system",
      icon: "database-backup",
      title: "Backup หลังปิดรอบ",
      description: "สำรอง Firestore หลังข้อมูลเดือนนี้เรียบร้อย",
      done: Boolean(state.systemLastBackup),
      count: state.systemLastBackup ? "สำรองแล้ว" : "แนะนำ",
      actionLabel: "เปิด Backup",
    },
  ];
  const requiredDone = requiredSteps.filter((step) => step.done).length;
  const coreReady = requiredDone === requiredSteps.length;
  const operationalDone = [...requiredSteps, ...recommendedSteps].filter((step) => step.done).length;
  const employees = eligibleEmployees.map((employee) => {
    const syncRow = syncRows.find((row) => row.employee.id === employee.id);
    const attendance = attendanceByEmployee.get(employee.id) || null;
    const monthly = monthlyEmployeeIds.has(employee.id);
    const incentive = incentiveByEmployee.get(employee.id) || null;
    const performanceIncentive = performanceIncentiveByEmployee.get(employee.id) || null;
    return {
      employee,
      attendance,
      monthly,
      syncRow,
      incentive,
      performanceIncentive,
      attendanceDone: attendanceIsValid(attendance),
      disciplineDone: disciplineIsValid(syncRow),
      gpaIncentiveDone: ["SYNCED", "NOT_APPLICABLE"].includes(performanceIncentive?.status),
    };
  });
  return {
    eligibleEmployees,
    validation,
    monthClosed,
    requiredSteps,
    recommendedSteps,
    requiredDone,
    operationalDone,
    coreReady,
    employees,
    counts: { attendanceComplete, monthlyComplete, syncedCount, disciplineCount, gpaIncentiveCount, incentiveCount },
  };
}

function closingStatusBadge(done, required = true) {
  if (done) return '<span class="badge badge-ready">เรียบร้อย</span>';
  return required ? '<span class="badge badge-danger">รอดำเนินการ</span>' : '<span class="badge badge-progress">แนะนำ</span>';
}

function renderClosingStep(step, required = true) {
  return `<article class="closing-step-card ${step.done ? "closing-step-done" : ""}">
    <div class="closing-step-icon"><i data-lucide="${escapeHtml(step.icon)}"></i></div>
    <div class="closing-step-content"><div class="closing-step-title"><h3>${escapeHtml(step.title)}</h3>${closingStatusBadge(step.done, required)}</div><p>${escapeHtml(step.description)}</p><strong>${escapeHtml(step.count)}</strong></div>
    <button class="button button-small ${step.done ? "button-ghost" : "button-secondary"} closing-step-action" data-closing-action="${escapeHtml(step.id)}" type="button">${escapeHtml(step.actionLabel)} <i data-lucide="arrow-right"></i></button>
  </article>`;
}

function closingCellBadge(done, doneText = "ครบ", pendingText = "ขาด") {
  return `<span class="badge ${done ? "badge-ready" : "badge-danger"}">${done ? doneText : pendingText}</span>`;
}

function renderClosing() {
  const summary = buildClosingSummary();
  const firstLoading = state.closingLoading && !summary;
  els.closingView.innerHTML = `
    <div class="page-grid">
      <article class="panel closing-hero">
        <div class="panel-head"><div><p class="eyebrow">MONTH-END CONTROL</p><h2>ศูนย์ปิดรอบเดือน</h2><p>ตรวจขั้นตอนสำคัญก่อนสรุปคะแนนและสำรองข้อมูลประจำเดือน</p></div>${summary ? `<span class="badge ${summary.coreReady ? "badge-ready" : "badge-danger"}">${summary.coreReady ? "รอบประเมินพร้อม" : "ยังมีรายการค้าง"}</span>` : `<span class="badge badge-progress">กำลังตรวจ</span>`}</div>
        <div class="closing-toolbar"><div class="field compact-field"><label for="closingMonthPicker">เดือนที่ตรวจ</label><input id="closingMonthPicker" type="month" value="${escapeHtml(state.closingMonth)}" /></div><div class="panel-actions"><button id="refreshClosingButton" class="button button-secondary" type="button"><i data-lucide="refresh-cw"></i>ตรวจใหม่</button><button id="exportClosingButton" class="button button-primary" type="button" ${summary ? "" : "disabled"}><i data-lucide="download"></i>Export สถานะ</button></div></div>
        ${summary ? `<div class="kpi-grid compact-kpi-grid closing-kpis"><article class="kpi-card"><div class="kpi-head"><span>ขั้นตอนจำเป็น</span><span class="kpi-icon"><i data-lucide="list-checks"></i></span></div><div class="kpi-value">${summary.requiredDone}/5</div><div class="kpi-note">ต้องครบก่อนสรุปรอบประเมิน</div></article><article class="kpi-card"><div class="kpi-head"><span>พนักงานในรอบ</span><span class="kpi-icon"><i data-lucide="users-round"></i></span></div><div class="kpi-value">${summary.eligibleEmployees.length}</div><div class="kpi-note">อ้างอิงวันที่เริ่มงาน</div></article><article class="kpi-card"><div class="kpi-head"><span>Monthly Error</span><span class="kpi-icon"><i data-lucide="triangle-alert"></i></span></div><div class="kpi-value ${summary.validation.counts.error ? "negative" : ""}">${summary.validation.counts.error}</div><div class="kpi-note">คำเตือน ${summary.validation.counts.warning}</div></article><article class="kpi-card"><div class="kpi-head"><span>งานทั้งหมด</span><span class="kpi-icon"><i data-lucide="gauge"></i></span></div><div class="kpi-value">${summary.operationalDone}/7</div><div class="kpi-note">รวม Incentive และ Backup</div></article></div>` : ""}
      </article>
      ${firstLoading ? `<div class="loading-skeleton"></div>` : summary ? `
      <article class="panel"><div class="panel-head"><div><h2>ขั้นตอนจำเป็น</h2><p>ระบบจะถือว่ารอบประเมินพร้อมเมื่อครบทั้ง 5 ขั้นตอน</p></div></div><div class="closing-step-grid">${summary.requiredSteps.map((step) => renderClosingStep(step, true)).join("")}</div></article>
      <article class="panel"><div class="panel-head"><div><h2>รายการแนะนำหลังปิดรอบ</h2><p>ไม่บล็อกการสรุปคะแนน แต่ช่วยให้ข้อมูลประจำเดือนสมบูรณ์และกู้คืนได้</p></div></div><div class="closing-step-grid">${summary.recommendedSteps.map((step) => renderClosingStep(step, false)).join("")}</div></article>
      <article class="panel"><div class="panel-head"><div><h2>ตรวจรายบุคคล</h2><p>ค้นหารายการที่ยังขาดได้ในตารางเดียว</p></div></div><div class="table-wrap closing-matrix"><table><thead><tr><th>พนักงาน</th><th>Workday</th><th>Monthly</th><th>Score Sync</th><th>กฎระเบียบ</th><th>GPA → ประเมิน</th><th>Incentive</th></tr></thead><tbody>${summary.employees.map((row) => `<tr><td><strong>${escapeHtml(row.employee.employeeCode)}</strong><br><small>${escapeHtml(row.employee.fullName)}</small></td><td>${closingCellBadge(row.attendanceDone, row.attendance ? `${row.attendance.lateScore} คะแนน` : "ครบ", row.attendance ? "คะแนนไม่ถูกต้อง" : "ไม่มีข้อมูล")}</td><td>${closingCellBadge(row.monthly, "มีข้อมูล", "ไม่มีข้อมูล")}</td><td><span class="badge ${performanceSyncStatusBadge(row.syncRow?.status)}">${escapeHtml(row.syncRow?.reason || "ยังไม่มีข้อมูล")}</span></td><td>${closingCellBadge(row.disciplineDone, row.syncRow?.evaluation?.scores?.[5] ? `${row.syncRow.evaluation.scores[5]} คะแนน` : "กรอกแล้ว", "รอกรอก")}</td><td><span class="badge ${performanceIncentiveStatusBadge(row.performanceIncentive?.status)}">${escapeHtml(row.performanceIncentive?.reason || "ยังไม่มีข้อมูล")}</span></td><td>${closingCellBadge(Boolean(row.incentive), row.incentive ? formatMoney(row.incentive.totalAmount) : "ครบ", "ไม่มีรายการ")}</td></tr>`).join("") || `<tr><td colspan="7"><div class="empty-state"><i data-lucide="users"></i><p>ไม่พบพนักงานสำหรับเดือนนี้</p></div></td></tr>`}</tbody></table></div></article>
      ` : `<article class="panel"><div class="empty-state"><i data-lucide="calendar-search"></i><p>กำลังโหลดข้อมูลสำหรับปิดรอบเดือน</p></div></article>`}
    </div>`;

  document.getElementById("closingMonthPicker")?.addEventListener("change", (event) => {
    state.closingMonth = event.target.value || currentYearMonth();
    state.closingData = null;
    state.closingDataKey = "";
    void refreshClosingData({ force: true });
  });
  document.getElementById("refreshClosingButton")?.addEventListener("click", () => refreshClosingData({ force: true }));
  document.getElementById("exportClosingButton")?.addEventListener("click", exportClosingStatusCsv);
  els.closingView.querySelectorAll(".closing-step-action").forEach((button) => button.addEventListener("click", () => openClosingAction(button.dataset.closingAction, summary)));
  ensureIcons();
}

function openClosingAction(action, summary = buildClosingSummary()) {
  const { year, performanceYear, performanceMonth } = closingMonthParts(state.closingMonth);
  if (action === "workday") {
    state.workdayMonth = state.closingMonth;
    state.workdayYear = year;
    state.workdayTab = "attendance";
    state.workdayDataKey = "";
    return showView("workday");
  }
  if (action === "monthly") {
    state.monthlyMonth = state.closingMonth;
    state.monthlyDate = `${state.closingMonth}-01`;
    state.monthlyTab = "control";
    state.monthlyDataKey = "";
    return showView("monthly");
  }
  if (action === "sync") {
    state.performanceYear = performanceYear;
    state.performanceMonth = performanceMonth;
    state.performanceTab = "sync";
    state.performanceSyncKey = "";
    return showView("performance");
  }
  if (action === "discipline") {
    const pending = summary?.employees?.find((row) => !row.disciplineDone);
    state.performanceYear = performanceYear;
    state.performanceMonth = performanceMonth;
    state.performanceEmployeeId = pending?.employee?.id || summary?.eligibleEmployees?.[0]?.id || state.performanceEmployeeId;
    state.performanceTab = "entry";
    state.performanceManualOverride = false;
    return showView("performance");
  }
  if (action === "gpaIncentive") {
    state.performanceYear = performanceYear;
    state.performanceMonth = performanceMonth;
    state.performanceTab = "incentive";
    state.performanceIncentiveKey = "";
    state.performanceIncentiveData = null;
    return showView("performance");
  }
  if (action === "service") {
    state.serviceMonth = state.closingMonth;
    state.serviceEmployeeId = "";
    return showView("service");
  }
  if (action === "system") return showView("system");
}

function exportClosingStatusCsv() {
  const summary = buildClosingSummary();
  if (!summary) return showToast("ยังไม่มีข้อมูลสำหรับ Export", "warning");
  const rows = [["เดือน", "รหัสพนักงาน", "ชื่อพนักงาน", "Workday", "คะแนนเวลา", "Monthly", "Score Sync", "กฎระเบียบ", "คะแนนกฎระเบียบ", "GPA", "เงินประเมินตาม GPA", "สถานะเงินประเมิน", "Service Incentive"]];
  summary.employees.forEach((row) => rows.push([
    state.closingMonth,
    row.employee.employeeCode,
    row.employee.fullName,
    row.attendance ? "ครบ" : "ไม่มีข้อมูล",
    row.attendance?.lateScore ?? "",
    row.monthly ? "มีข้อมูล" : "ไม่มีข้อมูล",
    row.syncRow?.reason || "ยังไม่มีข้อมูล",
    row.disciplineDone ? "กรอกแล้ว" : "รอกรอก",
    row.syncRow?.evaluation?.scores?.[5] ?? "",
    row.performanceIncentive?.gpa ?? "",
    row.performanceIncentive?.expectedAmount ?? "",
    row.performanceIncentive?.reason || "ยังไม่มีข้อมูล",
    row.incentive ? row.incentive.totalAmount : "",
  ]));
  downloadCsv(rows, `month-end-status-${state.closingMonth}.csv`);
}

const SYSTEM_COLLECTION_LABELS = Object.freeze({
  profiles: "โปรไฟล์ผู้ใช้",
  settings: "ตั้งค่า Performance",
  employees: "พนักงาน",
  employeeNames: "ดัชนีชื่อพนักงาน",
  evaluations: "Performance Summary",
  serviceIncentives: "Service Incentive",
  hubSettings: "ตั้งค่าระบบกลาง",
  attendanceMonthly: "เวลาสายรายเดือน",
  leaveRecords: "รายการวันลา",
  workdaySettings: "กฎสิทธิ์วันลา",
  dailyPerformanceEntries: "Monthly Performance รายวัน",
  monthlyPerformanceOverrides: "วันทำงาน Override",
  monthlyPerformanceStatus: "สถานะปิดเดือน",
  auditLogs: "Audit Log",
});

function expectedLateScoreForHealth(minutes) {
  const value = Number(minutes) || 0;
  if (value <= 29) return 100;
  if (value <= 59) return 90;
  if (value <= 89) return 80;
  if (value <= 119) return 70;
  return 60;
}

function validPerformanceScoreForHealth(value) {
  const score = Number(value);
  return Number.isInteger(score) && score >= 20 && score <= 100 && score % 5 === 0;
}

function validMonthlyScoreForHealth(value, legacyException = false) {
  const score = Number(value);
  return MONTHLY_SCORE_OPTIONS.includes(score) || (legacyException && score === 3.5);
}

function buildSystemHealth(snapshot) {
  const collections = snapshot?.collections || {};
  const rows = (name) => Array.isArray(collections[name]) ? collections[name] : [];
  const issues = [];
  const addIssue = (severity, module, item, message) => issues.push({ severity, module, item, message });
  const employees = rows("employees");
  const employeeIds = new Set(employees.map((row) => String(row.__id || "")));

  const codeMap = new Map();
  const orderMap = new Map();
  employees.forEach((employee) => {
    const id = String(employee.__id || "");
    const code = String(employee.employeeCode || "").trim().toUpperCase();
    const sortOrder = Number(employee.sortOrder);
    if (!code) addIssue("error", "Employee Master", id, "ไม่มีรหัสพนักงาน");
    else {
      if (codeMap.has(code)) addIssue("error", "Employee Master", code, `รหัสซ้ำกับ ${codeMap.get(code)}`);
      codeMap.set(code, id);
    }
    if (!Number.isInteger(sortOrder) || sortOrder < 1) addIssue("warning", "Employee Master", code || id, "sortOrder ต้องเป็นเลขจำนวนเต็มตั้งแต่ 1");
    else {
      if (orderMap.has(sortOrder)) addIssue("warning", "Employee Master", String(sortOrder), `ลำดับซ้ำกับ ${orderMap.get(sortOrder)}`);
      orderMap.set(sortOrder, code || id);
    }
    if (!/^\d{4}-\d{2}-\d{2}$/.test(String(employee.startDate || ""))) addIssue("warning", "Employee Master", code || id, "วันที่เริ่มงานไม่อยู่ในรูปแบบ YYYY-MM-DD");
    if (!String(employee.fullName || employee.name || "").trim()) addIssue("error", "Employee Master", code || id, "ไม่มีชื่อพนักงาน");
  });

  const checkEmployeeReference = (collectionName, moduleName) => {
    rows(collectionName).forEach((row) => {
      const employeeId = String(row.employeeId || "");
      if (!employeeIds.has(employeeId)) addIssue("error", moduleName, String(row.__id || "-"), `อ้างถึง employeeId ที่ไม่มีอยู่: ${employeeId || "(ว่าง)"}`);
    });
  };

  checkEmployeeReference("serviceIncentives", "Service Incentive");
  rows("serviceIncentives").forEach((row) => {
    const expected = Number(row.salesAmount || 0) + Number(row.evaluationAmount || 0) + Number(row.timeAmount || 0);
    if (Math.abs(expected - Number(row.totalAmount || 0)) > 0.011) addIssue("error", "Service Incentive", String(row.__id || "-"), "ยอดรวมไม่ตรงกับผลรวมของขายของ + ประเมิน + เวลา");
    if (!/^\d{4}-(0[1-9]|1[0-2])$/.test(String(row.yearMonth || ""))) addIssue("warning", "Service Incentive", String(row.__id || "-"), "yearMonth ไม่ถูกต้อง");
  });

  checkEmployeeReference("attendanceMonthly", "Workday · เวลา");
  rows("attendanceMonthly").forEach((row) => {
    if (expectedLateScoreForHealth(row.lateMinutes) !== Number(row.lateScore)) addIssue("error", "Workday · เวลา", String(row.__id || "-"), "คะแนนเวลาไม่ตรงกับจำนวนนาทีสาย");
  });

  checkEmployeeReference("leaveRecords", "Workday · วันลา");
  rows("leaveRecords").forEach((row) => {
    if (!/^\d{4}-\d{2}-\d{2}$/.test(String(row.date || ""))) addIssue("warning", "Workday · วันลา", String(row.__id || "-"), "วันที่ลาไม่ถูกต้อง");
    if (!(Number(row.days) > 0)) addIssue("error", "Workday · วันลา", String(row.__id || "-"), "จำนวนวันลาต้องมากกว่า 0");
    if (!["sick", "personal", "vacation", "ordination", "other"].includes(String(row.leaveType || ""))) addIssue("warning", "Workday · วันลา", String(row.__id || "-"), "ประเภทวันลาไม่อยู่ในรายการที่รองรับ");
  });

  checkEmployeeReference("dailyPerformanceEntries", "Monthly Performance");
  rows("dailyPerformanceEntries").forEach((row) => {
    const id = String(row.__id || "-");
    const status = String(row.status || "");
    const scores = row.scores && typeof row.scores === "object" ? row.scores : {};
    const working = status === "WORK" || status === "WEEKEND_WORK";
    if (!MONTHLY_STATUS_MAP[status]) addIssue("error", "Monthly Performance", id, `สถานะไม่ถูกต้อง: ${status || "(ว่าง)"}`);
    if (working && MONTHLY_CRITERIA.some((criterion) => !(criterion.id in scores))) addIssue("error", "Monthly Performance", id, "วันทำงานมีคะแนนไม่ครบ 5 หัวข้อ");
    Object.entries(scores).forEach(([key, value]) => {
      if (!validMonthlyScoreForHealth(value, row.legacyException === true)) addIssue("error", "Monthly Performance", `${id}/${key}`, `คะแนน ${value} ไม่ตรงกับช่วงที่ระบบรองรับ`);
    });
    if (id !== `${row.employeeId}__${row.date}`) addIssue("warning", "Monthly Performance", id, "Document ID ไม่ตรงกับ employeeId__date");
  });

  checkEmployeeReference("monthlyPerformanceOverrides", "Monthly Override");
  rows("monthlyPerformanceOverrides").forEach((row) => {
    if (!Number.isFinite(Number(row.expectedWorkingDays)) || Number(row.expectedWorkingDays) < 0 || Number(row.expectedWorkingDays) > 31) {
      addIssue("warning", "Monthly Override", String(row.__id || "-"), "จำนวนวันทำงานที่กำหนดอยู่นอกช่วง 0–31");
    }
  });

  checkEmployeeReference("evaluations", "Performance Summary");
  rows("evaluations").forEach((row) => {
    const scores = Array.isArray(row.scores) ? row.scores : [];
    if (scores.length !== 6 || scores.some((score) => !validPerformanceScoreForHealth(score))) {
      addIssue("error", "Performance Summary", String(row.__id || "-"), "คะแนนต้องครบ 6 หัวข้อและอยู่ระหว่าง 20–100 เพิ่มทีละ 5");
    }
    if (row.disciplinePending === true) addIssue("info", "Performance Summary", String(row.__id || "-"), "รอกรอกคะแนนการเคารพกฎระเบียบบริษัท");
  });

  const hub = rows("hubSettings").find((row) => row.__id === "main") || null;
  if (!hub) addIssue("warning", "ระบบกลาง", "hubSettings/main", "ไม่พบสถานะ Migration ของระบบกลาง");
  else {
    if (!hub.migrationId) addIssue("warning", "Migration", "Phase 1", "ยังไม่มี Migration ID ของ Employee Master/Service Incentive");
    if (!hub.workdayMigrationId) addIssue("warning", "Migration", "Phase 2", "ยังไม่มี Workday Migration ID");
    if (!hub.monthlyPerformanceMigrationId) addIssue("warning", "Migration", "Phase 3", "ยังไม่มี Monthly Performance Migration ID");
  }
  const workdaySettings = rows("workdaySettings").find((row) => row.__id === "main");
  if (!workdaySettings?.configured) addIssue("warning", "Workday", "workdaySettings/main", "ยังไม่ได้บันทึกกฎสิทธิ์วันลา");

  const counts = Object.fromEntries(Object.entries(collections).map(([name, items]) => [name, Array.isArray(items) ? items.length : 0]));
  const errors = issues.filter((issue) => issue.severity === "error").length;
  const warnings = issues.filter((issue) => issue.severity === "warning").length;
  const info = issues.filter((issue) => issue.severity === "info").length;
  return {
    status: errors ? "error" : warnings ? "warning" : "ok",
    checkedAt: snapshot.generatedAt || new Date().toISOString(),
    counts,
    issues,
    errors,
    warnings,
    info,
    totalDocuments: Object.values(counts).reduce((sum, count) => sum + Number(count || 0), 0),
  };
}

async function refreshSystemHealth({ quiet = false } = {}) {
  if (!state.user || state.systemLoading) return;
  state.systemLoading = true;
  if (!quiet) setBusy(true, "กำลังตรวจสุขภาพระบบ");
  try {
    const snapshot = await window.EmployeeHubDatabase.loadSystemSnapshot({ includeAuditLogs: false });
    state.systemSnapshot = snapshot;
    state.systemHealth = buildSystemHealth(snapshot);
    renderSystem();
    if (!quiet) showToast(state.systemHealth.status === "ok" ? "ตรวจสุขภาพระบบแล้ว ไม่พบปัญหาสำคัญ" : "ตรวจสุขภาพระบบแล้ว กรุณาดูรายการที่พบ", state.systemHealth.status === "error" ? "error" : state.systemHealth.status === "warning" ? "warning" : "success");
  } catch (error) {
    console.error(error);
    showToast(error.message || "ตรวจสุขภาพระบบไม่สำเร็จ", "error");
  } finally {
    state.systemLoading = false;
    state.loading = false;
    els.refreshButton.disabled = false;
    if (!quiet) setSyncStatus("online", "เชื่อมต่อแล้ว");
  }
}

function downloadTextFile(fileName, text, mimeType = "application/json;charset=utf-8") {
  const blob = new Blob([text], { type: mimeType });
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement("a");
  anchor.href = url;
  anchor.download = fileName;
  document.body.appendChild(anchor);
  anchor.click();
  anchor.remove();
  window.setTimeout(() => URL.revokeObjectURL(url), 1500);
}

async function sha256Text(text) {
  const digest = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(text));
  return [...new Uint8Array(digest)].map((part) => part.toString(16).padStart(2, "0")).join("");
}

async function createAndDownloadSystemBackup() {
  const button = document.getElementById("downloadSystemBackup");
  if (button) button.disabled = true;
  try {
    const backup = await window.EmployeeHubDatabase.createSystemBackup();
    const json = JSON.stringify(backup, null, 2);
    const hash = await sha256Text(json);
    const stamp = new Date().toISOString().replaceAll(":", "-").replace(/\.\d{3}Z$/, "Z");
    const fileName = `employee-hub-backup-${stamp}.json`;
    downloadTextFile(fileName, json);
    state.systemLastBackup = { fileName, hash, bytes: new TextEncoder().encode(json).byteLength, createdAt: backup.generatedAt };
    renderSystem();
    showToast("ดาวน์โหลดไฟล์สำรองระบบแล้ว");
  } catch (error) {
    console.error(error);
    showToast(error.message || "สร้างไฟล์สำรองไม่สำเร็จ", "error");
  } finally {
    if (button) button.disabled = false;
  }
}

function systemSeverityLabel(severity) {
  return severity === "error" ? "ผิดพลาด" : severity === "warning" ? "ควรตรวจ" : "ข้อมูล";
}

function renderSystem() {
  const health = state.systemHealth;
  const counts = health?.counts || {};
  const issueRows = health?.issues || [];
  const migrationComplete = Boolean(state.migrationStatus?.migrationId && state.migrationStatus?.workdayMigrationId && state.migrationStatus?.monthlyPerformanceMigrationId);
  els.systemView.innerHTML = `
    <div class="page-grid">
      <article class="panel score-sync-hero">
        <div class="panel-head">
          <div><p class="eyebrow">PRODUCTION FINALIZATION</p><h2>ระบบและสำรองข้อมูล</h2><p>ตรวจความสมบูรณ์ของฐานข้อมูลและสร้าง Backup ก่อนเปลี่ยนแปลงข้อมูลสำคัญ</p></div>
          <span class="badge ${health?.status === "ok" ? "badge-ready" : health?.status === "error" ? "badge-danger" : "badge-progress"}">${health ? (health.status === "ok" ? "ระบบปกติ" : health.status === "error" ? "พบข้อผิดพลาด" : "ควรตรวจสอบ") : "ยังไม่ได้ตรวจ"}</span>
        </div>
        <div class="system-action-grid">
          <article class="system-action-card"><span class="kpi-icon"><i data-lucide="stethoscope"></i></span><h3>ตรวจสุขภาพระบบ</h3><p>ตรวจรหัสพนักงาน ข้อมูลอ้างอิง สูตรคะแนน ยอดรวม และสถานะการย้ายข้อมูลเดิม</p><button id="runSystemHealth" class="button button-primary" type="button"><i data-lucide="scan-line"></i>ตรวจตอนนี้</button></article>
          <article class="system-action-card"><span class="kpi-icon"><i data-lucide="database-backup"></i></span><h3>สำรอง Firestore</h3><p>ดาวน์โหลดข้อมูลทุก Collection รวม Audit Log เป็นไฟล์ JSON สำหรับเก็บภายในบริษัท</p><button id="downloadSystemBackup" class="button button-secondary" type="button"><i data-lucide="download"></i>ดาวน์โหลด Backup</button></article>
          <article class="system-action-card"><span class="kpi-icon"><i data-lucide="clipboard-check"></i></span><h3>สถานะ Production</h3><p>${migrationComplete ? "การย้ายข้อมูลหลักครบแล้ว และ Migration Center ถูกซ่อนจากระบบใช้งานจริง" : "พบว่าสถานะการย้ายข้อมูลบางส่วนไม่ครบ กรุณาใช้ Migration Tools Archive ภายในบริษัท"}</p><span class="badge ${migrationComplete ? "badge-ready" : "badge-progress"}">${migrationComplete ? "Production พร้อมใช้งาน" : "ควรตรวจสอบ"}</span></article>
        </div>
        ${state.systemLastBackup ? `<div class="notice notice-success" style="margin-top:16px"><i data-lucide="file-check-2"></i><div><strong>Backup ล่าสุดในรอบนี้</strong><br>${escapeHtml(state.systemLastBackup.fileName)} · ${formatNumber(state.systemLastBackup.bytes / 1024, 1)} KB<br><span class="backup-hash">SHA-256: ${escapeHtml(state.systemLastBackup.hash)}</span></div></div>` : ""}
      </article>

      ${health ? `
      <article class="panel">
        <div class="panel-head"><div><h2>ผลตรวจสุขภาพ</h2><p>ตรวจเมื่อ ${formatDate(health.checkedAt)}</p></div></div>
        <div class="health-summary">
          <div class="health-stat"><span>เอกสารทั้งหมด</span><strong>${formatNumber(health.totalDocuments, 0)}</strong></div>
          <div class="health-stat"><span>ข้อผิดพลาด</span><strong class="negative">${health.errors}</strong></div>
          <div class="health-stat"><span>ควรตรวจสอบ</span><strong>${health.warnings}</strong></div>
          <div class="health-stat"><span>ข้อมูลแจ้งเตือน</span><strong>${health.info}</strong></div>
        </div>
        ${issueRows.length ? `<div class="table-wrap health-table"><table><thead><tr><th>ระดับ</th><th>โมดูล</th><th>รายการ</th><th>รายละเอียด</th></tr></thead><tbody>${issueRows.map((issue) => `<tr><td><span class="health-status health-${escapeHtml(issue.severity)}">${systemSeverityLabel(issue.severity)}</span></td><td>${escapeHtml(issue.module)}</td><td><code>${escapeHtml(issue.item)}</code></td><td>${escapeHtml(issue.message)}</td></tr>`).join("")}</tbody></table></div>` : `<div class="notice notice-success"><i data-lucide="circle-check-big"></i><div><strong>ไม่พบปัญหาสำคัญ</strong><br>ข้อมูลอ้างอิงและสูตรที่ตรวจสอบผ่านเงื่อนไขของระบบ</div></div>`}
      </article>

      <article class="panel">
        <div class="panel-head"><div><h2>จำนวนข้อมูลในแต่ละ Collection</h2><p>ไม่รวม Audit Log ในการตรวจสุขภาพเพื่อให้โหลดเร็วขึ้น แต่ Backup จะรวม Audit Log ด้วย</p></div></div>
        <div class="collection-count-grid">${Object.entries(counts).sort(([a], [b]) => a.localeCompare(b)).map(([name, count]) => `<div class="collection-count-card"><span>${escapeHtml(SYSTEM_COLLECTION_LABELS[name] || name)}<br><code>${escapeHtml(name)}</code></span><strong>${formatNumber(count, 0)}</strong></div>`).join("")}</div>
      </article>` : `<article class="panel"><div class="empty-state"><i data-lucide="shield-question"></i><p>กด “ตรวจตอนนี้” เพื่อประเมินฐานข้อมูล</p></div></article>`}

      <article class="panel">
        <div class="panel-head"><div><h2>Production Checklist</h2><p>รายการแนะนำก่อนเลิกใช้ Web เดิม</p></div></div>
        <div class="production-checklist">
          ${[
            [migrationComplete, "Migration ข้อมูลหลักครบทั้ง Service Incentive, Workday และ Monthly Performance"],
            [Boolean(state.migrationStatus?.employeeCodeMigrationId), "รหัสพนักงานเรียงตามวันที่เริ่มงานแล้ว"],
            [Boolean(state.systemLastBackup), "ดาวน์โหลด Backup หลังตรวจข้อมูลล่าสุดแล้ว"],
            [health?.status === "ok", "ผลตรวจสุขภาพไม่มี Error หรือ Warning"],
            [true, "เก็บ Google Sheets เดิมเป็น Read-only และ Backup ภายในบริษัท"],
          ].map(([done, text]) => `<div class="production-check"><i data-lucide="${done ? "circle-check-big" : "circle-dashed"}"></i><div><strong>${done ? "เรียบร้อย" : "รอดำเนินการ"}</strong><br>${escapeHtml(text)}</div></div>`).join("")}
        </div>
      </article>
    </div>`;
  document.getElementById("runSystemHealth")?.addEventListener("click", () => refreshSystemHealth());
  document.getElementById("downloadSystemBackup")?.addEventListener("click", createAndDownloadSystemBackup);
  ensureIcons();
}

async function handleLogin(event) {
  event.preventDefault();
  const button = els.loginButton;
  button.disabled = true;
  showAuthMessage("กำลังเข้าสู่ระบบ...");
  try {
    await window.EmployeeHubDatabase.signIn(els.loginEmail.value, els.loginPassword.value);
    await initializeAuthenticatedApp();
  } catch (error) {
    console.error(error);
    showAuthMessage(error.message || "เข้าสู่ระบบไม่สำเร็จ", true);
  } finally { button.disabled = false; }
}

async function initializeAuthenticatedApp() {
  const user = await window.EmployeeHubDatabase.getAuthenticatedUser();
  if (!user) { setVisibleApp(false); return; }
  const profile = await window.EmployeeHubDatabase.getProfile(user.uid);
  if (profile.role !== "admin") {
    await window.EmployeeHubDatabase.signOut();
    throw new Error("Employee Hub เวอร์ชันนี้อนุญาตเฉพาะบัญชี admin");
  }
  state.user = user;
  state.profile = profile;
  els.accountName.textContent = profile.displayName || user.email || "Admin";
  els.accountRole.textContent = "ผู้ดูแลระบบ";
  setVisibleApp(true);
  setSyncStatus("syncing", "กำลังโหลดข้อมูล");
  await refreshData();
  const hashView = window.location.hash.replace("#", "");
  showView(VIEW_TITLES[hashView] ? hashView : "dashboard");
}

function bindGlobalEvents() {
  els.loginForm.addEventListener("submit", handleLogin);
  els.logoutButton.addEventListener("click", async () => {
    try {
      await window.EmployeeHubDatabase.signOut();
      state.user = null; state.profile = null;
      setVisibleApp(false);
      showAuthMessage("ออกจากระบบแล้ว");
    } catch (error) { showToast(error.message, "error"); }
  });
  els.refreshButton.addEventListener("click", () => {
    if (state.currentView === "performance") {
      refreshPerformanceData({ force: true });
      if (state.performanceTab === "employee360") refreshEmployee360Data({ quiet: true });
    }
    else if (state.currentView === "workday") refreshWorkdayData({ force: true });
    else if (state.currentView === "monthly") refreshMonthlyData({ force: true });
    else if (state.currentView === "closing") refreshClosingData({ force: true });
    else if (state.currentView === "system") refreshSystemHealth({ force: true });
    else refreshData();
  });
  document.addEventListener("click", (event) => {
    const nav = event.target.closest("[data-view]");
    if (nav) showView(nav.dataset.view);
  });
  document.addEventListener("keydown", (event) => {
    if (event.key === "Escape" && els.modalRoot.innerHTML) els.modalRoot.innerHTML = "";
  });
}

async function bootstrap() {
  cacheElements();
  bindGlobalEvents();
  ensureIcons();
  if (!window.EmployeeHubDatabase?.isConfigured()) {
    els.authConfigHelp.hidden = false;
    showAuthMessage("ยังไม่ได้ตั้งค่า Firebase Web App", true);
    return;
  }
  try {
    await window.EmployeeHubDatabaseReady;
    const user = await window.EmployeeHubDatabase.getAuthenticatedUser();
    if (user) await initializeAuthenticatedApp();
    else setVisibleApp(false);
  } catch (error) {
    console.error(error);
    setVisibleApp(false);
    showAuthMessage(error.message || "เริ่มระบบไม่สำเร็จ", true);
  }
}

window.addEventListener("DOMContentLoaded", bootstrap);
