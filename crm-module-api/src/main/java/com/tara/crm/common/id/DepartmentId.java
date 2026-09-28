package com.tara.crm.common.id;

import jakarta.persistence.Column;
import jakarta.persistence.Embeddable;
import lombok.*;

import java.io.Serializable;

@Embeddable
@Getter
@NoArgsConstructor
@AllArgsConstructor
@EqualsAndHashCode
public class DepartmentId implements Serializable {

    @Column(name = "company_cd")
    private Integer companyCd;

    @Column(name = "dept_cd")
    private Integer deptCd;
}
