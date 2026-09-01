// ============================================================
// 对话式自动画像抽取 + 持久化（dongzhi_user_data → auto_profile）
//
// 目标：用户与 AI 教练对话时，自动记录：
//   姓名 / 称呼 / 兴趣爱好 / 说话风格（表达偏好） / 健身目标
//   / 心情起伏（时间戳日志）/ 训练偏好 / 健康伤病禁忌 / 职业身份
//   / 日常作息 / 其他备注
//
// 触发策略（在 ChatPage 中由 onAssistantRespond sentinel 调用）：
//   1) 每 3 轮用户发言触发一次全量抽取 + 合并
//   2) 命中情绪关键词（detectEmotion/扩展词表）立即推一条 emotionLog
//   3) 命中身份/目标/伤病高置信词立即直接更新(即时写入)
//
// 合并策略（与 UserProfile 类似但更细）：
//   - 标量字段（name/nickname/speechStyle/goals/occupation/schedule）
//       新值非空 → 覆盖旧值
//   - 数组字段（hobbies/trainingPreferences/healthConstraints/notes/keywords）
//       追加 + 去重（最多保留 30 条）
//   - emotionLog：按 { timestamp, mood, keyword, context, score } push，
//       最多保留 60 条，超过后 truncate 旧的
//   - knownFacts：{ fact: string, source: string, updatedAt: ISO }
// ============================================================

import { getOrCreateUserId } from './userProfile.js';
import { extractTextFromMessage, detectEmotion } from './coach/userProfileChat.js';

const STORAGE_KEY = 'dongzhi_user_data';

// 从统一 userProfile 门面读训练概览/记录（动态 import 避免模块循环）
async function lazyGetTrainingStats(userId) {
  try {
    const mod = await import('./userProfile.js');
    const overview = typeof mod.getTrainingOverview === 'function'
      ? mod.getTrainingOverview(userId)
      : null;
    const recent = typeof mod.getRecentPerRepScores === 'function'
      ? mod.getRecentPerRepScores(userId, 30)
      : [];
    const errors = typeof mod.getRecurringErrors === 'function'
      ? mod.getRecurringErrors(userId, 1)
      : [];
    return { overview, recent, errors };
  } catch {
    return { overview: null, recent: [], errors: [] };
  }
}

const DEFAULT_AUTO_PROFILE = () => ({
  name: '',                 // 真实姓名（用户说"我叫张三"）
  nickname: '',             // 昵称/称呼（"叫我小张就行"）
  occupation: '',           // 职业 / 身份（学生/程序员/医生/健身教练等）
  hobbies: [],              // 兴趣爱好：跑步/篮球/游泳/瑜伽/爬山...
  speechStyle: '',          // 说话风格 / 表达偏好：通俗 / 简洁 / 详细 / 案例驱动 / 理论深入
  goals: '',                // 健身目标（阶段 + 长期合并: 减脂/增肌/康复/比赛备赛）
  trainingPreferences: [],  // 训练偏好：自重/器械/户外/健身房/晨练/夜练/上肢/下肢/核心
  healthConstraints: [],    // 健康禁忌 / 伤病：膝盖疼/腰突/哮喘/高血压/孕期/肩峰下撞击
  schedule: '',             // 日常作息/时间安排：晚上 8 点/周末才有空/工作日午休
  notes: [],                // 其他零散信息（逐条存数组，最多 30）
  keywords: [],             // 高频关注关键词：臀推/硬拉/跑步呼吸/半月板
  emotionLog: [],           // 心情起伏日志（最多 60 条）
  knownFacts: [],           // 已确认的事实（{fact, source, updatedAt}）
  // 训练状态数值（与“状态记录” tab 保持同步，由 syncTrainingStatsToAutoProfile / sentinel 末尾维护）
  stats: {
    totalRecords: 0,       // 算法训练段数
    totalReps: 0,          // 算法总动作次数
    avgScore: null,        // 平均评分
    latestScore: null,     // 最近一次动作得分
    latestDate: '',        // 最近一次评估日期
    scoreRangeMin: null,   // 逐动作得分最低
    scoreRangeMax: null,   // 逐动作得分最高
    actionTypes: [],       // 动作类型分布 [{name, count}]
    topErrors: [],         // 反复犯的毛病 [{name, severity, total}]
    updatedAt: null,       // 最近一次 stats 更新时间
  },
  updatedAt: null,          // 最近一次画像更新时间
  extractionCount: 0,       // 抽取统计：触发过多少次，便于调试/置信度
});

