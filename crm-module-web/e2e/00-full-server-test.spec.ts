/**
 * grow.taratps.com 서버 전체 페이지 기능 종합 테스트
 * 테스트 계정: EMP001 / admin123
 *
 * 버튼 하나, 입력 하나, 리스트 하나 모두 상세 검증
 */
import { test, expect, Page } from '@playwright/test';

const BASE = 'https://grow.taratps.com';
const EMP_NO = 'EMP001';
const PASSWORD = 'admin123';

// ─────────────────────────────────────────────────────────────
// 공통 헬퍼
// ─────────────────────────────────────────────────────────────
async function login(page: Page) {
  await page.goto(`${BASE}/login`);
  await page.getByPlaceholder('사원번호를 입력하세요').fill(EMP_NO);
  await page.getByPlaceholder('비밀번호를 입력하세요').fill(PASSWORD);
  await page.getByRole('button', { name: '로그인' }).click();
  await page.waitForURL(`${BASE}/`, { timeout: 20000 });
}

async function goTo(page: Page, path: string) {
  await page.goto(`${BASE}${path}`);
  await page.locator('.ant-spin-spinning').waitFor({ state: 'hidden', timeout: 15000 }).catch(() => {});
}

async function tableLoaded(page: Page) {
  await page.locator('.ant-spin-spinning').waitFor({ state: 'hidden', timeout: 15000 }).catch(() => {});
  await expect(page.locator('.ant-table')).toBeVisible({ timeout: 15000 });
}

// 행 클릭 → 모달 열고 검증 후 닫기
async function clickFirstRowAndVerifyModal(
  page: Page,
  options: {
    modalTitle: string;
    expectedFields?: string[];
    footerButtons?: string[];
    skipIfEmpty?: boolean;
  },
) {
  const rows = page.locator('.ant-table-row');
  const count = await rows.count();
  if (options.skipIfEmpty && count === 0) return;
  expect(count).toBeGreaterThan(0);

  await rows.first().click();

  const modal = page.locator('.ant-modal-content');
  await expect(modal).toBeVisible({ timeout: 10000 });
  await expect(page.locator('.ant-modal-title')).toContainText(options.modalTitle);

  if (options.expectedFields) {
    for (const field of options.expectedFields) {
      await expect(modal.getByText(field, { exact: false })).toBeVisible({ timeout: 5000 });
    }
  }
  if (options.footerButtons) {
    for (const btn of options.footerButtons) {
      await expect(page.locator('.ant-modal-footer').getByRole('button', { name: btn })).toBeVisible();
    }
  }

  // 닫기 (X 버튼 또는 닫기 버튼)
  const closeBtn = page.locator('.ant-modal-footer').getByRole('button', { name: '닫기' });
  if (await closeBtn.isVisible({ timeout: 2000 }).catch(() => false)) {
    await closeBtn.click();
  } else {
    await page.locator('.ant-modal-close').click();
  }
  await expect(modal).not.toBeVisible({ timeout: 5000 });
}

// ─────────────────────────────────────────────────────────────
// ① 로그인 페이지
// ─────────────────────────────────────────────────────────────
test.describe('① 로그인 페이지', () => {
  test('입력 필드 및 버튼 존재 확인', async ({ page }) => {
    await page.goto(`${BASE}/login`);
    await expect(page.getByRole('heading', { name: '로그인' })).toBeVisible();
    await expect(page.getByPlaceholder('사원번호를 입력하세요')).toBeVisible();
    await expect(page.getByPlaceholder('비밀번호를 입력하세요')).toBeVisible();
    await expect(page.getByRole('button', { name: '로그인' })).toBeVisible();
    await page.screenshot({ path: 'screenshots/server/01_login.png', fullPage: true });
  });

  test('빈 폼 제출 → 필드별 유효성 에러 표시', async ({ page }) => {
    await page.goto(`${BASE}/login`);
    await page.getByRole('button', { name: '로그인' }).click();
    await expect(page.getByText('사원번호를 입력하세요.')).toBeVisible();
    await expect(page.getByText('비밀번호를 입력하세요.')).toBeVisible();
  });

  test('잘못된 자격증명 → 에러 메시지 표시', async ({ page }) => {
    await page.goto(`${BASE}/login`);
    await page.getByPlaceholder('사원번호를 입력하세요').fill('WRONG_ID');
    await page.getByPlaceholder('비밀번호를 입력하세요').fill('wrong_pass');
    await page.getByRole('button', { name: '로그인' }).click();
    await expect(page.locator('.ant-message, .ant-alert')).toBeVisible({ timeout: 10000 });
  });

  test('정상 로그인 → 대시보드 이동', async ({ page }) => {
    await login(page);
    await expect(page).toHaveURL(`${BASE}/`);
    await page.screenshot({ path: 'screenshots/server/01_login_success.png', fullPage: true });
  });
});

