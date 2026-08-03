# Production Checklist — Employee Management Hub v1.0.10

เอกสารนี้ใช้ก่อนนำไฟล์ในโฟลเดอร์ `docs` และ Firestore rules ขึ้นระบบจริง

## ตรวจอัตโนมัติ

รันจากโฟลเดอร์หลักของโปรเจกต์:

```powershell
node --check docs/app.js
node --check docs/firebase-service.js
node --check docs/firebase-config.js
node tests/verify-regressions.mjs
```

ผล regression check ต้องขึ้น `PASS 8 regression groups`

## ลำดับการนำขึ้น Firebase

1. สำรองข้อมูลจากหน้า System Health ด้วยบัญชีผู้ดูแลระบบ
2. ตรวจว่า Firebase CLI ชี้ไปยัง project ที่ถูกต้อง
3. นำ Firestore rules, indexes และ Hosting ขึ้นพร้อมกัน

```powershell
firebase deploy --only firestore:rules,firestore:indexes,hosting
```

4. เปิดเว็บไซต์จาก URL จริงและตรวจ response headers ว่ามี CSP, HSTS และ cache policy
5. ทดสอบด้วยบัญชี admin และ evaluator จริงตามรายการด้านล่าง

## Smoke test หลัง deploy

- เข้าสู่ระบบและออกจากระบบได้
- ปุ่มย้อนกลับ/ไปข้างหน้าของเบราว์เซอร์เปลี่ยนหน้าตาม URL hash ได้
- เพิ่มและแก้ไข Performance Summary พร้อมตรวจ Audit Log
- บันทึก Monthly Performance แบบรายคนและแบบหลายคนในครั้งเดียว
- ปิด Monthly Performance แล้วต้องแก้คะแนนรายวันไม่ได้
- Finalize รอบแล้วต้องแก้ Workday, Performance และ Incentive ของเดือนนั้นไม่ได้
- Reopen รอบด้วยเหตุผล แล้วกลับมาแก้ข้อมูลได้
- รายงานประจำปีแสดงครบ 12 เดือนและไม่ดึงข้อมูลปีอื่นปะปน
- เปิดบนมือถือ ตรวจ modal, ตารางเลื่อนแนวนอน และเมนูด้านล่าง

## สิ่งที่ต้องตั้งค่าจาก Firebase Console

- เปิด Firebase App Check และใส่ site key จริงใน `docs/firebase-config.js` เมื่อต้องการบังคับใช้
- ตรวจ Authorized domains ของ Firebase Authentication
- ตรวจสมาชิกใน `profiles` ให้มี role และ `isActive` ถูกต้อง
- ตั้ง budget alert และติดตาม Firestore reads/writes หลังใช้งานจริง 7 วันแรก

อย่าใส่รหัสผ่าน, private key หรือ service-account JSON ลงใน repository
