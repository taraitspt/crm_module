package com.tara.crm.integration.erp;

import java.util.Map;

/**
 * ERP 직책 코드(HR_EMP_MST.ODTY_CD) → users.job_title.
 * 2026-09-28 ERP 조회로 확인한 값만 넣었다(김득용·이택균=120, 신석호=140, 고석호=200 등).
 * 뜻이 확인되지 않은 코드(016·110·130·170·190)는 null 을 돌려주고, 동기화는 그 사람의 job_title 을 건드리지 않는다.
 */
public final class ErpJobTitle {

    private static final Map<String, String> TITLES = Map.of(
            "100", "대표이사",
            "120", "본부장",
            "140", "팀장",
            "150", "파트장",
            "200", "파트장",
            "160", "센터장",
            "180", "매니저"
    );

    private ErpJobTitle() {}

    /** 확인된 코드면 직책명, 아니면 null */
    public static String of(String odtyCd) {
        return odtyCd == null ? null : TITLES.get(odtyCd.trim());
    }
}
