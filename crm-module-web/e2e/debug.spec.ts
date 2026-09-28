/**
 * 진단용 디버그 테스트 - 실제 페이지 렌더링 상태 확인
 */
import { test, expect } from '@playwright/test';

test('페이지 렌더링 진단', async ({ page }) => {
  const consoleErrors: string[] = [];
  const networkErrors: string[] = [];

  page.on('console', (msg) => {
    if (msg.type() === 'error') consoleErrors.push(msg.text());
  });
  page.on('pageerror', (err) => consoleErrors.push(`[pageerror] ${err.message}`));
  page.on('requestfailed', (req) => networkErrors.push(`${req.failure()?.errorText} ${req.url()}`));

  // 1. 페이지 로드 (networkidle 대기)
  await page.goto('https://grow.taratps.com/login', { waitUntil: 'networkidle', timeout: 30000 });

  // 2. 현재 URL 확인
  console.log('현재 URL:', page.url());

  // 3. 페이지 타이틀 확인
  const title = await page.title();
  console.log('페이지 타이틀:', title);

  // 4. 루트 div 내용 확인
  const rootHTML = await page.locator('#root').innerHTML().catch(() => 'ROOT NOT FOUND');
  console.log('root innerHTML 길이:', rootHTML.length);
  console.log('root innerHTML 미리보기:', rootHTML.substring(0, 300));

  // 5. 스크린샷 저장
  await page.screenshot({ path: 'screenshots/debug_login.png', fullPage: true });

  // 6. h1, h2 요소들 확인
  const headings = await page.locator('h1, h2, h3').allTextContents();
  console.log('Headings found:', headings);

  // 7. input 요소들 확인
  const inputs = await page.locator('input').all();
  console.log('Inputs count:', inputs.length);
  for (const inp of inputs) {
    const ph = await inp.getAttribute('placeholder');
    const type = await inp.getAttribute('type');
    console.log(`  Input: type=${type}, placeholder=${ph}`);
  }

  // 8. 버튼들 확인
  const buttons = await page.locator('button').allTextContents();
  console.log('Buttons:', buttons);

  // 9. 에러 리포트
  if (consoleErrors.length > 0) {
    console.log('콘솔 에러:', consoleErrors);
  }
  if (networkErrors.length > 0) {
    console.log('네트워크 에러:', networkErrors);
  }

  // 페이지가 무언가 렌더링 됐는지 확인
  const bodyText = await page.locator('body').innerText().catch(() => '');
  console.log('Body text 미리보기:', bodyText.substring(0, 200));

  expect(rootHTML.length).toBeGreaterThan(100);
});
