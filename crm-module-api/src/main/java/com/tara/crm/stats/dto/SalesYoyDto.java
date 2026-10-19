package com.tara.crm.stats.dto;

import java.util.List;

/** 매출현황(전년 대비) — 올해·작년 ERP 매출을 거래처·비용센터·영업담당·월로 내려주고, 기간 합산·증감은 화면이 계산한다. */
public class SalesYoyDto {

    /**
     * 거래처 × 비용센터(영업팀) × 영업담당 한 줄 — cur/prev 는 1~12월 공급가액(원), 인덱스 0 = 1월.
     * 담당·비용센터는 매출 라인(SD_BILL_DTL)에 적힌 값 그대로라, 한 거래처가 해마다 다른 팀·담당으로 갈릴 수 있다.
     */
    public record Row(String partnerCd, String partnerNm, String ccCd, String ccNm, String empNo, String empNm,
                      long[] cur, long[] prev) {}

    /**
     * @param year          올해(조회 연도)
     * @param rows          거래처·비용센터·담당별 월 매출
     * @param erpAvailable  ERP 조회 성공 여부
     * @param erpMessage    실패 사유(화면 안내용)
     * @param hiddenByScope 데이터 범위(본인·부서) 때문에 뺀 줄 수
     */
    public record Response(int year, List<Row> rows, boolean erpAvailable, String erpMessage, int hiddenByScope) {}
}
