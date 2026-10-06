import { defineConfig } from '@playwright/test'

/**
 * اختبارات الواجهة الشاملة (E2E) على متصفح حقيقي.
 * منافذ مستقلة عن التطوير اليومي (API: 8100، الواجهة: 5174) وقاعدة بيانات مؤقتة تُعاد بذرها قبل كل ملف.
 *
 *   npm run test:e2e
 *
 * متغيرات اختيارية:  E2E_PYTHON (مفسّر بايثون فيه requirements)،  CHROMIUM_PATH (متصفح جاهز بدل المثبَّت).
 */
const API_PORT = 8100
const WEB_PORT = 5174

export default defineConfig({
  testDir: './e2e',
  fullyParallel: false,
  workers: 1, // الملفات تشترك في خادم/قاعدة واحدة وتُعيد ضبطها بالتتابع
  retries: process.env.CI ? 1 : 0,
  timeout: 90_000,
  expect: { timeout: 10_000 },
  reporter: [['list'], ['html', { open: 'never' }]],
  outputDir: './test-results',
  use: {
    baseURL: `http://127.0.0.1:${WEB_PORT}`,
    locale: 'ar',
    viewport: { width: 1400, height: 900 },
    trace: 'retain-on-failure',
    screenshot: 'only-on-failure',
    launchOptions: {
      args: ['--no-sandbox'],
      executablePath: process.env.CHROMIUM_PATH || undefined,
    },
  },
  webServer: [
    {
      command: `${process.env.E2E_PYTHON ?? 'python3'} scripts/e2e_server.py`,
      cwd: '../backend',
      url: `http://127.0.0.1:${API_PORT}/`,
      reuseExistingServer: !process.env.CI,
      timeout: 60_000,
      env: {
        E2E_MODE: '1',
        E2E_API_PORT: String(API_PORT),
        CORS_ORIGINS: `["http://127.0.0.1:${WEB_PORT}"]`,
        DATABASE_URL: 'sqlite:///./e2e.db',
      },
    },
    {
      command: `npm run dev -- --port ${WEB_PORT} --strictPort`,
      url: `http://127.0.0.1:${WEB_PORT}`,
      reuseExistingServer: !process.env.CI,
      timeout: 60_000,
      env: { VITE_API_URL: `http://127.0.0.1:${API_PORT}/api/v1` },
    },
  ],
})