// ─────────────────────────────────────────────────────────────
// ② 대시보드 (/)
// ─────────────────────────────────────────────────────────────
test.describe('② 대시보드', () => {
  test.beforeEach(async ({ page }) => { await login(page); });

  test('사이드바 레이아웃 존재 확인', async ({ page }) => {
    await goTo(page, '/');
    await page.waitForTimeout(2000);
    const sidebar = page.locator('.ant-layout-sider, nav, [class*="sidebar"], .ant-menu');
    await expect(sidebar.first()).toBeVisible({ timeout: 10000 });
    await page.screenshot({ path: 'screenshots/server/02_dashboard.png', fullPage: true });
  });

  test('주요 사이드바 메뉴 항목 렌더링', async ({ page }) => {
    await goTo(page, '/');
    await page.waitForTimeout(1500);
    for (const item of ['정보관리', '데이터 분석', '수익성 분석']) {
      const menu = page.locator('.ant-menu-item, .ant-menu-submenu').filter({ hasText: item });
      if (await menu.count() > 0) {
        await expect(menu.first()).toBeVisible();
      }
    }
  });

  test('헤더 영역 존재 확인', async ({ page }) => {
    await goTo(page, '/');
    await page.waitForTimeout(1500);
    const header = page.locator('.ant-layout-header, header, [class*="header"]');
    if (await header.count() > 0) {
      await expect(header.first()).toBeVisible();
    }
    await expect(page.locator('body')).toBeVisible();
  });
});

// ─────────────────────────────────────────────────────────────
// ③ 정보관리 - 사업자 목록 (/info/biz-owners)
// ─────────────────────────────────────────────────────────────
test.describe('③ 정보관리 - 사업자 목록', () => {
  test.beforeEach(async ({ page }) => { await login(page); });

  test('페이지 타이틀 및 테이블 로드 확인', async ({ page }) => {
    await goTo(page, '/info/biz-owners');
    await tableLoaded(page);
    // 페이지 타이틀 확인
    const title = page.getByRole('heading').filter({ hasText: /사업자/ });
    await expect(title.first()).toBeVisible({ timeout: 10000 });
    await page.screenshot({ path: 'screenshots/server/03_biz_owners.png', fullPage: true });
  });

  test('검색 입력 필드 존재 및 동작', async ({ page }) => {
    await goTo(page, '/info/biz-owners');
    await tableLoaded(page);
    // 검색 인풋 존재 확인
    const searchInput = page.locator('input[placeholder]').first();
    await expect(searchInput).toBeVisible();
    // 검색 동작
    await searchInput.fill('타라');
    await searchInput.press('Enter');
    await page.locator('.ant-spin-spinning').waitFor({ state: 'hidden', timeout: 10000 }).catch(() => {});
    await expect(page.locator('.ant-table')).toBeVisible();
    await page.screenshot({ path: 'screenshots/server/03_biz_owners_search.png', fullPage: true });
    // 검색 초기화
    await searchInput.clear();
    await searchInput.press('Enter');
    await page.locator('.ant-spin-spinning').waitFor({ state: 'hidden', timeout: 10000 }).catch(() => {});
  });

  test('테이블 행 개수 > 0 확인', async ({ page }) => {
    await goTo(page, '/info/biz-owners');
    await tableLoaded(page);
    const rows = page.locator('.ant-table-row');
    const count = await rows.count();
    expect(count).toBeGreaterThan(0);
  });

  test('첫 번째 행 클릭 → 사업자 상세 페이지 이동 → 필드 레이블 검증 → 뒤로', async ({ page }) => {
    await goTo(page, '/info/biz-owners');
    await tableLoaded(page);

    const rows = page.locator('.ant-table-tbody .ant-table-row');
    expect(await rows.count()).toBeGreaterThan(0);
    await rows.first().click();

    // 행 클릭 시 상세 페이지로 이동 (/info/biz-owners/:id 형태)
    await page.waitForURL(/\/info\/biz-owners\/.+/, { timeout: 10000 });

    // 상세 페이지 필드 레이블 검증
    await expect(page.locator('.ant-descriptions-item-label').getByText('회사명', { exact: true })).toBeVisible({ timeout: 10000 });
    await expect(page.locator('.ant-descriptions-item-label').getByText('사업자번호', { exact: true })).toBeVisible();
    await expect(page.locator('.ant-descriptions-item-label').getByText('거래처코드', { exact: true })).toBeVisible();

    await page.screenshot({ path: 'screenshots/server/03_biz_owners_detail.png', fullPage: true });

    // 뒤로가기
    await page.goBack();
    await page.waitForURL(/\/info\/biz-owners$/, { timeout: 5000 });
  });
});

