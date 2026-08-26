import { useEffect, useMemo, useRef } from 'react';
import { gsap } from 'gsap';
import { ScrollTrigger } from 'gsap/ScrollTrigger';

import './ScrollFloat.css';

gsap.registerPlugin(ScrollTrigger);

const ScrollFloat = ({
  children,
  segments = null,
  scrollContainerRef,
  containerClassName = '',
  textClassName = '',
  animationDuration = 1.4,
  ease = 'back.inOut(3)',
  scrollStart = 'center bottom+=50%',
  scrollEnd = 'bottom bottom-=40%',
  stagger = 0.03
}) => {
  const containerRef = useRef(null);

  const splitText = useMemo(() => {
    if (segments && segments.length > 0) {
      const result = [];
      segments.forEach((seg, segIdx) => {
        const text = seg.text || '';
        for (let i = 0; i < text.length; i++) {
          const char = text[i];
          const isGradient = seg.gradient === true;
          result.push(
            <span
              key={`seg-${segIdx}-char-${i}`}
              className={`char${isGradient ? ' char--gradient' : ''}`}
            >
              {char === ' ' ? '\u00A0' : char}
            </span>
          );
        }
      });
      return result;
    }

    const text = typeof children === 'string' ? children : '';
    return text.split('').map((char, index) => (
      <span className="char" key={index}>
        {char === ' ' ? '\u00A0' : char}
      </span>
    ));
  }, [children, segments]);

  useEffect(() => {
    const el = containerRef.current;
    if (!el) return;

    const scroller = scrollContainerRef && scrollContainerRef.current ? scrollContainerRef.current : window;

    const charElements = el.querySelectorAll('.char');

    const prefersReducedMotion = window.matchMedia?.('(prefers-reduced-motion: reduce)').matches;
    if (prefersReducedMotion) {
      gsap.set(charElements, { opacity: 1, yPercent: 0, scaleY: 1, scaleX: 1 });
      return () => gsap.killTweensOf(charElements);
    }

    const tl = gsap.fromTo(
      charElements,
      {
        willChange: 'opacity, transform',
        opacity: 0,
        yPercent: 220,
        scaleY: 3.4,
        scaleX: 0.4,
        transformOrigin: '50% 100%'
      },
      {
        duration: animationDuration,
        ease: ease,
        opacity: 1,
        yPercent: 0,
        scaleY: 1,
        scaleX: 1,
        stagger: stagger,
        scrollTrigger: {
          trigger: el,
          scroller,
          start: scrollStart,
          end: scrollEnd,
          scrub: true
        }
      }
    );

    return () => {
      tl?.scrollTrigger?.kill();
      gsap.killTweensOf(charElements);
    };
  }, [scrollContainerRef, animationDuration, ease, scrollStart, scrollEnd, stagger]);

  return (
    <h2 ref={containerRef} className={`scroll-float ${containerClassName}`}>
      <span className={`scroll-float-text ${textClassName}`}>{splitText}</span>
    </h2>
  );
};

export default ScrollFloat;
