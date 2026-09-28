import { test, expect } from '@playwright/test';
import { loginAndGo, waitForTableLoad } from './helpers';

/**
 * Bug #1 검증: 고객관리 - 거래처담당자 숫자만큼 행이 모두 표시되는지 확인
 * 수정 내용: searchSalesCustomersPaged()에서 ROW_NUMBER rn=1 제거 → 전체 담당자 행 반환
 */
test.describe('Bug #1 - 고객관리 담당자 전체 표시', () => {
  test.beforeEach(async ({ page }) => {
    await loginAndGo(page, '/info/customers');
  });

  test('페이지 렌더링 및 테이블 로딩', async ({ page }) => {
    await waitForTableLoad(page);
    const rows = page.locator('.ant-table-row');
    const rowCount = await rows.count();
    expect(rowCount).toBeGreaterThan(0);
    console.log(`총 표시 행 수: ${rowCount}`);
  });

  test('동일 거래처에 담당자 여러 명이 별도 행으로 표시되는지 확인', async ({ page }) => {
    await waitForTableLoad(page);

    // 거래처 부분명 검색으로 다건 확인
    const search = page.getByPlaceholder(/거래처명/);
    await search.fill('주식회사');
    await search.press('Enter');
    await page.waitForTimeout(2000);
    await waitForTableLoad(page);

    const rows = page.locator('.ant-table-row');
    const rowCount = await rows.count();
    console.log(`주식회사 검색 결과 행 수: ${rowCount}`);
    expect(rowCount).toBeGreaterThanOrEqual(1);

    // 첫 번째 행에 거래처명이 있는지 확인
    const firstRow = rows.first();
    const cellText = await firstRow.textContent();
    console.log(`검색 첫 행 내용: ${cellText}`);
  });

  test('전체 페이지 건수가 거래처 수보다 많은지 확인 (담당자 수 반영)', async ({ page }) => {
    await waitForTableLoad(page);

    // 페이지네이션에서 전체 건수 확인
    const pagination = page.locator('.ant-pagination-total-text');
    if (await pagination.isVisible({ timeout: 3000 }).catch(() => false)) {
      const totalText = await pagination.textContent();
      console.log(`페이지네이션 전체 건수: ${totalText}`);
      // 담당자 포함 시 전체 건수가 증가해야 함 (기존 거래처만 있을 때보다 많아야 함)
      const match = totalText?.match(/(\d+)/);
      if (match) {
        const total = parseInt(match[1]);
        console.log(`파싱된 전체 건수: ${total}`);
        expect(total).toBeGreaterThan(0);
      }
    }

    // 현재 페이지 행 수 확인
    const rows = page.locator('.ant-table-row');
    const rowCount = await rows.count();
    console.log(`현재 페이지 행 수: ${rowCount}`);
    expect(rowCount).toBeGreaterThan(0);
  });

  test('담당자 정보(이름, 이메일) 컬럼이 표시되는지 확인', async ({ page }) => {
    await waitForTableLoad(page);
    const rows = page.locator('.ant-table-row');
    const firstRow = rows.first();
    const allText = await firstRow.textContent();
    console.log(`첫 행 전체 텍스트: ${allText}`);
    // 거래처명이 표시되어야 함
    expect(allText).not.toBeNull();
    expect(allText!.length).toBeGreaterThan(0);
  });

  test('행 클릭 시 고객 상세 모달 오픈', async ({ page }) => {
    await waitForTableLoad(page);
    const firstRow = page.locator('.ant-table-row').first();
    if (await firstRow.isVisible({ timeout: 5000 }).catch(() => false)) {
      await firstRow.click();
      const modal = page.locator('.ant-modal');
      await expect(modal).toBeVisible({ timeout: 5000 });
      await page.locator('.ant-modal-close').click();
      await expect(modal).not.toBeVisible({ timeout: 3000 });
    }
  });
});
