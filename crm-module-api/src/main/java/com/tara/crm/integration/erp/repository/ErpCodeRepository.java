package com.tara.crm.integration.erp.repository;

import lombok.RequiredArgsConstructor;
import org.springframework.beans.factory.annotation.Qualifier;
import org.springframework.boot.autoconfigure.condition.ConditionalOnProperty;
import org.springframework.cache.annotation.Cacheable;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.stereotype.Repository;

import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;
import java.util.stream.Collectors;

@ConditionalOnProperty(name = "oracle.enabled", havingValue = "true", matchIfMissing = false)
@Repository
@RequiredArgsConstructor
public class ErpCodeRepository {

    @Qualifier("oracleJdbcTemplate")
    private final JdbcTemplate jdbcTemplate;

    /** 세무구분 목록 (MA_TAX_MST) */
    public List<Map<String, String>> findTaxTypes() {
        return jdbcTemplate.queryForList(
                """
                SELECT MTM.TAXAFS_CD, MTM.TAXAFS_CD_NM
                  FROM MA_TAX_MST MTM
                 WHERE MTM.TAXCAT_CD = 'B'
                   AND SYSDATE >= MTM.START_DT
                   AND (MTM.END_DT IS NULL OR MTM.END_DT >= SYSDATE)
                   AND MTM.NATION_CD = 'KR'
                 ORDER BY MTM.TAXAFS_CD, MTM.TERM_SQ
                """
        ).stream().map(row -> {
            Map<String, String> m = new LinkedHashMap<>();
            m.put("value", String.valueOf(row.get("TAXAFS_CD")));
            m.put("label", String.valueOf(row.get("TAXAFS_CD_NM")));
            return m;
        }).collect(Collectors.toList());
    }

    /** 작업코드/작업명 목록 (PP_OPTPRI_INFO_X20329 JOIN MA_CODEDTL, REL_FLAG_5_CD='2000').
     *  시트 5/13 정정: PLANT_CD='1000' 필터 때문에 그래픽스(2000) 코드가 누락되고
     *  타라티피에스(1000)의 용지/반제품 같은 엉뚱한 코드가 노출되던 케이스. 사용자 제공 쿼리와
     *  동일하게 PLANT_CD 조건 자체를 제거하여 REL_FLAG_5_CD='2000'(=그래픽스) 매칭 코드만 노출. */
    public List<Map<String, String>> findWorkCodes() {
        return jdbcTemplate.queryForList(
                """
                SELECT DISTINCT POIX.WRK_CD, MC.SYSDEF_NM AS WRK_NM
                  FROM PP_OPTPRI_INFO_X20329 POIX
                  LEFT OUTER JOIN MA_CODEDTL MC
                    ON MC.COMPANY_CD = POIX.COMPANY_CD
                   AND MC.MODULE_CD = 'SD'
                   AND MC.FIELD_CD = 'Z010_20329'
                   AND MC.REL_FLAG_5_CD = '2000'
                   AND MC.SYSDEF_CD = POIX.WRK_CD
                 WHERE MC.SYSDEF_NM IS NOT NULL
                 ORDER BY POIX.WRK_CD
                """
        ).stream().map(row -> {
            Map<String, String> m = new LinkedHashMap<>();
            m.put("value", String.valueOf(row.get("WRK_CD")));
            String nm = row.get("WRK_NM") != null ? String.valueOf(row.get("WRK_NM")) : null;
            m.put("label", nm != null && !nm.isBlank() ? nm : String.valueOf(row.get("WRK_CD")));
            return m;
        }).collect(Collectors.toList());
    }

    /** 작업처 목록 (MA_CODEDTL FIELD_CD='Z021_20329', REL_FLAG_1_CD='O' — 외주 작업처만, 주문 상세/등록 폼 셀렉트박스용 기본) */
    public List<Map<String, String>> findWorkTypes() {
        return findWorkTypes(false);
    }

