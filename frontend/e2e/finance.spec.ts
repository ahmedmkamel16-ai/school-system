import { api, apiToken, expect, isoDaysAgo, pdfMediaBox, pdfPageCount, pick, resetDb, test, todayIso } from './support'

test.describe.configure({ mode: 'serial' })

const PAST = isoDaysAgo(40)
let verification: { number: string; code: string }

test.beforeAll(async ({ request }) => {
  await resetDb(request)
  // تهيئة سريعة عبر الـ API: امتحانان منشوران وكشفان منشوران لسارة وعمر (68%)
  const teacher = await apiToken(request, 't@school.test')
  const admin = await apiToken(request, 'admin@school.test')
  const exam = (title: string, max: string, weight: string) => ({
    title, exam_type: 'midterm', term: 'first', academic_year: '2025-2026', exam_date: '2025-12-01',
    max_score: max, weight_percent: weight, subject_id: 1, classroom_id: 1,
  })
  for (const [title, max, weight, score] of [['نصفي', '50', '60', '40'], ['نهائي', '100', '40', '50']]) {
    const created = await api(request, teacher, 'post', '/exams', exam(title, max, weight))
    for (const studentId of [1, 2]) {
      await api(request, teacher, 'post', `/exams/${created.id}/results/bulk`, { results: [{ student_id: studentId, score }] })
    }
    await api(request, admin, 'patch', `/exams/${created.id}/status`, { status: 'published' })
  }
  for (const studentId of [1, 2]) {
    await api(request, admin, 'post', `/students/${studentId}/report-card/publish?term=first&academic_year=2025-2026`)
  }
})

