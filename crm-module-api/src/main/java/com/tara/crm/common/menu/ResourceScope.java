package com.tara.crm.common.menu;

import com.tara.crm.common.audit.BaseEntity;
import jakarta.persistence.*;
import lombok.*;

import java.io.Serializable;

/** 역할별 데이터 범위 1행. */
@Entity
@Table(name = "resource_scope")
@Getter
@Setter
@NoArgsConstructor
@AllArgsConstructor
@Builder
public class ResourceScope extends BaseEntity {

    @EmbeddedId
    private Id id;

    /** NONE / SELF / DEPT / ALL */
    @Column(name = "scope", nullable = false, length = 10)
    private String scope;

    @Embeddable
    @Getter
    @Setter
    @NoArgsConstructor
    @AllArgsConstructor
    @EqualsAndHashCode
    public static class Id implements Serializable {
        @Column(name = "resource", length = 30)
        private String resource;

        @Column(name = "role", length = 20)
        private String role;
    }
}
