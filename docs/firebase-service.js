"use strict";

(function attachEmployeeHubDatabase(global) {
  const CONFIG = global.EMPLOYEE_HUB_FIREBASE_CONFIG || {};
  const SDK_VERSION = "12.16.0";
  const SDK_BASE = `https://www.gstatic.com/firebasejs/${SDK_VERSION}`;
  const MAX_BATCH_OPERATIONS = 400;
  // Monthly Phase 3 uses smaller batches because each write validates the admin profile,
  // employee document and month-status document in Firestore Security Rules.
  // Keeping each batch small avoids the multi-document rules access-call limit.
  const MONTHLY_IMPORT_BATCH_OPERATIONS = 1;

  let app = null;
  let auth = null;
  let db = null;
  let authApi = null;
  let firestoreApi = null;
  let readyError = null;

  function isConfigured() {
    return ["apiKey", "authDomain", "projectId", "appId"].every((key) => {
      const value = String(CONFIG[key] || "");
      return value && !value.includes("REPLACE_ME") && !value.includes("YOUR_PROJECT_ID");
    });
  }

  function friendlyError(error, fallback = "Firebase request failed") {
    const code = String(error?.code || "");
    const messages = {
      "auth/invalid-credential": "อีเมลหรือรหัสผ่านไม่ถูกต้อง",
      "auth/invalid-email": "รูปแบบอีเมลไม่ถูกต้อง",
      "auth/user-disabled": "บัญชีนี้ถูกระงับการใช้งาน",
      "auth/too-many-requests": "มีการเข้าสู่ระบบผิดหลายครั้ง กรุณาลองใหม่ภายหลัง",
      "auth/network-request-failed": "ไม่สามารถเชื่อมต่อ Firebase Authentication ได้",
      "permission-denied": "ไม่มีสิทธิ์ดำเนินการกับข้อมูลนี้ กรุณาตรวจ Firestore Rules และโปรไฟล์ admin",
      "unavailable": "Firestore ไม่พร้อมใช้งานชั่วคราว กรุณาลองใหม่",
      "failed-precondition": "Firestore ยังตั้งค่าไม่ครบ หรือ Query ต้องใช้ Index เพิ่มเติม",
      "already-exists": "มีข้อมูลนี้อยู่แล้ว",
      "not-found": "ไม่พบข้อมูลที่ต้องการ",
    };
    const baseMessage = messages[code] || error?.message || fallback;
    const failedPath = String(error?.failedOperationPath || "");
    const wrapped = new Error(failedPath ? `${baseMessage} [${failedPath}]` : baseMessage);
    wrapped.code = code || error?.code;
    wrapped.cause = error;
    wrapped.failedOperationPath = failedPath;
    return wrapped;
  }

  function assertReady() {
    if (!isConfigured()) throw new Error("ยังไม่ได้ตั้งค่า Firebase Web App ใน docs/firebase-config.js");
    if (readyError) throw readyError;
    if (!app || !auth || !db || !authApi || !firestoreApi) throw new Error("Firebase SDK ยังโหลดไม่สำเร็จ");
  }

  async function initializeSdk() {
    if (!isConfigured()) return;
    try {
      const [appModule, authModule, firestoreModule] = await Promise.all([
        import(`${SDK_BASE}/firebase-app.js`),
        import(`${SDK_BASE}/firebase-auth.js`),
        import(`${SDK_BASE}/firebase-firestore.js`),
      ]);

      app = appModule.initializeApp({
        apiKey: CONFIG.apiKey,
        authDomain: CONFIG.authDomain,
        projectId: CONFIG.projectId,
        storageBucket: CONFIG.storageBucket,
        messagingSenderId: CONFIG.messagingSenderId,
        appId: CONFIG.appId,
      });

      const appCheckSiteKey = String(CONFIG.appCheckSiteKey || "").trim();
      if (appCheckSiteKey && !appCheckSiteKey.includes("REPLACE_ME")) {
        const appCheckModule = await import(`${SDK_BASE}/firebase-app-check.js`);
        appCheckModule.initializeAppCheck(app, {
          provider: new appCheckModule.ReCaptchaEnterpriseProvider(appCheckSiteKey),
          isTokenAutoRefreshEnabled: true,
        });
      }

      authApi = authModule;
      firestoreApi = firestoreModule;
      auth = authModule.getAuth(app);
      try {
        await authModule.setPersistence(auth, authModule.browserLocalPersistence);
      } catch (error) {
        console.warn("ไม่สามารถเก็บสถานะ Login แบบถาวรได้", error);
        await authModule.setPersistence(auth, authModule.inMemoryPersistence);
      }

      db = firestoreModule.initializeFirestore(app, {
        localCache: firestoreModule.memoryLocalCache(),
      });

      if (CONFIG.useEmulator) {
        firestoreModule.connectFirestoreEmulator(
          db,
          CONFIG.emulatorHost || "127.0.0.1",
          Number(CONFIG.firestoreEmulatorPort) || 8080
        );
        authModule.connectAuthEmulator(
          auth,
          `http://${CONFIG.emulatorHost || "127.0.0.1"}:${Number(CONFIG.authEmulatorPort) || 9099}`,
          { disableWarnings: true }
        );
      }
    } catch (error) {
      readyError = friendlyError(error, "โหลด Firebase SDK ไม่สำเร็จ");
      throw readyError;
    }
  }

  function currentUid() {
    const uid = auth?.currentUser?.uid;
    if (!uid) throw new Error("กรุณาเข้าสู่ระบบก่อนดำเนินการ");
    return uid;
  }

  function toIso(value) {
    if (!value) return "";
    if (typeof value.toDate === "function") return value.toDate().toISOString();
    const parsed = new Date(value);
    return Number.isNaN(parsed.getTime()) ? "" : parsed.toISOString();
  }

  function timestampFromIso(value) {
    const parsed = new Date(value || "");
    return Number.isNaN(parsed.getTime()) ? null : firestoreApi.Timestamp.fromDate(parsed);
  }

  function normalizeName(value) {
    return String(value || "").normalize("NFC").trim().replace(/\s+/g, " ").toLocaleLowerCase("th");
  }

  async function hashText(value) {
    const bytes = new TextEncoder().encode(String(value || ""));
    const digest = await crypto.subtle.digest("SHA-256", bytes);
    return [...new Uint8Array(digest)].map((part) => part.toString(16).padStart(2, "0")).join("");
  }

  function makeEmployeeId() {
    return `emp_${crypto.randomUUID().replaceAll("-", "").slice(0, 12)}`;
  }

  function parseYearMonth(value) {
    const text = String(value || "");
    const match = /^(\d{4})-(0[1-9]|1[0-2])$/.exec(text);
    if (!match) throw new Error("เดือนต้องอยู่ในรูปแบบ YYYY-MM");
    return { yearMonth: text, year: Number(match[1]), month: Number(match[2]) };
  }

  function normalizeMoney(value, label) {
    const amount = Number(value);
    if (!Number.isFinite(amount)) throw new Error(`${label} ต้องเป็นตัวเลข`);
    if (Math.abs(amount) > 100000000) throw new Error(`${label} มีค่ามากเกินไป`);
    return Math.round((amount + Number.EPSILON) * 100) / 100;
  }

  function profileFromSnapshot(snapshot) {
    if (!snapshot.exists()) throw new Error("ยังไม่มีโปรไฟล์สิทธิ์ของผู้ใช้นี้ใน Firestore");
    const row = snapshot.data();
    if (!row.isActive) throw new Error("บัญชีนี้ถูกระงับการใช้งาน");
    return {
      id: snapshot.id,
      displayName: String(row.displayName || ""),
      role: String(row.role || "viewer"),
      isActive: Boolean(row.isActive),
    };
  }

  function employeeFromSnapshot(snapshot) {
    const row = snapshot.data();
    return {
      id: snapshot.id,
      employeeCode: String(row.employeeCode || ""),
      fullName: String(row.fullName || row.name || ""),
      name: String(row.name || row.fullName || ""),
      startDate: String(row.startDate || ""),
      isActive: row.isActive !== false,
      sortOrder: Number(row.sortOrder) || 0,
      legacyIds: row.legacyIds && typeof row.legacyIds === "object" ? row.legacyIds : {},
      version: Number(row.version) || 0,
      updatedAt: toIso(row.updatedAt),
    };
  }

  function incentiveFromSnapshot(snapshot) {
    const row = snapshot.data();
    return {
      id: snapshot.id,
      employeeId: String(row.employeeId || ""),
      yearMonth: String(row.yearMonth || ""),
      year: Number(row.year),
      month: Number(row.month),
      salesAmount: Number(row.salesAmount) || 0,
      evaluationAmount: Number(row.evaluationAmount) || 0,
      timeAmount: Number(row.timeAmount) || 0,
      totalAmount: Number(row.totalAmount) || 0,
      version: Number(row.version) || 1,
      source: String(row.source || "Employee Hub"),
      updatedAt: toIso(row.updatedAt),
    };
  }

  function performanceEvaluationId(year, employeeId, month) {
    return `${Number(year)}__${employeeId}__${Number(month)}`;
  }

  function performanceEvaluationFromSnapshot(snapshot) {
    const row = snapshot.data();
    return {
      id: snapshot.id,
      employeeId: String(row.employeeId || ""),
      year: Number(row.year),
      month: Number(row.month),
      scores: Array.isArray(row.scores) ? row.scores.map(Number) : [],
      note: String(row.note || ""),
      source: String(row.source || "Performance Summary / Firebase"),
      sourceSync: row.sourceSync && typeof row.sourceSync === "object" ? row.sourceSync : {},
      scoreSources: row.scoreSources && typeof row.scoreSources === "object" ? row.scoreSources : {},
      syncStatus: String(row.syncStatus || "manual"),
      disciplinePending: row.disciplinePending === true,
      manualOverrides: row.manualOverrides && typeof row.manualOverrides === "object" ? row.manualOverrides : {},
      version: Number(row.version) || 1,
      updatedAt: toIso(row.updatedAt),
    };
  }

  function normalizePerformanceScores(scores) {
    if (!Array.isArray(scores) || scores.length !== 6) throw new Error("ต้องกรอกคะแนนให้ครบ 6 หัวข้อ");
    return scores.map((value) => {
      const score = Number(value);
      if (!Number.isInteger(score) || score < 20 || score > 100 || score % 5 !== 0) {
        throw new Error("คะแนนต้องอยู่ระหว่าง 20–100 และเพิ่มทีละ 5");
      }
      return score;
    });
  }


  function normalizePerformanceMetadata(input = {}, existing = null) {
    const sourceSync = input.sourceSync && typeof input.sourceSync === "object"
      ? input.sourceSync
      : (existing?.sourceSync && typeof existing.sourceSync === "object" ? existing.sourceSync : {});
    const defaultSources = {
      capability: "manual",
      quality: "manual",
      responsibility: "manual",
      effort: "manual",
      punctuality: "manual",
      discipline: "manual",
    };
    const scoreSources = {
      ...defaultSources,
      ...(existing?.scoreSources && typeof existing.scoreSources === "object" ? existing.scoreSources : {}),
      ...(input.scoreSources && typeof input.scoreSources === "object" ? input.scoreSources : {}),
    };
    const manualOverrides = input.manualOverrides && typeof input.manualOverrides === "object"
      ? input.manualOverrides
      : (existing?.manualOverrides && typeof existing.manualOverrides === "object" ? existing.manualOverrides : {});
    const allowedSyncStatus = new Set(["manual", "synced", "source_changed", "manual_override"]);
    const syncStatusValue = String(input.syncStatus || existing?.syncStatus || "manual");
    return {
      sourceSync,
      scoreSources,
      syncStatus: allowedSyncStatus.has(syncStatusValue) ? syncStatusValue : "manual",
      disciplinePending: input.disciplinePending === undefined ? existing?.disciplinePending === true : input.disciplinePending === true,
      manualOverrides,
    };
  }

  function calculateLateScore(value) {
    const minutes = Math.max(0, Math.trunc(Number(value) || 0));
    if (minutes <= 29) return 100;
    if (minutes <= 59) return 90;
    if (minutes <= 89) return 80;
    if (minutes <= 119) return 70;
    return 60;
  }

  function normalizeLateMinutes(value) {
    const minutes = Number(value);
    if (!Number.isFinite(minutes) || minutes < 0 || minutes > 100000) {
      throw new Error("นาทีสายต้องเป็นตัวเลขตั้งแต่ 0–100,000");
    }
    return Math.trunc(minutes);
  }

  function normalizeIsoDate(value, label = "วันที่") {
    const text = String(value || "").trim();
    if (!/^\d{4}-\d{2}-\d{2}$/.test(text)) throw new Error(`${label} ต้องอยู่ในรูปแบบ YYYY-MM-DD`);
    const parsed = new Date(`${text}T00:00:00Z`);
    if (Number.isNaN(parsed.getTime()) || parsed.toISOString().slice(0, 10) !== text) throw new Error(`${label} ไม่ถูกต้อง`);
    return text;
  }

  function normalizeLeaveType(value) {
    const type = String(value || "").trim().toLowerCase();
    if (!["sick", "personal", "vacation", "ordination", "other"].includes(type)) {
      throw new Error("ประเภทวันลาไม่ถูกต้อง");
    }
    return type;
  }

  function normalizeLeaveDays(value) {
    const days = Number(value);
    if (!Number.isFinite(days) || days <= 0 || days > 365) throw new Error("จำนวนวันลาต้องมากกว่า 0 และไม่เกิน 365 วัน");
    const rounded = Math.round(days * 2) / 2;
    if (Math.abs(rounded - days) > 0.0001) throw new Error("จำนวนวันลาต้องเพิ่มทีละ 0.5 วัน");
    return rounded;
  }

  function attendanceFromSnapshot(snapshot) {
    const row = snapshot.data();
    return {
      id: snapshot.id,
      employeeId: String(row.employeeId || ""),
      yearMonth: String(row.yearMonth || ""),
      year: Number(row.year),
      month: Number(row.month),
      lateMinutes: Number(row.lateMinutes) || 0,
      lateScore: Number(row.lateScore) || calculateLateScore(row.lateMinutes),
      version: Number(row.version) || 1,
      source: String(row.source || "Employee Hub"),
      sourceRecordId: String(row.sourceRecordId || ""),
      sourceDate: String(row.sourceDate || ""),
      updatedAt: toIso(row.updatedAt),
    };
  }

  function leaveFromSnapshot(snapshot) {
    const row = snapshot.data();
    return {
      id: snapshot.id,
      employeeId: String(row.employeeId || ""),
      date: String(row.date || ""),
      year: Number(row.year),
      month: Number(row.month),
      leaveType: String(row.leaveType || "other"),
      days: Number(row.days) || 0,
      note: String(row.note || ""),
      excludeHolidays: Boolean(row.excludeHolidays),
      originalLeaveType: String(row.originalLeaveType || ""),
      migrationAdjustment: String(row.migrationAdjustment || ""),
      version: Number(row.version) || 1,
      source: String(row.source || "Employee Hub"),
      sourceRecordId: String(row.sourceRecordId || ""),
      updatedAt: toIso(row.updatedAt),
    };
  }

  function workdaySettingsFromSnapshot(snapshot) {
    if (!snapshot.exists()) {
      return {
        configured: false,
        sickAnnualDays: null,
        personalAnnualDays: null,
        vacationAfter1Year: 6,
        vacationAfter3Years: 8,
        vacationAfter6Years: 10,
        vacationAfter9Years: 12,
        vacationAfter12Years: 14,
        vacationAfter15Years: 15,
        vacationReference: "jan1",
        note: "",
        updatedAt: "",
      };
    }
    const row = snapshot.data();
    return {
      configured: row.configured === true,
      sickAnnualDays: Number.isFinite(Number(row.sickAnnualDays)) ? Number(row.sickAnnualDays) : null,
      personalAnnualDays: Number.isFinite(Number(row.personalAnnualDays)) ? Number(row.personalAnnualDays) : null,
      vacationAfter1Year: Number.isFinite(Number(row.vacationAfter1Year)) ? Number(row.vacationAfter1Year) : 6,
      vacationAfter3Years: Number.isFinite(Number(row.vacationAfter3Years)) ? Number(row.vacationAfter3Years) : 8,
      vacationAfter6Years: Number.isFinite(Number(row.vacationAfter6Years)) ? Number(row.vacationAfter6Years) : 10,
      vacationAfter9Years: Number.isFinite(Number(row.vacationAfter9Years)) ? Number(row.vacationAfter9Years) : 12,
      vacationAfter12Years: Number.isFinite(Number(row.vacationAfter12Years)) ? Number(row.vacationAfter12Years) : 14,
      vacationAfter15Years: Number.isFinite(Number(row.vacationAfter15Years)) ? Number(row.vacationAfter15Years) : 15,
      vacationReference: row.vacationReference === "yearEnd" ? "yearEnd" : "jan1",
      note: String(row.note || ""),
      updatedAt: toIso(row.updatedAt),
    };
  }

  const MONTHLY_STATUS_IDS = Object.freeze(["WORK", "WEEKEND_WORK", "SICK_LEAVE", "PERSONAL_LEAVE", "VACATION", "COMP_OFF", "HOLIDAY"]);
  const MONTHLY_WORK_STATUS_IDS = Object.freeze(["WORK", "WEEKEND_WORK"]);
  const MONTHLY_CRITERION_IDS = Object.freeze(["C1", "C2", "C3", "C4", "C5"]);

  function monthlyEntryFromSnapshot(snapshot) {
    const row = snapshot.data();
    const scores = row.scores && typeof row.scores === "object" ? row.scores : {};
    return {
      id: snapshot.id,
      employeeId: String(row.employeeId || ""),
      yearMonth: String(row.yearMonth || ""),
      year: Number(row.year),
      month: Number(row.month),
      date: String(row.date || ""),
      status: String(row.status || "WORK"),
      countsAsWork: Boolean(row.countsAsWork),
      note: String(row.note || ""),
      scores: Object.fromEntries(MONTHLY_CRITERION_IDS.filter((key) => scores[key] !== undefined).map((key) => [key, Number(scores[key])])),
      legacyException: Boolean(row.legacyException),
      source: String(row.source || "Employee Hub / Firebase"),
      sourceRecordId: String(row.sourceRecordId || ""),
      version: Number(row.version) || 1,
      updatedAt: toIso(row.updatedAt),
    };
  }

  function monthlyOverrideFromSnapshot(snapshot) {
    const row = snapshot.data();
    return {
      id: snapshot.id,
      employeeId: String(row.employeeId || ""),
      yearMonth: String(row.yearMonth || ""),
      year: Number(row.year),
      month: Number(row.month),
      actualWorkDaysOverride: Number(row.actualWorkDaysOverride),
      source: String(row.source || "Employee Hub / Firebase"),
      version: Number(row.version) || 1,
      updatedAt: toIso(row.updatedAt),
    };
  }

  function monthlyStatusFromSnapshot(snapshot, yearMonth = "") {
    if (!snapshot.exists()) {
      return { id: yearMonth, yearMonth, status: "OPEN", reason: "", validation: null, version: 0, updatedAt: "", closedAt: "" };
    }
    const row = snapshot.data();
    return {
      id: snapshot.id,
      yearMonth: String(row.yearMonth || snapshot.id),
      status: String(row.status || "OPEN"),
      reason: String(row.reason || ""),
      validation: row.validation || null,
      version: Number(row.version) || 1,
      updatedAt: toIso(row.updatedAt),
      closedAt: toIso(row.closedAt),
    };
  }

  function normalizeMonthlyStatus(value) {
    const status = String(value || "").trim().toUpperCase();
    if (!MONTHLY_STATUS_IDS.includes(status)) throw new Error("สถานะประจำวันไม่ถูกต้อง");
    return status;
  }

  function normalizeMonthlyScores(input, status, legacyException = false) {
    const source = input && typeof input === "object" ? input : {};
    const scores = {};
    MONTHLY_CRITERION_IDS.forEach((criterionId) => {
      if (source[criterionId] === "" || source[criterionId] === null || source[criterionId] === undefined) return;
      const score = Number(source[criterionId]);
      const validCurrent = Number.isFinite(score)
        && score >= -0.5
        && score <= 3
        && Math.abs((score + 0.5) * 4 - Math.round((score + 0.5) * 4)) < 0.0001;
      const validLegacy = legacyException === true && score === 3.5;
      if (!validCurrent && !validLegacy) throw new Error(`${criterionId} ต้องอยู่ระหว่าง -0.50 ถึง 3.00 และเพิ่มครั้งละ 0.25`);
      scores[criterionId] = Math.round(score * 100) / 100;
    });
    if (MONTHLY_WORK_STATUS_IDS.includes(status) && Object.keys(scores).length !== MONTHLY_CRITERION_IDS.length) {
      throw new Error("สถานะทำงานต้องกรอกคะแนนครบ 5 หัวข้อ");
    }
    return scores;
  }

  function normalizeWorkDaysOverride(value) {
    const days = Number(value);
    if (!Number.isFinite(days) || days < 0 || days > 31 || Math.trunc(days) !== days) {
      throw new Error("วันทำงานจริงต้องเป็นจำนวนเต็ม 0–31 วัน");
    }
    return days;
  }

  function monthlyStatusCountsAsWork(status) {
    return MONTHLY_WORK_STATUS_IDS.includes(status);
  }

  function monthlyEntryDocumentId(employeeId, date) {
    return `${employeeId}__${date}`;
  }

  async function ensureMonthlyMonthEditable(transaction, yearMonth) {
    const statusRef = firestoreApi.doc(db, "monthlyPerformanceStatus", yearMonth);
    const statusSnapshot = await transaction.get(statusRef);
    if (statusSnapshot.exists() && String(statusSnapshot.data().status || "OPEN") === "CLOSED") {
      throw new Error("เดือนนี้ถูกปิดแล้ว กรุณาเปิดเดือนกลับมาแก้ไขก่อน");
    }
    return statusSnapshot;
  }

  async function loadDailyPerformanceEntries(yearMonth = "") {
    assertReady();
    try {
      const collectionRef = firestoreApi.collection(db, "dailyPerformanceEntries");
      const source = yearMonth
        ? firestoreApi.query(collectionRef, firestoreApi.where("yearMonth", "==", parseYearMonth(yearMonth).yearMonth))
        : collectionRef;
      const snapshots = await firestoreApi.getDocs(source);
      return snapshots.docs.map(monthlyEntryFromSnapshot).sort((a, b) => b.date.localeCompare(a.date) || a.employeeId.localeCompare(b.employeeId));
    } catch (error) {
      throw friendlyError(error, "อ่านข้อมูล Monthly Performance ไม่สำเร็จ");
    }
  }

  async function loadMonthlyPerformanceOverrides(yearMonth = "") {
    assertReady();
    try {
      const collectionRef = firestoreApi.collection(db, "monthlyPerformanceOverrides");
      const source = yearMonth
        ? firestoreApi.query(collectionRef, firestoreApi.where("yearMonth", "==", parseYearMonth(yearMonth).yearMonth))
        : collectionRef;
      const snapshots = await firestoreApi.getDocs(source);
      return snapshots.docs.map(monthlyOverrideFromSnapshot).sort((a, b) => a.employeeId.localeCompare(b.employeeId));
    } catch (error) {
      throw friendlyError(error, "อ่านวันทำงานจริงไม่สำเร็จ");
    }
  }

  async function loadMonthlyPerformanceMonthStatus(yearMonth) {
    assertReady();
    const parsed = parseYearMonth(yearMonth);
    try {
      return monthlyStatusFromSnapshot(await firestoreApi.getDoc(firestoreApi.doc(db, "monthlyPerformanceStatus", parsed.yearMonth)), parsed.yearMonth);
    } catch (error) {
      throw friendlyError(error, "อ่านสถานะเดือนไม่สำเร็จ");
    }
  }

  async function loadMonthlyPerformanceSnapshot(yearMonth) {
    assertReady();
    const parsed = parseYearMonth(yearMonth);
    try {
      const [entries, overrides, monthStatus] = await Promise.all([
        loadDailyPerformanceEntries(parsed.yearMonth),
        loadMonthlyPerformanceOverrides(parsed.yearMonth),
        loadMonthlyPerformanceMonthStatus(parsed.yearMonth),
      ]);
      return { entries, overrides, monthStatus };
    } catch (error) {
      throw friendlyError(error, "โหลด Monthly Performance ไม่สำเร็จ");
    }
  }

  async function writeMonthlyAuditLog({ action, targetId, before, after }) {
    const uid = currentUid();
    try {
      const auditRef = firestoreApi.doc(firestoreApi.collection(db, "auditLogs"));
      await firestoreApi.setDoc(auditRef, {
        actorId: uid,
        action,
        targetType: "dailyPerformanceEntry",
        targetId,
        before: before || null,
        after: after || null,
        createdAt: firestoreApi.serverTimestamp(),
      });
    } catch (error) {
      // Audit must not make the business save fail. The write remains protected by admin-only rules.
      console.warn("บันทึก Audit Log ของ Monthly Performance ไม่สำเร็จ", error);
    }
  }

  async function saveDailyPerformanceEntry(input) {
    assertReady();
    const uid = currentUid();
    const employeeId = String(input.employeeId || "");
    const date = normalizeIsoDate(input.date, "วันที่ประเมิน");
    const { yearMonth, year, month } = parseYearMonth(date.slice(0, 7));
    const status = normalizeMonthlyStatus(input.status);
    const legacyException = input.legacyException === true;
    const scores = normalizeMonthlyScores(input.scores, status, legacyException);
    const note = String(input.note || "").trim();
    if (note.length > 1000) throw new Error("หมายเหตุต้องไม่เกิน 1,000 ตัวอักษร");
    if (!monthlyStatusCountsAsWork(status) && Object.keys(scores).length && !note) throw new Error("ทำคะแนนในวันลา/วันหยุดต้องระบุหมายเหตุ");
    const id = String(input.id || monthlyEntryDocumentId(employeeId, date));
    if (id !== monthlyEntryDocumentId(employeeId, date)) throw new Error("ไม่สามารถเปลี่ยนพนักงานหรือวันที่ของรายการเดิมได้");
    const expectedVersion = Math.max(0, Math.trunc(Number(input.expectedVersion) || 0));
    const ref = firestoreApi.doc(db, "dailyPerformanceEntries", id);
    const employeeRef = firestoreApi.doc(db, "employees", employeeId);
    let beforeForAudit = null;
    let afterForAudit = null;

    try {
      await firestoreApi.runTransaction(db, async (transaction) => {
        await ensureMonthlyMonthEditable(transaction, yearMonth);
        const employeeSnapshot = await transaction.get(employeeRef);
        const existingSnapshot = await transaction.get(ref);
        if (!employeeSnapshot.exists()) throw new Error("ไม่พบพนักงานที่เลือก");
        if (employeeSnapshot.data().isActive === false) throw new Error("พนักงานคนนี้ถูกปิดใช้งาน");
        const existing = existingSnapshot.exists() ? existingSnapshot.data() : null;
        const currentVersion = Number(existing?.version) || 0;
        if (currentVersion !== expectedVersion) {
          const conflict = new Error("VERSION_CONFLICT");
          conflict.code = "VERSION_CONFLICT";
          throw conflict;
        }
        const payload = {
          employeeId, yearMonth, year, month, date, status,
          countsAsWork: monthlyStatusCountsAsWork(status),
          note, scores, legacyException,
          source: String(existing?.source || "Employee Hub / Firebase"),
          ...(existing?.sourceRecordId ? { sourceRecordId: existing.sourceRecordId } : {}),
          ...(Array.isArray(existing?.sourceScoreRecordIds) ? { sourceScoreRecordIds: existing.sourceScoreRecordIds } : {}),
          ...(existing?.sourceUpdatedAt ? { sourceUpdatedAt: existing.sourceUpdatedAt } : {}),
          ...(existing?.importedAt ? { importedAt: existing.importedAt } : {}),
          version: currentVersion + 1,
          createdAt: existing?.createdAt || firestoreApi.serverTimestamp(),
          createdBy: existing?.createdBy || uid,
          updatedAt: firestoreApi.serverTimestamp(),
          updatedBy: uid,
        };
        beforeForAudit = existing;
        afterForAudit = { ...payload, createdAt: null, updatedAt: null };
        transaction.set(ref, payload);
      });

      await writeMonthlyAuditLog({
        action: beforeForAudit ? "UPDATE_DAILY_PERFORMANCE" : "CREATE_DAILY_PERFORMANCE",
        targetId: id,
        before: beforeForAudit,
        after: afterForAudit,
      });
      return monthlyEntryFromSnapshot(await firestoreApi.getDoc(ref));
    } catch (error) {
      if (error?.code === "VERSION_CONFLICT" || error?.message === "VERSION_CONFLICT") throw error;
      if (!error.failedOperationPath) error.failedOperationPath = ref.path;
      throw friendlyError(error, "บันทึก Monthly Performance ไม่สำเร็จ");
    }
  }

  async function saveDailyPerformanceEntriesBatch(input) {
    assertReady();
    const employeeIds = [...new Set((Array.isArray(input.employeeIds) ? input.employeeIds : []).map((value) => String(value || "")).filter(Boolean))];
    if (!employeeIds.length || employeeIds.length > 200) throw new Error("จำนวนพนักงานสำหรับบันทึกไม่ถูกต้อง");
    const date = normalizeIsoDate(input.date, "วันที่ประเมิน");
    const status = normalizeMonthlyStatus(input.status);
    const scores = normalizeMonthlyScores(input.scores, status, false);
    const note = String(input.note || "").trim();
    if (!monthlyStatusCountsAsWork(status) && Object.keys(scores).length && !note) throw new Error("ทำคะแนนในวันลา/วันหยุดต้องระบุหมายเหตุ");
    if (note.length > 1000) throw new Error("หมายเหตุต้องไม่เกิน 1,000 ตัวอักษร");

    try {
      const existingSnapshots = await firestoreApi.getDocs(
        firestoreApi.query(firestoreApi.collection(db, "dailyPerformanceEntries"), firestoreApi.where("date", "==", date))
      );
      const existing = new Map(existingSnapshots.docs.map((snapshot) => [snapshot.id, snapshot.data()]));
      let completed = 0;
      for (const employeeId of employeeIds) {
        const id = monthlyEntryDocumentId(employeeId, date);
        const before = existing.get(id) || null;
        await saveDailyPerformanceEntry({
          id,
          employeeId,
          date,
          status,
          note,
          scores,
          expectedVersion: Number(before?.version) || 0,
          legacyException: before?.legacyException === true,
        });
        completed += 1;
      }
      return { count: completed, date };
    } catch (error) {
      throw friendlyError(error, "บันทึกคะแนนพนักงานทุกคนไม่สำเร็จ");
    }
  }

  async function deleteDailyPerformanceEntry(documentId) {
    assertReady();
    const uid = currentUid();
    const ref = firestoreApi.doc(db, "dailyPerformanceEntries", String(documentId || ""));
    const auditRef = firestoreApi.doc(firestoreApi.collection(db, "auditLogs"));
    try {
      await firestoreApi.runTransaction(db, async (transaction) => {
        const snapshot = await transaction.get(ref);
        if (!snapshot.exists()) throw new Error("ไม่พบข้อมูลรายวันที่ต้องการลบ");
        await ensureMonthlyMonthEditable(transaction, String(snapshot.data().yearMonth || ""));
        transaction.delete(ref);
        transaction.set(auditRef, { actorId: uid, action: "DELETE_DAILY_PERFORMANCE", targetType: "dailyPerformanceEntry", targetId: snapshot.id, before: snapshot.data(), after: null, createdAt: firestoreApi.serverTimestamp() });
      });
    } catch (error) {
      throw friendlyError(error, "ลบ Monthly Performance ไม่สำเร็จ");
    }
  }

  async function saveMonthlyPerformanceOverride(input) {
    assertReady();
    const uid = currentUid();
    const employeeId = String(input.employeeId || "");
    const { yearMonth, year, month } = parseYearMonth(input.yearMonth);
    const actualWorkDaysOverride = normalizeWorkDaysOverride(input.actualWorkDaysOverride);
    const id = `${employeeId}__${yearMonth}`;
    const expectedVersion = Math.max(0, Math.trunc(Number(input.expectedVersion) || 0));
    const ref = firestoreApi.doc(db, "monthlyPerformanceOverrides", id);
    const employeeRef = firestoreApi.doc(db, "employees", employeeId);
    const auditRef = firestoreApi.doc(firestoreApi.collection(db, "auditLogs"));
    try {
      await firestoreApi.runTransaction(db, async (transaction) => {
        await ensureMonthlyMonthEditable(transaction, yearMonth);
        const [employeeSnapshot, existingSnapshot] = await Promise.all([transaction.get(employeeRef), transaction.get(ref)]);
        if (!employeeSnapshot.exists()) throw new Error("ไม่พบพนักงานที่เลือก");
        const existing = existingSnapshot.exists() ? existingSnapshot.data() : null;
        const currentVersion = Number(existing?.version) || 0;
        if (currentVersion !== expectedVersion) { const conflict = new Error("VERSION_CONFLICT"); conflict.code = "VERSION_CONFLICT"; throw conflict; }
        const payload = {
          employeeId, yearMonth, year, month, actualWorkDaysOverride,
          source: String(existing?.source || "Employee Hub / Firebase"),
          ...(existing?.sourceUpdatedAt ? { sourceUpdatedAt: existing.sourceUpdatedAt } : {}),
          ...(existing?.sourceUpdatedBy ? { sourceUpdatedBy: existing.sourceUpdatedBy } : {}),
          ...(existing?.importedAt ? { importedAt: existing.importedAt } : {}),
          version: currentVersion + 1,
          createdAt: existing?.createdAt || firestoreApi.serverTimestamp(),
          createdBy: existing?.createdBy || uid,
          updatedAt: firestoreApi.serverTimestamp(),
          updatedBy: uid,
        };
        transaction.set(ref, payload);
        transaction.set(auditRef, { actorId: uid, action: existing ? "UPDATE_MONTHLY_OVERRIDE" : "CREATE_MONTHLY_OVERRIDE", targetType: "monthlyPerformanceOverride", targetId: id, before: existing || null, after: { ...payload, createdAt: null, updatedAt: null }, createdAt: firestoreApi.serverTimestamp() });
      });
      return monthlyOverrideFromSnapshot(await firestoreApi.getDoc(ref));
    } catch (error) {
      if (error?.code === "VERSION_CONFLICT" || error?.message === "VERSION_CONFLICT") throw error;
      throw friendlyError(error, "บันทึกวันทำงานจริงไม่สำเร็จ");
    }
  }

  async function deleteMonthlyPerformanceOverride(documentId) {
    assertReady();
    const uid = currentUid();
    const ref = firestoreApi.doc(db, "monthlyPerformanceOverrides", String(documentId || ""));
    const auditRef = firestoreApi.doc(firestoreApi.collection(db, "auditLogs"));
    try {
      await firestoreApi.runTransaction(db, async (transaction) => {
        const snapshot = await transaction.get(ref);
        if (!snapshot.exists()) throw new Error("ไม่พบ Override ที่ต้องการลบ");
        await ensureMonthlyMonthEditable(transaction, String(snapshot.data().yearMonth || ""));
        transaction.delete(ref);
        transaction.set(auditRef, { actorId: uid, action: "DELETE_MONTHLY_OVERRIDE", targetType: "monthlyPerformanceOverride", targetId: snapshot.id, before: snapshot.data(), after: null, createdAt: firestoreApi.serverTimestamp() });
      });
    } catch (error) {
      throw friendlyError(error, "ล้างวันทำงานจริงไม่สำเร็จ");
    }
  }

  async function setMonthlyPerformanceMonthStatus(input) {
    assertReady();
    const uid = currentUid();
    const { yearMonth, year, month } = parseYearMonth(input.yearMonth);
    const status = String(input.status || "").toUpperCase();
    if (!["OPEN", "REVIEW", "CLOSED"].includes(status)) throw new Error("สถานะเดือนไม่ถูกต้อง");
    const reason = String(input.reason || "").trim().slice(0, 1000);
    if (status === "OPEN" && !reason) throw new Error("ต้องระบุเหตุผลในการเปิดเดือนกลับมาแก้ไข");
    const validation = input.validation && typeof input.validation === "object" ? input.validation : null;
    if (status === "CLOSED" && (!validation || validation.passed !== true || Number(validation.counts?.error) !== 0)) {
      throw new Error("เดือนยังมีข้อผิดพลาด ไม่สามารถปิดเดือนได้");
    }
    const ref = firestoreApi.doc(db, "monthlyPerformanceStatus", yearMonth);
    const auditRef = firestoreApi.doc(firestoreApi.collection(db, "auditLogs"));
    try {
      await firestoreApi.runTransaction(db, async (transaction) => {
        const snapshot = await transaction.get(ref);
        const existing = snapshot.exists() ? snapshot.data() : null;
        const payload = {
          yearMonth, year, month, status, reason,
          validation: validation ? {
            passed: validation.passed === true,
            counts: {
              error: Math.max(0, Math.trunc(Number(validation.counts?.error) || 0)),
              warning: Math.max(0, Math.trunc(Number(validation.counts?.warning) || 0)),
              info: Math.max(0, Math.trunc(Number(validation.counts?.info) || 0)),
            },
            checkedAt: String(validation.checkedAt || new Date().toISOString()),
          } : null,
          version: (Number(existing?.version) || 0) + 1,
          createdAt: existing?.createdAt || firestoreApi.serverTimestamp(),
          createdBy: existing?.createdBy || uid,
          updatedAt: firestoreApi.serverTimestamp(),
          updatedBy: uid,
          ...(status === "CLOSED" ? { closedAt: firestoreApi.serverTimestamp(), closedBy: uid } : {}),
        };
        transaction.set(ref, payload);
        transaction.set(auditRef, { actorId: uid, action: "MONTHLY_PERFORMANCE_STATUS", targetType: "monthlyPerformanceStatus", targetId: yearMonth, before: existing || null, after: { yearMonth, status, reason, validation: payload.validation, version: payload.version }, createdAt: firestoreApi.serverTimestamp() });
      });
      return monthlyStatusFromSnapshot(await firestoreApi.getDoc(ref), yearMonth);
    } catch (error) {
      throw friendlyError(error, "เปลี่ยนสถานะเดือนไม่สำเร็จ");
    }
  }

  async function importMonthlyPerformancePhase3Seed(seed, onProgress = null) {
    assertReady();
    const uid = currentUid();
    if (!seed || Number(seed.schemaVersion) !== 3 || seed.migrationType !== "employee-hub-monthly-performance-phase-3") throw new Error("Monthly Performance Phase 3 Seed ไม่ถูกต้องหรือไม่รองรับ");
    if (!Array.isArray(seed.dailyPerformanceEntries) || !Array.isArray(seed.monthlyPerformanceOverrides)) throw new Error("Monthly Performance Phase 3 Seed มีข้อมูลไม่ครบ");
    try {
      const [employeeSnapshots, existingEntrySnapshots, existingOverrideSnapshots, existingStatusSnapshots] = await Promise.all([
        firestoreApi.getDocs(firestoreApi.collection(db, "employees")),
        firestoreApi.getDocs(firestoreApi.collection(db, "dailyPerformanceEntries")),
        firestoreApi.getDocs(firestoreApi.collection(db, "monthlyPerformanceOverrides")),
        firestoreApi.getDocs(firestoreApi.collection(db, "monthlyPerformanceStatus")),
      ]);
      const employeeIds = new Set(employeeSnapshots.docs.map((snapshot) => snapshot.id));
      const existingEntries = new Map(existingEntrySnapshots.docs.map((snapshot) => [snapshot.id, snapshot.data()]));
      const existingOverrides = new Map(existingOverrideSnapshots.docs.map((snapshot) => [snapshot.id, snapshot.data()]));
      const existingStatuses = new Map(existingStatusSnapshots.docs.map((snapshot) => [snapshot.id, snapshot.data()]));
      const operations = [];
      seed.dailyPerformanceEntries.forEach((record) => {
        const employeeId = String(record.employeeId || "");
        if (!employeeIds.has(employeeId)) throw new Error(`ไม่พบ Employee Master: ${employeeId}`);
        const date = normalizeIsoDate(record.date, "วันที่ประเมิน");
        const { yearMonth, year, month } = parseYearMonth(record.yearMonth || date.slice(0, 7));
        if (yearMonth !== date.slice(0, 7)) throw new Error(`เดือนกับวันที่ไม่ตรงกัน: ${record.id || date}`);
        const status = normalizeMonthlyStatus(record.status);
        const legacyException = record.legacyException === true;
        const scores = normalizeMonthlyScores(record.scores, status, legacyException);
        const note = String(record.note || "").trim().slice(0, 1000);
        if (!monthlyStatusCountsAsWork(status) && Object.keys(scores).length && !note) throw new Error(`รายการ ${record.id || date} มีคะแนนวันหยุดแต่ไม่มีหมายเหตุ`);
        const id = String(record.id || monthlyEntryDocumentId(employeeId, date));
        if (id !== monthlyEntryDocumentId(employeeId, date)) throw new Error(`Document ID ไม่ถูกต้อง: ${id}`);
        const payload = {
          employeeId, yearMonth, year, month, date, status,
          countsAsWork: monthlyStatusCountsAsWork(status), note, scores, legacyException,
          source: String(record.source || "Monthly Performance V.2.xlsx").slice(0, 160),
          sourceRecordId: String(record.sourceRecordId || "").slice(0, 160),
          sourceScoreRecordIds: Array.isArray(record.sourceScoreRecordIds) ? record.sourceScoreRecordIds.map((value) => String(value).slice(0, 160)).slice(0, 5) : [],
          version: (Number(existingEntries.get(id)?.version) || 0) + 1,
          createdAt: existingEntries.get(id)?.createdAt || firestoreApi.serverTimestamp(),
          createdBy: existingEntries.get(id)?.createdBy || uid,
          updatedAt: firestoreApi.serverTimestamp(), updatedBy: uid,
          importedAt: firestoreApi.serverTimestamp(),
        };
        const sourceUpdatedAt = timestampFromIso(record.sourceUpdatedAt);
        if (sourceUpdatedAt) payload.sourceUpdatedAt = sourceUpdatedAt;
        operations.push({ type: "set", ref: firestoreApi.doc(db, "dailyPerformanceEntries", id), data: payload });
      });

      seed.monthlyPerformanceOverrides.forEach((record) => {
        const employeeId = String(record.employeeId || "");
        if (!employeeIds.has(employeeId)) throw new Error(`ไม่พบ Employee Master: ${employeeId}`);
        const { yearMonth, year, month } = parseYearMonth(record.yearMonth);
        const id = String(record.id || `${employeeId}__${yearMonth}`);
        if (id !== `${employeeId}__${yearMonth}`) throw new Error(`Override ID ไม่ถูกต้อง: ${id}`);
        const payload = {
          employeeId, yearMonth, year, month,
          actualWorkDaysOverride: normalizeWorkDaysOverride(record.actualWorkDaysOverride),
          source: String(record.source || "Monthly Performance V.2.xlsx").slice(0, 160),
          sourceUpdatedBy: String(record.sourceUpdatedBy || "").slice(0, 160),
          version: (Number(existingOverrides.get(id)?.version) || 0) + 1,
          createdAt: existingOverrides.get(id)?.createdAt || firestoreApi.serverTimestamp(),
          createdBy: existingOverrides.get(id)?.createdBy || uid,
          updatedAt: firestoreApi.serverTimestamp(), updatedBy: uid,
          importedAt: firestoreApi.serverTimestamp(),
        };
        const sourceUpdatedAt = timestampFromIso(record.sourceUpdatedAt);
        if (sourceUpdatedAt) payload.sourceUpdatedAt = sourceUpdatedAt;
        operations.push({ type: "set", ref: firestoreApi.doc(db, "monthlyPerformanceOverrides", id), data: payload });
      });

      (Array.isArray(seed.monthlyPerformanceStatus) ? seed.monthlyPerformanceStatus : []).forEach((record) => {
        const { yearMonth, year, month } = parseYearMonth(record.yearMonth);
        const status = ["OPEN", "REVIEW", "CLOSED"].includes(String(record.status || "").toUpperCase()) ? String(record.status).toUpperCase() : "OPEN";
        operations.push({ type: "set", ref: firestoreApi.doc(db, "monthlyPerformanceStatus", yearMonth), data: {
          yearMonth, year, month, status, reason: String(record.reason || "").slice(0, 1000), validation: record.validation || null,
          version: (Number(existingStatuses.get(yearMonth)?.version) || 0) + 1,
          createdAt: existingStatuses.get(yearMonth)?.createdAt || firestoreApi.serverTimestamp(),
          createdBy: existingStatuses.get(yearMonth)?.createdBy || uid,
          updatedAt: firestoreApi.serverTimestamp(), updatedBy: uid,
        }});
      });

      operations.push({ type: "set", ref: firestoreApi.doc(db, "hubSettings", "main"), data: {
        schemaVersion: 3,
        monthlyPerformanceMigrationId: String(seed.migrationId || "employee-hub-phase-3-monthly-performance"),
        monthlyPerformanceImportedAt: firestoreApi.serverTimestamp(),
        monthlyPerformanceImportedBy: uid,
        monthlyPerformanceCounts: seed.counts || {},
        monthlyPerformanceSourceSummary: seed.summaries || {},
        updatedAt: firestoreApi.serverTimestamp(), updatedBy: uid,
      }, options: { merge: true } });
      operations.push({ type: "set", ref: firestoreApi.doc(firestoreApi.collection(db, "auditLogs")), data: {
        actorId: uid, action: "IMPORT_EMPLOYEE_HUB_PHASE_3", targetType: "database",
        targetId: String(seed.migrationId || "employee-hub-phase-3-monthly-performance"), before: null,
        after: { counts: seed.counts || {}, legacyExceptions: seed.legacyExceptions?.length || 0 },
        createdAt: firestoreApi.serverTimestamp(),
      }});
      await commitOperations(operations, MONTHLY_IMPORT_BATCH_OPERATIONS, onProgress);
      return {
        entryCount: seed.dailyPerformanceEntries.length,
        overrideCount: seed.monthlyPerformanceOverrides.length,
        statusCount: seed.monthlyPerformanceStatus?.length || 0,
        legacyExceptionCount: seed.legacyExceptions?.length || 0,
      };
    } catch (error) {
      throw friendlyError(error, "นำเข้า Monthly Performance Phase 3 ไม่สำเร็จ");
    }
  }

  async function signIn(email, password) {
    assertReady();
    try {
      return await authApi.signInWithEmailAndPassword(auth, String(email || "").trim(), password);
    } catch (error) {
      throw friendlyError(error, "เข้าสู่ระบบไม่สำเร็จ");
    }
  }

  async function signOut() {
    assertReady();
    try {
      await authApi.signOut(auth);
    } catch (error) {
      throw friendlyError(error, "ออกจากระบบไม่สำเร็จ");
    }
  }

  async function getAuthenticatedUser() {
    assertReady();
    if (typeof auth.authStateReady === "function") {
      await auth.authStateReady();
    } else {
      await new Promise((resolve) => {
        const stop = authApi.onAuthStateChanged(auth, () => {
          stop();
          resolve();
        });
      });
    }
    const user = auth.currentUser;
    if (!user) return null;
    return { id: user.uid, uid: user.uid, email: user.email || "", displayName: user.displayName || "" };
  }

  async function getProfile(userId) {
    assertReady();
    try {
      return profileFromSnapshot(await firestoreApi.getDoc(firestoreApi.doc(db, "profiles", userId)));
    } catch (error) {
      throw friendlyError(error, "อ่านสิทธิ์ผู้ใช้งานไม่สำเร็จ");
    }
  }

  async function loadEmployees() {
    assertReady();
    try {
      const snapshots = await firestoreApi.getDocs(firestoreApi.collection(db, "employees"));
      return snapshots.docs
        .map(employeeFromSnapshot)
        .filter((row) => row.fullName)
        .sort((a, b) => (a.sortOrder - b.sortOrder) || a.fullName.localeCompare(b.fullName, "th"));
    } catch (error) {
      throw friendlyError(error, "อ่านรายชื่อพนักงานไม่สำเร็จ");
    }
  }

  async function loadServiceIncentives(yearMonth = "") {
    assertReady();
    try {
      const collectionRef = firestoreApi.collection(db, "serviceIncentives");
      const source = yearMonth
        ? firestoreApi.query(collectionRef, firestoreApi.where("yearMonth", "==", yearMonth))
        : collectionRef;
      const snapshots = await firestoreApi.getDocs(source);
      return snapshots.docs.map(incentiveFromSnapshot).sort((a, b) => {
        if (a.yearMonth !== b.yearMonth) return b.yearMonth.localeCompare(a.yearMonth);
        return a.employeeId.localeCompare(b.employeeId);
      });
    } catch (error) {
      throw friendlyError(error, "อ่านข้อมูล Service Incentive ไม่สำเร็จ");
    }
  }

  async function loadEvaluationSummary() {
    assertReady();
    try {
      const snapshots = await firestoreApi.getDocs(firestoreApi.collection(db, "evaluations"));
      const years = new Set();
      let latest = "";
      snapshots.docs.forEach((snapshot) => {
        const row = snapshot.data();
        if (Number.isFinite(Number(row.year))) years.add(Number(row.year));
        const updated = toIso(row.updatedAt);
        if (updated > latest) latest = updated;
      });
      return { count: snapshots.size, years: [...years].sort((a, b) => a - b), latestUpdatedAt: latest };
    } catch (error) {
      throw friendlyError(error, "อ่านสรุป Performance Summary ไม่สำเร็จ");
    }
  }


  async function loadPerformanceSettings() {
    assertReady();
    try {
      const snapshot = await firestoreApi.getDoc(firestoreApi.doc(db, "settings", "main"));
      if (!snapshot.exists()) return { activeYear: 2569, years: [2569], updatedAt: "" };
      const row = snapshot.data();
      const years = Array.isArray(row.years) ? row.years.map(Number).filter(Number.isFinite).sort((a, b) => a - b) : [];
      const activeYear = Number(row.activeYear) || years.at(-1) || 2569;
      return { activeYear, years: [...new Set([...years, activeYear])].sort((a, b) => a - b), updatedAt: toIso(row.updatedAt) };
    } catch (error) {
      throw friendlyError(error, "อ่านการตั้งค่า Performance Summary ไม่สำเร็จ");
    }
  }

  async function loadPerformanceEvaluations(year = 0) {
    assertReady();
    try {
      const collectionRef = firestoreApi.collection(db, "evaluations");
      const numericYear = Math.trunc(Number(year) || 0);
      const source = numericYear
        ? firestoreApi.query(collectionRef, firestoreApi.where("year", "==", numericYear))
        : collectionRef;
      const snapshots = await firestoreApi.getDocs(source);
      return snapshots.docs.map(performanceEvaluationFromSnapshot).sort((a, b) => a.month - b.month || a.employeeId.localeCompare(b.employeeId));
    } catch (error) {
      throw friendlyError(error, "อ่านข้อมูล Performance Summary ไม่สำเร็จ");
    }
  }

  async function loadPerformanceSnapshot(year = 0) {
    assertReady();
    try {
      const [settings, evaluations] = await Promise.all([
        loadPerformanceSettings(),
        loadPerformanceEvaluations(year),
      ]);
      const recordYears = evaluations.map((record) => record.year).filter(Number.isFinite);
      const years = [...new Set([...(settings.years || []), ...recordYears, Number(settings.activeYear) || 2569])].sort((a, b) => a - b);
      const activeYear = Number(year) || Number(settings.activeYear) || years.at(-1) || 2569;
      return { settings: { ...settings, activeYear, years }, evaluations };
    } catch (error) {
      throw friendlyError(error, "โหลด Performance Summary ไม่สำเร็จ");
    }
  }

  async function writePerformanceAuditLog({ action, targetId, before, after }) {
    try {
      const uid = currentUid();
      await firestoreApi.addDoc(firestoreApi.collection(db, "auditLogs"), {
        actorId: uid,
        action,
        targetType: "evaluation",
        targetId: String(targetId || ""),
        before: before || null,
        after: after || null,
        createdAt: firestoreApi.serverTimestamp(),
      });
    } catch (error) {
      console.warn("บันทึก Performance Audit Log ไม่สำเร็จ", error);
    }
  }

  async function savePerformanceEvaluation(input) {
    assertReady();
    const uid = currentUid();
    const employeeId = String(input.employeeId || "").trim();
    const year = Math.trunc(Number(input.year));
    const month = Math.trunc(Number(input.month));
    const scores = normalizePerformanceScores(input.scores);
    const note = String(input.note || "").trim();
    const expectedVersion = Math.max(0, Math.trunc(Number(input.expectedVersion) || 0));
    if (!employeeId) throw new Error("กรุณาเลือกพนักงาน");
    if (!Number.isInteger(year) || year < 2500 || year > 3000) throw new Error("ปีประเมินไม่ถูกต้อง");
    if (!Number.isInteger(month) || month < 0 || month > 11) throw new Error("เดือนประเมินไม่ถูกต้อง");
    if (note.length > 2000) throw new Error("หมายเหตุต้องไม่เกิน 2,000 ตัวอักษร");

    const id = performanceEvaluationId(year, employeeId, month);
    const ref = firestoreApi.doc(db, "evaluations", id);
    const employeeRef = firestoreApi.doc(db, "employees", employeeId);
    let before = null;
    try {
      await firestoreApi.runTransaction(db, async (transaction) => {
        const [employeeSnapshot, existingSnapshot] = await Promise.all([
          transaction.get(employeeRef),
          transaction.get(ref),
        ]);
        if (!employeeSnapshot.exists()) throw new Error("ไม่พบพนักงานที่เลือก");
        const existing = existingSnapshot.exists() ? existingSnapshot.data() : null;
        const currentVersion = Number(existing?.version) || 0;
        if (currentVersion !== expectedVersion) {
          const conflict = new Error("ข้อมูลถูกแก้ไขจากอุปกรณ์อื่น กรุณาโหลดข้อมูลใหม่");
          conflict.code = "VERSION_CONFLICT";
          throw conflict;
        }
        before = existing ? { ...existing, createdAt: null, updatedAt: null } : null;
        const metadata = normalizePerformanceMetadata(input, existing);
        transaction.set(ref, {
          employeeId,
          year,
          month,
          scores,
          note,
          source: String(input.source || "Employee Management Hub · Performance Summary").slice(0, 160),
          sourceSync: metadata.sourceSync,
          scoreSources: metadata.scoreSources,
          syncStatus: metadata.syncStatus,
          disciplinePending: metadata.disciplinePending,
          manualOverrides: metadata.manualOverrides,
          version: currentVersion + 1,
          createdAt: existing?.createdAt || firestoreApi.serverTimestamp(),
          createdBy: existing?.createdBy || uid,
          updatedAt: firestoreApi.serverTimestamp(),
          updatedBy: uid,
        });
      });
      const savedSnapshot = await firestoreApi.getDoc(ref);
      const saved = performanceEvaluationFromSnapshot(savedSnapshot);
      await writePerformanceAuditLog({ action: before ? "UPDATE_EVALUATION" : "CREATE_EVALUATION", targetId: id, before, after: { ...saved, updatedAt: null } });
      return saved;
    } catch (error) {
      if (error?.code === "VERSION_CONFLICT") throw error;
      throw friendlyError(error, "บันทึก Performance Summary ไม่สำเร็จ");
    }
  }


  async function loadPerformanceScoreSyncSnapshot(yearMonth) {
    assertReady();
    const parsed = parseYearMonth(yearMonth);
    const thaiYear = parsed.year + 543;
    try {
      const [monthlyEntries, monthlyOverrides, monthStatus, attendance, evaluations] = await Promise.all([
        loadDailyPerformanceEntries(parsed.yearMonth),
        loadMonthlyPerformanceOverrides(parsed.yearMonth),
        loadMonthlyPerformanceMonthStatus(parsed.yearMonth),
        loadAttendanceMonthly(parsed.yearMonth),
        loadPerformanceEvaluations(thaiYear),
      ]);
      return {
        yearMonth: parsed.yearMonth,
        year: parsed.year,
        month: parsed.month,
        thaiYear,
        monthlyEntries,
        monthlyOverrides,
        monthStatus,
        attendance,
        evaluations: evaluations.filter((row) => row.month === parsed.month - 1),
      };
    } catch (error) {
      throw friendlyError(error, "โหลดข้อมูลเชื่อมคะแนนไม่สำเร็จ");
    }
  }

  async function syncPerformanceEvaluationFromSources(input) {
    assertReady();
    const uid = currentUid();
    const employeeId = String(input.employeeId || "").trim();
    const parsed = parseYearMonth(input.yearMonth);
    const year = parsed.year + 543;
    const month = parsed.month - 1;
    const sourceScores = Array.isArray(input.sourceScores) ? input.sourceScores.map(Number) : [];
    if (!employeeId) throw new Error("ไม่พบพนักงานสำหรับ Sync");
    if (sourceScores.length !== 5 || sourceScores.some((score) => !Number.isInteger(score) || score < 20 || score > 100 || score % 5 !== 0)) {
      throw new Error("คะแนนต้นทางหัวข้อ 1–5 ต้องอยู่ระหว่าง 20–100 และเพิ่มทีละ 5");
    }
    const expectedVersion = Math.max(0, Math.trunc(Number(input.expectedVersion) || 0));
    const id = performanceEvaluationId(year, employeeId, month);
    const ref = firestoreApi.doc(db, "evaluations", id);
    const employeeRef = firestoreApi.doc(db, "employees", employeeId);
    let before = null;
    try {
      await firestoreApi.runTransaction(db, async (transaction) => {
        const [employeeSnapshot, existingSnapshot] = await Promise.all([
          transaction.get(employeeRef),
          transaction.get(ref),
        ]);
        if (!employeeSnapshot.exists()) throw new Error("ไม่พบพนักงานที่เลือก");
        const existing = existingSnapshot.exists() ? existingSnapshot.data() : null;
        const currentVersion = Number(existing?.version) || 0;
        if (currentVersion !== expectedVersion) {
          const conflict = new Error("ข้อมูลปลายทางถูกแก้ไข กรุณาตรวจสอบและส่งใหม่");
          conflict.code = "VERSION_CONFLICT";
          throw conflict;
        }
        const disciplineScore = Array.isArray(existing?.scores) && Number.isInteger(Number(existing.scores[5]))
          ? Number(existing.scores[5])
          : 60;
        const disciplinePending = existing ? existing.disciplinePending === true : true;
        const scores = [...sourceScores, disciplineScore];
        before = existing ? { ...existing, createdAt: null, updatedAt: null } : null;
        transaction.set(ref, {
          employeeId,
          year,
          month,
          scores,
          note: String(existing?.note || ""),
          source: "Employee Management Hub · Monthly Score Sync",
          sourceSync: {
            monthlyPerformance: {
              yearMonth: parsed.yearMonth,
              sourceRevision: String(input.monthlyRevision || ""),
              syncedAt: firestoreApi.serverTimestamp(),
            },
            workdayInsight: {
              yearMonth: parsed.yearMonth,
              sourceRevision: String(input.workdayRevision || ""),
              syncedAt: firestoreApi.serverTimestamp(),
            },
          },
          scoreSources: {
            capability: "monthlyPerformance",
            quality: "monthlyPerformance",
            responsibility: "monthlyPerformance",
            effort: "monthlyPerformance",
            punctuality: "workdayInsight",
            discipline: existing?.scoreSources?.discipline || "manual",
          },
          syncStatus: "synced",
          disciplinePending,
          manualOverrides: existing?.manualOverrides && typeof existing.manualOverrides === "object" ? existing.manualOverrides : {},
          version: currentVersion + 1,
          createdAt: existing?.createdAt || firestoreApi.serverTimestamp(),
          createdBy: existing?.createdBy || uid,
          updatedAt: firestoreApi.serverTimestamp(),
          updatedBy: uid,
        });
      });
      const savedSnapshot = await firestoreApi.getDoc(ref);
      const saved = performanceEvaluationFromSnapshot(savedSnapshot);
      await writePerformanceAuditLog({
        action: "SYNC_MONTHLY_TO_PERFORMANCE_SUMMARY",
        targetId: id,
        before,
        after: { ...saved, updatedAt: null },
      });
      return saved;
    } catch (error) {
      if (error?.code === "VERSION_CONFLICT") throw error;
      throw friendlyError(error, "ส่งคะแนนไป Performance Summary ไม่สำเร็จ");
    }
  }

  async function addPerformanceYear(value) {
    assertReady();
    const uid = currentUid();
    const year = Math.trunc(Number(value));
    if (!Number.isInteger(year) || year < 2500 || year > 3000) throw new Error("ปีประเมินไม่ถูกต้อง");
    const ref = firestoreApi.doc(db, "settings", "main");
    try {
      let result = null;
      await firestoreApi.runTransaction(db, async (transaction) => {
        const snapshot = await transaction.get(ref);
        const current = snapshot.exists() ? snapshot.data() : {};
        const years = [...new Set([...(Array.isArray(current.years) ? current.years.map(Number) : []), year])].filter(Number.isFinite).sort((a, b) => a - b);
        result = { activeYear: year, years };
        transaction.set(ref, {
          activeYear: year,
          years,
          updatedAt: firestoreApi.serverTimestamp(),
          updatedBy: uid,
        });
      });
      return result;
    } catch (error) {
      throw friendlyError(error, "เพิ่มปีประเมินไม่สำเร็จ");
    }
  }

  async function loadEmployee360Snapshot(yearMonth, employeeId = "") {
    assertReady();
    const parsed = parseYearMonth(yearMonth);
    const thaiYear = parsed.year + 543;
    try {
      const [incentives, attendance, leaveRecords, monthlyEntries, monthlyOverrides, evaluations] = await Promise.all([
        loadServiceIncentives(parsed.yearMonth),
        loadAttendanceMonthly(parsed.yearMonth),
        loadLeaveRecords(parsed.year),
        loadDailyPerformanceEntries(parsed.yearMonth),
        loadMonthlyPerformanceOverrides(parsed.yearMonth),
        loadPerformanceEvaluations(thaiYear),
      ]);
      const filterEmployee = (row) => !employeeId || row.employeeId === employeeId;
      return {
        yearMonth: parsed.yearMonth,
        year: parsed.year,
        month: parsed.month,
        thaiYear,
        incentives: incentives.filter(filterEmployee),
        attendance: attendance.filter(filterEmployee),
        leaveRecords: leaveRecords.filter((row) => filterEmployee(row) && row.month === parsed.month),
        monthlyEntries: monthlyEntries.filter(filterEmployee),
        monthlyOverrides: monthlyOverrides.filter(filterEmployee),
        evaluations: evaluations.filter((row) => filterEmployee(row) && row.month === parsed.month - 1),
      };
    } catch (error) {
      throw friendlyError(error, "โหลดรายงานรวมพนักงานไม่สำเร็จ");
    }
  }

  async function getMigrationStatus() {
    assertReady();
    try {
      const snapshot = await firestoreApi.getDoc(firestoreApi.doc(db, "hubSettings", "main"));
      if (!snapshot.exists()) return null;
      const row = snapshot.data();
      return {
        schemaVersion: Number(row.schemaVersion) || 0,
        migrationId: String(row.migrationId || ""),
        importedAt: toIso(row.importedAt),
        importedBy: String(row.importedBy || ""),
        counts: row.counts || {},
        moduleStatus: row.moduleStatus || {},
        employeeCodePolicy: String(row.employeeCodePolicy || ""),
        employeeCodeMigrationId: String(row.employeeCodeMigrationId || ""),
        employeeCodeUpdatedAt: toIso(row.employeeCodeUpdatedAt),
        employeeCodeUpdatedBy: String(row.employeeCodeUpdatedBy || ""),
        workdayMigrationId: String(row.workdayMigrationId || ""),
        workdayImportedAt: toIso(row.workdayImportedAt),
        workdayImportedBy: String(row.workdayImportedBy || ""),
        workdayCounts: row.workdayCounts || {},
        workdaySourceSummary: row.workdaySourceSummary || {},
        monthlyPerformanceMigrationId: String(row.monthlyPerformanceMigrationId || ""),
        monthlyPerformanceImportedAt: toIso(row.monthlyPerformanceImportedAt),
        monthlyPerformanceImportedBy: String(row.monthlyPerformanceImportedBy || ""),
        monthlyPerformanceCounts: row.monthlyPerformanceCounts || {},
        monthlyPerformanceSourceSummary: row.monthlyPerformanceSourceSummary || {},
      };
    } catch (error) {
      throw friendlyError(error, "อ่านสถานะ Migration ไม่สำเร็จ");
    }
  }

  async function loadAttendanceMonthly(yearMonth = "") {
    assertReady();
    try {
      const collectionRef = firestoreApi.collection(db, "attendanceMonthly");
      const source = yearMonth
        ? firestoreApi.query(collectionRef, firestoreApi.where("yearMonth", "==", yearMonth))
        : collectionRef;
      const snapshots = await firestoreApi.getDocs(source);
      return snapshots.docs.map(attendanceFromSnapshot).sort((a, b) => {
        if (a.yearMonth !== b.yearMonth) return b.yearMonth.localeCompare(a.yearMonth);
        return a.employeeId.localeCompare(b.employeeId);
      });
    } catch (error) {
      throw friendlyError(error, "อ่านข้อมูลเวลาสายไม่สำเร็จ");
    }
  }

  async function loadLeaveRecords(year = 0) {
    assertReady();
    try {
      const collectionRef = firestoreApi.collection(db, "leaveRecords");
      const numericYear = Math.trunc(Number(year) || 0);
      const source = numericYear
        ? firestoreApi.query(collectionRef, firestoreApi.where("year", "==", numericYear))
        : collectionRef;
      const snapshots = await firestoreApi.getDocs(source);
      return snapshots.docs.map(leaveFromSnapshot).sort((a, b) => b.date.localeCompare(a.date) || a.employeeId.localeCompare(b.employeeId));
    } catch (error) {
      throw friendlyError(error, "อ่านข้อมูลวันลาไม่สำเร็จ");
    }
  }

  async function loadWorkdaySettings() {
    assertReady();
    try {
      return workdaySettingsFromSnapshot(await firestoreApi.getDoc(firestoreApi.doc(db, "workdaySettings", "main")));
    } catch (error) {
      throw friendlyError(error, "อ่านการตั้งค่าสิทธิ์วันลาไม่สำเร็จ");
    }
  }

  async function loadWorkdaySnapshot(yearMonth, year) {
    assertReady();
    try {
      const [attendanceMonthly, leaveRecords, settings] = await Promise.all([
        loadAttendanceMonthly(yearMonth),
        loadLeaveRecords(year),
        loadWorkdaySettings(),
      ]);
      return { attendanceMonthly, leaveRecords, settings };
    } catch (error) {
      throw friendlyError(error, "โหลดข้อมูล Workday Insight ไม่สำเร็จ");
    }
  }

  async function loadHubSnapshot(yearMonth = "") {
    assertReady();
    try {
      const [employees, incentives, evaluationSummary, migrationStatus] = await Promise.all([
        loadEmployees(),
        loadServiceIncentives(yearMonth),
        loadEvaluationSummary(),
        getMigrationStatus(),
      ]);
      return { employees, incentives, evaluationSummary, migrationStatus };
    } catch (error) {
      throw friendlyError(error, "โหลดข้อมูล Employee Hub ไม่สำเร็จ");
    }
  }

  async function saveEmployee(input) {
    assertReady();
    const uid = currentUid();
    const id = String(input.id || makeEmployeeId());
    const fullName = String(input.fullName || "").normalize("NFC").trim().replace(/\s+/g, " ");
    const employeeCode = String(input.employeeCode || "").trim().toUpperCase();
    const startDate = String(input.startDate || "").trim();
    const isActive = input.isActive !== false;
    const sortOrder = Math.max(0, Math.trunc(Number(input.sortOrder) || 0));
    const expectedVersion = Math.max(0, Math.trunc(Number(input.expectedVersion) || 0));

    if (fullName.length < 2 || fullName.length > 100) throw new Error("ชื่อพนักงานต้องยาว 2–100 ตัวอักษร");
    if (employeeCode && !/^[A-Z0-9_-]{2,20}$/.test(employeeCode)) throw new Error("รหัสพนักงานใช้ A–Z, 0–9, _ หรือ - ความยาว 2–20 ตัวอักษร");
    if (startDate && !/^\d{4}-\d{2}-\d{2}$/.test(startDate)) throw new Error("วันที่เริ่มงานต้องอยู่ในรูปแบบ YYYY-MM-DD");

    const employeeRef = firestoreApi.doc(db, "employees", id);
    const auditRef = firestoreApi.doc(firestoreApi.collection(db, "auditLogs"));
    let before = null;
    let oldNameHash = "";
    const newNameHash = await hashText(normalizeName(fullName));
    const newNameRef = firestoreApi.doc(db, "employeeNames", newNameHash);

    try {
      await firestoreApi.runTransaction(db, async (transaction) => {
        const [snapshot, nameSnapshot] = await Promise.all([
          transaction.get(employeeRef),
          transaction.get(newNameRef),
        ]);
        before = snapshot.exists() ? snapshot.data() : null;
        if (nameSnapshot.exists() && nameSnapshot.data().employeeId !== id) {
          throw new Error("มีชื่อพนักงานนี้อยู่แล้ว");
        }
        const currentVersion = Number(before?.version) || 0;
        if (snapshot.exists() && currentVersion !== expectedVersion) {
          const conflict = new Error("VERSION_CONFLICT");
          conflict.code = "VERSION_CONFLICT";
          throw conflict;
        }
        if (before?.name) oldNameHash = await hashText(normalizeName(before.name));
        const nextVersion = currentVersion + 1;
        const data = {
          name: fullName,
          fullName,
          nameNormalized: normalizeName(fullName),
          employeeCode,
          startDate,
          isActive,
          sortOrder,
          legacyIds: before?.legacyIds || input.legacyIds || {},
          source: String(before?.source || input.source || "Employee Hub"),
          version: nextVersion,
          createdAt: before?.createdAt || firestoreApi.serverTimestamp(),
          createdBy: before?.createdBy || uid,
          updatedAt: firestoreApi.serverTimestamp(),
          updatedBy: uid,
        };
        transaction.set(employeeRef, data);
        transaction.set(newNameRef, {
          employeeId: id,
          normalizedName: normalizeName(fullName),
          createdAt: firestoreApi.serverTimestamp(),
        });
        transaction.set(auditRef, {
          actorId: uid,
          action: before ? "UPDATE_EMPLOYEE_MASTER" : "CREATE_EMPLOYEE_MASTER",
          targetType: "employee",
          targetId: id,
          before: before || null,
          after: { ...data, createdAt: null, updatedAt: null },
          createdAt: firestoreApi.serverTimestamp(),
        });
      });

      if (oldNameHash && oldNameHash !== newNameHash) {
        try {
          await firestoreApi.deleteDoc(firestoreApi.doc(db, "employeeNames", oldNameHash));
        } catch (cleanupError) {
          console.warn("ลบ Name Index เดิมไม่สำเร็จ แต่ข้อมูลพนักงานบันทึกแล้ว", cleanupError);
        }
      }

      return employeeFromSnapshot(await firestoreApi.getDoc(employeeRef));
    } catch (error) {
      if (error?.code === "VERSION_CONFLICT" || error?.message === "VERSION_CONFLICT") throw error;
      throw friendlyError(error, "บันทึกข้อมูลพนักงานไม่สำเร็จ");
    }
  }

  async function saveServiceIncentive(input) {
    assertReady();
    const uid = currentUid();
    const employeeId = String(input.employeeId || "");
    const { yearMonth, year, month } = parseYearMonth(input.yearMonth);
    const salesAmount = normalizeMoney(input.salesAmount, "ยอดขายของ");
    const evaluationAmount = normalizeMoney(input.evaluationAmount, "ยอดประเมิน");
    const timeAmount = normalizeMoney(input.timeAmount, "ยอดเวลา");
    const totalAmount = normalizeMoney(salesAmount + evaluationAmount + timeAmount, "ยอดรวม");
    const expectedVersion = Math.max(0, Math.trunc(Number(input.expectedVersion) || 0));
    const documentId = `${employeeId}__${yearMonth}`;
    const ref = firestoreApi.doc(db, "serviceIncentives", documentId);
    const employeeRef = firestoreApi.doc(db, "employees", employeeId);
    const auditRef = firestoreApi.doc(firestoreApi.collection(db, "auditLogs"));

    try {
      await firestoreApi.runTransaction(db, async (transaction) => {
        const [employeeSnapshot, existingSnapshot] = await Promise.all([
          transaction.get(employeeRef),
          transaction.get(ref),
        ]);
        if (!employeeSnapshot.exists()) throw new Error("ไม่พบพนักงานที่เลือก");
        if (employeeSnapshot.data().isActive === false) throw new Error("พนักงานคนนี้ถูกปิดใช้งาน");

        const existing = existingSnapshot.exists() ? existingSnapshot.data() : null;
        const currentVersion = Number(existing?.version) || 0;
        if (currentVersion !== expectedVersion) {
          const conflict = new Error("VERSION_CONFLICT");
          conflict.code = "VERSION_CONFLICT";
          throw conflict;
        }

        const payload = {
          employeeId,
          yearMonth,
          year,
          month,
          salesAmount,
          evaluationAmount,
          timeAmount,
          totalAmount,
          source: String(existing?.source || "Employee Hub / Firebase"),
          ...(existing?.sourceRecordId ? { sourceRecordId: existing.sourceRecordId } : {}),
          ...(existing?.sourceCreatedAt ? { sourceCreatedAt: existing.sourceCreatedAt } : {}),
          ...(existing?.sourceUpdatedAt ? { sourceUpdatedAt: existing.sourceUpdatedAt } : {}),
          ...(existing?.importedAt ? { importedAt: existing.importedAt } : {}),
          version: currentVersion + 1,
          createdAt: existing?.createdAt || firestoreApi.serverTimestamp(),
          createdBy: existing?.createdBy || uid,
          updatedAt: firestoreApi.serverTimestamp(),
          updatedBy: uid,
        };
        transaction.set(ref, payload);
        transaction.set(auditRef, {
          actorId: uid,
          action: existing ? "UPDATE_SERVICE_INCENTIVE" : "CREATE_SERVICE_INCENTIVE",
          targetType: "serviceIncentive",
          targetId: documentId,
          before: existing || null,
          after: { ...payload, createdAt: null, updatedAt: null },
          createdAt: firestoreApi.serverTimestamp(),
        });
      });
      return incentiveFromSnapshot(await firestoreApi.getDoc(ref));
    } catch (error) {
      if (error?.code === "VERSION_CONFLICT" || error?.message === "VERSION_CONFLICT") throw error;
      throw friendlyError(error, "บันทึก Service Incentive ไม่สำเร็จ");
    }
  }

  async function deleteServiceIncentive(documentId) {
    assertReady();
    const uid = currentUid();
    const ref = firestoreApi.doc(db, "serviceIncentives", documentId);
    const auditRef = firestoreApi.doc(firestoreApi.collection(db, "auditLogs"));
    try {
      await firestoreApi.runTransaction(db, async (transaction) => {
        const snapshot = await transaction.get(ref);
        if (!snapshot.exists()) throw new Error("ไม่พบรายการที่ต้องการลบ");
        transaction.delete(ref);
        transaction.set(auditRef, {
          actorId: uid,
          action: "DELETE_SERVICE_INCENTIVE",
          targetType: "serviceIncentive",
          targetId: documentId,
          before: snapshot.data(),
          after: null,
          createdAt: firestoreApi.serverTimestamp(),
        });
      });
    } catch (error) {
      throw friendlyError(error, "ลบ Service Incentive ไม่สำเร็จ");
    }
  }

  async function saveAttendanceMonthly(input) {
    assertReady();
    const uid = currentUid();
    const employeeId = String(input.employeeId || "");
    const { yearMonth, year, month } = parseYearMonth(input.yearMonth);
    const lateMinutes = normalizeLateMinutes(input.lateMinutes);
    const lateScore = calculateLateScore(lateMinutes);
    const expectedVersion = Math.max(0, Math.trunc(Number(input.expectedVersion) || 0));
    const documentId = `${employeeId}__${yearMonth}`;
    const ref = firestoreApi.doc(db, "attendanceMonthly", documentId);
    const employeeRef = firestoreApi.doc(db, "employees", employeeId);
    const auditRef = firestoreApi.doc(firestoreApi.collection(db, "auditLogs"));

    try {
      await firestoreApi.runTransaction(db, async (transaction) => {
        const [employeeSnapshot, existingSnapshot] = await Promise.all([transaction.get(employeeRef), transaction.get(ref)]);
        if (!employeeSnapshot.exists()) throw new Error("ไม่พบพนักงานที่เลือก");
        if (employeeSnapshot.data().isActive === false) throw new Error("พนักงานคนนี้ถูกปิดใช้งาน");
        const existing = existingSnapshot.exists() ? existingSnapshot.data() : null;
        const currentVersion = Number(existing?.version) || 0;
        if (currentVersion !== expectedVersion) {
          const conflict = new Error("VERSION_CONFLICT");
          conflict.code = "VERSION_CONFLICT";
          throw conflict;
        }
        const payload = {
          employeeId, yearMonth, year, month, lateMinutes, lateScore,
          source: String(existing?.source || "Employee Hub / Firebase"),
          ...(existing?.sourceRecordId ? { sourceRecordId: existing.sourceRecordId } : {}),
          ...(existing?.sourceDate ? { sourceDate: existing.sourceDate } : {}),
          ...(existing?.importedAt ? { importedAt: existing.importedAt } : {}),
          version: currentVersion + 1,
          createdAt: existing?.createdAt || firestoreApi.serverTimestamp(),
          createdBy: existing?.createdBy || uid,
          updatedAt: firestoreApi.serverTimestamp(),
          updatedBy: uid,
        };
        transaction.set(ref, payload);
        transaction.set(auditRef, {
          actorId: uid, action: existing ? "UPDATE_ATTENDANCE_MONTHLY" : "CREATE_ATTENDANCE_MONTHLY",
          targetType: "attendanceMonthly", targetId: documentId, before: existing || null,
          after: { ...payload, createdAt: null, updatedAt: null }, createdAt: firestoreApi.serverTimestamp(),
        });
      });
      return attendanceFromSnapshot(await firestoreApi.getDoc(ref));
    } catch (error) {
      if (error?.code === "VERSION_CONFLICT" || error?.message === "VERSION_CONFLICT") throw error;
      throw friendlyError(error, "บันทึกเวลาสายไม่สำเร็จ");
    }
  }

  async function deleteAttendanceMonthly(documentId) {
    assertReady();
    const uid = currentUid();
    const ref = firestoreApi.doc(db, "attendanceMonthly", String(documentId || ""));
    const auditRef = firestoreApi.doc(firestoreApi.collection(db, "auditLogs"));
    try {
      await firestoreApi.runTransaction(db, async (transaction) => {
        const snapshot = await transaction.get(ref);
        if (!snapshot.exists()) throw new Error("ไม่พบข้อมูลเวลาสายที่ต้องการลบ");
        transaction.delete(ref);
        transaction.set(auditRef, { actorId: uid, action: "DELETE_ATTENDANCE_MONTHLY", targetType: "attendanceMonthly", targetId: snapshot.id, before: snapshot.data(), after: null, createdAt: firestoreApi.serverTimestamp() });
      });
    } catch (error) {
      throw friendlyError(error, "ลบข้อมูลเวลาสายไม่สำเร็จ");
    }
  }

  async function saveLeaveRecord(input) {
    assertReady();
    const uid = currentUid();
    const id = String(input.id || `leave_${crypto.randomUUID().replaceAll("-", "")}`);
    const employeeId = String(input.employeeId || "");
    const date = normalizeIsoDate(input.date, "วันที่ลา");
    const year = Number(date.slice(0, 4));
    const month = Number(date.slice(5, 7));
    const leaveType = normalizeLeaveType(input.leaveType);
    const days = normalizeLeaveDays(input.days);
    const note = String(input.note || "").trim();
    const excludeHolidays = input.excludeHolidays === true;
    const expectedVersion = Math.max(0, Math.trunc(Number(input.expectedVersion) || 0));
    if (note.length > 1000) throw new Error("หมายเหตุต้องไม่เกิน 1,000 ตัวอักษร");
    const ref = firestoreApi.doc(db, "leaveRecords", id);
    const employeeRef = firestoreApi.doc(db, "employees", employeeId);
    const auditRef = firestoreApi.doc(firestoreApi.collection(db, "auditLogs"));

    try {
      await firestoreApi.runTransaction(db, async (transaction) => {
        const [employeeSnapshot, existingSnapshot] = await Promise.all([transaction.get(employeeRef), transaction.get(ref)]);
        if (!employeeSnapshot.exists()) throw new Error("ไม่พบพนักงานที่เลือก");
        if (employeeSnapshot.data().isActive === false) throw new Error("พนักงานคนนี้ถูกปิดใช้งาน");
        const existing = existingSnapshot.exists() ? existingSnapshot.data() : null;
        const currentVersion = Number(existing?.version) || 0;
        if (currentVersion !== expectedVersion) {
          const conflict = new Error("VERSION_CONFLICT"); conflict.code = "VERSION_CONFLICT"; throw conflict;
        }
        const payload = {
          employeeId, date, year, month, leaveType, days, note, excludeHolidays,
          source: String(existing?.source || "Employee Hub / Firebase"),
          ...(existing?.sourceRecordId ? { sourceRecordId: existing.sourceRecordId } : {}),
          ...(existing?.originalLeaveType ? { originalLeaveType: existing.originalLeaveType } : {}),
          ...(existing?.migrationAdjustment ? { migrationAdjustment: existing.migrationAdjustment } : {}),
          ...(existing?.importedAt ? { importedAt: existing.importedAt } : {}),
          version: currentVersion + 1,
          createdAt: existing?.createdAt || firestoreApi.serverTimestamp(),
          createdBy: existing?.createdBy || uid,
          updatedAt: firestoreApi.serverTimestamp(),
          updatedBy: uid,
        };
        transaction.set(ref, payload);
        transaction.set(auditRef, { actorId: uid, action: existing ? "UPDATE_LEAVE_RECORD" : "CREATE_LEAVE_RECORD", targetType: "leaveRecord", targetId: id, before: existing || null, after: { ...payload, createdAt: null, updatedAt: null }, createdAt: firestoreApi.serverTimestamp() });
      });
      return leaveFromSnapshot(await firestoreApi.getDoc(ref));
    } catch (error) {
      if (error?.code === "VERSION_CONFLICT" || error?.message === "VERSION_CONFLICT") throw error;
      throw friendlyError(error, "บันทึกวันลาไม่สำเร็จ");
    }
  }

  async function deleteLeaveRecord(documentId) {
    assertReady();
    const uid = currentUid();
    const ref = firestoreApi.doc(db, "leaveRecords", String(documentId || ""));
    const auditRef = firestoreApi.doc(firestoreApi.collection(db, "auditLogs"));
    try {
      await firestoreApi.runTransaction(db, async (transaction) => {
        const snapshot = await transaction.get(ref);
        if (!snapshot.exists()) throw new Error("ไม่พบรายการวันที่ต้องการลบ");
        transaction.delete(ref);
        transaction.set(auditRef, { actorId: uid, action: "DELETE_LEAVE_RECORD", targetType: "leaveRecord", targetId: snapshot.id, before: snapshot.data(), after: null, createdAt: firestoreApi.serverTimestamp() });
      });
    } catch (error) {
      throw friendlyError(error, "ลบวันลาไม่สำเร็จ");
    }
  }

  function normalizePolicyNumber(value, label) {
    const numeric = Number(value);
    if (!Number.isFinite(numeric) || numeric < 0 || numeric > 365) throw new Error(`${label} ต้องอยู่ระหว่าง 0–365 วัน`);
    return Math.round(numeric * 2) / 2;
  }

  async function saveWorkdaySettings(input) {
    assertReady();
    const uid = currentUid();
    const ref = firestoreApi.doc(db, "workdaySettings", "main");
    const payload = {
      configured: true,
      sickAnnualDays: normalizePolicyNumber(input.sickAnnualDays, "สิทธิลาป่วย"),
      personalAnnualDays: normalizePolicyNumber(input.personalAnnualDays, "สิทธิลากิจ"),
      vacationAfter1Year: 6,
      vacationAfter3Years: 8,
      vacationAfter6Years: 10,
      vacationAfter9Years: 12,
      vacationAfter12Years: 14,
      vacationAfter15Years: 15,
      vacationReference: input.vacationReference === "yearEnd" ? "yearEnd" : "jan1",
      note: String(input.note || "").trim().slice(0, 1000),
      updatedAt: firestoreApi.serverTimestamp(),
      updatedBy: uid,
    };
    try {
      await firestoreApi.setDoc(ref, payload);
      await firestoreApi.addDoc(firestoreApi.collection(db, "auditLogs"), { actorId: uid, action: "UPDATE_WORKDAY_SETTINGS", targetType: "workdaySettings", targetId: "main", before: null, after: { ...payload, updatedAt: null }, createdAt: firestoreApi.serverTimestamp() });
      return workdaySettingsFromSnapshot(await firestoreApi.getDoc(ref));
    } catch (error) {
      throw friendlyError(error, "บันทึกการตั้งค่าสิทธิ์วันลาไม่สำเร็จ");
    }
  }

  async function importWorkdayPhase2Seed(seed) {
    assertReady();
    const uid = currentUid();
    if (!seed || Number(seed.schemaVersion) !== 2 || seed.migrationType !== "employee-hub-workday-phase-2") throw new Error("Workday Phase 2 Seed ไม่ถูกต้องหรือไม่รองรับ");
    if (!Array.isArray(seed.attendanceMonthly) || !Array.isArray(seed.leaveRecords)) throw new Error("Workday Phase 2 Seed มีข้อมูลไม่ครบ");

    try {
      const employeeSnapshots = await firestoreApi.getDocs(firestoreApi.collection(db, "employees"));
      const employeeIds = new Set(employeeSnapshots.docs.map((snapshot) => snapshot.id));
      const operations = [];

      seed.attendanceMonthly.forEach((record) => {
        const employeeId = String(record.employeeId || "");
        if (!employeeIds.has(employeeId)) throw new Error(`ไม่พบ Employee Master: ${employeeId}`);
        const { yearMonth, year, month } = parseYearMonth(record.yearMonth);
        const lateMinutes = normalizeLateMinutes(record.lateMinutes);
        const id = String(record.id || `${employeeId}__${yearMonth}`);
        operations.push({ type: "set", ref: firestoreApi.doc(db, "attendanceMonthly", id), data: {
          employeeId, yearMonth, year, month, lateMinutes, lateScore: calculateLateScore(lateMinutes),
          source: String(record.source || "Workday Insight.xlsx").slice(0, 160),
          sourceRecordId: String(record.sourceRecordId || "").slice(0, 160),
          sourceDate: String(record.sourceDate || "").slice(0, 10),
          version: Math.max(1, Math.trunc(Number(record.version) || 1)),
          createdAt: firestoreApi.serverTimestamp(), createdBy: uid, updatedAt: firestoreApi.serverTimestamp(), updatedBy: uid, importedAt: firestoreApi.serverTimestamp(),
        }});
      });

      seed.leaveRecords.forEach((record) => {
        const employeeId = String(record.employeeId || "");
        if (!employeeIds.has(employeeId)) throw new Error(`ไม่พบ Employee Master: ${employeeId}`);
        const date = normalizeIsoDate(record.date, "วันที่ลา");
        const id = String(record.id || `leave_${crypto.randomUUID().replaceAll("-", "")}`);
        const payload = {
          employeeId, date, year: Number(date.slice(0, 4)), month: Number(date.slice(5, 7)),
          leaveType: normalizeLeaveType(record.leaveType), days: normalizeLeaveDays(record.days),
          note: String(record.note || "").slice(0, 1000), excludeHolidays: record.excludeHolidays === true,
          source: String(record.source || "Workday Insight.xlsx").slice(0, 160),
          sourceRecordId: String(record.sourceRecordId || "").slice(0, 160),
          version: Math.max(1, Math.trunc(Number(record.version) || 1)),
          createdAt: firestoreApi.serverTimestamp(), createdBy: uid, updatedAt: firestoreApi.serverTimestamp(), updatedBy: uid, importedAt: firestoreApi.serverTimestamp(),
        };
        if (record.originalLeaveType) payload.originalLeaveType = String(record.originalLeaveType).slice(0, 40);
        if (record.migrationAdjustment) payload.migrationAdjustment = String(record.migrationAdjustment).slice(0, 500);
        operations.push({ type: "set", ref: firestoreApi.doc(db, "leaveRecords", id), data: payload });
      });

      operations.push({ type: "set", ref: firestoreApi.doc(db, "hubSettings", "main"), data: {
        schemaVersion: 2, workdayMigrationId: String(seed.migrationId || "employee-hub-phase-2-workday"),
        workdayImportedAt: firestoreApi.serverTimestamp(), workdayImportedBy: uid,
        workdayCounts: seed.counts || {}, workdaySourceSummary: seed.summaries || {},
        updatedAt: firestoreApi.serverTimestamp(), updatedBy: uid,
      }, options: { merge: true } });
      operations.push({ type: "set", ref: firestoreApi.doc(firestoreApi.collection(db, "auditLogs")), data: {
        actorId: uid, action: "IMPORT_EMPLOYEE_HUB_PHASE_2", targetType: "database",
        targetId: String(seed.migrationId || "employee-hub-phase-2-workday"), before: null,
        after: { counts: seed.counts || {}, excludedSourceRecords: seed.excludedSourceRecords?.length || 0 },
        createdAt: firestoreApi.serverTimestamp(),
      }});

      await commitOperations(operations);
      return { attendanceCount: seed.attendanceMonthly.length, leaveCount: seed.leaveRecords.length, excludedCount: seed.excludedSourceRecords?.length || 0 };
    } catch (error) {
      throw friendlyError(error, "นำเข้า Workday Phase 2 ไม่สำเร็จ");
    }
  }

  async function commitOperations(operations, batchSize = MAX_BATCH_OPERATIONS, onProgress = null) {
    const safeBatchSize = Math.max(1, Math.min(MAX_BATCH_OPERATIONS, Math.trunc(Number(batchSize) || MAX_BATCH_OPERATIONS)));
    const total = operations.length;
    let completed = 0;
    for (let index = 0; index < total; index += safeBatchSize) {
      const currentOperations = operations.slice(index, index + safeBatchSize);
      const batch = firestoreApi.writeBatch(db);
      currentOperations.forEach((operation) => {
        if (operation.type === "delete") batch.delete(operation.ref);
        if (operation.type === "set") {
          if (operation.options) batch.set(operation.ref, operation.data, operation.options);
          else batch.set(operation.ref, operation.data);
        }
      });
      try {
        await batch.commit();
      } catch (error) {
        const failedPath = currentOperations.map((operation) => operation.ref?.path || "unknown").join(", ");
        error.failedOperationPath = failedPath;
        throw error;
      }
      completed += currentOperations.length;
      if (typeof onProgress === "function") {
        onProgress({ completed, total, percent: total ? Math.round((completed / total) * 100) : 100 });
      }
    }
  }


  async function reorderEmployeeCodesByStartDate() {
    assertReady();
    const uid = currentUid();
    const migrationId = "employee-code-by-start-date-2026-07-v1";

    try {
      const snapshots = await firestoreApi.getDocs(firestoreApi.collection(db, "employees"));
      if (snapshots.empty) throw new Error("ไม่พบข้อมูลพนักงานสำหรับจัดลำดับ");

      const employees = snapshots.docs.map((snapshot) => ({ id: snapshot.id, data: snapshot.data() }));
      const invalid = employees.filter(({ data }) => !/^\d{4}-\d{2}-\d{2}$/.test(String(data.startDate || "")));
      if (invalid.length) {
        const names = invalid.map(({ data, id }) => String(data.fullName || data.name || id)).join(", ");
        throw new Error(`พนักงานต่อไปนี้ยังไม่มีวันที่เริ่มงานที่ถูกต้อง: ${names}`);
      }

      employees.sort((a, b) => {
        const dateCompare = String(a.data.startDate).localeCompare(String(b.data.startDate));
        if (dateCompare) return dateCompare;
        const nameA = String(a.data.fullName || a.data.name || "");
        const nameB = String(b.data.fullName || b.data.name || "");
        return nameA.localeCompare(nameB, "th") || a.id.localeCompare(b.id);
      });

      const before = [];
      const after = [];
      const operations = [];

      employees.forEach(({ id, data }, index) => {
        const employeeCode = `EMP${String(index + 1).padStart(3, "0")}`;
        const sortOrder = index + 1;
        const legacyIds = {
          ...(data.legacyIds && typeof data.legacyIds === "object" ? data.legacyIds : {}),
          employeeHubPhase1Code:
            String(data.legacyIds?.employeeHubPhase1Code || data.employeeCode || ""),
        };

        before.push({
          id,
          employeeCode: String(data.employeeCode || ""),
          sortOrder: Number(data.sortOrder) || 0,
          startDate: String(data.startDate || ""),
        });
        after.push({ id, employeeCode, sortOrder, startDate: String(data.startDate || "") });

        operations.push({
          type: "set",
          ref: firestoreApi.doc(db, "employees", id),
          data: {
            employeeCode,
            sortOrder,
            legacyIds,
            version: Math.max(1, Number(data.version) || 1) + 1,
            updatedAt: firestoreApi.serverTimestamp(),
            updatedBy: uid,
          },
          options: { merge: true },
        });
      });

      operations.push({
        type: "set",
        ref: firestoreApi.doc(db, "hubSettings", "main"),
        data: {
          employeeCodePolicy: "startDateAsc",
          employeeCodeMigrationId: migrationId,
          employeeCodeUpdatedAt: firestoreApi.serverTimestamp(),
          employeeCodeUpdatedBy: uid,
          updatedAt: firestoreApi.serverTimestamp(),
          updatedBy: uid,
        },
        options: { merge: true },
      });

      operations.push({
        type: "set",
        ref: firestoreApi.doc(firestoreApi.collection(db, "auditLogs")),
        data: {
          actorId: uid,
          action: "REORDER_EMPLOYEE_CODES",
          targetType: "employeeMaster",
          targetId: migrationId,
          before,
          after,
          createdAt: firestoreApi.serverTimestamp(),
        },
      });

      await commitOperations(operations);
      return { count: after.length, migrationId, plan: after };
    } catch (error) {
      throw friendlyError(error, "ปรับรหัสพนักงานตามวันที่เริ่มงานไม่สำเร็จ");
    }
  }

  async function importMigrationSeed(seed) {
    assertReady();
    const uid = currentUid();
    if (!seed || Number(seed.schemaVersion) !== 1) throw new Error("Migration Seed ไม่ถูกต้องหรือไม่รองรับ");
    if (!Array.isArray(seed.employees) || !Array.isArray(seed.serviceIncentives)) throw new Error("Migration Seed มีข้อมูลไม่ครบ");

    try {
      const [employeeSnapshots, incentiveSnapshots] = await Promise.all([
        firestoreApi.getDocs(firestoreApi.collection(db, "employees")),
        firestoreApi.getDocs(firestoreApi.collection(db, "serviceIncentives")),
      ]);
      const existingEmployees = new Map(employeeSnapshots.docs.map((snapshot) => [snapshot.id, snapshot.data()]));
      const existingIncentives = new Map(incentiveSnapshots.docs.map((snapshot) => [snapshot.id, snapshot.data()]));
      const operations = [];

      for (const person of seed.employees) {
        const id = String(person.id || "");
        const fullName = String(person.fullName || "").normalize("NFC").trim().replace(/\s+/g, " ");
        if (!id || !fullName) throw new Error("พบข้อมูลพนักงานใน Seed ไม่ครบ");
        const existing = existingEmployees.get(id) || null;
        const payload = {
          name: fullName,
          fullName,
          nameNormalized: normalizeName(fullName),
          employeeCode: String(person.employeeCode || "").toUpperCase(),
          startDate: String(person.startDate || ""),
          isActive: person.isActive !== false,
          sortOrder: Math.max(0, Math.trunc(Number(person.sortOrder) || 0)),
          legacyIds: person.legacyIds || {},
          source: "Employee Hub Migration",
          version: Math.max(1, Number(existing?.version) || 1),
          updatedAt: firestoreApi.serverTimestamp(),
          updatedBy: uid,
          migratedAt: firestoreApi.serverTimestamp(),
        };
        if (!existing) {
          payload.createdAt = firestoreApi.serverTimestamp();
          payload.createdBy = uid;
        }
        operations.push({ type: "set", ref: firestoreApi.doc(db, "employees", id), data: payload, options: { merge: true } });
        const nameHash = await hashText(normalizeName(fullName));
        operations.push({
          type: "set",
          ref: firestoreApi.doc(db, "employeeNames", nameHash),
          data: { employeeId: id, normalizedName: normalizeName(fullName), createdAt: firestoreApi.serverTimestamp() },
        });
      }

      seed.serviceIncentives.forEach((record) => {
        const id = String(record.id || `${record.employeeId}__${record.yearMonth}`);
        const existing = existingIncentives.get(id) || null;
        const sourceCreatedAt = timestampFromIso(record.sourceCreatedAt);
        const sourceUpdatedAt = timestampFromIso(record.sourceUpdatedAt);
        const payload = {
          employeeId: String(record.employeeId || ""),
          yearMonth: String(record.yearMonth || ""),
          year: Number(record.year),
          month: Number(record.month),
          salesAmount: normalizeMoney(record.salesAmount, "ยอดขายของ"),
          evaluationAmount: normalizeMoney(record.evaluationAmount, "ยอดประเมิน"),
          timeAmount: normalizeMoney(record.timeAmount, "ยอดเวลา"),
          totalAmount: normalizeMoney(record.totalAmount, "ยอดรวม"),
          source: String(record.source || "Service Incentive.xlsx"),
          sourceRecordId: String(record.sourceRecordId || ""),
          sourceCreatedAt,
          sourceUpdatedAt,
          version: Math.max(1, Number(existing?.version) || Number(record.version) || 1),
          createdAt: existing?.createdAt || sourceCreatedAt || firestoreApi.serverTimestamp(),
          createdBy: existing?.createdBy || uid,
          updatedAt: firestoreApi.serverTimestamp(),
          updatedBy: uid,
          importedAt: firestoreApi.serverTimestamp(),
        };
        operations.push({ type: "set", ref: firestoreApi.doc(db, "serviceIncentives", id), data: payload });
      });

      operations.push({
        type: "set",
        ref: firestoreApi.doc(db, "hubSettings", "main"),
        data: {
          schemaVersion: 1,
          migrationId: String(seed.migrationId || "employee-hub-phase-1"),
          counts: seed.counts || {},
          moduleStatus: seed.moduleStatus || {},
          decisions: Array.isArray(seed.decisions) ? seed.decisions : [],
          importedAt: firestoreApi.serverTimestamp(),
          importedBy: uid,
          updatedAt: firestoreApi.serverTimestamp(),
          updatedBy: uid,
        },
        options: { merge: true },
      });

      operations.push({
        type: "set",
        ref: firestoreApi.doc(firestoreApi.collection(db, "auditLogs")),
        data: {
          actorId: uid,
          action: "IMPORT_EMPLOYEE_HUB_PHASE_1",
          targetType: "database",
          targetId: String(seed.migrationId || "employee-hub-phase-1"),
          before: null,
          after: { counts: seed.counts || {}, moduleStatus: seed.moduleStatus || {} },
          createdAt: firestoreApi.serverTimestamp(),
        },
      });

      await commitOperations(operations);
      return { employeeCount: seed.employees.length, incentiveCount: seed.serviceIncentives.length };
    } catch (error) {
      throw friendlyError(error, "นำเข้าข้อมูล Migration ไม่สำเร็จ");
    }
  }


  const SYSTEM_COLLECTIONS = Object.freeze([
    "profiles",
    "settings",
    "employees",
    "employeeNames",
    "evaluations",
    "serviceIncentives",
    "hubSettings",
    "attendanceMonthly",
    "leaveRecords",
    "workdaySettings",
    "dailyPerformanceEntries",
    "monthlyPerformanceOverrides",
    "monthlyPerformanceStatus",
    "auditLogs",
  ]);

  function serializeBackupValue(value) {
    if (value == null) return value;
    if (typeof value?.toDate === "function") {
      return { __type: "timestamp", value: value.toDate().toISOString() };
    }
    if (Array.isArray(value)) return value.map(serializeBackupValue);
    if (typeof value === "object") {
      if (typeof value.path === "string" && value.firestore) {
        return { __type: "reference", value: value.path };
      }
      return Object.fromEntries(Object.entries(value).map(([key, item]) => [key, serializeBackupValue(item)]));
    }
    return value;
  }

  async function readCollectionForSystem(collectionName) {
    const snapshot = await firestoreApi.getDocs(firestoreApi.collection(db, collectionName));
    return snapshot.docs.map((document) => ({
      __id: document.id,
      ...serializeBackupValue(document.data()),
    }));
  }

  async function loadSystemSnapshot({ includeAuditLogs = false } = {}) {
    assertReady();
    try {
      const names = SYSTEM_COLLECTIONS.filter((name) => includeAuditLogs || name !== "auditLogs");
      const rows = await Promise.all(names.map(async (name) => [name, await readCollectionForSystem(name)]));
      return {
        schemaVersion: "employee-hub-system-snapshot-1",
        projectId: String(CONFIG.projectId || ""),
        generatedAt: new Date().toISOString(),
        generatedBy: {
          uid: currentUid(),
          email: String(auth.currentUser?.email || ""),
        },
        collections: Object.fromEntries(rows),
      };
    } catch (error) {
      throw friendlyError(error, "ตรวจสุขภาพฐานข้อมูลไม่สำเร็จ");
    }
  }

  async function createSystemBackup() {
    try {
      const backup = await loadSystemSnapshot({ includeAuditLogs: true });
      return {
        ...backup,
        schemaVersion: "employee-hub-backup-1",
        backupNotice: "ไฟล์สำรองสำหรับตรวจสอบและกู้คืนโดยผู้ดูแลระบบ โปรดเก็บในพื้นที่ปลอดภัย",
      };
    } catch (error) {
      throw friendlyError(error, "สร้างไฟล์สำรองระบบไม่สำเร็จ");
    }
  }

  const api = Object.freeze({
    isConfigured,
    signIn,
    signOut,
    getAuthenticatedUser,
    getProfile,
    loadEmployees,
    loadServiceIncentives,
    loadEvaluationSummary,
    loadPerformanceSettings,
    loadPerformanceEvaluations,
    loadPerformanceSnapshot,
    savePerformanceEvaluation,
    loadPerformanceScoreSyncSnapshot,
    syncPerformanceEvaluationFromSources,
    addPerformanceYear,
    loadEmployee360Snapshot,
    getMigrationStatus,
    loadHubSnapshot,
    loadAttendanceMonthly,
    loadLeaveRecords,
    loadWorkdaySettings,
    loadWorkdaySnapshot,
    saveEmployee,
    saveServiceIncentive,
    deleteServiceIncentive,
    saveAttendanceMonthly,
    deleteAttendanceMonthly,
    saveLeaveRecord,
    deleteLeaveRecord,
    saveWorkdaySettings,
    reorderEmployeeCodesByStartDate,
    importMigrationSeed,
    importWorkdayPhase2Seed,
    loadDailyPerformanceEntries,
    loadMonthlyPerformanceOverrides,
    loadMonthlyPerformanceMonthStatus,
    loadMonthlyPerformanceSnapshot,
    saveDailyPerformanceEntry,
    saveDailyPerformanceEntriesBatch,
    deleteDailyPerformanceEntry,
    saveMonthlyPerformanceOverride,
    deleteMonthlyPerformanceOverride,
    setMonthlyPerformanceMonthStatus,
    importMonthlyPerformancePhase3Seed,
    loadSystemSnapshot,
    createSystemBackup,
  });

  global.EmployeeHubDatabase = api;
  global.EmployeeHubDatabaseReady = initializeSdk().then(() => api);
})(window);
