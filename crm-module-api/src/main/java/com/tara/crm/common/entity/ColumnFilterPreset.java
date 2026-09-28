package com.tara.crm.common.entity;

import com.tara.crm.common.audit.BaseEntity;
import jakarta.persistence.*;
import lombok.*;

/**
 * 컬럼 필터 저장조건 (V130) — 목록 화면 th 필터 팝업의 "저장된 조건" 1건 = 조건 하나 + 값 하나.
 * 중복 방지는 유니크 키 없이 서비스(save)에서 한다.
 */
@Entity
@Table(name = "column_filter_preset")
@Getter @Setter
@NoArgsConstructor(access = AccessLevel.PROTECTED)
@AllArgsConstructor @Builder
public class ColumnFilterPreset extends BaseEntity {

    @Id
    @GeneratedValue(strategy = GenerationType.IDENTITY)
    @Column(name = "preset_id")
    private Long presetId;

    @Column(name = "company_cd", nullable = false)
    private Integer companyCd;

    @Column(name = "employee_no", length = 20, nullable = false)
    private String employeeNo;

    @Column(name = "page_path", length = 100, nullable = false)
    private String pagePath;

    @Column(name = "column_id", length = 50, nullable = false)
    private String columnId;

    @Column(name = "filter_op", length = 20, nullable = false)
    private String filterOp;

    @Column(name = "filter_value", length = 200, nullable = false)
    private String filterValue;
}
