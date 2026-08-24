// =============================================
// 对话画像管理 & 检测函数族（JS 移植版）
// 移植自 PythonApplication5.py 第 100~499、516~533、901~984 行
// =============================================

import { SPORTS_KEYWORDS } from './prompts.js';

// ---------- UserProfile 类 ----------
export class UserProfile {
  constructor() {
    this.reset();
  }

  reset() {
    this.data = {
      身份: null,
      研究方向: null,
      知识水平: null,
      阶段目标: null,
      表达偏好: null,
      历史摘要: [],
      修正历史: [],
    };
    this.version = 0;
    this.operation_history = [];
  }

  applyBatchUpdate(updates, isCorrection = false) {
    if (!updates || typeof updates !== 'object') return [false, []];
    const entries = Object.entries(updates);
    if (entries.length === 0) return [false, []];
    const oldData = this._deepCopy(this.data);
    const changes = [];
    for (const [field, newValue] of entries) {
      const oldValue = this.data[field];
      if (oldValue !== newValue) {
        changes.push({ field, old: oldValue, new: newValue });
        this.data[field] = newValue;
      }
    }
    if (changes.length === 0) return [false, []];
    this.operation_history.push({
      version: this.version,
      data_before: oldData,
      data_after: this._deepCopy(this.data),
      changes,
      is_correction: isCorrection,
    });
    this.version += 1;
    if (isCorrection) {
      for (const change of changes) {
        this.data['修正历史'].push({
          field: change.field,
          old: change.old,
          new: change.new,
          version: this.version,
        });
      }
    }
    return [true, changes];
  }

  get(field) {
    return this.data[field];
  }

  getFull() {
    return this._deepCopy(this.data);
  }

  getSummary() {
    const parts = [];
    if (this.data['身份']) parts.push(`身份：${this.data['身份']}`);
    if (this.data['研究方向']) parts.push(`研究方向：${this.data['研究方向']}`);
    if (this.data['知识水平']) parts.push(`知识水平：${this.data['知识水平']}`);
    if (this.data['阶段目标']) parts.push(`当前目标：${this.data['阶段目标']}`);
    if (this.data['表达偏好']) parts.push(`表达偏好：${this.data['表达偏好']}`);
    return parts.length > 0 ? parts.join(' | ') : '新用户，尚未建立画像';
  }

  toJson() {
    return JSON.stringify(this.data, null, 2);
  }

  rollback(steps = 1) {
    if (steps > this.operation_history.length) steps = this.operation_history.length;
    if (steps === 0) return null;
    const target = this.operation_history[this.operation_history.length - steps];
    this.data = this._deepCopy(target.data_before);
    this.operation_history = this.operation_history.slice(0, -steps);
    return target;
  }

  getHistoryCount() {
    return this.operation_history.length;
  }

  getLastOperationSummary() {
    if (this.operation_history.length === 0) return null;
    const last = this.operation_history[this.operation_history.length - 1];
    const changesDesc = last.changes.map((c) => `${c.field}: ${c.old} → ${c.new}`);
    return changesDesc.join('，');
  }

  _deepCopy(obj) {
    return JSON.parse(JSON.stringify(obj));
  }
}

// ---------- 辅助函数 ----------
export function extractTextFromMessage(msg) {
  if (msg === null || msg === undefined) return '';
  if (typeof msg === 'string') return msg;
  if (typeof msg === 'object') {
    if ('text' in msg) return String(msg.text);
    if ('content' in msg) return String(msg.content);
    const values = Object.values(msg);
    return values.length > 0 ? String(values[0]) : '';
  }
  if (Array.isArray(msg)) {
    if (msg.length === 0) return '';
    return extractTextFromMessage(msg[0]);
  }
  return String(msg);
}

export function inferKnowledgeLevelFromIdentity(identity) {
  if (!identity) return '初级';
  if (identity.includes('研究生')) return '高级';
  if (identity.includes('教练')) return '中级';
  if (identity.includes('本科生')) return '初级';
  return '初级';
}

