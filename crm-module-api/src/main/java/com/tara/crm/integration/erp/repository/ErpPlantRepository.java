package com.tara.crm.integration.erp.repository;

import com.tara.crm.integration.erp.dto.ErpPlantDto;
import lombok.RequiredArgsConstructor;
import org.springframework.beans.factory.annotation.Qualifier;
import org.springframework.boot.autoconfigure.condition.ConditionalOnProperty;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.jdbc.core.RowMapper;
import org.springframework.stereotype.Repository;

import java.util.List;

@ConditionalOnProperty(name = "oracle.enabled", havingValue = "true", matchIfMissing = false)
@Repository
@RequiredArgsConstructor
public class ErpPlantRepository {

    @Qualifier("oracleJdbcTemplate")
    private final JdbcTemplate jdbcTemplate;

    private static final RowMapper<ErpPlantDto> ROW_MAPPER = (rs, rowNum) ->
            ErpPlantDto.builder()
                    .companyCd(rs.getString("COMPANY_CD"))
                    .plantCd(rs.getString("PLANT_CD"))
                    .plantNm(rs.getString("PLANT_NM"))
                    .bizareaCd(rs.getString("BIZAREA_CD"))
                    .bizareaNm(rs.getString("BIZAREA_NM"))
                    .build();

    /** 특정 회사의 공장 목록 조회 */
    public List<ErpPlantDto> findByCompanyCd(String companyCd) {
        return jdbcTemplate.query(
                """
                SELECT COMPANY_CD, PLANT_CD, PLANT_NM, BIZAREA_CD, BIZAREA_NM
                  FROM VW_MA_PLANT_MST_C49
                 WHERE COMPANY_CD = ?
                 ORDER BY PLANT_CD
                """,
                ROW_MAPPER, companyCd
        );
    }

    /** 전체 공장 목록 조회 */
    public List<ErpPlantDto> findAll() {
        return jdbcTemplate.query(
                """
                SELECT COMPANY_CD, PLANT_CD, PLANT_NM, BIZAREA_CD, BIZAREA_NM
                  FROM VW_MA_PLANT_MST_C49
                 ORDER BY COMPANY_CD, PLANT_CD
                """,
                ROW_MAPPER
        );
    }
}
