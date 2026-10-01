package com.tara.crm.production.repository;

import com.tara.crm.production.dto.ProductionPlanDto;
import com.tara.crm.production.dto.ProductionPlanDto.Row;
import com.tara.crm.production.dto.ProductionPlanDto.Tab;
import lombok.RequiredArgsConstructor;
import org.springframework.beans.factory.annotation.Qualifier;
import org.springframework.boot.autoconfigure.condition.ConditionalOnProperty;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.stereotype.Repository;

import java.math.BigDecimal;
import java.sql.ResultSet;
import java.sql.SQLException;
import java.time.LocalDate;
import java.time.format.DateTimeFormatter;
import java.util.List;

/**
 * 생산계획현황 (TPS, 회사 1000 / 공장 1000) — 더존 iCUBE 생산계획현황 화면의 탭별 쿼리를 옮긴 것. 조회 전용.
 *
 * <p>정본과 다른 점(모든 탭 공통):
 * <ul>
 *   <li>ROWNUM 페이징(RN 3000~4000 식)을 뺐다 — 기간 전체를 한 번에 받아 화면에서 필터/정렬한다. 한 달 수천 행.</li>
 *   <li>SELECT 에 안 쓰이는 조인을 뺐다 — 제판: 투입처(MC3) / 인쇄: 구매요청·발주·자재예약(PPD·PPSX·IMSX) /
 *       후가공·접지: 용지(CI·CI2) / 제본: 인쇄정보(PPIX)·용지(CI2). 결과 컬럼과 행 수는 같다(2026-10-01 인쇄 8월 대조).</li>
 * </ul>
 * 조인 조건·코드값(FIELD_CD 등)·고정 조건(접지/제본의 LAST_YN·SUPP_YN)은 정본과 동일하다. 정본 SQL 은 사용자 제공(2026-09-28, 10-01).
 * 기간은 계획일(PLAN_DT, yyyyMMdd 문자열) 기준 양끝 포함이며, 실적상태 서브쿼리(PPI)와 본문에 같은 기간을 두 번 바인딩한다.
 */
@Repository
@RequiredArgsConstructor
@ConditionalOnProperty(name = "oracle.enabled", havingValue = "true")
public class OracleProductionPlanRepository {

    @Qualifier("oracleJdbcTemplate")
    private final JdbcTemplate jdbcTemplate;

    private static final DateTimeFormatter BASIC = DateTimeFormatter.BASIC_ISO_DATE;

    /**
     * 실적상태 서브쿼리 — 생산오더 연동(PP_PROD_IF) 중 취소된 오더(PP_PROD_MST.CNCL_YN) 를 뺀 것. 탭마다 계획 테이블만 다르다.
     * 정본의 NOT EXISTS 는 PP_PROD_IF 를 한 번 더 거치지만(PPI2) 바깥 PPI 자신이 그 조건을 만족하므로 결과가 같다 —
     * PP_PROD_MST 만 보게 줄였다. 후가공 8월 기준 731행 동일, 13.9s → 2.2s (2026-10-01 실측).
     */
    private static String resultSub(String planTable, String extraWhere) {
        return """
                LEFT OUTER JOIN (
                        SELECT  PPIX.PLAN_NO, PPIX.PLAN_SQ, PPIX.PLAN_LOW_SQ, PPIX.TOP_ORGN_CD, PPI.INTL_ST, PPI.BASE_END_DT
                        FROM    %s PPIX
                        INNER JOIN PP_PROD_IF PPI   ON  PPI.COMPANY_CD = PPIX.COMPANY_CD
                                                    AND PPI.PLANT_CD = PPIX.PLANT_CD
                                                    AND PPI.SODOC_NO = PPIX.PLAN_NO
                                                    AND PPI.SODOC_SQ = PPIX.PLAN_SQ
                                                    AND PPI.INTL_NO = PPIX.PLAN_LOW_SQ
                                                    AND PPI.REL1_CD = PPIX.TOP_ORGN_CD
                                                    AND NOT EXISTS (
                                                            SELECT  1
                                                            FROM    PP_PROD_MST PPM
                                                            WHERE   PPM.COMPANY_CD = PPI.COMPANY_CD
                                                            AND     PPM.PROD_NO = PPI.PROD_NO
                                                            AND     PPM.CNCL_YN = 'Y')
                        WHERE   PPIX.COMPANY_CD = '1000'
                        AND     PPIX.PLANT_CD = '1000'
                        AND     PPIX.PLAN_DT BETWEEN ? AND ?
                        %s
                ) PPI   ON  PPI.PLAN_NO = M.PLAN_NO
                        AND PPI.PLAN_SQ = M.PLAN_SQ
                        AND PPI.PLAN_LOW_SQ = M.PLAN_LOW_SQ
                        AND PPI.TOP_ORGN_CD = M.TOP_ORGN_CD
                """.formatted(planTable, extraWhere);
    }