// ---------- 身份声明检测 ----------
export function isIdentityDeclaration(msg) {
  const raw = typeof msg === 'string' ? msg : extractTextFromMessage(msg);
  const text = raw.trim();
  if (!text) return false;
  const correctionKws = ['之前说错', '其实', '更正', '纠正', '不是', '改为'];
  if (correctionKws.some((kw) => text.includes(kw))) return true;
  const declarationPatterns = [
    /^我是(.+?)/, /^我是一名(.+?)/, /^身份是(.+?)/, /^身份为(.+?)/,
    /^修改我的身份为(.+?)/, /^修改身份为(.+?)/, /^改为(.+?)身份/, /^改成(.+?)身份/,
    /^我的身份是(.+?)/, /^我今年(.+?)/, /^请记住(.+?)/, /^记住(.+?)/,
    /^我是(.+?)专业/, /^我是(.+?)方向/,
  ];
  if (declarationPatterns.some((p) => p.test(text))) return true;
  const gradeKws = ['大一', '大二', '大三', '大四', '本科', '研究生', '硕士', '博士', '研一', '研二', '研三'];
  if (text.includes('今年') && gradeKws.some((kw) => text.includes(kw))) return true;
  const identityKws = ['我是', '身份', '学生', '教练', '研究生', '本科生'];
  if (text.includes('请记住') && identityKws.some((kw) => text.includes(kw))) return true;
  if (/指导.*学生|教.*学生|带.*学生|训练.*学生|给.*学生|为.*学生/.test(text)) return false;
  if (/我是学生|我是个学生|我是一名学生/.test(text)) return true;
  return false;
}

// ---------- 研究方向检测 ----------
export function detectDirectionUpdate(message) {
  const msg = _lowerText(message);
  if (!msg) return null;
  const patterns = [
    /研究方向是(.+?)(?:，|,|。|！|？|的、|$|；|：)/,
    /研究方向为(.+?)(?:，|,|。|！|？|的、|$|；|：)/,
    /研究方向改成(.+?)(?:，|,|。|！|？|的、|$|；|：)/,
    /研究方向改为(.+?)(?:，|,|。|！|？|的、|$|；|：)/,
    /研究领域是(.+?)(?:，|,|。|！|？|的、|$|；|：)/,
    /研究领域为(.+?)(?:，|,|。|！|？|的、|$|；|：)/,
    /我的研究方向是(.+?)(?:，|,|。|！|？|的、|$|；|：)/,
    /我的研究方向为(.+?)(?:，|,|。|！|？|的、|$|；|：)/,
    /目前的研究方向是(.+?)(?:，|,|。|！|？|的、|$|；|：)/,
  ];
  for (const p of patterns) {
    const m = msg.match(p);
    if (m) {
      const t = (m[1] || '').trim();
      if (t && t.length > 1) return t;
    }
  }
  const implicit = [
    /研究(.+?)(?:，|,|。|！|？|的、|$|；|：)/,
    /专项(.+?)(?:，|,|。|！|？|的、|$|；|：)/,
  ];
  for (const p of implicit) {
    const m = msg.match(p);
    if (m) {
      const t = (m[1] || '').trim();
      if (t && t.length > 1) return t;
    }
  }
  for (const sport of SPORTS_KEYWORDS) {
    if (msg.includes(`研究${sport}`) || msg.includes(`研究 ${sport}`)) return sport;
    if (msg.includes(`专项${sport}`) || msg.includes(`专项 ${sport}`)) return sport;
  }
  return null;
}

