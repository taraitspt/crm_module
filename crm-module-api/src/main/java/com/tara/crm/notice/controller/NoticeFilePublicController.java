package com.tara.crm.notice.controller;

import com.tara.crm.common.entity.FileInfo;
import com.tara.crm.notice.service.NoticeService;
import io.swagger.v3.oas.annotations.Operation;
import io.swagger.v3.oas.annotations.tags.Tag;
import lombok.RequiredArgsConstructor;
import org.springframework.core.io.Resource;
import org.springframework.http.ContentDisposition;
import org.springframework.http.HttpHeaders;
import org.springframework.http.MediaType;
import org.springframework.http.ResponseEntity;
import org.springframework.util.StringUtils;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PathVariable;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RequestParam;
import org.springframework.web.bind.annotation.RestController;

import java.io.IOException;
import java.nio.charset.StandardCharsets;

/**
 * 공지 첨부 다운로드 — 로그인 토큰 대신 서명된 주소로 받는다(/api/public/** 는 인증 없이 열림).
 * 주소는 로그인한 사람이 NoticeController#fileLink 로만 받을 수 있고 몇 분 뒤 만료된다.
 * 모바일 앱(WebView)은 JWT 헤더를 붙인 파일 받기가 안 돼서 이 주소를 폰 브라우저로 넘긴다.
 * 파일 형식은 클라이언트가 보낸 값을 믿지 않고 항상 내려받기(octet-stream + attachment)로 준다.
 */
@RestController
@RequestMapping("/api/public/notice-files")
@RequiredArgsConstructor
@Tag(name = "Notice", description = "공지사항")
public class NoticeFilePublicController {

    private final NoticeService service;

    @GetMapping("/{fileId}")
    @Operation(summary = "공지 첨부 내려받기 — 서명(sig)·만료(exp) 확인")
    public ResponseEntity<Resource> download(@PathVariable String fileId, @RequestParam long exp, @RequestParam String sig) throws IOException {
        FileInfo f = service.verifiedFile(fileId, exp, sig);
        String name = StringUtils.hasText(f.getOriginalName()) ? f.getOriginalName() : "file";
        return ResponseEntity.ok()
                .contentType(MediaType.APPLICATION_OCTET_STREAM)
                .header(HttpHeaders.CONTENT_DISPOSITION, ContentDisposition.attachment().filename(name, StandardCharsets.UTF_8).build().toString())
                .header("X-Content-Type-Options", "nosniff")
                .header(HttpHeaders.CACHE_CONTROL, "no-store")
                .body(service.resource(f));
    }
}
