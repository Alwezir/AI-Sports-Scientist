// 用户画像模块（JS 移植版）
// 对应负责用户画像同学交付的 Python user_profile 模块：
//   init_user / receive_algorithm_json / generate_profile_summary
// 由于本项目为浏览器端 React 应用，使用 localStorage 替代 user_data.json，
// 数据结构与字段含义保持与 Python 版本一致，不影响原有功能。

const STORAGE_KEY = 'dongzhi_user_data';
const USER_ID_KEY = 'dongzhi_user_id';
const OLD_MANUAL_STORAGE_KEY = 'dongzhi_profile'; // 旧版手动训练/目标数据的 localStorage key（两套合并时读取迁移用）

// 手动训练/基本信息的默认值（与 ProfilePage.jsx defaultProfile 保持一致，实际存储字段）
const DEFAULT_MANUAL_PROFILE = {
  name: '',             // 个人设置里的"昵称"
  goal: '',             // 目标管理里的"训练目标"文本
  level: 'beginner',    // 目标管理里的 level（入门/进阶/高级，对应 LEVEL_OPTIONS value）
  weeklyFrequency: 3,   // 目标管理里的"每周训练频率"
  preferredSports: [],  // 目标管理里勾选的偏好运动
  mood: 'neutral',      // 总览/训练记录打卡使用（MOOD_OPTIONS value）
  records: [],          // 训练记录 tab：手动添加的训练记录
};

/**
 * 读取全部用户数据（对应 Python 中读取 user_data.json）
 */
function getAllData() {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    return raw ? JSON.parse(raw) : {};
  } catch {
    return {};
  }
}

/**
 * 保存全部用户数据（对应 Python 中写入 user_data.json）
 */
function saveAllData(allData) {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(allData));
}

/**
 * 获取或创建稳定的用户 ID（单用户前端应用，对应 Python 中显式传入的 user_id）
 */
export function getOrCreateUserId() {
  let uid = localStorage.getItem(USER_ID_KEY);
  if (!uid) {
    uid = 'u_' + Date.now();
    localStorage.setItem(USER_ID_KEY, uid);
  }
  return uid;
}

/**
 * 尝试从旧版手动训练存储 key (dongzhi_profile) 读取并迁移
 * 迁移成功后会把旧 key 置为 "migrated" 标记，避免重复合并
 * 只在目标用户文档还没有手动数据时迁移
 */
function migrateLegacyManualProfileIfNeeded_(userDoc) {
  if (userDoc.manual_profile && userDoc.manual_records && userDoc.manual_records.length > 0) {
    return; // 已有手动数据，不再迁移
  }
  let oldData = null;
  try {
    const raw = localStorage.getItem(OLD_MANUAL_STORAGE_KEY);
    if (!raw || raw === 'migrated' || raw === '') return;
    oldData = JSON.parse(raw);
  } catch {
    return;
  }
  if (!oldData || typeof oldData !== 'object') return;

  userDoc.manual_profile = {
    name: typeof oldData.name === 'string' ? oldData.name : '',
    goal: typeof oldData.goal === 'string' ? oldData.goal : '',
    level: typeof oldData.level === 'string' ? oldData.level : 'beginner',
    weeklyFrequency: Number.isFinite(oldData.weeklyFrequency)
      ? Math.max(1, Math.min(7, oldData.weeklyFrequency)) : 3,
    preferredSports: Array.isArray(oldData.preferredSports) ? oldData.preferredSports.slice() : [],
    mood: typeof oldData.mood === 'string' ? oldData.mood : 'neutral',
  };
  userDoc.manual_records = Array.isArray(oldData.records) ? oldData.records.slice() : [];

  // 兼容：如果主昵称还没设，就把手动训练里的昵称带过来
  const nickname = userDoc.manual_profile.name || '';
  if (!userDoc.nickname && nickname) userDoc.nickname = nickname;

  // 标记旧数据已迁移，防止反复合并（但保留一份备份标记，用户不手动清就不丢）
  try {
    localStorage.setItem(OLD_MANUAL_STORAGE_KEY, 'migrated');
  } catch {
    /* ignore */
  }
}

/**
 * 补齐用户文档的字段形状，新增手动训练相关字段（幂等）
 * 并触发一次"旧版 dongzhi_profile → 新版统一存储"的数据迁移
 */
