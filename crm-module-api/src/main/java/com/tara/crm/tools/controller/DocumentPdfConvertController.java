package com.tara.crm.tools.controller;

import com.tara.crm.tools.service.DocumentPdfConvertService;
import lombok.RequiredArgsConstructor;
import org.springframework.http.ContentDisposition;
import org.springframework.http.HttpHeaders;
import org.springframework.http.MediaType;
import org.springframework.http.ResponseEntity;
import org.springframework.security.access.prepost.PreAuthorize;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RequestParam;
import org.springframework.web.bind.annotation.RestController;
import org.springframework.web.multipart.MultipartFile;

import java.nio.charset.StandardCharsets;

@RestController
@RequestMapping("/api/tools/pdf-converter")
@RequiredArgsConstructor
@PreAuthorize("isAuthenticated()")
public class DocumentPdfConvertController {

    private final DocumentPdfConvertService convertService;

    @PostMapping(value = "/convert", consumes = MediaType.MULTIPART_FORM_DATA_VALUE)
    public ResponseEntity<byte[]> convert(@RequestParam("file") MultipartFile file) {
        var converted = convertService.convert(file);
        return ResponseEntity.ok()
                .contentType(MediaType.APPLICATION_PDF)
                .contentLength(converted.bytes().length)
                .header(HttpHeaders.CONTENT_DISPOSITION, ContentDisposition.attachment()
                        .filename(converted.filename(), StandardCharsets.UTF_8)
                        .build().toString())
                .body(converted.bytes());
    }
}
