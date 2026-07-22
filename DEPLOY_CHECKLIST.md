# Deploy Checklist — Phase 1

## ก่อน Deploy

- [ ] Google Sheets เดิมทั้ง 3 ระบบได้รับการสำรองแล้ว
- [ ] บัญชี Firebase Authentication ของผู้ใช้งานมี `profiles/{UID}`
- [ ] `role` เป็น `admin`
- [ ] `isActive` เป็น Boolean `true`
- [ ] ตรวจ `docs/firebase-config.js` ว่าใช้ Project ที่ถูกต้อง
- [ ] ไม่พบ Service Account หรือ Private Key ใน Repository

## Deploy

- [ ] Publish `firebase/firestore.rules`
- [ ] Deploy `docs/` ผ่าน Firebase Hosting หรือ GitHub Pages
- [ ] เพิ่ม Hosting Domain ใน Firebase Authentication → Authorized domains
- [ ] Login ได้สำเร็จ
- [ ] หน้า Dashboard โหลดโดยไม่ขึ้น Permission Denied

## Migration Phase 1

- [ ] เลือก `migration/migration-seed.json` จากเครื่อง
- [ ] Preview แสดงพนักงาน 12 คน
- [ ] Preview แสดง Service Incentive 72 รายการ
- [ ] นำเข้าครบโดยไม่เกิด Error
- [ ] Employee Master แสดง EMP001–EMP012
- [ ] Service Incentive มีข้อมูล ม.ค.–มิ.ย. 2569 เดือนละ 12 รายการ
- [ ] ยอดรวมรายเดือนตรงกับ Audit

## หลัง Deploy

- [ ] ทดสอบเพิ่มและแก้ Service Incentive หนึ่งรายการ
- [ ] ทดสอบ Export CSV
- [ ] ตรวจ `auditLogs` ว่ามีรายการนำเข้าและแก้ไข
- [ ] ยังไม่ลบหรือปิด Google Sheets/Web เดิม
- [ ] ก่อน Reset/Import Performance Summary ให้ใช้ Compatibility Patch
