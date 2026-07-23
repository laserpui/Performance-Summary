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
      };
    } catch (error) {
      throw friendlyError(error, "อ่านสถานะ Migration ไม่สำเร็จ");
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
    saveEmployee,
    saveServiceIncentive,
    deleteServiceIncentive,
    reorderEmployeeCodesByStartDate,
    importMigrationSeed,
  });

  global.EmployeeHubDatabase = api;
  global.EmployeeHubDatabaseReady = initializeSdk().then(() => api);
})(window);
