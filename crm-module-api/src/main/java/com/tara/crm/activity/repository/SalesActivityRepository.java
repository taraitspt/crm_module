package com.tara.crm.activity.repository;

import com.tara.crm.activity.entity.SalesActivity;
import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.data.jpa.repository.Query;
import org.springframework.data.repository.query.Param;

import java.time.LocalDate;
import java.util.List;

public interface SalesActivityRepository extends JpaRepository<SalesActivity, Long> {

    /**
     * 기간 + 선택 조건 조회. 파라미터가 null 이면 그 조건은 무시된다.
     * 캘린더·일자별 현황·이력 목록이 모두 이 쿼리를 쓴다.
     */
    @Query("""
            SELECT a FROM SalesActivity a
             WHERE a.companyCd = :companyCd
               AND a.activityDt BETWEEN :from AND :to
               AND (:salesEmpId IS NULL OR a.salesEmpId = :salesEmpId)
               AND (:partnerCd IS NULL OR a.partnerCd = :partnerCd)
               AND (:activityType IS NULL OR a.activityType = :activityType)
               AND (:keyword IS NULL OR a.title LIKE %:keyword% OR a.partnerNm LIKE %:keyword%)
             ORDER BY a.activityDt DESC, a.activityId DESC
            """)
    List<SalesActivity> search(@Param("companyCd") Integer companyCd,
                               @Param("from") LocalDate from,
                               @Param("to") LocalDate to,
                               @Param("salesEmpId") String salesEmpId,
                               @Param("partnerCd") String partnerCd,
                               @Param("activityType") String activityType,
                               @Param("keyword") String keyword);

    /** 거래처 히스토리 — 기간 제한 없이 최신순. */
    @Query("""
            SELECT a FROM SalesActivity a
             WHERE a.companyCd = :companyCd AND a.partnerCd = :partnerCd
             ORDER BY a.activityDt DESC, a.activityId DESC
            """)
    List<SalesActivity> findByPartner(@Param("companyCd") Integer companyCd,
                                      @Param("partnerCd") String partnerCd);

    /** 다음 액션 예정 — 오늘 이후(또는 지난 미완료) 팔로업 알림용. */
    @Query("""
            SELECT a FROM SalesActivity a
             WHERE a.companyCd = :companyCd
               AND a.nextActionDt IS NOT NULL
               AND a.nextActionDt BETWEEN :from AND :to
               AND (:salesEmpId IS NULL OR a.salesEmpId = :salesEmpId)
             ORDER BY a.nextActionDt ASC
            """)
    List<SalesActivity> findUpcoming(@Param("companyCd") Integer companyCd,
                                     @Param("from") LocalDate from,
                                     @Param("to") LocalDate to,
                                     @Param("salesEmpId") String salesEmpId);

    /** 특정 영업기회에 달린 활동 — 딜 카드의 진행 경과. */
    @Query("""
            SELECT a FROM SalesActivity a
             WHERE a.companyCd = :companyCd AND a.dealId = :dealId
             ORDER BY a.activityDt DESC, a.activityId DESC
            """)
    List<SalesActivity> findByDeal(@Param("companyCd") Integer companyCd, @Param("dealId") Long dealId);

    /** 딜별 활동 건수와 마지막 활동일 — 파이프라인 목록에 한 번에 붙인다. */
    @Query("""
            SELECT a.dealId, COUNT(a), MAX(a.activityDt) FROM SalesActivity a
             WHERE a.companyCd = :companyCd AND a.dealId IS NOT NULL
             GROUP BY a.dealId
            """)
    List<Object[]> dealActivityStats(@Param("companyCd") Integer companyCd);
}
