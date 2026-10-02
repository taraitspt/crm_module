package com.tara.crm.push.entity;

import com.tara.crm.common.audit.BaseEntity;
import jakarta.persistence.Column;
import jakarta.persistence.Entity;
import jakarta.persistence.GeneratedValue;
import jakarta.persistence.GenerationType;
import jakarta.persistence.Id;
import jakarta.persistence.Table;
import lombok.AllArgsConstructor;
import lombok.Builder;
import lombok.Getter;
import lombok.NoArgsConstructor;
import lombok.Setter;

import java.time.LocalDateTime;

/** 웹 푸시 구독 1건 — 브라우저·기기·도메인마다 하나. 활동 알림(아침 8시) 발송 대상. */
@Entity
@Table(name = "push_subscription")
@Getter
@Setter
@NoArgsConstructor
@AllArgsConstructor
@Builder
public class PushSubscription extends BaseEntity {

    @Id
    @GeneratedValue(strategy = GenerationType.IDENTITY)
    @Column(name = "subscription_id")
    private Long subscriptionId;

    @Column(name = "company_cd", nullable = false)
    private Integer companyCd;

    @Column(name = "user_id", nullable = false, length = 20)
    private String userId;

    @Column(name = "endpoint", nullable = false, length = 500)
    private String endpoint;

    @Column(name = "p256dh", nullable = false, length = 200)
    private String p256dh;

    @Column(name = "auth_key", nullable = false, length = 100)
    private String authKey;

    @Column(name = "user_agent", length = 300)
    private String userAgent;

    @Column(name = "last_sent_at")
    private LocalDateTime lastSentAt;

    @Column(name = "fail_count", nullable = false)
    @Builder.Default
    private Integer failCount = 0;
}