    /** 주문명·영업거래처 — 주문(SOMX) 또는 사전주문(PPRMX) 에서. 모든 탭 동일. */
    private static final String ORDER_JOINS = """
            LEFT OUTER JOIN SD_ORDER_MST_X20329 SOMX    ON  SOMX.COMPANY_CD = M.COMPANY_CD
                                                        AND SOMX.ORDDOC_NO = M.ORDDOC_NO
                                                        AND SOMX.PLAN_PLANT_CD = M.PLANT_CD
            LEFT OUTER JOIN CI_PARTNER_MST CPM          ON  CPM.PARTNER_CD = SOMX.PARTNER_CD
            LEFT OUTER JOIN PP_PREORD_MST_X20329 PPRMX  ON  PPRMX.COMPANY_CD = M.COMPANY_CD
                                                        AND PPRMX.PLAN_ORD_NO = M.ORDDOC_NO
                                                        AND PPRMX.PLANT_CD = M.PLANT_CD
            LEFT OUTER JOIN PM_EQ_SDTL PES  ON  PES.COMPANY_CD = M.COMPANY_CD
                                            AND PES.EQP_CD = M.EQP_CD
                                            AND PES.LANG_CD = 'KO'
            LEFT OUTER JOIN MA_CODEDTL MCS  ON  MCS.COMPANY_CD = M.COMPANY_CD
                                            AND MCS.MODULE_CD = 'CI'
                                            AND MCS.FIELD_CD = 'P00070'
                                            AND MCS.SYSDEF_CD = PPI.INTL_ST
            """;

    /** 계획 상세(세부품목명) — 계획이력순번까지 맞춘다. */
    private static final String PLAN_DTL_JOIN = """
            LEFT OUTER JOIN PP_PLAN_DTL_X20329 PPDX     ON  PPDX.COMPANY_CD = M.COMPANY_CD
                                                        AND PPDX.PLANT_CD = M.PLANT_CD
                                                        AND PPDX.PLAN_NO = M.PLAN_NO
                                                        AND PPDX.PLAN_HIS_SQ = M.PLAN_HIS_SQ
                                                        AND PPDX.PLAN_SQ = M.PLAN_SQ
            """;

    /** 공통코드 한 건 — MA_CODEDTL(모듈/필드/코드). */
    private static String code(String alias, String module, String field, String codeExpr) {
        return """
                LEFT OUTER JOIN MA_CODEDTL %1$s ON  %1$s.COMPANY_CD = M.COMPANY_CD
                                                AND %1$s.MODULE_CD = '%2$s'
                                                AND %1$s.FIELD_CD = '%3$s'
                                                AND %1$s.SYSDEF_CD = %4$s
                """.formatted(alias, module, field, codeExpr);
    }

