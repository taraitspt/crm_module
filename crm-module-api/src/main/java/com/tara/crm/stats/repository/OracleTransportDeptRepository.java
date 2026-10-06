package com.tara.crm.stats.repository;

import com.tara.crm.production.repository.OracleEquipmentPerfRepository;
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
 * 운송정보 부서 점검 — ERP "운송정보입력"(SD_TRSPEXPE_INFO_X20329, TPS 공장 1000) 행마다 거기 입력한 **부서**(DEPT_CD → MA_DEPT_MST.CC_CD 비용센터)와
 * 같은 주문 라인(ORDDOC_NO·ORDDOC_SQ = SD_SO_DTL.PURDOC_NO·PURDOC_SQ)의 **수주 라인 비용센터**(SD_SO_DTL.CC_CD)를 대조한다(사용자 요청 2026-10-06). 조회 전용.
 *
 * <p>운송정보엔 비용센터가 없고 부서만 있어 부서의 비용센터로 비교한다(부서 유효기간은 등록일 기준). 수주는 삭제(SO_ST X)·삭제 라인(ITEM_ST X)을 뺀 것만,
 * 주문 라인에 수주 라인이 여럿이면 수주번호는 MIN, CC 가 갈리면 SO_CC_CNT > 1. 운송정보는 수주보다 먼저 들어가는 게 보통이라 수주 없는 행(NO_SO)이 많다
 * (2026-09: 382행 중 258행). 조회 조건은 등록일(INSERT_DT) 범위.
 */
@Repository
@ConditionalOnProperty(name = "oracle.enabled", havingValue = "true")
public class OracleTransportDeptRepository {

    private static final DateTimeFormatter BASIC = DateTimeFormatter.BASIC_ISO_DATE;
    private final NamedParameterJdbcTemplate jdbc;

    public OracleTransportDeptRepository(@Qualifier("oracleJdbcTemplate") JdbcTemplate jdbcTemplate) {
        this.jdbc = new NamedParameterJdbcTemplate(jdbcTemplate);
    }

