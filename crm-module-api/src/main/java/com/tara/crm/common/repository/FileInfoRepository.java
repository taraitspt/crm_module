package com.tara.crm.common.repository;

import com.tara.crm.common.entity.FileInfo;
import com.tara.crm.common.id.FileInfoId;
import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.data.jpa.repository.Query;
import org.springframework.data.repository.query.Param;

import java.util.List;

public interface FileInfoRepository extends JpaRepository<FileInfo, FileInfoId> {

    @Query("SELECT f FROM FileInfo f WHERE f.id.companyCd = :companyCd AND f.id.plantCd = :plantCd " +
           "AND f.orderNo = :orderNo AND f.orderSq = :orderSq")
    List<FileInfo> findByOrderDtl(@Param("companyCd") Integer companyCd,
                                   @Param("plantCd") Integer plantCd,
                                   @Param("orderNo") String orderNo,
                                   @Param("orderSq") Integer orderSq);

    @Query("SELECT f FROM FileInfo f WHERE f.id.companyCd = :companyCd AND f.id.plantCd = :plantCd " +
           "AND f.orderNo = :orderNo AND f.orderSq = :orderSq AND f.fileCategory = :category ORDER BY f.id.fileId")
    List<FileInfo> findByOrderDtlAndFileCategory(@Param("companyCd") Integer companyCd,
                                                 @Param("plantCd") Integer plantCd,
                                                 @Param("orderNo") String orderNo,
                                                 @Param("orderSq") Integer orderSq,
                                                 @Param("category") String category);

    /** 시트 #5 0513 — 외주발주서(po_no) 첨부파일 목록. */
    @Query("SELECT f FROM FileInfo f WHERE f.id.companyCd = :companyCd AND f.id.plantCd = :plantCd " +
           "AND f.poNo = :poNo ORDER BY f.id.fileId")
    List<FileInfo> findByPoNo(@Param("companyCd") Integer companyCd,
                              @Param("plantCd") Integer plantCd,
                              @Param("poNo") String poNo);

    /** 외주발주서 특정 카테고리(예: THUMBNAIL) 첨부 목록. */
    @Query("SELECT f FROM FileInfo f WHERE f.id.companyCd = :companyCd AND f.id.plantCd = :plantCd " +
           "AND f.poNo = :poNo AND f.fileCategory = :category ORDER BY f.id.fileId")
    List<FileInfo> findByPoNoAndFileCategory(@Param("companyCd") Integer companyCd,
                                             @Param("plantCd") Integer plantCd,
                                             @Param("poNo") String poNo,
                                             @Param("category") String category);

    /** 비대면결제번호 기준 첨부(THUMBNAIL 제외) — 안내메일 첨부용. 파일ID 오름차순. */
    @Query("SELECT f FROM FileInfo f WHERE f.id.companyCd = :companyCd AND f.id.plantCd = :plantCd " +
           "AND f.untactNo = :untactNo AND (f.fileCategory IS NULL OR f.fileCategory <> 'THUMBNAIL') ORDER BY f.id.fileId")
    List<FileInfo> findAttachmentsByUntactNo(@Param("companyCd") Integer companyCd,
                                             @Param("plantCd") Integer plantCd,
                                             @Param("untactNo") String untactNo);

    /** 공지사항(notice_id) 첨부파일 목록. 업로드 순서(파일ID 오름차순). */
    @Query("SELECT f FROM FileInfo f WHERE f.id.companyCd = :companyCd AND f.id.plantCd = :plantCd " +
           "AND f.noticeId = :noticeId ORDER BY f.id.fileId")
    List<FileInfo> findByNoticeId(@Param("companyCd") Integer companyCd,
                                  @Param("plantCd") Integer plantCd,
                                  @Param("noticeId") Long noticeId);

    /** 사내실적 매출(sales_no) 첨부파일 목록. 업로드 순서(파일ID 오름차순). */
    @Query("SELECT f FROM FileInfo f WHERE f.id.companyCd = :companyCd AND f.id.plantCd = :plantCd " +
           "AND f.salesNo = :salesNo ORDER BY f.id.fileId")
    List<FileInfo> findBySalesNo(@Param("companyCd") Integer companyCd,
                                 @Param("plantCd") Integer plantCd,
                                 @Param("salesNo") String salesNo);

    /** 매출목록 아이콘 색상용 배치 — 첨부파일이 있는 sales_no 만. */
    @Query("SELECT DISTINCT f.salesNo FROM FileInfo f WHERE f.id.companyCd = :companyCd " +
           "AND f.salesNo IN (:salesNos)")
    List<String> findSalesNosWithFiles(@Param("companyCd") Integer companyCd,
                                       @Param("salesNos") List<String> salesNos);
}
