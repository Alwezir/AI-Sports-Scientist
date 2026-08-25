import MagicRings from './MagicRings';
import SpecularFrame from './SpecularButton/SpecularFrame';
import './TechHighlights.css';

const highlights = [
  {
    icon: (
      <svg width="28" height="28" viewBox="0 0 28 28" fill="none">
        <path d="M14 4L4 9v10l10 5 10-5V9L14 4z" stroke="#00d4ff" strokeWidth="1.5" />
        <path d="M14 14v10M4 9l10 5 10-5" stroke="#7c3aed" strokeWidth="1.5" />
        <circle cx="14" cy="14" r="3" fill="#00d4ff" />
      </svg>
    ),
    title: '千问大模型 + MediaPipe',
    desc: '基于阿里千问大语言模型驱动对话与推理，结合 MediaPipe Pose 33 关键点姿态估计，实现"看"与"说"的统一。',
    tech: ['Qwen-Plus', 'MediaPipe Pose', 'Apache-2.0'],
  },
  {
    icon: (
      <svg width="28" height="28" viewBox="0 0 28 28" fill="none">
        <rect x="3" y="3" width="22" height="22" rx="4" stroke="#00d4ff" strokeWidth="1.5" />
        <path d="M8 14l4 4 8-8" stroke="#7c3aed" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
      </svg>
    ),
    title: '可量化的评估体系',
    desc: '分类准确率、画像准确度、个性化对比——每一维度都有可量化的指标支撑，拒绝"感觉好用"的模糊评价。',
    tech: ['分类准确率', '画像准确度', '个性化对比'],
  },
  {
    icon: (
      <svg width="28" height="28" viewBox="0 0 28 28" fill="none">
        <path d="M14 4a10 10 0 100 20 10 10 0 000-20z" stroke="#00d4ff" strokeWidth="1.5" />
        <path d="M14 10v4l3 3" stroke="#7c3aed" strokeWidth="2" strokeLinecap="round" />
        <path d="M9 4l10 20M19 4L9 24" stroke="#00d4ff" strokeWidth="0.5" opacity="0.3" />
      </svg>
    ),
    title: '合规与隐私设计',
    desc: '身份披露、伤病边界、数据可撤回——从产品设计之初就将合规与隐私纳入核心考量，符合 2026 拟人化新规。',
    tech: ['身份披露', '伤病边界', '数据可撤回'],
  },
  {
    icon: (
      <svg width="28" height="28" viewBox="0 0 28 28" fill="none">
        <path d="M4 8h20M4 14h20M4 20h14" stroke="#00d4ff" strokeWidth="1.5" strokeLinecap="round" />
        <circle cx="22" cy="20" r="3" fill="rgba(124,58,237,0.2)" stroke="#7c3aed" strokeWidth="1.5" />
        <path d="M21 20h2M22 19v2" stroke="#7c3aed" strokeWidth="1.5" strokeLinecap="round" />
      </svg>
    ),
    title: '可迁移知识库资产',
    desc: '新增动作只需一份 JSON 配置——Evaluation Schema 驱动的可扩展架构，让知识库资产可迁移、可复用、可迭代。',
    tech: ['JSON Schema', '配置驱动', '热更新'],
  },
];

export default function TechHighlights() {
  return (
    <section className="tech" id="tech">
      <MagicRings
        color="#00d4ff"
        colorTwo="#7c3aed"
        ringCount={6}
        speed={0.8}
        attenuation={10}
        lineThickness={2}
        baseRadius={0.35}
        radiusStep={0.1}
        scaleRate={0.1}
        opacity={0.6}
        blur={0}
        noiseAmount={0.1}
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
      <div className="section-container">
        <div className="tech__header">
          <span className="section-label">Tech Stack</span>
          <h2 className="section-title">
            技术<span className="gradient-text">亮点</span>
          </h2>
          <p className="section-subtitle">
            每一项技术选择都经过深思熟虑，兼顾性能、合规与可扩展性
          </p>
        </div>

        <div className="tech__grid">
          {highlights.map((h, i) => (
            <SpecularFrame
              key={i}
              className="tech__card"
              radius={16}
              lineColor="#7c3aed"
              baseColor="#2a2a3e"
              tintOpacity={0.04}
            >
              <div className="tech__card-icon">{h.icon}</div>
              <h3 className="tech__card-title">{h.title}</h3>
              <p className="tech__card-desc">{h.desc}</p>
              <div className="tech__card-techs">
                {h.tech.map((t) => (
                  <span key={t} className="tech__card-tech">
                    {t}
                  </span>
                ))}
              </div>
            </SpecularFrame>
          ))}
        </div>
      </div>
    </section>
  );
}
