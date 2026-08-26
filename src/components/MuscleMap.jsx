import { useState } from 'react';
import SpecularButton from './SpecularButton/SpecularButton';
import ScrollFloat from './ScrollFloat/ScrollFloat';
import useFinePointer from '../hooks/useFinePointer';
import useResponsiveScrollFloat from '../hooks/useResponsiveScrollFloat';
import './MuscleMap.css';

const BASE = import.meta.env.BASE_URL.replace(/\/$/, '');
const MUSCLE_MAP_URL = `${BASE}/muscle-map`; // 绝对（带子路径）地址，GitHub Pages 不会跳到站点根级 404

const views = [
  { id: 'front', label: '前视图', imageSrc: `${BASE}/muscle-atlas-front.jpg` },
  { id: 'back', label: '后视图', imageSrc: `${BASE}/muscle-atlas-back.jpg` },
];

const muscleGroups = [
  {
    id: 'head_neck',
    name: '头颈部肌群',
    color: '#c0392b',
    muscles: ['胸锁乳突肌', '斜方肌上束', '颈深屈肌（深层肌肉，体表不可见）'],
    description: '负责头部旋转、侧屈与颈部稳定。',
  },
  {
    id: 'shoulder_back',
    name: '肩颈部肌群',
    color: '#4a7ab8',
    muscles: ['胸锁乳突肌', '斜角肌', '三角肌'],
    description: '负责头部稳定、颈部运动与肩部多方向活动。',
  },
  {
    id: 'chest',
    name: '胸部肌群',
    color: '#d4834a',
    muscles: ['胸大肌（锁骨部/胸肋部/腹部）', '前锯肌'],
    description: '负责肩关节内收、内旋与推举发力。',
  },
  {
    id: 'arm',
    name: '手臂肌群',
    color: '#8e6aad',
    muscles: ['肱二头肌', '肱肌', '肱三头肌（长头/外侧头）'],
    description: '负责肘关节屈伸与前臂运动。',
  },
  {
    id: 'core',
    name: '核心肌群',
    color: '#5a9a4a',
    muscles: ['腹直肌', '腹外斜肌', '腹内斜肌', '腹横肌', '竖脊肌'],
    description: '维持躯干稳定、力量传导与身体平衡。',
  },
  {
    id: 'hip_glute',
    name: '臀部肌群',
    color: '#c04060',
    muscles: ['臀大肌', '臀中肌', '臀小肌'],
    description: '负责髋关节伸展、外展与骨盆稳定。',
  },
  {
    id: 'thigh',
    name: '大腿肌群',
    color: '#c04060',
    muscles: ['股四头肌（股直肌/股外侧肌/股内侧肌）', '股二头肌', '缝匠肌', '髂腰肌'],
    description: '负责膝关节伸展、髋关节屈伸与下肢推进。',
  },
  {
    id: 'calf',
    name: '小腿肌群',
    color: '#c0a020',
    muscles: ['腓肠肌（内侧头/外侧头）', '比目鱼肌', '胫骨前肌'],
    description: '负责踝关节跖屈、背屈与小腿推进。',
  },
];

export default function MuscleMap() {
  const [activeGroup, setActiveGroup] = useState(null);
  const [currentView, setCurrentView] = useState('front');
  const isFinePointer = useFinePointer();
  const scrollCfg = useResponsiveScrollFloat();

  const activeData = activeGroup
    ? muscleGroups.find((g) => g.id === activeGroup)
    : null;
  const currentViewData = views.find((v) => v.id === currentView);

  return (
    <section className="muscle-map" id="muscle-map">
      <div className="section-container">
        <div className="muscle-map__header">
          <span className="section-label">Muscle Atlas</span>
          <ScrollFloat
            segments={[
              { text: '交互式' },
              { text: '肌肉图谱', gradient: true }
            ]}
            animationDuration={scrollCfg.animationDuration}
            ease={scrollCfg.ease}
            scrollStart={scrollCfg.scrollStart}
            scrollEnd={scrollCfg.scrollEnd}
            stagger={scrollCfg.stagger}
            containerClassName="section-title-scroll"
          />
          <p className="section-subtitle">
            点击肌群查看功能与训练建议，让解剖学直观易懂
          </p>
        </div>

        <div className="muscle-map__layout">
          <div className="muscle-map__viewer">
            <div className="muscle-map__view-tabs">
              {views.map((view) => (
                <button
                  key={view.id}
                  className={`muscle-map__view-tab ${currentView === view.id ? 'muscle-map__view-tab--active' : ''}`}
                  onClick={() => setCurrentView(view.id)}
                >
                  {view.label}
                </button>
              ))}
            </div>
            <div className="muscle-map__image-wrapper">
              <img
                src={currentViewData.imageSrc}
                alt={`人体主要肌肉群图谱 - ${currentViewData.label}`}
                className="muscle-map__atlas-image"
              />
            </div>
            {isFinePointer ? (
              <SpecularButton
                size="md"
                radius={12}
                lineColor="#00d4ff"
                baseColor="#3a3a52"
                tintOpacity={0.08}
                textColor="#f5f5f5"
                intensity={1.5}
                shineSize={16}
                shineFade={30}
                thickness={1.5}
                proximity={250}
                onClick={() => window.open(MUSCLE_MAP_URL, '_self')}
                className="muscle-map__full-link"
              >
                查看完整肌肉图谱 →
              </SpecularButton>
            ) : (
              <a href={MUSCLE_MAP_URL} className="muscle-map__full-link">
                查看完整肌肉图谱 →
              </a>
            )}
          </div>

          <div className="muscle-map__info">
            {activeData ? (
              <div className="muscle-map__detail animate-in">
                <div className="muscle-map__detail-header">
                  <span
                    className="muscle-map__detail-dot"
                    style={{ background: activeData.color }}
                  />
                  <h3 className="muscle-map__detail-name">{activeData.name}</h3>
                </div>
                <p className="muscle-map__detail-description">
                  {activeData.description}
                </p>
                <div className="muscle-map__detail-section">
                  <span className="muscle-map__detail-label">主要肌肉</span>
                  <div className="muscle-map__detail-muscles">
                    {activeData.muscles.map((m) => (
                      <span key={m} className="muscle-map__muscle-tag">
                        {m}
                      </span>
                    ))}
                  </div>
                </div>
              </div>
            ) : (
              <div className="muscle-map__placeholder">
                <svg width="48" height="48" viewBox="0 0 48 48" fill="none">
                  <circle cx="24" cy="24" r="20" stroke="var(--border-color)" strokeWidth="2" strokeDasharray="4 4" />
                  <path d="M24 16v8M24 28v2" stroke="var(--text-muted)" strokeWidth="2" strokeLinecap="round" />
                </svg>
                <p>点击右侧肌群图例<br />查看详细训练信息</p>
              </div>
            )}

            <div className="muscle-map__legend">
              <h4 className="muscle-map__legend-title">肌群图例</h4>
              <div className="muscle-map__legend-items">
                {muscleGroups.map((group) => (
                  <button
                    key={group.id}
                    className={`muscle-map__legend-item ${activeGroup === group.id ? 'muscle-map__legend-item--active' : ''}`}
                    onClick={() => setActiveGroup(activeGroup === group.id ? null : group.id)}
                    style={{ '--group-color': group.color }}
                  >
                    <span
                      className="muscle-map__legend-dot"
                      style={{ background: group.color }}
                    />
                    {group.name}
                  </button>
                ))}
              </div>
            </div>
          </div>
        </div>
      </div>
    </section>
  );
}
