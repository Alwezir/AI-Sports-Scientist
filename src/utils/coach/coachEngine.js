// =============================================
// AI 教练核心响应引擎（JS 移植版）
// 移植自 PythonApplication5.py 第 541~895 行（call_knowledge_base / normal_mode_response / respond）
//
// 与原 Python 版的差异：
//   1. API 配置从 import.meta.env 读取（复用 profileApi.js 中已有的 VITE_COACH_* 变量）
//   2. 前端无法实现真正的 Python generator 流式，改为 Promise<string> 一次返回
//   3. files/图片上传走 base64 内联（与原 Python encode_image_to_base64 等价）
//   4. 用户画像使用 session 内单例，与 localStorage 中的 dongzhi_user_data 双向补充
// =============================================

import { SYSTEM_PROMPT_BASE, KNOWLEDGE_LEVEL_SPECS } from './prompts.js';
import {
  UserProfile,
  extractTextFromMessage,
  detectEmotion,
  detectForbiddenInstruction,
  detectAllUpdates,
  detectIdentityExtraction,
  detectVagueIntent,
  getClarificationResponse,
  isViewProfileCommand,
} from './userProfileChat.js';

// ---------- 配置（对齐现有 profileApi.js 的 env 变量体系） ----------
const IS_DEV = import.meta.env.DEV;
const COACH_APP_ID = import.meta.env.VITE_COACH_APP_ID || '';
const COACH_API_KEY = import.meta.env.VITE_COACH_API_KEY || '';
const COACH_API_BASE = (import.meta.env.VITE_COACH_API_BASE || '/coach-api').replace(/\/$/, '');
const COACH_API_TARGET = import.meta.env.VITE_COACH_API_TARGET || 'https://dashscope.aliyuncs.com';
// 普通模式（Chat Completions）所需的模型名，来自 Python 版 MODEL_NAME = "qwen-vl-plus"
const VL_MODEL_NAME = import.meta.env.VITE_COACH_VL_MODEL || 'qwen-vl-plus';
// 与 Python 版 BASE_URL 相同作用：兼容模式 v1 chat completions 地址
const COMPATIBLE_V1_BASE = (import.meta.env.VITE_COACH_VL_BASE || '').replace(/\/$/, '')
  || (IS_DEV ? '/coach-vl-api' : COACH_API_BASE); // 生产环境若无独立 VL_BASE，复用 coach API Base

