package com.tara.crm.info.entity;

import com.tara.crm.common.audit.BaseEntity;
import jakarta.persistence.*;
import lombok.*;

@Entity
@Table(name = "business_owners")
@Getter @Setter
@NoArgsConstructor(access = AccessLevel.PROTECTED)
@AllArgsConstructor @Builder
public class BusinessOwner extends BaseEntity {

    @Id
    @GeneratedValue(strategy = GenerationType.IDENTITY)
    private Long id;

    @Column(name = "company_cd")
    private Integer companyCd;

    @Column(name = "partner_cd", length = 20)
    private String partnerCd;

    @Column(name = "company_name", nullable = false, length = 100)
    private String companyName;

    @Column(name = "biz_no", length = 20)
    private String bizNo;

    @Column(name = "biz_type", length = 500)
    private String bizType;

    @Column(name = "biz_item", length = 500)
    private String bizItem;

    @Column(length = 255)
    private String address;

    // 시트 #1 (2026-05-18) — ERP 거래처 동기화 truncation 방지로 확장.
    @Column(name = "representative_name", length = 200)
    private String representativeName;

    @Column(name = "representative_email", length = 200)
    private String representativeEmail;

    @Column(name = "representative_phone", length = 50)
    private String representativePhone;

    @Column(name = "dept_cd")
    private Integer deptCd;

    // 시트 5/13 — ERP MA_PARTNERSA_INFO + CI_PARTNER_MST + MA_PARTNER_MST + MA_PARTNER_PTR 에서
    // 동기화한 보조 컬럼. UI 표출은 안 하지만 세금계산서발행 자동매핑/회계 연동 용도로 DB 저장.
    @Column(name = "post_no", length = 20)
    private String postNo;          // 우편번호 (CI_PARTNER_MST.POST_NO)

    @Column(name = "dtl_addr2", length = 255)
    private String dtlAddr2;        // 상세주소 (CI_PARTNER_MST.DTL_ADDR2)

    @Column(name = "subo_no", length = 20)
    private String suboNo;          // 종사업장번호 (MA_PARTNER_MST.SUBO_NO)

    @Column(name = "asgnr_tel_no", length = 50)
    private String asgnrTelNo;      // 담당자 내선 (MA_PARTNER_PTR.ASGNR_TEL_NO)

    @Column(name = "asgnr_dept_nm", length = 100)
    private String asgnrDeptNm;     // 담당자 부서명 (MA_PARTNER_PTR.ASGNR_DEPT_NM)
}
