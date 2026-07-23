"use strict";

const VIEW_TITLES = Object.freeze({
  dashboard: "ภาพรวมระบบ",
  employees: "ฐานข้อมูลพนักงานกลาง",
  service: "Service Incentive",
  performance: "Performance Summary",
  workday: "Workday Insight",
  monthly: "Monthly Performance",
  migration: "Migration Center",
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

const state = {
  user: null,
  profile: null,
  currentView: "dashboard",
  loading: false,
  employees: [],
  incentives: [],
  evaluationSummary: { count: 0, years: [], latestUpdatedAt: "" },
  migrationStatus: null,
  seed: null,
  seedFileName: "",
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
  workdaySeed: null,
  workdaySeedFileName: "",
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
  monthlySeed: null,
  monthlySeedFileName: "",
};

const els = {};

function cacheElements() {
  [
    "authGate", "authMessage", "loginForm", "loginEmail", "loginPassword", "loginButton", "authConfigHelp",
    "appShell", "mobileNav", "pageTitle", "databaseStatusDot", "databaseStatusLabel", "accountName", "accountRole",
    "logoutButton", "refreshButton", "syncBadge", "dashboardView", "employeesView", "serviceView", "performanceView",
    "workdayView", "monthlyView", "migrationView", "modalRoot", "toastRegion",
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

function buildEmployeeCodePlan() {
  const invalid = state.employees.filter((employee) => !/^\d{4}-\d{2}-\d{2}$/.test(String(employee.startDate || "")));
  if (invalid.length) throw new Error(`ยังมีพนักงาน ${invalid.length} คนที่ไม่มีวันที่เริ่มงานที่ถูกต้อง`);
  return [...state.employees]
    .sort((a, b) => a.startDate.localeCompare(b.startDate) || a.fullName.localeCompare(b.fullName, "th") || a.id.localeCompare(b.id))
    .map((employee, index) => ({
      ...employee,
      nextEmployeeCode: `EMP${String(index + 1).padStart(3, "0")}`,
      nextSortOrder: index + 1,
    }));
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
  if (viewName === "workday") void refreshWorkdayData();
  if (viewName === "monthly") void refreshMonthlyData();
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
    migration: renderMigration,
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
  const migrationReady = Boolean(state.migrationStatus);
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
          <div class="kpi-value">${workdayReady ? (Number(workdayCounts.attendanceMonthly) || 0) + (Number(workdayCounts.leaveRecords) || 0) : "รอ"}</div><div class="kpi-note">${workdayReady ? `เวลา ${Number(workdayCounts.attendanceMonthly) || 0} · วันลา ${Number(workdayCounts.leaveRecords) || 0}` : "รอนำเข้า Phase 2"}</div>
        </article>
      </div>

      <div class="module-grid">
        ${moduleCard({ icon: "users-round", title: "Employee Master", description: "รายชื่อ รหัสพนักงาน วันที่เริ่มงาน และ Legacy IDs", status: state.employees.length ? "เชื่อมต่อแล้ว" : "รอนำเข้า", statusClass: state.employees.length ? "badge-ready" : "badge-progress", view: "employees" })}
        ${moduleCard({ icon: "badge-dollar-sign", title: "Service Incentive", description: "บันทึกยอดขาย ประเมิน เวลา และยอดรวมรายเดือน", status: state.incentives.length ? "ใช้งานได้" : "รอนำเข้า", statusClass: state.incentives.length ? "badge-ready" : "badge-progress", view: "service" })}
        ${moduleCard({ icon: "chart-no-axes-combined", title: "Performance Summary", description: "ฐานข้อมูล Firebase เดิมยังทำงานปกติ เตรียมรวม UI ในระยะถัดไป", status: "เชื่อมฐานข้อมูลแล้ว", statusClass: "badge-ready", view: "performance" })}
        ${moduleCard({ icon: "calendar-clock", title: "Workday Insight", description: "เวลาสายรายเดือน วันลา และสรุปสิทธิ์", status: workdayReady ? "ใช้งานได้" : "รอนำเข้า", statusClass: workdayReady ? "badge-ready" : "badge-progress", view: "workday" })}
        ${moduleCard({ icon: "clipboard-check", title: "Monthly Performance", description: "คะแนนรายวัน สถานะการทำงาน วันทำงานจริง และการปิดเดือน", status: state.migrationStatus?.monthlyPerformanceMigrationId ? "ใช้งานได้" : "รอนำเข้า", statusClass: state.migrationStatus?.monthlyPerformanceMigrationId ? "badge-ready" : "badge-progress", view: "monthly" })}
        ${moduleCard({ icon: "database-zap", title: "Migration Center", description: "จัดการ Seed ของ Phase 1, Workday Phase 2 และ Monthly Phase 3", status: state.migrationStatus?.monthlyPerformanceMigrationId ? "Phase 3 แล้ว" : (workdayReady ? "Phase 2 แล้ว" : (migrationReady ? "Phase 1 แล้ว" : "พร้อมนำเข้า")), statusClass: migrationReady ? "badge-ready" : "badge-progress", view: "migration" })}
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

function renderPerformance() {
  const summary = state.evaluationSummary;
  els.performanceView.innerHTML = `
    <div class="page-grid">
      <div class="kpi-grid">
        <article class="kpi-card"><div class="kpi-head"><span>Evaluation Records</span><span class="kpi-icon"><i data-lucide="database"></i></span></div><div class="kpi-value">${summary.count}</div><div class="kpi-note">Collection: evaluations</div></article>
        <article class="kpi-card"><div class="kpi-head"><span>ปีข้อมูล</span><span class="kpi-icon"><i data-lucide="calendar-range"></i></span></div><div class="kpi-value">${summary.years.length}</div><div class="kpi-note">${escapeHtml(summary.years.join(", ") || "ยังไม่มีข้อมูล")}</div></article>
        <article class="kpi-card"><div class="kpi-head"><span>อัปเดตล่าสุด</span><span class="kpi-icon"><i data-lucide="history"></i></span></div><div class="kpi-value" style="font-size:1.15rem">${formatDate(summary.latestUpdatedAt)}</div><div class="kpi-note">อ่านจาก Firestore เดิม</div></article>
        <article class="kpi-card"><div class="kpi-head"><span>สถานะ</span><span class="kpi-icon"><i data-lucide="circle-check"></i></span></div><div class="kpi-value">ปกติ</div><div class="kpi-note">Web เดิมยังใช้งานได้</div></article>
      </div>
      <article class="panel">
        <div class="panel-head"><div><h2>แผนรวม Performance Summary</h2><p>Phase 1 เชื่อมฐานข้อมูลและ Employee IDs แล้ว โดยยังไม่เปลี่ยน UI เดิม</p></div><span class="badge badge-ready">ฐานข้อมูลเชื่อมแล้ว</span></div>
        <div class="notice notice-info"><i data-lucide="shield-check"></i><div>ระบบใหม่นี้ไม่แก้หรือลบ Collection <code>evaluations</code>, <code>settings</code> และ <code>employeeNames</code> ที่ Web Performance Summary ใช้อยู่</div></div>
        <div class="progress-list" style="margin-top:16px">
          <div class="progress-row"><span>Firebase Auth</span><div class="progress-track"><div class="progress-bar" style="width:100%"></div></div><strong>100%</strong></div>
          <div class="progress-row"><span>Employee Master</span><div class="progress-track"><div class="progress-bar" style="width:100%"></div></div><strong>100%</strong></div>
          <div class="progress-row"><span>รวม UI</span><div class="progress-track"><div class="progress-bar" style="width:35%"></div></div><strong>Phase 2</strong></div>
        </div>
      </article>
    </div>`;
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
          <span class="badge ${imported ? "badge-ready" : "badge-progress"}">${imported ? "Phase 2 พร้อมใช้งาน" : "รอนำเข้า Phase 2"}</span>
        </div>
        ${imported
          ? `<div class="notice notice-success"><i data-lucide="circle-check"></i><div>นำเข้าข้อมูลแล้ว: เวลาสาย <strong>${Number(counts.attendanceMonthly) || 0}</strong> รายการ · วันลา <strong>${Number(counts.leaveRecords) || 0}</strong> รายการ</div></div>`
          : `<div class="notice notice-warning"><i data-lucide="triangle-alert"></i><div>เปิด Migration Center แล้วเลือกไฟล์ <code>migration/workday-phase2-seed.json</code> ก่อนใช้งานข้อมูลเดิม</div></div>`}
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
  const today = new Date().toISOString().slice(0, 10);
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

function calculateMonthlySummary() {
  const overrideMap = new Map(state.monthlyOverrides.map((item) => [item.employeeId, Number(item.actualWorkDaysOverride)]));
  const employeesWithEntries = new Set(state.monthlyEntries.map((entry) => entry.employeeId));
  const rows = state.employees
    .filter((employee) => employee.isActive || employeesWithEntries.has(employee.id))
    .sort((a, b) => (Number(a.sortOrder) || 999999) - (Number(b.sortOrder) || 999999) || a.fullName.localeCompare(b.fullName, "th"))
    .map((employee) => {
      const employeeEntries = state.monthlyEntries.filter((entry) => entry.employeeId === employee.id);
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

function validateMonthlyData() {
  const issues = [];
  const employeeIds = new Set(state.employees.map((employee) => employee.id));
  state.monthlyEntries.forEach((entry) => {
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
  const calculated = calculateMonthlySummary();
  calculated.rows.forEach((row) => {
    const totalScore = MONTHLY_CRITERIA.reduce((sum, criterion) => sum + Number(row.criteria[criterion.id].totalScore || 0), 0);
    if (row.actualWorkDays === 0 && totalScore !== 0) issues.push({ severity: "ERROR", code: "SCORE_WITH_ZERO_WORKDAYS", message: "มีคะแนนแต่วันทำงานจริงเป็น 0", details: { employeeId: row.employeeId } });
    if (row.isOverridden && row.actualWorkDays !== row.autoWorkDays) issues.push({ severity: "INFO", code: "WORKDAY_OVERRIDE", message: "วันทำงานจริงถูกกำหนดเองและต่างจาก Auto", details: { employeeId: row.employeeId, autoWorkDays: row.autoWorkDays, actualWorkDays: row.actualWorkDays } });
  });
  activeEmployees().forEach((employee) => {
    if (!state.monthlyEntries.some((entry) => entry.employeeId === employee.id)) issues.push({ severity: "WARNING", code: "NO_MONTH_DATA", message: "พนักงานไม่มีข้อมูลในเดือนนี้", details: { employeeId: employee.id } });
  });
  const counts = { error: 0, warning: 0, info: 0 };
  issues.forEach((issue) => { counts[issue.severity.toLowerCase()] += 1; });
  return { monthKey: state.monthlyMonth, checkedAt: new Date().toISOString(), passed: counts.error === 0, counts, totalIssues: issues.length, issues };
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
          <span class="badge ${imported ? "badge-ready" : "badge-progress"}">${imported ? "Phase 3 พร้อมใช้งาน" : "รอนำเข้า Phase 3"}</span>
        </div>
        ${imported
          ? `<div class="notice notice-success"><i data-lucide="circle-check"></i><div>นำเข้าข้อมูลแล้ว: รายวัน <strong>${Number(counts.dailyPerformanceEntries) || 0}</strong> รายการ · Overrides <strong>${Number(counts.monthlyPerformanceOverrides) || 0}</strong> รายการ</div></div>`
          : `<div class="notice notice-warning"><i data-lucide="triangle-alert"></i><div>เปิด Migration Center แล้วเลือกไฟล์ <code>migration/monthly-performance-phase3-seed.json</code> ก่อนใช้งานข้อมูลเดิม</div></div>`}
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
    const editing = monthlySelectedEntry();
    const employeeId = editing?.employeeId || employeeSelect.value;
    const date = dateInput.value;
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
function workdayMigrationPanelHtml() {
  const imported = Boolean(state.migrationStatus?.workdayMigrationId);
  const counts = state.workdaySeed?.counts || state.migrationStatus?.workdayCounts || { attendanceMonthly: 66, leaveRecords: 118, excludedSourceRecords: 3, missingAttendanceMonths: 6 };
  return `
    <article class="panel">
      <div class="panel-head"><div><h2>Migration Center · Phase 2</h2><p>นำเข้า Workday Insight: เวลาสายรายเดือนและวันลาที่ตรวจสอบแล้ว</p></div><span class="badge ${imported ? "badge-ready" : "badge-progress"}">${imported ? "นำเข้าแล้ว" : "พร้อมนำเข้า"}</span></div>
      ${imported
        ? `<div class="notice notice-success"><i data-lucide="circle-check"></i><div><strong>Workday Migration สำเร็จ</strong><br>ID: ${escapeHtml(state.migrationStatus.workdayMigrationId)} · วันที่ ${formatDate(state.migrationStatus.workdayImportedAt)}</div></div>`
        : `<div class="notice notice-warning"><i data-lucide="triangle-alert"></i><div>Phase 2 จะเพิ่ม Collection <code>attendanceMonthly</code> และ <code>leaveRecords</code> โดยไม่แก้ Google Sheets เดิมและไม่ลบข้อมูล Phase 1</div></div>`}
      <div class="kpi-grid" style="margin-top:16px">
        <article class="kpi-card"><div class="kpi-head"><span>เวลาสายรายเดือน</span><span class="kpi-icon"><i data-lucide="clock-3"></i></span></div><div class="kpi-value">${Number(counts.attendanceMonthly) || 0}</div><div class="kpi-note">ข้อมูลต้นฉบับ 6 เดือน</div></article>
        <article class="kpi-card"><div class="kpi-head"><span>วันลา</span><span class="kpi-icon"><i data-lucide="calendar-off"></i></span></div><div class="kpi-value">${Number(counts.leaveRecords) || 0}</div><div class="kpi-note">หลังใช้ข้อยืนยัน Migration</div></article>
        <article class="kpi-card"><div class="kpi-head"><span>ไม่นำเข้า</span><span class="kpi-icon"><i data-lucide="file-x-2"></i></span></div><div class="kpi-value">${Number(counts.excludedSourceRecords) || 0}</div><div class="kpi-note">รายการขัดแย้งที่ยืนยันแล้ว</div></article>
        <article class="kpi-card"><div class="kpi-head"><span>เดือนที่ไม่มีแถว</span><span class="kpi-icon"><i data-lucide="circle-dashed"></i></span></div><div class="kpi-value">${Number(counts.missingAttendanceMonths) || 0}</div><div class="kpi-note">คงเป็น “ยังไม่มีข้อมูล” ไม่เติม 0</div></article>
      </div>
      <div class="field" style="margin-top:16px">
        <label for="workdayMigrationFile">เลือกไฟล์ Workday Phase 2 Seed</label>
        <input id="workdayMigrationFile" type="file" accept="application/json,.json" />
        <span class="field-help">ใช้ไฟล์ <code>migration/workday-phase2-seed.json</code> จากชุด Full เท่านั้น</span>
      </div>
      ${state.workdaySeed ? `<div class="notice notice-info" style="margin-top:12px"><i data-lucide="file-check-2"></i><div>เลือกไฟล์แล้ว: <strong>${escapeHtml(state.workdaySeedFileName || "workday-phase2-seed.json")}</strong> · เวลา ${state.workdaySeed.attendanceMonthly?.length || 0} · วันลา ${state.workdaySeed.leaveRecords?.length || 0}</div></div>` : ""}
      <div class="form-actions"><button id="previewWorkdaySeedButton" class="button button-secondary" type="button" ${state.workdaySeed ? "" : "disabled"}><i data-lucide="scan-search"></i>ตรวจ Workday Seed</button><button id="importWorkdaySeedButton" class="button button-primary" type="button" ${state.workdaySeed ? "" : "disabled"}><i data-lucide="database-zap"></i>${imported ? "นำเข้า Workday ใหม่จากต้นฉบับ" : "เริ่มนำเข้า Phase 2"}</button></div>
    </article>`;
}

function bindWorkdayMigrationEvents() {
  document.getElementById("workdayMigrationFile")?.addEventListener("change", async (event) => {
    const file = event.target.files?.[0];
    if (!file) return;
    try {
      const parsed = JSON.parse(await file.text());
      if (Number(parsed.schemaVersion) !== 2 || parsed.migrationType !== "employee-hub-workday-phase-2" || !Array.isArray(parsed.attendanceMonthly) || !Array.isArray(parsed.leaveRecords)) {
        throw new Error("ไฟล์ Workday Phase 2 Seed ไม่ถูกต้อง");
      }
      state.workdaySeed = parsed;
      state.workdaySeedFileName = file.name;
      renderMigration();
      showToast("อ่านไฟล์ Workday Phase 2 Seed แล้ว");
    } catch (error) {
      state.workdaySeed = null;
      state.workdaySeedFileName = "";
      showToast(error.message || "อ่านไฟล์ Workday Seed ไม่สำเร็จ", "error");
    }
  });
  document.getElementById("previewWorkdaySeedButton")?.addEventListener("click", () => {
    if (state.workdaySeed) showWorkdaySeedPreview(state.workdaySeed);
  });
  document.getElementById("importWorkdaySeedButton")?.addEventListener("click", async (event) => {
    const imported = Boolean(state.migrationStatus?.workdayMigrationId);
    const warning = imported
      ? "ระบบเคยนำเข้า Workday Phase 2 แล้ว การนำเข้าใหม่จะเขียนข้อมูลจากไฟล์ต้นฉบับทับรายการที่มี Document ID เดียวกัน ดำเนินการต่อหรือไม่?"
      : "ยืนยันนำเข้าเวลาสาย 66 รายการ และวันลา 118 รายการเข้า Firestore ใช่หรือไม่?";
    if (!window.confirm(warning)) return;
    const button = event.currentTarget;
    button.disabled = true;
    try {
      if (!state.workdaySeed) throw new Error("กรุณาเลือกไฟล์ Workday Phase 2 Seed ก่อน");
      setBusy(true, "กำลังนำเข้า Workday Insight");
      const result = await window.EmployeeHubDatabase.importWorkdayPhase2Seed(state.workdaySeed);
      showToast(`นำเข้า Phase 2 สำเร็จ: เวลา ${result.attendanceCount} · วันลา ${result.leaveCount} · ไม่นำเข้า ${result.excludedCount}`);
      state.workdayDataKey = "";
      await refreshData({ quiet: true });
    } catch (error) {
      showToast(error.message || "นำเข้า Workday Phase 2 ไม่สำเร็จ", "error", 7000);
      setSyncStatus("error", "นำเข้า Phase 2 ไม่สำเร็จ");
    } finally {
      button.disabled = false;
      state.loading = false;
    }
  });
}

function showWorkdaySeedPreview(seed) {
  const firstAttendance = seed.attendanceMonthly?.[0];
  const lastAttendance = seed.attendanceMonthly?.at(-1);
  const summaries = seed.summaries?.leaveDaysByType || {};
  els.modalRoot.innerHTML = `
    <div class="modal-backdrop"><section class="modal-card" role="dialog" aria-modal="true" aria-labelledby="workdaySeedPreviewTitle">
      <div class="modal-head"><div><p class="eyebrow">WORKDAY PHASE 2 SEED</p><h2 id="workdaySeedPreviewTitle">ตรวจไฟล์นำเข้า</h2></div><button id="closeModalButton" class="icon-button" type="button"><i data-lucide="x"></i></button></div>
      <div class="notice notice-success"><i data-lucide="badge-check"></i><div>Schema Version ${escapeHtml(seed.schemaVersion)} · Migration ID ${escapeHtml(seed.migrationId)}</div></div>
      <div class="code-block" style="margin-top:14px">เวลาสาย: ${seed.attendanceMonthly?.length || 0} รายการ\nวันลา: ${seed.leaveRecords?.length || 0} รายการ\nช่วงเวลาสาย: ${escapeHtml(firstAttendance?.yearMonth || "-")} ถึง ${escapeHtml(lastAttendance?.yearMonth || "-")}\nไม่นำเข้า: ${seed.excludedSourceRecords?.length || 0} รายการ\nเดือนที่ไม่มีแถวต้นฉบับ: ${seed.missingAttendanceMonths?.length || 0}\nวันลาป่วย: ${formatNumber(summaries.sick || 0)}\nลากิจ: ${formatNumber(summaries.personal || 0)}\nพักร้อน: ${formatNumber(summaries.vacation || 0)}\nลาอื่นๆ: ${formatNumber((summaries.ordination || 0) + (summaries.other || 0))}</div>
      <div class="notice notice-warning" style="margin-top:14px"><i data-lucide="info"></i><div>Seed ไม่เติม 0 ให้เดือนที่ไม่มี Attendance Record และยังไม่กำหนดสิทธิ์วันลาของบริษัทแทนผู้ใช้</div></div>
      <div class="form-actions"><button id="closeWorkdaySeedPreview" class="button button-primary" type="button">ปิด</button></div>
    </section></div>`;
  ensureIcons();
  const close = () => { els.modalRoot.innerHTML = ""; };
  document.getElementById("closeModalButton").addEventListener("click", close);
  document.getElementById("closeWorkdaySeedPreview").addEventListener("click", close);
}


function monthlyMigrationPanelHtml() {
  const imported = Boolean(state.migrationStatus?.monthlyPerformanceMigrationId);
  const counts = state.monthlySeed?.counts || state.migrationStatus?.monthlyPerformanceCounts || { dailyPerformanceEntries: 1748, scoreRecordsCombined: 7815, monthlyPerformanceOverrides: 72, months: 7, legacyExceptions: 1 };
  return `
    <article class="panel">
      <div class="panel-head"><div><h2>Migration Center · Phase 3</h2><p>นำเข้า Monthly Performance: สถานะรายวัน คะแนน 5 หัวข้อ และวันทำงานจริง</p></div><span class="badge ${imported ? "badge-ready" : "badge-progress"}">${imported ? "นำเข้าแล้ว" : "พร้อมนำเข้า"}</span></div>
      ${imported ? `<div class="notice notice-success"><i data-lucide="circle-check"></i><div><strong>Monthly Performance Migration สำเร็จ</strong><br>ID: ${escapeHtml(state.migrationStatus.monthlyPerformanceMigrationId)} · วันที่ ${formatDate(state.migrationStatus.monthlyPerformanceImportedAt)}</div></div>` : `<div class="notice notice-warning"><i data-lucide="triangle-alert"></i><div>Phase 3 จะเพิ่ม Collection <code>dailyPerformanceEntries</code>, <code>monthlyPerformanceOverrides</code> และ <code>monthlyPerformanceStatus</code> โดยไม่แก้ Google Sheets เดิม</div></div>`}
      <div class="kpi-grid" style="margin-top:16px">
        <article class="kpi-card"><div class="kpi-head"><span>ข้อมูลรายวัน</span><span class="kpi-icon"><i data-lucide="calendar-check-2"></i></span></div><div class="kpi-value">${Number(counts.dailyPerformanceEntries) || 0}</div><div class="kpi-note">รวม Attendance และคะแนนแล้ว</div></article>
        <article class="kpi-card"><div class="kpi-head"><span>คะแนนต้นฉบับ</span><span class="kpi-icon"><i data-lucide="list-checks"></i></span></div><div class="kpi-value">${Number(counts.scoreRecordsCombined) || 0}</div><div class="kpi-note">5 หัวข้อจาก Excel</div></article>
        <article class="kpi-card"><div class="kpi-head"><span>Overrides</span><span class="kpi-icon"><i data-lucide="calendar-cog"></i></span></div><div class="kpi-value">${Number(counts.monthlyPerformanceOverrides) || 0}</div><div class="kpi-note">วันทำงานจริง ม.ค.–มิ.ย.</div></article>
        <article class="kpi-card"><div class="kpi-head"><span>ประวัติพิเศษ</span><span class="kpi-icon"><i data-lucide="badge-alert"></i></span></div><div class="kpi-value">${Number(counts.legacyExceptions) || 0}</div><div class="kpi-note">คะแนน 3.5 ที่ยืนยันแล้ว</div></article>
      </div>
      <div class="field" style="margin-top:16px"><label for="monthlyMigrationFile">เลือกไฟล์ Monthly Performance Phase 3 Seed</label><input id="monthlyMigrationFile" type="file" accept="application/json,.json" /><span class="field-help">ใช้ไฟล์ <code>migration/monthly-performance-phase3-seed.json</code> จากชุด Full เท่านั้น</span></div>
      ${state.monthlySeed ? `<div class="notice notice-info" style="margin-top:12px"><i data-lucide="file-check-2"></i><div>เลือกไฟล์แล้ว: <strong>${escapeHtml(state.monthlySeedFileName || "monthly-performance-phase3-seed.json")}</strong> · รายวัน ${state.monthlySeed.dailyPerformanceEntries?.length || 0} · Overrides ${state.monthlySeed.monthlyPerformanceOverrides?.length || 0}</div></div>` : ""}
      <div class="form-actions"><button id="previewMonthlySeedButton" class="button button-secondary" type="button" ${state.monthlySeed ? "" : "disabled"}><i data-lucide="scan-search"></i>ตรวจ Monthly Seed</button><button id="importMonthlySeedButton" class="button button-primary" type="button" ${state.monthlySeed ? "" : "disabled"}><i data-lucide="database-zap"></i>${imported ? "นำเข้า Monthly ใหม่จากต้นฉบับ" : "เริ่มนำเข้า Phase 3"}</button></div>
    </article>`;
}

function bindMonthlyMigrationEvents() {
  document.getElementById("monthlyMigrationFile")?.addEventListener("change", async (event) => {
    const file = event.target.files?.[0];
    if (!file) return;
    try {
      const parsed = JSON.parse(await file.text());
      if (Number(parsed.schemaVersion) !== 3 || parsed.migrationType !== "employee-hub-monthly-performance-phase-3" || !Array.isArray(parsed.dailyPerformanceEntries) || !Array.isArray(parsed.monthlyPerformanceOverrides)) throw new Error("ไฟล์ Monthly Performance Phase 3 Seed ไม่ถูกต้อง");
      state.monthlySeed = parsed;
      state.monthlySeedFileName = file.name;
      renderMigration();
      showToast("อ่านไฟล์ Monthly Performance Phase 3 Seed แล้ว");
    } catch (error) {
      state.monthlySeed = null;
      state.monthlySeedFileName = "";
      showToast(error.message || "อ่านไฟล์ Monthly Seed ไม่สำเร็จ", "error");
    }
  });
  document.getElementById("previewMonthlySeedButton")?.addEventListener("click", () => { if (state.monthlySeed) showMonthlySeedPreview(state.monthlySeed); });
  document.getElementById("importMonthlySeedButton")?.addEventListener("click", async (event) => {
    const imported = Boolean(state.migrationStatus?.monthlyPerformanceMigrationId);
    const warning = imported ? "ระบบเคยนำเข้า Monthly Phase 3 แล้ว การนำเข้าใหม่จะเขียนข้อมูลจากไฟล์ต้นฉบับทับ Document ID เดิม ดำเนินการต่อหรือไม่?" : "ยืนยันนำเข้าข้อมูลรายวัน 1,748 รายการ และ Override 72 รายการเข้า Firestore ใช่หรือไม่?";
    if (!window.confirm(warning)) return;
    const button = event.currentTarget;
    button.disabled = true;
    try {
      if (!state.monthlySeed) throw new Error("กรุณาเลือกไฟล์ Monthly Performance Phase 3 Seed ก่อน");
      setBusy(true, "กำลังนำเข้า Monthly Performance");
      const result = await window.EmployeeHubDatabase.importMonthlyPerformancePhase3Seed(state.monthlySeed);
      showToast(`นำเข้า Monthly สำเร็จ: รายวัน ${result.entryCount} · Overrides ${result.overrideCount}`);
      state.monthlyDataKey = "";
      await refreshData({ quiet: true });
    } catch (error) { showToast(error.message || "นำเข้า Monthly ไม่สำเร็จ", "error", 7000); setSyncStatus("error", "นำเข้าไม่สำเร็จ"); }
    finally { button.disabled = false; state.loading = false; }
  });
}

function showMonthlySeedPreview(seed) {
  const summary = seed.summaries || {};
  els.modalRoot.innerHTML = `<div class="modal-backdrop"><section class="modal-card" role="dialog" aria-modal="true" aria-labelledby="monthlySeedPreviewTitle"><div class="modal-head"><div><p class="eyebrow">MONTHLY PHASE 3 SEED</p><h2 id="monthlySeedPreviewTitle">ตรวจไฟล์นำเข้า</h2></div><button id="closeModalButton" class="icon-button" type="button"><i data-lucide="x"></i></button></div><div class="notice notice-success"><i data-lucide="badge-check"></i><div>Schema Version ${escapeHtml(seed.schemaVersion)} · Migration ID ${escapeHtml(seed.migrationId)}</div></div><div class="code-block" style="margin-top:14px">ข้อมูลรายวัน: ${seed.dailyPerformanceEntries?.length || 0}
คะแนนต้นฉบับที่รวม: ${seed.counts?.scoreRecordsCombined || 0}
Overrides: ${seed.monthlyPerformanceOverrides?.length || 0}
ช่วงข้อมูล: ${escapeHtml(summary.dateFrom || "-")} ถึง ${escapeHtml(summary.dateTo || "-")}
เดือนข้อมูล: ${seed.counts?.months || 0}
คะแนนประวัติพิเศษ: ${seed.legacyExceptions?.length || 0}</div><div class="notice notice-warning" style="margin-top:14px"><i data-lucide="triangle-alert"></i><div>คะแนนประวัติพิเศษ 3.5 จำนวน 1 รายการจะถูกเก็บเป็น <code>legacyException=true</code> ตามข้อยืนยัน</div></div><div class="form-actions"><button id="closeMonthlySeedPreview" class="button button-primary" type="button">ปิด</button></div></section></div>`;
  ensureIcons();
  const close = () => { els.modalRoot.innerHTML = ""; };
  document.getElementById("closeModalButton").addEventListener("click", close);
  document.getElementById("closeMonthlySeedPreview").addEventListener("click", close);
}

function renderMigration() {
  const status = state.migrationStatus;
  const seedCounts = state.seed?.counts || { employees: 12, serviceIncentives: 72, serviceMonths: 6 };
  let employeeCodePlan = [];
  let employeeCodePlanError = "";
  try { employeeCodePlan = buildEmployeeCodePlan(); } catch (error) { employeeCodePlanError = error.message; }
  const employeeCodeOrderMatches = !employeeCodePlanError && employeeCodePlan.every((employee) =>
    employee.employeeCode === employee.nextEmployeeCode && Number(employee.sortOrder) === employee.nextSortOrder
  );
  const employeeCodeOrderApplied = employeeCodeOrderMatches;
  els.migrationView.innerHTML = `
    <div class="page-grid">
      <article class="panel">
        <div class="panel-head"><div><h2>Migration Center · Phase 1</h2><p>นำเข้า Employee Master และ Service Incentive จากไฟล์ที่ตรวจสอบแล้ว</p></div><span class="badge ${status ? "badge-ready" : "badge-progress"}">${status ? "นำเข้าแล้ว" : "พร้อมนำเข้า"}</span></div>
        ${status ? `<div class="notice notice-success"><i data-lucide="circle-check"></i><div><strong>Migration สำเร็จ</strong><br>ID: ${escapeHtml(status.migrationId)} · วันที่ ${formatDate(status.importedAt)}</div></div>` : `<div class="notice notice-warning"><i data-lucide="triangle-alert"></i><div>การกดนำเข้าจะเพิ่ม/อัปเดตข้อมูลใน Firestore Project เดิม โดยไม่ลบ Google Sheets และไม่ลบ Performance Summary เดิม</div></div>`}
        <div class="kpi-grid" style="margin-top:16px">
          <article class="kpi-card"><div class="kpi-head"><span>Employee Master</span><span class="kpi-icon"><i data-lucide="users-round"></i></span></div><div class="kpi-value">${seedCounts.employees || 12}</div><div class="kpi-note">จับคู่ครบทุกระบบ</div></article>
          <article class="kpi-card"><div class="kpi-head"><span>Service Incentive</span><span class="kpi-icon"><i data-lucide="badge-dollar-sign"></i></span></div><div class="kpi-value">${seedCounts.serviceIncentives || 72}</div><div class="kpi-note">รายการที่ตรวจยอดรวมแล้ว</div></article>
          <article class="kpi-card"><div class="kpi-head"><span>เดือนข้อมูล</span><span class="kpi-icon"><i data-lucide="calendar-range"></i></span></div><div class="kpi-value">${seedCounts.serviceMonths || 6}</div><div class="kpi-note">ม.ค.–มิ.ย. 2569</div></article>
          <article class="kpi-card"><div class="kpi-head"><span>ข้อมูลต้นฉบับ</span><span class="kpi-icon"><i data-lucide="file-spreadsheet"></i></span></div><div class="kpi-value">3</div><div class="kpi-note">Google Sheets/Excel ยังคงเดิม</div></article>
        </div>
        <div class="field" style="margin-top:16px">
          <label for="migrationFile">เลือกไฟล์ Migration Seed จากเครื่อง</label>
          <input id="migrationFile" type="file" accept="application/json,.json" />
          <span class="field-help">ไฟล์ <code>migration/migration-seed.json</code> ถูกเก็บนอกโฟลเดอร์ docs จึงไม่ถูกเผยแพร่บน Hosting</span>
        </div>
        ${state.seed ? `<div class="notice notice-info" style="margin-top:12px"><i data-lucide="file-check-2"></i><div>เลือกไฟล์แล้ว: <strong>${escapeHtml(state.seedFileName || "migration-seed.json")}</strong> · ${state.seed.employees?.length || 0} พนักงาน · ${state.seed.serviceIncentives?.length || 0} รายการ</div></div>` : ""}
        <div class="form-actions">
          <button id="previewSeedButton" class="button button-secondary" type="button" ${state.seed ? "" : "disabled"}><i data-lucide="scan-search"></i>ตรวจไฟล์ Seed</button>
          <button id="importSeedButton" class="button button-primary" type="button" ${state.seed ? "" : "disabled"}><i data-lucide="database-zap"></i>${status ? "นำเข้าใหม่จากต้นฉบับ" : "เริ่มนำเข้า Phase 1"}</button>
        </div>
      </article>
      ${workdayMigrationPanelHtml()}
      ${monthlyMigrationPanelHtml()}
      <article class="panel">
        <div class="panel-head"><div><h2>ปรับรหัสพนักงานทั้งระบบ</h2><p>เรียงรหัสและลำดับแสดงผลจากวันที่เริ่มงานเก่าสุดไปใหม่สุด</p></div><span class="badge ${employeeCodeOrderApplied ? "badge-ready" : "badge-progress"}">${employeeCodeOrderApplied ? "ปรับแล้ว" : "พร้อมปรับ"}</span></div>
        ${employeeCodeOrderApplied
          ? `<div class="notice notice-success"><i data-lucide="circle-check"></i><div><strong>ใช้ลำดับตามอายุงานแล้ว</strong><br>${status?.employeeCodeUpdatedAt ? `อัปเดตล่าสุด ${formatDate(status.employeeCodeUpdatedAt)}` : "ตรวจสอบจากข้อมูลปัจจุบันแล้ว"}</div></div>`
          : `<div class="notice notice-info"><i data-lucide="list-ordered"></i><div>ระบบจะเปลี่ยนเฉพาะ <code>employeeCode</code> และ <code>sortOrder</code> โดยคง Firebase Document ID, Legacy IDs และข้อมูล Service Incentive เดิมทั้งหมด</div></div>`}
        ${employeeCodePlanError ? `<div class="notice notice-warning" style="margin-top:12px"><i data-lucide="triangle-alert"></i><div>${escapeHtml(employeeCodePlanError)}</div></div>` : `
        <div class="table-wrap" style="margin-top:14px"><table>
          <thead><tr><th>ลำดับ</th><th>รหัสใหม่</th><th>ชื่อพนักงาน</th><th>วันที่เริ่มงาน</th><th>รหัสปัจจุบัน</th></tr></thead>
          <tbody>${employeeCodePlan.map((employee) => `<tr><td>${employee.nextSortOrder}</td><td><strong>${escapeHtml(employee.nextEmployeeCode)}</strong></td><td>${escapeHtml(employee.fullName)}</td><td>${escapeHtml(employee.startDate)}</td><td>${escapeHtml(employee.employeeCode || "-")}</td></tr>`).join("")}</tbody>
        </table></div>`}
        <div class="form-actions"><button id="applyEmployeeCodeOrderButton" class="button button-primary" type="button" ${employeeCodeOrderApplied || employeeCodePlanError ? "disabled" : ""}><i data-lucide="arrow-down-0-1"></i>${employeeCodeOrderApplied ? "ปรับรหัสเรียบร้อยแล้ว" : "ยืนยันปรับรหัสทั้งระบบ"}</button></div>
      </article>
      <article class="panel">
        <div class="panel-head"><div><h2>ลำดับหลังนำเข้า</h2><p>ตรวจสอบก่อนย้ายโมดูลถัดไป</p></div></div>
        <ol>
          <li>ตรวจ Employee Master จำนวน 12 คน และรหัส EMP001–EMP012</li>
          <li>ตรวจ Service Incentive แต่ละเดือนเทียบกับ Google Sheets เดิม</li>
          <li>ใช้งาน Web ใหม่คู่ขนาน โดยยังไม่ลบ Web เดิม</li>
          <li>ตรวจ Workday Insight: เวลาสาย 66 รายการ และวันลา 118 รายการ</li>
          <li>ตรวจ Monthly Performance: รายวัน 1,748 รายการ และ Override 72 รายการ</li>
        </ol>
      </article>
    </div>`;

  document.getElementById("migrationFile")?.addEventListener("change", async (event) => {
    const file = event.target.files?.[0];
    if (!file) return;
    try {
      const parsed = JSON.parse(await file.text());
      if (Number(parsed.schemaVersion) !== 1 || !Array.isArray(parsed.employees) || !Array.isArray(parsed.serviceIncentives)) {
        throw new Error("ไฟล์ Migration Seed ไม่ถูกต้อง");
      }
      state.seed = parsed;
      state.seedFileName = file.name;
      renderMigration();
      ensureIcons();
      showToast("อ่านไฟล์ Migration Seed แล้ว");
    } catch (error) {
      state.seed = null;
      state.seedFileName = "";
      showToast(error.message || "อ่านไฟล์ไม่สำเร็จ", "error");
    }
  });
  document.getElementById("applyEmployeeCodeOrderButton")?.addEventListener("click", async (event) => {
    const button = event.currentTarget;
    const plan = buildEmployeeCodePlan();
    const preview = plan.map((employee) => `${employee.nextEmployeeCode} · ${employee.fullName}`).join("\n");
    if (!window.confirm(`ยืนยันเปลี่ยนรหัสพนักงานทั้ง ${plan.length} คนตามวันที่เริ่มงานหรือไม่?\n\n${preview}\n\nFirebase Document ID และข้อมูลเดิมจะไม่ถูกเปลี่ยน`)) return;
    button.disabled = true;
    try {
      setBusy(true, "กำลังปรับรหัสพนักงาน");
      const result = await window.EmployeeHubDatabase.reorderEmployeeCodesByStartDate();
      showToast(`ปรับรหัสและลำดับพนักงานสำเร็จ ${result.count} คน`);
      await refreshData({ quiet: true });
    } catch (error) {
      showToast(error.message || "ปรับรหัสพนักงานไม่สำเร็จ", "error", 6500);
      setSyncStatus("error", "ปรับรหัสไม่สำเร็จ");
    } finally {
      button.disabled = false;
      state.loading = false;
    }
  });
  document.getElementById("previewSeedButton")?.addEventListener("click", () => {
    if (state.seed) showSeedPreview(state.seed);
  });
  document.getElementById("importSeedButton")?.addEventListener("click", async (event) => {
    const button = event.currentTarget;
    const warning = status
      ? "ระบบเคยนำเข้าแล้ว การนำเข้าใหม่จะเขียนค่าจากไฟล์ต้นฉบับทับ Service Incentive เดิมของเดือน ม.ค.–มิ.ย. 2569 ดำเนินการต่อหรือไม่?"
      : "ยืนยันนำเข้า Employee Master 12 คน และ Service Incentive 72 รายการเข้า Firestore ใช่หรือไม่?";
    if (!window.confirm(warning)) return;
    button.disabled = true;
    try {
      if (!state.seed) throw new Error("กรุณาเลือกไฟล์ Migration Seed ก่อน");
      setBusy(true, "กำลังนำเข้าข้อมูล");
      const result = await window.EmployeeHubDatabase.importMigrationSeed(state.seed);
      showToast(`นำเข้าสำเร็จ: พนักงาน ${result.employeeCount} คน · Incentive ${result.incentiveCount} รายการ`);
      await refreshData({ quiet: true });
    } catch (error) {
      showToast(error.message, "error", 6500);
      setSyncStatus("error", "นำเข้าไม่สำเร็จ");
    } finally {
      button.disabled = false;
      state.loading = false;
    }
  });
  bindWorkdayMigrationEvents();
  bindMonthlyMigrationEvents();
}

function showSeedPreview(seed) {
  const first = seed.serviceIncentives?.[0];
  const last = seed.serviceIncentives?.at(-1);
  els.modalRoot.innerHTML = `
    <div class="modal-backdrop"><section class="modal-card" role="dialog" aria-modal="true" aria-labelledby="seedPreviewTitle">
      <div class="modal-head"><div><p class="eyebrow">MIGRATION SEED</p><h2 id="seedPreviewTitle">ตรวจไฟล์นำเข้า</h2></div><button id="closeModalButton" class="icon-button" type="button"><i data-lucide="x"></i></button></div>
      <div class="notice notice-success"><i data-lucide="badge-check"></i><div>Schema Version ${escapeHtml(seed.schemaVersion)} · Migration ID ${escapeHtml(seed.migrationId)}</div></div>
      <div class="code-block" style="margin-top:14px">พนักงาน: ${seed.employees?.length || 0}\nService Incentive: ${seed.serviceIncentives?.length || 0}\nช่วงข้อมูล: ${escapeHtml(first?.yearMonth || "-")} ถึง ${escapeHtml(last?.yearMonth || "-")}\nข้อยืนยัน Migration: ${seed.decisions?.length || 0} รายการ</div>
      <div class="form-actions"><button id="closeSeedPreview" class="button button-primary" type="button">ปิด</button></div>
    </section></div>`;
  ensureIcons();
  const close = () => { els.modalRoot.innerHTML = ""; };
  document.getElementById("closeModalButton").addEventListener("click", close);
  document.getElementById("closeSeedPreview").addEventListener("click", close);
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
    if (state.currentView === "workday") refreshWorkdayData({ force: true });
    else if (state.currentView === "monthly") refreshMonthlyData({ force: true });
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
