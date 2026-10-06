package com.tara.crm.stats.repository;

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
 * 매출 후 잔여재고 (TPS, 회사 1000 / 공장 1000) — "매출은 등록했는데 재고자산이 아직 남아 있는 주문(배치)". 조회 전용.
 *
 * <p>재고는 ERP 재고자산 현황 쿼리(사용자 제공 2026-10-06)를 그대로 쓴다: 현재고(IM_ONHAND_INFO) − 오늘 자재전표(IM_MTLDOC_DTL, 로트 단위) = 오늘 기준 재고.
 * 배치번호(BATCH_NO)는 "주문번호-주문순번"(TOR2026082500005-1, 의뢰는 PQE…)이라 주문 라인과 1:1 로 이어진다 — 매출(SD_BILL_DTL.BATCH_NO)도 같은 키.
 * 한 줄 = 배치(주문 라인). 재고는 품목·창고가 여럿이면 합치고 이름은 LISTAGG. 매출은 건수·수량 합·마지막 매출일.
 * 매출수량 ≥ 주문수량이면 "전량 매출"(재고가 남아 있으면 안 되는 상태), 아니면 "부분 매출"(분할매출 진행 중).
 *
 * <p>2026-10-06 기준: 재고 있는 TOR 배치 2,040개 중 매출 등록된 것 128개(재고 916만), 매출 없는 것 1,912개(정상, 매출 전).
 * 조회 조건은 마지막 매출일 범위(선택). 컬럼이 많아 Map(camelCase)으로 내려준다.
 */
@Repository
@ConditionalOnProperty(name = "oracle.enabled", havingValue = "true")
public class OracleStockLeftoverRepository {

    private final NamedParameterJdbcTemplate jdbc;

    public OracleStockLeftoverRepository(@Qualifier("oracleJdbcTemplate") JdbcTemplate jdbcTemplate) {
        this.jdbc = new NamedParameterJdbcTemplate(jdbcTemplate);
    }

    private static final DateTimeFormatter BASIC = DateTimeFormatter.BASIC_ISO_DATE;

    /** ERP 재고자산 현황의 핵심부 — 품목×재고주체×배치×창고별 오늘 기준 재고(0 이 아닌 것). :today = yyyyMMdd. */
    private static final String INV_CORE = """
            SELECT T_UNION.ITEM_CD, T_UNION.STD_UNIT_CD, T_UNION.INV_INST_TP_CD, T_UNION.INV_DSNT_CD, T_UNION.BATCH_NO,
                   SUM(T_UNION.TOTAL_INVT) - SUM(T_UNION.T_MTLDOC_TOTAL_INV) AS TOTAL_INVT, T_UNION.SL_CD
            FROM (
                SELECT IOI.ITEM_CD, IOI.STD_UNIT_CD, IOI.INV_INST_TP_CD,
                       (CASE WHEN IOI.INV_INST_TP_CD NOT IN ('1','2','3','4') THEN '*' ELSE IOI.INV_DSNT_CD END) INV_DSNT_CD,
                       IOI.BATCH_NO, SUM(CTINVNTRY_QT) AS TOTAL_INVT, 0 AS T_MTLDOC_TOTAL_INV, T_SL.SL_CD
                FROM IM_ONHAND_INFO IOI
                INNER JOIN MA_ITEM MI ON MI.COMPANY_CD = IOI.COMPANY_CD AND MI.ITEM_CD = IOI.ITEM_CD
                INNER JOIN MA_SL_INFO T_SL ON T_SL.SL_CD = IOI.SL_CD AND T_SL.COMPANY_CD = IOI.COMPANY_CD AND T_SL.PLANT_CD = IOI.PLANT_CD AND T_SL.USE_YN = 'Y'
                WHERE IOI.COMPANY_CD = '1000' AND IOI.PLANT_CD = '1000'
                GROUP BY IOI.ITEM_CD, IOI.STD_UNIT_CD, IOI.INV_INST_TP_CD, IOI.INV_DSNT_CD, IOI.BATCH_NO, T_SL.SL_CD
                UNION ALL
                SELECT MTD.ITEM_CD, MTD.STD_UNIT_CD, COALESCE(MTD.INV_INST_CD, '*') AS INV_INST_TP_CD,
                       CASE WHEN COALESCE(MTD.INV_INST_CD, '*') IN ('1','4') THEN MTD.PARTNER_CD
                            WHEN COALESCE(MTD.INV_INST_CD, '*') = '2' THEN MTD.SODOC_NO
                            WHEN COALESCE(MTD.INV_INST_CD, '*') = '3' THEN MTD.WBS_NO ELSE '*' END AS INV_DSNT_CD,
                       COALESCE(T_MTLDOC_LOT.BATCH_NO, '*') AS BATCH_NO, 0 AS TOTAL_INVT,
                       SUM(COALESCE(T_MTLDOC_LOT.STD_UNIT_QT, MTD.STD_UNIT_QT)) AS T_MTLDOC_TOTAL_INV, T_SL.SL_CD
                FROM IM_MTLDOC_DTL MTD
                INNER JOIN MA_ITEM MI ON MI.COMPANY_CD = MTD.COMPANY_CD AND MI.ITEM_CD = MTD.ITEM_CD
                INNER JOIN MA_SL_INFO T_SL ON T_SL.COMPANY_CD = MTD.COMPANY_CD AND T_SL.PLANT_CD = MTD.PLANT_CD AND T_SL.SL_CD = MTD.SL_CD AND T_SL.USE_YN = 'Y'
                LEFT OUTER JOIN IM_MTLDOC_LOT T_MTLDOC_LOT ON T_MTLDOC_LOT.COMPANY_CD = MTD.COMPANY_CD AND T_MTLDOC_LOT.INVTRX_DOC_NO = MTD.INVTRX_DOC_NO AND T_MTLDOC_LOT.INVTRX_DOC_SQ = MTD.INVTRX_DOC_SQ
                WHERE MTD.COMPANY_CD = '1000' AND MTD.PLANT_CD = '1000' AND MTD.INVTRX_DT >= :today
                GROUP BY MTD.ITEM_CD, MTD.STD_UNIT_CD, COALESCE(T_MTLDOC_LOT.BATCH_NO, '*'), T_SL.SL_CD, COALESCE(MTD.INV_INST_CD, '*'), MTD.PARTNER_CD, MTD.SODOC_NO, MTD.WBS_NO
            ) T_UNION
            GROUP BY T_UNION.ITEM_CD, T_UNION.STD_UNIT_CD, T_UNION.INV_INST_TP_CD, T_UNION.INV_DSNT_CD, T_UNION.BATCH_NO, T_UNION.SL_CD
            HAVING (SUM(T_UNION.TOTAL_INVT) - SUM(T_UNION.T_MTLDOC_TOTAL_INV)) != 0
            """;