// 情绪映射 → score(-2~2) + 中文标签
const EMOTION_RULES = [
  { label: '😡 生气烦躁', score: -2, words: ['气死了', '火大', '烦死人了', '烦躁', '暴怒', '恼火', '真他妈烦'] },
  { label: '😩 压力很大', score: -2, words: ['压力好大', '压力大', '扛不住', '要崩', '崩溃', '喘不过气'] },
  { label: '😔 低落难过', score: -1, words: ['不开心', '心情不好', '郁闷', '难过', '伤心', '失落', '丧', '提不起劲'] },
  { label: '😮‍💨 疲惫倦怠', score: -1, words: ['好累', '太累', '疲惫', '累成狗', '累瘫', '不想动', '不想练', '累死了'] },
  { label: '😟 焦虑担忧', score: -1, words: ['焦虑', '担心', '发愁', '怕', '紧张', '慌', '忐忑'] },
  { label: '😐 平平', score: 0,  words: ['一般', '还好', '就那样', '凑合', '还行吧', '平平', '没什么'] },
  { label: '🙂 还不错', score: 1,  words: ['不错', '挺好', '还可以', '可以的', '舒服', '爽了', '舒服多了'] },
  { label: '😄 开心满足', score: 2,  words: ['开心', '高兴', '快乐', '棒', '超棒', '完美', '太好了', '激动', '爽', '舒服'] },
  { label: '💪 斗志昂扬', score: 2,  words: ['加油', '冲', '必胜', '斗志', '有动力', '打鸡血', '拼了', '充满干劲'] },
];

const MOOD_DETECT_EMERGENCY_WORDS = [
  ...new Set(EMOTION_RULES.flatMap((r) => r.words)),
  // 对原有 detectEmotion 做扩展
  '打鸡血', '冲鸭', '太棒了', '开心死了', '好开心', '不开心了', '郁闷死',
  '腰不行', '膝盖痛', '膝盖疼', '受伤', '拉伤', '扭伤', '复发',
];

// ---------- 存储助手 ----------
function readAll() {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    return raw ? JSON.parse(raw) : {};
  } catch { return {}; }
}
function writeAll(d) {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(d));
}

function ensureShape(userId) {
  const all = readAll();
  if (!(userId in all)) {
    all[userId] = {
      user_id: userId,
      nickname: '',
      coach_style: '',
      created_at: new Date().toISOString(),
      last_updated: new Date().toISOString(),
      training_record: [],
      action_habit: [],
      emotion_motivation: [],
      stage_target: [],
      chat_traits: {},
      manual_profile: null,
      manual_records: [],
    };
  }
  const doc = all[userId];
  if (!doc.auto_profile || typeof doc.auto_profile !== 'object') {
    doc.auto_profile = DEFAULT_AUTO_PROFILE();
  } else {
    const base = DEFAULT_AUTO_PROFILE();
    for (const k of Object.keys(base)) {
      if (!(k in doc.auto_profile)) {
        // stats 等对象字段需要深拷贝一份默认值，避免所有用户共享引用
        doc.auto_profile[k] = typeof base[k] === 'object' && base[k] !== null
          ? JSON.parse(JSON.stringify(base[k]))
          : base[k];
      }
    }
    // stats 对象字段补齐（向前兼容老数据，确保每个子键都有默认）
    if (typeof doc.auto_profile.stats !== 'object' || doc.auto_profile.stats === null) {
      doc.auto_profile.stats = JSON.parse(JSON.stringify(base.stats));
    } else {
      const baseStats = base.stats;
      for (const k of Object.keys(baseStats)) {
        if (!(k in doc.auto_profile.stats)) {
          doc.auto_profile.stats[k] = JSON.parse(JSON.stringify(baseStats[k]));
        }
      }
    }
    if (!Array.isArray(doc.auto_profile.hobbies)) doc.auto_profile.hobbies = [];
    if (!Array.isArray(doc.auto_profile.trainingPreferences)) doc.auto_profile.trainingPreferences = [];
    if (!Array.isArray(doc.auto_profile.healthConstraints)) doc.auto_profile.healthConstraints = [];
    if (!Array.isArray(doc.auto_profile.notes)) doc.auto_profile.notes = [];
    if (!Array.isArray(doc.auto_profile.keywords)) doc.auto_profile.keywords = [];
    if (!Array.isArray(doc.auto_profile.emotionLog)) doc.auto_profile.emotionLog = [];
    if (!Array.isArray(doc.auto_profile.knownFacts)) doc.auto_profile.knownFacts = [];
    if (!Array.isArray(doc.auto_profile.stats.actionTypes)) doc.auto_profile.stats.actionTypes = [];
    if (!Array.isArray(doc.auto_profile.stats.topErrors)) doc.auto_profile.stats.topErrors = [];
    if (!Number.isFinite(doc.auto_profile.extractionCount)) doc.auto_profile.extractionCount = 0;
  }
  writeAll(all);
  return [all, doc];
}