function ensureUserDocShape_(userDoc) {
  if (!userDoc.manual_profile) {
    userDoc.manual_profile = {
      name: DEFAULT_MANUAL_PROFILE.name,
      goal: DEFAULT_MANUAL_PROFILE.goal,
      level: DEFAULT_MANUAL_PROFILE.level,
      weeklyFrequency: DEFAULT_MANUAL_PROFILE.weeklyFrequency,
      preferredSports: DEFAULT_MANUAL_PROFILE.preferredSports.slice(),
      mood: DEFAULT_MANUAL_PROFILE.mood,
    };
  } else {
    // 字段补齐（向前兼容，旧字段可能缺）
    const d = userDoc.manual_profile;
    if (typeof d.name !== 'string') d.name = DEFAULT_MANUAL_PROFILE.name;
    if (typeof d.goal !== 'string') d.goal = DEFAULT_MANUAL_PROFILE.goal;
    if (typeof d.level !== 'string') d.level = DEFAULT_MANUAL_PROFILE.level;
    if (!Number.isFinite(d.weeklyFrequency)) d.weeklyFrequency = DEFAULT_MANUAL_PROFILE.weeklyFrequency;
    if (!Array.isArray(d.preferredSports)) d.preferredSports = DEFAULT_MANUAL_PROFILE.preferredSports.slice();
    if (typeof d.mood !== 'string') d.mood = DEFAULT_MANUAL_PROFILE.mood;
  }
  if (!Array.isArray(userDoc.manual_records)) userDoc.manual_records = [];
  if (!userDoc.chat_traits || typeof userDoc.chat_traits !== 'object') userDoc.chat_traits = {};
  migrateLegacyManualProfileIfNeeded_(userDoc);
}

/**
 * 初始化用户，如果不存在就创建
 * 对应 Python: init_user(user_id, nickname)
 * 新增：补齐手动训练 schema + 自动从旧版 dongzhi_profile 迁移
 */
export function initUser(userId, nickname) {
  const allData = getAllData();
  if (!(userId in allData)) {
    allData[userId] = {
      user_id: userId,
      nickname: nickname || '',
      coach_style: '',
      created_at: new Date().toISOString(),
      last_updated: new Date().toISOString(),
      training_record: [],
      action_habit: [],
      emotion_motivation: [],
      stage_target: [],
      chat_traits: {},
    };
  }
  // 无论用户是新建还是已存在，都要确保 schema 齐全 + 尝试旧数据迁移
  ensureUserDocShape_(allData[userId]);
  saveAllData(allData);
}

/**
 * 接收算法传来的单次训练数据，存入存储（只存，不统计）
 * 对应 Python: receive_algorithm_json(user_id, train_data)
 * @param {string} userId
 * @param {object} trainData - { action_type, date, sets, reps, score,
 *                                 errors[], duration_sec,
 *                                 correctness_rate, correct_reps, total_reps,
 *                                 per_rep_scores[], per_rep_errors[][] }
 */
export function receiveAlgorithmJson(userId, trainData) {
  const allData = getAllData();
  if (!(userId in allData)) {
    initUser(userId, '运动用户');
  }
  const userDoc = allData[userId];
  const totalReps = Number.isInteger(trainData.total_reps)
    ? trainData.total_reps
    : trainData.reps || 0;
  const correctReps = Number.isInteger(trainData.correct_reps)
    ? trainData.correct_reps
    : (Array.isArray(trainData.per_rep_scores)
        ? trainData.per_rep_scores.filter((s) => s >= 90).length
        : 0);
  const correctness = typeof trainData.correctness_rate === 'number'
    ? trainData.correctness_rate
    : (totalReps > 0 ? Math.round((correctReps / totalReps) * 100) : null);

  const record = {
    source: 'pose_algorithm',
    timestamp: new Date().toISOString(),
    confidence: 'high',
    confirmed: true,
    action_type: trainData.action_type,
    date: trainData.date,
    sets: trainData.sets,
    reps: totalReps,
    score: trainData.score,
    errors: Array.isArray(trainData.errors) ? trainData.errors : [],
    duration_sec: trainData.duration_sec,
    // 新增：正确率 & 正确动作数（做了什么 / 做了多少 / 正确率怎么样）
    correct_reps: correctReps,
    total_reps: totalReps,
    correctness_rate: correctness,
    // 新增：逐动作明细（用于精准总结反复犯的毛病）
    per_rep_scores: Array.isArray(trainData.per_rep_scores) ? trainData.per_rep_scores : [],
    per_rep_errors: Array.isArray(trainData.per_rep_errors) ? trainData.per_rep_errors : [],
  };
  userDoc.training_record.push(record);
  userDoc.last_updated = new Date().toISOString();
  saveAllData(allData);
}

/**
 * 读取画像，实时扫描全部训练记录，动态统计动作错误
 * 对应 Python: generate_profile_summary(user_id, scene="all")
 * @param {string} userId
 * @param {'all'|'train'} scene
 * @returns {string} 多行文本摘要
 */
