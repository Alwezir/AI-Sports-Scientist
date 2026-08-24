import { useEffect, useRef, useCallback } from 'react';
import MagicRings from './MagicRings';
import './Hero.css';

export default function Hero() {
  const canvasRef = useRef(null);

  const scrollToSection = useCallback((e, sectionId) => {
    e.preventDefault();
    const el = document.getElementById(sectionId);
    if (el) {
      el.scrollIntoView({ behavior: 'smooth' });
    }
  }, []);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    let animId;
    let time = 0;

    const resize = () => {
      canvas.width = canvas.offsetWidth;
      canvas.height = canvas.offsetHeight;
    };
    resize();
    window.addEventListener('resize', resize);

    const skeleton = {
      nose: [0.5, 0.18],
      leftEye: [0.48, 0.16],
      rightEye: [0.52, 0.16],
      leftShoulder: [0.43, 0.26],
      rightShoulder: [0.57, 0.26],
      leftElbow: [0.37, 0.34],
      rightElbow: [0.63, 0.34],
      leftWrist: [0.33, 0.42],
      rightWrist: [0.67, 0.42],
      leftHip: [0.45, 0.46],
      rightHip: [0.55, 0.46],
      leftKnee: [0.44, 0.56],
      rightKnee: [0.56, 0.56],
      leftAnkle: [0.44, 0.66],
      rightAnkle: [0.56, 0.66],
    };

    const connections = [
      ['nose', 'leftShoulder'], ['nose', 'rightShoulder'],
      ['leftShoulder', 'rightShoulder'],
      ['leftShoulder', 'leftElbow'], ['rightShoulder', 'rightElbow'],
      ['leftElbow', 'leftWrist'], ['rightElbow', 'rightWrist'],
      ['leftShoulder', 'leftHip'], ['rightShoulder', 'rightHip'],
      ['leftHip', 'rightHip'],
      ['leftHip', 'leftKnee'], ['rightHip', 'rightKnee'],
      ['leftKnee', 'leftAnkle'], ['rightKnee', 'rightAnkle'],
    ];

    const draw = () => {
      ctx.clearRect(0, 0, canvas.width, canvas.height);
      time += 0.012;

      const w = canvas.width;
      const h = canvas.height;

      ctx.strokeStyle = 'rgba(0, 212, 255, 0.025)';
      ctx.lineWidth = 1;
      const gridSize = 50;
      for (let x = 0; x < w; x += gridSize) {
        ctx.beginPath();
        ctx.moveTo(x, 0);
        ctx.lineTo(x, h);
        ctx.stroke();
      }
      for (let y = 0; y < h; y += gridSize) {
        ctx.beginPath();
        ctx.moveTo(0, y);
        ctx.lineTo(w, y);
        ctx.stroke();
      }

      const getPos = (key) => {
        const [nx, ny] = skeleton[key];
        const offsetX = Math.sin(time * 0.8 + nx * 10) * 3;
        const offsetY = Math.cos(time * 0.6 + ny * 8) * 2.5;
        return [nx * w + offsetX, ny * h + offsetY];
      };

      connections.forEach(([a, b]) => {
        const [x1, y1] = getPos(a);
        const [x2, y2] = getPos(b);
        const gradient = ctx.createLinearGradient(x1, y1, x2, y2);
        gradient.addColorStop(0, 'rgba(0, 212, 255, 0.45)');
        gradient.addColorStop(1, 'rgba(124, 58, 237, 0.45)');
        ctx.strokeStyle = gradient;
        ctx.lineWidth = 2;
        ctx.beginPath();
        ctx.moveTo(x1, y1);
        ctx.lineTo(x2, y2);
        ctx.stroke();
      });

      Object.entries(skeleton).forEach(([key, [nx, ny]]) => {
        const [x, y] = getPos(key);
        const pulse = Math.sin(time * 2 + nx * 5) * 0.3 + 0.7;

        const glow = ctx.createRadialGradient(x, y, 0, x, y, 14);
        glow.addColorStop(0, `rgba(0, 212, 255, ${0.35 * pulse})`);
        glow.addColorStop(1, 'rgba(0, 212, 255, 0)');
        ctx.fillStyle = glow;
        ctx.beginPath();
        ctx.arc(x, y, 14, 0, Math.PI * 2);
        ctx.fill();

        ctx.fillStyle = '#00d4ff';
        ctx.beginPath();
        ctx.arc(x, y, 3, 0, Math.PI * 2);
        ctx.fill();
      });

      for (let i = 0; i < 20; i++) {
        const px = (Math.sin(time * 0.3 + i * 1.7) * 0.5 + 0.5) * w;
        const py = (Math.cos(time * 0.2 + i * 2.3) * 0.5 + 0.5) * h;
        const size = Math.sin(time + i) * 0.8 + 1.2;
        const alpha = Math.sin(time * 0.5 + i * 0.8) * 0.1 + 0.12;
        ctx.fillStyle = `rgba(0, 212, 255, ${alpha})`;
        ctx.beginPath();
        ctx.arc(px, py, size, 0, Math.PI * 2);
        ctx.fill();
      }

      animId = requestAnimationFrame(draw);
    };

    draw();

    return () => {
      cancelAnimationFrame(animId);
      window.removeEventListener('resize', resize);
    };
  }, []);

  return (
    <section className="hero">
      <div className="hero__bg-ring">
        <MagicRings
          color="#00d4ff"
          colorTwo="#7c3aed"
          ringCount={6}
          speed={0.5}
          attenuation={8}
          lineThickness={2}
          baseRadius={0.3}
          radiusStep={0.09}
          scaleRate={0.07}
          opacity={0.35}
          blur={0}
          noiseAmount={0.06}
          rotation={0}
          ringGap={1.5}
          fadeIn={0.7}
          fadeOut={0.5}
          followMouse={false}
          mouseInfluence={0.2}
          hoverScale={1.2}
          parallax={0.05}
          clickBurst={false}
        />
      </div>
      <div className="hero__bg-grid" />

      <div className="hero__inner">
        <div className="hero__text">
          <div className="hero__badge">
            <span className="hero__badge-dot" />
            挑战杯 阿里云命题赛 数字分身
          </div>
          <h1 className="hero__title">
            懂你身体的
            <span className="hero__title-accent"> AI 运动教练</span>
          </h1>
          <p className="hero__subtitle">
            上传视频，AI 像教练一样纠正你的动作，并越来越了解你
          </p>
          <div className="hero__actions">
            <a href="/evaluation" className="hero__btn hero__btn--primary">
              开始体验
              <svg width="16" height="16" viewBox="0 0 16 16" fill="none" className="hero__btn-arrow">
                <path d="M3 8h10M9 4l4 4-4 4" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
              </svg>
            </a>
            <a href="#features" onClick={(e) => scrollToSection(e, 'features')} className="hero__btn hero__btn--ghost">
              了解功能
            </a>
          </div>
        </div>

        <div className="hero__visual">
          <canvas ref={canvasRef} className="hero__canvas" />
          <div className="hero__visual-ring" />
        </div>
      </div>
    </section>
  );
}
