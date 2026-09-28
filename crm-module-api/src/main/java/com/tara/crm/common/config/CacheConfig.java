package com.tara.crm.common.config;

import org.springframework.cache.CacheManager;
import org.springframework.cache.annotation.EnableCaching;
import org.springframework.cache.concurrent.ConcurrentMapCacheManager;
import org.springframework.context.annotation.Bean;
import org.springframework.context.annotation.Configuration;

/**
 * 애플리케이션 캐시 설정.
 * ERP 참조데이터(작업처 코드→이름 맵 등)는 매 요청마다 오라클을 왕복할 필요가 없어 캐시한다.
 * 내장 {@link ConcurrentMapCacheManager} 사용(추가 의존성 없음). 무효화는 마스터 동기화 스케줄러에서 evict.
 */
@Configuration
@EnableCaching
public class CacheConfig {

    /** erpWorkTypes: 작업처 코드맵(ErpCodeRepository.findWorkTypes). 마스터 sync 때 evict. */
    public static final String ERP_WORK_TYPES = "erpWorkTypes";

    /** erpEmpNames: 사번→이름(ErpEmployeeRepository.findNameByEmpNo). 마스터성(거의 불변) — 실적 수치는 캐시 안 함. 마스터 sync 때 evict. */
    public static final String ERP_EMP_NAMES = "erpEmpNames";

    @Bean
    public CacheManager cacheManager() {
        return new ConcurrentMapCacheManager(ERP_WORK_TYPES, ERP_EMP_NAMES);
    }
}