    private static final String SQL = """
            WITH INV AS (
            """ + INV_CORE + """
            ), B AS (
                -- 배치(주문 라인)별 재고 — 품목·창고가 여럿이면 합치고 이름을 이어 붙인다
                SELECT INV.BATCH_NO,
                       SUBSTR(INV.BATCH_NO, 1, INSTR(INV.BATCH_NO, '-') - 1) AS ORDDOC_NO,
                       TO_NUMBER(SUBSTR(INV.BATCH_NO, INSTR(INV.BATCH_NO, '-') + 1)) AS ORDDOC_SQ,
                       SUM(INV.TOTAL_INVT) AS STOCK_QT,
                       MIN(INV.STD_UNIT_CD) AS STD_UNIT_CD,
                       COUNT(*) AS STOCK_ROWS,
                       LISTAGG(DISTINCT INV.ITEM_CD, ',' ON OVERFLOW TRUNCATE '…' WITH COUNT) WITHIN GROUP (ORDER BY INV.ITEM_CD) AS ITEM_CDS,
                       LISTAGG(DISTINCT CI.ITEM_NM, ', ' ON OVERFLOW TRUNCATE '…' WITH COUNT) WITHIN GROUP (ORDER BY CI.ITEM_NM) AS ITEM_NMS,
                       LISTAGG(DISTINCT MSI.SL_NM, ', ' ON OVERFLOW TRUNCATE '…' WITH COUNT) WITHIN GROUP (ORDER BY MSI.SL_NM) AS SL_NMS
                FROM INV
                LEFT OUTER JOIN CI_ITEM CI ON CI.ITEM_CD = INV.ITEM_CD
                LEFT OUTER JOIN MA_SL_INFO MSI ON MSI.COMPANY_CD = '1000' AND MSI.PLANT_CD = '1000' AND MSI.SL_CD = INV.SL_CD
                WHERE REGEXP_LIKE(INV.BATCH_NO, '^(TOR|PQE)[0-9]+-[0-9]+$')
                GROUP BY INV.BATCH_NO
                HAVING SUM(INV.TOTAL_INVT) > 0
            ), BILL AS (
                -- 배치별 매출 — 건수·수량 합·첫/마지막 매출일
                SELECT SBD.BATCH_NO, COUNT(*) AS BILL_CNT, SUM(SBD.BILL_QT) AS BILL_QT,
                       MIN(SBM.BILL_DT) AS FIRST_BILL_DT, MAX(SBM.BILL_DT) AS LAST_BILL_DT,
                       LISTAGG(DISTINCT SBD.BILLDOC_NO, ', ' ON OVERFLOW TRUNCATE '…' WITH COUNT) WITHIN GROUP (ORDER BY SBD.BILLDOC_NO) AS BILLDOC_NOS
                FROM SD_BILL_DTL SBD
                INNER JOIN SD_BILL_MST SBM ON SBM.COMPANY_CD = SBD.COMPANY_CD AND SBM.BILLDOC_NO = SBD.BILLDOC_NO
                WHERE SBD.COMPANY_CD = '1000' AND REGEXP_LIKE(SBD.BATCH_NO, '^(TOR|PQE)[0-9]+-[0-9]+$')
                GROUP BY SBD.BATCH_NO
            )
            SELECT B.BATCH_NO, B.ORDDOC_NO, B.ORDDOC_SQ, B.STOCK_QT, B.STD_UNIT_CD, B.STOCK_ROWS, B.ITEM_CDS, B.ITEM_NMS, B.SL_NMS,
                   BILL.BILL_CNT, BILL.BILL_QT, BILL.FIRST_BILL_DT, BILL.LAST_BILL_DT, BILL.BILLDOC_NOS,
                   SOMX.ORDDOC_NM, SOMX.ORD_DT, SOMX.PARTNER_CD, CPM.PARTNER_NM, SOMX.DEPT_CD, MDM.DEPT_NM,
                   SOMX.BIZRSPT_EMPNO_CD, HEM.KOR_NM AS BIZRSPT_EMPNO_NM,
                   SODX.SPCFCS_ITEM_NM, SODX.ITEM_CD AS ORD_ITEM_CD, SODX.ORD_QT, TO_CHAR(SODX.DLVSH_DTS, 'yyyyMMdd') AS DLVSH_DTS,
                   CASE WHEN BILL.BILL_QT >= NVL(SODX.ORD_QT, 0) THEN 'FULL' ELSE 'PARTIAL' END AS BILL_ST,
                   NVL(SODX.ORD_QT, 0) - NVL(BILL.BILL_QT, 0) AS UNBILLED_QT
            FROM B
            INNER JOIN BILL ON BILL.BATCH_NO = B.BATCH_NO
            LEFT OUTER JOIN SD_ORDER_MST_X20329 SOMX ON SOMX.COMPANY_CD = '1000' AND SOMX.ORDDOC_NO = B.ORDDOC_NO
            LEFT OUTER JOIN SD_ORDER_DTL_X20329 SODX ON SODX.COMPANY_CD = '1000' AND SODX.ORDDOC_NO = B.ORDDOC_NO AND SODX.ORDDOC_SQ = B.ORDDOC_SQ
            LEFT OUTER JOIN CI_PARTNER_MST CPM ON CPM.PARTNER_CD = SOMX.PARTNER_CD
            LEFT OUTER JOIN MA_DEPT_MST MDM ON MDM.COMPANY_CD = '1000' AND MDM.DEPT_CD = SOMX.DEPT_CD
            LEFT OUTER JOIN HR_EMP_MST HEM ON HEM.COMPANY_CD = '1000' AND HEM.EMP_NO = SOMX.BIZRSPT_EMPNO_CD
            WHERE (:billFrom IS NULL OR BILL.LAST_BILL_DT >= :billFrom)
              AND (:billTo IS NULL OR BILL.LAST_BILL_DT <= :billTo)
            ORDER BY BILL.LAST_BILL_DT DESC, B.STOCK_QT DESC
            """;

