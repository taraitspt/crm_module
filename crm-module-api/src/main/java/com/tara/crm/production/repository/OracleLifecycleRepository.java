package com.tara.crm.production.repository;

import org.springframework.beans.factory.annotation.Qualifier;
import org.springframework.boot.autoconfigure.condition.ConditionalOnProperty;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.jdbc.core.namedparam.MapSqlParameterSource;
import org.springframework.jdbc.core.namedparam.NamedParameterJdbcTemplate;
import org.springframework.stereotype.Repository;

import java.sql.ResultSet;
import java.sql.ResultSetMetaData;
import java.sql.SQLException;
import java.time.LocalDate;
import java.time.format.DateTimeFormatter;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Locale;
import java.util.Map;

/**
 * 주문별 생애주기 (TPS, 회사 1000 / 공장 1000) — 주문 순번(제품 하나)이 제판 → 인쇄 → 후가공 → 접지 → 제본으로 가는 과정을 한 줄로. 조회 전용.
 *
 * <p>계획 테이블 다섯 개(생산계획조회와 같은 원천)를 그대로 읽는다:
 * 인쇄 PP_PLANPRW · 제판 PP_PLANPLMK · 후가공 PP_PLANPROCS · 접지/제본 PP_PLANBBND.
 * 인쇄·제판·후가공·접지 행은 KEY_VAL_NM(계획번호/차수/순번/하위순번)으로 인쇄 행 하나(= 구성×대수)에 매달리고,
 * 제본 행은 KEY_VAL_NM 이 없다 — 완성품 제본(LAST_YN=Y, 하위순번 500) 하나 + 보충 작업(SUPP_YN=Y, 501~).
 * 2026-10 첫 주 실측: 인쇄 행당 제판 거의 1개(2개 11건), 후가공 0~5개, 접지 0~1개. 순번당 제본 행 1~16개.
 *
 * <p>진행상태 = 대수마감(PRPCNT_CLOSE_YN, 사용자 결정 2026-10-07). 확정 CNFM_YN → 진행 ISSUE_YN → 대수마감 순으로 켜진다.
 * 실적 완료일은 PP_PROD_IF(계획번호·순번·하위순번·작업장 그룹으로 연동된 MES 실적)의 BASE_END_DT.
 * 주문번호 자리에는 주문(TOR…)과 의뢰(PQE…)가 둘 다 온다 — 주문명·거래처는 SD_ORDER_MST / PP_PREORD_MST 둘 다 본다.
 */
@Repository
@ConditionalOnProperty(name = "oracle.enabled", havingValue = "true")
public class OracleLifecycleRepository {

    private final NamedParameterJdbcTemplate jdbc;
    private static final DateTimeFormatter BASIC = DateTimeFormatter.BASIC_ISO_DATE;

    public OracleLifecycleRepository(@Qualifier("oracleJdbcTemplate") JdbcTemplate jdbcTemplate) {
        this.jdbc = new NamedParameterJdbcTemplate(jdbcTemplate);
    }

