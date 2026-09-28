CREATE TABLE auth_history (
    history_id  BIGINT AUTO_INCREMENT PRIMARY KEY,
    company_cd  INT          NOT NULL,
    user_id     VARCHAR(20)  NOT NULL,
    employee_no VARCHAR(20)  NULL,
    event_type  VARCHAR(30)  NOT NULL COMMENT 'LOGIN/PASSWORD_CHANGED',
    ip_address  VARCHAR(45)  NULL,
    user_agent  VARCHAR(500) NULL,
    occurred_at DATETIME(6)  NOT NULL,
    INDEX idx_auth_history_user (company_cd, user_id, occurred_at),
    INDEX idx_auth_history_event (event_type, occurred_at)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
