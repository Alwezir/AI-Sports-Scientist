import { useState, useEffect } from 'react';
import PageLayout from '../components/PageLayout';
import {
  getOrCreateUserId,
  initUser,
  generateProfileSummary,
  getTrainingRecords,
  getUserChatTraits,
  removeChatTrait,
  addChatTrait,
  getTraitCategories,
  getTrainingOverview,
  getRecurringErrors,
  getRecentPerRepScores,
  getManualProfile,
  saveManualProfile,
  resetManualProfile,
} from '../utils/userProfile';
import {
  addGoal,
  addMoodRecord,
  addTrainRecord,
  getFullProfile,
  getProfileSummary,
  normalizeRemoteProfile,
} from '../utils/profileApi';
import { getInitialProfileApiStatus } from '../utils/profileStatus';
import './ProfilePage.css';

// 手动画像 UI 兜底默认值（真实存取都走 userProfile 门面，已自动从旧 dongzhi_profile 迁移）
const defaultProfile = {
  name: '',
  goal: '',
  level: 'beginner',
  weeklyFrequency: 3,
  preferredSports: [],
  mood: 'neutral',
  records: [],
};

// 懒加载本地稳定 user_id（确保所有手动/AI 数据写到同一个用户文档）
function getPageUserId_() {
  const uid = getOrCreateUserId();
  initUser(uid, '运动用户');
  return uid;
}

const SPORTS_OPTIONS = ['深蹲', '卧推', '硬拉', '跑步', '游泳', '瑜伽', '篮球', '骑行'];
const MOOD_OPTIONS = [
  { value: 'great', label: '精力充沛', emoji: '⚡' },
  { value: 'good', label: '状态不错', emoji: '' },
  { value: 'neutral', label: '一般', emoji: '😐' },
  { value: 'tired', label: '有些疲劳', emoji: '😴' },
  { value: 'sore', label: '肌肉酸痛', emoji: '🤕' },
];
const LEVEL_OPTIONS = [
  { value: 'beginner', label: '入门新手', desc: '刚开始健身' },
  { value: 'intermediate', label: '进阶训练者', desc: '有1-2年经验' },
  { value: 'advanced', label: '高级训练者', desc: '3年以上经验' },
];

/**
 * 纯 SVG 逐动作得分曲线图（满分 maxScore，默认 100）
 *  - X 轴：最近 N 次动作的时间序列
 *  - Y 轴：0~100，绘制 60 / 75 / 90 三条阈值参考线
 *  - 折线 + 渐变填充 + 每点圆点悬停 tooltip 显示（全局第几次动作、分数、日期、动作）
 */