    /**
     * 다섯 공정 행을 한 모양으로 — STAGE: PLATE / PRINT / PROC / FOLD / BIND. 바깥에서 WHERE 를 붙인다.
     * 접지/제본 구분·완료 판정·실적 취소 제외는 생산계획현황과 같은 {@link ProductionRules} 를 쓴다.
     */
    private static final String STAGES = """
            SELECT 'PRINT' STAGE, X.COMPANY_CD, X.PLANT_CD, X.ORDDOC_NO, X.ORDDOC_SQ, X.PLAN_NO, X.PLAN_SQ, X.PLAN_LOW_SQ, X.PAGE_SQ, X.LINE_SQ, 0 PROCS_SQ,
                   X.KEY_VAL_NM, X.CONFIG_CD, X.OP_CD, X.WRK_CD, X.EQP_CD, X.PLAN_DT, X.PRPCNT_SQ, X.FULL_QT QTY, X.MTRIL_CD,
                   X.GNRL_PRW_BEF_QT, X.GNRL_PRW_AFTR_QT, X.SPCLR_PRW_BEF_QT, X.SPCLR_PRW_AFTR_QT,
                   X.CNFM_YN, X.ISSUE_YN, X.PRPCNT_CLOSE_YN, 'N' SUPP_YN, 'N' LAST_YN, X.ARLT_QT, X.TOP_ORGN_CD
              FROM PP_PLANPRW_INFO_X20329 X
            UNION ALL
            SELECT 'PLATE', X.COMPANY_CD, X.PLANT_CD, X.ORDDOC_NO, X.ORDDOC_SQ, X.PLAN_NO, X.PLAN_SQ, X.PLAN_LOW_SQ, X.PAGE_SQ, X.LINE_SQ, 0,
                   X.KEY_VAL_NM, X.CONFIG_CD, X.OP_CD, X.WRK_CD, X.EQP_CD, X.PLAN_DT, X.PRPCNT_SQ, X.PLTE_CNT_SUM_QT, NULL,
                   NULL, NULL, NULL, NULL,
                   X.CNFM_YN, X.ISSUE_YN, X.PRPCNT_CLOSE_YN, NVL(X.SUPP_YN, 'N'), 'N', X.ARLT_QT, X.TOP_ORGN_CD
              FROM PP_PLANPLMK_INFO_X20329 X
            UNION ALL
            SELECT 'PROC', X.COMPANY_CD, X.PLANT_CD, X.ORDDOC_NO, X.ORDDOC_SQ, X.PLAN_NO, X.PLAN_SQ, X.PLAN_LOW_SQ, X.PAGE_SQ, X.LINE_SQ, X.PROCS_SQ,
                   X.KEY_VAL_NM, X.CONFIG_CD, X.OP_CD, X.WRK_CD, X.EQP_CD, X.PLAN_DT, X.PRPCNT_SQ, X.PROC_QT, NULL,
                   NULL, NULL, NULL, NULL,
                   X.CNFM_YN, X.ISSUE_YN, X.PRPCNT_CLOSE_YN, 'N', 'N', X.ARLT_QT, X.TOP_ORGN_CD
              FROM PP_PLANPROCS_INFO_X20329 X
            UNION ALL
            SELECT CASE WHEN %s THEN 'BIND' ELSE 'FOLD' END, X.COMPANY_CD, X.PLANT_CD, X.ORDDOC_NO, X.ORDDOC_SQ, X.PLAN_NO, X.PLAN_SQ, X.PLAN_LOW_SQ, X.PAGE_SQ, X.LINE_SQ, 0,
                   X.KEY_VAL_NM, X.CONFIG_CD, X.OP_CD, X.WRK_CD, X.EQP_CD, X.PLAN_DT, X.PRPCNT_SQ, X.ORD_QT, NULL,
                   NULL, NULL, NULL, NULL,
                   X.CNFM_YN, X.ISSUE_YN, X.PRPCNT_CLOSE_YN, NVL(X.SUPP_YN, 'N'), NVL(X.LAST_YN, 'N'), X.ARLT_QT, X.TOP_ORGN_CD
              FROM PP_PLANBBND_INFO_X20329 X
            """.formatted(ProductionRules.isBind("X"));

