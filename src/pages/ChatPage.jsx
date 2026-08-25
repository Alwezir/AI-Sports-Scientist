import { useState, useRef, useEffect } from 'react';
import PageLayout from '../components/PageLayout';
import {
  getOrCreateUserId,
  initUser,
  analyzeAndSaveTraitsFromTurn,
  generateTraitPromptContext,
} from '../utils/userProfile';
import { getProfileSummary, getCoachConfig } from '../utils/profileApi';
import { respond as coachRespond, resetSessionProfile } from '../utils/coach/coachEngine.js';
import PixelBlast from '../components/PixelBlast';
import LineSidebar from '../components/LineSidebar/LineSidebar';
import './ChatPage.css';

const INTENT_CATEGORIES = [
  { id: 'analysis', label: '动作分析', icon: '🏋️', desc: '分析你的动作问题' },
  { id: 'knowledge', label: '知识问答', icon: '', desc: '健身知识解答' },
  { id: 'learning', label: '学习对话', icon: '🎓', desc: '系统学习运动科学' },
  { id: 'profile', label: '画像管理', icon: '', desc: '查看/修改个人数据' },
];

const QUICK_QUESTIONS = [
  '深蹲动作哪里做错了？',
  '大腿酸痛该怎么恢复？',
  '看看我本次动作评估报告',
];

const CHAT_SESSIONS_KEY = 'dongzhi_chat_sessions';

function createConversation() {
  return {
    id: `chat_${Date.now()}_${Math.random().toString(36).slice(2, 7)}`,
    title: '新对话',
    messages: [],
  };
}

function getInitialConversations() {
  try {
    const saved = JSON.parse(localStorage.getItem(CHAT_SESSIONS_KEY));
    if (Array.isArray(saved) && saved.length > 0) return saved;
  } catch {
    // A corrupt local history should not block a new conversation.
  }
  return [createConversation()];
}

