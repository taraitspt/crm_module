package com.tara.crm.auth.repository;

import com.tara.crm.auth.entity.User;
import com.tara.crm.common.id.UserId;
import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.data.jpa.repository.Query;
import org.springframework.data.repository.query.Param;

import java.util.List;
import java.util.Optional;

public interface UserRepository extends JpaRepository<User, UserId> {

    @Query("SELECT u FROM User u WHERE u.id.companyCd = :companyCd AND (u.name LIKE %:keyword% OR u.employeeNo LIKE %:keyword%) AND u.status = 'ACTIVE' ORDER BY u.name")
    List<User> searchByKeyword(@Param("companyCd") Integer companyCd, @Param("keyword") String keyword);

    @Query("SELECT u FROM User u WHERE u.id.companyCd = :companyCd AND u.employeeNo = :employeeNo")
    Optional<User> findByCompanyCdAndEmployeeNo(@Param("companyCd") Integer companyCd,
                                                  @Param("employeeNo") String employeeNo);

    @Query("SELECT u FROM User u WHERE u.id.companyCd = :companyCd AND u.id.id = :userId")
    Optional<User> findByCompanyCdAndUserId(@Param("companyCd") Integer companyCd,
                                             @Param("userId") String userId);

    @Query("SELECT u FROM User u WHERE u.id.companyCd = :companyCd ORDER BY u.name")
    List<User> findAllByCompanyCd(@Param("companyCd") Integer companyCd);
}
