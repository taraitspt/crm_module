package com.tara.crm.integration.erp.dto;

import lombok.*;

@Getter @Setter
@NoArgsConstructor
@AllArgsConstructor
@Builder
public class ErpPartnerDto {
    private String partnerCd;
    private String partnerNm;
    private String bizrNo;
    private String ceoNm;
    private String biztpNm;   // 업태
    private String bizcNm;    // 종목
    private String baseAddr;
    private String dtlAddr2;
    private String telNo;      // 전화번호 (TEL_NO)
    private String faxNo;      // 팩스번호 (FAX_NO)
    private String deptCd;        // 담당부서코드 (BIZRSPT_EMPNO_CD → HR_EMP_MST.DEPT_CD, BizOwner용)
    private String deptNm;        // 담당부서명 (VW_MA_DEPT_MST.DEPT_NM, BizOwner용)
    private String asgnrNm;      // 거래처 담당자명 (MA_PARTNER_PTR.ASGNR_NM)
    private String asgnrDeptNm;  // 거래처 담당자 부서명 (MA_PARTNER_PTR.ASGNR_DEPT_NM)
    private String asgnrOdtyNm;  // 거래처 담당자 직위명 (MA_PARTNER_PTR.ASGNR_ODTY_NM)
    private String asgnrHpNo;    // 거래처 담당자 휴대폰 (MA_PARTNER_PTR.ASGNR_HP_NO)
    private String asgnrTelNo;   // 거래처 담당자 전화 (MA_PARTNER_PTR.ASGNR_TEL_NO)
    private String asgnrEmail;   // 거래처 담당자 이메일 (MA_PARTNER_PTR.ASGNR_EMAIL_NM)
    // 시트 정정 (Critical-4, 2026-05-19) — 사업자 SELECT 확장 필드
    private String suboNo;       // 종사업자번호 (MA_PARTNER_MST.SUBO_NO)
    private String postNo;       // 우편번호 (CI_PARTNER_MST.POST_NO)
    private java.time.LocalDateTime insertDts;  // 등록일시
    private java.time.LocalDateTime updateDts;  // 수정일시
}
