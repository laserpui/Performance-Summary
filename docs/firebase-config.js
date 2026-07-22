"use strict";

// คัดลอกค่า firebaseConfig จาก Firebase Console > Project settings > Your apps > Web app
// ค่าเหล่านี้เป็นตัวระบุโปรเจกต์สำหรับ Firebase Web SDK ไม่ใช่รหัสผ่านฐานข้อมูล
// ความปลอดภัยของข้อมูลต้องควบคุมด้วย Firebase Authentication + Firestore Security Rules
// Your web app's Firebase configuration
// For Firebase JS SDK v7.20.0 and later, measurementId is optional
const firebaseConfig = {
  apiKey: "AIzaSyBWhhjpHjaSsKbgLiYtHl7cndQoVgFC43Y",
  authDomain: "performance-summary-62d48.firebaseapp.com",
  projectId: "performance-summary-62d48",
  storageBucket: "performance-summary-62d48.firebasestorage.app",
  messagingSenderId: "457203754131",
  appId: "1:457203754131:web:3a5039ce0715e12b719966",
  measurementId: "G-3PX9ZL3BLP"
};

  // ตัวเลือกเสริม: ใส่ reCAPTCHA Enterprise site key หลังตั้งค่า Firebase App Check
  // เว้นว่างไว้ระหว่างการทดสอบได้ และเปิด Enforcement หลังตรวจสอบ Metrics แล้ว
  appCheckSiteKey: "",

  // ปกติไม่ต้องแก้ไข ใช้เฉพาะตอนทดสอบกับ Firebase Emulator Suite
  useEmulator: false,
  emulatorHost: "127.0.0.1",
  firestoreEmulatorPort: 8080,
  authEmulatorPort: 9099,
});
