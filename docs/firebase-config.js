"use strict";

// คัดลอกค่า firebaseConfig จาก Firebase Console > Project settings > Your apps > Web app
// ค่าเหล่านี้เป็นตัวระบุโปรเจกต์สำหรับ Firebase Web SDK ไม่ใช่รหัสผ่านฐานข้อมูล
// ความปลอดภัยของข้อมูลต้องควบคุมด้วย Firebase Authentication + Firestore Security Rules
window.KPI_FIREBASE_CONFIG = Object.freeze({
  apiKey: "REPLACE_ME",
  authDomain: "YOUR_PROJECT_ID.firebaseapp.com",
  projectId: "YOUR_PROJECT_ID",
  storageBucket: "YOUR_PROJECT_ID.firebasestorage.app",
  messagingSenderId: "REPLACE_ME",
  appId: "REPLACE_ME",

  // ตัวเลือกเสริม: ใส่ reCAPTCHA Enterprise site key หลังตั้งค่า Firebase App Check
  // เว้นว่างไว้ระหว่างการทดสอบได้ และเปิด Enforcement หลังตรวจสอบ Metrics แล้ว
  appCheckSiteKey: "",

  // ปกติไม่ต้องแก้ไข ใช้เฉพาะตอนทดสอบกับ Firebase Emulator Suite
  useEmulator: false,
  emulatorHost: "127.0.0.1",
  firestoreEmulatorPort: 8080,
  authEmulatorPort: 9099,
});
