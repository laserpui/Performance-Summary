# Performance Summary Compatibility Patch

ไฟล์ `firebase-service.js` ในโฟลเดอร์นี้เป็นเวอร์ชันปรับจาก Web Performance Summary เดิม เพื่อให้ใช้ Collection `employees` ร่วมกับ Employee Management Hub ได้อย่างปลอดภัยขึ้น

สิ่งที่เปลี่ยน:

1. การ Seed/Reset พนักงานใช้ `merge: true` เพื่อไม่ลบ `employeeCode`, `fullName`, `startDate`, `legacyIds` และข้อมูล Employee Master อื่น
2. การ Reset/Import ของ Performance Summary จะลบเฉพาะ Evaluation ที่ไม่อยู่ในชุดใหม่ และจะไม่ลบ Employee Master

วิธีใช้:

- สำรองไฟล์ `docs/firebase-service.js` ของ Performance Summary เดิม
- นำไฟล์นี้ไปแทนที่
- ทดสอบ Login, โหลดข้อมูล, บันทึกคะแนน และ Export ก่อน Deploy จริง

ไม่จำเป็นต้องเปลี่ยนทันทีเพื่อทดลอง Employee Hub Phase 1 แต่แนะนำให้ใช้ก่อนกด Reset/Import ใน Web Performance Summary เดิม