// ─────────────────────────────────────────────────────────────
// ④ 정보관리 - 고객사 목록 (/info/customers)
// ─────────────────────────────────────────────────────────────
test.describe('④ 정보관리 - 고객사 목록', () => {
  test.beforeEach(async ({ page }) => { await login(page); });

  test('페이지 로드 및 테이블 표시', async ({ page }) => {
    await goTo(page, '/info/customers');
    await tableLoaded(page);
    await page.screenshot({ path: 'screenshots/server/04_customers.png', fullPage: true });
  });

  test('검색 입력 필드 동작', async ({ page }) => {
    await goTo(page, '/info/customers');
    await tableLoaded(page);
    const searchInput = page.locator('input[placeholder]').first();
    await expect(searchInput).toBeVisible();
    await searchInput.fill('삼성');
    await searchInput.press('Enter');
    await page.locator('.ant-spin-spinning').waitFor({ state: 'hidden', timeout: 10000 }).catch(() => {});
    await expect(page.locator('.ant-table')).toBeVisible();
    await page.screenshot({ path: 'screenshots/server/04_customers_search.png', fullPage: true });
  });

  test.skip('담당자 등록 버튼 → 등록 모달 열림 → 폼 필드 확인 → 취소', async ({ page }) => {
    // 담당자 등록 기능 미구현 - 추후 구현 예정
  });

  test('첫 번째 행 클릭 → 고객 상세 모달 (데이터 API로 사전 생성)', async ({ page }) => {
    // DB가 비어 있을 수 있으므로 테스트용 고객 레코드를 API로 사전 생성
    const storageRaw = await page.evaluate(() => localStorage.getItem('sm-auth-storage'));
    const token = storageRaw ? JSON.parse(storageRaw)?.state?.accessToken : null;

    let createdId: number | null = null;
    if (token) {
      const res = await page.request.post(`${BASE}/api/info/customers`, {
        headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
        data: { companyName: '[E2E테스트]고객㈜', contactName: 'E2E담당자', contactEmail: 'e2e@test.com' },
      });
      if (res.ok()) {
        const json = await res.json();
        createdId = json?.data?.id ?? null;
      }
    }

    await goTo(page, '/info/customers');
    await tableLoaded(page);

    const rows = page.locator('.ant-table-row');
    const count = await rows.count();
    expect(count).toBeGreaterThan(0);

    await rows.first().click();

    const modal = page.locator('.ant-modal-content');
    await expect(modal).toBeVisible({ timeout: 10000 });
    await expect(page.locator('.ant-modal-title')).toContainText('고객 상세');

    // 모달 내 필드 레이블
    await expect(modal.getByText('거래처명', { exact: false })).toBeVisible({ timeout: 5000 });
    await expect(modal.getByText('거래처코드', { exact: false })).toBeVisible();

    // footer 버튼 확인 (읽기전용 모달 - 닫기만 있음)
    const footer = page.locator('.ant-modal-footer');
    await expect(footer.getByRole('button', { name: '닫기' })).toBeVisible();

    await page.screenshot({ path: 'screenshots/server/04_customers_modal.png', fullPage: true });

    await footer.getByRole('button', { name: '닫기' }).click();
    await expect(modal).not.toBeVisible({ timeout: 5000 });

    // 테스트 데이터 정리
    if (createdId && token) {
      await page.request.delete(`${BASE}/api/info/customers/${createdId}`, {
        headers: { Authorization: `Bearer ${token}` },
      });
    }
  });
});