    /** 순번 하나의 공정 행 — 인쇄 행 묶음(KEY) 순서, 공정 순서대로. */
    private static final String DETAIL_SQL = """
            WITH S AS (%s)
            SELECT S.STAGE, S.ORDDOC_NO AS ORDER_NO, S.ORDDOC_SQ AS ORDER_SQ, S.PLAN_NO, S.PLAN_SQ, S.PLAN_LOW_SQ, S.PROCS_SQ, S.KEY_VAL_NM,
                   S.CONFIG_CD, MC.SYSDEF_NM AS CONFIG_NM, S.PRPCNT_SQ,
                   MC2.SYSDEF_NM AS OP_NM, MC4.SYSDEF_NM AS WRK_NM, PES.EQP_NM, S.QTY, CI.ITEM_NM AS MTRIL_NM,
                   S.GNRL_PRW_BEF_QT, S.GNRL_PRW_AFTR_QT, S.SPCLR_PRW_BEF_QT, S.SPCLR_PRW_AFTR_QT,
                   S.PLAN_DT, NVL(S.CNFM_YN, 'N') AS CNFM_YN, NVL(S.ISSUE_YN, 'N') AS ISSUE_YN, %s AS CLOSE_YN, NVL(S.PRPCNT_CLOSE_YN, 'N') AS RAW_CLOSE_YN,
                   %s AS EXT_YN,
                   S.SUPP_YN, S.LAST_YN, S.ARLT_QT, PPI.INTL_ST AS RESULT_ST, PPI.BASE_END_DT AS RESULT_DT,
                   PO.REQ_DT, PO.PURDOC_NO, PO.VENDOR_NM
              FROM S
              LEFT JOIN MA_CODEDTL MC  ON MC.COMPANY_CD = S.COMPANY_CD AND MC.MODULE_CD = 'SD' AND MC.FIELD_CD = 'Z007_20329' AND MC.SYSDEF_CD = S.CONFIG_CD
              LEFT JOIN MA_CODEDTL MC2 ON MC2.COMPANY_CD = S.COMPANY_CD AND MC2.MODULE_CD = 'PP' AND MC2.FIELD_CD = 'Z005_20329' AND MC2.SYSDEF_CD = S.OP_CD
              LEFT JOIN MA_CODEDTL MC4 ON MC4.COMPANY_CD = S.COMPANY_CD AND MC4.MODULE_CD = 'SD' AND MC4.FIELD_CD = 'Z010_20329' AND MC4.SYSDEF_CD = S.WRK_CD
              LEFT JOIN PM_EQ_SDTL PES ON PES.COMPANY_CD = S.COMPANY_CD AND PES.EQP_CD = S.EQP_CD AND PES.LANG_CD = 'KO'
              LEFT JOIN CI_ITEM CI ON CI.ITEM_CD = S.MTRIL_CD
              LEFT JOIN PP_PROD_IF PPI ON PPI.COMPANY_CD = S.COMPANY_CD AND PPI.PLANT_CD = S.PLANT_CD AND PPI.SODOC_NO = S.PLAN_NO
                                     AND PPI.SODOC_SQ = S.PLAN_SQ AND PPI.INTL_NO = S.PLAN_LOW_SQ AND PPI.REL1_CD = S.TOP_ORGN_CD
                                     AND %s
              -- 외주 발주 — 업체·납기요청일(= 입고요청일)·발주번호 (ProductionRules.vendorJoin)
              %s
             WHERE S.COMPANY_CD = '1000' AND S.PLANT_CD = '1000' AND S.ORDDOC_NO = :orderNo AND S.ORDDOC_SQ = :orderSq
             ORDER BY S.KEY_VAL_NM NULLS LAST, DECODE(S.STAGE, 'PLATE', 1, 'PRINT', 2, 'PROC', 3, 'FOLD', 4, 5), S.PLAN_LOW_SQ, S.PROCS_SQ
            """.formatted(STAGES, ProductionRules.doneExpr("S", "PES"), ProductionRules.extExpr("PES"), ProductionRules.notCancelled("PPI"),
                    ProductionRules.vendorJoin("PO", "S", "SELECT PLAN_NO FROM PP_PLAN_DTL_X20329 WHERE COMPANY_CD = '1000' AND ORDDOC_NO = :orderNo"));