export function generateProfileSummary(userId, scene = 'all') {
  const allData = getAllData();
  if (!(userId in allData)) {
    return '【用户画像摘要】\n暂无数据，请先完成一次动作评估。';
  }
  const userDoc = allData[userId];

  const lines = ['【用户画像摘要】'];

  // ===== 汇总：做了什么、做了多少、正确率 =====
  let totalRecords = 0;
  let totalReps = 0;
  let totalCorrectReps = 0;
  const actionTypeCounts = {};
  const totalScores = [];

  for (const record of userDoc.training_record) {
    totalRecords += 1;
    totalReps += Number(record.total_reps || record.reps || 0);
    totalCorrectReps += Number(record.correct_reps || 0);
    if (Number.isInteger(record.score)) totalScores.push(record.score);
    const at = record.action_type || '训练';
    actionTypeCounts[at] = (actionTypeCounts[at] || 0) + 1;
  }

  if (totalRecords > 0) {
    const overallCorrectness = totalReps > 0 ? Math.round((totalCorrectReps / totalReps) * 100) : null;
    const avgScore = totalScores.length > 0
      ? Math.round(totalScores.reduce((s, n) => s + n, 0) / totalScores.length)
      : null;
    const actionText = Object.entries(actionTypeCounts)
      .map(([k, v]) => `${k}${v}次`)
      .join('、');
    const parts = [
      `累计评估 ${totalRecords} 段视频`,
      `总动作 ${totalReps} 次（正确 ${totalCorrectReps} 次）`,
    ];
    if (overallCorrectness !== null) parts.push(`正确率 ${overallCorrectness}%`);
    if (avgScore !== null) parts.push(`平均评分 ${avgScore} 分`);
    lines.push('-训练概览：' + parts.join('，') + '，动作类型：' + actionText);
  }

  // ===== 反复犯的动作毛病（逐动作统计更精准，含每动作内部的 per_rep_errors） =====
  const errorCounter = {};
  for (const record of userDoc.training_record) {
    // 1) 汇总错误（每条记录顶层 errors[]）—— 按每段视频"该错误是否出现过"记 1 次（段级）
    for (const err of record.errors || []) {
      if (!(err in errorCounter)) errorCounter[err] = { segment: 0, rep: 0 };
      errorCounter[err].segment += 1;
    }
    // 2) 逐动作统计更精准（per_rep_errors[][]）——每动作中的每个错误都加 1
    if (Array.isArray(record.per_rep_errors)) {
      for (const repErrors of record.per_rep_errors) {
        if (!Array.isArray(repErrors)) continue;
        for (const err of repErrors) {
          if (!(err in errorCounter)) errorCounter[err] = { segment: 0, rep: 0 };
          errorCounter[err].rep += 1;
        }
      }
    }
  }

  const habitText = [];
  for (const [desc, counts] of Object.entries(errorCounter)) {
    const total = Math.max(counts.rep, counts.segment);
    if (total >= 2) {
      let sev = '轻度';
      if (total >= 5) sev = '重度';
      else if (total >= 3) sev = '中度';
      const repLabel = counts.rep > 0 ? `动作级${counts.rep}次` : '';
      const segLabel = counts.segment > 0 ? `段级${counts.segment}次` : '';
      const label = [repLabel, segLabel].filter(Boolean).join('/');
      habitText.push(`${desc}(${label}，${sev})`);
    }
  }
  habitText.sort((a, b) => {
    // 错误次数多的放前面（从字符串里不靠谱地取，这里简化：按字母顺序，UI 再排）
    return 0;
  });
  if (habitText.length > 0) {
    lines.push('-反复犯的动作毛病：' + habitText.join('，'));
  } else if (totalRecords > 0) {
    lines.push('-反复犯的动作毛病：暂无明显重复问题，继续保持！');
  }

  if (scene === 'all' || scene === 'train') {
    // 取最新两条训练记录展示（含正确率）
    const records = [...userDoc.training_record]
      .sort((a, b) => (a.timestamp < b.timestamp ? 1 : -1))
      .slice(0, 2);
    const recText = [];
    for (const r of records) {
      const cr = r.correctness_rate;
      const crText = cr !== null ? `，正确率${cr}%（${r.correct_reps || 0}/${r.total_reps || r.reps || 0}）` : '';
      recText.push(`${r.date}${r.action_type}${r.sets}组${r.total_reps || r.reps}次，评分${r.score}分${crText}`);
    }
    if (recText.length > 0) {
      lines.push('-最近训练：' + recText.join('，'));
    }
  }

  return lines.join('\n');
}

/**
 * 获取用户的全部训练记录（用于 UI 列表展示，Python 版未提供，便于对接）
 */
export function getTrainingRecords(userId) {
  const allData = getAllData();
  if (!(userId in allData)) return [];
  return allData[userId].training_record;
}

/**
 * 结构化训练概览（UI 数据卡片用）
 * 返回 { totalRecords, totalReps, correctReps, correctnessRate, avgScore,
 *         actionTypes: [{name, count}], latestDate }
 */
