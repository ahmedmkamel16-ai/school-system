import { apiToken, expect, pick, pdfPageCount, resetDb, test } from './support'

test.describe.configure({ mode: 'serial' })
test.beforeAll(async ({ request }) => resetDb(request))

test.describe('الامتحانات والدرجات وكشف الشهادة', () => {
  test('المعلم: لا يرى إلا فصله ومادتيه، ويتحقق من الأوزان قبل الإرسال', async ({ login }) => {
    const page = await login('t@school.test')
    await page.goto('/grades')
    await page.getByRole('button', { name: 'امتحان جديد' }).click()
    await page.getByLabel('الفصل والمادة', { exact: true }).click()
    expect((await page.getByRole('option').allInnerTexts()).sort()).toEqual(['السادس أ — رياضيات', 'السادس أ — عربي'].sort())
    await page.getByRole('option', { name: 'السادس أ — رياضيات' }).click()
    await page.fill('#exam_title', 'نصفي')
    await page.fill('#exam_max', '50')
    await page.fill('#exam_weight', '60')
    await page.getByRole('button', { name: 'إنشاء الامتحان' }).click()
    await expect(page.getByRole('dialog')).toBeHidden() // يُغلق بعد نجاح الحفظ (التوست قد يتكرر نصّه)

    await page.getByRole('button', { name: 'امتحان جديد' }).click()
    await page.getByLabel('الفصل والمادة', { exact: true }).click()
    await page.getByRole('option', { name: 'السادس أ — رياضيات' }).click()
    await page.fill('#exam_title', 'نهائي')
    await page.fill('#exam_weight', '50')
    await expect(page.getByText('المتبقي لهذه المادة: 40% من 100%')).toBeVisible()
    await expect(page.getByText('يتجاوز المتبقي (40%)')).toBeVisible()
    await expect(page.getByRole('button', { name: 'إنشاء الامتحان' })).toBeDisabled()
    await page.fill('#exam_weight', '40')
    await page.getByRole('button', { name: 'إنشاء الامتحان' }).click()
    await expect(page.getByRole('dialog')).toBeHidden() // يُغلق بعد نجاح الحفظ (التوست قد يتكرر نصّه)
  })

  test('دفتر الدرجات: تنقل بالكيبورد، حماية الحد الأعلى، غائب/معفى، حفظ', async ({ login }) => {
    const page = await login('t@school.test')
    await page.goto('/grades')
    await page.getByRole('row', { name: /نصفي/ }).getByRole('button', { name: 'الدرجات' }).click()
    const dialog = page.getByRole('dialog')
    const [sara, omar, nour] = ['سارة علي', 'عمر حسن', 'نور محمد'].map((n) => dialog.getByLabel(`درجة ${n}`))

    await sara.focus()
    await page.keyboard.type('40')
    await page.keyboard.press('Enter')
    await expect(omar).toBeFocused()
    await page.keyboard.type('55') // أعلى من 50
    await expect(dialog.getByText('لا تتجاوز 50')).toBeVisible()
    await expect(dialog.getByRole('button', { name: /^حفظ/ })).toBeDisabled()
    await page.keyboard.press('Control+a')
    await page.keyboard.type('45')
    await page.keyboard.press('Tab')
    await expect(nour).toBeFocused()
    await dialog.getByRole('group', { name: 'حالة نور محمد' }).getByRole('button', { name: 'غائب' }).click()
    await expect(nour).toBeDisabled()
    await dialog.getByLabel('ملاحظة سارة علي', { exact: true }).fill('جيد')
    await dialog.getByLabel('ملاحظة داخلية سارة علي').fill('سري جدًا')
    await dialog.getByRole('button', { name: 'حفظ (3)' }).click()
    await page.getByText('تم حفظ 3 سجل').waitFor()

    await page.keyboard.press('Escape')
    await page.getByRole('row', { name: /نصفي/ }).getByRole('button', { name: 'الدرجات' }).click()
    await expect(page.getByRole('dialog').getByLabel('درجة سارة علي')).toHaveValue('40')
    await page.keyboard.press('Escape')
    await page.getByRole('row', { name: /نهائي/ }).getByRole('button', { name: 'الدرجات' }).click()
    await page.getByRole('dialog').getByLabel('درجة سارة علي').fill('50')
    await page.getByRole('dialog').getByRole('button', { name: 'حفظ (1)' }).click()
    await page.getByText('تم حفظ 1 سجل').waitFor()
    await expect(page.getByRole('button', { name: 'نشر' })).toHaveCount(0) // النشر للمدير فقط
  })

  test('المدير: النشر، الكشف (68% متوسط/ناجح)، وطباعته صفحة واحدة', async ({ login }) => {
    const page = await login('admin@school.test')
    await page.goto('/grades')
    for (const title of ['نصفي', 'نهائي']) {
      await page.getByRole('row', { name: new RegExp(title) }).getByRole('button', { name: 'نشر' }).click()
      await page.getByRole('alertdialog').getByRole('button', { name: 'تأكيد' }).click()
      await expect(page.getByRole('row', { name: new RegExp(title) }).getByText('منشور')).toBeVisible()
    }
    await page.getByRole('tab', { name: 'كشوف الدرجات' }).click()
    await pick(page, 'الشعبة', 'السادس أ')
    await expect(page.locator('#rc_year')).toHaveValue('2025-2026') // العام يتبع الشعبة
    await page.getByRole('row', { name: /سارة علي/ }).getByRole('button', { name: 'عرض الكشف' }).click()
    const dialog = page.getByRole('dialog')
    await expect(dialog.getByTestId('rc-overall')).toHaveText('68%') // 60×0.8 + 40×0.5
    await expect(dialog.getByTestId('rc-total')).toHaveText('68 / 100')
    await expect(dialog.getByTestId('rc-gpa')).toHaveText('2.50')
    await expect(dialog.getByTestId('rc-result')).toHaveText('ناجح')
    await expect(dialog).toContainText('متوسط')
    await expect(dialog).toContainText('نصفي: جيد')
    await expect(dialog).not.toContainText('سري جدًا') // الملاحظة الداخلية لا تُطبع
    await dialog.getByRole('button', { name: 'نشر الكشف لولي الأمر' }).click()
    await page.getByText('تم نشر الكشف لولي الأمر').waitFor()

    await page.emulateMedia({ media: 'print' })
    const visible = await page.evaluate(() => {
      const vis = (el: Element) => el.getClientRects().length > 0 && getComputedStyle(el).visibility === 'visible'
      return {
        area: vis(document.querySelector('.print-area')!),
        sidebar: [...document.querySelectorAll('[data-slot=sidebar]')].some(vis),
        noPrint: [...document.querySelectorAll('.no-print')].some(vis),
        overlay: [...document.querySelectorAll('[data-slot=dialog-overlay]')].some(vis),
      }
    })
    expect(visible).toEqual({ area: true, sidebar: false, noPrint: false, overlay: false })
    expect(pdfPageCount(await page.pdf({ format: 'A4', printBackground: true }))).toBe(1)
  })

  test('ولي الأمر: يرى كشف ابنته فقط', async ({ login, request }) => {
    const page = await login('p1@school.test')
    await page.goto('/grades')
    await expect(page.getByRole('tab')).toHaveCount(0)
    await expect(page.getByRole('button', { name: 'امتحان جديد' })).toHaveCount(0)
    await page.fill('#rc_year', '2025-2026')
    await expect(page.getByText('عمر حسن')).toHaveCount(0)
    await page.getByRole('button', { name: 'عرض الكشف' }).click()
    await expect(page.getByRole('dialog').getByTestId('rc-result')).toHaveText('ناجح')
    await expect(page.getByRole('dialog')).not.toContainText('سري جدًا')
    await page.keyboard.press('Escape')
    await pick(page, 'الفصل الدراسي', 'الفصل الثاني')
    await page.getByRole('button', { name: 'عرض الكشف' }).click()
    await expect(page.getByText('لم يُنشر كشف الدرجات لهذا الفصل بعد.')).toBeVisible()

    // الخادم نفسه يرفض ابنًا غير مربوط (لا يكفي إخفاء الواجهة)
    const token = await apiToken(request, 'p1@school.test')
    const other = await request.get(`http://127.0.0.1:8100/api/v1/guardian/students/2/report-card?term=first&academic_year=2025-2026`, {
      headers: { Authorization: `Bearer ${token}` },
    })
    expect(other.status()).toBe(404)
  })
})
