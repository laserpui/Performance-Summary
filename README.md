# KPI Flow — Firebase Firestore Edition

เว็บแอปสำหรับบันทึกและวิเคราะห์คะแนน KPI พนักงาน โดยคงหน้าตา เมนู สูตรคำนวณ และโครงสร้างการใช้งานเดิม แต่เปลี่ยนฐานข้อมูลจาก Google Sheets/Supabase เป็น Firebase Authentication + Cloud Firestore

## สิ่งที่ปรับปรุงแล้ว

- ใช้ Firebase Authentication แบบอีเมลและรหัสผ่าน
- ใช้ Cloud Firestore เป็นฐานข้อมูลหลัก
- บันทึกเฉพาะคะแนนของพนักงานและเดือนที่เปลี่ยน ไม่ส่งข้อมูลทั้งระบบทุกครั้ง
- ตรวจ Version ก่อนบันทึก ป้องกันผู้ใช้สองคนเขียนทับข้อมูลเดียวกันโดยไม่รู้ตัว
- รองรับข้อมูล Realtime และมีปุ่มโหลดข้อมูลล่าสุด
- กำหนดสิทธิ์ 3 ระดับด้วย Firestore Security Rules
  - `viewer` ดู Dashboard/ประวัติ/รายงาน
  - `evaluator` ดูข้อมูลและบันทึกคะแนน
  - `admin` จัดการพนักงาน ปีประเมิน นำเข้า และรีเซ็ตข้อมูล
- เก็บ Audit Log สำหรับการเพิ่ม แก้ไข ลบ นำเข้า และรีเซ็ต
- ใช้ Memory Cache โดยค่าเริ่มต้น เพื่อไม่เก็บข้อมูลประเมินพนักงานถาวรใน IndexedDB ของเครื่องผู้ใช้
- รองรับ Firebase App Check แบบ reCAPTCHA Enterprise เป็นตัวเลือกเสริม
- Admin คนแรกจะสร้างข้อมูลตั้งต้นจากไฟล์ Excel ให้อัตโนมัติ หาก Firestore ยังว่าง

## โครงสร้างข้อมูล Firestore

```text
profiles/{uid}
settings/main
employees/{employeeId}
employeeNames/{sha256OfNormalizedName}
evaluations/{year__employeeId__month}
auditLogs/{autoId}
```

ข้อมูลคะแนนหนึ่ง Document ประกอบด้วย:

```text
employeeId, year, month
scores[6]
note, source
version
createdAt, createdBy
updatedAt, updatedBy
```

## สูตรคำนวณเดิม

1. GPA รายหัวข้อ = `คะแนนดิบ ÷ 20 − 1`
2. คะแนนถ่วงน้ำหนัก = `GPA × น้ำหนักหัวข้อ`
3. GPA รวม = `ผลรวมคะแนนถ่วงน้ำหนัก ÷ 20`
4. คะแนนรวม = `GPA รวม × 25`

ระบบจะไม่นำเดือนที่กรอกไม่ครบมาคำนวณค่าเฉลี่ย

---

# ขั้นตอนตั้งค่า Firebase

## 1. สร้าง Firebase Project

1. เปิด Firebase Console
2. สร้าง Project ใหม่
3. เพิ่ม Web App ด้วยปุ่ม `</>`
4. คัดลอกค่า `firebaseConfig`
5. เปิดไฟล์ `docs/firebase-config.js`
6. นำค่าที่ได้มาแทนค่า `REPLACE_ME` และ `YOUR_PROJECT_ID`

ตัวอย่าง:

```js
window.KPI_FIREBASE_CONFIG = Object.freeze({
  apiKey: "...",
  authDomain: "your-project.firebaseapp.com",
  projectId: "your-project",
  storageBucket: "your-project.firebasestorage.app",
  messagingSenderId: "...",
  appId: "...",
  appCheckSiteKey: "",
  useEmulator: false,
});
```

> Firebase Web configuration และ API key ไม่ใช่รหัสผ่านฐานข้อมูล ห้ามใส่ Service Account JSON หรือ Private Key ลงในโฟลเดอร์ `docs`

## 2. เปิด Firebase Authentication

1. ไปที่ `Build` → `Authentication`
2. กด `Get started`
3. เปิด Sign-in provider แบบ `Email/Password`
4. ไปที่แท็บ `Users`
5. สร้างผู้ใช้ Admin คนแรก
6. คัดลอก UID ของผู้ใช้นั้น

## 3. สร้าง Cloud Firestore

1. ไปที่ `Build` → `Firestore Database`
2. กด `Create database`
3. เลือก Production mode
4. เลือก Region ที่ใกล้ผู้ใช้งานและเป็นไปตามข้อกำหนดของบริษัท

## 4. สร้างโปรไฟล์ Admin คนแรก

ใน Firestore Console ให้สร้าง Collection และ Document ดังนี้:

```text
Collection ID: profiles
Document ID: UID ของผู้ใช้ Admin
```

เพิ่ม Fields:

| Field | Type | Value |
|---|---|---|
| `displayName` | string | ชื่อที่ต้องการแสดง |
| `role` | string | `admin` |
| `isActive` | boolean | `true` |

