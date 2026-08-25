import { useEffect, useRef } from 'react';
import './SkeletonCanvas.css';

const SKELETON = {
  nose: [0.5, 0.25],
  leftEye: [0.475, 0.23],
  rightEye: [0.525, 0.23],
  leftShoulder: [0.44, 0.32],
  rightShoulder: [0.56, 0.32],
  leftElbow: [0.39, 0.39],
  rightElbow: [0.61, 0.39],
  leftWrist: [0.35, 0.45],
  rightWrist: [0.65, 0.45],
  leftHip: [0.45, 0.50],
  rightHip: [0.55, 0.50],
  leftKnee: [0.44, 0.58],
  rightKnee: [0.56, 0.58],
  leftAnkle: [0.44, 0.66],
  rightAnkle: [0.56, 0.66],
};

const CONNECTIONS = [
  ['nose', 'leftShoulder'], ['nose', 'rightShoulder'],
  ['leftShoulder', 'rightShoulder'],
  ['leftShoulder', 'leftElbow'], ['rightShoulder', 'rightElbow'],
  ['leftElbow', 'leftWrist'], ['rightElbow', 'rightWrist'],
  ['leftShoulder', 'leftHip'], ['rightShoulder', 'rightHip'],
  ['leftHip', 'rightHip'],
  ['leftHip', 'leftKnee'], ['rightHip', 'rightKnee'],
  ['leftKnee', 'leftAnkle'], ['rightKnee', 'rightAnkle'],
];

export default function SkeletonCanvas({ className = '' }) {
  const canvasRef = useRef(null);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    let animId;
    let time = 0;

    const resize = () => {
      const rect = canvas.getBoundingClientRect();
      const dpr = window.devicePixelRatio || 1;
      canvas.width = Math.max(1, Math.floor(rect.width * dpr));
      canvas.height = Math.max(1, Math.floor(rect.height * dpr));
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    };

    resize();
    const ro = new ResizeObserver(resize);
    ro.observe(canvas);

    const getPos = (key) => {
      const [nx, ny] = SKELETON[key];
      const w = canvas.clientWidth;
      const h = canvas.clientHeight;
      const offsetX = Math.sin(time * 0.8 + nx * 10) * 4;
      const offsetY = Math.cos(time * 0.6 + ny * 8) * 3;
      return [nx * w + offsetX, ny * h + offsetY];
    };

    const draw = () => {
      const w = canvas.clientWidth;
      const h = canvas.clientHeight;
      ctx.clearRect(0, 0, w, h);
      time += 0.015;

      CONNECTIONS.forEach(([a, b]) => {
        const [x1, y1] = getPos(a);
        const [x2, y2] = getPos(b);
        const gradient = ctx.createLinearGradient(x1, y1, x2, y2);
        gradient.addColorStop(0, 'rgba(0, 212, 255, 0.5)');
        gradient.addColorStop(1, 'rgba(124, 58, 237, 0.5)');
        ctx.strokeStyle = gradient;
        ctx.lineWidth = 2;
        ctx.beginPath();
        ctx.moveTo(x1, y1);
        ctx.lineTo(x2, y2);
        ctx.stroke();
      });

      Object.entries(SKELETON).forEach(([key, [nx, ny]]) => {
        const [x, y] = getPos(key);
        const pulse = Math.sin(time * 2 + nx * 5) * 0.3 + 0.7;

        const glow = ctx.createRadialGradient(x, y, 0, x, y, 16);
        glow.addColorStop(0, `rgba(0, 212, 255, ${0.3 * pulse})`);
        glow.addColorStop(1, 'rgba(0, 212, 255, 0)');
        ctx.fillStyle = glow;
        ctx.beginPath();
        ctx.arc(x, y, 16, 0, Math.PI * 2);
        ctx.fill();

        ctx.fillStyle = '#00d4ff';
        ctx.beginPath();
        ctx.arc(x, y, 3.5, 0, Math.PI * 2);
        ctx.fill();
      });

      animId = requestAnimationFrame(draw);
    };

    draw();

    return () => {
      cancelAnimationFrame(animId);
      ro.disconnect();
    };
  }, []);

  return <canvas ref={canvasRef} className={`skeleton-canvas ${className}`} />;
}