export function getTrainingOverview(userId) {
  const records = getTrainingRecords(userId);
  if (records.length === 0) {
    return {
      totalRecords: 0, totalReps: 0, correctReps: 0,
      correctnessRate: null, avgScore: null,
      actionTypes: [], latestDate: null,
    };
  }
  let totalReps = 0;
  let correctReps = 0;
  const scoreList = [];
  const typeMap = {};
  let latestTs = 0;
  let latestDate = null;

  for (const r of records) {
    totalReps += Number(r.total_reps || r.reps || 0);
    correctReps += Number(r.correct_reps || 0);
    if (Number.isInteger(r.score)) scoreList.push(r.score);
    typeMap[r.action_type || '训练'] = (typeMap[r.action_type || '训练'] || 0) + 1;
    const ts = r.timestamp ? new Date(r.timestamp).getTime() : 0;
    if (ts > latestTs) {
      latestTs = ts;
      latestDate = r.date;
    }
  }

  const actionTypes = Object.entries(typeMap)
    .map(([name, count]) => ({ name, count }))
    .sort((a, b) => b.count - a.count);

  return {
    totalRecords: records.length,
    totalReps,
    correctReps,
    correctnessRate: totalReps > 0 ? Math.round((correctReps / totalReps) * 100) : null,
    avgScore: scoreList.length > 0
      ? Math.round(scoreList.reduce((s, n) => s + n, 0) / scoreList.length)
      : null,
    actionTypes,
    latestDate,
  };
}

/**
 * 反复犯的动作毛病排行榜（UI 展示用，按总次数降序）
 * 返回 [{ name, segmentCount, repCount, total, severity }]
 */
export function getRecurringErrors(userId, minOccurrence = 2) {
  const records = getTrainingRecords(userId);
  const counter = {};
  for (const r of records) {
    for (const err of r.errors || []) {
      if (!counter[err]) counter[err] = { segment: 0, rep: 0 };
      counter[err].segment += 1;
    }
    if (Array.isArray(r.per_rep_errors)) {
      for (const repErrors of r.per_rep_errors) {
        if (!Array.isArray(repErrors)) continue;
        for (const err of repErrors) {
          if (!counter[err]) counter[err] = { segment: 0, rep: 0 };
          counter[err].rep += 1;
        }
      }
    }
  }

  return Object.entries(counter)
    .map(([name, c]) => {
      const total = Math.max(c.rep, c.segment);
      let severity = '轻度';
      if (total >= 5) severity = '重度';
      else if (total >= 3) severity = '中度';
      return {
        name,
        segmentCount: c.segment,
        repCount: c.rep,
        total,
        severity,
      };
    })
    .filter((x) => x.total >= minOccurrence)
    .sort((a, b) => b.total - a.total);
}

/**
 * 取最近 N 个逐动作得分（跨所有训练记录滚动合并，最多 max 个）
 * 返回按时间升序的对象数组，便于曲线图渲染：
 *   [{ index: 0..N-1, score, date, actionType, globalIndex }]
 * 其中 globalIndex 是用户该动作在训练中的绝对序号，index 是图表内的展示序号（0..max-1）
 */
export function getRecentPerRepScores(userId, max = 30) {
  const records = getTrainingRecords(userId);
  // 按时间升序迭代：先收集全部，再截取尾部 max 条
  const all = [];
  const sorted = [...records].sort((a, b) => (a.timestamp < b.timestamp ? -1 : 1));
  let globalIdx = 0;
  for (const r of sorted) {
    const perRep = Array.isArray(r.per_rep_scores) && r.per_rep_scores.length > 0
      ? r.per_rep_scores
      : null;
    const repsCount = perRep ? perRep.length : r.total_reps || r.reps || 0;
    for (let i = 0; i < repsCount; i += 1) {
      globalIdx += 1;
      const score = perRep ? perRep[i] : r.score;
      all.push({
        globalIndex: globalIdx,
        score: Number.isFinite(score) ? Math.max(0, Math.min(100, score)) : 0,
        date: r.date || '',
        actionType: r.action_type || '',
      });
    }
  }
  const tail = all.slice(-max);
  return tail.map((entry, idx) => ({ index: idx, ...entry }));
}

/**
 * 画像页「状态记录 4 张卡」的统一聚合（动作识别 × 手动记录 × AI 对话记住的偏好，三者合并）。
 * 保持数值与 AI 教练对话 / 动作评估 实时同步：
 *  · totalRecords  — 算法训练段数 + 手动记录条数
 *  · totalDuration — 算法段 Σ duration_sec/60 + 手动记录 Σ duration (分钟)
 *  · preferredSports— (手动画像 preferredSports) ∪ (auto_profile.hobbies∩运动词) ∪ (action_types 里用户实际训练过的动作)
 *  · topSport      — 综合频次最高的运动 / 动作类型（手动训练 + 算法训练合并统计）
 *  · topSportCount — 最高频次（用于调试/meta 显示）
 * @param {string} userId
 * @param {object} [opts] { autoProfile?: object, manualProfile?: object, trainingOverview?: object, trainingRecords?: object[] }
 */
