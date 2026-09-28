package com.tara.crm.integration.erp.entity;

import jakarta.persistence.*;
import lombok.*;

import java.time.LocalDateTime;

@Entity
@Table(name = "erp_sync_log")
@Getter @Setter
@NoArgsConstructor(access = AccessLevel.PROTECTED)
@AllArgsConstructor
@Builder
public class ErpSyncLog {

    @Id
    @GeneratedValue(strategy = GenerationType.IDENTITY)
    private Long id;

    @Column(name = "sync_type", nullable = false, length = 50)
    private String syncType;

    @Column(name = "direction", nullable = false, length = 10)
    private String direction;

    @Column(name = "status", nullable = false, length = 20)
    private String status;

    @Column(name = "total_count")
    @Builder.Default
    private Integer totalCount = 0;

    @Column(name = "success_count")
    @Builder.Default
    private Integer successCount = 0;

    @Column(name = "fail_count")
    @Builder.Default
    private Integer failCount = 0;

    @Column(name = "error_message", columnDefinition = "TEXT")
    private String errorMessage;

    @Column(name = "started_at", nullable = false)
    private LocalDateTime startedAt;

    @Column(name = "finished_at")
    private LocalDateTime finishedAt;

    @Column(name = "created_at", nullable = false)
    private LocalDateTime createdAt;

    public static ErpSyncLog start(String syncType, String direction) {
        return ErpSyncLog.builder()
                .syncType(syncType)
                .direction(direction)
                .status("RUNNING")
                .startedAt(LocalDateTime.now())
                .createdAt(LocalDateTime.now())
                .build();
    }

    public void success(int total, int success, int fail) {
        this.status = fail == 0 ? "SUCCESS" : "PARTIAL";
        this.totalCount = total;
        this.successCount = success;
        this.failCount = fail;
        this.finishedAt = LocalDateTime.now();
    }

    public void fail(String errorMessage) {
        this.status = "FAILED";
        this.errorMessage = errorMessage;
        this.finishedAt = LocalDateTime.now();
    }
}
