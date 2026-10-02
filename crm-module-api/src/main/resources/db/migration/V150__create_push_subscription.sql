-- 웹 푸시 구독 (2026-10-02) — 아이폰 홈 화면 웹앱(PWA)·브라우저가 "활동일 아침 8시" 활동 알림을 받으려고 등록한 푸시 구독.
-- 안드로이드 APK 는 Capacitor 로컬 알림을 쓰므로 여기 안 들어온다. 서버 스케줄러(ActivityReminderScheduler)가 매일 08:00(Asia/Seoul)에 보낸다.
-- 구독은 브라우저·기기·도메인마다 하나씩 생기고, 발송 때 404/410 이 오면(해지·만료) 지운다.
CREATE TABLE push_subscription (
  subscription_id BIGINT       NOT NULL AUTO_INCREMENT,
  company_cd      INT          NOT NULL,
  user_id         VARCHAR(20)  NOT NULL COMMENT 'users.id',
  endpoint        VARCHAR(500) NOT NULL COMMENT '푸시 서비스 엔드포인트 (Apple/Google/Mozilla)',
  p256dh          VARCHAR(200) NOT NULL COMMENT '클라이언트 공개키',
  auth_key        VARCHAR(100) NOT NULL COMMENT '클라이언트 인증 비밀',
  user_agent      VARCHAR(300) NULL,
  last_sent_at    DATETIME     NULL,
  fail_count      INT          NOT NULL DEFAULT 0,
  created_at      DATETIME     NULL,
  updated_at      DATETIME     NULL,
  created_id      VARCHAR(20)  NULL,
  updated_id      VARCHAR(20)  NULL,
  PRIMARY KEY (subscription_id),
  UNIQUE KEY uk_push_subscription_endpoint (endpoint),
  KEY ix_push_subscription_user (company_cd, user_id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci COMMENT='웹 푸시 구독 (활동 알림)';