// ---------- 知识水平检测 ----------
export function detectKnowledgeLevelUpdate(message) {
  const msg = _lowerText(message);
  if (!msg) return null;
  const patterns = [
    /知识水平是(.+?)(?:，|,|。|！|？|的|、|$|；|：)/,
    /知识水平为(.+?)(?:，|,|。|！|？|的|、|$|；|：)/,
    /知识水平改成(.+?)(?:，|,|。|！|？|的|、|$|；|：)/,
    /知识水平改为(.+?)(?:，|,|。|！|？|的|、|$|；|：)/,
    /知识水平调整(.+?)(?:，|,|。|！|？|的|、|$|；|：)/,
  ];
  for (const p of patterns) {
    const m = msg.match(p);
    if (m) {
      const t = (m[1] || '').trim();
      if (['初级', '基础', '入门', '新手'].some((k) => t.includes(k))) return '初级';
      if (['高级', '深入', '资深', '专家'].some((k) => t.includes(k))) return '高级';
      if (t.includes('中级')) return '中级';
    }
  }
  if (msg.includes('知识水平')) {
    if (msg.includes('初级') || msg.includes('基础')) return '初级';
    if (msg.includes('高级') || msg.includes('深入')) return '高级';
    if (msg.includes('中级')) return '中级';
  }
  return null;
}

// ---------- 阶段目标检测 ----------
export function detectStageGoalUpdate(message) {
  const msg = _lowerText(message);
  if (!msg) return null;
  const recommendKws = ['推荐', '建议', '给出', '提供', '推荐几个', '给几个', '有哪些', '适合'];
  if (recommendKws.some((k) => msg.includes(k))) {
    if (msg.includes('科研问题') || msg.includes('研究问题')) return null;
  }
  if (['考研', '考博', '升学', '复试', '上岸'].some((k) => msg.includes(k))) return '考研升学';
  if (['论文', '开题', '毕业', '写论文', '毕业论文', '期刊', '发表', '科研'].some((k) => msg.includes(k))) return '完成论文';
  if (['备赛', '比赛', '竞赛', '参赛', '运动会', '竞技'].some((k) => msg.includes(k))) return '备赛/训练';
  if (['找工作', '求职', '面试', '就业', '实习'].some((k) => msg.includes(k))) return '求职就业';
  if (['减肥', '减脂', '瘦身', '体重', '瘦'].some((k) => msg.includes(k))) return '减肥/减脂';
  if (['增肌', '增重', '肌肉', '壮'].some((k) => msg.includes(k))) return '增肌/增重';
  return null;
}

// ---------- 情绪检测 ----------
export function detectEmotion(message) {
  const msg = (typeof message === 'string' ? message : extractTextFromMessage(message)).trim();
  if (!msg) return false;
  const emotionKws = [
    '心情不好', '心情不号', '好累', '不想练', '很烦', '不开心',
    '郁闷', '难受', '辛苦', '压力大', '焦虑', '疲惫', '难过',
    '失落', '烦躁', '沮丧', '伤心', '累了', '烦死了', '不想动',
  ];
  return emotionKws.some((k) => msg.includes(k));
}

// ---------- 禁止性指令检测 ----------
export function detectForbiddenInstruction(message) {
  const msg = (typeof message === 'string' ? message : extractTextFromMessage(message)).trim();
  if (!msg) return null;
  if (/不要.*计划|不要.*安排|不要.*建议|别.*计划|别.*安排|停止.*计划|取消.*计划/.test(msg)) return '计划';
  if (/不要.*分析|不要.*评估|别.*分析|不需要.*分析/.test(msg)) return '分析';
  if (/不要说.*多|不要讲.*多|别.*详细/.test(msg)) return '详细';
  return null;
}

// ---------- 模糊意图检测 ----------
export function detectVagueIntent(message) {
  const msg = (typeof message === 'string' ? message : extractTextFromMessage(message)).trim();
  if (!msg) return true;
  if (detectEmotion(message)) return false;
  const lower = msg.toLowerCase();
  const vagueSingle = ['跑步', '深蹲', '俯卧撑', '引体向上', '卧推', '硬拉', '举重', '游泳', '跳绳', '波比跳'];
  if (vagueSingle.includes(msg) || vagueSingle.includes(lower)) return true;
  if (msg.length <= 3) return true;
  const nonsense = ['苹果', '飞机', '书本', '桌子', '椅子', '电脑', '手机', '天气', '吃饭'];
  if (nonsense.some((k) => msg.includes(k)) && msg.length < 10) return true;
  if (['跑步', '深蹲', '跳', '举', '拉', '推'].some((k) => msg.includes(k))) {
    if (!['怎么', '如何', '什么', '哪些', '?', '？', '好吗', '怎么办', '怎样', '为何', '是不是', '能不能', '要不要', '可以'].some((k) => msg.includes(k))) {
      if (msg.length < 15) return true;
    }
  }
  return false;
}

