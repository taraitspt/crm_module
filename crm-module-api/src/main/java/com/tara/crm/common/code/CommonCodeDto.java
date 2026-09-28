package com.tara.crm.common.code;

import lombok.*;

public class CommonCodeDto {

    /** 조회/관리 응답 + 등록/수정 요청 공용. */
    @Getter @Setter @NoArgsConstructor @AllArgsConstructor @Builder
    public static class Item {
        private String groupCd;
        private String code;
        private String label;
        private Integer sortOrder;
        private String useYn;
        /** 내부/외부 구분 (작업처 JOB_TYPE 용): 'I'(내부)/'O'(외부). */
        private String wrkDiv;
    }
}