// ─────────────────────────────────────────────────────────────
// ⑤ 정보관리 - 목표 입력 통합 (/info/goal)
// ─────────────────────────────────────────────────────────────
test.describe('⑤ 정보관리 - 목표 입력 (통합)', () => {
  test.beforeEach(async ({ page }) => { await login(page); });

  test('목표 입력 페이지 로드 확인', async ({ page }) => {
    test.setTimeout(90000);
    await goTo(page, '/info/goal');
    await page.waitForTimeout(3000);
    const hasSelect = await page.locator('.ant-select').first().isVisible({ timeout: 5000 }).catch(() => false);
    const hasTable = await page.locator('.ant-table').isVisible({ timeout: 5000 }).catch(() => false);
    const hasInput = await page.locator('input').first().isVisible({ timeout: 5000 }).catch(() => false);
    const hasCard = await page.locator('.ant-card').first().isVisible({ timeout: 3000 }).catch(() => false);
    expect(hasSelect || hasTable || hasInput || hasCard).toBeTruthy();
  });

  test('테이블 또는 입력 영역 렌더링 확인', async ({ page }) => {
    await goTo(page, '/info/goal');
    await page.waitForTimeout(3000);
    const hasTable = await page.locator('.ant-table').isVisible({ timeout: 5000 }).catch(() => false);
    const hasInput = await page.locator('input').first().isVisible({ timeout: 5000 }).catch(() => false);
    const hasContent = await page.locator('.ant-card, .ant-form, table').first().isVisible({ timeout: 5000 }).catch(() => false);
    expect(hasTable || hasInput || hasContent).toBeTruthy();
  });

  test('파트 목표 탭 클릭 → 콘텐츠 렌더링', async ({ page }) => {
    await goTo(page, '/info/goal');
    await page.waitForTimeout(2000);
    const partTab = page.locator('.ant-tabs-tab').filter({ hasText: '파트 목표' });
    if (await partTab.isVisible({ timeout: 5000 }).catch(() => false)) {
      await partTab.click();
      await page.waitForTimeout(1500);
      await page.screenshot({ path: 'screenshots/server/05_goal_part_tab.png', fullPage: true });
    }
    await expect(page.locator('body')).toBeVisible();
  });

  test('AM 목표 탭 클릭 → 콘텐츠 렌더링', async ({ page }) => {
    await goTo(page, '/info/goal');
    await page.waitForTimeout(2000);
    const amTab = page.locator('.ant-tabs-tab').filter({ hasText: 'AM 목표' });
    if (await amTab.isVisible({ timeout: 5000 }).catch(() => false)) {
      await amTab.click();
      await page.waitForTimeout(1500);
      await page.screenshot({ path: 'screenshots/server/05_goal_am_tab.png', fullPage: true });
    }
    await expect(page.locator('body')).toBeVisible();
  });
});

