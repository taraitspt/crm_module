package com.tara.crm.common.id;

import jakarta.persistence.Column;
import jakarta.persistence.Embeddable;
import lombok.*;

import java.io.Serializable;

@Embeddable
@Getter @Setter
@NoArgsConstructor @AllArgsConstructor
@EqualsAndHashCode
public class CommonCodeId implements Serializable {

    @Column(name = "company_cd")
    private Integer companyCd;

    @Column(name = "group_cd", length = 40)
    private String groupCd;

    @Column(name = "code", length = 40)
    private String code;
}
