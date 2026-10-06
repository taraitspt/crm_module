package com.tara.crm.integration.erp.repository;

import com.tara.crm.integration.erp.dto.ErpDepartmentDto;
import lombok.RequiredArgsConstructor;
import org.springframework.beans.factory.annotation.Qualifier;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.jdbc.core.RowMapper;
import org.springframework.boot.autoconfigure.condition.ConditionalOnProperty;
import org.springframework.stereotype.Repository;

import java.util.List;
import java.util.Map;

@ConditionalOnProperty(name = "oracle.enabled", havingValue = "true", matchIfMissing = false)
@Repository
@RequiredArgsConstructor
public class ErpDepartmentRepository {

    @Qualifier("oracleJdbcTemplate")
    private final JdbcTemplate jdbcTemplate;

    private static final RowMapper<ErpDepartmentDto> ROW_MAPPER = (rs, rowNum) ->
            ErpDepartmentDto.builder()
                    .deptCd(rs.getString("DEPT_CD"))
                    .deptNm(rs.getString("DEPT_NM"))
                    .upDeptCd(rs.getString("UP_DEPT_CD"))
                    .upDeptNm(rs.getString("UP_DEPT_NM"))
                    .build();

    // UP_DEPT_CD 를 같이 가져온다 — 예전엔 상위 부서 이름만 읽고 코드는 저장하지 않아 departments.up_dept_cd 가 전부 비어 있었다(2026-10-02).
    public List<ErpDepartmentDto> findAll() {
        return jdbcTemplate.query(
                """
                SELECT d.DEPT_CD, d.DEPT_NM, d.UP_DEPT_CD, ud.DEPT_NM AS UP_DEPT_NM
                  FROM MA_DEPT_MST d
                  LEFT JOIN MA_DEPT_MST ud
                    ON ud.COMPANY_CD = d.COMPANY_CD AND ud.DEPT_CD = d.UP_DEPT_CD
                 WHERE d.COMPANY_CD IN ('1000', '2000', '3000')
                   AND (d.DEPT_END_DT IS NULL OR d.DEPT_END_DT >= TO_CHAR(SYSDATE, 'YYYYMMDD'))
                 ORDER BY d.COMPANY_CD, d.DEPT_CD
                """,
                ROW_MAPPER
        );
    }

    public List<ErpDepartmentDto> findByCompanyCd(String companyCd) {
        return jdbcTemplate.query(
                """
                SELECT d.DEPT_CD, d.DEPT_NM, d.UP_DEPT_CD, ud.DEPT_NM AS UP_DEPT_NM
                  FROM MA_DEPT_MST d
                  LEFT JOIN MA_DEPT_MST ud
                    ON ud.COMPANY_CD = d.COMPANY_CD AND ud.DEPT_CD = d.UP_DEPT_CD
                 WHERE d.COMPANY_CD = ?
                   AND (d.DEPT_END_DT IS NULL OR d.DEPT_END_DT >= TO_CHAR(SYSDATE, 'YYYYMMDD'))
                 ORDER BY d.DEPT_CD
                """,
                ROW_MAPPER,
                companyCd
        );
    }

    /** UP_DEPT_CD 분포 진단용 */
    public List<Map<String, Object>> findUpDeptCdSummary() {
        return jdbcTemplate.queryForList(
                """
                SELECT d.UP_DEPT_CD, ud.DEPT_NM AS UP_DEPT_NM, COUNT(*) AS CNT
                  FROM MA_DEPT_MST d
                  LEFT JOIN MA_DEPT_MST ud
                    ON ud.COMPANY_CD = d.COMPANY_CD AND ud.DEPT_CD = d.UP_DEPT_CD
                 WHERE d.COMPANY_CD IN ('1000', '2000', '3000')
                   AND (d.DEPT_END_DT IS NULL OR d.DEPT_END_DT >= TO_CHAR(SYSDATE, 'YYYYMMDD'))
                 GROUP BY d.UP_DEPT_CD, ud.DEPT_NM
                 ORDER BY CNT DESC
                """
        );
    }
}