    private static final String SQL = """
            WITH SOL AS (
                -- 주문 라인별 살아 있는 수주 라인 요약
                SELECT SSD.PURDOC_NO, SSD.PURDOC_SQ,
                       MIN(SSD.SODOC_NO) AS SODOC_NO, COUNT(DISTINCT SSD.SODOC_NO) AS SO_CNT,
                       MIN(SSD.CC_CD) AS SO_CC_CD, COUNT(DISTINCT SSD.CC_CD) AS SO_CC_CNT
                FROM SD_SO_DTL SSD
                INNER JOIN SD_SO_MST SSM ON SSM.COMPANY_CD = SSD.COMPANY_CD AND SSM.SODOC_NO = SSD.SODOC_NO AND NVL(SSM.SO_ST, '*') <> 'X'
                WHERE SSD.COMPANY_CD = '1000' AND NVL(SSD.ITEM_ST, '*') <> 'X' AND SSD.PURDOC_NO IS NOT NULL
                GROUP BY SSD.PURDOC_NO, SSD.PURDOC_SQ
            )
            SELECT STI.INSERT_NO, STI.INSERT_DT, STI.ISS_DT, STI.TRNSPAGENCY_CD, STI.DELIV_TP, STI.DELIV_MTHD_CD,
                   STI.ETC_DC2 AS CONFIRM_YN, STI.ETC_DC1 AS DELIV_PLACE,
                   STI.SALEPRTN_CD, CPM.PARTNER_NM AS SALEPRTN_NM, STI.BIZRSPT_EMPNO_CD, HEM.KOR_NM AS BIZRSPT_EMPNO_NM,
                   STI.DEPT_CD, MDM.DEPT_NM, MDM.CC_CD AS DEPT_CC_CD, MCD.CC_NM AS DEPT_CC_NM,
                   STI.ORDDOC_NO, STI.ORDDOC_SQ, STI.DLV_SQ, STI.ORDDOC_NM, STI.ITEM_NM, STI.SPCFCS_ITEM_NM, STI.ISS_QT,
                   STI.DEST_BASE_ADDR, STI.DEST_DTL_ADDR, STI.RMK_DC,
                   SOL.SODOC_NO, SOL.SO_CNT, SOL.SO_CC_CD, MCS.CC_NM AS SO_CC_NM, SOL.SO_CC_CNT,
                   SSM.SO_DT, SSM.BIZRSPT_EMPNO_CD AS SO_EMPNO_CD, HES.KOR_NM AS SO_EMPNO_NM
            FROM SD_TRSPEXPE_INFO_X20329 STI
            LEFT OUTER JOIN MA_DEPT_MST MDM ON MDM.COMPANY_CD = STI.COMPANY_CD AND MDM.DEPT_CD = STI.DEPT_CD
                                           AND STI.INSERT_DT BETWEEN MDM.DEPT_START_DT AND NVL(MDM.DEPT_END_DT, '99991231')
            LEFT OUTER JOIN MA_CC_MST MCD ON MCD.COMPANY_CD = STI.COMPANY_CD AND MCD.CC_CD = MDM.CC_CD
                                         AND STI.INSERT_DT BETWEEN MCD.START_DT AND COALESCE(MCD.END_DT, '99991231')
            LEFT OUTER JOIN HR_EMP_MST HEM ON HEM.COMPANY_CD = STI.COMPANY_CD AND HEM.EMP_NO = STI.BIZRSPT_EMPNO_CD
            LEFT OUTER JOIN CI_PARTNER_MST CPM ON CPM.PARTNER_CD = STI.SALEPRTN_CD
            LEFT OUTER JOIN SOL ON SOL.PURDOC_NO = STI.ORDDOC_NO AND SOL.PURDOC_SQ = STI.ORDDOC_SQ
            LEFT OUTER JOIN MA_CC_MST MCS ON MCS.COMPANY_CD = STI.COMPANY_CD AND MCS.CC_CD = SOL.SO_CC_CD
                                         AND STI.INSERT_DT BETWEEN MCS.START_DT AND COALESCE(MCS.END_DT, '99991231')
            LEFT OUTER JOIN SD_SO_MST SSM ON SSM.COMPANY_CD = STI.COMPANY_CD AND SSM.SODOC_NO = SOL.SODOC_NO
            LEFT OUTER JOIN HR_EMP_MST HES ON HES.COMPANY_CD = STI.COMPANY_CD AND HES.EMP_NO = SSM.BIZRSPT_EMPNO_CD
            WHERE STI.COMPANY_CD = '1000' AND STI.PLANT_CD = '1000'
              AND STI.INSERT_DT BETWEEN :start AND :end
            ORDER BY STI.INSERT_DT DESC, STI.INSERT_NO DESC
            """;

    /** 등록일 범위의 운송정보 + 같은 주문 라인의 수주 요약. 행은 camelCase Map. */
    public List<Map<String, Object>> findRows(LocalDate start, LocalDate end) {
        MapSqlParameterSource p = new MapSqlParameterSource()
                .addValue("start", start.format(BASIC))
                .addValue("end", end.format(BASIC));
        return jdbc.query(SQL, p, this::map);
    }

    private Map<String, Object> map(ResultSet rs, int i) throws SQLException {
        ResultSetMetaData md = rs.getMetaData();
        Map<String, Object> row = new LinkedHashMap<>();
        for (int c = 1; c <= md.getColumnCount(); c++) {
            Object v = rs.getObject(c);
            if (v instanceof String str) v = str.trim();
            if (v instanceof java.sql.Timestamp ts) v = ts.toLocalDateTime().toLocalDate().toString();
            row.put(OracleEquipmentPerfRepository.camel(md.getColumnLabel(c).toUpperCase(Locale.ROOT)), v);
        }
        return row;
    }
}
