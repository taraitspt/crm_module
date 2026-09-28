ALTER TABLE sales_mst ADD COLUMN seller_dam_nm VARCHAR(50) NULL AFTER wehago_payload_json;
ALTER TABLE sales_mst ADD COLUMN seller_dam_email VARCHAR(100) NULL AFTER seller_dam_nm;
ALTER TABLE sales_mst ADD COLUMN seller_dam_dept VARCHAR(100) NULL AFTER seller_dam_email;
ALTER TABLE sales_mst ADD COLUMN seller_dam_mobil VARCHAR(30) NULL AFTER seller_dam_dept;
