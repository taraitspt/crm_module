import { useEffect, useRef, useState } from 'react';

/**
 * 숫자를 0(또는 직전 값)에서 target 까지 easeOutCubic 으로 카운트업한다.
 * 데이터 UI 다운 진입 모션. prefers-reduced-motion 이면 즉시 최종값.
 */
export function useCountUp(target: number, duration = 900): number {
  const [val, setVal] = useState(0);
  const fromRef = useRef(0);

  useEffect(() => {
    const reduced = window.matchMedia?.('(prefers-reduced-motion: reduce)').matches;
    if (reduced || !Number.isFinite(target)) {
      setVal(target);
      fromRef.current = target;
      return;
    }
    const from = fromRef.current;
    let raf = 0;
    let start: number | null = null;
    const tick = (ts: number) => {
      if (start === null) start = ts;
      const p = Math.min((ts - start) / duration, 1);
      const eased = 1 - Math.pow(1 - p, 3); // easeOutCubic
      setVal(from + (target - from) * eased);
      if (p < 1) raf = requestAnimationFrame(tick);
      else fromRef.current = target;
    };
    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
  }, [target, duration]);

  return val;
}