    private static final String COMMON_SELECT = """
            SELECT  M.PLAN_NO, M.PLAN_SQ, M.PLAN_LOW_SQ, M.PLAN_DT, M.ORDDOC_NO
            ,       NVL(SOMX.ORDDOC_NM, PPRMX.QODOC_NM) AS ORDDOC_NM
            ,       CPM.PARTNER_NM, M.ORDDOC_SQ, M.ITEM_CD, PPDX.SPCFCS_ITEM_NM, M.ORD_QT
            ,       PES.EQP_NM
            ,       M.WRK_UM, M.WRK_AMT, M.STD_UM, M.STD_AMT
            ,       NVL(M.PRPCNT_CLOSE_YN, 'N') AS PRPCNT_CLOSE_YN
            ,       PPI.INTL_ST
            ,       NVL(MCS.SYSDEF_NM, '실적없음') AS INTL_ST_NM
            ,       PPI.BASE_END_DT
            """;

    private static final String COMMON_WHERE = """
            WHERE   M.COMPANY_CD = '1000'
            AND     M.PLANT_CD = '1000'
            AND     M.PLAN_DT BETWEEN ? AND ?
            """;

    // ── 인쇄 — PP_PLANPRW_INFO_X20329 ──
    private static final String PRINT_SQL = COMMON_SELECT + """
            ,       PPDX.ITEM_NM
            ,       MC2.SYSDEF_NM AS CONFIG_NM
            ,       MC4.SYSDEF_NM AS OP_NM
            ,       MC3.SYSDEF_NM AS INTLTSH_NM
            ,       MC5.SYSDEF_NM AS WRK_NM
            ,       M.PRPCNT_SQ, M.START_PAGE_CNT, M.END_PAGE_CNT
            ,       CASE WHEN MEI.INOUTCOM_FG = '03' AND MC5.FLAG_CD = 'N' THEN NULL ELSE M.MTRIL_CD END AS MTRIL_CD
            ,       CASE WHEN MEI.INOUTCOM_FG = '03' AND MC5.FLAG_CD = 'N' THEN NULL ELSE CI2.ITEM_NM END AS MTRIL_NM
            ,       DECODE(PPLIX.PLAN_NO, NULL, MC7.SYSDEF_NM, MC8.SYSDEF_NM) AS PLMK_NM
            ,       M.DTL_SIZE_DC, M.PGS, M.DTL_DC, M.PPR_DIVD_QT
            ,       M.GNRL_PRW_BEF_QT, M.GNRL_PRW_AFTR_QT, M.SPCLR_PRW_BEF_QT, M.SPCLR_PRW_AFTR_QT, M.PLTE_CNT_SUM_QT
            ,       M.NET_QT, M.SPRE_QT, M.FULL_QT, M.ADJT_QT, M.DIVD_CNT
            ,       M.NET_PPCNT_QT, M.SPRE_PPCNT_QT, M.FULL_PPCNT_QT, M.ADJT_PPCNT_QT, M.ADJT_PPCNT_SUM_QT, M.TONG_CNT
            ,       M.GRPG_YN, M.GRP_YN, M.GRP_SQ, M.VNR_NET_QT, M.VNR_SPRE_QT, M.VNR_ADJT_QT
            FROM    PP_PLANPRW_INFO_X20329 M
            """ + PLAN_DTL_JOIN + """
            LEFT OUTER JOIN PP_OPSTDPRI_INFO_X20329 POIX    ON  POIX.COMPANY_CD = M.COMPANY_CD
                                                            AND POIX.PLANT_CD = M.PLANT_CD
                                                            AND POIX.WRK_CD = M.WRK_CD
                                                            AND NVL(POIX.USE_YN, 'N') = 'Y'
                                                            AND NVL(POIX.PARTNER_CD_USE_YN, 'N') = 'N'
            LEFT OUTER JOIN PP_PLANPLMK_INFO_X20329 PPLIX   ON  PPLIX.COMPANY_CD = M.COMPANY_CD
                                                            AND PPLIX.PLANT_CD = M.PLANT_CD
                                                            AND PPLIX.KEY_VAL_NM = M.KEY_VAL_NM
                                                            AND NVL(PPLIX.SUPP_YN, 'N') != 'Y'
            """ + resultSub("PP_PLANPRW_INFO_X20329", "") + ORDER_JOINS + """
            LEFT OUTER JOIN ME_EQPCAPA_INFO MEI     ON  MEI.COMPANY_CD = M.COMPANY_CD
                                                    AND MEI.PLANT_CD = M.PLANT_CD
                                                    AND MEI.EQP_CD = M.EQP_CD
            """
            + code("MC2", "SD", "Z007_20329", "M.CONFIG_CD")
            + code("MC3", "PP", "Z002_20329", "M.INTLTSH_CD")
            + code("MC4", "PP", "Z005_20329", "POIX.UP_ORGN_CD")
            + code("MC5", "SD", "Z010_20329", "M.WRK_CD")
            + code("MC7", "SD", "Z010_20329", "M.PLMK_CD")
            + code("MC8", "SD", "Z010_20329", "PPLIX.WRK_CD") + """
            LEFT OUTER JOIN CI_ITEM CI2     ON  CI2.ITEM_CD = M.MTRIL_CD
            """ + COMMON_WHERE + """
            ORDER BY M.PLAN_NO, M.PLAN_SQ, M.PLAN_LOW_SQ
            """;

