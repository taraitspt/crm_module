package com.tara.crm.common.code;

import com.tara.crm.common.audit.BaseEntity;
import com.tara.crm.common.id.CommonCodeId;
import jakarta.persistence.*;
import lombok.*;

/** 공통 코드 — 세무구분/결제방식 등 코드성 값 관리. */
@Entity
@Table(name = "common_code")
@Getter @Setter
@NoArgsConstructor(access = AccessLevel.PROTECTED)
@AllArgsConstructor @Builder
public class CommonCode extends BaseEntity {

    @EmbeddedId
    private CommonCodeId id;

    @Column(name = "label", length = 100, nullable = false)
    private String label;

    @Column(name = "sort_order", nullable = false)
    @Builder.Default
    private Integer sortOrder = 0;

    @Column(name = "use_yn", length = 1, nullable = false)
    @Builder.Default
    private String useYn = "Y";

    /** 내부/외부 구분 — 작업처(group_cd='JOB_TYPE') 코드용. 'I'(내부)/'O'(외부). 그 외 그룹은 null. */
    @Column(name = "wrk_div", length = 1)
    private String wrkDiv;
}
