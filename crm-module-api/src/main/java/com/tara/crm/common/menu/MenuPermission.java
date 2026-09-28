package com.tara.crm.common.menu;

import com.tara.crm.common.audit.BaseEntity;
import jakarta.persistence.*;
import lombok.*;

import java.io.Serializable;

/** 역할별 메뉴 접근 권한 1행. */
@Entity
@Table(name = "menu_permission")
@Getter
@Setter
@NoArgsConstructor
@AllArgsConstructor
@Builder
public class MenuPermission extends BaseEntity {

    @EmbeddedId
    private Id id;

    @Column(name = "can_view", nullable = false)
    private Boolean canView;

    @Embeddable
    @Getter
    @Setter
    @NoArgsConstructor
    @AllArgsConstructor
    @EqualsAndHashCode
    public static class Id implements Serializable {
        @Column(name = "menu_key", length = 80)
        private String menuKey;

        @Column(name = "role", length = 20)
        private String role;
    }
}
