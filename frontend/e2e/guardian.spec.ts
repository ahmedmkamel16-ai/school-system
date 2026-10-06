import { api, apiToken, expect, isoDaysAgo, pdfPageCount, resetDb, test } from './support'

test.describe.configure({ mode: 'serial' })

let receiptId = ''

test.beforeAll(async ({ request }) => {
  await resetDb(request)
  const admin = await apiToken(request, 'admin@school.test')
  // ليث (id=4، الخامس أ): رسوم بقسطين أولهما متأخر، وامتحان منشور (85%) بملاحظة للمعلم وأخرى داخلية
  const structure = await api(request, admin, 'post', '/financials/fee-structures', {
    name: 'الرسوم الدراسية', grade_level: 'الخامس الابتدائي', academic_year: '2025-2026', total_amount: '200000', max_discount_percent: '0',
  })
  await api(request, admin, 'post', '/financials/plans', {
    fee_structure_id: structure.id, student_id: 4, schedule: { count: 2, first_due_date: isoDaysAgo(40), interval_months: 3 },
  })
  const exam = await api(request, admin, 'post', '/exams', {
    title: 'نصفي', exam_type: 'midterm', term: 'first', academic_year: '2025-2026', exam_date: '2025-12-01',
    max_score: '100', weight_percent: '100', subject_id: 1, classroom_id: 3,
  })
  await api(request, admin, 'post', `/exams/${exam.id}/results/bulk`, {
    results: [{ student_id: 4, score: '85', teacher_note: 'مجتهد', internal_note: 'ملاحظة سرية' }],
  })
  await api(request, admin, 'patch', `/exams/${exam.id}/status`, { status: 'published' })
  await api(request, admin, 'post', '/students/4/report-card/publish?term=first&academic_year=2025-2026')
})

