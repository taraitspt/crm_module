-- 공지사항 게시판 (2026-10-16) — 업데이트 안내·일반 공지. 팝업 기간을 정하면 그 기간 동안 로그인 후 첫 화면에 팝업으로 뜬다(PC·모바일 앱).
-- GROW 의 옛 공지 기능은 포크 때 지웠고, 이건 CRM 용으로 새로 만든 것이다. 쓰기는 관리자(ADMIN)만, 읽기는 전원.
CREATE TABLE notice (
  notice_id    BIGINT       NOT NULL AUTO_INCREMENT,
  category     VARCHAR(20)  NOT NULL DEFAULT 'NOTICE' COMMENT 'UPDATE 업데이트 / NOTICE 공지',
  title        VARCHAR(200) NOT NULL,
  content      TEXT         NOT NULL COMMENT '일반 텍스트(줄바꿈 유지) — HTML 은 그대로 글자로 보인다',
  pinned       TINYINT(1)   NOT NULL DEFAULT 0 COMMENT '목록 상단 고정',
  popup_yn     TINYINT(1)   NOT NULL DEFAULT 0 COMMENT '팝업 사용',
  popup_start  DATE         NULL COMMENT '팝업 시작일(포함)',
  popup_end    DATE         NULL COMMENT '팝업 종료일(포함)',
  author_name  VARCHAR(50)  NULL COMMENT '작성자 표시 이름',
  created_at   DATETIME     NULL,
  updated_at   DATETIME     NULL,
  created_id   VARCHAR(20)  NULL,
  updated_id   VARCHAR(20)  NULL,
  PRIMARY KEY (notice_id),
  KEY ix_notice_popup (popup_yn, popup_start, popup_end)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci COMMENT='공지사항';

-- 메뉴 — 전 역할에 보이게. 끄려면 관리자 > 권한 관리에서.
INSERT INTO menu_permission (menu_key, role, can_view, created_at, created_id)
SELECT '/notices', r.role, 1, NOW(), 'system'
  FROM (SELECT 'ADMIN' AS role
        UNION ALL SELECT 'TEAM_LEADER'
        UNION ALL SELECT 'MANAGER'
        UNION ALL SELECT 'SALES_SPT'
        UNION ALL SELECT 'PROD_SPT'
        UNION ALL SELECT 'PART_LEADER'
        UNION ALL SELECT 'EXECUTIVE'
        UNION ALL SELECT 'CENTER_LEADER'
        UNION ALL SELECT 'FINANCE'
        UNION ALL SELECT 'STAFF') r
 WHERE NOT EXISTS (SELECT 1 FROM menu_permission p WHERE p.menu_key = '/notices' AND p.role = r.role);
