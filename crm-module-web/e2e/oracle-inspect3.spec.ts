import { test } from '@playwright/test';
import { loginAndGo } from './helpers';

test('Oracle 영업직원 필터/고객담당자 쿼리 확인', async ({ page }) => {
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

  // 진단 엔드포인트 - SLST_CD, EMP_TP, JKND_CD, PLANT_CD 샘플값 확인
  const diagRes = await page.request.get('/api/info/diagnose-oracle', {
    headers: token ? { Authorization: `Bearer ${token}` } : {},
  });
  if (diagRes.ok()) {
    console.log('Diagnose Oracle:', JSON.stringify(await diagRes.json(), null, 2));
  }

  // 고객 담당자 테이블 확인: MA_CC_MST (비용센터)
  const ccCols = await page.request.get('/api/lookup/oracle-columns?tableName=MA_CC_MST', {
    headers: token ? { Authorization: `Bearer ${token}` } : {},
  });
  console.log('MA_CC_MST:', (await ccCols.json()).data?.join(', '));

  // SD_BIZRSPT_INFO (영업담당자 정보)
  const sdRes = await page.request.get('/api/lookup/oracle-find-tables?tablePattern=BIZRSPT&columnPattern=', {
    headers: token ? { Authorization: `Bearer ${token}` } : {},
  });
  console.log('BIZRSPT 테이블:', JSON.stringify((await sdRes.json()).data?.slice(0, 5)));

  // HR_EMPGRP (그룹)
  const empGrpRes = await page.request.get('/api/lookup/oracle-find-tables?tablePattern=HR_EMP&columnPattern=SLST', {
    headers: token ? { Authorization: `Bearer ${token}` } : {},
  });
  console.log('SLST 컬럼 있는 테이블:', JSON.stringify((await empGrpRes.json()).data?.slice(0, 5)));

  // CI_PARTNER_MST - 고객 목록 (기존 siz)
  const partnerRes = await page.request.get('/api/lookup/partners?keyword=', {
    headers: token ? { Authorization: `Bearer ${token}` } : {},
  });
  const partnerData = await partnerRes.json();
  console.log('거래처 수:', partnerData.data?.length, '첫 3개:', JSON.stringify(partnerData.data?.slice(0, 3)));

  // 고객 담당자 정보 테이블 확인 (MA_CC_MST + MA_PARTNERSA_INFO)
  const partnersaCols = await page.request.get('/api/lookup/oracle-columns?tableName=MA_PARTNERSA_INFO', {
    headers: token ? { Authorization: `Bearer ${token}` } : {},
  });
  console.log('MA_PARTNERSA_INFO:', (await partnersaCols.json()).data?.join(', '));

  // 고객 담당자 목록 API (현재 customerApi)
  const custRes = await page.request.get('/api/info/customers?page=0&size=5', {
    headers: token ? { Authorization: `Bearer ${token}` } : {},
  });
  const custData = await custRes.json();
  console.log('현재 고객 목록:', JSON.stringify(custData.data?.content?.slice(0, 3)));

  console.log('\n=== 필요한 쿼리 정리 ===');
  console.log('1. 영업직원 (목표입력): HR_EMP_MST WHERE COMPANY_CD=1000 AND HLOF_FG_CD=1 + ??? 추가 필터');
  console.log('2. 고객 담당자: CI_PARTNER_MST + MA_PARTNERSA_INFO JOIN');
  console.log('3. MA_CC_MST cols:', (await ccCols.json()).data?.join(', '));
});