ผู้ใช้อื่นใช้รูปแบบเดียวกัน โดยกำหนด `role` เป็น `viewer`, `evaluator` หรือ `admin`

## 5. ติดตั้ง Security Rules

คัดลอกเนื้อหาใน:

```text
firebase/firestore.rules
```

ไปที่ Firestore → Rules แล้วกด Publish

หรือใช้ Firebase CLI:

```bash
npm install -g firebase-tools
firebase login
firebase use --add
firebase deploy --only firestore:rules
```

ไฟล์ `firebase.json` และ `firebase/firestore.indexes.json` เตรียมไว้แล้ว

## 6. เปิดเว็บและสร้างข้อมูลตั้งต้น

เปิดเว็บผ่าน Web Server, GitHub Pages หรือ Firebase Hosting แล้วเข้าสู่ระบบด้วย Admin คนแรก

หาก Collection `employees` ยังว่าง ระบบจะสร้างอัตโนมัติ:

- พนักงานตั้งต้น 12 คน
- คะแนนตั้งแต่เดือนมกราคม–มิถุนายน ปี 2569
- `settings/main`
- Name index สำหรับป้องกันชื่อซ้ำ
- Audit Log การสร้างฐานข้อมูล

ผู้ใช้ที่ไม่ใช่ Admin จะไม่สามารถสร้างข้อมูลตั้งต้นได้

---

# Deploy ด้วย Firebase Hosting

จากโฟลเดอร์โปรเจกต์:

```bash
npm install -g firebase-tools
firebase login
firebase use --add
firebase deploy --only hosting,firestore:rules,firestore:indexes
```

Firebase Hosting จะใช้โฟลเดอร์ `docs` และมี HTTPS ให้อัตโนมัติ

## ทดสอบในเครื่อง

อย่าเปิด `index.html` ด้วย `file://` โดยตรง ให้ใช้ Web Server เช่น:

```bash
python -m http.server 8080 --directory docs
```

แล้วเปิด:

```text
http://localhost:8080
```

หากใช้ Firebase Authentication จาก localhost ให้ตรวจว่า `localhost` อยู่ใน Authentication → Settings → Authorized domains

---

# เปิด Firebase App Check เพิ่มเติม

App Check ช่วยลดการเรียก Firestore จากเว็บหรือสคริปต์ที่ไม่ได้มาจากเว็บไซต์ของคุณ แต่ไม่ใช้แทน Authentication และ Security Rules

1. สร้าง reCAPTCHA Enterprise Website key สำหรับ Domain ที่ใช้งาน
2. ไปที่ Firebase Console → App Check
3. Register Web App ด้วย reCAPTCHA Enterprise
4. ใส่ Site key ใน `appCheckSiteKey` ของ `docs/firebase-config.js`
5. Deploy เว็บและดู Metrics ก่อน
6. เปิด Enforcement สำหรับ Firestore เมื่อยืนยันว่าผู้ใช้จริงทำงานได้ปกติ

ระหว่างพัฒนาใน localhost ให้ตั้ง Debug Token ตามคู่มือ Firebase แทนการเปิด Enforcement ทันที

---

# คำแนะนำด้านความปลอดภัย

- ห้ามใช้ Firestore Rules แบบ `allow read, write: if true`
- ห้ามเก็บ Service Account JSON หรือ Private Key ใน GitHub/เว็บไซต์
- ใช้บัญชีผู้ใช้แยกแต่ละคน ไม่แชร์บัญชี Admin
- ให้สิทธิ์ Admin เท่าที่จำเป็น
- ปิดบัญชีผู้ที่ออกจากบริษัทด้วย `isActive: false`
- ทดสอบ Security Rules ด้วย Rules Simulator หรือ Emulator Suite ก่อนเปิดจริง
- Export CSV สำรองข้อมูลตามรอบเวลา แม้ Firestore จะมีความเสถียร
- เปิด App Check หลังทดสอบระบบเรียบร้อย

# ไฟล์สำคัญ

```text
docs/index.html             หน้าเว็บหลัก
docs/styles.css             UI เดิม
docs/app.js                 Logic การคำนวณและหน้าจอ
docs/firebase-config.js     ค่า Firebase Web App
docs/firebase-service.js    Authentication และ Firestore data layer
firebase/firestore.rules    สิทธิ์และ Validation ฝั่ง Server
firebase/firestore.indexes.json
firebase.json               Hosting และ Rules deployment
```

# หมายเหตุเรื่อง Free Tier

ข้อมูล KPI แบบตัวเลขและข้อความมีขนาดเล็ก แต่ Firestore คิดโควตาตามจำนวน Document reads/writes/deletes เว็บเวอร์ชันนี้จึงบันทึกเฉพาะรายการที่เปลี่ยน และใช้ Realtime listener เฉพาะ Collection ที่จำเป็น ควรตรวจหน้า Usage ใน Firebase Console เป็นระยะเมื่อจำนวนผู้ใช้หรือข้อมูลเพิ่มขึ้น
