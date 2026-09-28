package com.tara.crm.common.menu;

import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.data.jpa.repository.Query;
import org.springframework.data.repository.query.Param;

import java.util.List;

public interface ResourceScopeRepository extends JpaRepository<ResourceScope, ResourceScope.Id> {

    @Query("SELECT s FROM ResourceScope s WHERE s.id.role = :role")
    List<ResourceScope> findByRole(@Param("role") String role);
}