function saveAndBump(all, doc) {
  const now = new Date().toISOString();
  doc.last_updated = now;
  doc.auto_profile.updatedAt = now;
  // 双向同步：auto_profile.name/nickname → doc.nickname(manual_profile.nickname)
  if (!doc.nickname) {
    doc.nickname = doc.auto_profile.nickname || doc.auto_profile.name || '';
  }
  if (doc.manual_profile && !doc.manual_profile.name && (doc.auto_profile.name || doc.auto_profile.nickname)) {
    doc.manual_profile.name = doc.auto_profile.nickname || doc.auto_profile.name || '';
  }
  writeAll(all);
}

function pushUniq(arr, item, maxLen = 30) {
  if (!item || typeof item !== 'string') return false;
  const s = item.trim();
  if (!s) return false;
  if (arr.some((x) => typeof x === 'string' && x.toLowerCase() === s.toLowerCase())) return false;
  arr.push(s);
  while (arr.length > maxLen) arr.shift();
  return true;
}

function pushFact(knownFacts, fact, source = 'auto_extract') {
  if (!fact || typeof fact !== 'string') return false;
  const f = fact.trim();
  if (!f) return false;
  const idx = knownFacts.findIndex((x) => x.fact === f);
  const record = { fact: f, source, updatedAt: new Date().toISOString() };
  if (idx >= 0) knownFacts[idx] = record; else knownFacts.push(record);
  // facts 上限 40，避免无限增长
  while (knownFacts.length > 40) knownFacts.shift();
  return true;
}