export default function ChatPage() {
  const [conversations, setConversations] = useState(getInitialConversations);
  const [activeConversationId, setActiveConversationId] = useState(null);
  const [input, setInput] = useState('');
  const [loading, setLoading] = useState(false);
  const [selectedIntent, setSelectedIntent] = useState(null);
  const [traitNotice, setTraitNotice] = useState(null);
  const [profileNotice, setProfileNotice] = useState(false);
  const [clearNotice, setClearNotice] = useState(false);
  const [apiNotice, setApiNotice] = useState(null);
  const coachConfig = getCoachConfig();
  const coachUnconfigured = !coachConfig.isConfigured;
  const messagesEndRef = useRef(null);
  const messageRefs = useRef([]);
  const inputRef = useRef(null);
  const userIdRef = useRef(null);
  const activeConversation = conversations.find((conversation) => conversation.id === activeConversationId) || conversations[0];
  const messages = activeConversation?.messages || [];

  const sidebarItems = messages.length > 0
    ? messages.map((msg) => {
        const prefix = msg.role === 'user' ? '用户' : 'AI';
        const text = msg.content.replace(/\s+/g, ' ').slice(0, 18);
        return `${prefix}：${text}${msg.content.length > 18 ? '…' : ''}`;
      })
    : ['暂无消息，开始提问吧'];

  const scrollToMessage = (index) => {
    if (messages.length === 0) return;
    const el = messageRefs.current[index];
    if (el) {
      el.scrollIntoView({ behavior: 'smooth', block: 'center' });
    }
  };

  const resizeInput = () => {
    const textarea = inputRef.current;
    if (!textarea) return;
    textarea.style.height = '48px';
    textarea.style.height = `${Math.min(textarea.scrollHeight, 150)}px`;
  };

  const updateConversation = (conversationId, update) => {
    setConversations((previous) => previous.map((conversation) => (
      conversation.id === conversationId ? update(conversation) : conversation
    )));
  };

  const addMessage = (conversationId, message) => {
    updateConversation(conversationId, (conversation) => ({
      ...conversation,
      title: conversation.messages.length === 0 && message.role === 'user'
        ? message.content.slice(0, 18)
        : conversation.title,
      messages: [...conversation.messages, message],
    }));
  };

  // 初始化用户 ID（懒加载，仅一次）
  useEffect(() => {
    const uid = getOrCreateUserId();
    initUser(uid, '运动用户');
    userIdRef.current = uid;
  }, []);

  useEffect(() => {
    localStorage.setItem(CHAT_SESSIONS_KEY, JSON.stringify(conversations));
  }, [conversations]);

  useEffect(() => {
    if (!activeConversationId || !conversations.some((conversation) => conversation.id === activeConversationId)) {
      setActiveConversationId(conversations[0]?.id || null);
    }
  }, [activeConversationId, conversations]);

  // 特点提示 3 秒自动消失
  useEffect(() => {
    if (!traitNotice) return;
    const t = setTimeout(() => setTraitNotice(null), 3200);
    return () => clearTimeout(t);
  }, [traitNotice]);

  useEffect(() => {
    if (!profileNotice) return;
    const t = setTimeout(() => setProfileNotice(false), 4200);
    return () => clearTimeout(t);
  }, [profileNotice]);

  useEffect(() => {
    if (!clearNotice) return;
    const t = setTimeout(() => setClearNotice(false), 3200);
    return () => clearTimeout(t);
  }, [clearNotice]);

  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages]);

  useEffect(() => {
    resizeInput();
  }, [input]);

  const sendMessage = async (text) => {
    const messageText = text || input.trim();
    if (!messageText || loading || !activeConversation) return;

    const uid = userIdRef.current || getOrCreateUserId();
    if (!userIdRef.current) userIdRef.current = uid;

    const userMsg = {
      id: Date.now(),
      role: 'user',
      content: messageText,
      intent: selectedIntent,
    };

    const conversationId = activeConversation.id;
    addMessage(conversationId, userMsg);
    setInput('');
    setLoading(true);
    setProfileNotice(true);

    try {
      let profileSummaryText;
      try {
        const profile = await getProfileSummary(uid);
        profileSummaryText = typeof profile === 'string' ? profile : (profile.summary || generateTraitPromptContext(uid));
        setApiNotice(null);
      } catch {
        profileSummaryText = generateTraitPromptContext(uid);
        setApiNotice('画像服务暂时不可用，本次先使用本机画像继续对话');
      }

      // ---- 新引擎：移植自 PythonApplication5.py 的 respond() ----
      const { reply, updateNotice } = await coachRespond({
        text: messageText,
        history: messages,
        files: [],
        profileSummaryText,
      });
      if (!reply) throw new Error('教练接口返回内容为空');

      if (updateNotice) {
        setApiNotice(updateNotice);
      }

      // 从本轮对话（用户 + 助手回复）抽取可记住的用户特点并写入画像
      const traitResult = analyzeAndSaveTraitsFromTurn(uid, messageText, reply);
      if (traitResult.added > 0) {
        setTraitNotice(traitResult);
      }

      addMessage(conversationId, {
        id: Date.now() + 1,
        role: 'assistant',
        content: reply,
        intent: selectedIntent,
      });
    } catch (error) {
      addMessage(conversationId, {
        id: Date.now() + 1,
        role: 'assistant',
          content: error.status === 429
            ? '请求较多，请稍后再试'
            : error.status === 503
              ? 'AI 教练服务正在维护，请稍后再试'
              : error.status === 401 || error.status === 403
                ? 'AI 教练服务暂未授权，请联系管理员配置接口'
                : '教练临时有事离开一下，请稍等片刻再试。',
        intent: null,
        isError: true,
      });
      setApiNotice(error.message || 'AI 教练服务暂时不可用');
    } finally {
      setLoading(false);
    }
  };

  const handleKeyDown = (e) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      sendMessage();
    }
  };

  const startNewConversation = () => {
    if (loading) return;
    const conversation = createConversation();
    setConversations((previous) => [conversation, ...previous]);
    setActiveConversationId(conversation.id);
    setInput('');
    setSelectedIntent(null);
    resetSessionProfile(); // 新建对话同时重置对话内画像（身份/知识水平等）
  };

  const clearActiveConversation = () => {
    if (loading || !activeConversation) return;
    updateConversation(activeConversation.id, (conversation) => ({
      ...conversation,
      title: '新对话',
      messages: [],
    }));
    setInput('');
    setSelectedIntent(null);
    setClearNotice(true);
  };

  const removeConversation = (event, conversationId) => {
    event.stopPropagation();
    if (loading) return;
    setConversations((previous) => {
      if (previous.length === 1) {
        const replacement = createConversation();
        setActiveConversationId(replacement.id);
        return [replacement];
      }
      const next = previous.filter((conversation) => conversation.id !== conversationId);
      if (conversationId === activeConversationId) setActiveConversationId(next[0].id);
      return next;
    });
  };

  return (
    <PageLayout
      title="AI教练对话"
      subtitle="结合你的运动画像，给你个性化运动指导"
    >
      <div className="chat-page">
        <PixelBlast color="#b497cf" pixelSize={4} speed={0.48} />
        {/* Coach configuration status */}
        {coachUnconfigured && (
          <div className="chat-page__config-banner chat-page__config-banner--error" role="alert">
            <svg width="20" height="20" viewBox="0 0 24 24" fill="none" aria-hidden="true">
              <circle cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="1.8" />
              <path d="M12 8v4M12 16h.01" stroke="currentColor" strokeWidth="2" strokeLinecap="round" />
            </svg>
            <div>
              <strong>AI 教练尚未配置</strong>
              <p>请在 GitHub Repository Secrets 中添加以下变量：</p>
              <ul className="chat-page__config-list">
                <li><code>VITE_COACH_APP_ID</code>（必填）你的应用 ID</li>
                <li><code>VITE_COACH_API_BASE</code>（推荐）Cloudflare Worker 地址，或 <code>VITE_COACH_API_KEY</code>（备选）前端直连</li>
              </ul>
              <p className="chat-page__config-hint">本地开发可在 <code>.env.local</code> 中配置</p>
            </div>
          </div>
        )}
        {/* Trait notice toast */}
        {traitNotice && (
          <div className="chat-page__trait-toast" role="status">
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none">
              <circle cx="12" cy="12" r="10" stroke="#00d4ff" strokeWidth="1.8" />
              <path d="M8 12l3 3 5-6" stroke="#00d4ff" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
            </svg>
            <span>
              已记住 {traitNotice.added} 个新特点（共 {traitNotice.total} 条），可在「运动画像 → 个人设置」中管理
            </span>
          </div>
        )}

        {profileNotice && (
          <div className="chat-page__profile-toast" role="status" aria-live="polite">
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" aria-hidden="true">
              <circle cx="12" cy="12" r="9" stroke="currentColor" strokeWidth="1.8" />
              <path d="M8 12h8M12 8v8" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" />
            </svg>
            <span>
              <strong>已读取你的运动画像</strong>
              <small>将结合你的训练习惯、过往动作问题为你生成回答</small>
            </span>
          </div>
        )}

        {clearNotice && (
          <div className="chat-page__clear-toast" role="status" aria-live="polite">
            会话记录已清空，开启新一轮对话
          </div>
        )}

        {apiNotice && (
          <div className="chat-page__api-notice" role="status" aria-live="polite">
            {apiNotice}
          </div>
        )}

        <div className="chat-page__workspace">
          <aside className="chat-page__sidebar" aria-label="对话历史">
            <button type="button" className="chat-page__new-chat-btn" onClick={startNewConversation} disabled={loading}>
              <svg width="18" height="18" viewBox="0 0 24 24" fill="none" aria-hidden="true">
                <path d="M12 5v14M5 12h14" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" />
              </svg>
              新建对话
            </button>
            <div className="chat-page__history-label">最近对话</div>
            <div className="chat-page__session-list">
              {conversations.map((conversation) => (
                <div
                  key={conversation.id}
                  type="button"
                  className={`chat-page__session ${conversation.id === activeConversation?.id ? 'chat-page__session--active' : ''}`}
                  title={conversation.title}
                >
                  <button
                    type="button"
                    className="chat-page__session-select"
                    onClick={() => {
                      if (!loading) {
                        setActiveConversationId(conversation.id);
                        setSelectedIntent(null);
                      }
                    }}
                    disabled={loading}
                  >
                    <svg className="chat-page__session-icon" width="16" height="16" viewBox="0 0 24 24" fill="none" aria-hidden="true">
                      <path d="M5 6.5A2.5 2.5 0 0 1 7.5 4h9A2.5 2.5 0 0 1 19 6.5v6A2.5 2.5 0 0 1 16.5 15H12l-3.8 3v-3H7.5A2.5 2.5 0 0 1 5 12.5v-6Z" stroke="currentColor" strokeWidth="1.6" strokeLinejoin="round" />
                    </svg>
                    <span>{conversation.title}</span>
                  </button>
                  <button
                    type="button"
                    className="chat-page__session-delete"
                    aria-label={`删除对话：${conversation.title}`}
                    onClick={(event) => removeConversation(event, conversation.id)}
                    disabled={loading}
                  >
                    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" aria-hidden="true">
                      <path d="M5 7h14M10 11v6M14 11v6M9 7l1-2h4l1 2m-8 0 1 13h8l1-13" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" />
                    </svg>
                  </button>
                </div>
              ))}
            </div>
          </aside>

          <section className="chat-page__main">
        {/* Intent selector */}
        <div className="chat-page__intents">
          {INTENT_CATEGORIES.map((intent) => (
            <button
              key={intent.id}
              className={`chat-page__intent-btn ${selectedIntent === intent.id ? 'chat-page__intent-btn--active' : ''}`}
              onClick={() => setSelectedIntent(selectedIntent === intent.id ? null : intent.id)}
            >
              <span className="chat-page__intent-icon">{intent.icon}</span>
              <div className="chat-page__intent-info">
                <span className="chat-page__intent-label">{intent.label}</span>
                <span className="chat-page__intent-desc">{intent.desc}</span>
              </div>
            </button>
          ))}
        </div>

        {/* Chat area */}
        <div className="chat-page__chat-layout">
        <div className="chat-page__container">
          <div className="chat-page__toolbar">
            <span className="chat-page__toolbar-title">对话记录</span>
            <button
              type="button"
              className="chat-page__clear-btn"
              onClick={() => {
                if (!loading) {
                  clearActiveConversation();
                }
              }}
              disabled={loading || messages.length === 0}
            >
              清空会话
            </button>
          </div>
          <div className="chat-page__messages">
            {messages.length === 0 && (
              <div className="chat-page__empty-state">
                <div className="chat-page__empty-icon" aria-hidden="true">
                  <svg width="30" height="30" viewBox="0 0 30 30" fill="none">
                    <path d="M6 7.5A3.5 3.5 0 0 1 9.5 4h11A3.5 3.5 0 0 1 24 7.5v8a3.5 3.5 0 0 1-3.5 3.5H14l-5.2 4v-4H9.5A3.5 3.5 0 0 1 6 15.5v-8Z" stroke="currentColor" strokeWidth="1.6" strokeLinejoin="round" />
                    <path d="M10 10h10M10 14h6" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" />
                  </svg>
                </div>
                <span className="chat-page__empty-kicker">动知 AI 教练</span>
                <h2>欢迎来到 AI 教练对话！</h2>
                <p>我是你的专属运动数字分身。我可以结合你的运动画像，帮你分析动作错误、讲解肌肉知识、解答健身训练疑问。</p>
                <span className="chat-page__empty-label">你可以试试提问：</span>
              </div>
            )}
            {messages.map((msg, index) => (
              <div
                key={msg.id}
                ref={(el) => { messageRefs.current[index] = el; }}
                className={`chat-page__message ${msg.role === 'user' ? 'chat-page__message--user' : 'chat-page__message--assistant'} ${msg.isError ? 'chat-page__message--error' : ''}`}
              >
                {msg.role === 'assistant' && (
                  <div className="chat-page__avatar">
                    <svg width="24" height="24" viewBox="0 0 24 24" fill="none">
                      <circle cx="12" cy="12" r="10" stroke="url(#chatAvatar)" strokeWidth="1.5" />
                      <circle cx="12" cy="9" r="2" fill="#00d4ff" />
                      <path d="M8 16c0-2 2-3 4-3s4 1 4 3" stroke="#00d4ff" strokeWidth="1.5" strokeLinecap="round" />
                      <defs>
                        <linearGradient id="chatAvatar" x1="0" y1="0" x2="24" y2="24">
                          <stop stopColor="#00d4ff" />
                          <stop offset="1" stopColor="#7c3aed" />
                        </linearGradient>
                      </defs>
                    </svg>
                  </div>
                )}
                <div className="chat-page__bubble">
                  {msg.intent && (
                    <span className="chat-page__intent-tag">
                      {INTENT_CATEGORIES.find((i) => i.id === msg.intent)?.label}
                    </span>
                  )}
                  <p className="chat-page__message-text">{msg.content}</p>
                </div>
              </div>
            ))}

            {loading && (
              <div className="chat-page__message chat-page__message--assistant">
                <div className="chat-page__avatar">
                  <svg width="24" height="24" viewBox="0 0 24 24" fill="none">
                    <circle cx="12" cy="12" r="10" stroke="url(#chatAvatar2)" strokeWidth="1.5" />
                    <defs>
                      <linearGradient id="chatAvatar2" x1="0" y1="0" x2="24" y2="24">
                        <stop stopColor="#00d4ff" />
                        <stop offset="1" stopColor="#7c3aed" />
                      </linearGradient>
                    </defs>
                  </svg>
                </div>
                <div className="chat-page__bubble">
                  <span className="chat-page__loading-label">AI教练思考中，请稍候…</span>
                  <div className="chat-page__typing">
                    <span />
                    <span />
                    <span />
                  </div>
                </div>
              </div>
            )}

            <div ref={messagesEndRef} />
          </div>

          {/* Quick questions */}
          {messages.length === 0 && (
            <div className="chat-page__quick">
              <p className="chat-page__quick-label">从一个问题开始</p>
              <div className="chat-page__quick-list">
                {QUICK_QUESTIONS.map((q) => (
                  <button
                    key={q}
                    className="chat-page__quick-btn"
                    onClick={() => sendMessage(q)}
                  >
                    {q}
                  </button>
                ))}
              </div>
            </div>
          )}

          {/* Input */}
          <div className="chat-page__input-area">
            {selectedIntent && (
              <div className="chat-page__selected-intent">
                <span>
                  当前意图：{INTENT_CATEGORIES.find((i) => i.id === selectedIntent)?.label}
                </span>
                <button onClick={() => setSelectedIntent(null)}>×</button>
              </div>
            )}
            <div className="chat-page__input-wrapper">
              <button
                type="button"
                className="chat-page__attach-btn"
                title="上传动作评估报告"
                aria-label="上传动作评估报告"
                onClick={() => setApiNotice('动作评估报告会在评估完成后自动关联到本次对话')}
              >
                <svg width="18" height="18" viewBox="0 0 24 24" fill="none" aria-hidden="true">
                  <path d="m14.5 6.5-7.1 7.1a3 3 0 0 0 4.2 4.2l7.1-7.1a4.5 4.5 0 0 0-6.4-6.4l-7.1 7.1a6 6 0 0 0 8.5 8.5l6.1-6.1" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" />
                </svg>
              </button>
              <textarea
                ref={inputRef}
                className="chat-page__textarea"
                placeholder="描述你的运动问题，也可以上传动作评估报告向教练提问…"
                value={input}
                onChange={(e) => {
                  setInput(e.target.value);
                  resizeInput();
                }}
                onKeyDown={handleKeyDown}
                rows={1}
                disabled={loading}
              />
              <button
                className="chat-page__send-btn"
                onClick={() => sendMessage()}
                disabled={!input.trim() || loading}
                aria-label="发送"
              >
                <svg width="20" height="20" viewBox="0 0 20 20" fill="none">
                  <path d="M3 10h14M13 6l4 4-4 4" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
                </svg>
                <span>发送</span>
              </button>
            </div>
            <p className="chat-page__compliance">本对话内容受合规管控，不会泄露你的个人运动数据</p>
            <p className="chat-page__disclaimer">AI生成内容仅供科普参考，不构成医疗诊断建议</p>
          </div>
        </div>
        <LineSidebar
          className="chat-page__line-sidebar"
          items={sidebarItems}
          accentColor="#00d4ff"
          textColor="var(--text-muted)"
          markerColor="rgba(255,255,255,0.25)"
          showIndex={false}
          showMarker
          proximityRadius={120}
            maxShift={16}
            markerLength={40}
            markerGap={12}
            tickScale={0.4}
            itemGap={16}
            fontSize={0.85}
            smoothing={180}
          onItemClick={(index) => scrollToMessage(index)}
        />
        </div>
          </section>
        </div>
      </div>
    </PageLayout>
  );
}
