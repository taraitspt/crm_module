package com.tara.crm.integration.erp.repository;

import com.tara.crm.integration.erp.dto.ErpItemDto;
import lombok.RequiredArgsConstructor;
import org.springframework.beans.factory.annotation.Qualifier;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.jdbc.core.RowMapper;
import org.springframework.boot.autoconfigure.condition.ConditionalOnProperty;
import org.springframework.stereotype.Repository;

import java.util.List;

@ConditionalOnProperty(name = "oracle.enabled", havingValue = "true", matchIfMissing = false)
@Repository
@RequiredArgsConstructor
public class ErpItemRepository {

    @Qualifier("oracleJdbcTemplate")
    private final JdbcTemplate jdbcTemplate;

    private static final RowMapper<ErpItemDto> ROW_MAPPER = (rs, rowNum) ->
            ErpItemDto.builder()
                    .itemCd(rs.getString("ITEM_CD"))
                    .itemNm(rs.getString("ITEM_NM"))
                    .itemSpecDc(rs.getString("ITEM_SPEC_DC"))
                    .stdUnitCd(rs.getString("STD_UNIT_CD"))
                    .build();

    public List<ErpItemDto> findAllActive() {
        return jdbcTemplate.query(
                """
                SELECT ITEM_CD, ITEM_NM, ITEM_SPEC_DC, STD_UNIT_CD
                  FROM CI_ITEM
                 WHERE USE_YN = 'Y'
                """,
                ROW_MAPPER
        );
    }

    public List<ErpItemDto> searchByKeyword(String keyword) {
        return jdbcTemplate.query(
                """
                SELECT ITEM_CD, ITEM_NM, ITEM_SPEC_DC, STD_UNIT_CD
                  FROM CI_ITEM
                 WHERE USE_YN = 'Y'
                   AND (ITEM_NM LIKE '%' || ? || '%' OR ITEM_SPEC_DC LIKE '%' || ? || '%' OR ITEM_CD LIKE '%' || ? || '%')
                   AND ROWNUM <= 20
                """,
                ROW_MAPPER, keyword, keyword, keyword
        );
    }

    /** 규격(SPEC) 검색 */
    public List<String> searchSpecs(String keyword) {
        return jdbcTemplate.queryForList(
                """
                SELECT DISTINCT ITEM_SPEC_DC FROM CI_ITEM
                 WHERE USE_YN = 'Y' AND ITEM_SPEC_DC IS NOT NULL
                   AND ITEM_SPEC_DC LIKE '%' || ? || '%'
                   AND ROWNUM <= 20
                """,
                String.class, keyword
        );
    }
}
