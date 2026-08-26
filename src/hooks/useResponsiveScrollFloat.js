import { useState, useEffect } from 'react';

const useResponsiveScrollFloat = () => {
  const [config, setConfig] = useState(() => {
    if (typeof window === 'undefined') {
      return {
        animationDuration: 1.5,
        ease: 'back.inOut(3)',
        stagger: 0.04,
        scrollStart: 'center bottom+=50%',
        scrollEnd: 'bottom bottom-=40%'
      };
    }
    const w = window.innerWidth;
    if (w <= 480) {
      return {
        animationDuration: 1.1,
        ease: 'back.inOut(3)',
        stagger: 0.03,
        scrollStart: 'center bottom+=30%',
        scrollEnd: 'bottom bottom-=30%'
      };
    }
    if (w <= 768) {
      return {
        animationDuration: 1.3,
        ease: 'back.inOut(3)',
        stagger: 0.035,
        scrollStart: 'center bottom+=40%',
        scrollEnd: 'bottom bottom-=35%'
      };
    }
    return {
      animationDuration: 1.5,
      ease: 'back.inOut(3)',
      stagger: 0.04,
      scrollStart: 'center bottom+=50%',
      scrollEnd: 'bottom bottom-=40%'
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
            animationDuration: 1.1,
            ease: 'back.inOut(3)',
            stagger: 0.03,
            scrollStart: 'center bottom+=30%',
            scrollEnd: 'bottom bottom-=30%'
          };
        } else if (w <= 768) {
          next = {
            animationDuration: 1.3,
            ease: 'back.inOut(3)',
            stagger: 0.035,
            scrollStart: 'center bottom+=40%',
            scrollEnd: 'bottom bottom-=35%'
          };
        } else {
          next = {
            animationDuration: 1.5,
            ease: 'back.inOut(3)',
            stagger: 0.04,
            scrollStart: 'center bottom+=50%',
            scrollEnd: 'bottom bottom-=40%'
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

export default useResponsiveScrollFloat;
