import { test } from '@playwright/test';
import { loginAndGo } from './helpers';

test('Oracle 상세 구조 - 영업직원/고객/비용센터 확인', async ({ page }) => {
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

  const get = async (path: string) => {
    const res = await page.request.get(path, {
      headers: token ? { Authorization: `Bearer ${token}` } : {},
    });
    return res.json();
  };

  // HR_EMP_MST 에서 SLST_CD 컬럼 있는지 확인, 샘플 쿼리용 oracle-columns
  const hrCols = await get('/api/lookup/oracle-columns?tableName=HR_EMP_MST');
  console.log('HR_EMP_MST cols (all):', hrCols.data?.join(', '));

  // MA_CC_MST 컬럼
  const ccCols = await get('/api/lookup/oracle-columns?tableName=MA_CC_MST');
  console.log('MA_CC_MST cols:', ccCols.data?.join(', '));

  // CI_PARTNER_MST 컬럼 (고객)
  const partnerCols = await get('/api/lookup/oracle-columns?tableName=CI_PARTNER_MST');
  console.log('CI_PARTNER_MST cols:', partnerCols.data?.join(', '));

  // MA_PARTNERSA_INFO 컬럼 (담당자 정보)
  const partnerSaCols = await get('/api/lookup/oracle-columns?tableName=MA_PARTNERSA_INFO');
  console.log('MA_PARTNERSA_INFO cols:', partnerSaCols.data?.join(', '));

  // VW_MA_DEPT_MST 전체 부서 목록
  const depts = await get('/api/lookup/departments');
  console.log('전체 부서 목록:', JSON.stringify(depts.data?.map((d: any) => `${d.deptCd}:${d.deptNm}`)));

  // find-tables: SD_CC 또는 CC_MST 관련 테이블
  const ccTbls = await get('/api/lookup/oracle-find-tables?tablePattern=CC_MST&columnPattern=');
  console.log('CC_MST 관련 테이블:', JSON.stringify(ccTbls.data?.slice(0, 10)));

  // find-tables: PARTNER_SA (담당자)
  const paTbls = await get('/api/lookup/oracle-find-tables?tablePattern=PARTNERSA&columnPattern=');
  console.log('PARTNERSA 관련 테이블:', JSON.stringify(paTbls.data?.slice(0, 10)));

  // plants
  const plants = await get('/api/lookup/plants');
  console.log('공장 목록:', JSON.stringify(plants.data));

  console.log('\n=== 요약 ===');
  console.log('영업직원 필터 후보 컬럼:', hrCols.data?.filter((c: string) =>
    ['SLST_CD', 'EMP_TP', 'EMPY_TP_CD', 'JKND_CD', 'OGRP_CD', 'BIZAREA_CD', 'WC_CD'].includes(c)
  ));
});
