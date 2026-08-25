import { useEffect, useState } from 'react';

const useResponsiveStrokeText = () => {
  const [config, setConfig] = useState(() => {
    if (typeof window === 'undefined') {
      return {
        fontSizeLine1: 88,
        fontSizeLine2: 96,
        letterSpacingLine1: -2,
        letterSpacingLine2: -3,
        strokeWidth: 1.6,
        stagger: 0.05,
        drawDuration: 1.4,
      };
    }
    const w = window.innerWidth;
    if (w <= 480) {
      return {
        fontSizeLine1: 40,
        fontSizeLine2: 44,
        letterSpacingLine1: -1,
        letterSpacingLine2: -1,
        strokeWidth: 1.4,
        stagger: 0.045,
        drawDuration: 1.2,
      };
    }
    if (w <= 768) {
      return {
        fontSizeLine1: 52,
        fontSizeLine2: 58,
        letterSpacingLine1: -1.5,
        letterSpacingLine2: -2,
        strokeWidth: 1.5,
        stagger: 0.048,
        drawDuration: 1.3,
      };
    }
    if (w <= 1024) {
      return {
        fontSizeLine1: 68,
        fontSizeLine2: 76,
        letterSpacingLine1: -2,
        letterSpacingLine2: -2.5,
        strokeWidth: 1.55,
        stagger: 0.05,
        drawDuration: 1.4,
      };
    }
    return {
      fontSizeLine1: 88,
      fontSizeLine2: 96,
      letterSpacingLine1: -2,
      letterSpacingLine2: -3,
      strokeWidth: 1.6,
      stagger: 0.05,
      drawDuration: 1.5,
    };
  });

  useEffect(() => {
    if (typeof window === 'undefined') return undefined;

    let frameId;
    const handleResize = () => {
      cancelAnimationFrame(frameId);
      frameId = requestAnimationFrame(() => {
        const w = window.innerWidth;
        let next;
        if (w <= 480) {
          next = {
            fontSizeLine1: 40,
            fontSizeLine2: 44,
            letterSpacingLine1: -1,
            letterSpacingLine2: -1,
            strokeWidth: 1.4,
            stagger: 0.045,
            drawDuration: 1.2,
          };
        } else if (w <= 768) {
          next = {
            fontSizeLine1: 52,
            fontSizeLine2: 58,
            letterSpacingLine1: -1.5,
            letterSpacingLine2: -2,
            strokeWidth: 1.5,
            stagger: 0.048,
            drawDuration: 1.3,
          };
        } else if (w <= 1024) {
          next = {
            fontSizeLine1: 68,
            fontSizeLine2: 76,
            letterSpacingLine1: -2,
            letterSpacingLine2: -2.5,
            strokeWidth: 1.55,
            stagger: 0.05,
            drawDuration: 1.4,
          };
        } else {
          next = {
            fontSizeLine1: 88,
            fontSizeLine2: 96,
            letterSpacingLine1: -2,
            letterSpacingLine2: -3,
            strokeWidth: 1.6,
            stagger: 0.05,
            drawDuration: 1.5,
          };
        }
        setConfig(prev => {
          const keys = Object.keys(next);
          for (const k of keys) {
            if (prev[k] !== next[k]) return next;
          }
          return prev;
        });
      });
    };

    window.addEventListener('resize', handleResize);
    return () => {
      window.removeEventListener('resize', handleResize);
      cancelAnimationFrame(frameId);
    };
  }, []);

  return config;
};

export default useResponsiveStrokeText;