// ---------- 抽取：姓名 / 称呼 / 职业 ----------
function extractIdentity(text) {
  const out = { name: '', nickname: '', occupation: '' };
  const t = text.replace(/\s+/g, ' ').trim();
  if (!t) return out;

  // 我叫 XXX / 我是 XXX(名字 2-4 字不含学生/教练) / 大家可以叫我 XXX
  let m = t.match(/我叫(.{1,12}?)(?:[，。！？!?.\s]|$)/);
  if (m) { out.name = m[1].trim(); }
  if (!out.name) {
    m = t.match(/名字是(.{1,12}?)(?:[，。！？!?.\s]|$)/);
    if (m) out.name = m[1].trim();
  }
  if (!out.name) {
    m = t.match(/我的名字叫(.{1,12}?)(?:[，。！？!?.\s]|$)/);
    if (m) out.name = m[1].trim();
  }

  m = t.match(/(?:大家|以后|你|你可以|请你)?(?:可以|就)?叫我(.{1,10}?)(?:[，。！？!?.\s]|$)/);
  if (m) { out.nickname = m[1].trim(); }
  if (!out.nickname) {
    m = t.match(/称呼我(.{1,10}?)(?:[，。！？!?.\s]|$)/);
    if (m) out.nickname = m[1].trim();
  }

  const occPatterns = [
    /我是(?:一名|一位|个)?([^，。！？!?.\s,]{1,14}?)(?:学生|教练|老师|医生|程序员|设计师|产品经理|运营|运动员|老师|宝妈|上班族|自由职业|健身教练|康复师|护士|工程师|研究生|本科生|博士|硕士|大一|大二|大三|大四|研一|研二|研三)/,
    /职业是(.{1,14}?)(?:[，。！？!?.\s]|$)/,
    /我做(.{1,14}?)(?:工作|行业|的|的呀|的哦|呢|哈)[，。！？!?.\s]/,
    /从事(.{1,14}?)(?:工作|行业)[，。！？!?.\s]/,
  ];
  for (const p of occPatterns) {
    const md = t.match(p);
    if (md) { out.occupation = (md[1] + (md[0].includes('学生') ? '学生' : md[0].includes('教练') ? '教练' : md[0].includes('研究生') ? '研究生' : md[0].includes('本科生') ? '本科生' : '')).trim() || md[1].trim(); break; }
  }
  // 兜底枚举
  if (!out.occupation) {
    const vocMap = [
      ['学生', ['本科生', '研究生', '大一', '大二', '大三', '大四', '研一', '研二', '研三', '硕士', '博士']],
      ['程序员/工程师', ['程序员', '开发', '工程师', '前端', '后端', '全栈', '写代码']],
      ['教练', ['健身教练', '教练', '体能教练']],
      ['医生/护士', ['医生', '护士', '康复师', '医学生']],
      ['老师', ['老师', '教师']],
      ['设计师', ['设计师', 'UI', '美工']],
      ['产品/运营', ['产品经理', '运营']],
      ['宝妈', ['宝妈', '孕', '产后']],
    ];
    for (const [label, words] of vocMap) {
      if (words.some((w) => t.includes(w))) { out.occupation = label; break; }
    }
  }
  // 清掉明显不是姓名的内容
  if (out.name && /^(你好|谢谢|您好|请问|我想|我要|请你|我不|我很|就是|名字|叫我|叫)/.test(out.name)) out.name = '';
  if (out.nickname && /^(你好|谢谢|您好|请问|我想|我要|请你|我不|我很|就是)/.test(out.nickname)) out.nickname = '';
  return out;
}

// ---------- 抽取：兴趣爱好 / 训练偏好 ----------
const HOBBY_KEYWORDS = [
  '跑步', '篮球', '足球', '羽毛球', '乒乓球', '网球', '游泳', '骑行', '自行车', '登山', '爬山',
  '徒步', '瑜伽', '普拉提', '拳击', '格斗', '泰拳', '跆拳道', '武术', '滑雪', '滑板', '冲浪',
  '跳绳', '街舞', '跳舞', '健身', '撸铁', '力量举', 'crossfit', 'CrossFit', '壶铃', '哑铃',
  '器械', '自重', '户外', '爬山', '划船', '高尔夫', '排球', '手球', '钓鱼',
];
const PREF_KEYWORDS = [
  '健身房', '居家', '家里练', '自重训练', '器械训练', '自由重量', '固定器械', '晨练', '早练',
  '午练', '午休', '夜练', '晚上练', '周末', '周一三五', '一周三练', '一周四练', '一周五练',
  '上肢', '下肢', '腿', '胸', '背', '肩', '核心', '臀', '功能性', '爆发力', '有氧', '无氧',
  '拉伸', '泡沫轴', '筋膜放松',
];
const GOAL_KEYWORDS = [
  ['减脂', ['减脂', '减肥', '瘦身', '瘦下来', '瘦大腿', '瘦肚子', '体重下降', '掉秤', '瘦']],
  ['增肌', ['增肌', '增重', '长肌肉', '壮一点', '练大', '练壮', '肌肥大']],
  ['塑形', ['塑形', '线条', '体态', '体态矫正', '圆肩', '驼背', '骨盆前倾']],
  ['备赛/比赛', ['比赛', '备赛', '运动会', '竞赛', '竞技', '马拉松', '半马', '全马']],
  ['康复训练', ['康复', '恢复训练', '术后康复', '伤后恢复', '损伤康复']],
  ['提升体能', ['体能', '耐力', '心肺', '力量', '爆发力', '身体素质']],
  ['健康生活', ['健康', '养生', '少生病', '作息', '减压', '运动习惯']],
];
const HEALTH_KEYWORDS = [
  '膝盖疼', '膝盖痛', '膝内扣', '髌骨', '半月板', '前叉', '十字韧带', 'ACL', '腰突', '腰椎间盘',
  '腰痛', '腰疼', '坐骨神经', '颈椎', '颈椎病', '肩峰', '肩袖', '肩伤', '网球肘', '高尔夫球肘',
  '跟腱', '足底筋膜炎', '扁平足', '哮喘', '高血压', '心脏病', '糖尿病', '孕期', '产后', '生理期',
  '血压高', '心律不齐', '过敏', '花粉症', '哮喘', '痛风', '脂肪肝', '受伤', '拉伤', '扭伤',
  '骨折', '软组织损伤', '旧伤', '复发',
];
const SCHEDULE_PATTERNS = [
  /(?:我一般|通常|平时|一般|我)(早上|上午|中午|下午|晚上|凌晨|周末|工作日|周六日|周一|周二|周三|周四|周五|周六|周日|早晨|傍晚|下班后|午休)(?:一般|通常|平时)?(?:会|就|都|喜欢|要|可以)?(?:有时间|有空|训练|锻炼|运动|去健身房|练)([^。！？!?.\n，,]{0,20})/,
  /时间一般是?(早上|上午|中午|下午|晚上|凌晨|周末|工作日|下班后|午休)/,
];

