package com.tara.crm.info.entity;

import com.tara.crm.common.audit.BaseEntity;
import jakarta.persistence.*;
import lombok.AllArgsConstructor;
import lombok.Builder;
import lombok.Getter;
import lombok.NoArgsConstructor;
import lombok.Setter;

/** 고객 담당자 연락처 — 거래처 한 곳에 여러 명. */
@Entity
@Table(name = "partner_contact")
@Getter
@Setter
@NoArgsConstructor
@AllArgsConstructor
@Builder
public class PartnerContact extends BaseEntity {

    @Id
    @GeneratedValue(strategy = GenerationType.IDENTITY)
    @Column(name = "contact_id")
    private Long contactId;

    @Column(name = "company_cd", nullable = false)
    private Integer companyCd;

    @Column(name = "partner_cd", nullable = false, length = 20)
    private String partnerCd;

    @Column(name = "name", nullable = false, length = 100)
    private String name;

    @Column(name = "position_nm", length = 100)
    private String positionNm;

    @Column(name = "dept_nm", length = 100)
    private String deptNm;

    @Column(name = "phone", length = 40)
    private String phone;

    @Column(name = "tel", length = 40)
    private String tel;

    @Column(name = "email", length = 150)
    private String email;

    @Column(name = "is_primary", nullable = false)
    private Boolean isPrimary;

    @Column(name = "memo", length = 500)
    private String memo;
}
