package com.tara.crm.info.entity;

import com.tara.crm.common.audit.BaseEntity;
import jakarta.persistence.*;
import lombok.*;

@Entity
@Table(name = "customer_contacts")
@Getter @Setter
@NoArgsConstructor(access = AccessLevel.PROTECTED)
@AllArgsConstructor @Builder
public class CustomerContact extends BaseEntity {

    @Id
    @GeneratedValue(strategy = GenerationType.IDENTITY)
    private Long id;

    @Column(name = "company_cd")
    private Integer companyCd;

    @Column(name = "partner_cd", length = 20)
    private String partnerCd;

    @Column(name = "company_name", length = 100)
    private String companyName;

    @Column(name = "contact_name", length = 50)
    private String contactName;

    @Column(name = "contact_dept", length = 100)
    private String contactDept;

    @Column(name = "contact_position", length = 50)
    private String contactPosition;

    @Column(name = "contact_email", length = 100)
    private String contactEmail;

    @Column(name = "contact_phone", length = 20)
    private String contactPhone;

    @Column(length = 500)
    private String note;
}
