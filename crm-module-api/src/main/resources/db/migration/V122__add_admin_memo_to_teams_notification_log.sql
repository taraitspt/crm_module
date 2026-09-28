-- 팀즈 생산상태 알림에 넘어가는 관리자 메모(ERP PP_ORDPOD_DTL_X20329.RMK_TXT3)를
-- 발송내역 로그에 구조화 저장 → 관리자 화면 "최근 발송내역"의 관리자메모 컬럼에 노출.
ALTER TABLE teams_notification_log ADD COLUMN admin_memo TEXT NULL;
