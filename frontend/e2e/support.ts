import { expect, test as base, type APIRequestContext, type Page } from '@playwright/test'

export const API_ORIGIN = 'http://127.0.0.1:8100'
export const API = `${API_ORIGIN}/api/v1`
export const PASSWORD = 'Passw0rd!'

/** إعادة بناء قاعدة الاختبار وبذرها (يوفّرها scripts/e2e_server.py فقط). */
export async function resetDb(request: APIRequestContext) {
  const response = await request.post(`${API_ORIGIN}/__e2e__/reset`)
  expect(response.ok(), 'إعادة ضبط قاعدة E2E').toBeTruthy()
}

export async function apiToken(request: APIRequestContext, email: string): Promise<string> {
  const response = await request.post(`${API}/auth/login`, { form: { username: email, password: PASSWORD } })
  expect(response.ok(), `دخول ${email}`).toBeTruthy()
  return (await response.json()).access_token
}

/** طلب API مُصادَق؛ يفشل الاختبار برسالة واضحة إن لم ينجح. */
export async function api<T = any>(
  request: APIRequestContext,
  token: string,
  method: 'get' | 'post' | 'put' | 'patch',
  path: string,
  data?: unknown,
): Promise<T> {
  const response = await request[method](`${API}${path}`, { headers: { Authorization: `Bearer ${token}` }, data })
  expect(response.ok(), `${method.toUpperCase()} ${path} → ${response.status()} ${await response.text()}`).toBeTruthy()
  return response.json()
}

export const isoDaysAgo = (days: number) => new Date(Date.now() - days * 864e5).toISOString().slice(0, 10)
export const todayIso = () => new Date().toISOString().slice(0, 10)

export async function pick(page: Page, label: string, option: string | RegExp) {
  await page.getByLabel(label, { exact: true }).click()
  await page.getByRole('option', { name: option }).first().click()
}

/** أبعاد الصفحة (pt) من بداية ملف PDF، وعدد صفحاته. */
export const pdfMediaBox = (pdf: Buffer): [number, number] => {
  const match = /\/MediaBox\s*\[\s*0\s+0\s+([\d.]+)\s+([\d.]+)/.exec(pdf.toString('latin1'))
  if (!match) throw new Error('MediaBox not found')
  return [Number(match[1]), Number(match[2])]
}
export const pdfPageCount = (pdf: Buffer) => (pdf.toString('latin1').match(/\/Type\s*\/Page[^s]/g) ?? []).length

type Fixtures = { login: (email: string) => Promise<Page> }

/** كل اختبار يفتح جلساته عبر login(email)، ويفشل إن ظهر أي خطأ JavaScript أو console.error. */
export const test = base.extend<Fixtures>({
  login: async ({ browser }, provide) => {
    const errors: string[] = []
    const contexts: Awaited<ReturnType<typeof browser.newContext>>[] = []
    await provide(async (email: string) => {
      const context = await browser.newContext({ locale: 'ar', viewport: { width: 1400, height: 900 } })
      contexts.push(context)
      const page = await context.newPage()
      page.on('pageerror', (e) => errors.push(`${email}: ${e.message}`))
      page.on('console', (m) => {
        // أخطاء الشبكة المتوقعة (403/404 الاختبارية) تظهر كـ "Failed to load resource" فنتجاهلها
        if (m.type() === 'error' && !m.text().includes('Failed to load resource')) errors.push(`${email}: ${m.text()}`)
      })
      await page.goto('/login')
      await page.fill('#email', email)
      await page.fill('#password', PASSWORD)
      await page.click('button[type=submit]')
      await page.waitForURL((url) => !url.pathname.startsWith('/login'))
      return page
    })
    for (const context of contexts) await context.close()
    expect(errors, 'أخطاء المتصفح').toEqual([])
  },
})

export { expect }
