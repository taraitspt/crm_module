package com.tara.crm.common.service;

import com.tara.crm.common.dto.ColumnFilterPresetDto;
import com.tara.crm.common.entity.ColumnFilterPreset;
import com.tara.crm.common.exception.BusinessException;
import com.tara.crm.common.exception.ErrorCode;
import com.tara.crm.common.repository.ColumnFilterPresetRepository;
import com.tara.crm.common.util.SecurityContextUtil;
import lombok.RequiredArgsConstructor;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import java.util.ArrayList;
import java.util.LinkedHashSet;
import java.util.List;
import java.util.Set;

/**
 * 컬럼 필터 저장조건 — 로그인 사용자 본인 것만 조회/저장/삭제.
 * 저장조건 1행 = (화면, 컬럼, 조건, 값 하나). 중복은 여기서 걸러낸다(테이블에 유니크 키 없음).
 */
@Service
@RequiredArgsConstructor
@Transactional(readOnly = true)
public class ColumnFilterPresetService {

    private static final int MAX_PER_COLUMN = 50;
    private static final Set<String> ALLOWED_OPS = Set.of("CONTAINS", "EQUALS", "NOT_CONTAINS", "GTE", "LTE", "IN");

    private final ColumnFilterPresetRepository repository;

    public List<ColumnFilterPresetDto.Item> list(String pagePath, String columnId) {
        validateKey(pagePath, columnId);
        return repository.findByCompanyCdAndEmployeeNoAndPagePathAndColumnIdOrderByPresetIdAsc(
                companyCd(), owner(), pagePath, columnId)
            .stream().map(ColumnFilterPresetService::toItem).toList();
    }

    /** 화면 단위 전체 목록(모든 컬럼) — 화면 진입 시 1회 선조회용. */
    public List<ColumnFilterPresetDto.Item> listByPage(String pagePath) {
        if (pagePath == null || pagePath.isBlank() || pagePath.length() > 100) {
            throw new BusinessException(ErrorCode.INVALID_INPUT, "화면 정보가 올바르지 않습니다.");
        }
        return repository.findByCompanyCdAndEmployeeNoAndPagePathOrderByPresetIdAsc(companyCd(), owner(), pagePath)
            .stream().map(ColumnFilterPresetService::toItem).toList();
    }

    /** 값마다 1행 저장. 이미 같은 (조건, 값) 이 있으면 건너뛴다. 저장 후 전체 목록 반환. */
    @Transactional
    public List<ColumnFilterPresetDto.Item> save(ColumnFilterPresetDto.SaveRequest req) {
        validateKey(req.getPagePath(), req.getColumnId());
        String op = req.getFilterOp() == null ? "" : req.getFilterOp().trim().toUpperCase();
        if (!ALLOWED_OPS.contains(op)) {
            throw new BusinessException(ErrorCode.INVALID_INPUT, "저장할 수 없는 조건입니다: " + op);
        }
        Set<String> values = new LinkedHashSet<>();
        for (String v : req.getFilterValues() == null ? List.<String>of() : req.getFilterValues()) {
            if (v == null) continue;
            String t = v.trim();
            if (t.isEmpty()) continue;
            if (t.length() > 200) throw new BusinessException(ErrorCode.INVALID_INPUT, "값이 너무 깁니다: " + t);
            values.add(t);
        }
        if (values.isEmpty()) {
            throw new BusinessException(ErrorCode.INVALID_INPUT, "저장할 값이 없습니다.");
        }

        Integer companyCd = companyCd();
        String owner = owner();
        List<ColumnFilterPreset> existing = repository
            .findByCompanyCdAndEmployeeNoAndPagePathAndColumnIdOrderByPresetIdAsc(
                companyCd, owner, req.getPagePath(), req.getColumnId());
        Set<String> existingKeys = new LinkedHashSet<>();
        existing.forEach(p -> existingKeys.add(p.getFilterOp() + "" + p.getFilterValue()));

        List<ColumnFilterPreset> toAdd = new ArrayList<>();
        for (String v : values) {
            if (existingKeys.contains(op + "" + v)) continue;   // 중복 — 코드에서 차단
            toAdd.add(ColumnFilterPreset.builder()
                .companyCd(companyCd).employeeNo(owner)
                .pagePath(req.getPagePath()).columnId(req.getColumnId())
                .filterOp(op).filterValue(v)
                .build());
        }
        if (existing.size() + toAdd.size() > MAX_PER_COLUMN) {
            throw new BusinessException(ErrorCode.INVALID_INPUT,
                "한 컬럼에는 조건을 " + MAX_PER_COLUMN + "개까지만 저장할 수 있습니다.");
        }
        if (!toAdd.isEmpty()) repository.saveAll(toAdd);
        return list(req.getPagePath(), req.getColumnId());
    }

    /** 본인 것만 삭제. 남의 id 를 넘겨도 조용히 무시(존재 여부를 알려주지 않음). */
    @Transactional
    public void delete(Long presetId) {
        if (presetId == null) return;
        repository.findById(presetId).ifPresent(p -> {
            if (p.getCompanyCd().equals(companyCd()) && p.getEmployeeNo().equals(owner())) {
                repository.delete(p);
            }
        });
    }

    private static ColumnFilterPresetDto.Item toItem(ColumnFilterPreset p) {
        return ColumnFilterPresetDto.Item.builder()
            .presetId(p.getPresetId()).columnId(p.getColumnId())
            .filterOp(p.getFilterOp()).filterValue(p.getFilterValue())
            .build();
    }

    private static void validateKey(String pagePath, String columnId) {
        if (pagePath == null || pagePath.isBlank() || pagePath.length() > 100
                || columnId == null || columnId.isBlank() || columnId.length() > 50) {
            throw new BusinessException(ErrorCode.INVALID_INPUT, "화면/컬럼 정보가 올바르지 않습니다.");
        }
    }

    private static Integer companyCd() {
        Integer c = SecurityContextUtil.getCurrentCompanyCd();
        return c != null ? c : 1000;
    }

    /** 소유자 = 사번, 사번 없는 계정은 로그인 id. */
    private static String owner() {
        String who = SecurityContextUtil.getCurrentEmployeeNo();
        if (who == null || who.isBlank()) who = SecurityContextUtil.getCurrentUserId();
        if (who == null || who.isBlank()) {
            throw new BusinessException(ErrorCode.INVALID_INPUT, "로그인 사용자를 확인할 수 없습니다.");
        }
        return who;
    }
}
