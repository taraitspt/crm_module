CREATE TABLE IF NOT EXISTS document_number_sequence (
    company_cd    INT         NOT NULL,
    plant_cd      INT         NOT NULL,
    document_type VARCHAR(30) NOT NULL,
    business_date DATE        NOT NULL,
    last_seq      INT         NOT NULL DEFAULT 0,
    updated_at    DATETIME    NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
    PRIMARY KEY (company_cd, plant_cd, document_type, business_date)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