function ScoreCurveChart({ data, maxScore = 100 }) {
  const [hoverIdx, setHoverIdx] = useState(-1);

  const W = 820;
  const H = 260;
  const PAD_L = 44;
  const PAD_R = 18;
  const PAD_T = 18;
  const PAD_B = 34;
  const innerW = W - PAD_L - PAD_R;
  const innerH = H - PAD_T - PAD_B;

  const n = data.length;
  const xFor = (i) => PAD_L + (n <= 1 ? innerW / 2 : (innerW * i) / (n - 1));
  const yFor = (s) => PAD_T + innerH * (1 - Math.max(0, Math.min(maxScore, s)) / maxScore);

  // 折线 points
  const points = data.map((d, i) => `${xFor(i).toFixed(2)},${yFor(d.score).toFixed(2)}`);
  const polyline = points.join(' ');
  // 填充区域路径（闭合到 x 轴底部）
  const areaPath =
    n >= 2
      ? `M ${xFor(0).toFixed(2)},${(PAD_T + innerH).toFixed(2)} ` +
        data.map((d, i) => `L ${xFor(i).toFixed(2)},${yFor(d.score).toFixed(2)}`).join(' ') +
        ` L ${xFor(n - 1).toFixed(2)},${(PAD_T + innerH).toFixed(2)} Z`
      : '';

  // Y 轴参考线：60/75/90 + 0/100
  const refs = [0, 60, 75, 90, 100];
  // X 轴标签：首中尾 或 间隔采样
  const xTickCount = Math.min(5, n);
  const xTicks = [];
  for (let t = 0; t < xTickCount; t += 1) {
    const i = n <= 1 ? 0 : Math.round(((n - 1) * t) / (xTickCount - 1));
    xTicks.push({ i, index: i + 1 });
  }

  return (
    <div className="score-curve-chart">
      <svg
        viewBox={`0 0 ${W} ${H}`}
        className="score-curve-chart__svg"
        preserveAspectRatio="none"
        role="img"
        aria-label="最近30次逐动作得分曲线图"
      >
        <defs>
          <linearGradient id="scoreGradientFill" x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stopColor="#00d4ff" stopOpacity="0.35" />
            <stop offset="100%" stopColor="#00d4ff" stopOpacity="0" />
          </linearGradient>
        </defs>

        {/* 参考线 + Y 刻度 */}
        {refs.map((v) => {
          const y = yFor(v);
          const isThreshold = v === 60 || v === 75 || v === 90;
          return (
            <g key={`ref-${v}`}>
              <line
                x1={PAD_L}
                x2={W - PAD_R}
                y1={y}
                y2={y}
                stroke={isThreshold ? 'rgba(255,165,2,0.25)' : 'rgba(255,255,255,0.08)'}
                strokeDasharray={isThreshold ? '4 4' : '0'}
                strokeWidth={1}
              />
              <text
                x={PAD_L - 8}
                y={y + 4}
                textAnchor="end"
                fontSize="11"
                fill="rgba(255,255,255,0.4)"
              >
                {v}
              </text>
            </g>
          );
        })}

        {/* X 轴基线 */}
        <line
          x1={PAD_L}
          x2={W - PAD_R}
          y1={PAD_T + innerH}
          y2={PAD_T + innerH}
          stroke="rgba(255,255,255,0.18)"
          strokeWidth={1}
        />

        {/* X 轴刻度 */}
        {xTicks.map((t) => {
          const x = xFor(t.i);
          return (
            <g key={`xtick-${t.i}`}>
              <line
                x1={x}
                x2={x}
                y1={PAD_T + innerH}
                y2={PAD_T + innerH + 4}
                stroke="rgba(255,255,255,0.25)"
              />
              <text
                x={x}
                y={PAD_T + innerH + 18}
                textAnchor="middle"
                fontSize="11"
                fill="rgba(255,255,255,0.45)"
              >
                #{data[t.i].globalIndex}
              </text>
            </g>
          );
        })}
        <text
          x={PAD_L - 32}
          y={PAD_T - 2}
          fontSize="11"
          fill="rgba(255,255,255,0.5)"
        >
          得分
        </text>
        <text
          x={W - PAD_R}
          y={H - 10}
          textAnchor="end"
          fontSize="11"
          fill="rgba(255,255,255,0.5)"
        >
          动作序号（全局第 N 次）
        </text>

        {/* 渐变填充区 */}
        {n >= 2 && <path d={areaPath} fill="url(#scoreGradientFill)" />}

        {/* 折线 */}
        {n >= 2 && (
          <polyline
            points={polyline}
            fill="none"
            stroke="#00d4ff"
            strokeWidth="2.2"
            strokeLinecap="round"
            strokeLinejoin="round"
          />
        )}

        {/* 数据点 */}
        {data.map((d, i) => {
          const cx = xFor(i);
          const cy = yFor(d.score);
          const color =
            d.score >= 90 ? '#00d4ff' : d.score >= 75 ? '#3cb44b' : d.score >= 60 ? '#ffa502' : '#ff4757';
          const isHover = i === hoverIdx;
          return (
            <g
              key={`pt-${i}`}
              onMouseEnter={() => setHoverIdx(i)}
              onMouseLeave={() => setHoverIdx((cur) => (cur === i ? -1 : cur))}
              style={{ cursor: 'pointer' }}
            >
              <circle cx={cx} cy={cy} r={isHover ? 5.5 : 3.5} fill="#06060e" stroke={color} strokeWidth={2} />
              {isHover && (
                <g>
                  <rect
                    x={Math.min(W - 170, Math.max(PAD_L, cx - 75))}
                    y={Math.max(4, cy - 64)}
                    width="150"
                    height="56"
                    rx="8"
                    fill="rgba(6,6,14,0.95)"
                    stroke={color}
                    strokeOpacity="0.5"
                  />
                  <text
                    x={Math.min(W - 170, Math.max(PAD_L, cx - 75)) + 10}
                    y={Math.max(4, cy - 64) + 18}
                    fontSize="12"
                    fill={color}
                    fontWeight={600}
                  >
                    第 {d.globalIndex} 次动作：{d.score} 分
                  </text>
                  <text
                    x={Math.min(W - 170, Math.max(PAD_L, cx - 75)) + 10}
                    y={Math.max(4, cy - 64) + 36}
                    fontSize="11"
                    fill="rgba(255,255,255,0.7)"
                  >
                    {d.actionType} · {d.date}
                  </text>
                  <text
                    x={Math.min(W - 170, Math.max(PAD_L, cx - 75)) + 10}
                    y={Math.max(4, cy - 64) + 50}
                    fontSize="10"
                    fill="rgba(255,255,255,0.45)"
                  >
                    {d.score >= 90 ? '标准 · 保持' :
                      d.score >= 75 ? '良好 · 可优化' :
                        d.score >= 60 ? '及格 · 注意动作细节' : '需纠正 · 建议回看要点'}
                  </text>
                </g>
              )}
            </g>
          );
        })}
      </svg>
      <div className="score-curve-chart__legend">
        <span className="score-curve-chart__legend-item">
          <i style={{ background: 'rgba(255,165,2,0.45)' }} /> 阈值参考线：60 / 75 / 90
        </span>
        <span className="score-curve-chart__legend-item">
          <i style={{ background: '#00d4ff' }} /> 逐动作得分（满分 100）
        </span>
        <span className="score-curve-chart__legend-item score-curve-chart__legend-item--muted">
          共 {n} 次 · 平均 {n > 0 ? Math.round(data.reduce((s, d) => s + d.score, 0) / n) : 0} 分
        </span>
      </div>
    </div>
  );
}

