package com.tara.crm.common.repository;

import com.tara.crm.common.entity.ClosingPeriod;
import com.tara.crm.common.id.ClosingPeriodId;
import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.data.jpa.repository.Query;
import org.springframework.data.repository.query.Param;

import java.time.LocalDateTime;
import java.util.List;
import java.util.Optional;

public interface ClosingPeriodRepository extends JpaRepository<ClosingPeriod, ClosingPeriodId> {

    @Query("SELECT c FROM ClosingPeriod c " +
           "WHERE c.id.companyCd = :companyCd AND c.id.plantCd = :plantCd " +
           "AND c.id.closingType = :type ORDER BY c.id.closingYm DESC")
    List<ClosingPeriod> findByType(@Param("companyCd") Integer companyCd,
                                    @Param("plantCd") Integer plantCd,
                                    @Param("type") String type);

    @Query("SELECT c FROM ClosingPeriod c " +
           "WHERE c.id.companyCd = :companyCd AND c.id.plantCd = :plantCd " +
           "AND c.id.closingType = :type AND c.id.closingYm = :ym")
    Optional<ClosingPeriod> findOne(@Param("companyCd") Integer companyCd,
                                     @Param("plantCd") Integer plantCd,
                                     @Param("type") String type,
                                     @Param("ym") String ym);

    /** 예약 마감 자동 활성화 대상 — closedAt 미박힘 + scheduledDt 가 now 이전. (시트 #2) */
    @Query("SELECT c FROM ClosingPeriod c " +
           "WHERE c.closedAt IS NULL AND c.scheduledDt IS NOT NULL " +
           "AND c.scheduledDt <= :now")
    List<ClosingPeriod> findDueScheduled(@Param("now") LocalDateTime now);
}
