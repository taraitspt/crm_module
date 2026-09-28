ALTER TABLE teams_notification_log
    ADD COLUMN author_name VARCHAR(100) NULL COMMENT 'ERP order creator name' AFTER author_id;
