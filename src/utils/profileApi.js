const PROFILE_API_BASE = (import.meta.env.VITE_PROFILE_API_BASE || '/profile-api').replace(/\/$/, '');
const COACH_API_BASE = (import.meta.env.VITE_COACH_API_BASE || '/coach-api').replace(/\/$/, '');
const COACH_APP_ID = import.meta.env.VITE_COACH_APP_ID || '';

function profileUrl(path, query = {}) {
  const url = new URL(`${PROFILE_API_BASE}${path}`, window.location.origin);
  Object.entries(query).forEach(([key, value]) => {
    if (value !== undefined && value !== null && value !== '') url.searchParams.set(key, value);
  });
  return url.toString();
}

async function request(url, options = {}) {
  const response = await fetch(url, {
    ...options,
    headers: { 'Content-Type': 'application/json', ...(options.headers || {}) },
  });
  if (!response.ok) {
    let detail = '';
    let errorCode = '';
    try {
      const body = await response.json();
      detail = body.message || body.detail || body.code || '';
      errorCode = body.code || '';
    } catch {
      detail = await response.text().catch(() => '');
    }
    const error = new Error(detail || `HTTP ${response.status}`);
    error.status = response.status;
    error.code = errorCode;
    throw error;
  }
  return response.json();
}

export async function getFullProfile(userId) {
  return request(profileUrl('/api/get_full_profile', { user_id: userId }));
}

export async function getProfileSummary(userId) {
  return request(profileUrl('/api/get_profile_summary', { user_id: userId }));
}

export async function addTrainRecord(userId, record) {
  return request(profileUrl('/api/add_train_record'), {
    method: 'POST',
    body: JSON.stringify({ user_id: userId, ...record }),
  });
}

export async function addMoodRecord(userId, mood) {
  return request(profileUrl('/api/add_mood_record'), {
    method: 'POST',
    body: JSON.stringify({ user_id: userId, ...mood }),
  });
}

export async function addGoal(userId, goal) {
  return request(profileUrl('/api/add_goal'), {
    method: 'POST',
    body: JSON.stringify({ user_id: userId, ...goal }),
  });
}

function toCoachHistory(messages) {
  return (messages || []).slice(-16).map((message) => ({
    role: message.role === 'assistant' ? 'coach' : 'user',
    text: message.content || '',
    ts: new Date(message.timestamp || Date.now()).toISOString(),
  }));
}

export async function sendCoachMessage({ userId, sessionId, text, messages, profileSummary }) {
  const messageText = String(text || '').trim();
  if (!messageText) throw new Error('请输入问题后再发送');
  if (messageText.length > 500) throw new Error('问题不能超过 500 字，请精简后重试');
  if (!COACH_APP_ID) {
    throw new Error('AI 教练应用尚未配置，请设置 VITE_COACH_APP_ID');
  }
  const history = toCoachHistory(messages);
  const prompt = [
    '你是动知 AI 运动教练，请用中文简洁、专业、可执行地回答用户。',
    profileSummary || '【用户画像摘要】\n暂无画像数据。',
    history.length ? `【近期对话】\n${history.map((item) => `${item.role === 'user' ? '用户' : '教练'}：${item.text}`).join('\n')}` : '',
    `【本次问题】\n${messageText}`,
  ].filter(Boolean).join('\n\n');
  const response = await request(`${COACH_API_BASE}/apps/${encodeURIComponent(COACH_APP_ID)}/completion`, {
    method: 'POST',
    body: JSON.stringify({
      input: { prompt },
      parameters: {},
    }),
  });
  return response.output?.text
    || response.output?.choices?.[0]?.message?.content
    || response.output?.choices?.[0]?.text
    || response.text
    || response.message
    || '';
}

export function normalizeRemoteProfile(payload) {
  const profile = payload?.user_profile || payload || {};
  return {
    basicInfo: profile.basic_info || {},
    habits: profile['动作习惯'] || profile.action_habits || [],
    trainingRecords: profile['训练记录'] || profile.training_records || [],
    moods: profile['情绪动机'] || profile.emotion_motivation || [],
    goals: profile['阶段目标'] || profile.stage_goals || [],
    raw: payload,
  };
}

export function isProfileApiConfigured() {
  return Boolean(import.meta.env.VITE_PROFILE_API_BASE || import.meta.env.DEV);
}
