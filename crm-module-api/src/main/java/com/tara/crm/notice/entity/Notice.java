package com.tara.crm.notice.entity;

import com.tara.crm.common.audit.BaseEntity;
import jakarta.persistence.Column;
import jakarta.persistence.Entity;
import jakarta.persistence.GeneratedValue;
import jakarta.persistence.GenerationType;
import jakarta.persistence.Id;
import jakarta.persistence.Table;
import lombok.AllArgsConstructor;
import lombok.Builder;
import lombok.Getter;
import lombok.NoArgsConstructor;
import lombok.Setter;

import java.time.LocalDate;

/** 공지사항 1건 — 업데이트 안내·일반 공지. 팝업 기간(popupStart~popupEnd, 양끝 포함) 동안 팝업으로 뜬다(V165). */
@Entity
@Table(name = "notice")
@Getter
@Setter
@NoArgsConstructor
@AllArgsConstructor
@Builder
public class Notice extends BaseEntity {

    @Id
    @GeneratedValue(strategy = GenerationType.IDENTITY)
    @Column(name = "notice_id")
    private Long noticeId;

    /** UPDATE 업데이트 / NOTICE 공지 */
    @Column(name = "category", nullable = false, length = 20)
    private String category;

    @Column(name = "title", nullable = false, length = 200)
    private String title;

    /** 일반 텍스트(줄바꿈 유지) */
    @Column(name = "content", nullable = false, columnDefinition = "TEXT")
    private String content;

    @Column(name = "pinned", nullable = false)
    private boolean pinned;

    @Column(name = "popup_yn", nullable = false)
    private boolean popupYn;

    @Column(name = "popup_start")
    private LocalDate popupStart;

    @Column(name = "popup_end")
    private LocalDate popupEnd;

    @Column(name = "author_name", length = 50)
    private String authorName;
}