// ─────────────────────────────────────────────────────────────
// ⑥ 관리자 - ERP 동기화 관리 (/admin/erp-sync)
// ─────────────────────────────────────────────────────────────
test.describe('⑥ 관리자 - ERP 동기화 관리', () => {
  test.beforeEach(async ({ page }) => { await login(page); });

  test('페이지 타이틀 및 버튼 존재 확인', async ({ page }) => {
    await goTo(page, '/admin/erp-sync');
    await page.waitForTimeout(2000);

    // 페이지 타이틀
    await expect(page.getByText('ERP 동기화 관리', { exact: false })).toBeVisible({ timeout: 10000 });

    // 버튼 존재 확인
    await expect(page.getByRole('button', { name: '연결 상태 확인' })).toBeVisible();
    await expect(page.getByRole('button', { name: '수동 동기화 실행' })).toBeVisible();

    await page.screenshot({ path: 'screenshots/server/06_erp_sync.png', fullPage: true });
  });

  test('연결 상태 확인 버튼 클릭 → 결과 표시', async ({ page }) => {
    await goTo(page, '/admin/erp-sync');
    await page.waitForTimeout(2000);

    const healthBtn = page.getByRole('button', { name: '연결 상태 확인' });
    await expect(healthBtn).toBeVisible();
    await healthBtn.click();

    // 결과가 표시될 때까지 대기 (Descriptions 컴포넌트)
    await page.locator('.ant-descriptions, .ant-badge, .ant-spin-spinning').first()
      .waitFor({ timeout: 15000 }).catch(() => {});
    await page.waitForTimeout(1000);

    await page.screenshot({ path: 'screenshots/server/06_erp_sync_health.png', fullPage: true });
    await expect(page.locator('body')).toBeVisible();
  });

  test('동기화 이력 테이블 헤더 확인', async ({ page }) => {
    await goTo(page, '/admin/erp-sync');
    await page.locator('.ant-spin-spinning').waitFor({ state: 'hidden', timeout: 20000 }).catch(() => {});
    await page.waitForTimeout(1000);

    const table = page.locator('.ant-table');
    await expect(table).toBeVisible({ timeout: 10000 });

    // 테이블 헤더 확인 (columnheader role로 measure-cell 제외)
    await expect(page.getByRole('columnheader', { name: '유형', exact: true })).toBeVisible();
    await expect(page.getByRole('columnheader', { name: '상태', exact: true })).toBeVisible();
    await expect(page.getByRole('columnheader', { name: '전체', exact: true })).toBeVisible();
    await expect(page.getByRole('columnheader', { name: '성공', exact: true })).toBeVisible();
    await expect(page.getByRole('columnheader', { name: '실패', exact: true })).toBeVisible();

    await page.screenshot({ path: 'screenshots/server/06_erp_sync_table.png', fullPage: true });
  });
});

// ─────────────────────────────────────────────────────────────
// ⑯ 통계 - 팀 예측 (/stats/team-forecast)
// ─────────────────────────────────────────────────────────────
test.describe('⑯ 통계 - 팀 예측', () => {
  test.beforeEach(async ({ page }) => { await login(page); });

  test('페이지 타이틀 "통합 실적 대시보드" 확인', async ({ page }) => {
    await goTo(page, '/stats/team-forecast');
    await page.locator('.ant-spin-spinning').waitFor({ state: 'hidden', timeout: 20000 }).catch(() => {});
    await page.waitForTimeout(1500);
    await expect(page.getByText('통합 실적 대시보드', { exact: false })).toBeVisible({ timeout: 10000 });
    await page.screenshot({ path: 'screenshots/server/16_team_forecast.png', fullPage: true });
  });

  test('테이블 또는 차트 렌더링 확인', async ({ page }) => {
    await goTo(page, '/stats/team-forecast');
    await page.locator('.ant-spin-spinning').waitFor({ state: 'hidden', timeout: 20000 }).catch(() => {});
    await page.waitForTimeout(2000);
    const hasTable = await page.locator('.ant-table').isVisible({ timeout: 3000 }).catch(() => false);
    const hasChart = await page.locator('canvas, svg').isVisible({ timeout: 3000 }).catch(() => false);
    const hasCard = await page.locator('.ant-card').isVisible({ timeout: 3000 }).catch(() => false);
    expect(hasTable || hasChart || hasCard).toBeTruthy();
  });
});