    /**
     * 작업처 목록 조회.
     * @param includeAll true면 REL_FLAG_1_CD 필터 제거(모든 작업처: 외주 + 센터 + POD 등 전체 8건) — 주문목록 wrkNm 매핑용.
     *                   false면 REL_FLAG_1_CD='O'만(외주 3건: G0600/G0601/G9999) — 주문 상세/등록 폼 셀렉트박스용.
     */
    @Cacheable(cacheNames = "erpWorkTypes", key = "#includeAll")
    public List<Map<String, String>> findWorkTypes(boolean includeAll) {
        String sql = includeAll
                ? """
                  SELECT MCD.SYSDEF_CD, MCD.SYSDEF_NM
                    FROM MA_CODEDTL MCD
                   WHERE MCD.COMPANY_CD = '1000'
                     AND MCD.MODULE_CD = 'SD'
                     AND MCD.FIELD_CD = 'Z021_20329'
                     AND MCD.SYSCODE_YN = 'N'
                     AND MCD.DISP_SQ IS NOT NULL
                     AND (MCD.DRS_CD IS NULL OR MCD.DRS_CD = '' OR MCD.DRS_CD = '20329')
                   ORDER BY MCD.DISP_SQ, MCD.SYSDEF_CD
                  """
                : """
                  SELECT MCD.SYSDEF_CD, MCD.SYSDEF_NM
                    FROM MA_CODEDTL MCD
                   WHERE MCD.COMPANY_CD = '1000'
                     AND MCD.MODULE_CD = 'SD'
                     AND MCD.FIELD_CD = 'Z021_20329'
                     AND MCD.SYSCODE_YN = 'N'
                     AND MCD.DISP_SQ IS NOT NULL
                     AND MCD.REL_FLAG_1_CD = 'O'
                     AND (MCD.DRS_CD IS NULL OR MCD.DRS_CD = '' OR MCD.DRS_CD = '20329')
                   ORDER BY MCD.DISP_SQ, MCD.SYSDEF_CD
                  """;
        return jdbcTemplate.queryForList(sql).stream().map(row -> {
            Map<String, String> m = new LinkedHashMap<>();
            m.put("value", String.valueOf(row.get("SYSDEF_CD")));
            m.put("label", String.valueOf(row.get("SYSDEF_NM")));
            return m;
        }).collect(Collectors.toList());
    }

    /** 품목구분 목록 (MA_ITEM_SA + CI_ITEM + MA_ITEM, PRDUCTGRP_CD='99996', FLOW_PATH_CD='2000') */
    public List<Map<String, String>> findItemCategories() {
        return jdbcTemplate.queryForList(
                """
                SELECT MIS.ITEM_CD, CI.ITEM_NM
                  FROM MA_ITEM_SA MIS
                  INNER JOIN CI_ITEM CI ON MIS.ITEM_CD = CI.ITEM_CD AND CI.USE_YN = 'Y'
                  LEFT OUTER JOIN MA_ITEM MI ON MIS.COMPANY_CD = MI.COMPANY_CD AND MIS.ITEM_CD = MI.ITEM_CD
                 WHERE MI.PRDUCTGRP_CD = '99996'
                   AND MIS.FLOW_PATH_CD = '2000'
                 ORDER BY CI.ITEM_NM
                """
        ).stream().map(row -> {
            Map<String, String> m = new LinkedHashMap<>();
            m.put("value", String.valueOf(row.get("ITEM_CD")));
            m.put("label", String.valueOf(row.get("ITEM_NM")));
            return m;
        }).collect(Collectors.toList());
    }

    /** 구성 목록 (MA_CODEDTL FIELD_CD='Z019_20329') */
    public List<Map<String, String>> findCompositions() {
        return jdbcTemplate.queryForList(
                """
                SELECT SYSDEF_CD, SYSDEF_NM
                  FROM (SELECT SYSDEF_CD, SYSDEF_NM, MIN(DISP_SQ) AS DISP_SQ
                          FROM MA_CODEDTL
                         WHERE FIELD_CD = 'Z019_20329'
                         GROUP BY SYSDEF_CD, SYSDEF_NM)
                 ORDER BY DISP_SQ, SYSDEF_CD
                """
        ).stream().map(row -> {
            Map<String, String> m = new LinkedHashMap<>();
            m.put("value", String.valueOf(row.get("SYSDEF_CD")));
            m.put("label", String.valueOf(row.get("SYSDEF_NM")));
            return m;
        }).collect(Collectors.toList());
    }

    /**
     * 공통코드 배치용 — MA_CODEDTL 특정 FIELD_CD 의 코드/명칭/정렬 전량 조회.
     * (COMPANY_CD='1000', MODULE_CD='SD', DISP_SQ 있는 것만, 화면 정렬순.)
     * 반환 키: SYSDEF_CD, SYSDEF_NM, DISP_SQ.
     */
    public List<Map<String, Object>> findCodeGroup(String fieldCd) {
        return jdbcTemplate.queryForList(
                """
                SELECT MCD.SYSDEF_CD, MCD.SYSDEF_NM, MCD.DISP_SQ
                  FROM MA_CODEDTL MCD
                 WHERE MCD.COMPANY_CD = '1000'
                   AND MCD.MODULE_CD  = 'SD'
                   AND MCD.FIELD_CD   = ?
                   AND MCD.DISP_SQ IS NOT NULL
                 ORDER BY MCD.DISP_SQ, MCD.SYSDEF_CD
                """, fieldCd);
    }

