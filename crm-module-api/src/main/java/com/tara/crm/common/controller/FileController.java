package com.tara.crm.common.controller;

import com.tara.crm.common.dto.ApiResponse;
import com.tara.crm.common.entity.FileInfo;
import com.tara.crm.common.service.FileService;
import com.tara.crm.common.util.SecurityContextUtil;
import io.swagger.v3.oas.annotations.Operation;
import io.swagger.v3.oas.annotations.tags.Tag;
import lombok.RequiredArgsConstructor;
import org.springframework.core.io.Resource;
import org.springframework.http.*;
import org.springframework.util.StringUtils;
import org.springframework.web.bind.annotation.*;
import org.springframework.web.multipart.MultipartFile;

import java.nio.charset.StandardCharsets;

@Tag(name = "File", description = "파일첨부 API")
@RestController
@RequestMapping("/api/files")
@RequiredArgsConstructor
public class FileController {

    private final FileService fileService;

    @Operation(summary = "파일 업로드")
    @PostMapping("/upload")
    public ApiResponse<FileInfo> upload(
            @RequestParam MultipartFile file,
            @RequestParam String orderNo,
            @RequestParam Integer orderSq) throws Exception {
        return ApiResponse.ok(fileService.upload(file, orderNo, orderSq));
    }

    @Operation(summary = "비대면결제 첨부 업로드 (엑셀/PDF, 10MB 이하, 1건)")
    @PostMapping("/upload-untact")
    public ApiResponse<FileInfo> uploadUntact(
            @RequestParam MultipartFile file,
            @RequestParam String untactNo) throws Exception {
        return ApiResponse.ok(fileService.uploadForUntact(file, untactNo));
    }

    @Operation(summary = "사내실적 매출 첨부 업로드")
    @PostMapping("/upload-sales")
    public ApiResponse<FileInfo> uploadSales(
            @RequestParam MultipartFile file,
            @RequestParam String salesNo) throws Exception {
        return ApiResponse.ok(fileService.uploadForSales(file, salesNo));
    }

    @Operation(summary = "사내실적 매출 첨부 목록")
    @GetMapping("/sales/{salesNo}")
    public ApiResponse<java.util.List<FileInfo>> listSales(@PathVariable String salesNo) {
        Integer companyCd = SecurityContextUtil.getCurrentCompanyCd();
        Integer plantCd = SecurityContextUtil.getCurrentPlantCd();
        return ApiResponse.ok(fileService.listBySales(
            companyCd != null ? companyCd : 1000, plantCd != null ? plantCd : 2000, salesNo));
    }

    @Operation(summary = "매출 첨부 존재여부(배치) — 매출목록 아이콘 색상용")
    @PostMapping("/sales/exists")
    public ApiResponse<java.util.List<String>> salesExists(@RequestBody java.util.Map<String, java.util.List<String>> body) {
        Integer companyCd = SecurityContextUtil.getCurrentCompanyCd();
        return ApiResponse.ok(new java.util.ArrayList<>(
            fileService.salesNosWithFiles(companyCd != null ? companyCd : 1000,
                body.getOrDefault("salesNos", java.util.List.of()))));
    }

    @Operation(summary = "파일 다운로드")
    @GetMapping("/{fileId}/download")
    public ResponseEntity<Resource> download(@PathVariable String fileId) throws Exception {
        Integer companyCd = SecurityContextUtil.getCurrentCompanyCd();
        Integer plantCd = SecurityContextUtil.getCurrentPlantCd();
        int resolvedCompanyCd = companyCd != null ? companyCd : 1000;
        int resolvedPlantCd = plantCd != null ? plantCd : 1000;
        FileInfo fileInfo = fileService.getInfo(resolvedCompanyCd, resolvedPlantCd, fileId);
        Resource resource = fileService.download(
            resolvedCompanyCd,
            resolvedPlantCd,
            fileId);
        String filename = StringUtils.hasText(fileInfo.getOriginalName())
            ? fileInfo.getOriginalName()
            : resource.getFilename();
        MediaType contentType = StringUtils.hasText(fileInfo.getContentType())
            ? MediaType.parseMediaType(fileInfo.getContentType())
            : MediaType.APPLICATION_OCTET_STREAM;
        return ResponseEntity.ok()
            .contentType(contentType)
            .header(HttpHeaders.CONTENT_DISPOSITION,
                ContentDisposition.attachment()
                    .filename(filename, StandardCharsets.UTF_8)
                    .build()
                    .toString())
            .body(resource);
    }

    @Operation(summary = "파일 삭제")
    @DeleteMapping("/{fileId}")
    public ApiResponse<Void> delete(@PathVariable String fileId) throws Exception {
        Integer companyCd = SecurityContextUtil.getCurrentCompanyCd();
        Integer plantCd = SecurityContextUtil.getCurrentPlantCd();
        fileService.delete(
            companyCd != null ? companyCd : 1000,
            plantCd != null ? plantCd : 1000,
            fileId);
        return ApiResponse.ok();
    }
}
