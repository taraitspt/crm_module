package com.tara.crm.integration.erp.scheduler;

import com.tara.crm.integration.erp.service.ErpMasterSyncService;
import lombok.RequiredArgsConstructor;
import lombok.extern.slf4j.Slf4j;
import org.springframework.cache.annotation.CacheEvict;
import org.springframework.scheduling.annotation.Scheduled;
import org.springframework.boot.autoconfigure.condition.ConditionalOnProperty;
import org.springframework.stereotype.Component;

@ConditionalOnProperty(name = "oracle.enabled", havingValue = "true", matchIfMissing = false)
@Component
@RequiredArgsConstructor
@Slf4j
public class ErpMasterSyncScheduler {

    private final ErpMasterSyncService erpMasterSyncService;

    /**
     * 매일 02:00 마스터 데이터 전체 동기화.
     * M1: 거래처, M2: 사원, M3: 부서, M4: 품목
     */
    // ERP 참조 캐시(작업처 코드맵 erpWorkTypes, 사번→이름 erpEmpNames)를 매일 마스터 동기화 때 비워 최신화(추가/변경 반영).
    @CacheEvict(cacheNames = { "erpWorkTypes", "erpEmpNames" }, allEntries = true)
    @Scheduled(cron = "0 0 2 * * ?")
    public void syncMasterData() {
        log.info("=== ERP 마스터 동기화 스케줄러 시작 ===");
        long start = System.currentTimeMillis();

        // 거래처 동기화 비활성화 - Oracle 직접 조회로 전환됨
        // try {
        //     erpMasterSyncService.syncPartners();
        // } catch (Exception e) {
        //     log.error("거래처 동기화 스케줄러 실패", e);
        // }

        // 사원/부서 동기화 유지 (인증/권한에 필요)
        try {
            erpMasterSyncService.syncEmployees();
        } catch (Exception e) {
            log.error("사원 동기화 스케줄러 실패", e);
        }

        try {
            erpMasterSyncService.syncDepartments();
        } catch (Exception e) {
            log.error("부서 동기화 스케줄러 실패", e);
        }

        // M5: 공통코드(배송방법 등) — ERP MA_CODEDTL → common_code. 킬스위치 ERP_COMMON_CODE_SYNC_ENABLED.
        try {
            erpMasterSyncService.syncCommonCodes();
        } catch (Exception e) {
            log.error("공통코드 동기화 스케줄러 실패", e);
        }

        // 품목 동기화 비활성화 - Oracle 직접 조회로 전환됨
        // try {
        //     erpMasterSyncService.syncItems();
        // } catch (Exception e) {
        //     log.error("품목 동기화 스케줄러 실패", e);
        // }

        long elapsed = System.currentTimeMillis() - start;
        log.info("=== ERP 마스터 동기화 스케줄러 완료: {}ms ===", elapsed);
    }

    /**
     * 시트 #65 — 매일 01:00 전날 가입자만 incremental insert.
     * 02:00 전체 동기화보다 1시간 일찍 동작하여 신규 입사자 cc_cd 가 빨리 user 테이블에 반영되도록.
     */
    @Scheduled(cron = "0 0 1 * * ?")
    public void syncDailyJoinedEmployees() {
        java.time.LocalDate target = java.time.LocalDate.now().minusDays(1);
        log.info("=== ERP 일자별 신규 가입자 동기화 시작: target={} ===", target);
        try {
            erpMasterSyncService.syncEmployeesJoinedOn(target);
        } catch (Exception e) {
            log.error("일자별 가입자 동기화 스케줄러 실패: target={}", target, e);
        }
    }
}
