package com.tara.crm.entity;

import com.tara.crm.integration.erp.entity.ErpSyncLog;
import org.junit.jupiter.api.DisplayName;
import org.junit.jupiter.api.Test;

import static org.junit.jupiter.api.Assertions.*;

/**
 * 엔티티 비즈니스 로직 (순수 자바 테스트, DB 불필요)
 */
class EntityBusinessLogicTest {

    @Test
    @DisplayName("ErpSyncLog - start/success/fail 라이프사이클")
    void erpSyncLog_lifecycle() {
        ErpSyncLog log = ErpSyncLog.start("ORDER", "WRITE");

        assertEquals("RUNNING", log.getStatus());
        assertEquals("ORDER", log.getSyncType());
        assertEquals("WRITE", log.getDirection());
        assertNotNull(log.getStartedAt());

        log.success(10, 8, 2);
        assertEquals("PARTIAL", log.getStatus());
        assertEquals(10, log.getTotalCount());
        assertEquals(8, log.getSuccessCount());
        assertEquals(2, log.getFailCount());
        assertNotNull(log.getFinishedAt());
    }

    @Test
    @DisplayName("ErpSyncLog - 전체 성공 시 SUCCESS 상태")
    void erpSyncLog_allSuccess() {
        ErpSyncLog log = ErpSyncLog.start("PARTNER", "READ");
        log.success(5, 5, 0);

        assertEquals("SUCCESS", log.getStatus());
    }

    @Test
    @DisplayName("ErpSyncLog - fail 처리")
    void erpSyncLog_fail() {
        ErpSyncLog log = ErpSyncLog.start("ITEM", "READ");
        log.fail("Connection refused");

        assertEquals("FAILED", log.getStatus());
        assertEquals("Connection refused", log.getErrorMessage());
        assertNotNull(log.getFinishedAt());
    }
}