export function aggregateStatusCards(userId, opts = {}) {
  const manual = opts.manualProfile || (typeof getManualProfile === 'function' ? getManualProfile(userId) : null);
  const manualRecords = Array.isArray(manual && manual.records) ? manual.records : [];
  const algoRecords = Array.isArray(opts.trainingRecords)
    ? opts.trainingRecords
    : (typeof getTrainingRecords === 'function' ? getTrainingRecords(userId) : []);
  const overview = opts.trainingOverview || (typeof getTrainingOverview === 'function' ? getTrainingOverview(userId) : null);

  // ---- 训练次数 & 总时长（算法 + 手动 合并） ----
  let totalRecords = (overview && overview.totalRecords) || 0;
  let totalDuration = 0;
  for (const r of algoRecords) {
    const sec = Number(r && r.duration_sec);
    if (Number.isFinite(sec) && sec > 0) totalDuration += sec / 60;
  }
  totalRecords += manualRecords.length;
  for (const r of manualRecords) {
    const d = parseInt(r && r.duration, 10);
    if (Number.isFinite(d) && d > 0) totalDuration += d;
  }
  totalDuration = Math.round(totalDuration);

  // ---- 最常运动（合并算法 action_type + 手动 records.sport） ----
  const sportCount = {};
  if (overview && Array.isArray(overview.actionTypes)) {
    for (const at of overview.actionTypes) {
      if (!at || !at.name) continue;
      sportCount[String(at.name)] = (sportCount[String(at.name)] || 0) + (at.count || 1);
    }
  }
  for (const r of manualRecords) {
    const n = r && r.sport;
    if (!n) continue;
    sportCount[String(n)] = (sportCount[String(n)] || 0) + 1;
  }
  const sorted = Object.entries(sportCount).sort((a, b) => b[1] - a[1]);
  const topSport = sorted[0] ? sorted[0][0] : '';
  const topSportCount = sorted[0] ? sorted[0][1] : 0;

  // ---- 偏好运动（勾选项 + 对话爱好交集 + 真实练过动作 并集） ----
  const prefSet = new Set();
  if (manual && Array.isArray(manual.preferredSports)) {
    for (const s of manual.preferredSports) if (s) prefSet.add(String(s));
  }
  // 来自 auto_profile.hobbies / trainingPreferences 的运动类关键词（允许调用方传入缓存好的 auto_profile 避免重复读）
  const auto = opts.autoProfile || null;
  if (auto) {
    const SPORTY = new Set([
      '跑步','篮球','足球','羽毛球','乒乓球','网球','游泳','骑行','自行车','登山','爬山','徒步',
      '瑜伽','普拉提','拳击','格斗','泰拳','跆拳道','武术','滑雪','滑板','冲浪','跳绳','街舞','跳舞',
      '健身','撸铁','力量举','CrossFit','壶铃','哑铃','器械','自重','户外','划船','高尔夫','排球','手球',
      '深蹲','硬拉','卧推','臀推','臀桥','平板支撑','开合跳','箭步蹲','引体向上','俯卧撑','哑铃肩推',
      '哑铃弯举','俯身哑铃划船','保加利亚分腿蹲','罗马尼亚硬拉'
    ]);
    if (Array.isArray(auto.hobbies)) {
      for (const h of auto.hobbies) if (SPORTY.has(String(h))) prefSet.add(String(h));
    }
    if (Array.isArray(auto.trainingPreferences)) {
      for (const p of auto.trainingPreferences) {
        const key = String(p);
        if (SPORTY.has(key)) prefSet.add(key);
      }
    }
  }
  // 真实练过的动作也要进入偏好集合（用户实际做过 = 偏好）
  for (const name of Object.keys(sportCount)) prefSet.add(name);

  const preferredSports = Array.from(prefSet);

  return {
    totalRecords,
    totalDuration,
    preferredSports,
    topSport,
    topSportCount,
    breakdown: {
      algoRecords: algoRecords.length,
      manualRecords: manualRecords.length,
    },
  };
}

// 简易跨页面事件（动作评估完成 / AI 教练记住新信息后广播），避免引入全局 Context
function canUseWindow() {
  return typeof window !== 'undefined' && typeof window.dispatchEvent === 'function';
}
/**
 * 广播「用户画像有变更」事件：动作评估/手动记录/AI 对话抽取后调用；
 * ProfilePage 监听到后立即重算状态卡，用户无需手动刷新。
 */
export function emitProfileChanged(userId) {
  if (!canUseWindow()) return;
  try {
    window.dispatchEvent(new CustomEvent('user-profile:changed', { detail: { userId: userId || '', at: Date.now() } }));
  } catch { /* ignore */ }
}

// ========== 手动训练/目标/个人信息（原 dongzhi_profile 合并后统一门面） ==========

/**
 * 读取完整手动画像（基本信息 + 训练记录 + 目标），返回与旧版 dongzhi_profile 同 shape：
 *   { name, goal, level, weeklyFrequency, preferredSports[], mood, records[] }
 * 保证幂等：若用户还未初始化会自动 init + 自动迁移旧 key
 */