    // ── 제판 — PP_PLANPLMK_INFO_X20329 ──
    private static final String PLATE_SQL = COMMON_SELECT + """
            ,       CI.ITEM_NM
            ,       MC.SYSDEF_NM AS CONFIG_NM
            ,       MC2.SYSDEF_NM AS OP_NM
            ,       MC4.SYSDEF_NM AS WRK_NM
            ,       M.PRPCNT_SQ
            ,       PPIX.MTRIL_CD, CI.ITEM_NM AS MTRIL_NM
            ,       PPIX.DTL_SIZE_DC, PPIX.DTL_DC, PPIX.PGS, PPIX.PPR_DIVD_QT
            ,       PPIX.GNRL_PRW_BEF_QT, PPIX.GNRL_PRW_AFTR_QT, PPIX.SPCLR_PRW_BEF_QT, PPIX.SPCLR_PRW_AFTR_QT
            ,       M.PLTE_CNT_SUM_QT
            ,       PPIX.GRPG_YN, PPIX.GRP_YN, PPIX.GRP_SQ
            FROM    PP_PLANPLMK_INFO_X20329 M
            """ + PLAN_DTL_JOIN + """
            LEFT OUTER JOIN PP_PLANPRW_INFO_X20329 PPIX ON  M.COMPANY_CD = PPIX.COMPANY_CD
                                                        AND M.PLANT_CD = PPIX.PLANT_CD
                                                        AND M.KEY_VAL_NM = PPIX.KEY_VAL_NM
            """ + resultSub("PP_PLANPLMK_INFO_X20329", "") + ORDER_JOINS + """
            LEFT OUTER JOIN CI_ITEM CI      ON  CI.ITEM_CD = PPIX.MTRIL_CD
            """
            + code("MC", "SD", "Z007_20329", "M.CONFIG_CD")
            + code("MC2", "PP", "Z005_20329", "M.OP_CD")
            + code("MC4", "SD", "Z010_20329", "M.WRK_CD")
            + COMMON_WHERE + """
            ORDER BY M.PLAN_NO, M.PLAN_HIS_SQ, M.PLAN_SQ, M.PLAN_LOW_SQ
            """;

