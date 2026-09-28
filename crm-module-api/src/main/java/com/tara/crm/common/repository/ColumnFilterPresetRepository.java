package com.tara.crm.common.repository;

import com.tara.crm.common.entity.ColumnFilterPreset;
import org.springframework.data.jpa.repository.JpaRepository;

import java.util.List;

public interface ColumnFilterPresetRepository extends JpaRepository<ColumnFilterPreset, Long> {

    List<ColumnFilterPreset> findByCompanyCdAndEmployeeNoAndPagePathAndColumnIdOrderByPresetIdAsc(
            Integer companyCd, String employeeNo, String pagePath, String columnId);

    /** 화면 단위 전체 — 프론트가 화면 진입 시 한 번에 받아 캐시(팝업 열 때 지연 없이 표시). */
    List<ColumnFilterPreset> findByCompanyCdAndEmployeeNoAndPagePathOrderByPresetIdAsc(
            Integer companyCd, String employeeNo, String pagePath);
}
