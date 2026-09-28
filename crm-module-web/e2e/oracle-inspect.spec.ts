import { test, expect } from '@playwright/test';
import { loginAndGo } from './helpers';

test('Oracle HR_EMP_MST 컬럼 및 샘플 데이터 확인', async ({ page }) => {
  await loginAndGo(page, '/');

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

  // HR_EMP_MST 컬럼 조회
  const colRes = await page.request.get('/api/lookup/oracle-columns?tableName=HR_EMP_MST', {
    headers: token ? { Authorization: `Bearer ${token}` } : {},
  });
  const colData = await colRes.json();
  console.log('HR_EMP_MST 컬럼:', JSON.stringify(colData.data?.slice(0, 40)));

  // find-tables로 영업 관련 테이블 찾기
  const tblRes = await page.request.get('/api/lookup/oracle-find-tables?tablePattern=HR_EMP&columnPattern=', {
    headers: token ? { Authorization: `Bearer ${token}` } : {},
  });
  const tblData = await tblRes.json();
  console.log('HR_EMP 관련 테이블:', JSON.stringify(tblData.data?.slice(0, 10)));

  // diagnose-codes로 작업처/구성 코드 확인
  const codeRes = await page.request.get('/api/lookup/diagnose-codes', {
    headers: token ? { Authorization: `Bearer ${token}` } : {},
  });
  const codeData = await codeRes.json();
  console.log('코드 진단:', JSON.stringify(codeData.data));

  // work-types 전체 목록
  const wtRes = await page.request.get('/api/lookup/work-types', {
    headers: token ? { Authorization: `Bearer ${token}` } : {},
  });
  const wtData = await wtRes.json();
  console.log('작업처 목록:', JSON.stringify(wtData.data));

  // work-codes 전체 목록
  const wcRes = await page.request.get('/api/lookup/work-codes', {
    headers: token ? { Authorization: `Bearer ${token}` } : {},
  });
  const wcData = await wcRes.json();
  console.log('작업코드 목록:', JSON.stringify(wcData.data?.slice(0, 10)));

  // compositions
  const compRes = await page.request.get('/api/lookup/compositions', {
    headers: token ? { Authorization: `Bearer ${token}` } : {},
  });
  const compData = await compRes.json();
  console.log('구성 목록:', JSON.stringify(compData.data?.slice(0, 10)));

  // employees 샘플 (현재 - 필터 없음)
  const empRes = await page.request.get('/api/lookup/employees?keyword=', {
    headers: token ? { Authorization: `Bearer ${token}` } : {},
  });
  const empData = await empRes.json();
  console.log('직원 수:', empData.data?.length, '샘플:', JSON.stringify(empData.data?.slice(0, 5)));

  expect(true).toBe(true);
});