    // ── 후가공 — PP_PLANPROCS_INFO_X20329 ──
    private static final String PROCESS_SQL = COMMON_SELECT + """
            ,       PPDX.ITEM_NM
            ,       MC4.SYSDEF_NM AS CONFIG_NM
            ,       MC.SYSDEF_NM AS OP_NM
            ,       MC2.SYSDEF_NM AS INTLTSH_NM
            ,       MC3.SYSDEF_NM AS WRK_NM
            ,       M.PRPCNT_SQ
            ,       PPIX.DTL_SIZE_DC, PPIX.DTL_DC, PPIX.PGS, PPIX.PPR_DIVD_QT
            ,       M.PROC_QT
            FROM    PP_PLANPROCS_INFO_X20329 M
            """ + PLAN_DTL_JOIN + """
            LEFT OUTER JOIN PP_PLANPRW_INFO_X20329 PPIX ON  PPIX.COMPANY_CD = M.COMPANY_CD
                                                        AND PPIX.PLANT_CD = M.PLANT_CD
                                                        AND PPIX.KEY_VAL_NM = M.KEY_VAL_NM
            """ + resultSub("PP_PLANPROCS_INFO_X20329", "") + ORDER_JOINS
            + code("MC", "PP", "Z005_20329", "M.OP_CD")
            + code("MC2", "PP", "Z002_20329", "M.INTLTSH_CD")
            + code("MC3", "SD", "Z010_20329", "M.WRK_CD")
            + code("MC4", "SD", "Z007_20329", "M.CONFIG_CD")
            + COMMON_WHERE + """
            ORDER BY M.PLAN_NO, M.PLAN_SQ, M.PLAN_LOW_SQ
            """;

    /** 접지/제본 은 같은 테이블(PP_PLANBBND_INFO_X20329)을 제품여부(LAST_YN)·보충(SUPP_YN)으로 가른다 — ERP 고정값. */
    private static final String FOLD_FILTER = "AND NVL(PPIX.LAST_YN, 'N') != 'Y' AND NVL(PPIX.SUPP_YN, 'N') != 'Y'";
    private static final String BIND_FILTER = "AND (NVL(PPIX.LAST_YN, 'N') = 'Y' OR NVL(PPIX.SUPP_YN, 'N') = 'Y')";

    // ── 접지 — PP_PLANBBND_INFO_X20329 (제품 아님·보충 아님) ──
    private static final String FOLD_SQL = COMMON_SELECT + """
            ,       CI.ITEM_NM
            ,       MC.SYSDEF_NM AS CONFIG_NM
            ,       MC7.SYSDEF_NM AS OP_NM
            ,       MC5.SYSDEF_NM AS INTLTSH_NM
            ,       MC3.SYSDEF_NM AS WRK_NM
            ,       M.PRPCNT_SQ
            ,       PPIX.DTL_SIZE_DC, PPIX.DTL_DC, PPIX.PGS, PPIX.PPR_DIVD_QT
            ,       M.ORD_UNIT_CD
            FROM    PP_PLANBBND_INFO_X20329 M
            """ + PLAN_DTL_JOIN + """
            LEFT OUTER JOIN PP_PLANPRW_INFO_X20329 PPIX ON  PPIX.COMPANY_CD = M.COMPANY_CD
                                                        AND PPIX.PLANT_CD = M.PLANT_CD
                                                        AND PPIX.KEY_VAL_NM = M.KEY_VAL_NM
            """ + resultSub("PP_PLANBBND_INFO_X20329", FOLD_FILTER) + ORDER_JOINS + """
            LEFT OUTER JOIN CI_ITEM CI      ON  CI.ITEM_CD = M.ITEM_CD
            """
            + code("MC", "SD", "Z007_20329", "M.CONFIG_CD")
            + code("MC3", "SD", "Z010_20329", "M.WRK_CD")
            + code("MC5", "PP", "Z002_20329", "M.INTLTSH_CD")
            + code("MC7", "PP", "Z005_20329", "M.OP_CD")
            + COMMON_WHERE + FOLD_FILTER.replace("PPIX.", "M.") + """
            ORDER BY M.PLAN_NO, M.PLAN_SQ, M.PLAN_LOW_SQ
            """;

