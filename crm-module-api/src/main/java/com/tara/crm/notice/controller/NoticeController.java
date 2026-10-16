package com.tara.crm.notice.controller;

import com.tara.crm.common.dto.ApiResponse;
import com.tara.crm.notice.dto.NoticeDto;
import com.tara.crm.notice.service.NoticeService;
import io.swagger.v3.oas.annotations.Operation;
import io.swagger.v3.oas.annotations.tags.Tag;
import jakarta.validation.Valid;
import lombok.RequiredArgsConstructor;
import org.springframework.security.access.prepost.PreAuthorize;
import org.springframework.web.bind.annotation.DeleteMapping;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PathVariable;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.PutMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RequestParam;
import org.springframework.web.bind.annotation.RestController;
import org.springframework.web.multipart.MultipartFile;

import java.io.IOException;
import java.util.List;

/** 공지사항 게시판 — 읽기 전원, 작성·수정·삭제 ADMIN. 팝업은 오늘이 팝업 기간 안인 공지. */
@RestController
@RequestMapping("/api/notices")
@RequiredArgsConstructor
@Tag(name = "Notice", description = "공지사항")
public class NoticeController {

    private final NoticeService service;

    @GetMapping
    @Operation(summary = "공지 목록 — 상단 고정 먼저, 최신순")
    public ApiResponse<List<NoticeDto.Item>> list() {
        return ApiResponse.ok(service.list());
    }

    @GetMapping("/popups")
    @Operation(summary = "오늘 팝업으로 띄울 공지(팝업 기간 안)")
    public ApiResponse<List<NoticeDto.Item>> popups() {
        return ApiResponse.ok(service.popups());
    }

    @GetMapping("/{id}")
    @Operation(summary = "공지 상세")
    public ApiResponse<NoticeDto.Item> get(@PathVariable Long id) {
        return ApiResponse.ok(service.get(id));
    }

    @PostMapping
    @PreAuthorize("hasRole('ADMIN')")
    @Operation(summary = "공지 작성 (관리자)")
    public ApiResponse<NoticeDto.Item> create(@Valid @RequestBody NoticeDto.SaveRequest req) {
        return ApiResponse.ok(service.create(req));
    }

    @PutMapping("/{id}")
    @PreAuthorize("hasRole('ADMIN')")
    @Operation(summary = "공지 수정 (관리자)")
    public ApiResponse<NoticeDto.Item> update(@PathVariable Long id, @Valid @RequestBody NoticeDto.SaveRequest req) {
        return ApiResponse.ok(service.update(id, req));
    }

    @DeleteMapping("/{id}")
    @PreAuthorize("hasRole('ADMIN')")
    @Operation(summary = "공지 삭제 (관리자)")
    public ApiResponse<Void> delete(@PathVariable Long id) throws IOException {
        service.delete(id);
        return ApiResponse.ok();
    }

    // ── 첨부파일 ──

    @PostMapping("/{id}/files")
    @PreAuthorize("hasRole('ADMIN')")
    @Operation(summary = "첨부 올리기 (관리자) — 한 번에 한 파일, 95MB 이하, 문서·이미지·zip·mp4")
    public ApiResponse<NoticeDto.FileItem> addFile(@PathVariable Long id, @RequestParam("file") MultipartFile file) throws IOException {
        return ApiResponse.ok(service.addFile(id, file));
    }

    @DeleteMapping("/{id}/files/{fileId}")
    @PreAuthorize("hasRole('ADMIN')")
    @Operation(summary = "첨부 지우기 (관리자)")
    public ApiResponse<Void> deleteFile(@PathVariable Long id, @PathVariable String fileId) throws IOException {
        service.deleteFile(id, fileId);
        return ApiResponse.ok();
    }

    @GetMapping("/{id}/files/{fileId}/link")
    @Operation(summary = "첨부 다운로드 주소 — 몇 분만 유효한 서명 주소(/api/public/notice-files/...). 앱에선 폰 브라우저로 연다")
    public ApiResponse<NoticeDto.FileLink> fileLink(@PathVariable Long id, @PathVariable String fileId) {
        return ApiResponse.ok(service.fileLink(id, fileId));
    }
}
