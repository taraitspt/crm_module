package com.tara.crm.stats.repository;

import com.tara.crm.stats.dto.SalesListDto;
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
import java.util.ArrayList;
import java.util.List;

/**
 * 매출리스트 — ERP 매출모듈 SD_BILL_MST(머리) + SD_BILL_DTL(상세). 조회 전용.
 * 매출현황(OracleStatsRepository.getCustomerYearlySales)과 같은 원천·같은 사업부문 조건(DTL.PLANT_CD)이라 기간 합계가 같다.
 * 2026-08 부터 GRP·PM 은 ERP 매출모듈을 쓰지 않아 8월 이후 GRP·PM 줄은 없다(CLAUDE.md "ERP 매출·채권 데이터 소스").
 */
@Repository
@RequiredArgsConstructor
@ConditionalOnProperty(name = "oracle.enabled", havingValue = "true")
public class OracleSalesListRepository {

    @Qualifier("oracleJdbcTemplate")
    private final JdbcTemplate jdbcTemplate;

    private static final DateTimeFormatter BASIC = DateTimeFormatter.BASIC_ISO_DATE;

    public List<SalesListDto.Row> findRows(LocalDate from, LocalDate to, String plantCd) {
        StringBuilder sql = new StringBuilder("""
                SELECT b.BILL_DT, b.BILLDOC_NO, dt.BILL_SQ, b.BILL_TP, BT.BILL_TP_NM,
                       dt.PLANT_CD, b.SALEPRTN_CD, CPM.PARTNER_NM, CPM.BIZR_NO,
                       dt.SALESORGN_CD,
                       (SELECT d.DEPT_NM FROM VW_MA_DEPT_MST d
                         WHERE d.COMPANY_CD = b.COMPANY_CD AND d.DEPT_CD = dt.SALESORGN_CD AND ROWNUM = 1) AS SALES_DEPT_NM,
                       dt.CC_CD, dt.BIZRSPT_EMPNO_CD, HEM.KOR_NM AS SALES_EMP_NM,
                       dt.ITEM_CD, dt.ITEM_NM, dt.BILL_QT, dt.TRAN_UM,
                       NVL(dt.TRAN_AMT, 0) AS SUPPLY_AMT, NVL(dt.TAX_AMT, 0) AS TAX_AMT,
                       dt.SODOC_NO, dt.SODOC_SQ, b.DOCU_NO, dt.RMK_DC
                  FROM SD_BILL_MST b
                  JOIN SD_BILL_DTL dt ON dt.COMPANY_CD = b.COMPANY_CD AND dt.BILLDOC_NO = b.BILLDOC_NO
                  LEFT JOIN SD_BILTYPE_MST BT ON BT.COMPANY_CD = b.COMPANY_CD AND BT.BILL_TP = b.BILL_TP
                  LEFT JOIN CI_PARTNER_MST CPM ON CPM.PARTNER_CD = b.SALEPRTN_CD
                  LEFT JOIN HR_EMP_MST HEM ON HEM.COMPANY_CD = b.COMPANY_CD AND HEM.EMP_NO = dt.BIZRSPT_EMPNO_CD
                 WHERE b.COMPANY_CD = '1000'
                   AND b.BILL_DT BETWEEN ? AND ?
                """);
        List<Object> args = new ArrayList<>();
        args.add(from.format(BASIC));
        args.add(to.format(BASIC));
        if (plantCd != null && !plantCd.isBlank()) {
            sql.append(" AND dt.PLANT_CD = ?");
            args.add(plantCd.trim());
        }
        sql.append(" ORDER BY b.BILL_DT DESC, b.BILLDOC_NO DESC, dt.BILL_SQ");
        return jdbcTemplate.query(sql.toString(), this::map, args.toArray());
    }

    private SalesListDto.Row map(ResultSet rs, int i) throws SQLException {
        long supply = longOf(rs.getBigDecimal("SUPPLY_AMT"));
        long tax = longOf(rs.getBigDecimal("TAX_AMT"));
        return SalesListDto.Row.builder()
                .billDate(ymd(rs.getString("BILL_DT")))
                .billNo(trim(rs.getString("BILLDOC_NO")))
                .billSq(intOf(rs.getBigDecimal("BILL_SQ")))
                .billType(trim(rs.getString("BILL_TP")))
                .billTypeName(trim(rs.getString("BILL_TP_NM")))
                .plantCd(trim(rs.getString("PLANT_CD")))
                .partnerCd(trim(rs.getString("SALEPRTN_CD")))
                .partnerName(trim(rs.getString("PARTNER_NM")))
                .bizNo(trim(rs.getString("BIZR_NO")))
                .salesDeptCd(trim(rs.getString("SALESORGN_CD")))
                .salesDeptName(trim(rs.getString("SALES_DEPT_NM")))
                .ccCd(trim(rs.getString("CC_CD")))
                .salesEmpNo(trim(rs.getString("BIZRSPT_EMPNO_CD")))
                .salesEmpName(trim(rs.getString("SALES_EMP_NM")))
                .itemCd(trim(rs.getString("ITEM_CD")))
                .itemName(trim(rs.getString("ITEM_NM")))
                .qty(doubleOf(rs.getBigDecimal("BILL_QT")))
                .unitPrice(doubleOf(rs.getBigDecimal("TRAN_UM")))
                .supplyAmt(supply)
                .taxAmt(tax)
                .totalAmt(supply + tax)
                .soNo(trim(rs.getString("SODOC_NO")))
                .soSq(intOf(rs.getBigDecimal("SODOC_SQ")))
                .docuNo(trim(rs.getString("DOCU_NO")))
                .remark(trim(rs.getString("RMK_DC")))
                .build();
    }

    private static String trim(String s) { return s == null ? null : s.trim(); }
    private static long longOf(BigDecimal v) { return v == null ? 0L : v.longValue(); }
    private static Integer intOf(BigDecimal v) { return v == null ? null : v.intValue(); }
    private static Double doubleOf(BigDecimal v) { return v == null ? null : v.doubleValue(); }
    private static String ymd(String s) {
        if (s == null) return null;
        String t = s.trim();
        return t.length() == 8 ? t.substring(0, 4) + "-" + t.substring(4, 6) + "-" + t.substring(6, 8) : t;
    }
}