    // ── 제본 — PP_PLANBBND_INFO_X20329 (제품 또는 보충) ──
    private static final String BIND_SQL = COMMON_SELECT + """
            ,       CI.ITEM_NM
            ,       MC.SYSDEF_NM AS CONFIG_NM
            ,       MC7.SYSDEF_NM AS OP_NM
            ,       MC5.SYSDEF_NM AS INTLTSH_NM
            ,       MC3.SYSDEF_NM AS WRK_NM
            ,       M.FULL_PRPCNT_QT, M.FULL_PAGE_CNT, M.TOT_PGS
            ,       M.ORD_UNIT_CD
            ,       DECODE(M.LAST_YN, 'Y', 'YES', 'NO') AS LAST_YN
            FROM    PP_PLANBBND_INFO_X20329 M
            """ + PLAN_DTL_JOIN
            + resultSub("PP_PLANBBND_INFO_X20329", BIND_FILTER) + ORDER_JOINS + """
            LEFT OUTER JOIN CI_ITEM CI      ON  CI.ITEM_CD = M.ITEM_CD
            """
            + code("MC", "SD", "Z007_20329", "M.CONFIG_CD")
            + code("MC3", "SD", "Z010_20329", "M.WRK_CD")
            + code("MC5", "PP", "Z002_20329", "M.INTLTSH_CD")
            + code("MC7", "PP", "Z005_20329", "M.OP_CD")
            + COMMON_WHERE + BIND_FILTER.replace("PPIX.", "M.") + """
            ORDER BY M.PLAN_NO, M.PLAN_SQ, M.PLAN_LOW_SQ
            """;

    public List<Row> findRows(Tab tab, LocalDate startDate, LocalDate endDate) {
        String start = startDate.format(BASIC);
        String end = endDate.format(BASIC);
        String sql = switch (tab) {
            case PRINT -> PRINT_SQL;
            case PLATE -> PLATE_SQL;
            case PROCESS -> PROCESS_SQL;
            case FOLD -> FOLD_SQL;
            case BIND -> BIND_SQL;
        };
        // 실적상태 서브쿼리 → 본문 순서로 기간이 두 번 들어간다.
        return jdbcTemplate.query(sql, (rs, i) -> map(tab, rs), start, end, start, end);
    }

