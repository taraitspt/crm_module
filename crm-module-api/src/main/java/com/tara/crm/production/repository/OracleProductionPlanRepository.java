package com.tara.crm.production.repository;

import com.tara.crm.production.dto.ProductionPlanDto;
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
 * 생산계획현황 (TPS, 회사 1000 / 공장 1000) — 더존 iCUBE 생산계획현황 화면 쿼리를 그대로 옮긴 것. 조회 전용.
 *
 * <p>정본과 다른 점:
 * <ul>
 *   <li>ROWNUM 페이징(RN 3000~4000 식)을 뺐다 — 기간 전체를 한 번에 받아 화면에서 필터/정렬한다. 한 달 약 6천 행.</li>
 *   <li>SELECT 에 안 쓰이는 투입처(INTLTSH_CD, MC3) 조인을 뺐다.</li>
 * </ul>
 * 조인·조건·코드값(FIELD_CD 등)은 정본과 동일하다. 정본 SQL 은 사용자 제공(2026-09-28).
 */
@Repository
@RequiredArgsConstructor
@ConditionalOnProperty(name = "oracle.enabled", havingValue = "true")
public class OracleProductionPlanRepository {

    @Qualifier("oracleJdbcTemplate")
    private final JdbcTemplate jdbcTemplate;

    private static final DateTimeFormatter BASIC = DateTimeFormatter.BASIC_ISO_DATE;

