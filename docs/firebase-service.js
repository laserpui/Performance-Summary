"use strict";

(function attachFirebaseDatabase(global) {
  const CONFIG = global.KPI_FIREBASE_CONFIG || {};
  const SDK_VERSION = "12.16.0";
  const SDK_BASE = `https://www.gstatic.com/firebasejs/${SDK_VERSION}`;
  const MAX_BATCH_OPERATIONS = 425;

  let app = null;
  let auth = null;
  let db = null;
  let firestoreApi = null;
  let authApi = null;
  let unsubscribeCallbacks = [];
  let readyError = null;

  function isConfigured() {
    const required = ["apiKey", "authDomain", "projectId", "appId"];
    return required.every((key) => {
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
      "permission-denied": "ไม่มีสิทธิ์ดำเนินการกับข้อมูลนี้",
      "unavailable": "Firestore ไม่พร้อมใช้งานชั่วคราว กรุณาลองใหม่",
      "failed-precondition": "Firestore ยังตั้งค่าไม่ครบหรือข้อมูลมีเงื่อนไขไม่ตรงกัน",
      "already-exists": "มีข้อมูลนี้อยู่แล้ว",
      "not-found": "ไม่พบข้อมูลที่ต้องการ",
    };
    const wrapped = new Error(messages[code] || error?.message || fallback);
    wrapped.code = code || error?.code;
    wrapped.cause = error;
    return wrapped;
  }

  function assertConfigured() {
    if (!isConfigured()) {
      throw new Error("ยังไม่ได้ตั้งค่า Firebase Web App ในไฟล์ docs/firebase-config.js");
    }
    if (readyError) throw readyError;
    if (!app || !auth || !db || !firestoreApi || !authApi) {
      throw new Error("Firebase SDK ยังโหลดไม่สำเร็จ");
    }
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
        console.warn("ไม่สามารถเก็บสถานะ Login แบบถาวรได้ จึงใช้เฉพาะหน่วยความจำ", error);
        await authModule.setPersistence(auth, authModule.inMemoryPersistence);
      }

      // ใช้ Memory Cache เป็นค่าเริ่มต้น เพราะข้อมูลประเมินพนักงานเป็นข้อมูลภายใน
      // จึงไม่เก็บฐานข้อมูลลง IndexedDB แบบถาวรบนอุปกรณ์โดยอัตโนมัติ
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

  function toIso(value) {
    if (!value) return "";
    if (typeof value.toDate === "function") return value.toDate().toISOString();
    const parsed = new Date(value);
    return Number.isNaN(parsed.getTime()) ? "" : parsed.toISOString();
  }

  function normalizeName(name) {
    return String(name || "").trim().replace(/\s+/g, " ").toLocaleLowerCase("th");
  }

  async function hashText(value) {
    const bytes = new TextEncoder().encode(value);
    const digest = await crypto.subtle.digest("SHA-256", bytes);
    return [...new Uint8Array(digest)].map((part) => part.toString(16).padStart(2, "0")).join("");
  }

  function currentUid() {
    const uid = auth?.currentUser?.uid;
    if (!uid) throw new Error("กรุณาเข้าสู่ระบบก่อนดำเนินการ");
    return uid;
  }

  function validateScores(scores) {
    if (!Array.isArray(scores) || scores.length !== 6) throw new Error("คะแนนต้องมีครบ 6 หัวข้อ");
    const normalized = scores.map(Number);
    if (!normalized.every((score) => Number.isInteger(score) && score >= 20 && score <= 100 && score % 5 === 0)) {
      throw new Error("คะแนนต้องอยู่ระหว่าง 20–100 และเพิ่มทีละ 5");
    }
    return normalized;
  }

  function evaluationId(year, employeeId, month) {
    return `${Number(year)}__${employeeId}__${Number(month)}`;
  }

  function profileFromSnapshot(snapshot) {
    if (!snapshot.exists()) throw new Error("ยังไม่มีโปรไฟล์สิทธิ์ของผู้ใช้นี้ใน Firestore");
    const row = snapshot.data();
    if (!row.isActive) throw new Error("บัญชีนี้ถูกระงับการใช้งาน");
    return {
      id: snapshot.id,
      display_name: row.displayName || "",
      role: row.role || "viewer",
      is_active: Boolean(row.isActive),
    };
  }

  async function signIn(email, password) {
    assertConfigured();
    try {
      return await authApi.signInWithEmailAndPassword(auth, email, password);
    } catch (error) {
      throw friendlyError(error, "เข้าสู่ระบบไม่สำเร็จ");
    }
  }

  async function signOut() {
    assertConfigured();
    try {
      await authApi.signOut(auth);
    } catch (error) {
      throw friendlyError(error, "ออกจากระบบไม่สำเร็จ");
    }
  }

  async function getAuthenticatedUser() {
    assertConfigured();
    if (typeof auth.authStateReady === "function") {
      await auth.authStateReady();
    } else {
      await new Promise((resolve) => {
        const stop = authApi.onAuthStateChanged(auth, () => { stop(); resolve(); });
      });
    }
    const user = auth.currentUser;
    if (!user) return null;
    return {
      id: user.uid,
      uid: user.uid,
      email: user.email || "",
      displayName: user.displayName || "",
    };
  }

  async function getProfile(userId) {
    assertConfigured();
    try {
      const snapshot = await firestoreApi.getDoc(firestoreApi.doc(db, "profiles", userId));
      return profileFromSnapshot(snapshot);
    } catch (error) {
      throw friendlyError(error, "อ่านสิทธิ์ผู้ใช้งานไม่สำเร็จ");
    }
  }

  async function loadState() {
    assertConfigured();
    try {
      const [settingsSnapshot, employeesSnapshot, evaluationsSnapshot] = await Promise.all([
        firestoreApi.getDoc(firestoreApi.doc(db, "settings", "main")),
        firestoreApi.getDocs(firestoreApi.collection(db, "employees")),
        firestoreApi.getDocs(firestoreApi.collection(db, "evaluations")),
      ]);

      const settings = settingsSnapshot.exists() ? settingsSnapshot.data() : {};
      const employees = employeesSnapshot.docs.map((snapshot) => ({
        id: snapshot.id,
        name: String(snapshot.data().name || ""),
      })).filter((person) => person.name);

      const records = {};
      evaluationsSnapshot.docs.forEach((snapshot) => {
        const row = snapshot.data();
        const year = Number(row.year);
        const month = Number(row.month);
        if (!row.employeeId || !Number.isInteger(year) || !Number.isInteger(month)) return;
        records[`${year}::${row.employeeId}::${month}`] = {
          employeeId: row.employeeId,
          month,
          scores: Array.isArray(row.scores) ? row.scores.map(Number) : [],
          note: String(row.note || ""),
          source: String(row.source || "KPI Flow"),
          updatedAt: toIso(row.updatedAt),
          version: Number(row.version) || 1,
        };
      });

      const recordYears = Object.keys(records).map((key) => Number(key.split("::")[0])).filter(Number.isFinite);
      const configuredYears = Array.isArray(settings.years) ? settings.years.map(Number).filter(Number.isFinite) : [];
      const activeYear = Number(settings.activeYear) || configuredYears.at(-1) || recordYears.at(-1) || 2569;
      const years = [...new Set([...configuredYears, ...recordYears, activeYear])].sort((a, b) => a - b);

      return {
        schemaVersion: 4,
        activeYear,
        years,
        updatedAt: toIso(settings.updatedAt),
        employees,
        records,
      };
    } catch (error) {
      throw friendlyError(error, "อ่านข้อมูลจาก Firestore ไม่สำเร็จ");
    }
  }

  async function saveEvaluation({ employeeId, year, month, scores, note, expectedVersion }) {
    assertConfigured();
    const uid = currentUid();
    const normalizedScores = validateScores(scores);
    const normalizedYear = Number(year);
    const normalizedMonth = Number(month);
    const normalizedNote = String(note || "").trim();
    if (!Number.isInteger(normalizedYear) || normalizedYear < 2500 || normalizedYear > 3000) throw new Error("ปีประเมินไม่ถูกต้อง");
    if (!Number.isInteger(normalizedMonth) || normalizedMonth < 0 || normalizedMonth > 11) throw new Error("เดือนประเมินไม่ถูกต้อง");
    if (normalizedNote.length > 2000) throw new Error("หมายเหตุต้องไม่เกิน 2,000 ตัวอักษร");

    const ref = firestoreApi.doc(db, "evaluations", evaluationId(normalizedYear, employeeId, normalizedMonth));
    const employeeRef = firestoreApi.doc(db, "employees", employeeId);
    const auditRef = firestoreApi.doc(firestoreApi.collection(db, "auditLogs"));

    try {
      await firestoreApi.runTransaction(db, async (transaction) => {
        const [employeeSnapshot, existingSnapshot] = await Promise.all([
          transaction.get(employeeRef),
          transaction.get(ref),
        ]);
        if (!employeeSnapshot.exists()) throw new Error("ไม่พบพนักงานที่เลือก");

        const existing = existingSnapshot.exists() ? existingSnapshot.data() : null;
        const currentVersion = Number(existing?.version) || 0;
        if (currentVersion !== (Number(expectedVersion) || 0)) {
          const conflict = new Error("VERSION_CONFLICT");
          conflict.code = "VERSION_CONFLICT";
          throw conflict;
        }

        const nextVersion = currentVersion + 1;
        const payload = {
          employeeId,
          year: normalizedYear,
          month: normalizedMonth,
          scores: normalizedScores,
          note: normalizedNote,
          source: "KPI Flow / Firebase",
          version: nextVersion,
          createdAt: existing?.createdAt || firestoreApi.serverTimestamp(),
          createdBy: existing?.createdBy || uid,
          updatedAt: firestoreApi.serverTimestamp(),
          updatedBy: uid,
        };
        transaction.set(ref, payload);
        transaction.set(auditRef, {
          actorId: uid,
          action: existing ? "UPDATE_EVALUATION" : "CREATE_EVALUATION",
          targetType: "evaluation",
          targetId: ref.id,
          before: existing || null,
          after: { ...payload, createdAt: null, updatedAt: null },
          createdAt: firestoreApi.serverTimestamp(),
        });
      });

      const savedSnapshot = await firestoreApi.getDoc(ref);
      const saved = savedSnapshot.data();
      return {
        employee_id: saved.employeeId,
        year: Number(saved.year),
        month: Number(saved.month),
        scores: saved.scores.map(Number),
        note: saved.note || "",
        source: saved.source || "KPI Flow / Firebase",
        updated_at: toIso(saved.updatedAt) || new Date().toISOString(),
        version: Number(saved.version) || 1,
      };
    } catch (error) {
      if (error?.code === "VERSION_CONFLICT" || error?.message === "VERSION_CONFLICT") throw error;
      throw friendlyError(error, "บันทึกคะแนนไม่สำเร็จ");
    }
  }

  async function addEmployee({ id, name }) {
    assertConfigured();
    const uid = currentUid();
    const normalizedName = String(name || "").trim().replace(/\s+/g, " ");
    if (normalizedName.length < 2 || normalizedName.length > 80) throw new Error("ชื่อพนักงานต้องยาว 2–80 ตัวอักษร");
    if (!/^[a-zA-Z0-9][a-zA-Z0-9_-]{1,79}$/.test(id)) throw new Error("รหัสพนักงานภายในระบบไม่ถูกต้อง");

    const nameKey = await hashText(normalizeName(normalizedName));
    const employeeRef = firestoreApi.doc(db, "employees", id);
    const nameRef = firestoreApi.doc(db, "employeeNames", nameKey);
    const auditRef = firestoreApi.doc(firestoreApi.collection(db, "auditLogs"));

    try {
      await firestoreApi.runTransaction(db, async (transaction) => {
        const [employeeSnapshot, nameSnapshot] = await Promise.all([
          transaction.get(employeeRef),
          transaction.get(nameRef),
        ]);
        if (employeeSnapshot.exists() || nameSnapshot.exists()) throw new Error("มีชื่อหรือรหัสพนักงานนี้อยู่แล้ว");
        transaction.set(employeeRef, {
          name: normalizedName,
          nameNormalized: normalizeName(normalizedName),
          createdAt: firestoreApi.serverTimestamp(),
          createdBy: uid,
          updatedAt: firestoreApi.serverTimestamp(),
          updatedBy: uid,
        });
        transaction.set(nameRef, {
          employeeId: id,
          normalizedName: normalizeName(normalizedName),
          createdAt: firestoreApi.serverTimestamp(),
        });
        transaction.set(auditRef, {
          actorId: uid,
          action: "CREATE_EMPLOYEE",
          targetType: "employee",
          targetId: id,
          before: null,
          after: { name: normalizedName },
          createdAt: firestoreApi.serverTimestamp(),
        });
      });
      return { id, name: normalizedName };
    } catch (error) {
      throw friendlyError(error, "เพิ่มพนักงานไม่สำเร็จ");
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

  async function deleteEmployee(employeeId) {
    assertConfigured();
    const uid = currentUid();
    try {
      const employeeRef = firestoreApi.doc(db, "employees", employeeId);
      const employeeSnapshot = await firestoreApi.getDoc(employeeRef);
      if (!employeeSnapshot.exists()) throw new Error("ไม่พบพนักงานที่ต้องการลบ");
      const employee = employeeSnapshot.data();
      const nameKey = await hashText(normalizeName(employee.name));
      const evaluationsQuery = firestoreApi.query(
        firestoreApi.collection(db, "evaluations"),
        firestoreApi.where("employeeId", "==", employeeId)
      );
      const evaluationSnapshots = await firestoreApi.getDocs(evaluationsQuery);
      const operations = evaluationSnapshots.docs.map((snapshot) => ({ type: "delete", ref: snapshot.ref }));
      operations.push(
        { type: "delete", ref: firestoreApi.doc(db, "employeeNames", nameKey) },
        { type: "delete", ref: employeeRef },
        {
          type: "set",
          ref: firestoreApi.doc(firestoreApi.collection(db, "auditLogs")),
          data: {
            actorId: uid,
            action: "DELETE_EMPLOYEE",
            targetType: "employee",
            targetId: employeeId,
            before: { name: employee.name, evaluationCount: evaluationSnapshots.size },
            after: null,
            createdAt: firestoreApi.serverTimestamp(),
          },
        }
      );
      await commitOperations(operations);
    } catch (error) {
      throw friendlyError(error, "ลบพนักงานไม่สำเร็จ");
    }
  }

  async function addEvaluationYear(year) {
    assertConfigured();
    const uid = currentUid();
    const normalizedYear = Number(year);
    if (!Number.isInteger(normalizedYear) || normalizedYear < 2500 || normalizedYear > 3000) throw new Error("ปีประเมินไม่ถูกต้อง");
    const settingsRef = firestoreApi.doc(db, "settings", "main");
    const auditRef = firestoreApi.doc(firestoreApi.collection(db, "auditLogs"));
    try {
      let result = null;
      await firestoreApi.runTransaction(db, async (transaction) => {
        const snapshot = await transaction.get(settingsRef);
        const current = snapshot.exists() ? snapshot.data() : {};
        const years = [...new Set([...(Array.isArray(current.years) ? current.years.map(Number) : []), normalizedYear])]
          .filter(Number.isFinite)
          .sort((a, b) => a - b);
        result = { active_year: normalizedYear, years };
        transaction.set(settingsRef, {
          activeYear: normalizedYear,
          years,
          updatedAt: firestoreApi.serverTimestamp(),
          updatedBy: uid,
        });
        transaction.set(auditRef, {
          actorId: uid,
          action: "ADD_YEAR",
          targetType: "settings",
          targetId: "main",
          before: { activeYear: current.activeYear || null, years: current.years || [] },
          after: { activeYear: normalizedYear, years },
          createdAt: firestoreApi.serverTimestamp(),
        });
      });
      return result;
    } catch (error) {
      throw friendlyError(error, "เริ่มปีประเมินใหม่ไม่สำเร็จ");
    }
  }

  function stateToOperations(seedState, uid) {
    const operations = [];
    const employees = Array.isArray(seedState.employees) ? seedState.employees : [];
    employees.forEach((person) => {
      const normalized = normalizeName(person.name);
      operations.push({
        type: "set",
        ref: firestoreApi.doc(db, "employees", person.id),
        data: {
          name: person.name,
          nameNormalized: normalized,
          createdAt: firestoreApi.serverTimestamp(),
          createdBy: uid,
          updatedAt: firestoreApi.serverTimestamp(),
          updatedBy: uid,
        },
        // รักษา employeeCode, fullName, startDate และ legacyIds ของ Employee Hub
        options: { merge: true },
      });
    });

    Object.entries(seedState.records || {}).forEach(([key, record]) => {
      const [year] = key.split("::");
      const normalizedScores = validateScores(record.scores);
      const normalizedYear = Number(year);
      const normalizedMonth = Number(record.month);
      operations.push({
        type: "set",
        ref: firestoreApi.doc(db, "evaluations", evaluationId(normalizedYear, record.employeeId, normalizedMonth)),
        data: {
          employeeId: record.employeeId,
          year: normalizedYear,
          month: normalizedMonth,
          scores: normalizedScores,
          note: String(record.note || "").slice(0, 2000),
          source: String(record.source || "KPI Flow seed").slice(0, 160),
          version: Math.max(1, Number(record.version) || 1),
          createdAt: firestoreApi.serverTimestamp(),
          createdBy: uid,
          updatedAt: firestoreApi.serverTimestamp(),
          updatedBy: uid,
        },
      });
    });

    operations.push({
      type: "set",
      ref: firestoreApi.doc(db, "settings", "main"),
      data: {
        activeYear: Number(seedState.activeYear) || 2569,
        years: [...new Set((seedState.years || [2569]).map(Number).filter(Number.isFinite))].sort((a, b) => a - b),
        updatedAt: firestoreApi.serverTimestamp(),
        updatedBy: uid,
      },
    });
    return operations;
  }

  async function replaceDatabase(nextState, action) {
    assertConfigured();
    const uid = currentUid();
    try {
      const [evaluationSnapshots, nameSnapshots, employeeSnapshots] = await Promise.all([
        firestoreApi.getDocs(firestoreApi.collection(db, "evaluations")),
        firestoreApi.getDocs(firestoreApi.collection(db, "employeeNames")),
        firestoreApi.getDocs(firestoreApi.collection(db, "employees")),
      ]);

      // เขียนข้อมูลชุดใหม่ก่อน แล้วค่อยลบ Document ที่ไม่อยู่ในชุดใหม่
      // หากเครือข่ายขัดข้องระหว่างทาง การลองซ้ำจะปลอดภัยกว่าการลบทั้งหมดก่อนเขียน
      const writeOperations = stateToOperations(nextState, uid);
      const desiredEmployeeIds = new Set();
      const desiredNameIds = new Set();
      const desiredEvaluationIds = new Set();

      for (const person of nextState.employees || []) {
        desiredEmployeeIds.add(person.id);
        const nameKey = await hashText(normalizeName(person.name));
        desiredNameIds.add(nameKey);
        writeOperations.push({
          type: "set",
          ref: firestoreApi.doc(db, "employeeNames", nameKey),
          data: {
            employeeId: person.id,
            normalizedName: normalizeName(person.name),
            createdAt: firestoreApi.serverTimestamp(),
          },
        });
      }

      Object.entries(nextState.records || {}).forEach(([key, record]) => {
        const [year] = key.split("::");
        desiredEvaluationIds.add(evaluationId(Number(year), record.employeeId, Number(record.month)));
      });

      await commitOperations(writeOperations);

      const staleDeletes = [
        ...evaluationSnapshots.docs
          .filter((snapshot) => !desiredEvaluationIds.has(snapshot.id))
          .map((snapshot) => ({ type: "delete", ref: snapshot.ref })),
        // Employee Hub เป็นเจ้าของ Employee Master จึงไม่ลบ employees/employeeNames
        // จากคำสั่ง Reset หรือ Import ของ Performance Summary
      ];
      await commitOperations(staleDeletes);

      await commitOperations([{
        type: "set",
        ref: firestoreApi.doc(firestoreApi.collection(db, "auditLogs")),
        data: {
          actorId: uid,
          action,
          targetType: "database",
          targetId: "kpi-flow",
          before: null,
          after: {
            employeeCount: (nextState.employees || []).length,
            evaluationCount: Object.keys(nextState.records || {}).length,
            years: nextState.years || [],
          },
          createdAt: firestoreApi.serverTimestamp(),
        },
      }]);
    } catch (error) {
      throw friendlyError(error, action === "RESET_DATABASE" ? "รีเซ็ตฐานข้อมูลไม่สำเร็จ" : "นำเข้าข้อมูลไม่สำเร็จ");
    }
  }

  async function resetDatabase(seedState) {
    return replaceDatabase(seedState, "RESET_DATABASE");
  }

  async function importState(importState) {
    return replaceDatabase(importState, "IMPORT_DATABASE");
  }

  function subscribe(onDatabaseChange) {
    assertConfigured();
    unsubscribe();
    const safeCallback = (snapshot) => {
      if (snapshot?.metadata?.hasPendingWrites) return;
      onDatabaseChange(snapshot);
    };
    const onError = (error) => console.warn("Firestore realtime listener error", error);
    unsubscribeCallbacks = [
      firestoreApi.onSnapshot(firestoreApi.doc(db, "settings", "main"), safeCallback, onError),
      firestoreApi.onSnapshot(firestoreApi.collection(db, "employees"), safeCallback, onError),
      firestoreApi.onSnapshot(firestoreApi.collection(db, "evaluations"), safeCallback, onError),
    ];
    return unsubscribeCallbacks;
  }

  function unsubscribe() {
    unsubscribeCallbacks.forEach((callback) => {
      try { callback(); } catch (error) { console.warn(error); }
    });
    unsubscribeCallbacks = [];
  }

  const api = Object.freeze({
    isConfigured,
    signIn,
    signOut,
    getAuthenticatedUser,
    getProfile,
    loadState,
    saveEvaluation,
    addEmployee,
    deleteEmployee,
    addEvaluationYear,
    resetDatabase,
    importState,
    subscribe,
    unsubscribe,
  });

  global.KpiDatabase = api;
  global.KpiDatabaseReady = initializeSdk().then(() => api);
})(window);
