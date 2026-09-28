package com.tara.crm.deal.repository;

import com.tara.crm.deal.entity.SalesDeal;
import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.data.jpa.repository.Query;
import org.springframework.data.repository.query.Param;

import java.util.List;

public interface SalesDealRepository extends JpaRepository<SalesDeal, Long> {

    /** 파이프라인 목록. null 파라미터는 조건에서 무시된다. */
    @Query("""
            SELECT d FROM SalesDeal d
             WHERE d.companyCd = :companyCd
               AND (:salesEmpId IS NULL OR d.salesEmpId = :salesEmpId)
               AND (:partnerCd IS NULL OR d.partnerCd = :partnerCd)
               AND (:stage IS NULL OR d.stage = :stage)
               AND (:keyword IS NULL OR d.title LIKE %:keyword% OR d.partnerNm LIKE %:keyword%)
             ORDER BY d.expectedAmt DESC, d.dealId DESC
            """)
    List<SalesDeal> search(@Param("companyCd") Integer companyCd,
                           @Param("salesEmpId") String salesEmpId,
                           @Param("partnerCd") String partnerCd,
                           @Param("stage") String stage,
                           @Param("keyword") String keyword);

    @Query("""
            SELECT d FROM SalesDeal d
             WHERE d.companyCd = :companyCd AND d.partnerCd = :partnerCd
             ORDER BY d.dealId DESC
            """)
    List<SalesDeal> findByPartner(@Param("companyCd") Integer companyCd,
                                  @Param("partnerCd") String partnerCd);

    /** 예상 마감일이 기간 안에 있는 열린 딜 — 캘린더에 마감 예정으로 찍는다. */
    @Query("""
            SELECT d FROM SalesDeal d
             WHERE d.companyCd = :companyCd
               AND d.expectedCloseDt BETWEEN :from AND :to
               AND d.stage NOT IN ('WON', 'LOST')
               AND (:salesEmpId IS NULL OR d.salesEmpId = :salesEmpId)
             ORDER BY d.expectedCloseDt ASC
            """)
    List<SalesDeal> findClosingBetween(@Param("companyCd") Integer companyCd,
                                       @Param("from") java.time.LocalDate from,
                                       @Param("to") java.time.LocalDate to,
                                       @Param("salesEmpId") String salesEmpId);
}