function _isAbsolute(url) { return /^https?:\/\//i.test(url); }

// ---------- 画像单例（一次会话一个，刷新重置；与 dongzhi_user_data 通过 ProfilePage 互不冲突） ----------
let _profileInstance = null;
function getSessionProfile() {
  if (!_profileInstance) _profileInstance = new UserProfile();
  return _profileInstance;
}
export function resetSessionProfile() { _profileInstance = null; }

// ---------- 底层 HTTP 助手 ----------
async function _jsonRequest(url, options = {}) {
  const headers = { 'Content-Type': 'application/json', ...(options.headers || {}) };
  const res = await fetch(url, { ...options, headers });
  if (!res.ok) {
    let detail = '';
    try {
      const body = await res.json();
      detail = body.message || body.detail || body.code || '';
    } catch {
      detail = await res.text().catch(() => '');
    }
    const err = new Error(detail || `HTTP ${res.status}`);
    err.status = res.status;
    throw err;
  }
  return res.json();
}

function _coachHeaders(extra = {}) {
  const out = { ...extra };
  if (IS_DEV) return out; // 开发时走 vite dev server proxy（在 vite.config.ts 已注入 Authorization）
  if (COACH_API_KEY) out['Authorization'] = `Bearer ${COACH_API_KEY}`;
  return out;
}

// ---------- 知识库调用：百炼 Application.completion（对应 call_knowledge_base） ----------
async function callKnowledgeBase(prompt, systemPrompt, history) {
  if (!COACH_APP_ID) return null;
  const parts = [systemPrompt, ''];
  if (Array.isArray(history) && history.length > 0) {
    parts.push('【对话历史】');
    const recent = history.slice(-3);
    for (const item of recent) {
      const u = extractTextFromMessage(Array.isArray(item) ? item[0] : (item.role === 'user' ? item.content : ''));
      const a = extractTextFromMessage(Array.isArray(item) ? item[1] : (item.role === 'assistant' ? item.content : ''));
      if (u) parts.push(`用户：${u}`);
      if (a) parts.push(`助手：${a}`);
    }
    parts.push('');
  }
  parts.push(`【用户当前问题】\n${prompt}`);
  const finalPrompt = parts.join('\n');
  try {
    const appId = encodeURIComponent(COACH_APP_ID);
    let url;
    const hasWorker = _isAbsolute(COACH_API_BASE);
    if (IS_DEV) {
      url = `/coach-api/apps/${appId}/completion`;
    } else if (hasWorker) {
      url = `${COACH_API_BASE}/apps/${appId}/completion`;
    } else if (COACH_API_KEY) {
      url = `${COACH_API_TARGET}/api/v1/apps/${appId}/completion`;
    } else {
      return null;
    }
    const json = await _jsonRequest(url, {
      method: 'POST',
      body: JSON.stringify({ input: { prompt: finalPrompt }, parameters: {} }),
      headers: _coachHeaders(),
    });
    const text = json?.output?.text
      || json?.output?.choices?.[0]?.message?.content
      || json?.output?.choices?.[0]?.text
      || json?.text
      || json?.message
      || '';
    return text && text.trim() ? text : null;
  } catch (e) {
    console.warn('[coachEngine] callKnowledgeBase error:', e);
    return null;
  }
}

// ---------- 普通模式：Chat Completions（对应 normal_mode_response） ----------
async function callNormalMode({ rawText, files, systemContent, history, prefixMsg }) {
  // 1. 构建 messages（system + 历史 + user）
  const messages = [{ role: 'system', content: systemContent }];
  for (const item of history) {
    if (item && typeof item === 'object' && item.role) {
      const text = extractTextFromMessage(item.content);
      if (!text) continue;
      if (item.role === 'user') messages.push({ role: 'user', content: text });
      else if (item.role === 'assistant') messages.push({ role: 'assistant', content: text });
    } else if (Array.isArray(item) && item.length >= 2) {
      const u = extractTextFromMessage(item[0]);
      const a = extractTextFromMessage(item[1]);
      if (u) messages.push({ role: 'user', content: u });
      if (a) messages.push({ role: 'assistant', content: a });
    }
  }
  // 2. user content：text + 图片 base64（files 是 File[] 或 base64 url 数组）
  const userContent = [];
  if (rawText && rawText.trim()) {
    userContent.push({ type: 'text', text: rawText });
  }
  if (Array.isArray(files)) {
    for (const f of files) {
      const dataUrl = await _normalizeFileToDataUrl(f);
      if (dataUrl) userContent.push({ type: 'image_url', image_url: { url: dataUrl } });
    }
  }
  if (userContent.length === 0) {
    return '⚠️ 请至少输入文字或上传一张图片。';
  }
  messages.push({ role: 'user', content: userContent });

  // 3. 调用 Chat Completions 接口（OpenAI 兼容）
  const hasAbsoluteBase = _isAbsolute(COMPATIBLE_V1_BASE);
  let apiUrl;
  if (IS_DEV) {
    apiUrl = `${COMPATIBLE_V1_BASE}/chat/completions`;
  } else if (hasAbsoluteBase) {
    apiUrl = `${COMPATIBLE_V1_BASE}/chat/completions`;
  } else if (COACH_API_KEY) {
    // 兼容：如果 COACH_API_BASE 本身就是绝对地址，就用它；否则回落到 dashscope 兼容模式 v1
    const fallbackBase = _isAbsolute(COACH_API_BASE) ? COACH_API_BASE : COACH_API_TARGET.replace(/\/api\/v1$/, '') + '/compatible-mode/v1';
    apiUrl = `${fallbackBase}/chat/completions`;
  } else {
    // 没有 VL 路由的兜底：回退用知识库接口（Application）再试一次
    const fallback = await callKnowledgeBase(rawText, systemContent, history);
    if (fallback) return (prefixMsg || '') + fallback;
    throw new Error('AI 教练暂未配置 VITE_COACH_API_KEY / VITE_COACH_VL_BASE');
  }

  const payload = {
    model: VL_MODEL_NAME,
    messages,
    temperature: 0.7,
    stream: false,
  };

  // 最多重试 2 次
  let lastErr = null;
  for (let attempt = 0; attempt <= 2; attempt += 1) {
    try {
      const json = await _jsonRequest(apiUrl, {
        method: 'POST',
        body: JSON.stringify(payload),
        headers: _coachHeaders(),
      });
      const content = json?.choices?.[0]?.message?.content || json?.choices?.[0]?.text || json?.output?.text || '';
      if (content && content.trim()) return (prefixMsg || '') + content;
      lastErr = new Error('响应为空');
    } catch (e) {
      lastErr = e;
    }
    if (attempt < 2) await new Promise((r) => setTimeout(r, 1500));
  }
  throw lastErr || new Error('AI 教练服务无响应');
}

async function _normalizeFileToDataUrl(file) {
  if (!file) return null;
  // 已经是 data url
  if (typeof file === 'string' && file.startsWith('data:')) return file;
  // File / Blob
  if (typeof File !== 'undefined' && file instanceof File) {
    return new Promise((resolve) => {
      const reader = new FileReader();
      reader.onload = () => resolve(reader.result || null);
      reader.onerror = () => resolve(null);
      reader.readAsDataURL(file);
    });
  }
  return null;
}

// ---------- 主响应流程（对应 Python 版 respond()） ----------
// 返回 Promise<{ reply: string, updateNotice: string | null }>
//   reply:         AI 最终答复（含可能的画像更新确认前缀）
//   updateNotice:  如需让 UI toast 单独显示"已更新画像…"，这里返回对应文案
export async function respond({ text, history, files, profileSummaryText }) {
  const profile = getSessionProfile();
  const rawText = String(text || '').trim();
  const fileList = Array.isArray(files) ? files : [];

  // --- 1. 查看画像命令 ---
  if (isViewProfileCommand(rawText)) {
    return { reply: '```json\n' + profile.toJson() + '\n```', updateNotice: null };
  }

  // --- 2. 撤回修改 ---
  if (rawText.includes('撤回') && rawText.includes('修改')) {
    const count = profile.getHistoryCount();
    if (count === 0) return { reply: '⚠️ 没有可撤回的修改记录。', updateNotice: null };
    const result = profile.rollback(1);
    if (result) {
      const changesDesc = result.changes.map((c) => `${c.field}: ${c.old} → ${c.new}`).join('，');
      return { reply: `✅ 已撤回上一次操作（${changesDesc}）\n\n当前画像已恢复。`, updateNotice: null };
    }
    return { reply: '⚠️ 没有可撤回的修改记录。', updateNotice: null };
  }

  // --- 3. 判断上一轮是否为澄清（避免重复兜底） ---
  let lastAssistantMsg = '';
  if (Array.isArray(history) && history.length > 0) {
    const last = history[history.length - 1];
    if (Array.isArray(last) && last.length >= 2) lastAssistantMsg = String(last[1] || '');
    else if (last && typeof last === 'object') {
      if (last.role === 'assistant') lastAssistantMsg = String(last.content || '');
    } else if (typeof last === 'string') lastAssistantMsg = last;
  }
  const clarificationKws = ['你是想了解', '你是想问', '我没太理解', '你想问', '你是想让我看'];
  const isPrevClarification = clarificationKws.some((k) => lastAssistantMsg.includes(k));

  // --- 4. 情绪检测 ---
  const isEmotion = detectEmotion(rawText);

  // --- 5. 模糊意图 / 澄清（非情绪、非紧接澄清时触发） ---
  if (!isEmotion && !isPrevClarification && detectVagueIntent(rawText)) {
    return { reply: '💡 ' + getClarificationResponse(rawText), updateNotice: null };
  }

  // --- 6. 禁止性指令 ---
  const forbiddenType = detectForbiddenInstruction(rawText);
  let forbiddenInstruction = '';
  if (forbiddenType === '计划') forbiddenInstruction = '⚠️ 用户刚才明确要求不要提供训练计划。请不要在回答中给出任何组数、次数、动作安排或训练方案。';
  else if (forbiddenType === '分析') forbiddenInstruction = '⚠️ 用户刚才明确要求不要进行分析或评估。请切换到日常对话模式，简单回应即可。';
  else if (forbiddenType === '详细') forbiddenInstruction = '⚠️ 用户刚才明确要求不要讲太详细。请保持回答简短，直接给结论。';

  // --- 7. 检测画像更新并应用 ---
  const allUpdates = detectAllUpdates(rawText);
  let updateConfirmation = '';
  if (Object.keys(allUpdates).length > 0) {
    const changedUpdates = {};
    for (const [field, newVal] of Object.entries(allUpdates)) {
      if (profile.get(field) !== newVal) changedUpdates[field] = newVal;
    }
    if (Object.keys(changedUpdates).length > 0) {
      const [changed, changes] = profile.applyBatchUpdate(changedUpdates, false);
      if (changed) {
        const parts = changes.map((c) => `${c.field} 从「${c.old}」修改为「${c.new}」`);
        updateConfirmation = `✅ 已更新画像：${parts.join('，')}\n\n`;
      }
    } else {
      const existing = Object.entries(allUpdates)
        .filter(([field, val]) => profile.get(field) === val)
        .map(([field, val]) => `${field}=${val}`);
      if (existing.length > 0) updateConfirmation = `ℹ️ 画像中已存在：${existing.join('，')}，无需修改。\n\n`;
    }
  }

  // --- 8. 纯画像更新拦截（只有更新、没有问题时只返回确认） ---
  const hasQuestion = ['?', '？', '怎么', '如何', '什么', '哪些', '吗', '呢', '吧'].some((k) => rawText.includes(k));
  const isPureUpdate = rawText.length < 30 && !hasQuestion
    && !['分析', '解释', '说明', '指导', '建议', '推荐'].some((k) => rawText.includes(k));
  if (isPureUpdate && updateConfirmation) {
    return {
      reply: updateConfirmation + '（你可以继续提问，我将按新画像回答）',
      updateNotice: updateConfirmation.replace(/\n+$/, ''),
    };
  }

  // --- 9. 兜底身份提取 ---
  const extracted = detectIdentityExtraction(rawText, profile);
  let extractedMsg = '';
  if (Object.keys(extracted).length > 0) {
    const [changed, changes] = profile.applyBatchUpdate(extracted, false);
    if (changed) {
      extractedMsg = '💡 已记录：' + changes.map((c) => `${c.field}=${c.new}`).join('，') + '\n\n';
    }
  }

  // --- 10. 临时知识水平切换（仅本轮） ---
  let tempKnowledgeLevel = null;
  if (['讲简单点', '通俗点', '用大白话', '别太专业', '简单讲', '说人话'].some((k) => rawText.includes(k))) {
    tempKnowledgeLevel = '初级';
    extractedMsg += '💡 已临时切换为「通俗」模式（仅本轮），下轮恢复。\n\n';
  } else if (['讲深一点', '专业点', '深入讲', '用专业术语', '讲深', '深入点'].some((k) => rawText.includes(k))) {
    tempKnowledgeLevel = '高级';
    extractedMsg += '💡 已临时切换为「专业」模式（仅本轮），下轮恢复。\n\n';
  } else if (['适中就行', '正常讲', '普通水平'].some((k) => rawText.includes(k))) {
    tempKnowledgeLevel = null;
    extractedMsg += '💡 已恢复正常水平（按画像知识水平输出）。\n\n';
  }

  let effectiveKnowledge = tempKnowledgeLevel || profile.get('知识水平');
  if (!effectiveKnowledge) effectiveKnowledge = '初级';

  // --- 11. 构建系统提示词（对齐 Python 版 system_content 拼接） ---
  const currentIdentity = profile.get('身份') || '新用户';
  const currentDirection = profile.get('研究方向') || '未设定';
  const currentStageGoal = profile.get('阶段目标') || '未设定';

  let sysContent = SYSTEM_PROMPT_BASE;
  sysContent += '\n\n【🔴 当前用户身份确认——最高优先级】\n';
  sysContent += `当前身份：**${currentIdentity}**\n`;
  sysContent += `当前知识水平：**${effectiveKnowledge}**\n`;
  sysContent += `当前研究方向：**${currentDirection}**\n`;
  sysContent += `当前阶段目标：**${currentStageGoal}**\n`;
  if (isEmotion) sysContent += '\n⚠️ 用户当前表达了情绪，请使用日常陪伴模式，不要主动给训练计划！\n';
  if (String(currentIdentity).includes('教练')) {
    sysContent += '\n⚠️ 你是教练，回答时请使用「教练」视角！\n';
  } else if (currentIdentity === '本科生') {
    sysContent += '\n⚠️ 你是本科生，回答时请使用「学生」视角，严禁使用「教练」视角！\n';
  }
  sysContent += '\n' + (KNOWLEDGE_LEVEL_SPECS[effectiveKnowledge] || KNOWLEDGE_LEVEL_SPECS['初级']);
  sysContent += `\n\n【当前用户画像】\n${profile.getSummary()}\n`;
  if (profileSummaryText) {
    sysContent += '\n【运动画像补充（训练记录/动作问题等）】\n' + profileSummaryText + '\n';
  }
  sysContent += '\n【本轮强制要求】\n';
  sysContent += `- 你必须以「${currentIdentity}」的身份视角回答\n`;
  if (currentDirection !== '未设定') {
    sysContent += `- 回答时优先结合「${currentDirection}」方向的专业知识\n`;
  }
  if (currentStageGoal !== '未设定') {
    sysContent += `- 回答时围绕「${currentStageGoal}」的目标提供建议\n`;
  }
  if (tempKnowledgeLevel) sysContent += '- ⚠️ 临时切换，仅本轮生效\n';
  if (forbiddenInstruction) sysContent += `\n${forbiddenInstruction}\n`;

  // --- 12. 检测指代词 → 跳过知识库，直接走普通模式 ---
  const referential = ['它', '他', '她', '这个', '那个', '这样', '那样', '如此'];
  const hasReference = referential.some((k) => rawText.includes(k));
  if (hasReference && Array.isArray(history) && history.length > 0) {
    const ai = await callNormalMode({
      rawText, files: fileList, systemContent: sysContent,
      history, prefixMsg: extractedMsg,
    });
    return { reply: (updateConfirmation || '') + ai, updateNotice: updateConfirmation?.replace(/\n+$/, '') || null };
  }

  // --- 13. 优先走知识库（仅纯文字，无图片），失败降级普通模式 ---
  const shouldUseKb = fileList.length === 0;
  if (shouldUseKb) {
    const kbResp = await callKnowledgeBase(rawText, sysContent, history);
    if (kbResp) {
      return {
        reply: (updateConfirmation || '') + extractedMsg + kbResp,
        updateNotice: updateConfirmation?.replace(/\n+$/, '') || null,
      };
    }
  }

  // --- 14. 普通模式（知识库空 / 有图 / 调用失败 都走这里） ---
  const kbFallbackPrefix = shouldUseKb
    ? (extractedMsg + '⚠️ 知识库未检索到相关内容，以下为普通模式回答：\n\n')
    : extractedMsg;
  const normalReply = await callNormalMode({
    rawText, files: fileList, systemContent: sysContent,
    history, prefixMsg: '',
  });
  return {
    reply: (updateConfirmation || '') + kbFallbackPrefix + normalReply,
    updateNotice: updateConfirmation?.replace(/\n+$/, '') || null,
  };
}

export { getSessionProfile };