    /** Oracle SD_ORDER_MST의 실제 WRK_FG 코드 전수 조회 */
    public Map<String, Object> diagnoseWrkFgCodes() {
        Map<String, Object> result = new LinkedHashMap<>();
        // 1. 실제 사용 중인 WRK_FG 값 + 건수
        try {
            result.put("wrkfg_in_use", jdbcTemplate.queryForList(
                "SELECT WRK_FG, COUNT(*) AS CNT FROM SD_ORDER_MST_X20329 WHERE COMPANY_CD = '1000' GROUP BY WRK_FG ORDER BY WRK_FG"));
        } catch (Exception e) { result.put("wrkfg_in_use_error", e.getMessage()); }
        // 2. MA_CODEDTL에 WRK_FG 관련 FIELD_CD 있는지 확인
        try {
            result.put("codedtl_wrkfg_fields", jdbcTemplate.queryForList(
                "SELECT FIELD_CD, SYSDEF_CD, SYSDEF_NM FROM MA_CODEDTL WHERE COMPANY_CD = '1000' AND (FIELD_CD LIKE '%WRK_FG%' OR FIELD_CD LIKE '%WRKFG%') AND ROWNUM <= 50"));
        } catch (Exception e) { result.put("codedtl_wrkfg_error", e.getMessage()); }
        // 3. SD 모듈 전체 FIELD_CD 목록 (WRK 관련)
        try {
            result.put("sd_wrk_fields", jdbcTemplate.queryForList(
                "SELECT DISTINCT FIELD_CD FROM MA_CODEDTL WHERE MODULE_CD = 'SD' AND (FIELD_CD LIKE '%WRK%' OR FIELD_CD LIKE '%STATUS%' OR FIELD_CD LIKE '%FG%') AND ROWNUM <= 30",
                String.class));
        } catch (Exception e) { result.put("sd_wrk_fields_error", e.getMessage()); }
        // 4. WRK_FG별 샘플 주문번호 (미매핑 코드 중심)
        try {
            result.put("wrkfg_samples", jdbcTemplate.queryForList(
                "SELECT WRK_FG, ORDDOC_NO, ORDDOC_NM, ORD_DT FROM (" +
                "  SELECT WRK_FG, ORDDOC_NO, ORDDOC_NM, ORD_DT," +
                "         ROW_NUMBER() OVER (PARTITION BY WRK_FG ORDER BY UPDATE_DTS DESC) RN" +
                "  FROM SD_ORDER_MST_X20329 WHERE COMPANY_CD = '1000'" +
                "    AND WRK_FG IN ('101','102','201','206','401','402','500','901','999')" +
                ") WHERE RN = 1 ORDER BY WRK_FG"));
        } catch (Exception e) { result.put("wrkfg_samples_error", e.getMessage()); }
        // 5. Oracle SD 모듈 테이블 전체 목록 (현재 사용자 스키마)
        try {
            result.put("sd_tables_all", jdbcTemplate.queryForList(
                "SELECT TABLE_NAME FROM USER_TABLES WHERE TABLE_NAME LIKE 'SD_%' ORDER BY TABLE_NAME",
                String.class));
        } catch (Exception e) { result.put("sd_tables_error", e.getMessage()); }
        // 6. Oracle SD 모듈 뷰 전체 목록
        try {
            result.put("sd_views_all", jdbcTemplate.queryForList(
                "SELECT VIEW_NAME FROM USER_VIEWS WHERE VIEW_NAME LIKE 'SD_%' OR VIEW_NAME LIKE 'VW_SD_%' ORDER BY VIEW_NAME",
                String.class));
        } catch (Exception e) { result.put("sd_views_error", e.getMessage()); }
        // 7. SD_ORDER_MST_X20329 컬럼 전체 목록
        try {
            result.put("order_mst_columns", jdbcTemplate.queryForList(
                "SELECT COLUMN_NAME, DATA_TYPE FROM USER_TAB_COLUMNS WHERE TABLE_NAME = 'SD_ORDER_MST_X20329' ORDER BY COLUMN_ID",
                String.class));
        } catch (Exception e) { result.put("order_mst_columns_error", e.getMessage()); }
        // 8. WRK_FG 코드 정의 - MA_CODEDTL 전체 FIELD_CD 목록 (SD 모듈, 코드 100이상)
        try {
            result.put("ma_codedtl_sd_all_fields", jdbcTemplate.queryForList(
                "SELECT DISTINCT FIELD_CD FROM MA_CODEDTL WHERE MODULE_CD = 'SD' ORDER BY FIELD_CD",
                String.class));
        } catch (Exception e) { result.put("ma_codedtl_sd_error", e.getMessage()); }
        // 9. MA_CODEDTL에서 SYSDEF_CD가 100~999 범위인 SD 코드 전수 조회
        try {
            result.put("codedtl_sd_numeric_codes", jdbcTemplate.queryForList(
                "SELECT FIELD_CD, SYSDEF_CD, SYSDEF_NM FROM MA_CODEDTL WHERE COMPANY_CD = '1000' AND MODULE_CD = 'SD' AND REGEXP_LIKE(SYSDEF_CD, '^[0-9]+$') AND TO_NUMBER(SYSDEF_CD) BETWEEN 100 AND 999 ORDER BY FIELD_CD, SYSDEF_CD"));
        } catch (Exception e) { result.put("codedtl_sd_numeric_error", e.getMessage()); }
        // 10. SD_ORDER_MST_X20329와 관련된 테이블에서 WRK_FG 컬럼이 있는 모든 테이블
        try {
            result.put("tables_with_wrkfg", jdbcTemplate.queryForList(
                "SELECT TABLE_NAME, COLUMN_NAME FROM USER_TAB_COLUMNS WHERE COLUMN_NAME LIKE '%WRK_FG%' ORDER BY TABLE_NAME",
                String.class));
        } catch (Exception e) { result.put("tables_with_wrkfg_error", e.getMessage()); }
        // 11. MA_CODEDTL - SYSDEF_CD가 '100'~'999'인 전체 MODULE_CD, FIELD_CD 조회
        try {
            result.put("all_module_numeric_codes_overview", jdbcTemplate.queryForList(
                "SELECT MODULE_CD, FIELD_CD, COUNT(*) AS CNT FROM MA_CODEDTL WHERE REGEXP_LIKE(SYSDEF_CD, '^[0-9]+$') AND TO_NUMBER(SYSDEF_CD) BETWEEN 100 AND 999 GROUP BY MODULE_CD, FIELD_CD HAVING COUNT(*) >= 5 ORDER BY MODULE_CD, FIELD_CD"));
        } catch (Exception e) { result.put("all_module_numeric_error", e.getMessage()); }
        return result;
    }

