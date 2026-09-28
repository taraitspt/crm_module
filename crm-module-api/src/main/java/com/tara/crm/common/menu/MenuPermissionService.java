package com.tara.crm.common.menu;

import com.tara.crm.common.util.SecurityContextUtil;
import lombok.RequiredArgsConstructor;
import lombok.extern.slf4j.Slf4j;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import java.util.*;

/** 역할별 메뉴 권한 조회·저장. */
@Slf4j
@Service
@RequiredArgsConstructor
@Transactional(readOnly = true)
public class MenuPermissionService {

    private final MenuPermissionRepository repository;
    private final ResourceScopeService resourceScopeService;

    /** 관리자 화면용 매트릭스 — 카탈로그의 모든 메뉴 × 모든 역할. */
    public MenuPermissionDto.Matrix matrix() {
        Set<String> allowed = new HashSet<>();
        for (MenuPermission p : repository.findAll()) {
            if (Boolean.TRUE.equals(p.getCanView())) {
                allowed.add(key(p.getId().getMenuKey(), p.getId().getRole()));
            }
        }
        List<MenuPermissionDto.Row> rows = new ArrayList<>();
        for (MenuCatalog.Entry e : MenuCatalog.ENTRIES) {
            Map<String, Boolean> roles = new LinkedHashMap<>();
            for (String role : MenuCatalog.ROLES) {
                roles.put(role, allowed.contains(key(e.getMenuKey(), role)));
            }
            rows.add(MenuPermissionDto.Row.builder()
                    .menuKey(e.getMenuKey()).group(e.getGroup())
                    .label(e.getLabel()).adminArea(e.isAdminArea())
                    .roles(roles).build());
        }
        return MenuPermissionDto.Matrix.builder()
                .roleOrder(MenuCatalog.ROLES).rows(rows).build();
    }

    @Transactional
    public void save(MenuPermissionDto.SaveRequest req) {
        if (req.getCells() == null || req.getCells().isEmpty()) return;
        for (MenuPermissionDto.Cell c : req.getCells()) {
            MenuPermission.Id id = new MenuPermission.Id(c.getMenuKey(), c.getRole());
            MenuPermission p = repository.findById(id).orElseGet(() -> {
                MenuPermission n = new MenuPermission();
                n.setId(id);
                return n;
            });
            p.setCanView(c.isCanView());
            repository.save(p);
        }
        log.info("[menu-permission] {}개 셀 저장", req.getCells().size());
    }

    /** 로그인 사용자가 접근 가능한 메뉴 + 데이터 범위. 프론트 메뉴 필터가 이걸 쓴다. */
    public MenuPermissionDto.MyAccess myAccess() {
        String role = SecurityContextUtil.getCurrentRole();
        List<String> keys = role == null ? List.of()
                : repository.findAllowedByRole(role).stream()
                .map(p -> p.getId().getMenuKey())
                .sorted()
                .toList();
        return MenuPermissionDto.MyAccess.builder()
                .role(role)
                .scopes(resourceScopeService.scopesOf(role))
                .menuKeys(keys)
                .build();
    }

    private static String key(String menuKey, String role) {
        return menuKey + "|" + role;
    }
}
