-- Allow untact payments to reference shipped orders or pre-sales records.
ALTER TABLE untact_dtl ADD COLUMN IF NOT EXISTS source_type VARCHAR(20) NOT NULL DEFAULT 'ORDER';
ALTER TABLE untact_dtl ADD COLUMN IF NOT EXISTS sales_no VARCHAR(30) NULL;

UPDATE untact_dtl
SET source_type = 'ORDER'
WHERE source_type IS NULL OR source_type = '';

CREATE INDEX idx_untact_dtl_source_sales
    ON untact_dtl (company_cd, plant_cd, source_type, sales_no);
