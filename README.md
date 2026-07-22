# Employee Management Hub — Firebase Phase 1

Web กลางสำหรับรวมระบบบริหารพนักงาน โดยใช้ Firebase Project เดิมของ Performance Summary

## ฟังก์ชันที่พร้อมใช้งาน

- Firebase Authentication ด้วยบัญชีเดิม
- Employee Master กลาง 12 คน
- จัดเก็บรหัสพนักงาน, วันที่เริ่มงาน, สถานะ และ Legacy IDs
- Service Incentive แบบหนึ่งพนักงานต่อหนึ่งเดือน
- Dashboard สรุปยอดขายของ, ประเมิน, เวลา และยอดรวม
- แก้ไข/ลบ Service Incentive เฉพาะรายการ
- Export CSV พร้อมป้องกัน CSV Formula Injection
- อ่านจำนวนข้อมูล Performance Summary จาก Collection `evaluations`
- Migration Center สำหรับเลือกไฟล์ Seed จากเครื่อง
- Audit Log สำหรับการเพิ่ม แก้ไข ลบ และนำเข้า
- เตรียม Collection สำหรับ Workday Insight และ Monthly Performance

## สถานะโมดูล

| โมดูล | สถานะ |
|---|---|
| Employee Master | พร้อมใช้งาน |
| Service Incentive | พร้อมใช้งาน |
| Performance Summary | เชื่อมฐานข้อมูลเดิมแล้ว รอรวม UI |
| Workday Insight | Phase 2 |
| Monthly Performance | Phase 3 |

## โครงสร้างไฟล์

```text
Employee_Management_Hub/
├─ docs/                         # ไฟล์ Web ที่นำขึ้น Hosting
│  ├─ index.html
│  ├─ styles.css
│  ├─ app.js
│  ├─ firebase-service.js
│  ├─ firebase-config.js
│  └─ .nojekyll
├─ firebase/
│  ├─ firestore.rules
│  └─ firestore.indexes.json
├─ migration/                    # ข้อมูลภายใน ไม่ถูก Deploy
│  ├─ migration-seed.json
│  ├─ Employee_Hub_Migration_Audit_Confirmed.xlsx
│  └─ README.md
├─ compatibility/
│  └─ performance-summary/       # Patch ป้องกัน Reset ลบ Employee Master
├─ firebase.json
├─ .firebaserc.example
├─ .gitignore
└─ README.md
```

## ขั้นตอนติดตั้ง

### 1. สำรองข้อมูลเดิม

ก่อนเริ่ม ให้ดาวน์โหลด Google Sheets เดิมทั้ง 3 ระบบและ Export ข้อมูล Firestore เดิมตามวิธีที่คุณใช้อยู่

### 2. ตรวจ Firebase Config

ไฟล์ `docs/firebase-config.js` ใส่ค่าของ Project:

```text
performance-summary-62d48
```

ไว้แล้ว ไม่ต้องใส่ Service Account หรือ Private Key ลงใน Web

### 3. Publish Firestore Rules

วิธีผ่าน Firebase Console:

1. Firebase Console
2. Firestore Database
3. Rules
4. คัดลอกเนื้อหาจาก `firebase/firestore.rules`
5. กด Publish

Rules ชุดนี้ยังรองรับ Web Performance Summary เดิม และเพิ่มสิทธิ์สำหรับ Employee Hub

### 4. Deploy Web

#### Firebase Hosting — แนะนำ

```bash
npm install -g firebase-tools
firebase login
firebase use performance-summary-62d48
firebase deploy --only hosting,firestore:rules,firestore:indexes
```

หรือคัดลอก `.firebaserc.example` เป็น `.firebaserc` ก่อน Deploy

#### GitHub Pages

นำไฟล์ทั้ง Repository ขึ้น GitHub แต่ตั้ง Pages ให้ใช้:

```text
Branch: main
Folder: /docs
```

จากนั้นเพิ่มโดเมน GitHub Pages ใน Firebase Console:

```text
Authentication → Settings → Authorized domains
```

> อย่านำไฟล์ใน `migration/` ไปไว้ใน `docs` เพราะไฟล์ Static บน Hosting สามารถถูกเปิดได้โดยไม่ผ่าน Firebase Authentication

## นำเข้าข้อมูล Phase 1

1. เปิด Web และ Login ด้วยบัญชี Admin เดิม
2. เปิด **Migration Center**
3. เลือก `migration/migration-seed.json`
4. ตรวจจำนวน:
   - Employee Master 12 คน
   - Service Incentive 72 รายการ
   - 6 เดือน
5. กดนำเข้า
6. ตรวจข้อมูลในเมนู Employee Master และ Service Incentive

## Firestore Collections

### Collections เดิมที่ยังใช้งาน

```text
profiles
employees
employeeNames
evaluations
settings
auditLogs
```

### Collections ที่เพิ่มใน Phase 1

```text
serviceIncentives
hubSettings
```

### Collections ที่เตรียมสำหรับ Phase 2–3

```text
attendanceMonthly
leaveRecords
dailyPerformanceEntries
monthlyPerformanceOverrides
monthlyPerformanceStatus
```

## Document IDs

Service Incentive ใช้รูปแบบ:

```text
{employeeId}__{YYYY-MM}
```

ตัวอย่าง:

```text
kasidet__2026-06
```

จึงไม่สามารถมีข้อมูลของพนักงานคนเดียวในเดือนเดียวกันซ้ำสองรายการ

## Compatibility กับ Performance Summary เดิม

Employee Hub ใช้ Collection `employees` เดียวกัน โดยคงฟิลด์ `name` ที่ Web เดิมต้องใช้ และเพิ่ม:

```text
fullName
employeeCode
startDate
isActive
sortOrder
legacyIds
version
```

ก่อนใช้คำสั่ง Reset/Import ใน Performance Summary เดิม แนะนำให้นำไฟล์:

```text
compatibility/performance-summary/firebase-service.js
```

ไปแทน `docs/firebase-service.js` ของ Web เดิม เพื่อให้ Reset ไม่ลบ Employee Master และไม่ล้างฟิลด์ใหม่

## ข้อมูล Migration ที่ยืนยันแล้ว

รายการขัดแย้งจำนวน 5 กรณีได้รับการยืนยันและกำหนดกติกา Migration แล้ว โดยไม่ฝังชื่อหรือรายละเอียดพนักงานไว้ในไฟล์ Web สาธารณะ รายละเอียดอยู่ใน `migration/Employee_Hub_Migration_Audit_Confirmed.xlsx`

## ข้อจำกัดของ Phase 1

- Workday Insight และ Monthly Performance ยังเป็นหน้าแสดงแผนงาน ไม่ได้บันทึกข้อมูลใหม่
- Performance Summary ยังใช้ UI เดิม แต่ Employee Hub อ่านจำนวน Record จาก Firestore ได้แล้ว
- ยังไม่ได้ทดสอบกับ Firebase Project จริงจากสภาพแวดล้อมนี้ จึงต้องทดสอบ Login, Rules และ Import บน Project ของคุณก่อนใช้งานจริง

## เอกสาร Firebase ทางการ

- Web setup: https://firebase.google.com/docs/web/setup
- Authentication: https://firebase.google.com/docs/auth/web/start
- Firestore Rules: https://firebase.google.com/docs/firestore/security/get-started
- Firebase Hosting: https://firebase.google.com/docs/hosting/quickstart
