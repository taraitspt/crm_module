import { Page, expect } from '@playwright/test';

/** 로그인 수행 */
export async function login(page: Page, employeeNo = 'EMP001', password = 'admin123') {
  await page.goto('/login');
  await page.getByPlaceholder('사원번호를 입력하세요').fill(employeeNo);
  await page.getByPlaceholder('비밀번호를 입력하세요').fill(password);
  await page.getByRole('button', { name: '로그인' }).click();
  await page.waitForURL('/', { timeout: 15000 });
}

/** 로그인 후 특정 페이지로 이동 */
export async function loginAndGo(page: Page, path: string) {
  await login(page);
  if (path !== '/') {
    await page.goto(path);
    await page.waitForURL(path, { timeout: 10000 });
  }
}

/** 테이블 로딩 완료 대기 */
export async function waitForTableLoad(page: Page) {
  // 스피너가 사라질 때까지 대기
  await page.locator('.ant-spin-spinning').waitFor({ state: 'hidden', timeout: 15000 }).catch(() => {});
  // 테이블이 보일 때까지 대기
  await expect(page.locator('.ant-table')).toBeVisible({ timeout: 10000 });
}

/** 모달이 열릴 때까지 대기 */
export async function waitForModal(page: Page, title?: string) {
  if (title) {
    await expect(page.locator('.ant-modal').filter({ hasText: title })).toBeVisible({ timeout: 10000 });
  } else {
    await expect(page.locator('.ant-modal-content')).toBeVisible({ timeout: 10000 });
  }
}

/** Ant Design message 확인 */
export async function expectMessage(page: Page, type: 'success' | 'error' | 'warning' | 'info' = 'success') {
  await expect(page.locator(`.ant-message-${type}`).or(page.locator('.ant-message'))).toBeVisible({ timeout: 10000 });
}

/** 페이지 에러 수집 헬퍼 */
export function collectPageErrors(page: Page): string[] {
  const errors: string[] = [];
  page.on('pageerror', (err) => errors.push(err.message));
  return errors;
}
