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
 * 수주 담당팀 점검 — 수주의 비용센터(라인 SD_SO_DTL.CC_CD)와 영업담당자의 소속을 대조하기 위한 ERP 조회. 조회 전용.
 * MA_PARTNERSA_INFO.CC_CD 는 거래처 기본값일 뿐이라 참고 열(PARTNER_CC_*)로만 내려준다.
 *
 * <p>ERP 수주처리 화면 쿼리(사용자 제공 2026-10-06)에서 필요한 것만 남겼다: 수주 헤더 + 거래처 판매영역 정보(MA_PARTNERSA_INFO —
 * 수주의 CC_CD/PLANT_CD 는 여기서 온다) + 비용센터명(MA_CC_MST) + 담당자명 + 주문번호/주문명(수주 라인 SD_SO_DTL.PURDOC_NO → SD_ORDER_MST_X20329 — 헤더 PURDOC_NO 는 비어 있다).
 * 담당자의 실제 소속(users.cc_cd/dept)은 CRM DB 에 있으므로 비교는 서비스(SoCostCenterService)에서 한다.
 * 금액은 SO_AMT(수주금액) 헤더 값. 기간은 수주일(SO_DT).
 */
@Repository
@ConditionalOnProperty(name = "oracle.enabled", havingValue = "true")
public class OracleSoCostCenterRepository {

    private final NamedParameterJdbcTemplate jdbc;

    public OracleSoCostCenterRepository(@Qualifier("oracleJdbcTemplate") JdbcTemplate jdbcTemplate) {
        this.jdbc = new NamedParameterJdbcTemplate(jdbcTemplate);
    }

    private static final DateTimeFormatter BASIC = DateTimeFormatter.BASIC_ISO_DATE;

