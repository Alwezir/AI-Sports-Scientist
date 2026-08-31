import { useEffect, useRef, useCallback } from 'react';
import MagicRings from './MagicRings';
import SpecularButton from './SpecularButton/SpecularButton';
import StrokeText from './StrokeText/StrokeText';
import useFinePointer from '../hooks/useFinePointer';
import useResponsiveStrokeText from '../hooks/useResponsiveStrokeText';
import './Hero.css';

export default function Hero() {
  const canvasRef = useRef(null);
  const isFinePointer = useFinePointer();
  const strokeCfg = useResponsiveStrokeText();

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
      canvas.width = window.innerWidth;
      canvas.height = window.innerHeight;
    };
    resize();
    window.addEventListener('resize', resize);

    const skeleton = {
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
      time += 0.015;

      const w = canvas.width;
      const h = canvas.height;

      ctx.strokeStyle = 'rgba(0, 212, 255, 0.03)';
      ctx.lineWidth = 1;
      const gridSize = 60;
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
        const offsetX = Math.sin(time * 0.8 + nx * 10) * 4;
        const offsetY = Math.cos(time * 0.6 + ny * 8) * 3;
        return [nx * w + offsetX, ny * h + offsetY];
      };

      connections.forEach(([a, b]) => {
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

      Object.entries(skeleton).forEach(([key, [nx, ny]]) => {
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

      for (let i = 0; i < 30; i++) {
        const px = (Math.sin(time * 0.3 + i * 1.7) * 0.5 + 0.5) * w;
        const py = (Math.cos(time * 0.2 + i * 2.3) * 0.5 + 0.5) * h;
        const size = Math.sin(time + i) * 1 + 1.5;
        const alpha = Math.sin(time * 0.5 + i * 0.8) * 0.15 + 0.15;
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
      {/* SVG 全局渐变定义，供标题渐变文字引用 */}
      <svg width="0" height="0" style={{ position: 'absolute' }} aria-hidden="true">
        <defs>
          <linearGradient id="dongzhi-title-gradient" x1="0%" y1="0%" x2="100%" y2="100%">
            <stop offset="0%" stopColor="#00d4ff" />
            <stop offset="100%" stopColor="#7c3aed" />
          </linearGradient>
        </defs>
      </svg>
      {isFinePointer && (
        <MagicRings
          color="#00d4ff"
          colorTwo="#7c3aed"
          ringCount={8}
          speed={0.6}
          attenuation={8}
          lineThickness={2.5}
          baseRadius={0.25}
          radiusStep={0.08}
          scaleRate={0.08}
          opacity={0.5}
          blur={0}
          noiseAmount={0.08}
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
      )}
      <canvas ref={canvasRef} className="hero__canvas" />
      <div className="hero__overlay" />
      <div className="hero__content">
        <div className="hero__badge">
          <span className="hero__badge-dot" />
          挑战杯 · 阿里云命题赛 · 数字分身
        </div>
        <h1 className="hero__title hero__title--stroke">
          <div className="hero__title-line">
            {isFinePointer ? (
              <StrokeText
                text="动知 · "
                strokeColor="#00d4ff"
                fillColor="#f0f0f8"
                strokeWidth={strokeCfg.strokeWidth}
                drawDuration={strokeCfg.drawDuration}
                fillDelay={0.18}
                stagger={strokeCfg.stagger}
                ease="power2.out"
                trigger="mount"
                fillMode="wipe"
                fontSize={strokeCfg.fontSizeLine1}
                fontWeight={900}
                letterSpacing={strokeCfg.letterSpacingLine1}
                className="hero__stroke-text hero__stroke-text--inline"
              />
            ) : (
              <span className="hero__stroke-text hero__stroke-text--inline">动知 · </span>
            )}
            {isFinePointer ? (
              <StrokeText
                text="懂你身体的"
                strokeColor="#7c3aed"
                fillColor="url(#dongzhi-title-gradient)"
                strokeWidth={strokeCfg.strokeWidth}
                drawDuration={strokeCfg.drawDuration}
                fillDelay={0.18}
                stagger={strokeCfg.stagger}
                ease="power2.out"
                trigger="mount"
                fillMode="wipe"
                fontSize={strokeCfg.fontSizeLine1}
                fontWeight={900}
                letterSpacing={strokeCfg.letterSpacingLine1}
                className="hero__stroke-text hero__stroke-text--inline hero__stroke-text--gradient"
              />
            ) : (
              <span className="hero__stroke-text hero__stroke-text--inline hero__stroke-text--gradient"><span className="gradient-text">懂你身体的</span></span>
            )}
          </div>
          <div className="hero__title-line">
            {isFinePointer ? (
              <StrokeText
                text="AI 运动教练"
                strokeColor="#00d4ff"
                fillColor="#f0f0f8"
                strokeWidth={strokeCfg.strokeWidth}
                drawDuration={strokeCfg.drawDuration}
                fillDelay={0.18}
                stagger={strokeCfg.stagger}
                ease="power2.out"
                trigger="mount"
                fillMode="wipe"
                fontSize={strokeCfg.fontSizeLine2}
                fontWeight={900}
                letterSpacing={strokeCfg.letterSpacingLine2}
                className="hero__stroke-text"
              />
            ) : (
              <span className="hero__stroke-text">AI 运动教练</span>
            )}
          </div>
        </h1>
        <p className="hero__subtitle">
          上传视频，AI 像教练一样纠正你的动作，<br />
          并越来越了解你
        </p>
        <div className="hero__actions">
          {isFinePointer ? (
            <SpecularButton
              size="lg"
              radius={14}
              lineColor="#00d4ff"
              baseColor="#4a4a68"
              tintOpacity={0.12}
              textColor="#f5f5f5"
              intensity={1.8}
              shineSize={18}
              shineFade={28}
              thickness={2}
              proximity={350}
              onClick={(e) => scrollToSection(e, 'features')}
              className="hero__btn hero__btn--primary"
            >
              开始体验
              <svg width="16" height="16" viewBox="0 0 16 16" fill="none" className="hero__btn-arrow">
                <path d="M3 8h10M9 4l4 4-4 4" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
              </svg>
            </SpecularButton>
          ) : (
            <a href="#features" onClick={(e) => scrollToSection(e, 'features')} className="hero__btn hero__btn--primary">
              开始体验
              <svg width="16" height="16" viewBox="0 0 16 16" fill="none" className="hero__btn-arrow">
                <path d="M3 8h10M9 4l4 4-4 4" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
              </svg>
            </a>
          )}
          {isFinePointer ? (
            <SpecularButton
              size="lg"
              radius={14}
              lineColor="#a78bfa"
              baseColor="#4a4a68"
              tintOpacity={0.1}
              textColor="#f5f5f5"
              intensity={1.6}
              shineSize={16}
              shineFade={30}
              thickness={1.8}
              proximity={350}
              onClick={(e) => scrollToSection(e, 'pain-points')}
              className="hero__btn hero__btn--secondary"
            >
              了解更多
            </SpecularButton>
          ) : (
            <a href="#pain-points" onClick={(e) => scrollToSection(e, 'pain-points')} className="hero__btn hero__btn--secondary">
              了解更多
            </a>
          )}
        </div>
        <div className="hero__stats">
          <div className="hero__stat">
            <span className="hero__stat-value">33</span>
            <span className="hero__stat-label">姿态关键点</span>
          </div>
          <div className="hero__stat-divider" />
          <div className="hero__stat">
            <span className="hero__stat-value">5</span>
            <span className="hero__stat-label">核心功能模块</span>
          </div>
          <div className="hero__stat-divider" />
          <div className="hero__stat">
            <span className="hero__stat-value">7</span>
            <span className="hero__stat-label">人团队协作</span>
          </div>
        </div>
      </div>
      <div className="hero__scroll">
        <div className="hero__scroll-indicator" />
      </div>
    </section>
  );
}
