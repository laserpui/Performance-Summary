# Migration Phase 1

โฟลเดอร์นี้เก็บข้อมูลที่ใช้ย้ายฐานข้อมูลจริง จึง **ไม่ถูก Deploy** ผ่าน Firebase Hosting เพราะ `firebase.json` กำหนด Public Directory เป็น `docs` เท่านั้น

## ไฟล์

- `migration-seed.json` — Employee Master 12 คน และ Service Incentive 72 รายการ
- `Employee_Hub_Migration_Audit_Confirmed.xlsx` — ผลตรวจและข้อยืนยันก่อน Migration

## วิธีนำเข้า

1. Deploy Firestore Rules ชุดใหม่ก่อน
2. เปิด Employee Management Hub และ Login ด้วยบัญชี `admin`
3. เปิดเมนู **Migration Center**
4. เลือกไฟล์ `migration/migration-seed.json` จากเครื่อง
5. กด **ตรวจไฟล์ Seed**
6. กด **เริ่มนำเข้า Phase 1**
7. ตรวจ Employee Master 12 คน และ Service Incentive 72 รายการ

## ความปลอดภัย

- อย่าย้ายไฟล์นี้เข้าโฟลเดอร์ `docs`
- อย่าอัปโหลดไฟล์นี้ไปยัง Public Repository
- `.gitignore` ในชุดนี้ตั้งค่าไม่ให้ Git เพิ่มไฟล์ Migration อัตโนมัติ
- เก็บ Google Sheets/Excel เดิมไว้เป็น Backup จนกว่าจะตรวจข้อมูลครบ

## การนำเข้าซ้ำ

การนำเข้าซ้ำเป็นแบบ Idempotent ตาม Document ID แต่จะนำค่าจากไฟล์ต้นฉบับกลับไปเขียนทับ Service Incentive เดือน ม.ค.–มิ.ย. 2569 ดังนั้นอย่านำเข้าซ้ำหลังเริ่มบันทึกข้อมูลใหม่ในช่วงดังกล่าว เว้นแต่ต้องการคืนค่าตามต้นฉบับ