function findMatches(text, kws, maxPick = 6) {
  const hits = [];
  const lower = text.toLowerCase();
  for (const k of kws) {
    const kl = String(k).toLowerCase();
    if (lower.includes(kl) && !hits.some((h) => h === k)) hits.push(k);
    if (hits.length >= maxPick) break;
  }
  return hits;
}

function extractFromText(text) {
  const t = (typeof text === 'string' ? text : extractTextFromMessage(text)).trim();
  const patch = {};
  if (!t) return patch;

  // 身份
  const id = extractIdentity(t);
  if (id.name) patch.name = id.name;
  if (id.nickname) patch.nickname = id.nickname;
  if (id.occupation) patch.occupation = id.occupation;

  // 爱好（Hobby keywords）
  const hobbies = findMatches(t, HOBBY_KEYWORDS, 8);
  if (hobbies.length) patch.hobbies = hobbies;

  // 训练偏好
  const prefs = findMatches(t, PREF_KEYWORDS, 8);
  if (prefs.length) patch.trainingPreferences = prefs;

  // 健身目标
  const goals = [];
  for (const [label, words] of GOAL_KEYWORDS) {
    if (words.some((w) => t.includes(w))) goals.push(label);
  }
  if (goals.length) patch.goals = goals.join(' / ');

  // 健康禁忌
  const hc = findMatches(t, HEALTH_KEYWORDS, 10);
  if (hc.length) patch.healthConstraints = hc;

  // 作息
  for (const p of SCHEDULE_PATTERNS) {
    const m = t.match(p);
    if (m) { patch.schedule = (m[1] + (m[2] || '')).trim(); break; }
  }
  if (!patch.schedule) {
    const hint = ['下班后才有空', '只有周末有时间', '一般晚上练', '早上有空', '午休有空', '工作日晚上有时间',
      '周六日有空', '晚上 8 点', '晚上8点', '晚上 9 点', '晚上9点', '早上 6 点', '早上6点'];
    for (const h of hint) if (t.includes(h)) { patch.schedule = h; break; }
  }

  // 表达偏好（和 userProfileChat.js 原有一致，避免重复实现）
  if (['通俗易懂', '通俗', '大白话', '说人话', '别太专业', '简单说', '简单点说', '接地气', '通俗点'].some((k) => t.includes(k))) patch.speechStyle = '通俗';
  else if (['简洁', '简单', '简短', '干货', '少废话', '直说', '直截了当', '直接', '简练', '别啰嗦', '说重点'].some((k) => t.includes(k))) patch.speechStyle = '简洁';
  else if (['详细', '具体', '全面', '深入', '透彻', '多说点', '多讲点', '展开说', '详细点'].some((k) => t.includes(k))) patch.speechStyle = '详细';
  else if (['案例', '例子', '举例', '实际', '实战', '举个例子', '比如'].some((k) => t.includes(k))) patch.speechStyle = '案例驱动';
  else if (['分析', '理论', '原理', '机制', '底层', '本质'].some((k) => t.includes(k))) patch.speechStyle = '理论深入';

  return patch;
}

