package com.tara.crm.common.config;

import lombok.extern.slf4j.Slf4j;
import org.springframework.boot.autoconfigure.flyway.FlywayMigrationStrategy;
import org.springframework.context.annotation.Bean;
import org.springframework.context.annotation.Configuration;

/**
 * Flyway 기동 전략 — repair 후 migrate.
 *
 * 배경(2026-06): fork(hongmuk)와 upstream(taraitspt)이 같은 버전번호 V51 에 서로 다른 마이그레이션을
 * 두었다(내 erp_sync_observability ↔ upstream add_card_info_to_untact_mst). upstream 통합 후 일부
 * 환경의 flyway_schema_history 에는 구 V51 체크섬이 남아, 기동 시 validate 가 checksum mismatch 로
 * 실패해 앱이 뜨지 못한다.
 *
 * repair() 로 history 를 현재 마이그레이션 파일에 정렬(체크섬/설명 갱신)한 뒤 migrate() 를 수행한다.
 * repair 는 스키마를 바꾸지 않고 이력만 정렬하므로 안전하다. untact 카드 컬럼처럼 repair 후 재실행되지
 * 않는 V51 효과는 V56(멱등)에서 보강한다.
 *
 * NOTE: 이력 정렬이 모든 환경에서 수렴한 뒤에는 이 전략을 제거(기본 migrate 로 환원)해도 된다.
 */
@Slf4j
@Configuration
public class FlywayReconcileConfig {

    @Bean
    public FlywayMigrationStrategy flywayMigrationStrategy() {
        return flyway -> {
            try {
                var result = flyway.repair();
                if (result != null && result.migrationsAligned != null && !result.migrationsAligned.isEmpty()) {
                    log.warn("[Flyway] repair — 이력 체크섬 정렬: {}건", result.migrationsAligned.size());
                }
            } catch (Exception e) {
                log.warn("[Flyway] repair 스킵(무시): {}", e.getMessage());
            }
            flyway.migrate();
        };
    }
}
