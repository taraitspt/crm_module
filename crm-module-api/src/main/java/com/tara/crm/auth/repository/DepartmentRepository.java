package com.tara.crm.auth.repository;

import com.tara.crm.auth.entity.Department;
import com.tara.crm.common.id.DepartmentId;
import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.data.jpa.repository.Query;
import org.springframework.data.repository.query.Param;

import java.util.List;
import java.util.Optional;

public interface DepartmentRepository extends JpaRepository<Department, DepartmentId> {

    @Query("SELECT d FROM Department d WHERE d.id.companyCd = :companyCd AND d.erpDeptCode = :erpDeptCode")
    Optional<Department> findByErpDeptCode(@Param("companyCd") Integer companyCd,
                                            @Param("erpDeptCode") String erpDeptCode);

    @Query("SELECT d FROM Department d WHERE d.id.companyCd = :companyCd ORDER BY d.id.deptCd")
    List<Department> findAllByCompanyCd(@Param("companyCd") Integer companyCd);

    @Query("SELECT d FROM Department d WHERE d.id.companyCd = :companyCd AND d.upDeptCd = :upDeptCd ORDER BY d.id.deptCd")
    List<Department> findByUpDeptCd(@Param("companyCd") Integer companyCd,
                                     @Param("upDeptCd") Integer upDeptCd);
}
