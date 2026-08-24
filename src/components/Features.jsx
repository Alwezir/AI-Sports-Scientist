import { Link } from 'react-router-dom';
import './Features.css';

const features = [
  {
    title: '动作评估',
    desc: '上传视频，骨架叠加 + 错误识别 + 综合评分，像专业教练一样逐帧分析你的动作质量。',
    tags: ['骨架叠加', '错误识别', '智能评分'],
    link: '/evaluation',
    featured: true,
    icon: (
      <svg width="36" height="36" viewBox="0 0 36 36" fill="none">
        <circle cx="18" cy="10" r="3" fill="#00d4ff" />
        <line x1="18" y1="13" x2="18" y2="22" stroke="#00d4ff" strokeWidth="2" strokeLinecap="round" />
        <line x1="18" y1="16" x2="11" y2="20" stroke="#7c3aed" strokeWidth="2" strokeLinecap="round" />
        <line x1="18" y1="16" x2="25" y2="20" stroke="#7c3aed" strokeWidth="2" strokeLinecap="round" />
        <line x1="18" y1="22" x2="13" y2="30" stroke="#00d4ff" strokeWidth="2" strokeLinecap="round" />
        <line x1="18" y1="22" x2="23" y2="30" stroke="#00d4ff" strokeWidth="2" strokeLinecap="round" />
      </svg>
    ),
  },
  {
    title: '运动画像',
    desc: '记录训练习惯、目标、情绪，AI 越用越懂你。构建持续更新的运动数字分身。',
    tags: ['习惯追踪', '目标管理'],
    link: '/profile',
    icon: (
      <svg width="36" height="36" viewBox="0 0 36 36" fill="none">
        <path d="M10 28V20M18 28V14M26 28V22" stroke="#00d4ff" strokeWidth="2.5" strokeLinecap="round" />
        <path d="M8 16l5-5 5 5 7-7 3 3" stroke="#7c3aed" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
      </svg>
    ),
  },
  {
    title: 'AI 教练对话',
    desc: '动作分析、知识问答、学习对话、画像管理，回答引用你的历史数据。',
    tags: ['意图路由', '个性化回复'],
    link: '/chat',
    icon: (
      <svg width="36" height="36" viewBox="0 0 36 36" fill="none">
        <path d="M10 14h16M10 19h12M10 24h14" stroke="#00d4ff" strokeWidth="2" strokeLinecap="round" />
        <circle cx="28" cy="24" r="4" fill="rgba(124,58,237,0.2)" stroke="#7c3aed" strokeWidth="1.5" />
        <path d="M27 24l2 2 3-3" stroke="#7c3aed" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
      </svg>
    ),
  },
  {
    title: '肌肉图谱',
    desc: '交互式人体肌肉图谱，点击肌肉查看功能、肌群位置和训练动作。',
    tags: ['交互图谱', '肌群标注'],
    link: '/muscle-map',
    icon: (
      <svg width="36" height="36" viewBox="0 0 36 36" fill="none">
        <path d="M18 8c-2 0-4 2-4 5s2 5 4 5 4-2 4-5-2-5-4-5z" fill="rgba(0,212,255,0.12)" stroke="#00d4ff" strokeWidth="1.5" />
        <path d="M14 18c-3 1-5 3-5 6s2 5 4 5h10c2 0 4-2 4-5s-2-5-5-6" fill="rgba(124,58,237,0.12)" stroke="#7c3aed" strokeWidth="1.5" />
      </svg>
    ),
  },
  {
    title: '科普卡片',
    desc: '专业健身知识卡片化呈现，专有名词解释、训练原理、常见误区。',
    tags: ['知识卡片', '训练原理'],
    icon: (
      <svg width="36" height="36" viewBox="0 0 36 36" fill="none">
        <rect x="10" y="10" width="16" height="16" rx="3" fill="rgba(0,212,255,0.08)" stroke="#00d4ff" strokeWidth="1.5" />
        <path d="M14 16h8M14 20h5" stroke="#00d4ff" strokeWidth="1.5" strokeLinecap="round" />
        <circle cx="26" cy="10" r="3.5" fill="rgba(124,58,237,0.15)" stroke="#7c3aed" strokeWidth="1.5" />
      </svg>
    ),
  },
];

export default function Features() {
  return (
    <section className="features" id="features">
      <div className="section-container">
        <div className="features__header">
          <h2 className="section-title">
            五大核心<span className="gradient-text">功能模块</span>
          </h2>
          <p className="section-subtitle">
            从动作评估到知识科普，构建完整的 AI 运动教练闭环
          </p>
        </div>

        <div className="bento-grid">
          {features.map((f, i) => {
            const isLink = !!f.link;
            const Tag = isLink ? Link : 'div';
            return (
              <Tag
                key={i}
                to={f.link}
                className={`bento-cell ${f.featured ? 'bento-cell--featured' : ''} ${isLink ? 'bento-cell--link' : ''}`}
              >
                <div className="bento-cell__icon">{f.icon}</div>
                <h3 className="bento-cell__title">{f.title}</h3>
                <p className="bento-cell__desc">{f.desc}</p>
                <div className="bento-cell__tags">
                  {f.tags.map((t) => (
                    <span key={t} className="bento-cell__tag">{t}</span>
                  ))}
                </div>
                {isLink && (
                  <div className="bento-cell__arrow">
                    <svg width="18" height="18" viewBox="0 0 18 18" fill="none">
                      <path d="M4 9h10M10 5l4 4-4 4" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
                    </svg>
                  </div>
                )}
              </Tag>
            );
          })}
        </div>
      </div>
    </section>
  );
}
