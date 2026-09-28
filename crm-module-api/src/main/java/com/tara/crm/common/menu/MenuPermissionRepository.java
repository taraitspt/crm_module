package com.tara.crm.common.menu;

import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.data.jpa.repository.Query;
import org.springframework.data.repository.query.Param;

import java.util.List;

public interface MenuPermissionRepository extends JpaRepository<MenuPermission, MenuPermission.Id> {

    @Query("SELECT p FROM MenuPermission p WHERE p.id.role = :role AND p.canView = true")
    List<MenuPermission> findAllowedByRole(@Param("role") String role);
}
