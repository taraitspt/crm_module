package com.tara.crm.common.entity;

import com.tara.crm.common.audit.BaseEntity;
import com.tara.crm.common.id.ClosingPeriodId;
import jakarta.persistence.*;
import lombok.*;

import java.time.LocalDateTime;

/**
 * 매출/세금계산서 월마감 (시트 #2/#14).
 * closingType: SALES(매출등록 잠금) / TAX(세금계산서 발행 잠금)
 * closingYm: YYYYMM
 */
@Entity
@Table(name = "closing_period")
@Getter @Setter
@NoArgsConstructor(access = AccessLevel.PROTECTED)
@AllArgsConstructor @Builder
public class ClosingPeriod extends BaseEntity {

    @EmbeddedId
    private ClosingPeriodId id;

    @Column(name = "scheduled_dt")
    private LocalDateTime scheduledDt;

    @Column(name = "closed_at")
    private LocalDateTime closedAt;

    @Column(name = "closed_by", length = 20)
    private String closedBy;

    @Column(name = "note", length = 500)
    private String note;

    /** 즉시 마감 처리 (closed_at = now). */
    public void closeNow(String userId) {
        this.closedAt = LocalDateTime.now();
        this.closedBy = userId;
    }

    /** 현재 시점 기준 실제 마감 효력 발생 여부. scheduledDt 가 미래면 미발효. */
    public boolean isEffective(LocalDateTime now) {
        if (closedAt != null) return true;
        if (scheduledDt != null && !scheduledDt.isAfter(now)) return true;
        return false;
    }
}
