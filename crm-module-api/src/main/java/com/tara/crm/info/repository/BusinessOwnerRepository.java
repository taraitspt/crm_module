package com.tara.crm.info.repository;

import com.tara.crm.info.entity.BusinessOwner;
import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.data.jpa.repository.Query;
import org.springframework.data.repository.query.Param;

import java.util.List;
import java.util.Optional;

public interface BusinessOwnerRepository extends JpaRepository<BusinessOwner, Long> {
    Optional<BusinessOwner> findByCompanyCdAndPartnerCd(Integer companyCd, String partnerCd);

    /** 사업자관리 목록 N+1 제거용 — 페이지의 partnerCd 들을 IN 한 번으로 배치 조회. */
    List<BusinessOwner> findByCompanyCdAndPartnerCdIn(Integer companyCd, java.util.Collection<String> partnerCds);

    Optional<BusinessOwner> findFirstByCompanyCdAndPartnerCd(Integer companyCd, String partnerCd);
    boolean existsByCompanyCdAndBizNo(Integer companyCd, String bizNo);

    @Query("SELECT DISTINCT b.bizType FROM BusinessOwner b WHERE b.companyCd = :companyCd AND b.bizType IS NOT NULL AND b.bizType LIKE %:keyword% ORDER BY b.bizType")
    List<String> findDistinctBizTypes(@Param("companyCd") Integer companyCd, @Param("keyword") String keyword);

    @Query("SELECT DISTINCT b.bizItem FROM BusinessOwner b WHERE b.companyCd = :companyCd AND b.bizItem IS NOT NULL AND b.bizItem LIKE %:keyword% ORDER BY b.bizItem")
    List<String> findDistinctBizItems(@Param("companyCd") Integer companyCd, @Param("keyword") String keyword);

    @Query("SELECT b FROM BusinessOwner b WHERE b.companyCd = :companyCd AND (b.companyName LIKE %:keyword% OR b.partnerCd LIKE %:keyword%)")
    List<BusinessOwner> searchByKeyword(@Param("companyCd") Integer companyCd, @Param("keyword") String keyword);
}