function detectEmergencyEmotion(text) {
  const t = (typeof text === 'string' ? text : extractTextFromMessage(text)).trim();
  if (!t) return null;
  for (const rule of EMOTION_RULES) {
    for (const w of rule.words) {
      if (t.includes(w)) {
        return { label: rule.label, score: rule.score, keyword: w };
      }
    }
  }
  return null;
}

// ---------- 对外：合并 patch 到存储（幂等）----------
function applyAutoProfilePatch(userId, patch, source = 'auto_extract') {
  if (!userId) userId = getOrCreateUserId();
  const [all, doc] = ensureShape(userId);
  const ap = doc.auto_profile;
  const changes = [];
  const changedArrays = [];

  for (const [k, v] of Object.entries(patch || {})) {
    if (v === undefined || v === null) continue;
    if (['hobbies', 'trainingPreferences', 'healthConstraints', 'notes', 'keywords'].includes(k)) {
      const arr = Array.isArray(v) ? v : [v];
      let any = false;
      for (const item of arr) if (pushUniq(ap[k], item, k === 'notes' ? 30 : 50)) any = true;
      if (any) changedArrays.push(k);
    } else if (k === 'emotion') {
      // 兼容：{ emotion: { label, score, keyword, context } }
      const ev = v;
      if (ev && typeof ev === 'object' && typeof ev.label === 'string') {
        ap.emotionLog.push({
          timestamp: new Date().toISOString(),
          mood: ev.label,
          score: typeof ev.score === 'number' ? ev.score : 0,
          keyword: ev.keyword || '',
          context: ev.context ? String(ev.context).slice(0, 80) : '',
        });
        while (ap.emotionLog.length > 60) ap.emotionLog.shift();
        changes.push({ field: 'emotion', value: `${ev.label}${ev.keyword ? '(' + ev.keyword + ')' : ''}` });
      }
    } else if (k === 'stats') {
      // stats：训练状态整体替换（对象字段合并式写入）
      if (v && typeof v === 'object') {
        const before = JSON.stringify(ap.stats);
        ap.stats = {
          ...JSON.parse(JSON.stringify(DEFAULT_AUTO_PROFILE().stats)),
          ...ap.stats,
          ...v,
          updatedAt: new Date().toISOString(),
        };
        const after = JSON.stringify(ap.stats);
        if (before !== after) {
          changes.push({ field: 'stats', value: `段数 ${ap.stats.totalRecords} / 均分 ${ap.stats.avgScore ?? '-'}` });
          // 动作类型与常犯毛病同步进 knownFacts 作为事实摘要（最多写一次，不重复）
          if (Array.isArray(ap.stats.actionTypes) && ap.stats.actionTypes.length > 0) {
            pushFact(
              ap.knownFacts,
              `动作类型分布：${ap.stats.actionTypes.map((x) => `${x.name}×${x.count}`).join('、')}`,
              'stats_sync',
            );
          }
          if (Array.isArray(ap.stats.topErrors) && ap.stats.topErrors.length > 0) {
            const top3 = ap.stats.topErrors.slice(0, 3);
            pushFact(
              ap.knownFacts,
              `常犯动作毛病 Top：${top3.map((x) => `${x.name}(${x.severity})`).join('、')}`,
              'stats_sync',
            );
          }
        }
      }
    } else {
      if (typeof v === 'string') {
        const s = v.trim();
        if (!s) continue;
        if (ap[k] !== s) {
          const old = ap[k];
          ap[k] = s;
          changes.push({ field: k, old, new: s });
          pushFact(ap.knownFacts, `${k}: ${s}`, source);
        }
      }
    }
  }
  changedArrays.forEach((k) => {
    changes.push({ field: k, value: `${ap[k].length} 项` });
    pushFact(ap.knownFacts, `${k}: ${ap[k].join('、')}`, source);
  });

  if (changes.length > 0) {
    ap.extractionCount = (ap.extractionCount || 0) + 1;
    saveAndBump(all, doc);
  }
  return { changed: changes.length > 0, changes, profile: JSON.parse(JSON.stringify(ap)) };
}