    private static final String SQL = """
            SELECT SSM.SODOC_NO, SSM.SO_DT, SSM.SO_TP, STM.SO_TP_NM, SSM.SO_ST, SSM.SO_AMT, SSM.EXCH_CD,
                   SSM.SALEPRTN_CD, CPM1.PARTNER_NM AS SALEPRTN_NM,
                   SSM.BIZRSPT_EMPNO_CD, HEM.KOR_NM AS BIZRSPT_EMPNO_NM,
                   SSM.SALESORGN_CD, MSM.SALESORGN_NM, SSM.DISCH_CD, SSM.PRDUCTGRP_CD,
                   SOL.CC_CD, MCM.CC_NM, SOL.CC_CNT, MPI.CC_CD AS PARTNER_CC_CD, MCP.CC_NM AS PARTNER_CC_NM, MPI.PLANT_CD, MPM.PLANT_NM,
                   HED.CC_CD AS ERP_EMP_CC_CD, MCE.CC_NM AS ERP_EMP_CC_NM,
                   SOL.PURDOC_NO, SOL.LINE_CNT, SOMX.ORDDOC_NM, SOMX.DEPT_CD AS ORD_DEPT_CD, MDM.DEPT_NM AS ORD_DEPT_NM,
                   SSM.RMK_DC
            FROM SD_SO_MST SSM
            INNER JOIN SD_SODTYPE_MST STM ON SSM.COMPANY_CD = STM.COMPANY_CD AND SSM.SO_TP = STM.SO_TP
            INNER JOIN MA_PARTNERSA_INFO MPI ON MPI.COMPANY_CD = SSM.COMPANY_CD AND MPI.PARTNER_CD = SSM.SALEPRTN_CD
                                            AND MPI.SALESORGN_CD = SSM.SALESORGN_CD AND MPI.DISCH_CD = SSM.DISCH_CD AND MPI.PRDUCTGRP_CD = SSM.PRDUCTGRP_CD
            LEFT OUTER JOIN MA_SAORG_MST MSM ON MSM.COMPANY_CD = SSM.COMPANY_CD AND MSM.SALESORGN_CD = SSM.SALESORGN_CD
            LEFT OUTER JOIN CI_PARTNER_MST CPM1 ON CPM1.PARTNER_CD = SSM.SALEPRTN_CD
            LEFT OUTER JOIN HR_EMP_MST HEM ON SSM.COMPANY_CD = HEM.COMPANY_CD AND SSM.BIZRSPT_EMPNO_CD = HEM.EMP_NO
            -- 담당자 본인의 비용센터(사원 단위, 사용자 동기화 ErpEmployeeRepository 와 같은 출처). 사원당 여러 행이면 MAX 로 하나만.
            LEFT OUTER JOIN (SELECT COMPANY_CD, EMP_NO, MAX(CC_CD) AS CC_CD FROM HR_EMPINFO_DTL GROUP BY COMPANY_CD, EMP_NO) HED
                   ON HED.COMPANY_CD = HEM.COMPANY_CD AND HED.EMP_NO = HEM.EMP_NO
            LEFT OUTER JOIN MA_CC_MST MCE ON MCE.COMPANY_CD = HED.COMPANY_CD AND MCE.CC_CD = HED.CC_CD
            LEFT OUTER JOIN MA_PLANT_MST MPM ON MPM.COMPANY_CD = MPI.COMPANY_CD AND MPM.PLANT_CD = MPI.PLANT_CD
            -- 주문 연결은 헤더가 아니라 수주 라인(SD_SO_DTL.PURDOC_NO = TOR 주문번호, PURDOC_SQ = 순번)에 있다. 수주 하나에 주문 하나(MIN 으로 한 건만).
            -- **수주의 비용센터는 라인(SD_SO_DTL.CC_CD)에 있다.** 헤더엔 CC 가 없고 MA_PARTNERSA_INFO.CC_CD 는 거래처 판매영역의 *기본값*이라
            -- 수주 입력 때 바꾼 팀이 반영되지 않는다(2026-09~10 TPS 152건 중 8건이 기본값과 달라 가짜 불일치로 나왔음 — 사용자 지적 2026-10-06, TSO2026100600018).
            -- 삭제(X) 라인은 빼고, 라인마다 CC 가 다르면 CC_CNT > 1 (서비스가 MIXED 로 표시).
            LEFT OUTER JOIN (SELECT COMPANY_CD, SODOC_NO, MIN(PURDOC_NO) AS PURDOC_NO, COUNT(*) AS LINE_CNT,
                                    MIN(CC_CD) AS CC_CD, COUNT(DISTINCT CC_CD) AS CC_CNT
                               FROM SD_SO_DTL WHERE COMPANY_CD = '1000' AND NVL(ITEM_ST, '*') <> 'X'
                              GROUP BY COMPANY_CD, SODOC_NO) SOL
                   ON SOL.COMPANY_CD = SSM.COMPANY_CD AND SOL.SODOC_NO = SSM.SODOC_NO
            LEFT OUTER JOIN MA_CC_MST MCM ON MCM.COMPANY_CD = SSM.COMPANY_CD AND MCM.CC_CD = SOL.CC_CD
                                         AND SSM.SO_DT BETWEEN MCM.START_DT AND COALESCE(MCM.END_DT, '99991231')
            LEFT OUTER JOIN MA_CC_MST MCP ON MCP.COMPANY_CD = MPI.COMPANY_CD AND MCP.CC_CD = MPI.CC_CD
                                         AND SSM.SO_DT BETWEEN MCP.START_DT AND COALESCE(MCP.END_DT, '99991231')
            LEFT OUTER JOIN SD_ORDER_MST_X20329 SOMX ON SOMX.COMPANY_CD = SSM.COMPANY_CD AND SOMX.ORDDOC_NO = SOL.PURDOC_NO
            LEFT OUTER JOIN MA_DEPT_MST MDM ON MDM.COMPANY_CD = SSM.COMPANY_CD AND MDM.DEPT_CD = SOMX.DEPT_CD
            WHERE SSM.COMPANY_CD = '1000'
              AND SSM.SO_DT BETWEEN :start AND :end
              -- 삭제(취소)된 수주(SO_ST X, 코드 C00300: A 예정·B 진행·C 완료·E 종결·S 정지·X 삭제)는 뺀다(사용자 2026-10-06)
              AND NVL(SSM.SO_ST, '*') <> 'X'
              -- TPS 만. GRP(GSO)·PM(PSO) 수주는 대상이 아니다(사용자 2026-10-06). 공장(MA_PARTNERSA_INFO.PLANT_CD)은 TPS 수주도 비어 있는 게 많아(2026년 TSO 212건) 못 쓰고 수주유형으로 가른다.
              -- SOT02 GRP일반 · SOT05 GRP선매출 · SOT08 GRP선매출차감 · SRT02 GRP반품 / SOT03 PM일반 · SOT06 PM선매출 · SOT09 PM선매출차감 · SRT03 PM반품
              AND SSM.SO_TP NOT IN ('SOT02', 'SOT05', 'SOT08', 'SRT02', 'SOT03', 'SOT06', 'SOT09', 'SRT03')
            ORDER BY SSM.SO_DT DESC, SSM.SODOC_NO DESC
            """;

    /** 수주일(SO_DT) 기간 양끝 포함. */
    public List<Map<String, Object>> findSo(LocalDate start, LocalDate end) {
        return jdbc.query(SQL, new MapSqlParameterSource()
                .addValue("start", start.format(BASIC)).addValue("end", end.format(BASIC)), this::map);
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
