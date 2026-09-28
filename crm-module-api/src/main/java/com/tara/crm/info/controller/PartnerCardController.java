package com.tara.crm.info.controller;

import com.tara.crm.common.dto.ApiResponse;
import com.tara.crm.info.dto.PartnerContactDto;
import com.tara.crm.info.dto.PartnerOverviewDto;
import com.tara.crm.info.service.PartnerContactService;
import com.tara.crm.info.service.PartnerOverviewService;
import io.swagger.v3.oas.annotations.Operation;
import io.swagger.v3.oas.annotations.tags.Tag;
import jakarta.validation.Valid;
import lombok.RequiredArgsConstructor;
import org.springframework.security.access.prepost.PreAuthorize;
import org.springframework.web.bind.annotation.*;

import java.time.LocalDate;
import java.util.List;

@Tag(name = "PartnerCard", description = "거래처 카드(360도) + 고객 담당자 연락처")
@RestController
@RequestMapping("/api/partners")
@RequiredArgsConstructor
@PreAuthorize("isAuthenticated()")
public class PartnerCardController {

    private final PartnerOverviewService overviewService;
    private final PartnerContactService contactService;

    @Operation(summary = "거래처 카드 — 기본정보·계획/실적·연락처·딜·활동을 한 번에")
    @GetMapping("/{partnerCd}/overview")
    public ApiResponse<PartnerOverviewDto.Response> overview(
            @PathVariable String partnerCd,
            @RequestParam(required = false) Integer year) {
        int y = year != null ? year : LocalDate.now().getYear();
        return ApiResponse.ok(overviewService.overview(partnerCd, y));
    }

    @Operation(summary = "고객 담당자 연락처 목록")
    @GetMapping("/{partnerCd}/contacts")
    public ApiResponse<List<PartnerContactDto.Item>> contacts(@PathVariable String partnerCd) {
        return ApiResponse.ok(contactService.list(partnerCd));
    }

    @Operation(summary = "고객 담당자 등록")
    @PostMapping("/contacts")
    public ApiResponse<Long> createContact(@Valid @RequestBody PartnerContactDto.SaveRequest request) {
        return ApiResponse.ok(contactService.create(request));
    }

    @Operation(summary = "고객 담당자 수정")
    @PutMapping("/contacts/{id}")
    public ApiResponse<Void> updateContact(@PathVariable Long id,
                                           @Valid @RequestBody PartnerContactDto.SaveRequest request) {
        contactService.update(id, request);
        return ApiResponse.ok();
    }

    @Operation(summary = "고객 담당자 삭제")
    @DeleteMapping("/contacts/{id}")
    public ApiResponse<Void> deleteContact(@PathVariable Long id) {
        contactService.delete(id);
        return ApiResponse.ok();
    }
}
