-- 공지사항 게시판 + 팝업 관리.
CREATE TABLE notices (
  id             BIGINT       NOT NULL AUTO_INCREMENT,
  company_cd     INT          NOT NULL,
  title          VARCHAR(200) NOT NULL,
  content        TEXT         NULL,
  is_popup       TINYINT(1)   NOT NULL DEFAULT 0,
  popup_start_dt DATE         NULL,
  popup_end_dt   DATE         NULL,
  pinned         TINYINT(1)   NOT NULL DEFAULT 0,
  status         VARCHAR(20)  NOT NULL DEFAULT 'ACTIVE',
  created_at     DATETIME     NULL,
  updated_at     DATETIME     NULL,
  created_id     VARCHAR(20)  NULL,
  updated_id     VARCHAR(20)  NULL,
  PRIMARY KEY (id),
  KEY idx_notices_popup (is_popup, status),
  KEY idx_notices_company (company_cd, status)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;