export function getManualProfile(userId) {
  initUser(userId, '运动用户');
  const allData = getAllData();
  const doc = allData[userId];
  ensureUserDocShape_(doc);
  const p = doc.manual_profile || DEFAULT_MANUAL_PROFILE;
  return {
    name: p.name || '',
    goal: p.goal || '',
    level: p.level || 'beginner',
    weeklyFrequency: Number.isFinite(p.weeklyFrequency)
      ? Math.max(1, Math.min(7, p.weeklyFrequency)) : 3,
    preferredSports: Array.isArray(p.preferredSports) ? p.preferredSports.slice() : [],
    mood: p.mood || 'neutral',
    records: Array.isArray(doc.manual_records) ? doc.manual_records.slice() : [],
  };
}

/**
 * 整体保存手动画像（旧版 dongzhi_profile 的全量 setState→持久化 等价替换）
 * 入参 shape 与旧版完全一致：{ name, goal, level, weeklyFrequency, preferredSports[], mood, records[] }
 */
export function saveManualProfile(userId, nextProfile) {
  if (!nextProfile || typeof nextProfile !== 'object') return;
  initUser(userId, typeof nextProfile.name === 'string' ? nextProfile.name : '运动用户');
  const allData = getAllData();
  const doc = allData[userId];
  ensureUserDocShape_(doc);

  const p = doc.manual_profile;
  if (typeof nextProfile.name === 'string') p.name = nextProfile.name;
  if (typeof nextProfile.goal === 'string') p.goal = nextProfile.goal;
  if (typeof nextProfile.level === 'string') p.level = nextProfile.level;
  if (Number.isFinite(nextProfile.weeklyFrequency)) {
    p.weeklyFrequency = Math.max(1, Math.min(7, nextProfile.weeklyFrequency));
  }
  if (Array.isArray(nextProfile.preferredSports)) p.preferredSports = nextProfile.preferredSports.slice();
  if (typeof nextProfile.mood === 'string') p.mood = nextProfile.mood;
  if (Array.isArray(nextProfile.records)) doc.manual_records = nextProfile.records.slice();

  // 手动昵称变更同步到主昵称（保持两个入口一致）
  if (p.name && !doc.nickname) doc.nickname = p.name;

  doc.last_updated = new Date().toISOString();
  saveAllData(allData);
}

/**
 * 追加一条手动训练记录（比整对象 setState 更高效，避免并发覆盖）
 * 返回更新后的 records 数组
 */
export function addManualRecord(userId, record) {
  if (!record || typeof record !== 'object') return [];
  const cur = getManualProfile(userId);
  const nextRecords = [
    { ...record, id: record.id || Date.now().toString(36) },
    ...cur.records,
  ];
  saveManualProfile(userId, { ...cur, records: nextRecords });
  return nextRecords;
}

/**
 * 删除一条手动训练记录
 */
export function deleteManualRecord(userId, recordId) {
  if (!recordId) return [];
  const cur = getManualProfile(userId);
  const nextRecords = cur.records.filter((r) => String(r.id) !== String(recordId));
  saveManualProfile(userId, { ...cur, records: nextRecords });
  return nextRecords;
}

/**
 * 合并式更新手动画像个别字段（用于 AI 对话记住的信息反向回灌，不覆盖其他字段）
 * 接受：{ name?, goal?, level?, weeklyFrequency?, preferredSports?: 追加|全量覆盖两种模式,
 *         mood?, records? }
 * - opts.mergePreferredSports = true 时，把传入 preferredSports 合并到集合而非覆盖
 */
export function patchManualProfile(userId, patch, opts = {}) {
  if (!patch || typeof patch !== 'object') return getManualProfile(userId);
  const cur = getManualProfile(userId);
  const merged = { ...cur };
  const keys = ['name', 'goal', 'level', 'weeklyFrequency', 'mood', 'records'];
  for (const k of keys) if (patch[k] !== undefined) merged[k] = patch[k];
  if (Array.isArray(patch.preferredSports)) {
    if (opts.mergePreferredSports) {
      const set = new Set([...(cur.preferredSports || [])]);
      for (const s of patch.preferredSports) if (s) set.add(String(s));
      merged.preferredSports = Array.from(set);
    } else {
      merged.preferredSports = patch.preferredSports.slice();
    }
  }
  saveManualProfile(userId, merged);
  return getManualProfile(userId);
}

/**
 * 重置手动画像为默认值（数据管理"清除所有数据"用）
 * 同时把旧版 dongzhi_profile 也清掉，避免下次再迁移回来
 */
export function resetManualProfile(userId) {
  initUser(userId, '运动用户');
  const allData = getAllData();
  const doc = allData[userId];
  doc.manual_profile = {
    name: DEFAULT_MANUAL_PROFILE.name,
    goal: DEFAULT_MANUAL_PROFILE.goal,
    level: DEFAULT_MANUAL_PROFILE.level,
    weeklyFrequency: DEFAULT_MANUAL_PROFILE.weeklyFrequency,
    preferredSports: DEFAULT_MANUAL_PROFILE.preferredSports.slice(),
    mood: DEFAULT_MANUAL_PROFILE.mood,
  };
  doc.manual_records = [];
  doc.last_updated = new Date().toISOString();
  saveAllData(allData);

  try {
    localStorage.removeItem(OLD_MANUAL_STORAGE_KEY);
  } catch {
    /* ignore */
  }
}

