package com.tara.crm.info.repository;

import com.tara.crm.common.id.SalesPlanId;
import com.tara.crm.info.entity.SalesPlan;
import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.data.jpa.repository.Modifying;
import org.springframework.data.jpa.repository.Query;
import org.springframework.data.repository.query.Param;

import java.util.List;

public interface SalesPlanRepository extends JpaRepository<SalesPlan, SalesPlanId> {

    @Query("SELECT p FROM SalesPlan p WHERE p.id.companyCd = :companyCd AND p.id.planYy = :planYy " +
           "ORDER BY p.id.salesEmpId, p.id.partnerCd, p.id.planMm")
    List<SalesPlan> findByYear(@Param("companyCd") Integer companyCd, @Param("planYy") String planYy);

    @Modifying
    @Query("DELETE FROM SalesPlan p WHERE p.id.companyCd = :companyCd AND p.id.planYy = :planYy " +
           "AND p.id.salesEmpId = :salesEmpId")
    void deleteByYearAndEmp(@Param("companyCd") Integer companyCd,
                            @Param("planYy") String planYy,
                            @Param("salesEmpId") String salesEmpId);
}