    private Row map(Tab tab, ResultSet rs) throws SQLException {
        Row.RowBuilder b = Row.builder()
                .planNo(rs.getString("PLAN_NO"))
                .planSq(integer(rs, "PLAN_SQ"))
                .planLowSq(integer(rs, "PLAN_LOW_SQ"))
                .planDate(ymd(rs.getString("PLAN_DT")))
                .orderNo(rs.getString("ORDDOC_NO"))
                .orderName(rs.getString("ORDDOC_NM"))
                .orderSq(integer(rs, "ORDDOC_SQ"))
                .partnerName(rs.getString("PARTNER_NM"))
                .itemCd(rs.getString("ITEM_CD"))
                .itemName(rs.getString("ITEM_NM"))
                .detailItemName(rs.getString("SPCFCS_ITEM_NM"))
                .orderQty(rs.getBigDecimal("ORD_QT"))
                .configName(rs.getString("CONFIG_NM"))
                .processName(rs.getString("OP_NM"))
                .workName(rs.getString("WRK_NM"))
                .equipmentName(rs.getString("EQP_NM"))
                .workUnitPrice(rs.getBigDecimal("WRK_UM"))
                .workAmount(rs.getBigDecimal("WRK_AMT"))
                .stdUnitPrice(rs.getBigDecimal("STD_UM"))
                .stdAmount(rs.getBigDecimal("STD_AMT"))
                .pressCloseYn(rs.getString("PRPCNT_CLOSE_YN"))
                .resultStatusCd(rs.getString("INTL_ST"))
                .resultStatusName(rs.getString("INTL_ST_NM"))
                .resultDate(ymd(rs.getString("BASE_END_DT")));

        if (tab != Tab.BIND) {
            b.pressSq(rs.getBigDecimal("PRPCNT_SQ"))
             .cutSize(rs.getString("DTL_SIZE_DC"))
             .imposition(rs.getString("DTL_DC"))
             .pages(rs.getBigDecimal("PGS"))
             .cutCount(rs.getBigDecimal("PPR_DIVD_QT"));
        }
        if (tab != Tab.PLATE) {
            b.seriesName(rs.getString("INTLTSH_NM"));
        }
        if (tab == Tab.PRINT || tab == Tab.PLATE) {
            b.materialCd(rs.getString("MTRIL_CD"))
             .materialName(rs.getString("MTRIL_NM"))
             .generalFront(rs.getBigDecimal("GNRL_PRW_BEF_QT"))
             .generalBack(rs.getBigDecimal("GNRL_PRW_AFTR_QT"))
             .spotFront(rs.getBigDecimal("SPCLR_PRW_BEF_QT"))
             .spotBack(rs.getBigDecimal("SPCLR_PRW_AFTR_QT"))
             .plateCount(rs.getBigDecimal("PLTE_CNT_SUM_QT"))
             .groupParentYn(rs.getString("GRPG_YN"))
             .groupChildYn(rs.getString("GRP_YN"))
             .groupSq(rs.getBigDecimal("GRP_SQ"));
        }
        switch (tab) {
            case PRINT -> b.startPage(rs.getBigDecimal("START_PAGE_CNT"))
                    .endPage(rs.getBigDecimal("END_PAGE_CNT"))
                    .plateInfoName(rs.getString("PLMK_NM"))
                    .netReam(rs.getBigDecimal("NET_QT"))
                    .spareReam(rs.getBigDecimal("SPRE_QT"))
                    .fullReam(rs.getBigDecimal("FULL_QT"))
                    .adjReam(rs.getBigDecimal("ADJT_QT"))
                    .cutTimes(rs.getBigDecimal("DIVD_CNT"))
                    .netSheets(rs.getBigDecimal("NET_PPCNT_QT"))
                    .spareSheets(rs.getBigDecimal("SPRE_PPCNT_QT"))
                    .fullSheets(rs.getBigDecimal("FULL_PPCNT_QT"))
                    .adjSheets(rs.getBigDecimal("ADJT_PPCNT_QT"))
                    .adjSheetsSum(rs.getBigDecimal("ADJT_PPCNT_SUM_QT"))
                    .tongCount(rs.getBigDecimal("TONG_CNT"))
                    .groupNet(rs.getBigDecimal("VNR_NET_QT"))
                    .groupSpare(rs.getBigDecimal("VNR_SPRE_QT"))
                    .groupAdj(rs.getBigDecimal("VNR_ADJT_QT"));
            case PROCESS -> b.procQty(rs.getBigDecimal("PROC_QT"));
            case FOLD -> b.orderUnitCd(rs.getString("ORD_UNIT_CD"));
            case BIND -> b.orderUnitCd(rs.getString("ORD_UNIT_CD"))
                    .fullPressCount(rs.getBigDecimal("FULL_PRPCNT_QT"))
                    .fullPageCount(rs.getBigDecimal("FULL_PAGE_CNT"))
                    .totalPages(rs.getBigDecimal("TOT_PGS"))
                    .lastYn(rs.getString("LAST_YN"));
            case PLATE -> { }
        }
        return b.build();
    }

    private static Integer integer(ResultSet rs, String col) throws SQLException {
        BigDecimal v = rs.getBigDecimal(col);
        return v == null ? null : v.intValue();
    }

    /** ERP 날짜 문자열 yyyyMMdd → yyyy-MM-dd. 형식이 다르면 원문 그대로. */
    private static String ymd(String s) {
        if (s == null) return null;
        String t = s.trim();
        return t.length() == 8 ? t.substring(0, 4) + "-" + t.substring(4, 6) + "-" + t.substring(6, 8) : t;
    }
}