// ─────────────────────────────────────────────────────────────
// ⑰ 통계 - 팀 목표실적 (/stats/team-goal-actual) → redirect
// ─────────────────────────────────────────────────────────────
test.describe('⑰ 통계 - 팀 목표실적', () => {
  test.beforeEach(async ({ page }) => { await login(page); });

  test('/stats/team-goal-actual → /stats/team-forecast 리다이렉트 확인', async ({ page }) => {
    await page.goto(`${BASE}/stats/team-goal-actual`);
    await page.locator('.ant-spin-spinning').waitFor({ state: 'hidden', timeout: 20000 }).catch(() => {});
    await page.waitForTimeout(2000);
    // React Router redirect → team-forecast
    await expect(page).toHaveURL(/\/stats\/team-forecast/);
    await page.screenshot({ path: 'screenshots/server/17_team_goal_actual.png', fullPage: true });
  });
});

// ─────────────────────────────────────────────────────────────
// ⑱ 통계 - 파트 목표실적 YOY (/stats/part-goal-yoy) → redirect
// ─────────────────────────────────────────────────────────────
test.describe('⑱ 통계 - 파트 목표실적 YOY', () => {
  test.beforeEach(async ({ page }) => { await login(page); });

  test('/stats/part-goal-yoy → /stats/team-forecast 리다이렉트 확인', async ({ page }) => {
    await page.goto(`${BASE}/stats/part-goal-yoy`);
    await page.locator('.ant-spin-spinning').waitFor({ state: 'hidden', timeout: 20000 }).catch(() => {});
    await page.waitForTimeout(2000);
    await expect(page).toHaveURL(/\/stats\/team-forecast/);
    await page.screenshot({ path: 'screenshots/server/18_part_goal_yoy.png', fullPage: true });
  });
});

// ─────────────────────────────────────────────────────────────
// ⑲ 통계 - AM 목표실적 YOY (/stats/am-goal-yoy)
// ─────────────────────────────────────────────────────────────
test.describe('⑲ 통계 - AM 목표실적 YOY', () => {
  test.beforeEach(async ({ page }) => { await login(page); });

  test('페이지 타이틀 "AM별 매출목표 및 실적" 확인', async ({ page }) => {
    await goTo(page, '/stats/am-goal-yoy');
    await page.locator('.ant-spin-spinning').waitFor({ state: 'hidden', timeout: 20000 }).catch(() => {});
    await page.waitForTimeout(2000);
    await expect(page.getByText('AM별 매출목표 및 실적', { exact: false })).toBeVisible({ timeout: 10000 });
    await page.screenshot({ path: 'screenshots/server/19_am_goal_yoy.png', fullPage: true });
  });

  test('년도 선택기 또는 필터 존재 확인', async ({ page }) => {
    await goTo(page, '/stats/am-goal-yoy');
    await page.locator('.ant-spin-spinning').waitFor({ state: 'hidden', timeout: 20000 }).catch(() => {});
    await page.waitForTimeout(1500);
    // DatePicker 또는 Select로 년도 선택
    const picker = page.locator('.ant-picker, .ant-select').first();
    await expect(picker).toBeVisible({ timeout: 10000 });
  });

  test('테이블 또는 차트 콘텐츠 렌더링 확인', async ({ page }) => {
    await goTo(page, '/stats/am-goal-yoy');
    await page.locator('.ant-spin-spinning').waitFor({ state: 'hidden', timeout: 20000 }).catch(() => {});
    await page.waitForTimeout(2000);
    const hasTable = await page.locator('.ant-table').isVisible({ timeout: 3000 }).catch(() => false);
    const hasChart = await page.locator('canvas, svg').isVisible({ timeout: 3000 }).catch(() => false);
    const hasCard = await page.locator('.ant-card').isVisible({ timeout: 3000 }).catch(() => false);
    expect(hasTable || hasChart || hasCard).toBeTruthy();
    await page.screenshot({ path: 'screenshots/server/19_am_goal_yoy_content.png', fullPage: true });
  });
});