/**
 * 清除该用户的全部数据（"数据管理 → 清除所有数据"按钮用）
 * 覆盖范围：
 *   - 手动画像（manual_profile）+ 手动训练记录（manual_records）
 *   - 算法训练记录（training_record）
 *   - 对话特点抽取（chat_traits）
 *   - 自动画像（auto_profile：name/nickname/occupation/hobbies/goals/…/emotionLog/knownFacts）
 *   - 老版 schema 字段（action_habit / emotion_motivation / stage_target / coach_style）
 *   - 旧版 dongzhi_profile 迁移标记
 * 只保留 user_id / nickname(空) / created_at，其他全部置为初始默认值。
 * 调用方需额外负责：
 *   - 清 dongzhi_chat_sessions（ChatPage 的多会话存储，独立 key）
 *   - 调 coachEngine.resetSessionProfile()（教练引擎会话缓存）
 */
export function resetAllUserData(userId) {
  const allData = getAllData();
  if (!(userId in allData)) {
    // 用户不存在，直接建一份干净的文档即可
    initUser(userId, '');
    return;
  }

  const old = allData[userId];
  const freshDoc = {
    user_id: userId,
    nickname: '',
    coach_style: '',
    created_at: old.created_at || new Date().toISOString(),
    last_updated: new Date().toISOString(),
    training_record: [],
    action_habit: [],
    emotion_motivation: [],
    stage_target: [],
    chat_traits: {},
    manual_profile: {
      name: DEFAULT_MANUAL_PROFILE.name,
      goal: DEFAULT_MANUAL_PROFILE.goal,
      level: DEFAULT_MANUAL_PROFILE.level,
      weeklyFrequency: DEFAULT_MANUAL_PROFILE.weeklyFrequency,
      preferredSports: DEFAULT_MANUAL_PROFILE.preferredSports.slice(),
      mood: DEFAULT_MANUAL_PROFILE.mood,
    },
    manual_records: [],
    // auto_profile 的默认结构由 autoProfileExtractor.ensureShape 来补齐，
    // 这里先显式置空，确保下次读取一定触发重建，避免残留字段
    auto_profile: null,
  };

  allData[userId] = freshDoc;
  saveAllData(allData);

  try {
    localStorage.removeItem(OLD_MANUAL_STORAGE_KEY);
  } catch {
    /* ignore */
  }
}

// ========== 对话中记住用户特点（对接 AI 教练对话） ==========

/**
 * 特点分类与关键词规则（前端规则式抽取，无需后端）
 * key = 分类 id，value = { label, keywords[], priority }
 * priority 用于冲突消解（更高优先级的分类先匹配）
 */
const TRAIT_CATEGORIES = [
  {
    key: 'injury',
    label: '伤病情况',
    priority: 10,
    keywords: ['膝盖疼', '腰伤', '腰疼', '腰痛', '腰椎', '膝盖伤', '半月板', '十字韧带', '跟腱', '肩周炎', '肩伤', '手腕', '踝关节', '扭伤', '拉伤', '骨折', '椎间盘', '颈椎病', '旧伤', '受伤', '膝盖不好', '腰不好', '肩不好', '有伤'],
  },
  {
    key: 'equipment',
    label: '可用器械',
    priority: 9,
    keywords: ['只有哑铃', '只有杠铃', '只有弹力带', '家里练', '无器械', '徒手', '健身房', '有跑步机', '有椭圆机', '史密斯架', '龙门架'],
  },
  {
    key: 'goal',
    label: '训练目标',
    priority: 8,
    keywords: ['想增肌', '要增肌', '增肌为', '减脂', '减肥', '瘦', '塑形', '练出腹肌', '马甲线', '蜜桃臀', '力量举', '提高力量', '想变强', '比赛', '马拉松', '引体向上', '俯卧撑目标'],
  },
  {
    key: 'preference',
    label: '训练偏好',
    priority: 7,
    keywords: ['喜欢深蹲', '喜欢卧推', '喜欢跑步', '喜欢游泳', '不喜欢有氧', '讨厌有氧', '偏好自重', '偏好自由重量', '喜欢大重量', '喜欢轻重量', '喜欢hiit', '喜欢瑜伽', '喜欢打篮球'],
  },
  {
    key: 'schedule',
    label: '时间安排',
    priority: 6,
    keywords: ['早上练', '早晨训练', '晚上练', '晚上训练', '只能周末', '只有周末', '工作日没时间', '午休训练', '每天训练', '每周练', '一周练', '隔天训练'],
  },
  {
    key: 'coach_style',
    label: '教练风格偏好',
    priority: 5,
    keywords: ['严格一点', '严厉', '多鼓励我', '温柔点', '温柔一点', '幽默', '轻松的语气', '专业严谨', '骂醒我', '佛系', '别太啰嗦', '希望详细一点'],
  },
  {
    key: 'limitation',
    label: '身体限制',
    priority: 4,
    keywords: ['体重很大', '大体重', '体重偏轻', '偏瘦', '体态不好', '圆肩', '驼背', '高低肩', '骨盆前倾', '扁平足', '膝盖超伸', '柔韧性差', '关节活动度差', '平衡不好'],
  },
  {
    key: 'experience',
    label: '训练经验',
    priority: 3,
    keywords: ['健身小白', '刚健身', '刚开始', '新手', '练了一年', '练了两年', '练了三年', '多年经验', '老鸟', '有基础'],
  },
];

