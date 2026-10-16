package com.tara.crm.notice.dto;

import com.tara.crm.common.entity.FileInfo;
import com.tara.crm.notice.entity.Notice;
import jakarta.validation.constraints.NotBlank;
import jakarta.validation.constraints.Size;
import lombok.Getter;
import lombok.Setter;

import java.time.LocalDate;
import java.time.LocalDateTime;
import java.util.List;

public class NoticeDto {

    /** 첨부파일 한 건 — 받을 땐 /files/{fileId}/link 로 짧게 사는 다운로드 주소를 받는다. */
    public record FileItem(String fileId, String name, Long size) {
        public static FileItem of(FileInfo f) {
            return new FileItem(f.getId().getFileId(), f.getOriginalName(), f.getFileSize());
        }
    }

    /** 목록·상세·팝업 공통 행. */
    public record Item(Long noticeId, String category, String title, String content, boolean pinned,
                       boolean popupYn, LocalDate popupStart, LocalDate popupEnd,
                       String authorName, LocalDateTime createdAt, LocalDateTime updatedAt,
                       List<FileItem> files) {
        public static Item of(Notice n, List<FileItem> files) {
            return new Item(n.getNoticeId(), n.getCategory(), n.getTitle(), n.getContent(), n.isPinned(),
                    n.isPopupYn(), n.getPopupStart(), n.getPopupEnd(), n.getAuthorName(), n.getCreatedAt(), n.getUpdatedAt(),
                    files);
        }
    }

    /** 첨부 다운로드 주소 — 서명이 붙은 /api/public/notice-files/... (몇 분만 유효). */
    public record FileLink(String url) {}

    /** 작성·수정 요청 — 관리자 전용. 첨부는 저장 뒤 /files 로 따로 올린다. */
    @Getter
    @Setter
    public static class SaveRequest {
        /** UPDATE / NOTICE */
        private String category;
        @NotBlank @Size(max = 200)
        private String title;
        @NotBlank @Size(max = 20000)
        private String content;
        private boolean pinned;
        private boolean popupYn;
        private LocalDate popupStart;
        private LocalDate popupEnd;
    }
}