    /** 매출 등록된 배치 중 오늘 기준 재고가 남은 것. billFrom/billTo 는 마지막 매출일 범위(선택). */
    public List<Map<String, Object>> findLeftovers(LocalDate billFrom, LocalDate billTo) {
        MapSqlParameterSource p = new MapSqlParameterSource()
                .addValue("today", LocalDate.now().format(BASIC))
                .addValue("billFrom", billFrom == null ? null : billFrom.format(BASIC), java.sql.Types.VARCHAR)
                .addValue("billTo", billTo == null ? null : billTo.format(BASIC), java.sql.Types.VARCHAR);
        return jdbc.query(SQL, p, this::map);
    }

    private Map<String, Object> map(ResultSet rs, int i) throws SQLException {
        ResultSetMetaData md = rs.getMetaData();
        Map<String, Object> row = new LinkedHashMap<>();
        for (int c = 1; c <= md.getColumnCount(); c++) {
            Object v = rs.getObject(c);
            if (v instanceof String str) v = str.trim();
            if (v instanceof java.sql.Timestamp ts) v = ts.toLocalDateTime().toLocalDate().toString();
            row.put(com.tara.crm.production.repository.OracleEquipmentPerfRepository.camel(md.getColumnLabel(c).toUpperCase(Locale.ROOT)), v);
        }
        return row;
    }
}