    /**
     * 순번 목록 — 기간 안에 어느 공정이든 계획일이 있는 계획번호의 순번들. 공정별 행 수·마감 수, 첫/마지막 계획일, 완성품 제본 계획일·마감.
     * 기간 필터는 계획번호로 먼저 좁힌다(KEY_VAL_NM·ORDDOC 에는 색인이 없어 넓게 읽으면 느리다).
     */
    private static final String LINES_SQL = """
            WITH P AS (
                SELECT PLAN_NO FROM PP_PLANPRW_INFO_X20329 WHERE COMPANY_CD = '1000' AND PLANT_CD = '1000' AND PLAN_DT BETWEEN :start AND :end
                UNION SELECT PLAN_NO FROM PP_PLANPLMK_INFO_X20329 WHERE COMPANY_CD = '1000' AND PLANT_CD = '1000' AND PLAN_DT BETWEEN :start AND :end
                UNION SELECT PLAN_NO FROM PP_PLANPROCS_INFO_X20329 WHERE COMPANY_CD = '1000' AND PLANT_CD = '1000' AND PLAN_DT BETWEEN :start AND :end
                UNION SELECT PLAN_NO FROM PP_PLANBBND_INFO_X20329 WHERE COMPANY_CD = '1000' AND PLANT_CD = '1000' AND PLAN_DT BETWEEN :start AND :end
            ),
            S AS (SELECT S0.*, %s AS DONE_YN
                    FROM (%s) S0 JOIN P ON P.PLAN_NO = S0.PLAN_NO
                    LEFT JOIN PM_EQ_SDTL PES ON PES.COMPANY_CD = S0.COMPANY_CD AND PES.EQP_CD = S0.EQP_CD AND PES.LANG_CD = 'KO'
                   WHERE S0.COMPANY_CD = '1000' AND S0.PLANT_CD = '1000'),
            G AS (
                SELECT ORDDOC_NO, ORDDOC_SQ, MAX(PLAN_NO) PLAN_NO, MAX(PLAN_SQ) PLAN_SQ,
                       SUM(DECODE(STAGE, 'PLATE', 1, 0)) PLATE_N, SUM(CASE WHEN STAGE = 'PLATE' AND DONE_YN = 'Y' THEN 1 ELSE 0 END) PLATE_DONE,
                       SUM(DECODE(STAGE, 'PRINT', 1, 0)) PRINT_N, SUM(CASE WHEN STAGE = 'PRINT' AND DONE_YN = 'Y' THEN 1 ELSE 0 END) PRINT_DONE,
                       SUM(DECODE(STAGE, 'PROC', 1, 0)) PROC_N,  SUM(CASE WHEN STAGE = 'PROC'  AND DONE_YN = 'Y' THEN 1 ELSE 0 END) PROC_DONE,
                       SUM(DECODE(STAGE, 'FOLD', 1, 0)) FOLD_N,  SUM(CASE WHEN STAGE = 'FOLD'  AND DONE_YN = 'Y' THEN 1 ELSE 0 END) FOLD_DONE,
                       SUM(DECODE(STAGE, 'BIND', 1, 0)) BIND_N,  SUM(CASE WHEN STAGE = 'BIND'  AND DONE_YN = 'Y' THEN 1 ELSE 0 END) BIND_DONE,
                       MIN(PLAN_DT) FIRST_DT, MAX(PLAN_DT) LAST_DT,
                       MAX(CASE WHEN STAGE = 'BIND' AND LAST_YN = 'Y' THEN PLAN_DT END) FINISH_DT,
                       MAX(CASE WHEN STAGE = 'BIND' AND LAST_YN = 'Y' THEN DONE_YN END) FINISH_DONE,
                       MAX(CASE WHEN STAGE = 'BIND' AND LAST_YN = 'Y' THEN OP_CD END) FINISH_OP_CD
                  FROM S GROUP BY ORDDOC_NO, ORDDOC_SQ
            )
            SELECT G.ORDDOC_NO AS ORDER_NO, G.ORDDOC_SQ AS ORDER_SQ, G.PLAN_NO, G.PLAN_SQ,
                   NVL(SOM.ORDDOC_NM, PRM.QODOC_NM) AS ORDER_NM,
                   NVL(SOM.BIZRSPT_EMPNO_CD, PRM.BIZRSPT_EMPNO_CD) AS EMP_NO, HEM.KOR_NM AS EMP_NM, MDM.DEPT_NM,
                   CPM.PARTNER_NM, PDX.SPCFCS_ITEM_NM AS DETAIL_ITEM_NM, PDX.ORD_QT, PDX.DLVSH_DTS AS DUE_DTS, PDX.RCPT_PRRG_DTS AS RCPT_DTS,
                   G.PLATE_N, G.PLATE_DONE, G.PRINT_N, G.PRINT_DONE, G.PROC_N, G.PROC_DONE, G.FOLD_N, G.FOLD_DONE, G.BIND_N, G.BIND_DONE,
                   G.FIRST_DT, G.LAST_DT, G.FINISH_DT, G.FINISH_DONE, MCF.SYSDEF_NM AS FINISH_OP_NM
              FROM G
              LEFT JOIN SD_ORDER_MST_X20329 SOM ON SOM.COMPANY_CD = '1000' AND SOM.ORDDOC_NO = G.ORDDOC_NO
              LEFT JOIN PP_PREORD_MST_X20329 PRM ON PRM.COMPANY_CD = '1000' AND PRM.PLAN_ORD_NO = G.ORDDOC_NO
              LEFT JOIN CI_PARTNER_MST CPM ON CPM.PARTNER_CD = NVL(SOM.PARTNER_CD, PRM.PARTNER_CD)
              -- 영업담당·부서 — 주문(TOR) 또는 의뢰(PQE) 머리. 모바일 "내 주문" 거르기용(주문진행현황과 같은 조인)
              LEFT JOIN HR_EMP_MST HEM ON HEM.COMPANY_CD = '1000' AND HEM.EMP_NO = NVL(SOM.BIZRSPT_EMPNO_CD, PRM.BIZRSPT_EMPNO_CD)
              LEFT JOIN MA_DEPT_MST MDM ON MDM.COMPANY_CD = '1000' AND MDM.DEPT_CD = NVL(SOM.DEPT_CD, PRM.DEPT_CD)
              LEFT JOIN PP_PLAN_DTL_X20329 PDX ON PDX.COMPANY_CD = '1000' AND PDX.PLANT_CD = '1000' AND PDX.PLAN_NO = G.PLAN_NO
                                              AND PDX.PLAN_HIS_SQ = 1 AND PDX.PLAN_SQ = G.PLAN_SQ
              LEFT JOIN MA_CODEDTL MCF ON MCF.COMPANY_CD = '1000' AND MCF.MODULE_CD = 'PP' AND MCF.FIELD_CD = 'Z005_20329' AND MCF.SYSDEF_CD = G.FINISH_OP_CD
             ORDER BY G.FIRST_DT, G.ORDDOC_NO, G.ORDDOC_SQ
            """.formatted(ProductionRules.doneExpr("S0", "PES"), STAGES);

    /** 순번 목록 — 계획일 기간(양끝 포함). */
    public List<Map<String, Object>> findLines(LocalDate start, LocalDate end) {
        return jdbc.query(LINES_SQL, new MapSqlParameterSource()
                .addValue("start", start.format(BASIC)).addValue("end", end.format(BASIC)), this::map);
    }

    /** 순번 하나의 공정 행. */
    public List<Map<String, Object>> findStages(String orderNo, int orderSq) {
        return jdbc.query(DETAIL_SQL, new MapSqlParameterSource()
                .addValue("orderNo", orderNo).addValue("orderSq", orderSq), this::map);
    }

    private Map<String, Object> map(ResultSet rs, int i) throws SQLException {
        ResultSetMetaData md = rs.getMetaData();
        Map<String, Object> row = new LinkedHashMap<>();
        for (int c = 1; c <= md.getColumnCount(); c++) {
            Object v = rs.getObject(c);
            if (v instanceof String s) v = s.trim();
            row.put(OracleEquipmentPerfRepository.camel(md.getColumnLabel(c).toUpperCase(Locale.ROOT)), v);
        }
        return row;
    }
}
