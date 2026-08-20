import './PainPoints.css';

const painPoints = [
  {
    icon: (
      <svg width="32" height="32" viewBox="0 0 32 32" fill="none">
        <circle cx="16" cy="16" r="14" stroke="url(#pp1)" strokeWidth="2" />
        <path d="M11 11l10 10M21 11L11 21" stroke="#ff4757" strokeWidth="2" strokeLinecap="round" />
        <defs>
          <linearGradient id="pp1" x1="0" y1="0" x2="32" y2="32">
            <stop stopColor="#ff4757" />
            <stop offset="1" stopColor="#ff6b81" />
          </linearGradient>
        </defs>
      </svg>
    ),
    title: '动作无人纠正',
    desc: '大众健身"瞎练"，动作错误导致效果差、损伤高发。真人教练贵且难普及，普通人缺乏科学的动作反馈机制。',
    tag: '痛点 01',
    color: '#ff4757',
  },
  {
    icon: (
      <svg width="32" height="32" viewBox="0 0 32 32" fill="none">
        <circle cx="16" cy="16" r="14" stroke="url(#pp2)" strokeWidth="2" />
        <path d="M10 16h12M16 10v12" stroke="#ffa502" strokeWidth="2" strokeLinecap="round" />
        <defs>
          <linearGradient id="pp2" x1="0" y1="0" x2="32" y2="32">
            <stop stopColor="#ffa502" />
            <stop offset="1" stopColor="#ffbe76" />
          </linearGradient>
        </defs>
      </svg>
    ),
    title: 'AI 不懂身体',
    desc: '市面 AI 陪伴只"听说"不"看动"，不懂用户身体状态。疲劳、习惯、情绪——它一无所知，无法提供个性化建议。',
    tag: '痛点 02',
    color: '#ffa502',
  },
  {
    icon: (
      <svg width="32" height="32" viewBox="0 0 32 32" fill="none">
        <circle cx="16" cy="16" r="14" stroke="url(#pp3)" strokeWidth="2" />
        <path d="M12 20c0-2.2 1.8-4 4-4s4 1.8 4 4M16 10v4" stroke="#70a1ff" strokeWidth="2" strokeLinecap="round" />
        <defs>
          <linearGradient id="pp3" x1="0" y1="0" x2="32" y2="32">
            <stop stopColor="#70a1ff" />
            <stop offset="1" stopColor="#5352ed" />
          </linearGradient>
        </defs>
      </svg>
    ),
    title: '科学知识门槛高',
    desc: '运动科学知识专业门槛高，解剖、生物力学知识普通人想懂却没人讲得清楚，信息碎片化严重。',
    tag: '痛点 03',
    color: '#70a1ff',
  },
];

export default function PainPoints() {
  return (
    <section className="pain-points" id="pain-points">
      <div className="section-container">
        <div className="pain-points__header">
          <span className="section-label">Why DongZhi</span>
          <h2 className="section-title">
            为什么做<span className="gradient-text">这件事</span>
          </h2>
          <p className="section-subtitle">
            健身行业存在三大核心痛点，动知用 AI 技术逐一击破
          </p>
        </div>

        <div className="pain-points__grid">
          {painPoints.map((pp, i) => (
            <div
              key={i}
              className="pain-points__card glow-border"
              style={{ animationDelay: `${i * 0.15}s` }}
            >
              <div className="pain-points__card-tag" style={{ color: pp.color }}>
                {pp.tag}
              </div>
              <div className="pain-points__card-icon">{pp.icon}</div>
              <h3 className="pain-points__card-title">{pp.title}</h3>
              <p className="pain-points__card-desc">{pp.desc}</p>
              <div
                className="pain-points__card-line"
                style={{ background: `linear-gradient(90deg, ${pp.color}, transparent)` }}
              />
            </div>
          ))}
        </div>
      </div>
    </section>
  );
}
