import { Link } from 'react-router-dom';
import { Suspense, lazy } from 'react';
import ScrollFloat from './ScrollFloat/ScrollFloat';
import useResponsiveScrollFloat from '../hooks/useResponsiveScrollFloat';
import useFinePointer from '../hooks/useFinePointer';
import './Features.css';

// SoftAurora 含 ogl WebGL，仅电脑端按需加载，移动端不下载
const SoftAurora = lazy(() => import('./SoftAurora/SoftAurora'));

const features = [
  {
    num: '01',
    title: '动作评估',
    desc: '上传视频，骨架叠加 + 错误识别（膝内扣/蹲太浅）+ 综合评分，像专业教练一样逐帧分析你的动作质量。',
    tags: ['骨架叠加', '错误识别', '智能评分'],
    link: '/evaluation',
    icon: (
      <svg width="40" height="40" viewBox="0 0 40 40" fill="none">
        <rect x="4" y="4" width="32" height="32" rx="8" stroke="url(#f1)" strokeWidth="2" />
        <circle cx="20" cy="14" r="3" fill="#00d4ff" />
        <line x1="20" y1="17" x2="20" y2="26" stroke="#00d4ff" strokeWidth="2" strokeLinecap="round" />
        <line x1="20" y1="20" x2="14" y2="24" stroke="#7c3aed" strokeWidth="2" strokeLinecap="round" />
        <line x1="20" y1="20" x2="26" y2="24" stroke="#7c3aed" strokeWidth="2" strokeLinecap="round" />
        <line x1="20" y1="26" x2="15" y2="33" stroke="#00d4ff" strokeWidth="2" strokeLinecap="round" />
        <line x1="20" y1="26" x2="25" y2="33" stroke="#00d4ff" strokeWidth="2" strokeLinecap="round" />
        <defs>
          <linearGradient id="f1" x1="0" y1="0" x2="40" y2="40">
            <stop stopColor="#00d4ff" />
            <stop offset="1" stopColor="#7c3aed" />
          </linearGradient>
        </defs>
      </svg>
    ),
  },
  {
    num: '02',
    title: '运动画像',
    desc: '记录训练习惯、目标、情绪，AI 越用越懂你。构建持续更新的运动数字分身，让每次训练都有据可依。',
    tags: ['习惯追踪', '目标管理', '情绪感知'],
    icon: (
      <svg width="40" height="40" viewBox="0 0 40 40" fill="none">
        <rect x="4" y="4" width="32" height="32" rx="8" stroke="url(#f2)" strokeWidth="2" />
        <path d="M14 28V20M20 28V16M26 28V22" stroke="#00d4ff" strokeWidth="2.5" strokeLinecap="round" />
        <path d="M12 14l4-4 4 4 6-6 4 4" stroke="#7c3aed" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
        <defs>
          <linearGradient id="f2" x1="0" y1="0" x2="40" y2="40">
            <stop stopColor="#00d4ff" />
            <stop offset="1" stopColor="#7c3aed" />
          </linearGradient>
        </defs>
      </svg>
    ),
    link: '/profile',
  },
  {
    num: '03',
    title: 'AI 教练对话',
    desc: '4 类意图智能路由——动作分析、知识问答、学习对话、画像管理，回答引用你的历史数据，越聊越精准。',
    tags: ['意图路由', '数据引用', '个性化回复'],
    icon: (
      <svg width="40" height="40" viewBox="0 0 40 40" fill="none">
        <rect x="4" y="4" width="32" height="32" rx="8" stroke="url(#f3)" strokeWidth="2" />
        <path d="M13 16h14M13 21h10M13 26h12" stroke="#00d4ff" strokeWidth="2" strokeLinecap="round" />
        <circle cx="28" cy="26" r="5" fill="rgba(124,58,237,0.2)" stroke="#7c3aed" strokeWidth="1.5" />
        <path d="M26 26l2 2 3-3" stroke="#7c3aed" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
        <defs>
          <linearGradient id="f3" x1="0" y1="0" x2="40" y2="40">
            <stop stopColor="#00d4ff" />
            <stop offset="1" stopColor="#7c3aed" />
          </linearGradient>
        </defs>
      </svg>
    ),
    link: '/chat',
  },
  {
    num: '04',
    title: '肌肉图谱',
    desc: '交互式人体肌肉图谱，点击肌肉查看功能、肌群位置和训练动作。高清标注，科学直观，让解剖学不再难懂。',
    tags: ['交互图谱', '肌群标注', '训练关联'],
    icon: (
      <svg width="40" height="40" viewBox="0 0 40 40" fill="none">
        <rect x="4" y="4" width="32" height="32" rx="8" stroke="url(#f4)" strokeWidth="2" />
        <path d="M20 10c-2 0-4 2-4 5s2 5 4 5 4-2 4-5-2-5-4-5z" fill="rgba(0,212,255,0.15)" stroke="#00d4ff" strokeWidth="1.5" />
        <path d="M16 20c-3 1-5 3-5 6s2 5 4 5h10c2 0 4-2 4-5s-2-5-5-6" fill="rgba(124,58,237,0.15)" stroke="#7c3aed" strokeWidth="1.5" />
        <line x1="20" y1="20" x2="20" y2="30" stroke="#00d4ff" strokeWidth="1" strokeDasharray="2 2" />
        <defs>
          <linearGradient id="f4" x1="0" y1="0" x2="40" y2="40">
            <stop stopColor="#00d4ff" />
            <stop offset="1" stopColor="#7c3aed" />
          </linearGradient>
        </defs>
      </svg>
    ),
    link: '/muscle-map',
  },
  {
    num: '05',
    title: '科普卡片',
    desc: '专业健身知识卡片化呈现——专有名词解释、训练原理、常见误区，让运动科学人人可懂、随时可查。',
    tags: ['知识卡片', '专有名词', '训练原理'],
    icon: (
      <svg width="40" height="40" viewBox="0 0 40 40" fill="none">
        <rect x="4" y="4" width="32" height="32" rx="8" stroke="url(#f5)" strokeWidth="2" />
        <rect x="12" y="12" width="16" height="16" rx="3" fill="rgba(0,212,255,0.1)" stroke="#00d4ff" strokeWidth="1.5" />
        <path d="M16 18h8M16 22h5" stroke="#00d4ff" strokeWidth="1.5" strokeLinecap="round" />
        <circle cx="28" cy="12" r="4" fill="rgba(124,58,237,0.2)" stroke="#7c3aed" strokeWidth="1.5" />
        <path d="M27 12h2M28 11v2" stroke="#7c3aed" strokeWidth="1.5" strokeLinecap="round" />
        <defs>
          <linearGradient id="f5" x1="0" y1="0" x2="40" y2="40">
            <stop stopColor="#00d4ff" />
            <stop offset="1" stopColor="#7c3aed" />
          </linearGradient>
        </defs>
      </svg>
    ),
  },
];

