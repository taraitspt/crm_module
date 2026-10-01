package com.tara.crm.stats.dto;

import lombok.*;

import java.util.List;

/**
 * 매출리스트 — GROW 월매출리스트 한 줄 = 매출번호 × 수주순번 × 주문(TOR).
 * 매출액(BOOK_AMT)은 ERP 장부금액 합계, 정산공임/용지는 주문 정산(SD_ORDSTL_INFO_X20329)에서 온 값이라
 * 주문이 없는 매출(배치 없는 매출·재고 로트 등)은 0 이다.
 */
public class SalesListDto {

    @Getter @Setter
    @NoArgsConstructor
    @AllArgsConstructor
    @Builder
    public static class Response {
        private List<Row> rows;
        /** 데이터 범위(SALES_STATS) 때문에 빠진 줄 수 — 0 이면 전부 보이는 것. */
        private int hiddenByScope;
    }

    @Getter @Setter
    @NoArgsConstructor
    @AllArgsConstructor
    @Builder
    public static class Row {
        /** 매출일 yyyy-MM-dd */
        private String billDate;
        private String billNo;
        /** 사업부문(공장) 1000 TPS / 2000 GRP / 3000 PM */
        private String plantCd;
        /** 부서 — 영업담당자의 매출일 기준 발령부서(HR_HUAN), 없으면 사원 마스터 부서 */
        private String deptCd;
        private String deptName;
        /** 영업담당 ERP 사번과 이름 — CRM 데이터 범위(SELF/DEPT) 판정에 쓴다 */
        private String salesEmpNo;
        private String salesEmpName;
        private String partnerCd;
        private String partnerName;
        private String itemCd;
        private String itemName;
        private String detailItemName;
        /** 매출수량 */
        private Double qty;
        /** 매출액(장부금액 합계) */
        private Long salesAmt;
        /** 정산공임 / 정산용지 / 정산합계 — 주문 정산 금액. 분할매출이면 줄마다 반복되므로 합산 금지 */
        private Double laborAmt;
        private Double paperAmt;
        private Double settleAmt;
        /** 수주유형 코드/명, 수주번호·순번 */
        private String soType;
        private String soTypeName;
        private String soNo;
        private Integer soSq;
        /** 주문구분(WRK_FG 명), 주문번호·순번 */
        private String orderType;
        private String orderNo;
        private Integer orderSq;
        /** 작업처 코드/명, 내/외부 */
        private String workPlaceCd;
        private String workPlaceName;
        private String inOut;
        /** 품목계정그룹 코드 */
        private String itemAcGroupCd;
        /** 제본정보 */
        private String bindInfo;
        /** 제작담당자 — 제작번호·순번(RFI.ORDDOC_NO/SQ)은 화면에서 안 써서 내리지 않는다 */
        private String makeEmpName;
        /** 영업그룹 코드/명 */
        private String salesGroupCd;
        private String salesGroupName;
        /** 비용센터 코드/명 — CRM 부서 범위 판정에 쓴다 */
        private String ccCd;
        private String ccName;
    }
}
