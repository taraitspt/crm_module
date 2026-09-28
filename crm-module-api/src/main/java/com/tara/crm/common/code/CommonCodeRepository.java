package com.tara.crm.common.code;

import com.tara.crm.common.id.CommonCodeId;
import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.data.jpa.repository.Query;
import org.springframework.data.repository.query.Param;

import java.util.List;

public interface CommonCodeRepository extends JpaRepository<CommonCode, CommonCodeId> {

    /** 그룹별 사용중인 코드 (정렬순). 조회용. */
    @Query("SELECT c FROM CommonCode c WHERE c.id.companyCd = :companyCd AND c.id.groupCd = :groupCd " +
           "AND c.useYn = 'Y' ORDER BY c.sortOrder ASC, c.id.code ASC")
    List<CommonCode> findActiveByGroup(@Param("companyCd") Integer companyCd, @Param("groupCd") String groupCd);

    /** 그룹별 전체 코드 (관리화면용 — 미사용 포함). */
    @Query("SELECT c FROM CommonCode c WHERE c.id.companyCd = :companyCd AND c.id.groupCd = :groupCd " +
           "ORDER BY c.sortOrder ASC, c.id.code ASC")
    List<CommonCode> findAllByGroup(@Param("companyCd") Integer companyCd, @Param("groupCd") String groupCd);

    /** 등록된 그룹 코드 목록 (distinct). */
    @Query("SELECT DISTINCT c.id.groupCd FROM CommonCode c WHERE c.id.companyCd = :companyCd ORDER BY c.id.groupCd")
    List<String> findGroups(@Param("companyCd") Integer companyCd);
}