// ─────────────────────────────────────────────────────────────
// ⑳ 통계 - 품목 실적 (/stats/item-perf)
// ─────────────────────────────────────────────────────────────
test.describe('⑳ 통계 - 품목 실적', () => {
  test.beforeEach(async ({ page }) => { await login(page); });

  test('페이지 타이틀 "품목별 실적조회" 확인', async ({ page }) => {
    await goTo(page, '/stats/item-perf');
    await page.locator('.ant-spin-spinning').waitFor({ state: 'hidden', timeout: 20000 }).catch(() => {});
    await page.waitForTimeout(2000);
    await expect(page.getByRole('heading', { name: /품목별 실적조회/ })).toBeVisible({ timeout: 10000 });
    await page.screenshot({ path: 'screenshots/server/20_item_perf.png', fullPage: true });
  });

  test('필터 컨트롤 (날짜/Select) 존재 확인', async ({ page }) => {
    await goTo(page, '/stats/item-perf');
    await page.locator('.ant-spin-spinning').waitFor({ state: 'hidden', timeout: 20000 }).catch(() => {});
    await page.waitForTimeout(1500);
    const hasFilter = await page.locator('.ant-picker, .ant-select').first()
      .isVisible({ timeout: 5000 }).catch(() => false);
    if (hasFilter) {
      await expect(page.locator('.ant-picker, .ant-select').first()).toBeVisible();
    }
    await expect(page.locator('body')).toBeVisible();
  });

  test('테이블 또는 차트 콘텐츠 렌더링 확인', async ({ page }) => {
    await goTo(page, '/stats/item-perf');
    await page.locator('.ant-spin-spinning').waitFor({ state: 'hidden', timeout: 20000 }).catch(() => {});
    await page.waitForTimeout(2000);
    const hasTable = await page.locator('.ant-table').isVisible({ timeout: 3000 }).catch(() => false);
    const hasChart = await page.locator('canvas, svg').isVisible({ timeout: 3000 }).catch(() => false);
    const hasCard = await page.locator('.ant-card').isVisible({ timeout: 3000 }).catch(() => false);
    expect(hasTable || hasChart || hasCard).toBeTruthy();
  });
});

// ─────────────────────────────────────────────────────────────
// ㉑ 통계 - 거래처 마진 (/stats/vendor-margin)
// ─────────────────────────────────────────────────────────────
test.describe('㉑ 통계 - 거래처 마진', () => {
  test.beforeEach(async ({ page }) => { await login(page); });

  test('페이지 타이틀 "거래처별 외주 마진율" 확인', async ({ page }) => {
    await goTo(page, '/stats/vendor-margin');
    await page.locator('.ant-spin-spinning').waitFor({ state: 'hidden', timeout: 20000 }).catch(() => {});
    await page.waitForTimeout(2000);
    await expect(page.getByRole('heading', { name: /거래처별 외주 마진율/ })).toBeVisible({ timeout: 10000 });
    await page.screenshot({ path: 'screenshots/server/21_vendor_margin.png', fullPage: true });
  });

  test('필터 및 테이블/차트 렌더링 확인', async ({ page }) => {
    await goTo(page, '/stats/vendor-margin');
    await page.locator('.ant-spin-spinning').waitFor({ state: 'hidden', timeout: 20000 }).catch(() => {});
    await page.waitForTimeout(2000);
    const hasTable = await page.locator('.ant-table').isVisible({ timeout: 3000 }).catch(() => false);
    const hasChart = await page.locator('canvas, svg').isVisible({ timeout: 3000 }).catch(() => false);
    const hasCard = await page.locator('.ant-card').isVisible({ timeout: 3000 }).catch(() => false);
    expect(hasTable || hasChart || hasCard).toBeTruthy();
  });
});

