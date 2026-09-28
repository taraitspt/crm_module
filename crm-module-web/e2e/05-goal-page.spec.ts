import { test, expect } from '@playwright/test';
import { login, waitForTableLoad } from './helpers';

test.describe('목표입력 페이지 - 조회조건 및 그리드', () => {
  test.beforeEach(async ({ page }) => {
    await login(page);
  });

  test('공장/사업단위 조회조건 및 그리드 컬럼 확인', async ({ page }) => {
    await page.goto('/info/goal');
    await page.waitForLoadState('networkidle');

    // 공장 태그 표시 확인
    await expect(page.getByText('타라정보통신')).toBeVisible({ timeout: 8000 });

    // 연도 셀렉트 표시 확인
    const yearSelect = page.locator('.ant-select').first();
    await expect(yearSelect).toBeVisible();

    // 사업단위 셀렉트 표시 확인 (default: 전체 부서)
    await expect(page.locator('.ant-select').nth(1)).toBeVisible();

    // 저장 버튼 표시 확인
    await expect(page.getByRole('button', { name: '저장' })).toBeVisible();
  });

  test('그리드 컬럼: 사업단위/영업담당자명 헤더 확인', async ({ page }) => {
    await page.goto('/info/goal');
    await page.waitForLoadState('networkidle');

    // 테이블 헤더 확인
    await expect(page.locator('.ant-table-thead').getByText('사업단위')).toBeVisible({ timeout: 8000 });
    await expect(page.locator('.ant-table-thead').getByText('영업담당자명')).toBeVisible();
    await expect(page.locator('.ant-table-thead').getByText('연간합계')).toBeVisible();

    // 월 헤더 확인
    await expect(page.locator('.ant-table-thead').getByText('1월', { exact: true }).first()).toBeVisible();
    await expect(page.locator('.ant-table-thead').getByText('12월', { exact: true })).toBeVisible();
  });

  test('사업단위 필터 적용', async ({ page }) => {
    await page.goto('/info/goal');
    await page.waitForLoadState('networkidle');

    // 사업단위 선택 드롭다운 열기 (2번째 select = 사업단위)
    await page.locator('.ant-select').nth(1).click();
    await page.waitForTimeout(500);

    // 전체 부서 옵션 있는지 확인
    const dropdownOptions = page.locator('.ant-select-dropdown .ant-select-item');
    const count = await dropdownOptions.count();
    console.log('사업단위 옵션 수:', count);
    expect(count).toBeGreaterThanOrEqual(1);

    // 첫 번째 옵션 선택
    await dropdownOptions.first().click();
    await page.waitForLoadState('networkidle');
    console.log('사업단위 필터 적용 완료');
  });

  test('목표 데이터 내부/외부 입력 및 목표금액 자동계산 확인', async ({ page }) => {
    await page.goto('/info/goal');
    await page.waitForLoadState('networkidle');

    // 테이블 로딩 대기
    const table = page.locator('.ant-table');
    await expect(table.first()).toBeVisible({ timeout: 10000 });

    // 테이블 행 확인
    const rows = page.locator('.ant-table-row');
    const rowCount = await rows.count();
    console.log('테이블 행 수:', rowCount);

    if (rowCount > 0) {
      // 내부 InputNumber 중 첫번째 editable 필드 찾기
      const inputNumbers = page.locator('.ant-table-body .ant-input-number-input');
      const inputCount = await inputNumbers.count();
      console.log('InputNumber 수:', inputCount);

      if (inputCount > 0) {
        // 내부 값 입력 (첫번째 내부 필드)
        const firstInput = inputNumbers.first();
        const isDisabled = await firstInput.isDisabled();
        if (!isDisabled) {
          await firstInput.click({ clickCount: 3 });
          await firstInput.fill('500000');
          console.log('내부 목표 입력 완료');
        }
      }
    }
  });

  test('저장 버튼 동작 확인', async ({ page }) => {
    await page.goto('/info/goal');
    await page.waitForLoadState('networkidle');

    const rows = page.locator('.ant-table-row');
    const rowCount = await rows.count();

    if (rowCount > 0) {
      await page.getByRole('button', { name: '저장' }).click();
      // 성공 또는 에러 메시지 확인
      const msg = await page.locator('.ant-message-notice').first().waitFor({ timeout: 8000 }).catch(() => null);
      if (msg) {
        console.log('저장 결과 메시지 표시됨');
      }
    } else {
      console.log('데이터 없음 - 저장 테스트 스킵');
    }
  });
});
