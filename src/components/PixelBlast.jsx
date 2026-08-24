import { useEffect, useRef } from 'react';
import './PixelBlast.css';

// Lightweight canvas implementation of the PixelBlast visual: animated Bayer-like dots
// with pointer ripples, keeping the background independent from the chat controls.
export default function PixelBlast({ color = '#b497cf', pixelSize = 5, speed = 0.45, className = '' }) {
  const canvasRef = useRef(null);

  useEffect(() => {
    const canvas = canvasRef.current;
    const context = canvas?.getContext('2d');
    if (!canvas || !context) return undefined;
    const host = canvas.parentElement;
    const ripples = [];
    let frame = 0;
    let width = 1;
    let height = 1;
    let dpr = 1;
    let start = performance.now();

    const resize = () => {
      const rect = host.getBoundingClientRect();
      dpr = Math.min(window.devicePixelRatio || 1, 2);
      width = Math.max(1, rect.width);
      height = Math.max(1, rect.height);
      canvas.width = Math.round(width * dpr);
      canvas.height = Math.round(height * dpr);
      canvas.style.width = `${width}px`;
      canvas.style.height = `${height}px`;
    };
    const addRipple = (event) => {
      const rect = canvas.getBoundingClientRect();
      ripples.push({ x: event.clientX - rect.left, y: event.clientY - rect.top, time: performance.now() });
      if (ripples.length > 8) ripples.shift();
    };
    const draw = (now) => {
      const time = (now - start) * 0.001 * speed;
      context.setTransform(dpr, 0, 0, dpr, 0, 0);
      context.clearRect(0, 0, width, height);
      const spacing = Math.max(9, pixelSize * 2.7);
      const columns = Math.ceil(width / spacing) + 1;
      const rows = Math.ceil(height / spacing) + 1;
      const rgb = color.match(/[\da-f]{2}/gi)?.map((value) => parseInt(value, 16)) || [180, 151, 207];
      for (let row = 0; row < rows; row += 1) {
        for (let column = 0; column < columns; column += 1) {
          const x = column * spacing;
          const y = row * spacing;
          const n = Math.sin(column * 0.47 + row * 1.13 + time * 0.8) * 0.5 + Math.sin(column * 0.13 - row * 0.31 + time) * 0.5;
          const centerX = width * 0.5;
          const centerY = height * 0.5;
          const distance = Math.hypot((x - centerX) / width, (y - centerY) / height);
          let alpha = Math.max(0, (n - 0.03) * 0.34) * (1 - Math.min(distance * 1.1, 0.82));
          for (const ripple of ripples) {
            const age = (now - ripple.time) * 0.001;
            const ring = Math.abs(Math.hypot(x - ripple.x, y - ripple.y) - age * 260);
            alpha += Math.max(0, 1 - ring / 24) * Math.max(0, 1 - age / 2.8) * 0.5;
          }
          if (alpha <= 0.025) continue;
          context.fillStyle = `rgba(${rgb[0]}, ${rgb[1]}, ${rgb[2]}, ${Math.min(alpha, 0.72)})`;
          const size = pixelSize * (0.55 + Math.max(0, n) * 0.35);
          context.fillRect(x, y, size, size);
        }
      }
      frame = requestAnimationFrame(draw);
    };
    resize();
    const observer = new ResizeObserver(resize);
    observer.observe(host);
    host.addEventListener('pointerdown', addRipple, { passive: true });
    frame = requestAnimationFrame(draw);
    return () => {
      observer.disconnect();
      host.removeEventListener('pointerdown', addRipple);
      cancelAnimationFrame(frame);
    };
  }, [color, pixelSize, speed]);

  return <canvas ref={canvasRef} className={`pixel-blast ${className}`} aria-hidden="true" />;
}
