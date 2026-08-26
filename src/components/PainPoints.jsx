import ScrollFloat from './ScrollFloat/ScrollFloat';
import useResponsiveScrollFloat from '../hooks/useResponsiveScrollFloat';
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
    tag: '问题 01',
    title: '体测深蹲扣分，却不知道扣在哪',
    desc: '动作错误靠感觉，自己几乎看不出来；真人教练贵且难普及。动知上传视频即骨架叠加，膝内扣、蹲太浅逐帧识别，告诉你先改哪里。',
    demo: '现场上传一段视频 → 骨架叠加 + 错误识别 + 评分',
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
    tag: '问题 02',
    title: '市面 AI 只「聊天」，记不住你的身体',
    desc: '通用陪伴没有身体记忆，建议千人一面。动知生成运动画像，记录错误与趋势，教练回答引用你的历史数据，越用越懂你。',
    demo: '问「我上周表现如何」→ 回答引用画像数据',
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
    tag: '问题 03',
    title: '想懂「为什么伤」，却没人讲得清楚',
    desc: '解剖术语门槛高，网上信息碎片化。动知把科普做成大白话卡片和可交互肌肉图谱，并主动亮明 AI 边界：不诊断，旧伤引导线下咨询。',
    demo: '点开肌肉图谱 / 膝内扣卡片 → 大白话科普 + 合规引导',
    color: '#70a1ff',
  },
];

export default function PainPoints() {
  const scrollCfg = useResponsiveScrollFloat();

  return (
    <section className="pain-points" id="pain-points">
      <div className="section-container">
        <div className="pain-points__header">
          <span className="section-label">Why DongZhi</span>
          <ScrollFloat
            segments={[
              { text: '三个真实问题，三个' },
              { text: '可演示', gradient: true },
              { text: '的回答' }
            ]}
            animationDuration={scrollCfg.animationDuration}
            ease={scrollCfg.ease}
            scrollStart={scrollCfg.scrollStart}
            scrollEnd={scrollCfg.scrollEnd}
            stagger={scrollCfg.stagger}
            containerClassName="section-title-scroll"
          />
          <p className="section-subtitle">
            每个问题，作品里都有对应的能力，现场可演示、可体验。
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
              <div className="pain-points__card-demo">
                <svg width="14" height="14" viewBox="0 0 14 14" fill="none" className="pain-points__card-demo-icon">
                  <path d="M3 7h8M7 3l4 4-4 4" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" />
                </svg>
                <span>{pp.demo}</span>
              </div>
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