export default function Features() {
  const scrollCfg = useResponsiveScrollFloat();
  const isFinePointer = useFinePointer();
  return (
    <section className="features" id="features">
      {isFinePointer && (
        <div className="features__aurora">
          <Suspense fallback={null}>
            <SoftAurora
              speed={0.5}
              scale={2.0}
              brightness={2.2}
              color1="#00d4ff"
              color2="#7c3aed"
              noiseFrequency={0}
              noiseAmplitude={0}
              bandHeight={0.78}
              bandSpread={1.5}
              octaveDecay={0.35}
              layerOffset={0.3}
              colorSpeed={1.2}
              enableMouseInteraction={true}
              mouseInfluence={0.3}
            />
          </Suspense>
        </div>
      )}
      <div className="features__aurora-overlay" />
      <div className="section-container features__container">
        <div className="features__header">
          <span className="section-label">Core Features</span>
          <ScrollFloat
            segments={[
              { text: '五大核心' },
              { text: '功能模块', gradient: true }
            ]}
            animationDuration={scrollCfg.animationDuration}
            ease={scrollCfg.ease}
            scrollStart={scrollCfg.scrollStart}
            scrollEnd={scrollCfg.scrollEnd}
            stagger={scrollCfg.stagger}
            containerClassName="section-title-scroll"
          />
          <p className="section-subtitle">
            从动作评估到知识科普，构建完整的 AI 运动教练闭环
          </p>
        </div>

        <div className="features__grid">
          {features.map((f, i) => (
            f.link ? (
              <Link
                key={i}
                to={f.link}
                className={`features__card features__card--link glow-border ${i === 0 ? 'features__card--featured' : ''}`}
              >
                <div className="features__card-num">{f.num}</div>
                <div className="features__card-icon">{f.icon}</div>
                <h3 className="features__card-title">{f.title}</h3>
                <p className="features__card-desc">{f.desc}</p>
                <div className="features__card-tags">
                  {f.tags.map((t) => (
                    <span key={t} className="features__card-tag">
                      {t}
                    </span>
                  ))}
                </div>
                <div className="features__card-arrow">
                  <svg width="20" height="20" viewBox="0 0 20 20" fill="none">
                    <path d="M5 10h10M11 6l4 4-4 4" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
                  </svg>
                </div>
              </Link>
            ) : (
              <div
                key={i}
                className={`features__card glow-border ${i === 0 ? 'features__card--featured' : ''}`}
              >
                <div className="features__card-num">{f.num}</div>
                <div className="features__card-icon">{f.icon}</div>
                <h3 className="features__card-title">{f.title}</h3>
                <p className="features__card-desc">{f.desc}</p>
                <div className="features__card-tags">
                  {f.tags.map((t) => (
                    <span key={t} className="features__card-tag">
                      {t}
                    </span>
                  ))}
                </div>
              </div>
            )
          ))}
        </div>
      </div>
    </section>
  );
}
