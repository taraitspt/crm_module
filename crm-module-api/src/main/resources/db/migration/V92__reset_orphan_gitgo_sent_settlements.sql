-- Reset preview-stage Gitgo pending rows that never produced a voucher document.
-- The fixed flow marks GITGO_SENT only when voucher_mst is created and tbl_key is linked.
UPDATE po_settle_dtl d
JOIN po_settle_mst m
  ON m.company_cd = d.company_cd
 AND m.plant_cd = d.plant_cd
 AND m.pos_no = d.pos_no
SET d.settle_status_cd = 'SETTLED'
WHERE m.status_cd = 'GITGO_SENT'
  AND m.tbl_key IS NULL
  AND m.erp_voucher_no IS NULL
  AND m.gitgo_doc_id IS NULL
  AND (m.gitgo_appr_state IS NULL OR m.gitgo_appr_state = 'D');

UPDATE po_settle_mst
SET status_cd = 'SETTLED',
    gitgo_appr_state = NULL,
    gitgo_appr_requested_at = NULL
WHERE status_cd = 'GITGO_SENT'
  AND tbl_key IS NULL
  AND erp_voucher_no IS NULL
  AND gitgo_doc_id IS NULL
  AND (gitgo_appr_state IS NULL OR gitgo_appr_state = 'D');
