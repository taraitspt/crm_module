package com.tara.crm.integration.erp.dto;

import lombok.*;

import java.time.LocalDate;

@Getter @Setter
@NoArgsConstructor
@AllArgsConstructor
@Builder
public class ErpEmployeeDto {
    private String empNo;
    private String korNm;
    private String deptCd;
    private String deptNm;
    /** 비용센터 코드 (시트 #65 — 주문번호 GOR yyMMdd CC4 SEQ3 의 CC4 부분) */
    private String ccCd;
    /** 가입일 (HR 입사일자) — 일별 incremental sync 키 */
    private LocalDate joinDt;
    private String email;
    private String phone;
    /** HR_EMP_MST.ODTY_CD — 180: 매니저, 200: 파트장 */
    private String odtyCd;
    /** CI_USER_MST.USER_ID — SM users 테이블 PK에 사용 */
    private String userId;
}
