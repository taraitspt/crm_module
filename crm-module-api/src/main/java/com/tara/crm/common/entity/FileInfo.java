package com.tara.crm.common.entity;

import com.tara.crm.common.audit.BaseEntity;
import com.tara.crm.common.id.FileInfoId;
import jakarta.persistence.*;
import lombok.*;

@Entity
@Table(name = "file_info")
@Getter @Setter
@NoArgsConstructor(access = AccessLevel.PROTECTED)
@AllArgsConstructor @Builder
public class FileInfo extends BaseEntity {

    @EmbeddedId
    private FileInfoId id;

    @Column(name = "order_no", length = 30)
    private String orderNo;

    @Column(name = "order_sq")
    private Integer orderSq;

    /** 시트 #5 0513 — 외주발주서(PoMst) 첨부파일 매핑. */
    @Column(name = "po_no", length = 30)
    private String poNo;

    /** 비대면결제(untact_mst) 안내메일 첨부파일 매핑. */
    @Column(name = "untact_no", length = 30)
    private String untactNo;

    /** 공지사항(notices.id) 첨부파일 매핑. */
    @Column(name = "notice_id")
    private Long noticeId;

    /** 사내실적(INTERNAL) 매출(sales_mst.sales_no) 첨부파일 매핑. */
    @Column(name = "sales_no", length = 30)
    private String salesNo;

    @Column(name = "original_name", nullable = false)
    private String originalName;

    @Column(name = "stored_name", nullable = false)
    private String storedName;

    @Column(name = "file_path", nullable = false, length = 500)
    private String filePath;

    @Column(name = "file_size")
    private Long fileSize;

    @Column(name = "content_type", length = 100)
    private String contentType;

    /** 파일 용도 구분. 'THUMBNAIL' = 외주발주서(패키지) 썸네일. NULL = 일반 첨부. */
    @Column(name = "file_category", length = 20)
    private String fileCategory;
}
