package com.tara.crm.integration.erp.repository;

import com.tara.crm.integration.erp.entity.ErpSyncLog;
import org.springframework.data.jpa.repository.JpaRepository;

import java.util.List;
import java.util.Optional;

public interface ErpSyncLogRepository extends JpaRepository<ErpSyncLog, Long> {

    Optional<ErpSyncLog> findFirstBySyncTypeAndStatusInOrderByFinishedAtDesc(
            String syncType, List<String> statuses);

    List<ErpSyncLog> findTop50ByOrderByCreatedAtDesc();
}
