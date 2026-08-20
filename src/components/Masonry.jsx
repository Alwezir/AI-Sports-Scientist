import { useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react';
import { gsap } from 'gsap';
import './Masonry.css';

const useMedia = (queries, values, defaultValue) => {
  const get = () => {
    if (typeof window === 'undefined') return defaultValue;
    return values[queries.findIndex(q => matchMedia(q).matches)] ?? defaultValue;
  };

  const [value, setValue] = useState(get);

  useEffect(() => {
    const handler = () => setValue(get);
    queries.forEach(q => matchMedia(q).addEventListener('change', handler));
    return () => queries.forEach(q => matchMedia(q).removeEventListener('change', handler));
  }, [queries]);

  return value;
};

const useMeasure = () => {
  const ref = useRef(null);
  const [size, setSize] = useState({ width: 0, height: 0 });

  useLayoutEffect(() => {
    if (!ref.current) return;
    const ro = new ResizeObserver(([entry]) => {
      const { width, height } = entry.contentRect;
      setSize({ width, height });
    });
    ro.observe(ref.current);
    return () => ro.disconnect();
  }, []);

  return [ref, size];
};

const Masonry = ({
  children,
  ease = 'power3.out',
  duration = 0.6,
  stagger = 0.08,
  animateFrom = 'bottom',
  scaleOnHover = true,
  hoverScale = 0.97,
  blurToFocus = true,
}) => {
  const columns = useMedia(
    ['(min-width:1200px)', '(min-width:900px)', '(min-width:600px)'],
    [3, 2, 1],
    1
  );

  const [containerRef, { width }] = useMeasure();
  const [itemsReady, setItemsReady] = useState(false);
  const itemRefs = useRef([]);

  useEffect(() => {
    const timer = setTimeout(() => setItemsReady(true), 50);
    return () => clearTimeout(timer);
  }, []);

  const grid = useMemo(() => {
    if (!width || !itemRefs.current.length) return [];

    const colHeights = new Array(columns).fill(0);
    const columnWidth = width / columns;
    const gap = 12;

    return itemRefs.current.map((el, index) => {
      const col = colHeights.indexOf(Math.min(...colHeights));
      const x = columnWidth * col + gap / 2;
      const y = colHeights[col] + gap / 2;
      const h = el.offsetHeight + gap;

      colHeights[col] += h;

      return { index, x, y, w: columnWidth - gap, h: el.offsetHeight };
    });
  }, [columns, width, itemsReady]);

  const hasMounted = useRef(false);

  useLayoutEffect(() => {
    if (!itemsReady || grid.length === 0) return;

    grid.forEach((item, index) => {
      const el = itemRefs.current[item.index];
      if (!el) return;

      const animationProps = {
        x: item.x,
        y: item.y,
        width: item.w,
        height: item.h,
      };

      if (!hasMounted.current) {
        let direction = animateFrom;

        if (animateFrom === 'random') {
          const directions = ['top', 'bottom', 'left', 'right'];
          direction = directions[Math.floor(Math.random() * directions.length)];
        }

        let initialX = item.x;
        let initialY = item.y;

        switch (direction) {
          case 'top':
            initialY = -200;
            break;
          case 'bottom':
            initialY = window.innerHeight + 200;
            break;
          case 'left':
            initialX = -200;
            break;
          case 'right':
            initialX = window.innerWidth + 200;
            break;
          case 'center':
            initialX = width / 2 - item.w / 2;
            initialY = 300;
            break;
          default:
            initialY = item.y + 100;
        }

        const initialState = {
          opacity: 0,
          x: initialX,
          y: initialY,
          width: item.w,
          height: item.h,
          ...(blurToFocus && { filter: 'blur(8px)' }),
        };

        gsap.fromTo(el, initialState, {
          opacity: 1,
          ...animationProps,
          ...(blurToFocus && { filter: 'blur(0px)' }),
          duration: 0.8,
          ease: 'power3.out',
          delay: index * stagger,
        });
      } else {
        gsap.to(el, {
          ...animationProps,
          duration: duration,
          ease: ease,
          overwrite: 'auto',
        });
      }
    });

    hasMounted.current = true;
  }, [grid, itemsReady, stagger, animateFrom, blurToFocus, duration, ease, width]);

  const handleMouseEnter = (e) => {
    const el = e.currentTarget;
    if (scaleOnHover) {
      gsap.to(el, {
        scale: hoverScale,
        duration: 0.3,
        ease: 'power2.out',
      });
    }
  };

  const handleMouseLeave = (e) => {
    const el = e.currentTarget;
    if (scaleOnHover) {
      gsap.to(el, {
        scale: 1,
        duration: 0.3,
        ease: 'power2.out',
      });
    }
  };

  return (
    <div ref={containerRef} className="masonry-list">
      {children.map((child, index) => (
        <div
          key={index}
          ref={(el) => (itemRefs.current[index] = el)}
          className="masonry-item"
          onMouseEnter={handleMouseEnter}
          onMouseLeave={handleMouseLeave}
        >
          {child}
        </div>
      ))}
    </div>
  );
};

export default Masonry;
