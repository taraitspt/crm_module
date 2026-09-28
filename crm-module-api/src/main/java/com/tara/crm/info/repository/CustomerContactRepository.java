package com.tara.crm.info.repository;

import com.tara.crm.info.entity.CustomerContact;
import org.springframework.data.domain.Page;
import org.springframework.data.domain.Pageable;
import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.data.jpa.repository.Query;
import org.springframework.data.repository.query.Param;

import java.util.Optional;

public interface CustomerContactRepository extends JpaRepository<CustomerContact, Long> {

    Optional<CustomerContact> findByCompanyCdAndPartnerCdAndId(Integer companyCd, String partnerCd, Long id);

    Optional<CustomerContact> findFirstByCompanyCdAndPartnerCd(Integer companyCd, String partnerCd);

    @Query("""
        SELECT c FROM CustomerContact c
        WHERE c.companyCd = :companyCd
          AND (:partnerCd IS NULL OR :partnerCd = '' OR c.partnerCd = :partnerCd)
          AND (:keyword IS NULL OR :keyword = ''
               OR c.companyName LIKE CONCAT('%', :keyword, '%')
               OR c.contactName LIKE CONCAT('%', :keyword, '%')
               OR c.contactEmail LIKE CONCAT('%', :keyword, '%')
               OR c.partnerCd   LIKE CONCAT('%', :keyword, '%'))
        ORDER BY c.companyName, c.contactName
        """)
    Page<CustomerContact> search(@Param("companyCd") Integer companyCd,
                                 @Param("keyword") String keyword,
                                 @Param("partnerCd") String partnerCd,
                                 Pageable pageable);
}
