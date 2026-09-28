package com.tara.crm.common.menu;

import lombok.Getter;

import java.util.List;

/**
 * 데이터 범위를 걸 수 있는 리소스(데이터 종류).
 * 메뉴가 아니라 데이터 종류로 나눈 이유는 V142 마이그레이션 주석 참고.
 */
@Getter
public enum CrmResource {

    ACTIVITY("영업활동", "캘린더·일자별 현황·활동 이력·거래처 카드의 활동"),
    DEAL("영업기회", "파이프라인과 거래처 카드의 딜"),
    SALES_PLAN("월매출계획", "계획 입력과 계획 기반 집계"),
    SALES_STATS("매출현황·거래처 분석", "ERP 매출 집계 — 매출현황, 관리 필요 거래처");

    private final String label;
    private final String desc;

    CrmResource(String label, String desc) {
        this.label = label;
        this.desc = desc;
    }

    public static List<CrmResource> all() {
        return List.of(values());
    }
}