    /** 제판 탭 — PP_PLANPLMK_INFO_X20329. 기간은 계획일(PLAN_DT, yyyyMMdd 문자열) 기준 양끝 포함. */
    private static final String PLATE_SQL = """
            SELECT  PPLIX.PLAN_NO
            ,       PPLIX.PLAN_SQ
            ,       PPLIX.PLAN_LOW_SQ
            ,       PPLIX.PLAN_DT
            ,       PPLIX.ORDDOC_NO
            ,       NVL(SOMX.ORDDOC_NM, PPRMX.QODOC_NM) AS ORDDOC_NM
            ,       CPM.PARTNER_NM
            ,       PPLIX.ORDDOC_SQ
            ,       PPLIX.ITEM_CD
            ,       CI.ITEM_NM
            ,       PPDX.SPCFCS_ITEM_NM
            ,       PPLIX.ORD_QT
            ,       MC.SYSDEF_NM AS CONFIG_NM
            ,       MC2.SYSDEF_NM AS OP_NM
            ,       MC4.SYSDEF_NM AS WRK_NM
            ,       PPLIX.PRPCNT_SQ
            ,       PES.EQP_NM
            ,       PPIX.MTRIL_CD
            ,       CI.ITEM_NM AS MTRIL_NM
            ,       PPIX.DTL_SIZE_DC
            ,       PPIX.DTL_DC
            ,       PPIX.PGS
            ,       PPIX.PPR_DIVD_QT
            ,       PPIX.GNRL_PRW_BEF_QT
            ,       PPIX.GNRL_PRW_AFTR_QT
            ,       PPIX.SPCLR_PRW_BEF_QT
            ,       PPIX.SPCLR_PRW_AFTR_QT
            ,       PPLIX.PLTE_CNT_SUM_QT
            ,       PPLIX.WRK_UM
            ,       PPLIX.WRK_AMT
            ,       PPLIX.STD_UM
            ,       PPLIX.STD_AMT
            ,       PPIX.GRPG_YN
            ,       PPIX.GRP_YN
            ,       PPIX.GRP_SQ
            ,       NVL(PPLIX.PRPCNT_CLOSE_YN, 'N') AS PRPCNT_CLOSE_YN
            ,       PPI.INTL_ST
            ,       NVL(MC5.SYSDEF_NM, '실적없음') AS INTL_ST_NM
            ,       PPI.BASE_END_DT
            FROM    PP_PLANPLMK_INFO_X20329 PPLIX
            LEFT OUTER JOIN PP_PLAN_DTL_X20329 PPDX     ON  PPDX.COMPANY_CD = PPLIX.COMPANY_CD
                                                        AND PPDX.PLANT_CD = PPLIX.PLANT_CD
                                                        AND PPDX.PLAN_NO = PPLIX.PLAN_NO
                                                        AND PPDX.PLAN_HIS_SQ = PPLIX.PLAN_HIS_SQ
                                                        AND PPDX.PLAN_SQ = PPLIX.PLAN_SQ
            LEFT OUTER JOIN PP_PLANPRW_INFO_X20329 PPIX ON  PPLIX.COMPANY_CD = PPIX.COMPANY_CD
                                                        AND PPLIX.PLANT_CD = PPIX.PLANT_CD
                                                        AND PPLIX.KEY_VAL_NM = PPIX.KEY_VAL_NM
            LEFT OUTER JOIN SD_ORDER_MST_X20329 SOMX    ON  SOMX.COMPANY_CD = PPLIX.COMPANY_CD
                                                        AND SOMX.ORDDOC_NO = PPLIX.ORDDOC_NO
                                                        AND SOMX.PLAN_PLANT_CD = PPLIX.PLANT_CD
            LEFT OUTER JOIN CI_PARTNER_MST CPM          ON  CPM.PARTNER_CD = SOMX.PARTNER_CD
            LEFT OUTER JOIN PP_PREORD_MST_X20329 PPRMX  ON  PPRMX.COMPANY_CD = PPLIX.COMPANY_CD
                                                        AND PPRMX.PLAN_ORD_NO = PPLIX.ORDDOC_NO
                                                        AND PPRMX.PLANT_CD = PPLIX.PLANT_CD
            LEFT OUTER JOIN (
                    SELECT  PPIX.PLAN_NO, PPIX.PLAN_SQ, PPIX.PLAN_LOW_SQ, PPIX.TOP_ORGN_CD, PPI.INTL_ST, PPI.BASE_END_DT
                    FROM    PP_PLANPLMK_INFO_X20329 PPIX
                    INNER JOIN PP_PROD_IF PPI   ON  PPI.COMPANY_CD = PPIX.COMPANY_CD
                                                AND PPI.PLANT_CD = PPIX.PLANT_CD
                                                AND PPI.SODOC_NO = PPIX.PLAN_NO
                                                AND PPI.SODOC_SQ = PPIX.PLAN_SQ
                                                AND PPI.INTL_NO = PPIX.PLAN_LOW_SQ
                                                AND PPI.REL1_CD = PPIX.TOP_ORGN_CD
                                                AND NOT EXISTS (
                                                        SELECT  1
                                                        FROM    PP_PROD_IF PPI2
                                                        INNER JOIN PP_PROD_MST PPM  ON  PPM.COMPANY_CD = PPI2.COMPANY_CD
                                                                                    AND PPM.PROD_NO = PPI2.PROD_NO
                                                                                    AND PPM.CNCL_YN = 'Y'
                                                        WHERE   PPM.COMPANY_CD = PPIX.COMPANY_CD
                                                        AND     PPM.PROD_NO = PPI.PROD_NO
                                                        AND     PPM.CNCL_YN = 'Y')
                    WHERE   PPIX.COMPANY_CD = '1000'
                    AND     PPIX.PLANT_CD = '1000'
                    AND     PPIX.PLAN_DT BETWEEN ? AND ?
            ) PPI   ON  PPI.PLAN_NO = PPLIX.PLAN_NO
                    AND PPI.PLAN_SQ = PPLIX.PLAN_SQ
                    AND PPI.PLAN_LOW_SQ = PPLIX.PLAN_LOW_SQ
                    AND PPI.TOP_ORGN_CD = PPLIX.TOP_ORGN_CD
            LEFT OUTER JOIN PM_EQ_SDTL PES  ON  PES.COMPANY_CD = PPLIX.COMPANY_CD
                                            AND PES.EQP_CD = PPLIX.EQP_CD
                                            AND PES.LANG_CD = 'KO'
            LEFT OUTER JOIN CI_ITEM CI      ON  CI.ITEM_CD = PPIX.MTRIL_CD
            LEFT OUTER JOIN MA_CODEDTL MC   ON  MC.COMPANY_CD = PPLIX.COMPANY_CD
                                            AND MC.MODULE_CD = 'SD'
                                            AND MC.FIELD_CD = 'Z007_20329'
                                            AND MC.SYSDEF_CD = PPLIX.CONFIG_CD
            LEFT OUTER JOIN MA_CODEDTL MC2  ON  MC2.COMPANY_CD = PPLIX.COMPANY_CD
                                            AND MC2.MODULE_CD = 'PP'
                                            AND MC2.FIELD_CD = 'Z005_20329'
                                            AND MC2.SYSDEF_CD = PPLIX.OP_CD
            LEFT OUTER JOIN MA_CODEDTL MC4  ON  MC4.COMPANY_CD = PPLIX.COMPANY_CD
                                            AND MC4.MODULE_CD = 'SD'
                                            AND MC4.FIELD_CD = 'Z010_20329'
                                            AND MC4.SYSDEF_CD = PPLIX.WRK_CD
            LEFT OUTER JOIN MA_CODEDTL MC5  ON  MC5.COMPANY_CD = PPLIX.COMPANY_CD
                                            AND MC5.MODULE_CD = 'CI'
                                            AND MC5.FIELD_CD = 'P00070'
                                            AND MC5.SYSDEF_CD = PPI.INTL_ST
            WHERE   PPLIX.COMPANY_CD = '1000'
            AND     PPLIX.PLANT_CD = '1000'
            AND     PPLIX.PLAN_DT BETWEEN ? AND ?
            ORDER BY PPLIX.PLAN_NO, PPLIX.PLAN_HIS_SQ, PPLIX.PLAN_SQ, PPLIX.PLAN_LOW_SQ
            """;

