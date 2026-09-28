UPDATE sales_mst SET total_amt = supply_amt + tax_amt WHERE total_amt != supply_amt + tax_amt;
UPDATE sales_dtl SET total_amt = supply_amt + tax_amt WHERE total_amt != supply_amt + tax_amt;
