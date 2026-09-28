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
public class FileInfoId implements Serializable {

    @Column(name = "company_cd")
    private Integer companyCd;

    @Column(name = "plant_cd")
    private Integer plantCd;

    @Column(name = "file_id", length = 50)
    private String fileId;
}