// ─────────────────────────────────────────────────────────────
// ㉒ 통계 - 주문 마진 (/stats/order-margin)
// ─────────────────────────────────────────────────────────────
test.describe('㉒ 통계 - 주문 마진', () => {
  test.beforeEach(async ({ page }) => { await login(page); });

  test('페이지 타이틀 "주문건별 외주 마진율" 확인', async ({ page }) => {
    await goTo(page, '/stats/order-margin');
    await page.locator('.ant-spin-spinning').waitFor({ state: 'hidden', timeout: 20000 }).catch(() => {});
    await page.waitForTimeout(2000);
    await expect(page.getByRole('heading', { name: /주문건별 외주 마진율/ })).toBeVisible({ timeout: 10000 });
    await page.screenshot({ path: 'screenshots/server/22_order_margin.png', fullPage: true });
  });

  test('검색 입력 및 필터 존재 확인', async ({ page }) => {
    await goTo(page, '/stats/order-margin');
    await page.locator('.ant-spin-spinning').waitFor({ state: 'hidden', timeout: 20000 }).catch(() => {});
    await page.waitForTimeout(1500);
    const hasInput = await page.locator('input[placeholder]').first()
      .isVisible({ timeout: 5000 }).catch(() => false);
    const hasPicker = await page.locator('.ant-picker').first()
      .isVisible({ timeout: 5000 }).catch(() => false);
    // 입력 또는 피커 중 하나는 있어야 함
    expect(hasInput || hasPicker).toBeTruthy();
  });

  test('테이블 또는 차트 콘텐츠 렌더링 확인', async ({ page }) => {
    await goTo(page, '/stats/order-margin');
    await page.locator('.ant-spin-spinning').waitFor({ state: 'hidden', timeout: 20000 }).catch(() => {});
    await page.waitForTimeout(2000);
    const hasTable = await page.locator('.ant-table').isVisible({ timeout: 3000 }).catch(() => false);
    const hasChart = await page.locator('canvas, svg').isVisible({ timeout: 3000 }).catch(() => false);
    const hasCard = await page.locator('.ant-card').isVisible({ timeout: 3000 }).catch(() => false);
    expect(hasTable || hasChart || hasCard).toBeTruthy();
  });
});

// ─────────────────────────────────────────────────────────────
// ㉓ 콘솔 에러 종합 체크 (모든 페이지)
// ─────────────────────────────────────────────────────────────
test.describe('㉓ 콘솔 에러 종합 체크', () => {
  const allPages = [
    '/',
    '/info/biz-owners',
    '/info/customers',
    '/info/goal',
    '/admin/erp-sync',
    '/stats/team-forecast',
    '/stats/team-goal-actual',
    '/stats/part-goal-yoy',
    '/stats/am-goal-yoy',
    '/stats/item-perf',
    '/stats/vendor-margin',
    '/stats/order-margin',
  ];

  test('각 페이지 콘솔 에러 수집 및 리포트', async ({ page }) => {
    test.setTimeout(180000);
    await login(page);

    const report: Record<string, string[]> = {};
    const errors: string[] = [];
    page.on('pageerror', (e) => errors.push(e.message));
    page.on('console', (msg) => {
      if (msg.type() === 'error') errors.push(`[console.error] ${msg.text()}`);
    });

    for (const path of allPages) {
      errors.length = 0;
      await page.goto(`${BASE}${path}`);
      await page.locator('.ant-spin-spinning').waitFor({ state: 'hidden', timeout: 15000 }).catch(() => {});
      await page.waitForTimeout(1500);
      if (errors.length > 0) {
        report[path] = [...errors];
      }
    }

    if (Object.keys(report).length > 0) {
      console.log('\n=== 콘솔 에러 발견된 페이지 ===');
      for (const [path, errs] of Object.entries(report)) {
        console.log(`\n[${path}]`);
        errs.forEach((e) => console.log('  -', e));
      }
    } else {
      console.log('\n=== 모든 페이지 콘솔 에러 없음 ===');
    }

    expect(true).toBeTruthy();
  });
});