test.describe('صفحة ولي الأمر المتكاملة', () => {
  test('يهبط على صفحته، ويرى الحضور والجدول والحجب المالي للابن الأول', async ({ login }) => {
    const page = await login('p3@school.test')
    await expect(page).toHaveURL(/\/guardian$/)
    await expect(page.getByRole('tab', { name: /ليث كريم/ })).toHaveAttribute('aria-selected', 'true')
    await expect(page.getByTestId('child-name')).toHaveText('ليث كريم')

    // 10 سجلات: 8 حضور، 1 غياب، 1 تأخر ⇒ نسبة الحضور 90%
    await expect(page.getByTestId('attendance-rate')).toHaveText('90%')
    await expect(page.getByTestId('att-present')).toHaveText('8')
    await expect(page.getByTestId('att-absent')).toHaveText('1')
    await expect(page.getByTestId('att-late')).toHaveText('1')

    const timetable = page.getByTestId('timetable')
    await expect(timetable.getByText('رياضيات')).toHaveCount(2)
    await expect(timetable.getByText('عربي')).toHaveCount(1)
    await expect(timetable.getByText('المعلمة سلمى').first()).toBeVisible()

    await expect(page.getByTestId('guardian-hold')).toContainText('يرجى مراجعة الحسابات')
    await expect(page.getByRole('button', { name: /الفصل الأول/ })).toHaveCount(0) // لا شهادات أثناء الحجب
    await expect(page.getByTestId('st-المتأخر')).toContainText('100,000')
  })

  test('الابن الثاني: بياناته منفصلة تمامًا عن الأول', async ({ login }) => {
    const page = await login('p3@school.test')
    await page.getByRole('tab', { name: /هدى كريم/ }).click()
    await expect(page.getByTestId('child-name')).toHaveText('هدى كريم')
    await expect(page.getByText('لم يُعدّ جدول الحصص لهذه الشعبة بعد.')).toBeVisible()
    await expect(page.getByText('لا توجد سجلات حضور في هذه الفترة.')).toBeVisible()
    await expect(page.getByTestId('guardian-hold')).toHaveCount(0)
    await expect(page.getByText('لا توجد رسوم مسجّلة لهذا الطالب.')).toBeVisible()
    await expect(page.getByText('100,000')).toHaveCount(0)
  })

  test('بعد السداد: تظهر الشهادة (بملاحظة المعلم فقط) ويُطبع السند بالتفقيط', async ({ login, request }) => {
    const accountant = await apiToken(request, 'acc@school.test')
    const statement = await api(request, accountant, 'get', '/financials/students/4/statement')
    const receipt = await api(request, accountant, 'post', '/financials/receipts', {
      student_fee_id: statement.fees[0].id, amount: '100000', method: 'cash',
    })
    receiptId = receipt.id

    const page = await login('p3@school.test')
    await expect(page.getByTestId('guardian-hold')).toHaveCount(0)
    await page.getByRole('button', { name: /الفصل الأول/ }).click()
    const card = page.getByRole('dialog')
    await expect(card.getByTestId('rc-overall')).toHaveText('85%')
    await expect(card).toContainText('جيد جدًا')
    await expect(card).toContainText('نصفي: مجتهد')
    await expect(card).not.toContainText('ملاحظة سرية')
    await page.keyboard.press('Escape')

    await page.getByRole('row', { name: new RegExp(receipt.receipt_number) }).getByRole('button', { name: 'السند' }).click()
    const voucher = page.getByRole('dialog')
    await expect(voucher.getByTestId('receipt-words')).toContainText('مائة ألف دينار فقط لا غير')
    await expect(voucher.getByTestId('receipt-qr')).toBeVisible()
    await expect(voucher.getByText('المحصِّل', { exact: true })).toHaveCount(0) // بيانات الموظف لا تظهر لولي الأمر
    await page.emulateMedia({ media: 'print' })
    expect(pdfPageCount(await page.pdf({ preferCSSPageSize: true }))).toBe(1)
    await page.emulateMedia({ media: 'screen' })
  })

  test('عكس السند يعيد الحجب، واستثناء المدير يفكّه مع توثيق السبب', async ({ login, request }) => {
    const admin = await apiToken(request, 'admin@school.test')
    await api(request, admin, 'post', `/financials/receipts/${receiptId}/reverse`, { reason: 'إدخال خاطئ' })
    const parent = await login('p3@school.test')
    await expect(parent.getByTestId('guardian-hold')).toBeVisible()

    const manager = await login('admin@school.test')
    await manager.goto('/financials/students/4')
    await manager.getByRole('button', { name: 'استثناء من الحجب' }).click()
    await expect(manager.getByRole('button', { name: 'تفعيل الاستثناء' })).toBeDisabled() // السبب إلزامي
    await manager.fill('#hold_notes', 'اتفاق خاص مع الإدارة')
    await manager.getByRole('button', { name: 'تفعيل الاستثناء' }).click()
    await expect(manager.getByTestId('hold-exempt-banner')).toContainText('اتفاق خاص مع الإدارة')

    await parent.reload()
    await expect(parent.getByTestId('guardian-hold')).toHaveCount(0)
    await expect(parent.getByRole('button', { name: /الفصل الأول/ })).toBeVisible()
    await expect(parent.getByText('اتفاق خاص')).toHaveCount(0) // لا يرى ولي الأمر سبب الاستثناء

    const accountant = await login('acc@school.test')
    await accountant.goto('/financials/students/4')
    await expect(accountant.getByRole('button', { name: 'استثناء من الحجب' })).toHaveCount(0) // للمدير فقط
    await expect(accountant.getByTestId('hold-exempt-banner')).toBeVisible()

    await manager.getByRole('button', { name: 'تعديل الاستثناء' }).click()
    await manager.getByRole('button', { name: 'إلغاء الاستثناء' }).click()
    await expect(manager.getByTestId('hold-exempt-banner')).toHaveCount(0)
    await parent.reload()
    await expect(parent.getByTestId('guardian-hold')).toBeVisible()
  })
})
