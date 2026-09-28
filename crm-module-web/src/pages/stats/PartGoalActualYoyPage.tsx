import React from 'react';
import { Navigate } from 'react-router-dom';

/** 통합 실적 대시보드로 리다이렉트 (20·21·22번 통합) */
const PartGoalActualYoyPage: React.FC = () => <Navigate to="/stats/team-forecast" replace />;

export default PartGoalActualYoyPage;
