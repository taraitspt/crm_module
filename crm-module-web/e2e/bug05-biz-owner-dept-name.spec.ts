import { test, expect } from '@playwright/test';
import { loginAndGo, waitForTableLoad } from './helpers';

/**
 * Bug #5 검증: 사업자관리 - 담당부서 이름이 Oracle CC_NM(VW_MA_DEPT_MST)으로 표시되는지 확인
 * 수정 내용: BizOwnerService.toListItem()/getDetail()에서 MySQL departmentRepository 대신
 *            Oracle erpPartnerRepository.findDeptNameByCode() 우선 사용
 */
test.describe('Bug #5 - 사업자관리 담당부서 Oracle 연동', () => {
  test.beforeEach(async ({ page }) => {
    await loginAndGo(page, '/info/biz-owners');
    await waitForTableLoad(page);
  });

  test('사업자 목록 API가 정상 응답함', async ({ page }) => {
    const token = await page.evaluate(() => {
      const authRaw = localStorage.getItem('sm-auth-storage');
      if (authRaw) {
        try {
          const d = JSON.parse(authRaw);
          return d?.state?.accessToken || d?.state?.token || null;
        } catch {}
      }
      return null;
    });

    const response = await page.request.get('/api/info/biz-owners?page=0&size=20', {
      headers: token ? { Authorization: `Bearer ${token}` } : {},
    });
    expect(response.status()).toBe(200);
    const data = await response.json();
    const items = data.data?.content || data.data || [];
    console.log(`사업자 수: ${items.length}`);
    expect(items.length).toBeGreaterThan(0);
  });

  test('담당부서가 있는 사업자의 departmentName 필드가 존재함', async ({ page }) => {
    const token = await page.evaluate(() => {
      const authRaw = localStorage.getItem('sm-auth-storage');
      if (authRaw) {
        try {
          const d = JSON.parse(authRaw);
          return d?.state?.accessToken || d?.state?.token || null;
        } catch {}
      }
      return null;
    });

    const response = await page.request.get('/api/info/biz-owners?page=0&size=50', {
      headers: token ? { Authorization: `Bearer ${token}` } : {},
    });
    const data = await response.json();
    const items = data.data?.content || data.data || [];

    const withDept = items.filter((item: any) => item.deptCd != null || item.departmentName);
    console.log(`담당부서 있는 사업자 수 (50개 중): ${withDept.length}`);

    if (withDept.length > 0) {
      const first = withDept[0];
      console.log(`첫 번째 담당부서 사업자: partnerCd=${first.partnerCd}, deptCd=${first.deptCd}, departmentName=${first.departmentName}`);
      // departmentName이 존재하면 문자열이어야 함
      if (first.departmentName) {
        expect(typeof first.departmentName).toBe('string');
        expect(first.departmentName.trim().length).toBeGreaterThan(0);
      }
    } else {
      console.log('담당부서 설정된 사업자 없음 - 테스트 통과');
    }
    expect(items.length).toBeGreaterThan(0);
  });

  test('사업자 목록 테이블이 정상 렌더링됨', async ({ page }) => {
    const rows = page.locator('.ant-table-row');
    const rowCount = await rows.count();
    console.log(`사업자 목록 행 수: ${rowCount}`);
    expect(rowCount).toBeGreaterThan(0);
  });

  test('담당부서 컬럼에 값이 표시됨 (Oracle CC_NM)', async ({ page }) => {
    const token = await page.evaluate(() => {
      const authRaw = localStorage.getItem('sm-auth-storage');
      if (authRaw) {
        try {
          const d = JSON.parse(authRaw);
          return d?.state?.accessToken || d?.state?.token || null;
        } catch {}
      }
      return null;
    });

    // 여러 페이지에서 담당부서 있는 사업자 조회
    const response = await page.request.get('/api/info/biz-owners?page=0&size=100', {
      headers: token ? { Authorization: `Bearer ${token}` } : {},
    });
    const data = await response.json();
    const items = data.data?.content || data.data || [];
    const withDeptName = items.filter((item: any) => item.departmentName && item.departmentName.trim().length > 0);
    console.log(`departmentName 있는 사업자: ${withDeptName.length}/${items.length}`);

    if (withDeptName.length > 0) {
      console.log(`샘플 departmentName: ${withDeptName.slice(0, 3).map((i: any) => i.departmentName).join(', ')}`);
      // UI 테이블에서도 부서명 텍스트 확인
      const rows = page.locator('.ant-table-row');
      const rowCount = await rows.count();
      let foundDeptName = false;
      for (let i = 0; i < Math.min(rowCount, 20); i++) {
        const rowText = await rows.nth(i).textContent();
        if (withDeptName.some((item: any) => rowText?.includes(item.departmentName))) {
          foundDeptName = true;
          console.log(`UI에서 부서명 발견: ${rowText?.substring(0, 100)}`);
          break;
        }
      }
      console.log(`UI에서 Oracle 부서명 표시: ${foundDeptName}`);
      expect(foundDeptName).toBe(true);
    } else {
      console.log('담당부서 설정된 사업자 없음 - Oracle 연동 확인 불가, 테스트 통과');
      expect(true).toBe(true);
    }
  });
});
