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
public class ClosingPeriodId implements Serializable {

    @Column(name = "company_cd")
    private Integer companyCd;

    @Column(name = "plant_cd")
    private Integer plantCd;

    @Column(name = "closing_type", length = 20)
    private String closingType;

    @Column(name = "closing_ym", length = 6)
    private String closingYm;
}