export default function ProfilePage() {
  // 初次挂载：从统一存储 userProfile 门面读取（含自动从旧 dongzhi_profile 迁移）
  const [profile, setProfile] = useState(() => {
    try {
      return getManualProfile(getPageUserId_()) || defaultProfile;
    } catch {
      return defaultProfile;
    }
  });

  const [activeTab, setActiveTab] = useState('status');
  const [newRecord, setNewRecord] = useState({ sport: '', duration: '', notes: '' });
  const [aiSummary, setAiSummary] = useState('');
  const [aiRecords, setAiRecords] = useState([]);
  const [trainingOverview, setTrainingOverview] = useState(null);
  const [recurringErrors, setRecurringErrors] = useState([]);
  const [recentScores, setRecentScores] = useState([]);
  const [chatTraits, setChatTraits] = useState({});
  const [addCategory, setAddCategory] = useState('injury');
  const [addValue, setAddValue] = useState('');
  const [profileApiStatus, setProfileApiStatus] = useState(null);
  const traitCats = getTraitCategories();

  // 手动 profile 变更后：统一写入门面层（不再直接写 dongzhi_profile localStorage）
  useEffect(() => {
    try {
      saveManualProfile(getPageUserId_(), profile);
    } catch {
      /* ignore */
    }
  }, [profile]);

  // 首次进入画像页时，用服务端的情绪与阶段目标补齐本机缓存。
  useEffect(() => {
    const userId = getOrCreateUserId();
    getFullProfile(userId)
      .then((payload) => {
        const remote = normalizeRemoteProfile(payload);
        const latestMood = remote.moods.at(-1);
        const activeGoal = remote.goals.find((goal) => goal.status === '进行中') || remote.goals.at(-1);
        setProfile((previous) => ({
          ...previous,
          mood: MOOD_OPTIONS.some((option) => option.value === latestMood?.mood)
            ? latestMood.mood
            : previous.mood,
          goal: activeGoal?.description || previous.goal,
        }));
        setProfileApiStatus(getInitialProfileApiStatus(true));
      })
      .catch(() => {
        setProfileApiStatus(getInitialProfileApiStatus(false));
      });
  }, []);

  // AI 画像：读取算法训练数据生成的画像摘要（对接 generate_profile_summary）
  useEffect(() => {
    if (activeTab !== 'ai-profile') return;
    const userId = getOrCreateUserId();
    let cancelled = false;
    setAiSummary(generateProfileSummary(userId, 'train'));
    setAiRecords(getTrainingRecords(userId));
    setTrainingOverview(getTrainingOverview(userId));
    setRecurringErrors(getRecurringErrors(userId, 1)); // 至少出现 1 次即展示，便于查看
    setRecentScores(getRecentPerRepScores(userId, 30));
    Promise.all([getFullProfile(userId), getProfileSummary(userId)])
      .then(([payload, summary]) => {
        if (cancelled) return;
        const remote = normalizeRemoteProfile(payload);
        setAiSummary(summary.summary || generateProfileSummary(userId, 'train'));
        setAiRecords(remote.trainingRecords);
        setProfileApiStatus('已连接画像服务，训练记录与摘要为最新数据');
      })
      .catch(() => {
        if (!cancelled) setProfileApiStatus('画像服务暂时未连接，当前显示本机缓存数据');
      });
    return () => { cancelled = true; };
  }, [activeTab]);

  // 个人设置：读取对话记住的用户特点
  const refreshChatTraits = () => {
    const userId = getOrCreateUserId();
    setChatTraits(getUserChatTraits(userId));
  };

  useEffect(() => {
    if (activeTab !== 'settings') return;
    refreshChatTraits();
  }, [activeTab]);

  const handleAddTrait = () => {
    const value = addValue.trim();
    if (!value) return;
    const userId = getOrCreateUserId();
    const label = traitCats.find((c) => c.key === addCategory)?.label || addCategory;
    addChatTrait(userId, addCategory, value, label);
    setAddValue('');
    refreshChatTraits();
  };

  const handleRemoveTrait = (category, value) => {
    const userId = getOrCreateUserId();
    removeChatTrait(userId, category, value);
    refreshChatTraits();
  };

  const updateProfile = (key, value) => {
    setProfile((prev) => ({ ...prev, [key]: value }));
  };

  const toggleSport = (sport) => {
    setProfile((prev) => ({
      ...prev,
      preferredSports: prev.preferredSports.includes(sport)
        ? prev.preferredSports.filter((s) => s !== sport)
        : [...prev.preferredSports, sport],
    }));
  };

  const addRecord = () => {
    if (!newRecord.sport || !newRecord.duration) return;
    const record = {
      ...newRecord,
      id: Date.now(),
      date: new Date().toLocaleDateString('zh-CN'),
      mood: profile.mood,
    };
    setProfile((prev) => ({
      ...prev,
      records: [record, ...prev.records],
    }));
    addTrainRecord(getOrCreateUserId(), {
      action_type: record.sport,
      date: new Date().toISOString().slice(0, 10),
      sets: 1,
      reps: 0,
      score: null,
      errors: [],
      duration_sec: Number(record.duration) * 60,
      notes: record.notes || '',
      mood: record.mood,
    }).then(() => setProfileApiStatus('训练记录已同步到运动画像'))
      .catch(() => setProfileApiStatus('记录已保存在本机，画像服务暂时未连接'));
    setNewRecord({ sport: '', duration: '', notes: '' });
  };

  const deleteRecord = (id) => {
    setProfile((prev) => ({
      ...prev,
      records: prev.records.filter((r) => r.id !== id),
    }));
  };

  const tabs = [
    { id: 'status', label: '状态记录' },
    { id: 'ai-profile', label: 'AI 画像' },
    { id: 'goals', label: '目标管理' },
    { id: 'settings', label: '个人设置' },
  ];

  // Stats
  const totalRecords = profile.records.length;
  const totalDuration = profile.records.reduce((sum, r) => sum + (parseInt(r.duration) || 0), 0);
  const sportCount = {};
  profile.records.forEach((r) => {
    sportCount[r.sport] = (sportCount[r.sport] || 0) + 1;
  });
  const topSport = Object.entries(sportCount).sort((a, b) => b[1] - a[1])[0];

  return (
    <PageLayout
      title="运动画像"
      subtitle="记录你的训练习惯、目标和状态，AI 越用越懂你"
    >
      <div className="profile-page">
        {profileApiStatus && (
          <div className="profile-page__api-status" role="status" aria-live="polite">
            {profileApiStatus}
          </div>
        )}
        {/* Tabs */}
        <div className="profile-page__tabs">
          {tabs.map((tab) => (
            <button
              key={tab.id}
              className={`profile-page__tab ${activeTab === tab.id ? 'profile-page__tab--active' : ''}`}
              onClick={() => setActiveTab(tab.id)}
            >
              {tab.label}
            </button>
          ))}
        </div>

        {/* Overview Tab */}
        {activeTab === 'status' && (
          <div className="profile-page__tab-content">
            <div className="profile-page__stats-grid">
              <div className="profile-page__stat-card">
                <span className="profile-page__stat-value">{totalRecords}</span>
                <span className="profile-page__stat-label">训练次数</span>
              </div>
              <div className="profile-page__stat-card">
                <span className="profile-page__stat-value">{totalDuration}</span>
                <span className="profile-page__stat-label">总时长 (分钟)</span>
              </div>
              <div className="profile-page__stat-card">
                <span className="profile-page__stat-value">{profile.preferredSports.length}</span>
                <span className="profile-page__stat-label">偏好运动</span>
              </div>
              <div className="profile-page__stat-card">
                <span className="profile-page__stat-value">{topSport ? topSport[0] : '-'}</span>
                <span className="profile-page__stat-label">最常运动</span>
              </div>
            </div>

            {/* Mood selector */}
            <div className="profile-page__section">
              <h3 className="profile-page__section-title">今日状态</h3>
              <div className="profile-page__mood-grid">
                {MOOD_OPTIONS.map((m) => (
                  <button
                    key={m.value}
                    className={`profile-page__mood-btn ${profile.mood === m.value ? 'profile-page__mood-btn--active' : ''}`}
                    onClick={() => {
                      updateProfile('mood', m.value);
                      addMoodRecord(getOrCreateUserId(), {
                        content: m.label,
                        mood: m.value,
                        timestamp: new Date().toISOString(),
                      }).then(() => setProfileApiStatus('今日状态已同步到运动画像'))
                        .catch(() => setProfileApiStatus('状态已保存在本机，画像服务暂时未连接'));
                    }}
                  >
                    <span className="profile-page__mood-emoji">{m.emoji}</span>
                    <span className="profile-page__mood-label">{m.label}</span>
                  </button>
                ))}
              </div>
            </div>

            {/* Quick add record */}
            <div className="profile-page__section">
              <h3 className="profile-page__section-title">快速记录训练</h3>
              <div className="profile-page__quick-add">
                <select
                  className="profile-page__input"
                  value={newRecord.sport}
                  onChange={(e) => setNewRecord((prev) => ({ ...prev, sport: e.target.value }))}
                >
                  <option value="">选择运动</option>
                  {SPORTS_OPTIONS.map((s) => (
                    <option key={s} value={s}>{s}</option>
                  ))}
                </select>
                <input
                  className="profile-page__input"
                  type="number"
                  placeholder="时长 (分钟)"
                  value={newRecord.duration}
                  onChange={(e) => setNewRecord((prev) => ({ ...prev, duration: e.target.value }))}
                />
                <input
                  className="profile-page__input"
                  placeholder="备注 (可选)"
                  value={newRecord.notes}
                  onChange={(e) => setNewRecord((prev) => ({ ...prev, notes: e.target.value }))}
                />
                <button className="profile-page__btn" onClick={addRecord}>
                  添加记录
                </button>
              </div>
            </div>

            <div className="profile-page__section">
              <div className="profile-page__section-heading-row">
                <h3 className="profile-page__section-title">训练记录</h3>
                <span className="profile-page__section-meta">共 {profile.records.length} 条</span>
              </div>
              {profile.records.length === 0 ? (
                <div className="profile-page__empty profile-page__empty--compact">
                  <p>暂无训练记录，完成一次训练后就能在这里看到状态变化。</p>
                </div>
              ) : (
                <div className="profile-page__records-list">
                  {profile.records.map((r) => (
                    <div key={r.id} className="profile-page__record-card">
                      <div className="profile-page__record-header">
                        <span className="profile-page__record-sport">{r.sport}</span>
                        <span className="profile-page__record-date">{r.date}</span>
                      </div>
                      <div className="profile-page__record-body">
                        <span>{r.duration} 分钟</span>
                        {r.notes && <span className="profile-page__record-notes">{r.notes}</span>}
                        <span className="profile-page__record-mood">
                          {MOOD_OPTIONS.find((m) => m.value === r.mood)?.emoji}
                        </span>
                      </div>
                      <button className="profile-page__record-delete" onClick={() => deleteRecord(r.id)}>
                        删除
                      </button>
                    </div>
                  ))}
                </div>
              )}
            </div>
          </div>
        )}

        {/* Records Tab */}
        {false && activeTab === 'records' && (
          <div className="profile-page__tab-content">
            <div className="profile-page__section">
              <h3 className="profile-page__section-title">添加新记录</h3>
              <div className="profile-page__quick-add">
                <select
                  className="profile-page__input"
                  value={newRecord.sport}
                  onChange={(e) => setNewRecord((prev) => ({ ...prev, sport: e.target.value }))}
                >
                  <option value="">选择运动</option>
                  {SPORTS_OPTIONS.map((s) => (
                    <option key={s} value={s}>{s}</option>
                  ))}
                </select>
                <input
                  className="profile-page__input"
                  type="number"
                  placeholder="时长 (分钟)"
                  value={newRecord.duration}
                  onChange={(e) => setNewRecord((prev) => ({ ...prev, duration: e.target.value }))}
                />
                <input
                  className="profile-page__input"
                  placeholder="备注 (可选)"
                  value={newRecord.notes}
                  onChange={(e) => setNewRecord((prev) => ({ ...prev, notes: e.target.value }))}
                />
                <button className="profile-page__btn" onClick={addRecord}>
                  添加记录
                </button>
              </div>
            </div>

            <div className="profile-page__section">
              <h3 className="profile-page__section-title">全部记录 ({profile.records.length})</h3>
              {profile.records.length === 0 ? (
                <div className="profile-page__empty">
                  <p>暂无训练记录，开始记录你的第一次训练吧！</p>
                </div>
              ) : (
                <div className="profile-page__records-list">
                  {profile.records.map((r) => (
                    <div key={r.id} className="profile-page__record-card">
                      <div className="profile-page__record-header">
                        <span className="profile-page__record-sport">{r.sport}</span>
                        <span className="profile-page__record-date">{r.date}</span>
                      </div>
                      <div className="profile-page__record-body">
                        <span>{r.duration} 分钟</span>
                        {r.notes && <span className="profile-page__record-notes">{r.notes}</span>}
                        <span className="profile-page__record-mood">
                          {MOOD_OPTIONS.find((m) => m.value === r.mood)?.emoji}
                        </span>
                      </div>
                      <button
                        className="profile-page__record-delete"
                        onClick={() => deleteRecord(r.id)}
                      >
                        删除
                      </button>
                    </div>
                  ))}
                </div>
              )}
            </div>
          </div>
        )}

        {/* AI Profile Tab */}
        {activeTab === 'ai-profile' && (
          <div className="profile-page__tab-content">
            {/* 训练数据总览：做了什么 / 做了多少 / 得分情况 */}
            <div className="profile-page__section">
              <h3 className="profile-page__section-title">训练数据总览</h3>
              {!trainingOverview || trainingOverview.totalRecords === 0 ? (
                <div className="profile-page__empty">
                  <p>暂无算法训练数据，完成一次动作评估后自动记录：做了什么、做了多少、每次得分。</p>
                </div>
              ) : (
                <>
                  <div className="profile-page__stats-grid">
                    <div className="profile-page__stat-card">
                      <span className="profile-page__stat-value">{trainingOverview.totalRecords}</span>
                      <span className="profile-page__stat-label">评估视频段数</span>
                    </div>
                    <div className="profile-page__stat-card">
                      <span className="profile-page__stat-value">{trainingOverview.totalReps}</span>
                      <span className="profile-page__stat-label">总动作次数</span>
                    </div>
                    <div className="profile-page__stat-card">
                      <span className="profile-page__stat-value">
                        {trainingOverview.avgScore !== null ? trainingOverview.avgScore : '-'}
                      </span>
                      <span className="profile-page__stat-label">平均评分（满分 100）</span>
                    </div>
                    <div className="profile-page__stat-card profile-page__stat-card--highlight">
                      <span className="profile-page__stat-value">
                        {recentScores.length > 0 ? recentScores[recentScores.length - 1].score : '-'}
                      </span>
                      <span className="profile-page__stat-label">最近一次动作得分</span>
                      {trainingOverview.latestDate && (
                        <span className="profile-page__stat-sub">{trainingOverview.latestDate}</span>
                      )}
                    </div>
                  </div>

                  {trainingOverview.actionTypes.length > 0 && (
                    <div className="profile-page__action-types">
                      <span className="profile-page__action-types-label">动作类型分布：</span>
                      <div className="profile-page__action-types-chips">
                        {trainingOverview.actionTypes.map((at) => (
                          <span key={at.name} className="profile-page__action-type-chip">
                            {at.name} × {at.count}
                          </span>
                        ))}
                      </div>
                    </div>
                  )}
                </>
              )}
            </div>

            {/* 反复犯的动作毛病：自动总结排名 */}
            <div className="profile-page__section">
              <h3 className="profile-page__section-title">
                反复犯的动作毛病
                <span className="profile-page__section-sub">
                  根据每段视频逐动作统计自动总结，≥3 次标注中度，≥5 次标注重度
                </span>
              </h3>
              {recurringErrors.length === 0 ? (
                <div className="profile-page__empty">
                  <p>暂无重复出现的错误。继续训练，系统会自动识别你反复犯的动作毛病。</p>
                </div>
              ) : (
                <div className="profile-page__error-ranking">
                  {recurringErrors.map((e, idx) => (
                    <div key={e.name} className="profile-page__error-rank-item">
                      <div className="profile-page__error-rank-num">{idx + 1}</div>
                      <div className="profile-page__error-rank-body">
                        <div className="profile-page__error-rank-head">
                          <span className="profile-page__error-rank-name">{e.name}</span>
                          <span
                            className={`profile-page__error-rank-sev profile-page__error-rank-sev--${e.severity}`}
                          >
                            {e.severity}
                          </span>
                        </div>
                        <div className="profile-page__error-rank-meta">
                          {e.repCount > 0 && <span>动作级出现 {e.repCount} 次</span>}
                          {e.segmentCount > 0 && <span>段级出现 {e.segmentCount} 次</span>}
                        </div>
                        <div className="profile-page__error-rank-bar">
                          <div
                            className="profile-page__error-rank-bar-fill"
                            style={{
                              width: `${Math.min(100, e.total * 12)}%`,
                              background:
                                e.severity === '重度' ? '#ff4757' :
                                e.severity === '中度' ? '#ffa502' : '#00d4ff',
                            }}
                          />
                        </div>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>

            <div className="profile-page__section">
              <h3 className="profile-page__section-title">AI 画像摘要</h3>
              <div className="profile-page__ai-summary">
                {aiSummary.split('\n').map((line, i) => (
                  <p key={i} className="profile-page__ai-line">{line}</p>
                ))}
              </div>
            </div>

            <div className="profile-page__section">
              <h3 className="profile-page__section-title">
                算法训练记录 ({aiRecords.length})
                <span className="profile-page__section-sub">
                  最多保留最近 {recentScores.length}/30 次逐动作得分曲线
                </span>
              </h3>

              {/* 最近 30 次得分曲线图（满分 100） */}
              {recentScores.length > 0 ? (
                <ScoreCurveChart data={recentScores} maxScore={100} />
              ) : aiRecords.length === 0 ? null : (
                <div className="profile-page__empty profile-page__empty--inline">
                  暂无逐动作评分数据。
                </div>
              )}

              {aiRecords.length === 0 ? (
                <div className="profile-page__empty">
                  <p>暂无算法训练数据，完成一次动作评估后将自动记录。</p>
                </div>
              ) : (
                <div className="profile-page__records-list">
                  {aiRecords.slice().reverse().map((r, i) => {
                    const totalReps = r.total_reps || r.reps || 0;
                    const minScore =
                      Array.isArray(r.per_rep_scores) && r.per_rep_scores.length > 0
                        ? Math.min(...r.per_rep_scores)
                        : null;
                    const maxScore =
                      Array.isArray(r.per_rep_scores) && r.per_rep_scores.length > 0
                        ? Math.max(...r.per_rep_scores)
                        : null;
                    return (
                      <div key={i} className="profile-page__record-card">
                        <div className="profile-page__record-header">
                          <span className="profile-page__record-sport">{r.action_type}</span>
                          <span className="profile-page__record-date">{r.date}</span>
                        </div>
                        <div className="profile-page__record-body">
                          <span>
                            整体评分 {r.score} 分
                            {minScore !== null && maxScore !== null
                              ? `（逐动作 ${minScore} ~ ${maxScore}）`
                              : ''}
                          </span>
                          <span>{r.sets} 组 {totalReps} 次</span>
                          {r.duration_sec > 0 && <span>时长 {r.duration_sec} 秒</span>}
                        </div>
                        {Array.isArray(r.per_rep_scores) && r.per_rep_scores.length > 0 && (
                          <div className="profile-page__record-reps">
                            <span className="profile-page__record-reps-label">逐动作评分：</span>
                            <div className="profile-page__record-reps-scores">
                              {r.per_rep_scores.map((s, idx) => {
                                const color =
                                  s >= 90 ? '#00d4ff' : s >= 75 ? '#3cb44b' : s >= 60 ? '#ffa502' : '#ff4757';
                                return (
                                  <span
                                    key={idx}
                                    className="profile-page__record-rep-score"
                                    style={{ borderColor: color, color }}
                                    title={`动作 ${idx + 1}：${s} 分`}
                                  >
                                    #{idx + 1} {s}
                                  </span>
                                );
                              })}
                            </div>
                          </div>
                        )}
                        {r.errors && r.errors.length > 0 && (
                          <div className="profile-page__record-errors">
                            {r.errors.map((err, idx) => (
                              <span key={idx} className="profile-page__record-error-tag">{err}</span>
                            ))}
                          </div>
                        )}
                      </div>
                    );
                  })}
                </div>
              )}
            </div>
          </div>
        )}

        {/* Goals Tab */}
        {activeTab === 'goals' && (
          <div className="profile-page__tab-content">
            <div className="profile-page__section">
              <h3 className="profile-page__section-title">训练目标</h3>
              <textarea
                className="profile-page__textarea"
                placeholder="描述你的训练目标，例如：3个月内深蹲达到100kg..."
                value={profile.goal}
                onChange={(e) => updateProfile('goal', e.target.value)}
                onBlur={() => {
                  const description = profile.goal.trim();
                  if (!description) return;
                  addGoal(getOrCreateUserId(), {
                    description,
                    target_metric: '按计划持续训练',
                    status: '进行中',
                    target_date: '',
                  }).then(() => setProfileApiStatus('阶段目标已同步到运动画像'))
                    .catch(() => setProfileApiStatus('目标已保存在本机，画像服务暂时未连接'));
                }}
                rows={4}
              />
            </div>

            <div className="profile-page__section">
              <h3 className="profile-page__section-title">每周训练频率</h3>
              <div className="profile-page__frequency">
                {[1, 2, 3, 4, 5, 6, 7].map((n) => (
                  <button
                    key={n}
                    className={`profile-page__freq-btn ${profile.weeklyFrequency === n ? 'profile-page__freq-btn--active' : ''}`}
                    onClick={() => updateProfile('weeklyFrequency', n)}
                  >
                    {n}
                  </button>
                ))}
                <span className="profile-page__freq-label">次/周</span>
              </div>
            </div>

            <div className="profile-page__section">
              <h3 className="profile-page__section-title">偏好运动</h3>
              <div className="profile-page__sports-grid">
                {SPORTS_OPTIONS.map((s) => (
                  <button
                    key={s}
                    className={`profile-page__sport-btn ${profile.preferredSports.includes(s) ? 'profile-page__sport-btn--active' : ''}`}
                    onClick={() => toggleSport(s)}
                  >
                    {s}
                  </button>
                ))}
              </div>
            </div>

            <div className="profile-page__section">
              <h3 className="profile-page__section-title">AI 建议</h3>
              <div className="profile-page__ai-suggestion">
                <p>
                  根据你的画像数据：
                  {profile.level === 'beginner' && ' 作为入门者，建议每周训练3次，每次30-45分钟，以基础动作为主。'}
                  {profile.level === 'intermediate' && ' 作为进阶训练者，可以尝试分化训练，每周4-5次，注重渐进超负荷。'}
                  {profile.level === 'advanced' && ' 作为高级训练者，建议周期化训练计划，注重弱项强化和恢复管理。'}
                </p>
                {profile.goal && <p>你的目标：「{profile.goal}」，建议制定阶段性里程碑。</p>}
                {profile.preferredSports.length > 0 && (
                  <p>偏好运动：{profile.preferredSports.join('、')}，可以围绕这些运动设计训练计划。</p>
                )}
              </div>
            </div>
          </div>
        )}

        {/* Settings Tab */}
        {activeTab === 'settings' && (
          <div className="profile-page__tab-content">
            <div className="profile-page__section">
              <h3 className="profile-page__section-title">基本信息</h3>
              <div className="profile-page__form">
                <div className="profile-page__form-group">
                  <label className="profile-page__label">昵称</label>
                  <input
                    className="profile-page__input"
                    placeholder="输入你的昵称"
                    value={profile.name}
                    onChange={(e) => updateProfile('name', e.target.value)}
                  />
                </div>
                <div className="profile-page__form-group">
                  <label className="profile-page__label">训练水平</label>
                  <div className="profile-page__level-grid">
                    {LEVEL_OPTIONS.map((l) => (
                      <button
                        key={l.value}
                        className={`profile-page__level-btn ${profile.level === l.value ? 'profile-page__level-btn--active' : ''}`}
                        onClick={() => updateProfile('level', l.value)}
                      >
                        <span className="profile-page__level-name">{l.label}</span>
                        <span className="profile-page__level-desc">{l.desc}</span>
                      </button>
                    ))}
                  </div>
                </div>
              </div>
            </div>

            {/* AI 记住的用户特点（对话自动抽取 + 手动维护） */}
            <div className="profile-page__section">
              <h3 className="profile-page__section-title">
                AI 记住的特点
                <span className="profile-page__section-sub">
                  和 AI 教练对话时自动识别，也可以手动补充
                </span>
              </h3>

              <div className="profile-page__trait-add">
                <select
                  className="profile-page__input profile-page__input--sm"
                  value={addCategory}
                  onChange={(e) => setAddCategory(e.target.value)}
                >
                  {traitCats.map((c) => (
                    <option key={c.key} value={c.key}>{c.label}</option>
                  ))}
                </select>
                <input
                  className="profile-page__input"
                  placeholder="例如：膝盖不好 / 想减脂 / 只有周末有时间"
                  value={addValue}
                  onChange={(e) => setAddValue(e.target.value)}
                  onKeyDown={(e) => {
                    if (e.key === 'Enter') handleAddTrait();
                  }}
                />
                <button className="profile-page__btn" onClick={handleAddTrait}>
                  添加
                </button>
              </div>

              <div className="profile-page__trait-groups">
                {traitCats.length === 0 || Object.keys(chatTraits).every((k) => !chatTraits[k] || chatTraits[k].length === 0) ? (
                  <div className="profile-page__empty">
                    <p>还没有记住任何特点。和 AI 教练聊聊你的目标、伤病、时间安排，AI 会自动记录。</p>
                  </div>
                ) : (
                  traitCats.map((cat) => {
                    const items = chatTraits[cat.key] || [];
                    if (items.length === 0) return null;
                    return (
                      <div key={cat.key} className="profile-page__trait-group">
                        <div className="profile-page__trait-group-header">
                          <span className="profile-page__trait-group-label">{cat.label}</span>
                          <span className="profile-page__trait-group-count">{items.length} 条</span>
                        </div>
                        <div className="profile-page__trait-chips">
                          {items.map((item) => (
                            <div key={item.value} className="profile-page__trait-chip">
                              <span className="profile-page__trait-chip-value">{item.value}</span>
                              {item.source === 'chat' && (
                                <span className="profile-page__trait-chip-source">对话</span>
                              )}
                              <button
                                className="profile-page__trait-chip-remove"
                                onClick={() => handleRemoveTrait(cat.key, item.value)}
                                aria-label={`删除${item.value}`}
                              >
                                ×
                              </button>
                            </div>
                          ))}
                        </div>
                      </div>
                    );
                  })
                )}
              </div>
            </div>

            <div className="profile-page__section">
              <h3 className="profile-page__section-title">数据管理</h3>
              <div className="profile-page__data-actions">
                <button
                  className="profile-page__btn profile-page__btn--danger"
                  onClick={() => {
                    if (window.confirm('确定要清除所有数据吗？此操作不可恢复。')) {
                      try {
                        resetManualProfile(getPageUserId_());
                      } catch {
                        /* ignore */
                      }
                      setProfile({ ...defaultProfile });
                    }
                  }}
                >
                  清除所有数据
                </button>
              </div>
            </div>
          </div>
        )}
      </div>
    </PageLayout>
  );
}