    public List<ProductionPlanDto.PlateRow> findPlateRows(LocalDate startDate, LocalDate endDate) {
        String start = startDate.format(BASIC);
        String end = endDate.format(BASIC);
        return jdbcTemplate.query(PLATE_SQL, this::mapPlateRow, start, end, start, end);
    }

    private ProductionPlanDto.PlateRow mapPlateRow(ResultSet rs, int rowNum) throws SQLException {
        return ProductionPlanDto.PlateRow.builder()
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
                .pressSq(rs.getBigDecimal("PRPCNT_SQ"))
                .equipmentName(rs.getString("EQP_NM"))
                .materialCd(rs.getString("MTRIL_CD"))
                .materialName(rs.getString("MTRIL_NM"))
                .cutSize(rs.getString("DTL_SIZE_DC"))
                .pages(rs.getBigDecimal("PGS"))
                .imposition(rs.getString("DTL_DC"))
                .cutCount(rs.getBigDecimal("PPR_DIVD_QT"))
                .generalFront(rs.getBigDecimal("GNRL_PRW_BEF_QT"))
                .generalBack(rs.getBigDecimal("GNRL_PRW_AFTR_QT"))
                .spotFront(rs.getBigDecimal("SPCLR_PRW_BEF_QT"))
                .spotBack(rs.getBigDecimal("SPCLR_PRW_AFTR_QT"))
                .plateCount(rs.getBigDecimal("PLTE_CNT_SUM_QT"))
                .groupParentYn(rs.getString("GRPG_YN"))
                .groupChildYn(rs.getString("GRP_YN"))
                .groupSq(rs.getBigDecimal("GRP_SQ"))
                .workUnitPrice(rs.getBigDecimal("WRK_UM"))
                .workAmount(rs.getBigDecimal("WRK_AMT"))
                .stdUnitPrice(rs.getBigDecimal("STD_UM"))
                .stdAmount(rs.getBigDecimal("STD_AMT"))
                .pressCloseYn(rs.getString("PRPCNT_CLOSE_YN"))
                .resultStatusCd(rs.getString("INTL_ST"))
                .resultStatusName(rs.getString("INTL_ST_NM"))
                .resultDate(ymd(rs.getString("BASE_END_DT")))
                .build();
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
