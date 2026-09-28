package com.tara.crm.auth.controller;

import com.tara.crm.auth.entity.Department;
import com.tara.crm.auth.repository.DepartmentRepository;
import com.tara.crm.common.dto.ApiResponse;
import com.tara.crm.common.util.SecurityContextUtil;
import lombok.RequiredArgsConstructor;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RestController;

import java.util.List;
import java.util.Map;
import java.util.stream.Collectors;

@RestController
@RequestMapping("/api/departments")
@RequiredArgsConstructor
public class DepartmentController {

    private final DepartmentRepository departmentRepository;

    @GetMapping
    public ApiResponse<List<Map<String, Object>>> list() {
        Integer companyCd = SecurityContextUtil.getCurrentCompanyCd();
        List<Map<String, Object>> result = departmentRepository.findAllByCompanyCd(companyCd != null ? companyCd : 1000).stream()
            .map(d -> {
                Map<String, Object> row = new java.util.LinkedHashMap<>();
                row.put("companyCd", d.getId().getCompanyCd());
                row.put("deptCd", d.getId().getDeptCd());
                row.put("deptNm", d.getDeptNm());
                row.put("upDeptCd", d.getUpDeptCd());
                return row;
            })
            .collect(Collectors.toList());
        return ApiResponse.ok(result);
    }
}