// ---------- 对外：取当前画像 ----------
export function loadAutoProfile(userId) {
  if (!userId) userId = getOrCreateUserId();
  const [, doc] = ensureShape(userId);
  return JSON.parse(JSON.stringify(doc.auto_profile));
}

// ---------- 对外：重置（只清自动画像，保留训练记录/手动数据）----------
export function resetAutoProfile(userId) {
  if (!userId) userId = getOrCreateUserId();
  const [all, doc] = ensureShape(userId);
  doc.auto_profile = DEFAULT_AUTO_PROFILE();
  saveAndBump(all, doc);
  return loadAutoProfile(userId);
}

// ---------- 对外：手动更新某个字段（Profile页用户手填）----------
export function updateAutoProfileField(userId, field, value) {
  if (!userId) userId = getOrCreateUserId();
  return applyAutoProfilePatch(userId, { [field]: value }, 'manual_edit');
}

// ---------- 对外：把训练状态（getTrainingOverview/recentScores/errors）同步进 auto_profile.stats ----------
// 返回 applyAutoProfilePatch 结果：{ changed, changes, profile }
export function syncTrainingStatsToAutoProfile(userId, training) {
  if (!userId) userId = getOrCreateUserId();
  const t = training || {};
  const overview = t.overview || null;
  const recent = Array.isArray(t.recent) ? t.recent : [];
  const errors = Array.isArray(t.errors) ? t.errors : [];

  const scoreRangeMin = recent.length > 0 ? Math.min(...recent.map((d) => d.score)) : null;
  const scoreRangeMax = recent.length > 0 ? Math.max(...recent.map((d) => d.score)) : null;
  const latest = recent.length > 0 ? recent[recent.length - 1] : null;

  const stats = {
    totalRecords: overview && Number.isFinite(overview.totalRecords) ? overview.totalRecords : 0,
    totalReps: overview && Number.isFinite(overview.totalReps) ? overview.totalReps : 0,
    avgScore: overview && overview.avgScore !== null && overview.avgScore !== undefined ? overview.avgScore : null,
    latestScore: latest ? latest.score : null,
    latestDate:
      (latest && (latest.date || latest.timestamp)) ||
      (overview && overview.latestDate) ||
      '',
    scoreRangeMin,
    scoreRangeMax,
    actionTypes: Array.isArray(overview && overview.actionTypes) ? overview.actionTypes.slice(0, 10) : [],
    topErrors: errors
      .slice(0, 6)
      .map((e) => ({ name: e.name, severity: e.severity || '轻度', total: Number.isFinite(e.total) ? e.total : 0 })),
    updatedAt: new Date().toISOString(),
  };

  return applyAutoProfilePatch(userId, { stats }, 'training_sync');
}

// ---------- 异步便捷版：无需调用方先读 userProfile，自己 lazy 拉取后再写 ----------
// 不阻塞调用链（用于 ChatPage sentinel 后“顺手同步”），返回 Promise<result>
export async function syncTrainingStatsToAutoProfileLazy(userId) {
  const { overview, recent, errors } = await lazyGetTrainingStats(userId || getOrCreateUserId());
  return syncTrainingStatsToAutoProfile(userId, { overview, recent, errors });
}

