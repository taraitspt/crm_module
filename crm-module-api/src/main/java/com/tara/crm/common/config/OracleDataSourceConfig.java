package com.tara.crm.common.config;

import com.zaxxer.hikari.HikariDataSource;
import org.springframework.beans.factory.annotation.Qualifier;
import org.springframework.boot.autoconfigure.condition.ConditionalOnProperty;
import org.springframework.boot.autoconfigure.jdbc.DataSourceProperties;
import org.springframework.boot.context.properties.ConfigurationProperties;
import org.springframework.context.annotation.Bean;
import org.springframework.context.annotation.Configuration;
import org.springframework.jdbc.core.JdbcTemplate;

import javax.sql.DataSource;

@Configuration
@ConditionalOnProperty(name = "oracle.enabled", havingValue = "true", matchIfMissing = false)
public class OracleDataSourceConfig {

    @Bean
    @ConfigurationProperties("oracle.datasource")
    public DataSourceProperties oracleDataSourceProperties() {
        return new DataSourceProperties();
    }

    @Bean("oracleDataSource")
    @ConfigurationProperties("oracle.datasource.hikari")
    public HikariDataSource oracleDataSource() {
        HikariDataSource ds = oracleDataSourceProperties()
                .initializeDataSourceBuilder()
                .type(HikariDataSource.class)
                .build();
        // 연결 실패 시 앱 부팅 차단하지 않음 (-1 = fail-fast 비활성화)
        ds.setInitializationFailTimeout(-1);
        return ds;
    }

    @Bean("oracleJdbcTemplate")
    public JdbcTemplate oracleJdbcTemplate(@Qualifier("oracleDataSource") DataSource dataSource) {
        JdbcTemplate template = new JdbcTemplate(dataSource);
        // ERP 는 사외 원격이라 왕복이 비싸다. 드라이버 기본 fetch size(10행)면 생산계획 한 달 6.7천 행에
        // 약 670번 왕복 → 10초 이상. 1000 이면 같은 쿼리가 3초대 (2026-10-01 실측: fetchAll 7.0s → 0.3s).
        template.setFetchSize(1000);
        return template;
    }
}
