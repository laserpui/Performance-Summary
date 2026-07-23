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
    setSyncStatus("online", "เชื่อมต่อแล้ว");
    renderCurrentView();
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
          <div class="kpi-head"><span>Migration Phase 1</span><span class="kpi-icon"><i data-lucide="database-zap"></i></span></div>
          <div class="kpi-value">${migrationReady ? "พร้อม" : "รอ"}</div><div class="kpi-note">${migrationReady ? `นำเข้า ${formatDate(state.migrationStatus.importedAt)}` : "เปิด Migration Center เพื่อนำเข้าข้อมูล"}</div>
        </article>
      </div>

      <div class="module-grid">
        ${moduleCard({ icon: "users-round", title: "Employee Master", description: "รายชื่อ รหัสพนักงาน วันที่เริ่มงาน และ Legacy IDs", status: state.employees.length ? "เชื่อมต่อแล้ว" : "รอนำเข้า", statusClass: state.employees.length ? "badge-ready" : "badge-progress", view: "employees" })}
        ${moduleCard({ icon: "badge-dollar-sign", title: "Service Incentive", description: "บันทึกยอดขาย ประเมิน เวลา และยอดรวมรายเดือน", status: state.incentives.length ? "ใช้งานได้" : "รอนำเข้า", statusClass: state.incentives.length ? "badge-ready" : "badge-progress", view: "service" })}
        ${moduleCard({ icon: "chart-no-axes-combined", title: "Performance Summary", description: "ฐานข้อมูล Firebase เดิมยังทำงานปกติ เตรียมรวม UI ในระยะถัดไป", status: "เชื่อมฐานข้อมูลแล้ว", statusClass: "badge-ready", view: "performance" })}
        ${moduleCard({ icon: "calendar-clock", title: "Workday Insight", description: "เวลาสาย วันลา และสิทธิ์ลาคงเหลือ", status: "Phase 2", statusClass: "badge-planned", view: "workday" })}
        ${moduleCard({ icon: "clipboard-check", title: "Monthly Performance", description: "คะแนนรายวัน สถานะการทำงาน และการปิดเดือน", status: "Phase 3", statusClass: "badge-planned", view: "monthly" })}
        ${moduleCard({ icon: "database-zap", title: "Migration Center", description: "นำเข้า Employee Master และ Service Incentive แบบตรวจสอบได้", status: migrationReady ? "นำเข้าแล้ว" : "พร้อมนำเข้า", statusClass: migrationReady ? "badge-ready" : "badge-progress", view: "migration" })}
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

function renderWorkday() {
  els.workdayView.innerHTML = `
    <div class="page-grid">
      <article class="panel">
        <div class="panel-head"><div><h2>Workday Insight · Phase 2</h2><p>เวลาสาย วันลา และสิทธิ์ลาคงเหลือ</p></div><span class="badge badge-planned">เตรียม Migration</span></div>
        <div class="notice notice-success"><i data-lucide="badge-check"></i><div><strong>ข้อยืนยันสำหรับข้อมูลกลาง</strong><br>รายการขัดแย้งเรื่องวันลาและวันทำงานได้รับการยืนยันครบแล้ว รวมถึงประเภท “ลาบวช” ที่นับเฉพาะวันทำงาน รายละเอียดเก็บไว้ในไฟล์ Audit ภายในโฟลเดอร์ Migration</div></div>
        <div class="module-grid" style="margin-top:16px">
          <article class="module-card"><span class="module-icon"><i data-lucide="clock-3"></i></span><div><h3>attendanceMonthly</h3><p>หนึ่งพนักงานต่อหนึ่งเดือน ป้องกันรายการซ้ำด้วย Document ID</p></div></article>
          <article class="module-card"><span class="module-icon"><i data-lucide="calendar-off"></i></span><div><h3>leaveRecords</h3><p>รองรับ sick, personal, vacation, ordination และประเภทอื่น</p></div></article>
          <article class="module-card"><span class="module-icon"><i data-lucide="calculator"></i></span><div><h3>Leave Balance</h3><p>คำนวณตามวันทำงานจริงและกฎบริษัทที่ยืนยัน</p></div></article>
        </div>
      </article>
    </div>`;
}

function renderMonthly() {
  els.monthlyView.innerHTML = `
    <div class="page-grid">
      <article class="panel">
        <div class="panel-head"><div><h2>Monthly Performance · Phase 3</h2><p>โมดูลที่ซับซ้อนที่สุด จะย้ายหลัง Workday ทำงานเสถียร</p></div><span class="badge badge-planned">วางโครงสร้างแล้ว</span></div>
        <div class="notice notice-warning"><i data-lucide="triangle-alert"></i><div>มีคะแนนประวัติพิเศษค่า <strong>3.5</strong> จำนวน 1 รายการที่ได้รับการยืนยันแล้ว ระบบ Migration จะเก็บค่าเดิมและติดธง <code>legacyException=true</code> โดยไม่ปรับลดค่า</div></div>
        <div class="progress-list" style="margin-top:16px">
          <div class="progress-row"><span>Employee Mapping</span><div class="progress-track"><div class="progress-bar" style="width:100%"></div></div><strong>12/12</strong></div>
          <div class="progress-row"><span>Data Audit</span><div class="progress-track"><div class="progress-bar" style="width:100%"></div></div><strong>ยืนยันแล้ว</strong></div>
          <div class="progress-row"><span>Firestore Migration</span><div class="progress-track"><div class="progress-bar" style="width:20%"></div></div><strong>Phase 3</strong></div>
        </div>
      </article>
    </div>`;
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
          <li>เริ่ม Workday Insight หลังยืนยันยอดและรายชื่อครบ</li>
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
  els.refreshButton.addEventListener("click", () => refreshData());
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