/**
 * 规则式抽取：从一段文本中识别可记住的特点
 * 返回新增特点列表 [{category, label, value}]
 */
export function extractTraitsFromText(text) {
  if (!text) return [];
  const lower = text.toLowerCase();
  const hits = [];

  for (const cat of TRAIT_CATEGORIES) {
    for (const kw of cat.keywords) {
      if (lower.includes(kw.toLowerCase())) {
        hits.push({
          category: cat.key,
          label: cat.label,
          value: kw,
        });
      }
    }
  }
  // 同分类去重（保留先匹配的）
  const seen = new Set();
  return hits.filter((h) => {
    const k = h.category + '|' + h.value;
    if (seen.has(k)) return false;
    seen.add(k);
    return true;
  });
}

/**
 * 把从对话中抽取的特点写入用户画像 chat_traits（去重合并）
 * 返回 { added: number, total: number } 便于上层提示用户
 */
export function saveChatTraits(userId, traits) {
  if (!traits || traits.length === 0) return { added: 0, total: 0 };
  const allData = getAllData();
  if (!(userId in allData)) initUser(userId, '运动用户');
  const userDoc = allData[userId];
  if (!userDoc.chat_traits) userDoc.chat_traits = {};

  let added = 0;
  for (const t of traits) {
    if (!userDoc.chat_traits[t.category]) {
      userDoc.chat_traits[t.category] = [];
    }
    const exists = userDoc.chat_traits[t.category].some((x) => x.value === t.value);
    if (!exists) {
      userDoc.chat_traits[t.category].push({
        label: t.label,
        value: t.value,
        source: 'chat',
        timestamp: new Date().toISOString(),
      });
      added += 1;
    }
  }
  userDoc.last_updated = new Date().toISOString();
  saveAllData(allData);

  const total = Object.values(userDoc.chat_traits).reduce((s, arr) => s + arr.length, 0);
  return { added, total };
}

/**
 * 综合入口：分析整轮对话（用户消息 + 助手回复）抽取并保存特点
 */
export function analyzeAndSaveTraitsFromTurn(userId, userText, assistantText = '') {
  const combined = (userText || '') + '\n' + (assistantText || '');
  const traits = extractTraitsFromText(combined);
  return saveChatTraits(userId, traits);
}

/**
 * 获取用户全部已记住的特点（用于设置页展示）
 */
export function getUserChatTraits(userId) {
  const allData = getAllData();
  if (!(userId in allData)) return {};
  const userDoc = allData[userId];
  return userDoc.chat_traits || {};
}

/**
 * 删除某一条特点
 */
export function removeChatTrait(userId, category, value) {
  const allData = getAllData();
  if (!(userId in allData)) return;
  const userDoc = allData[userId];
  if (userDoc.chat_traits && userDoc.chat_traits[category]) {
    userDoc.chat_traits[category] = userDoc.chat_traits[category].filter(
      (x) => x.value !== value
    );
    userDoc.last_updated = new Date().toISOString();
    saveAllData(allData);
  }
}

/**
 * 手动新增/更新一条特点（设置页手动编辑）
 */
export function addChatTrait(userId, category, value, label) {
  const traits = [{ category, label, value }];
  return saveChatTraits(userId, traits);
}

/**
 * 生成用户特点的文本摘要，可塞进 AI 教练请求的 prompt 中，
 * 让 AI 教练真正"记得"用户特点。
 */
export function generateTraitPromptContext(userId) {
  const traits = getUserChatTraits(userId);
  const summary = generateProfileSummary(userId, 'train');
  const parts = [];
  for (const [catKey, items] of Object.entries(traits)) {
    if (!items || items.length === 0) continue;
    const cat = TRAIT_CATEGORIES.find((c) => c.key === catKey);
    const label = cat ? cat.label : catKey;
    parts.push(`【${label}】` + items.map((i) => i.value).join('、'));
  }
  const header =
    '以下是当前用户的个人画像，回答问题时请结合这些特点给出个性化建议（如果不相关可忽略）：\n';
  return header + summary + (parts.length > 0 ? '\n' + parts.join('\n') : '');
}

/**
 * 返回分类元数据（供设置页分类标签展示）
 */
export function getTraitCategories() {
  return TRAIT_CATEGORIES.map((c) => ({ key: c.key, label: c.label }));
}
