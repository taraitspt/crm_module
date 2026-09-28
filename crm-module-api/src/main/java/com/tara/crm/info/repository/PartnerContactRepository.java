package com.tara.crm.info.repository;

import com.tara.crm.info.entity.PartnerContact;
import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.data.jpa.repository.Modifying;
import org.springframework.data.jpa.repository.Query;
import org.springframework.data.repository.query.Param;

import java.util.List;

public interface PartnerContactRepository extends JpaRepository<PartnerContact, Long> {

    @Query("""
            SELECT c FROM PartnerContact c
             WHERE c.companyCd = :companyCd AND c.partnerCd = :partnerCd
             ORDER BY c.isPrimary DESC, c.name ASC
            """)
    List<PartnerContact> findByPartner(@Param("companyCd") Integer companyCd,
                                       @Param("partnerCd") String partnerCd);

    /** 대표 담당자는 거래처당 한 명 — 새로 지정할 때 나머지를 내린다. */
    @Modifying
    @Query("""
            UPDATE PartnerContact c SET c.isPrimary = false
             WHERE c.companyCd = :companyCd AND c.partnerCd = :partnerCd
               AND (:keepId IS NULL OR c.contactId <> :keepId)
            """)
    void clearPrimary(@Param("companyCd") Integer companyCd,
                      @Param("partnerCd") String partnerCd,
                      @Param("keepId") Long keepId);
}
