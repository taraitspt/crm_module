package com.tara.crm.common.code;

import com.tara.crm.common.id.CommonCodeId;
import com.tara.crm.common.util.SecurityContextUtil;
import lombok.RequiredArgsConstructor;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import java.util.List;
import java.util.stream.Collectors;

@Service
@RequiredArgsConstructor
@Transactional(readOnly = true)
public class CommonCodeService {

    private final CommonCodeRepository repository;

    private int companyCd() {
        Integer cd = SecurityContextUtil.getCurrentCompanyCd();
        return cd != null ? cd : 1000;
    }

    /** 그룹별 사용중 코드 (드롭다운용). */
    public List<CommonCodeDto.Item> listActive(String groupCd) {
        return repository.findActiveByGroup(companyCd(), groupCd).stream().map(this::toItem).collect(Collectors.toList());
    }

    /** 그룹별 전체 코드 (관리화면용, 미사용 포함). */
    public List<CommonCodeDto.Item> listAll(String groupCd) {
        return repository.findAllByGroup(companyCd(), groupCd).stream().map(this::toItem).collect(Collectors.toList());
    }

    /** 등록된 그룹 목록. */
    public List<String> groups() {
        return repository.findGroups(companyCd());
    }

    /** 코드 등록/수정 (upsert). PK = (company, group, code). */
    @Transactional
    public void save(CommonCodeDto.Item req) {
        CommonCodeId id = new CommonCodeId(companyCd(), req.getGroupCd(), req.getCode());
        CommonCode entity = repository.findById(id).orElseGet(() ->
            CommonCode.builder().id(id).build());
        entity.setLabel(req.getLabel());
        entity.setSortOrder(req.getSortOrder() != null ? req.getSortOrder() : 0);
        entity.setUseYn(req.getUseYn() != null ? req.getUseYn() : "Y");
        entity.setWrkDiv(req.getWrkDiv());
        repository.save(entity);
    }

    /** 코드 삭제. */
    @Transactional
    public void delete(String groupCd, String code) {
        repository.deleteById(new CommonCodeId(companyCd(), groupCd, code));
    }

    /**
     * 작업처(JOB_TYPE) 코드의 내부/외부 구분('I'/'O') 조회 — 내/외부 분류의 단일 진실원천.
     * 공통코드에 값이 없으면 코드 규칙(G06xx~G09xx, G9xxx = 외부)으로 폴백한다.
     */
    public String resolveJobTypeWrkDiv(String code) {
        if (code == null || code.isBlank()) return "I";
        String c = code.trim();
        String div = repository.findById(new CommonCodeId(companyCd(), "JOB_TYPE", c))
                .map(CommonCode::getWrkDiv).orElse(null);
        if ("I".equals(div) || "O".equals(div)) return div;
        String up = c.toUpperCase();
        if (up.equals("OUTSOURCE") || up.equals("PACKAGE") || up.equals("PURCHASE") || up.equals("VMD")) return "O";
        return (up.matches("G0[6-9]\\d{2}") || up.matches("G9\\d{3}")) ? "O" : "I";
    }

    /** 그룹+코드 → label 조회. 없으면 null. (배치 컨텍스트는 company_cd 기본 1000) */
    public String resolveLabel(String groupCd, String code) {
        if (groupCd == null || code == null || code.isBlank()) return null;
        return repository.findById(new CommonCodeId(companyCd(), groupCd, code.trim()))
                .map(CommonCode::getLabel).orElse(null);
    }

    private CommonCodeDto.Item toItem(CommonCode c) {
        return CommonCodeDto.Item.builder()
            .groupCd(c.getId().getGroupCd())
            .code(c.getId().getCode())
            .label(c.getLabel())
            .sortOrder(c.getSortOrder())
            .useYn(c.getUseYn())
            .wrkDiv(c.getWrkDiv())
            .build();
    }
}
