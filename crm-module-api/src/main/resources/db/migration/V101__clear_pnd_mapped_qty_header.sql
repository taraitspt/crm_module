UPDATE po_mst pm
   SET pm.qty_header = NULL
 WHERE pm.qty_header IS NOT NULL
   AND TRIM(pm.qty_header) REGEXP '^[0-9]+$'
   AND EXISTS (
       SELECT 1
         FROM po_dtl pd
        WHERE pd.company_cd = pm.company_cd
          AND pd.plant_cd = pm.plant_cd
          AND pd.po_no COLLATE utf8mb4_unicode_ci = pm.po_no COLLATE utf8mb4_unicode_ci
          AND pd.po_item_type COLLATE utf8mb4_unicode_ci = _utf8mb4'S001' COLLATE utf8mb4_unicode_ci
          AND CAST(TRIM(pm.qty_header) AS UNSIGNED) = pd.quantity
   );
