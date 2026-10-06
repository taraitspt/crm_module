package com.tara.crm.stats.service;

import com.tara.crm.stats.repository.OracleTransportDeptRepository;
import lombok.RequiredArgsConstructor;
import org.springframework.stereotype.Service;

import java.time.LocalDate;
import java.util.List;
import java.util.Map;
import java.util.Objects;
import java.util.Optional;

/**
 * 운송정보 부서 점검 — 운송정보에 입력한 부서(의 비용센터)와 같은 주문 라인 수주의 비용센터를 대조해 판정(deptMatch)을 붙인다.
 *
 * <p>deptMatch: MATCH / MISMATCH / NO_SO(아직 수주 없음 — 운송정보가 수주보다 먼저 들어가므로 흔함) / SO_MIXED(수주 라인마다 CC 다름) / NO_DEPT_CC(운송 부서에 비용센터 없음).
 * empSame: 운송정보의 영업담당과 수주 헤더 영업담당이 같은지(Y/N, 수주 없으면 null) — 참고용.
 */
@Service
@RequiredArgsConstructor
public class TransportDeptService {

    private final Optional<OracleTransportDeptRepository> oracle;

    public List<Map<String, Object>> check(LocalDate start, LocalDate end) {
        OracleTransportDeptRepository repo = oracle.orElseThrow(() -> new IllegalStateException("Oracle ERP 연동이 비활성화되어 있습니다."));
        List<Map<String, Object>> rows = repo.findRows(start, end);
        for (Map<String, Object> r : rows) {
            int soCnt = num(r.get("soCnt"));
            int soCcCnt = num(r.get("soCcCnt"));
            String deptCc = str(r.get("deptCcCd"));
            String soCc = str(r.get("soCcCd"));
            String match = soCnt == 0 ? "NO_SO"
                    : soCcCnt > 1 ? "SO_MIXED"
                    : deptCc == null ? "NO_DEPT_CC"
                    : Objects.equals(deptCc, soCc) ? "MATCH" : "MISMATCH";
            r.put("deptMatch", match);
            String tEmp = str(r.get("bizrsptEmpnoCd"));
            String sEmp = str(r.get("soEmpnoCd"));
            r.put("empSame", soCnt == 0 || sEmp == null ? null : Objects.equals(tEmp, sEmp) ? "Y" : "N");
        }
        return rows;
    }

    private static int num(Object v) { return v instanceof Number n ? n.intValue() : 0; }

    private static String str(Object v) {
        if (v == null) return null;
        String s = String.valueOf(v).trim();
        return s.isEmpty() ? null : s;
    }
}
