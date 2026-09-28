import React from 'react';
import { useCountUp } from '@/hooks/useCountUp';

interface AnimatedNumberProps {
  /** 최종 값. */
  value: number;
  /** 카운트업 지속 시간(ms). 기본 900. */
  duration?: number;
}

/** 카운트업으로 천단위 구분 숫자를 렌더한다. (tabular-nums 와 함께 쓰면 자릿수 흔들림 없음) */
const AnimatedNumber: React.FC<AnimatedNumberProps> = ({ value, duration }) => {
  const v = useCountUp(value, duration);
  return <>{Math.round(v).toLocaleString()}</>;
};

export default AnimatedNumber;
