import './TechHighlights.css';

const highlights = [
  {
    title: '千问大模型 + MediaPipe',
    desc: '基于阿里千问大语言模型驱动对话与推理，结合 MediaPipe Pose 33 关键点姿态估计，实现"看"与"说"的统一。',
    tech: ['Qwen-Plus', 'MediaPipe Pose', 'Apache-2.0'],
  },
  {
    title: '可量化的评估体系',
    desc: '分类准确率、画像准确度、个性化对比——每一维度都有可量化的指标支撑，拒绝"感觉好用"的模糊评价。',
    tech: ['分类准确率', '画像准确度', '个性化对比'],
  },
  {
    title: '合规与隐私设计',
    desc: '身份披露、伤病边界、数据可撤回——从产品设计之初就将合规与隐私纳入核心考量。',
    tech: ['身份披露', '伤病边界', '数据可撤回'],
  },
  {
    title: '可迁移知识库资产',
    desc: '新增动作只需一份 JSON 配置——Evaluation Schema 驱动的可扩展架构，让知识库资产可迁移、可复用。',
    tech: ['JSON Schema', '配置驱动', '热更新'],
  },
];

const techIcons = [
  <svg width="24" height="24" viewBox="0 0 24 24" fill="none" key="0">
    <path d="M12 3L3 7.5v9L12 21l9-4.5v-9L12 3z" stroke="#00d4ff" strokeWidth="1.5" />
    <path d="M12 12v9M3 7.5l9 4.5 9-4.5" stroke="#7c3aed" strokeWidth="1.5" />
    <circle cx="12" cy="12" r="2.5" fill="#00d4ff" />
  </svg>,
  <svg width="24" height="24" viewBox="0 0 24 24" fill="none" key="1">
    <rect x="3" y="3" width="18" height="18" rx="4" stroke="#00d4ff" strokeWidth="1.5" />
    <path d="M7 12l3.5 3.5L17 9" stroke="#7c3aed" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
  </svg>,
  <svg width="24" height="24" viewBox="0 0 24 24" fill="none" key="2">
    <path d="M12 3a9 9 0 100 18 9 9 0 000-18z" stroke="#00d4ff" strokeWidth="1.5" />
    <path d="M12 8v4l2.5 2.5" stroke="#7c3aed" strokeWidth="2" strokeLinecap="round" />
  </svg>,
  <svg width="24" height="24" viewBox="0 0 24 24" fill="none" key="3">
    <path d="M3 7h18M3 12h18M3 17h12" stroke="#00d4ff" strokeWidth="1.5" strokeLinecap="round" />
    <circle cx="19" cy="17" r="3" fill="rgba(124,58,237,0.15)" stroke="#7c3aed" strokeWidth="1.5" />
  </svg>,
];

export default function TechHighlights() {
  return (
    <section className="tech" id="tech">
      <div className="section-container">
        <div className="tech__header">
          <h2 className="section-title">
            技术<span className="gradient-text">亮点</span>
          </h2>
          <p className="section-subtitle">
            每一项技术选择都经过深思熟虑，兼顾性能、合规与可扩展性
          </p>
        </div>

        <div className="tech__list">
          {highlights.map((h, i) => (
            <div key={i} className="tech__row">
              <div className="tech__row-icon">{techIcons[i]}</div>
              <div className="tech__row-body">
                <h3 className="tech__row-title">{h.title}</h3>
                <p className="tech__row-desc">{h.desc}</p>
                <div className="tech__row-tags">
                  {h.tech.map((t) => (
                    <span key={t} className="tech__row-tag">{t}</span>
                  ))}
                </div>
              </div>
              <div className="tech__row-line" />
            </div>
          ))}
        </div>
      </div>
    </section>
  );
}
