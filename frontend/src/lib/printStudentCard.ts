import type { Student } from '@/api/students'

export function printStudentCard(student: Student) {
  const printWindow = window.open('', '_blank', 'width=500,height=650')
  if (!printWindow) return

  printWindow.document.write(`
    <!doctype html>
    <html lang="ar" dir="rtl">
      <head>
        <meta charset="utf-8" />
        <title>بطاقة الطالب - ${student.full_name}</title>
        <style>
          * { box-sizing: border-box; }
          body {
            font-family: Tahoma, Arial, sans-serif;
            display: flex;
            align-items: center;
            justify-content: center;
            min-height: 100vh;
            margin: 0;
            background: #f3f4f6;
          }
          .card {
            width: 380px;
            border: 2px solid #111827;
            border-radius: 12px;
            padding: 20px;
            background: white;
          }
          .header {
            text-align: center;
            border-bottom: 2px solid #111827;
            padding-bottom: 10px;
            margin-bottom: 14px;
          }
          .header h1 { font-size: 16px; margin: 0; }
          .avatar {
            width: 64px;
            height: 64px;
            border-radius: 50%;
            background: #111827;
            color: white;
            display: flex;
            align-items: center;
            justify-content: center;
            font-size: 22px;
            margin: 0 auto 10px;
          }
          .name { text-align: center; font-size: 18px; font-weight: bold; margin-bottom: 12px; }
          table { width: 100%; border-collapse: collapse; font-size: 13px; }
          td { padding: 6px 0; }
          td.label { color: #6b7280; width: 40%; }
          td.value { font-weight: bold; }
          @media print {
            body { background: white; }
          }
        </style>
      </head>
      <body>
        <div class="card">
          <div class="header"><h1>بطاقة الطالب المدرسية</h1></div>
          <div class="avatar">${student.full_name.trim().split(/\s+/).slice(0, 2).map((p) => p[0]).join('')}</div>
          <div class="name">${student.full_name}</div>
          <table>
            <tr><td class="label">الرقم الوطني</td><td class="value">${student.national_id}</td></tr>
            <tr><td class="label">الصف الدراسي</td><td class="value">${student.grade_level}</td></tr>
            <tr><td class="label">الشعبة</td><td class="value">${student.class_name ?? '—'}</td></tr>
            <tr><td class="label">اسم ولي الأمر</td><td class="value">${student.guardian_name}</td></tr>
            <tr><td class="label">هاتف ولي الأمر</td><td class="value">${student.guardian_phone}</td></tr>
            ${student.address ? `<tr><td class="label">العنوان</td><td class="value">${student.address}</td></tr>` : ''}
          </table>
        </div>
        <script>window.onload = () => window.print()</script>
      </body>
    </html>
  `)
  printWindow.document.close()
}
