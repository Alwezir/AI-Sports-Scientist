import { useState, useRef, useEffect } from 'react';
import PageLayout from '../components/PageLayout';
import {
  getOrCreateUserId,
  initUser,
  analyzeAndSaveTraitsFromTurn,
  generateTraitPromptContext,
} from '../utils/userProfile';
import './ChatPage.css';

const API_URL = 'https://dashscope.aliyuncs.com/api/v1/apps/21bcc71b92e54b8792c7a49d7476ca1d/completion';
const API_KEY = 'sk-ws-H.ELXRILX.wmJK.MEUCIQCXFWQE-VK1HzWBBXe521dp5d0hYLBoDGbTvWeqOjxqvQIgRohj1nrc8rut0_TKMGI8vm-S_vrU-1yFW19MnVy5DGo';

const INTENT_CATEGORIES = [
  { id: 'analysis', label: '动作分析', icon: '🏋️', desc: '分析你的动作问题' },
  { id: 'knowledge', label: '知识问答', icon: '', desc: '健身知识解答' },
  { id: 'learning', label: '学习对话', icon: '🎓', desc: '系统学习运动科学' },
  { id: 'profile', label: '画像管理', icon: '', desc: '查看/修改个人数据' },
];

const QUICK_QUESTIONS = [
  '深蹲时膝盖内扣怎么纠正？',
  '什么是渐进超负荷？',
  '如何制定一周训练计划？',
  '我的深蹲评分怎么样？',
];

export default function ChatPage() {
  const [messages, setMessages] = useState([
    {
      id: 0,
      role: 'assistant',
      content: '你好！我是动知 AI 教练。我可以帮你分析动作、解答健身知识、制定训练计划，或者管理你的运动画像。有什么可以帮你的？',
      intent: null,
    },
  ]);
  const [input, setInput] = useState('');
  const [loading, setLoading] = useState(false);
  const [selectedIntent, setSelectedIntent] = useState(null);
  const [traitNotice, setTraitNotice] = useState(null);
  const messagesEndRef = useRef(null);
  const inputRef = useRef(null);
  const userIdRef = useRef(null);

  // 初始化用户 ID（懒加载，仅一次）
  useEffect(() => {
    const uid = getOrCreateUserId();
    initUser(uid, '运动用户');
    userIdRef.current = uid;
  }, []);

  // 特点提示 3 秒自动消失
  useEffect(() => {
    if (!traitNotice) return;
    const t = setTimeout(() => setTraitNotice(null), 3200);
    return () => clearTimeout(t);
  }, [traitNotice]);

  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages]);

  const sendMessage = async (text) => {
    const messageText = text || input.trim();
    if (!messageText || loading) return;

    const uid = userIdRef.current || getOrCreateUserId();
    if (!userIdRef.current) userIdRef.current = uid;

    const userMsg = {
      id: Date.now(),
      role: 'user',
      content: messageText,
      intent: selectedIntent,
    };

    setMessages((prev) => [...prev, userMsg]);
    setInput('');
    setLoading(true);

    // 注入用户画像上下文，让 AI 教练真正"记得"用户特点
    const profileContext = generateTraitPromptContext(uid);
    const finalPrompt = profileContext + '\n\n---\n用户问题：\n' + messageText;

    try {
      const response = await fetch(API_URL, {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${API_KEY}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          input: {
            prompt: finalPrompt,
          },
          parameters: {},
        }),
      });

      if (!response.ok) {
        const errText = await response.text();
        throw new Error(`API 请求失败 (${response.status}): ${errText}`);
      }

      const data = await response.json();

      // DashScope app completion 返回结构: data.output.text
      const reply =
        data?.output?.text ||
        data?.output?.choices?.[0]?.message?.content ||
        data?.text ||
        '抱歉，我暂时无法回答这个问题。';

      // 从本轮对话（用户 + 助手回复）抽取可记住的用户特点并写入画像
      const traitResult = analyzeAndSaveTraitsFromTurn(uid, messageText, reply);
      if (traitResult.added > 0) {
        setTraitNotice(traitResult);
      }

      setMessages((prev) => [
        ...prev,
        {
          id: Date.now() + 1,
          role: 'assistant',
          content: reply,
          intent: selectedIntent,
        },
      ]);
    } catch (error) {
      setMessages((prev) => [
        ...prev,
        {
          id: Date.now() + 1,
          role: 'assistant',
          content: `连接失败：${error.message}。请检查网络连接后重试。`,
          intent: null,
          isError: true,
        },
      ]);
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

  return (
    <PageLayout
      title="AI 教练对话"
      subtitle="基于千问大模型，4 类意图智能路由，回答引用你的历史数据"
    >
      <div className="chat-page">
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
        <div className="chat-page__container">
          <div className="chat-page__messages">
            {messages.map((msg) => (
              <div
                key={msg.id}
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
          {messages.length <= 1 && (
            <div className="chat-page__quick">
              <p className="chat-page__quick-label">试试这些问题：</p>
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
              <textarea
                ref={inputRef}
                className="chat-page__textarea"
                placeholder="输入你的问题..."
                value={input}
                onChange={(e) => setInput(e.target.value)}
                onKeyDown={handleKeyDown}
                rows={1}
                disabled={loading}
              />
              <button
                className="chat-page__send-btn"
                onClick={() => sendMessage()}
                disabled={!input.trim() || loading}
              >
                <svg width="20" height="20" viewBox="0 0 20 20" fill="none">
                  <path d="M3 10h14M13 6l4 4-4 4" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
                </svg>
              </button>
            </div>
          </div>
        </div>
      </div>
    </PageLayout>
  );
}