// ---------- 澄清响应 ----------
export function getClarificationResponse(rawText) {
  if (!rawText || rawText.trim() === '') {
    return '没太理解你的意思。你是想让我看一段视频、问一个动作原理，还是聊聊你的训练安排？';
  }
  const lower = rawText.toLowerCase();
  if (lower.includes('跑步')) return '你是想了解跑步技术、训练计划，还是损伤预防？';
  if (lower.includes('深蹲')) return '你是想问深蹲的动作技巧、原理知识，还是上传视频让我分析？';
  if (lower.includes('俯卧撑')) return '你是想问俯卧撑的动作技巧、训练计划，还是上肢力量提升方法？';
  if (['苹果', '飞机', '书本', '桌子', '椅子'].some((k) => lower.includes(k))) {
    return '我没太理解你的意思。你是想让我看一段视频、问一个动作原理，还是聊聊你的训练安排？';
  }
  return '我没太理解你的意思。你是想让我看一段视频、问一个动作原理，还是聊聊你的训练安排？';
}

// ---------- 查看画像命令 ----------
export function isViewProfileCommand(text) {
  if (!text) return false;
  const t = typeof text === 'string' ? text : extractTextFromMessage(text);
  const cleaned = t.replace(/[\s\n\r\t，,、。.？?！!；;：:"''（）()]/g, '');
  if (!cleaned) return false;
  const patterns = [
    '查看我的画像', '查看我的档案', '我的画像', '我的档案',
    '查看画像', '查看档案', '看画像', '看档案', '显示画像', '显示档案',
  ];
  if (patterns.some((p) => cleaned.includes(p))) return true;
  if ((cleaned.includes('画像') || cleaned.includes('档案'))
    && (cleaned.includes('查看') || cleaned.includes('看') || cleaned.includes('显示') || cleaned.includes('我的'))) {
    return true;
  }
  return false;
}

// ---------- 综合画像更新检测 ----------
export function detectAllUpdates(message) {
  const msg = _lowerText(message);
  const updates = {};
  let identityText = null;
  const isCorrection = ['之前说错', '其实', '更正', '纠正', '不是', '改为'].some((k) => msg.includes(k));

  if (isCorrection) {
    const corrPatterns = [
      /其实我是(.+?)(?:，|,|。|！|？|的|、|$|；|：)/,
      /其实是(.+?)(?:，|,|。|！|？|的|、|$|；|：)/,
      /我是(.+?)(?:，|,|。|！|？|的|、|$|；|：)/,
      /改为(.+?)(?:，|,|。|！|？|的|、|$|；|：)/,
      /改成(.+?)(?:，|,|。|！|？|的|、|$|；|：)/,
      /身份为(.+?)(?:，|,|。|！|？|的|、|$|；|：)/,
      /身份是(.+?)(?:，|,|。|！|？|的|、|$|；|：)/,
    ];
    for (const p of corrPatterns) {
      const m = msg.match(p);
      if (m) { identityText = (m[1] || '').trim(); break; }
    }
  } else if (isIdentityDeclaration(msg)) {
    const identPatterns = [
      /我是(.+?)(?:，|,|。|！|？|的|、|$|；|：)/,
      /身份是(.+?)(?:，|,|。|！|？|的|、|$|；|：)/,
      /身份为(.+?)(?:，|,|。|！|？|的|、|$|；|：)/,
      /修改我的身份为(.+?)(?:，|,|。|！|？|的|、|$|；|：)/,
      /修改身份为(.+?)(?:，|,|。|！|？|的|、|$|；|：)/,
      /改为(.+?)(?:身份|学生|教练|研究生|本科生|大一|大二|大三|大四)/,
      /改成(.+?)(?:身份|学生|教练|研究生|本科生|大一|大二|大三|大四)/,
      /我是个(.+?)(?:，|,|。|！|？|的|、|$|；|：)/,
      /我的身份是(.+?)(?:，|,|。|！|？|的|、|$|；|：)/,
      /我今年(.+?)(?:，|,|。|！|？|的|、|$|；|：)/,
      /请记住我是(.+?)(?:，|,|。|！|？|的|、|$|；|：)/,
      /请记住，我是(.+?)(?:，|,|。|！|？|的|、|$|；|：)/,
      /我是(.+?)专业(?:，|,|。|！|？|的|、|$|；|：)/,
    ];
    for (const p of identPatterns) {
      const m = msg.match(p);
      if (m) { identityText = (m[1] || '').trim(); break; }
    }
    if (!identityText) {
      const gradeKws = ['大一', '大二', '大三', '大四', '本科', '研究生', '硕士', '博士', '研一', '研二', '研三'];
      for (const g of gradeKws) {
        if (msg.includes(g)) {
          if (['本科', '大一', '大二', '大三', '大四'].some((k) => msg.includes(k))) identityText = '本科生';
          else if (['研究生', '硕士', '博士', '研一', '研二', '研三'].some((k) => msg.includes(k))) identityText = '研究生';
          break;
        }
      }
    }
  }

  if (identityText) {
    if (identityText.includes('教练')) updates['身份'] = identityText;
    else if (['研究生', '硕士', '博士', '研一', '研二', '研三'].some((k) => identityText.includes(k))) updates['身份'] = '研究生';
    else if (['本科', '大一', '大二', '大三', '大四', '学生'].some((k) => identityText.includes(k))) updates['身份'] = '本科生';
    else {
      if (['研究生', '硕士', '博士'].some((k) => identityText.includes(k))) updates['身份'] = '研究生';
      else if (['本科生', '本科', '学生'].some((k) => identityText.includes(k))) updates['身份'] = '本科生';
      else if (identityText.includes('教练')) updates['身份'] = '教练';
    }
    if (updates['身份']) {
      updates['知识水平'] = inferKnowledgeLevelFromIdentity(updates['身份']);
    }
  }

  if (!('知识水平' in updates)) {
    const kl = detectKnowledgeLevelUpdate(message);
    if (kl) updates['知识水平'] = kl;
  }
  const dir = detectDirectionUpdate(message);
  if (dir) updates['研究方向'] = dir;
  const sg = detectStageGoalUpdate(message);
  if (sg) updates['阶段目标'] = sg;
  return updates;
}

// ---------- 兜底身份提取 ----------
export function detectIdentityExtraction(message, profile) {
  const extracted = {};
  const msg = _lowerText(message);
  if (!isIdentityDeclaration(msg)) return extracted;
  let newIdentity = null;
  let identityText = null;

  const identPatterns = [
    /我是(.+?)(?:，|,|。|！|？|的|、|$|；|：)/,
    /身份是(.+?)(?:，|,|。|！|？|的|、|$|；|：)/,
    /身份为(.+?)(?:，|,|。|！|？|的|、|$|；|：)/,
    /修改我的身份为(.+?)(?:，|,|。|！|？|的|、|$|；|：)/,
    /修改身份为(.+?)(?:，|,|。|！|？|的|、|$|；|：)/,
    /改为(.+?)(?:身份|学生|教练|研究生|本科生|大一|大二|大三|大四)/,
    /改成(.+?)(?:身份|学生|教练|研究生|本科生|大一|大二|大三|大四)/,
    /我是个(.+?)(?:，|,|。|！|？|的|、|$|；|：)/,
    /我的身份是(.+?)(?:，|,|。|！|？|的|、|$|；|：)/,
    /我今年(.+?)(?:，|,|。|！|？|的|、|$|；|：)/,
    /请记住我是(.+?)(?:，|,|。|！|？|的|、|$|；|：)/,
    /请记住，我是(.+?)(?:，|,|。|！|？|的|、|$|；|：)/,
  ];
  for (const p of identPatterns) {
    const m = msg.match(p);
    if (m) { identityText = (m[1] || '').trim(); break; }
  }
  if (!identityText) {
    const gradeKws = ['大一', '大二', '大三', '大四', '本科', '研究生', '硕士', '博士', '研一', '研二', '研三'];
    for (const g of gradeKws) {
      if (msg.includes(g)) {
        if (['本科', '大一', '大二', '大三', '大四'].some((k) => msg.includes(k))) identityText = '本科生';
        else if (['研究生', '硕士', '博士', '研一', '研二', '研三'].some((k) => msg.includes(k))) identityText = '研究生';
        break;
      }
    }
  }

  if (['研究生', '硕士', '博士', '研一', '研二', '研三'].some((k) => msg.includes(k))) newIdentity = '研究生';
  else if (['教练', '带学生', '带队', '训练安排'].some((k) => msg.includes(k))) newIdentity = '教练';
  else if (['本科生', '本科', '大一', '大二', '大三', '大四', '体育教育', '体育专业', '体育生', '学生'].some((k) => msg.includes(k))) newIdentity = '本科生';

  if (identityText && !newIdentity) {
    if (identityText.includes('教练')) {
      if (['体能', '田径', '游泳'].some((k) => identityText.includes(k))) newIdentity = identityText;
      else newIdentity = '教练';
    } else if (['研究生', '硕士', '博士', '研一', '研二', '研三'].some((k) => identityText.includes(k))) newIdentity = '研究生';
    else if (['本科', '大一', '大二', '大三', '大四', '学生'].some((k) => identityText.includes(k))) newIdentity = '本科生';
  }

  let directionFromText = null;
  if (identityText) {
    for (const kw of SPORTS_KEYWORDS) {
      if (identityText.includes(kw)) { directionFromText = kw; break; }
    }
  }
  if (msg.includes('研究') || msg.includes('方向') || msg.includes('专项')) {
    for (const kw of SPORTS_KEYWORDS) {
      if (msg.includes(kw)) { extracted['研究方向'] = kw; break; }
    }
  } else if (directionFromText) {
    extracted['研究方向'] = directionFromText;
  }
  if (newIdentity) {
    extracted['身份'] = newIdentity;
    extracted['知识水平'] = inferKnowledgeLevelFromIdentity(newIdentity);
  }
  if (['通俗易懂', '通俗', '大白话', '说人话', '别太专业', '简单说', '简单点说', '接地气', '通俗点'].some((k) => msg.includes(k))) {
    extracted['表达偏好'] = '通俗';
  } else if (['简洁', '简单', '简短', '干货', '少废话', '直说', '直截了当', '直接', '简练', '别啰嗦', '说重点'].some((k) => msg.includes(k))) {
    extracted['表达偏好'] = '简洁';
  } else if (['详细', '具体', '全面', '深入', '透彻', '多说点', '多讲点', '展开说', '详细点'].some((k) => msg.includes(k))) {
    extracted['表达偏好'] = '详细';
  } else if (['案例', '例子', '举例', '实际', '实战', '举个例子', '比如'].some((k) => msg.includes(k))) {
    extracted['表达偏好'] = '案例驱动';
  } else if (['分析', '理论', '原理', '机制', '底层', '本质'].some((k) => msg.includes(k))) {
    extracted['表达偏好'] = '理论深入';
  }

  for (const key of Object.keys(extracted)) {
    if (profile.get(key) === extracted[key]) delete extracted[key];
  }
  return extracted;
}

// ---------- internal ----------
function _lowerText(message) {
  if (message && typeof message === 'object' && 'text' in message) {
    return String(message.text || '').toLowerCase();
  }
  return String(message || '').toLowerCase();
}