test.describe('النظام المالي', () => {
  test('المدير: رسم مقرر + أقساط للفصل مع خصم (والحدود تُفرض قبل الإرسال)', async ({ login }) => {
    const page = await login('admin@school.test')
    await page.goto('/financials')
    await page.getByRole('button', { name: 'رسم مقرر' }).click()
    await page.fill('#fs_name', 'الرسوم الدراسية')
    await pick(page, 'الصف الدراسي', 'السادس الابتدائي')
    await page.fill('#fs_year', '2025-2026')
    await page.fill('#fs_total', '300000')
    await page.fill('#fs_discount', '20')
    await page.getByRole('button', { name: 'حفظ' }).click()
    await page.getByText('تم إنشاء الرسم المقرر').waitFor()

    await page.getByRole('button', { name: 'تعيين أقساط' }).click()
    await pick(page, 'الرسم المقرر', 'الرسوم الدراسية')
    await pick(page, 'الفصل', 'السادس أ')
    await page.fill('#pl_count', '3')
    await page.fill('#pl_interval', '3')
    await page.fill('#pl_first', PAST)
    await page.fill('#pl_discount', '25')
    await expect(page.getByText('أقصى خصم لهذا الرسم 20')).toBeVisible()
    await expect(page.getByRole('button', { name: 'إنشاء الأقساط' })).toBeDisabled()
    await page.fill('#pl_discount', '10')
    await expect(page.getByText('سبب الخصم مطلوب')).toBeVisible()
    await page.fill('#pl_reason', 'خصم أخوة')
    await expect(page.getByText(/الصافي لكل طالب: 270,000/)).toBeVisible()
    await page.getByRole('button', { name: 'إنشاء الأقساط' }).click()
    await page.getByText(/تم تعيين الرسم لـ 3 طالب/).waitFor()
    await expect(page.getByTestId('stat-overdue')).toContainText('270,000')
    await expect(page.getByRole('row', { name: /سارة علي/ })).toContainText('شهادة محجوبة')
  })

  test('ولي الأمر: الشهادة محجوبة ويرى كشف حساب ابنه فقط', async ({ login }) => {
    const page = await login('p1@school.test')
    await page.goto('/grades')
    await page.fill('#rc_year', '2025-2026')
    await page.getByRole('button', { name: 'عرض الكشف' }).click()
    const hold = page.getByTestId('financial-hold')
    await expect(hold).toContainText('يرجى مراجعة الحسابات')
    await expect(page.getByTestId('rc-overall')).toHaveCount(0)
    await hold.getByRole('link', { name: 'عرض كشف الحساب' }).click()
    await expect(page).toHaveURL(/\/financials\/students\/1$/)
    await expect(page.getByTestId('st-المتأخر')).toContainText('90,000')
    await expect(page.getByRole('alert').first()).toContainText('يرجى مراجعة الحسابات')
    await expect(page.getByRole('button', { name: 'تسجيل دفعة' })).toHaveCount(0)
    await page.goto('/financials/students/2') // ابن غيره
    await expect(page.getByText('تعذّر عرض كشف الحساب')).toBeVisible()
  })

  test('المعلم لا يدخل الحسابات', async ({ login }) => {
    const page = await login('t@school.test')
    await page.goto('/financials')
    await expect(page).toHaveURL('/')
    await expect(page.getByRole('link', { name: 'الحسابات' })).toHaveCount(0)
  })

  test('المحاسب: دفعة بحوالة، سند بالتفقيط وQR، وطباعة A5/A4', async ({ login, request }) => {
    const page = await login('acc@school.test')
    await page.goto('/financials')
    await expect(page.getByRole('button', { name: 'رسم مقرر' })).toHaveCount(0) // الرسوم للمدير
    await page.getByRole('button', { name: 'تسجيل دفعة', exact: true }).click()
    await page.fill('#pay_student_search', 'سارة')
    await page.getByRole('button', { name: /سارة علي/ }).click()
    await expect(page.locator('#pay_amount')).toHaveValue('90000') // أول قسط
    await page.fill('#pay_amount', '999999')
    await expect(page.getByText(/يتجاوز المتبقي/)).toBeVisible()
    await expect(page.getByRole('button', { name: 'تسجيل الدفعة وإصدار السند' })).toBeDisabled()
    await page.fill('#pay_amount', '90000')
    await pick(page, 'طريقة الدفع', 'حوالة')
    await expect(page.getByText('رقم الحوالة مطلوب')).toBeVisible()
    await expect(page.getByRole('button', { name: 'تسجيل الدفعة وإصدار السند' })).toBeDisabled()
    await page.fill('#pay_ref', 'TRX-5551')
    await page.getByRole('button', { name: 'تسجيل الدفعة وإصدار السند' }).click()

    await expect(page.getByTestId('receipt-number')).toHaveText(/^R-\d{4}-000001$/)
    await expect(page.getByTestId('receipt-amount')).toHaveText('90,000 د.ع')
    await expect(page.getByTestId('receipt-words')).toContainText('تسعون ألف دينار فقط لا غير')
    await expect(page.getByTestId('receipt-qr')).toBeVisible()

    await page.emulateMedia({ media: 'print' })
    const a5 = await page.pdf({ preferCSSPageSize: true, printBackground: true })
    const [w5, h5] = pdfMediaBox(a5)
    expect(Math.abs(w5 - 419.5)).toBeLessThan(2)
    expect(Math.abs(h5 - 595.3)).toBeLessThan(2)
    expect(pdfPageCount(a5)).toBe(1)
    await page.emulateMedia({ media: 'screen' })
    await pick(page, 'مقاس الورق', 'A4')
    await page.emulateMedia({ media: 'print' })
    const [w4, h4] = pdfMediaBox(await page.pdf({ preferCSSPageSize: true }))
    expect(Math.abs(w4 - 595.3)).toBeLessThan(2)
    expect(Math.abs(h4 - 841.9)).toBeLessThan(2)
    await page.emulateMedia({ media: 'screen' })
    await page.getByLabel('رمز QR').click()
    await expect(page.getByTestId('receipt-qr')).toHaveCount(0)
    await page.getByRole('button', { name: 'إغلاق' }).first().click()

    await expect(page.getByTestId('stat-today')).toContainText('90,000')
    await expect(page.getByTestId('stat-overdue')).toContainText('180,000')
    await expect(page.getByRole('button', { name: 'عكس' })).toHaveCount(0) // العكس للمدير فقط

    const token = await apiToken(request, 'acc@school.test')
    const [receipt] = await api(request, token, 'get', `/financials/receipts?date_from=${todayIso()}`)
    verification = { number: receipt.receipt_number, code: receipt.verification_code }

    // كشف الحساب يُطبع كصفحة (لا حوار)
    await page.goto('/financials/students/1')
    await expect(page.getByTestId('st-المدفوع')).toContainText('90,000')
    await page.emulateMedia({ media: 'print' })
    const printable = await page.evaluate(() => {
      const vis = (el: Element) => el.getClientRects().length > 0 && getComputedStyle(el).visibility === 'visible'
      return {
        area: vis(document.querySelector('.print-area')!),
        sidebar: [...document.querySelectorAll('[data-slot=sidebar]')].some(vis),
        buttons: [...document.querySelectorAll('button')].some(vis),
      }
    })
    expect(printable).toEqual({ area: true, sidebar: false, buttons: false })
    expect(pdfPageCount(await page.pdf({ preferCSSPageSize: true }))).toBe(1)
  })

  test('صفحة التحقق العامة من السند (كما يفتحها QR)', async ({ browser }) => {
    const context = await browser.newContext({ locale: 'ar' })
    const page = await context.newPage()
    await page.goto(`/verify-receipt?number=${verification.number}&code=${verification.code}`)
    await expect(page.getByTestId('verify-valid')).toContainText('90,000')
    await page.goto(`/verify-receipt?number=${verification.number}&code=${'0'.repeat(20)}`)
    await expect(page.getByTestId('verify-invalid')).toBeVisible()
    await expect(page.getByText('90,000')).toHaveCount(0) // لا بيانات مع رمز خاطئ
    await context.close()
  })

  test('السداد يرفع الحجب، والعكس (للمدير فقط) يعيده', async ({ login }) => {
    const parent = await login('p1@school.test')
    await parent.goto('/grades')
    await parent.fill('#rc_year', '2025-2026')
    await parent.getByRole('button', { name: 'عرض الكشف' }).click()
    await expect(parent.getByTestId('rc-overall')).toHaveText('68%')
    await expect(parent.getByTestId('financial-hold')).toHaveCount(0)

    const admin = await login('admin@school.test')
    await admin.goto('/financials')
    await admin.getByRole('row', { name: /R-\d{4}-000001/ }).getByRole('button', { name: 'عكس' }).click()
    await expect(admin.getByRole('button', { name: 'تأكيد العكس' })).toBeDisabled()
    await admin.fill('#rev_reason', 'تم الإدخال بالخطأ')
    await admin.getByRole('button', { name: 'تأكيد العكس' }).click()
    await admin.getByText(/صدر سند العكس V-\d{4}-000002/).waitFor()
    await expect(admin.getByRole('row', { name: /V-\d{4}-000002/ })).toContainText('سند عكس')
    await expect(admin.getByRole('row', { name: /R-\d{4}-000001/ }).getByRole('button', { name: 'عكس' })).toHaveCount(0)

    await parent.reload()
    await parent.fill('#rc_year', '2025-2026')
    await parent.getByRole('button', { name: 'عرض الكشف' }).click()
    await expect(parent.getByTestId('financial-hold')).toBeVisible()
  })

  test('تصدير Excel للمقبوضات والمتأخرين', async ({ login }) => {
    const page = await login('acc@school.test')
    await page.goto('/financials')
    for (const [index, prefix] of [[0, 'receipts-'], [1, 'defaulters-']] as const) {
      const [download] = await Promise.all([
        page.waitForEvent('download'),
        page.getByRole('button', { name: 'تصدير Excel' }).nth(index).click(),
      ])
      expect(download.suggestedFilename()).toMatch(new RegExp(`^${prefix}.*\\.xlsx$`))
      const stream = await download.createReadStream()
      const chunks: Buffer[] = []
      for await (const chunk of stream) chunks.push(chunk as Buffer)
      expect(Buffer.concat(chunks).subarray(0, 2).toString()).toBe('PK') // ملف xlsx (zip) صالح
    }
  })
})
