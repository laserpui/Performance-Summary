"use strict";

(function attachEmployeeHubDatabase(global) {
  const CONFIG = global.EMPLOYEE_HUB_FIREBASE_CONFIG || {};
  const SDK_VERSION = "12.16.0";
  const SDK_BASE = `https://www.gstatic.com/firebasejs/${SDK_VERSION}`;
  const MAX_BATCH_OPERATIONS = 400;

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
    const wrapped = new Error(messages[code] || error?.message || fallback);
    wrapped.code = code || error?.code;
    wrapped.cause = error;
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
        vacationAfter1Year: null,
        vacationAfter3Years: null,
        vacationAfter5Years: null,
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
      vacationAfter1Year: Number.isFinite(Number(row.vacationAfter1Year)) ? Number(row.vacationAfter1Year) : null,
      vacationAfter3Years: Number.isFinite(Number(row.vacationAfter3Years)) ? Number(row.vacationAfter3Years) : null,
      vacationAfter5Years: Number.isFinite(Number(row.vacationAfter5Years)) ? Number(row.vacationAfter5Years) : null,
      vacationReference: row.vacationReference === "yearEnd" ? "yearEnd" : "jan1",
      note: String(row.note || ""),
      updatedAt: toIso(row.updatedAt),
    };
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
      vacationAfter1Year: normalizePolicyNumber(input.vacationAfter1Year, "พักร้อนหลัง 1 ปี"),
      vacationAfter3Years: normalizePolicyNumber(input.vacationAfter3Years, "พักร้อนหลัง 3 ปี"),
      vacationAfter5Years: normalizePolicyNumber(input.vacationAfter5Years, "พักร้อนหลัง 5 ปี"),
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

  async function commitOperations(operations) {
    for (let index = 0; index < operations.length; index += MAX_BATCH_OPERATIONS) {
      const batch = firestoreApi.writeBatch(db);
      operations.slice(index, index + MAX_BATCH_OPERATIONS).forEach((operation) => {
        if (operation.type === "delete") batch.delete(operation.ref);
        if (operation.type === "set") {
          if (operation.options) batch.set(operation.ref, operation.data, operation.options);
          else batch.set(operation.ref, operation.data);
        }
      });
      await batch.commit();
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

  const api = Object.freeze({
    isConfigured,
    signIn,
    signOut,
    getAuthenticatedUser,
    getProfile,
    loadEmployees,
    loadServiceIncentives,
    loadEvaluationSummary,
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
  });

  global.EmployeeHubDatabase = api;
  global.EmployeeHubDatabaseReady = initializeSdk().then(() => api);
})(window);