    /** 진단: MA_CODEDTL FIELD_CD 샘플 + PP_OPTPRI WRK_CD 샘플 */
    public Map<String, Object> diagnoseCodeLookup() {
        Map<String, Object> result = new LinkedHashMap<>();
        try {
            result.put("codedtl_field_cds", jdbcTemplate.queryForList(
                "SELECT DISTINCT FIELD_CD FROM MA_CODEDTL WHERE COMPANY_CD = '1000' AND ROWNUM <= 50 ORDER BY FIELD_CD",
                String.class));
        } catch (Exception e) { result.put("codedtl_error", e.getMessage()); }
        try {
            result.put("codedtl_z010_sample", jdbcTemplate.queryForList(
                "SELECT SYSDEF_CD, SYSDEF_NM FROM MA_CODEDTL WHERE COMPANY_CD = '1000' AND FIELD_CD = 'Z010_20329' AND ROWNUM <= 5"));
        } catch (Exception e) { result.put("codedtl_z010_error", e.getMessage()); }
        try {
            result.put("codedtl_z021_sample", jdbcTemplate.queryForList(
                "SELECT SYSDEF_CD, SYSDEF_NM FROM MA_CODEDTL WHERE COMPANY_CD = '1000' AND FIELD_CD = 'Z021_20329' AND ROWNUM <= 5"));
        } catch (Exception e) { result.put("codedtl_z021_error", e.getMessage()); }
        try {
            result.put("pp_optpri_sample", jdbcTemplate.queryForList(
                "SELECT WRK_CD, USE_YN FROM PP_OPTPRI_INFO_X20329 WHERE COMPANY_CD = '1000' AND PLANT_CD = '1000' AND ROWNUM <= 5"));
        } catch (Exception e) { result.put("pp_optpri_error", e.getMessage()); }
        try {
            result.put("tax_mst_sample", jdbcTemplate.queryForList(
                "SELECT TAXCAT_CD, TAXAFS_CD, TAXAFS_CD_NM, NATION_CD FROM MA_TAX_MST WHERE ROWNUM <= 10"));
        } catch (Exception e) { result.put("tax_mst_error", e.getMessage()); }
        return result;
    }
}
