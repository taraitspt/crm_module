package com.tara.crm.info.repository;

import com.tara.crm.common.id.GoalMstId;
import com.tara.crm.info.entity.GoalMst;
import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.data.jpa.repository.Query;
import org.springframework.data.repository.query.Param;

import java.util.List;

public interface GoalMstRepository extends JpaRepository<GoalMst, GoalMstId> {

    @Query("SELECT g FROM GoalMst g WHERE g.id.companyCd = :companyCd AND g.id.plantCd = :plantCd " +
           "AND g.id.planYy = :planYy AND g.id.planMm = :planMm AND g.id.fieldCd = :fieldCd")
    List<GoalMst> findByYearMonthAndField(@Param("companyCd") Integer companyCd,
                                           @Param("plantCd") Integer plantCd,
                                           @Param("planYy") String planYy,
                                           @Param("planMm") String planMm,
                                           @Param("fieldCd") String fieldCd);

    @Query("SELECT g FROM GoalMst g WHERE g.id.companyCd = :companyCd AND g.id.plantCd = :plantCd " +
           "AND g.id.planYy = :planYy AND g.id.fieldCd = :fieldCd")
    List<GoalMst> findByYearAndField(@Param("companyCd") Integer companyCd,
                                      @Param("plantCd") Integer plantCd,
                                      @Param("planYy") String planYy,
                                      @Param("fieldCd") String fieldCd);
}