// ---------- 抽取 sentinel：每次对话轮次后调用 ----------
// isForced: 手动强制抽取（用于调试/点击"立即抽取"按钮）
// returns { changed, changes, profile, shouldToast: bool }
export function sentinelExtractFromTurn({
  userId,
  latestUserText,       // 最近一条用户发言原文
  turnNumber,            // 对话轮次（1 用户第一次说）
  history,               // 最近 N 条 [{role:'user'|'assistant', content:string}]
  isForced = false,
}) {
  if (!userId) userId = getOrCreateUserId();
  ensureShape(userId);
  const ctx = (latestUserText || '') + '\n' +
    (Array.isArray(history)
      ? history.slice(-12).map((m) => `${m.role === 'user' ? '用户' : '助手'}：${extractTextFromMessage(m.content)}`).join('\n')
      : '');

  const changes = [];
  let profile = null;

  // ① 情绪即时更新：有情绪词就打一条日志
  const emo = detectEmergencyEmotion(latestUserText)
    || (detectEmotion(latestUserText) ? { label: '😔 心情低落', score: -1, keyword: '情绪词' } : null);
  if (emo) {
    const r = applyAutoProfilePatch(userId, {
      emotion: { ...emo, context: (latestUserText || '').slice(0, 80) },
    }, 'emotion_extract');
    if (r.changed) changes.push(...r.changes);
    profile = r.profile;
  }

  // ② 高置信即时更新（不等待 3 轮）：身份/目标/伤病 只要出现就立即写入
  const quickPatch = {};
  const qp = extractFromText(latestUserText || '');
  for (const [k, v] of Object.entries(qp)) {
    if (['name', 'nickname', 'occupation', 'goals', 'healthConstraints'].includes(k)) {
      if (Array.isArray(v) ? v.length > 0 : !!v) quickPatch[k] = v;
    }
  }
  if (Object.keys(quickPatch).length > 0) {
    const r = applyAutoProfilePatch(userId, quickPatch, 'high_confidence');
    if (r.changed) changes.push(...r.changes);
    profile = profile || r.profile;
  }

  // ③ 每 3 轮 或 forced：基于近 12 条历史做全量扫描，补漏其他字段
  if (isForced || (Number.isFinite(turnNumber) && turnNumber > 0 && turnNumber % 3 === 0)) {
    const fullPatch = extractFromText(ctx);
    const r = applyAutoProfilePatch(userId, fullPatch, 'scheduled_extract');
    if (r.changed) changes.push(...r.changes);
    profile = profile || r.profile;
  }

  if (!profile) profile = loadAutoProfile(userId);

  // 去重 changes（按 field 去重，保留最新）
  const merged = new Map();
  for (const c of changes) {
    const key = c.field || JSON.stringify(c);
    merged.set(key, c);
  }
  const uniqueChanges = Array.from(merged.values());

  // shouldToast：只有当"有标量变动 + 至少一个数组/情绪变动"才弹，避免每次都弹造成骚扰
  const scalarChanged = uniqueChanges.some((c) => c.field && !['emotion', 'hobbies', 'trainingPreferences', 'healthConstraints', 'notes', 'keywords'].includes(c.field));
  const emotionChanged = uniqueChanges.some((c) => c.field === 'emotion');
  const arrayChanged = uniqueChanges.some((c) => ['hobbies', 'trainingPreferences', 'healthConstraints', 'notes', 'keywords'].includes(c.field));
  const shouldToast = isForced || scalarChanged || emotionChanged || (arrayChanged && turnNumber % 6 === 0);

  return { changed: uniqueChanges.length > 0, changes: uniqueChanges, profile, shouldToast };
}

// 让 userProfileChat 的表达偏好也能从这里读到：暴露 speechStyle 给 coachEngine
export function getSpeechStyleForCoach(userId) {
  try {
    const p = loadAutoProfile(userId);
    return p && p.speechStyle ? p.speechStyle : '';
  } catch {
    return '';
  }
}

// 一次性 API：简单判断要不要在当前消息立刻同步画像给 coachEngine（给意图路由用）
export function hasProfileUpdates(userId) {
  try {
    const p = loadAutoProfile(userId);
    return p.extractionCount > 0;
  } catch {
    return false;
  }
}
