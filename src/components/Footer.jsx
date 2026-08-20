import './Footer.css';
import PainPoints from './PainPoints';

const team = [
  { role: '算法', name: '甲', desc: 'MediaPipe / 评估核心' },
  { role: '前端+UI', name: '乙', desc: 'H5 四页 / 肌肉图谱 / 适配' },
  { role: '平台+对话编排', name: '许婉莹', desc: '画像机制 / 意图路由' },
  { role: '测试评估', name: 'F 康芊芊', desc: '测试用例 / 画像准确度' },
  { role: '知识库内容', name: 'G 赵雅鑫', desc: '文献整理 / 知识库构建' },
  { role: '文档视频', name: 'H 左皖云', desc: '技术方案 / 演示视频' },
  { role: '文案', name: '产品组', desc: '教练人格 / 科普文案' },
];

export default function Footer() {
  return (
    <footer className="footer" id="footer">
      {/* PainPoints section */}
      <PainPoints />

      {/* Team & info section */}
      <div className="footer__bottom">
        <div className="section-container">
          <div className="footer__grid">
            <div className="footer__team">
              <h3 className="footer__team-title">团队介绍</h3>
              <p className="footer__team-desc">7 人跨学科协作，覆盖算法、前端、对话系统、测试、知识库、文档全链路</p>
              <div className="footer__team-list">
                {team.map((t, i) => (
                  <div key={i} className="footer__team-member">
                    <span className="footer__team-role">{t.role}</span>
                    <span className="footer__team-name">{t.name}</span>
                    <span className="footer__team-desc">{t.desc}</span>
                  </div>
                ))}
              </div>
            </div>

            <div className="footer__info">
              <div className="footer__qr">
                <div className="footer__qr-box">
                  <svg width="120" height="120" viewBox="0 0 120 120" fill="none">
                    <rect width="120" height="120" rx="12" fill="#111122" />
                    <rect x="15" y="15" width="30" height="30" rx="4" fill="#00d4ff" opacity="0.8" />
                    <rect x="75" y="15" width="30" height="30" rx="4" fill="#00d4ff" opacity="0.8" />
                    <rect x="15" y="75" width="30" height="30" rx="4" fill="#00d4ff" opacity="0.8" />
                    <rect x="21" y="21" width="18" height="18" rx="2" fill="#06060e" />
                    <rect x="81" y="21" width="18" height="18" rx="2" fill="#06060e" />
                    <rect x="21" y="81" width="18" height="18" rx="2" fill="#06060e" />
                    <rect x="25" y="25" width="10" height="10" rx="1" fill="#00d4ff" />
                    <rect x="85" y="25" width="10" height="10" rx="1" fill="#00d4ff" />
                    <rect x="25" y="85" width="10" height="10" rx="1" fill="#00d4ff" />
                    <rect x="55" y="15" width="8" height="8" rx="1" fill="#7c3aed" opacity="0.6" />
                    <rect x="55" y="30" width="8" height="8" rx="1" fill="#7c3aed" opacity="0.6" />
                    <rect x="55" y="55" width="8" height="8" rx="1" fill="#00d4ff" opacity="0.4" />
                    <rect x="70" y="55" width="8" height="8" rx="1" fill="#7c3aed" opacity="0.4" />
                    <rect x="85" y="55" width="8" height="8" rx="1" fill="#00d4ff" opacity="0.4" />
                    <rect x="55" y="70" width="8" height="8" rx="1" fill="#7c3aed" opacity="0.4" />
                    <rect x="70" y="70" width="8" height="8" rx="1" fill="#00d4ff" opacity="0.4" />
                    <rect x="85" y="70" width="8" height="8" rx="1" fill="#7c3aed" opacity="0.4" />
                    <rect x="55" y="85" width="8" height="8" rx="1" fill="#00d4ff" opacity="0.4" />
                    <rect x="70" y="85" width="8" height="8" rx="1" fill="#7c3aed" opacity="0.4" />
                    <rect x="85" y="85" width="8" height="8" rx="1" fill="#00d4ff" opacity="0.4" />
                    <rect x="55" y="100" width="8" height="8" rx="1" fill="#7c3aed" opacity="0.3" />
                    <rect x="70" y="100" width="8" height="8" rx="1" fill="#00d4ff" opacity="0.3" />
                    <rect x="85" y="100" width="8" height="8" rx="1" fill="#7c3aed" opacity="0.3" />
                    <text x="60" y="63" textAnchor="middle" fill="#00d4ff" fontSize="10" fontWeight="700">动知</text>
                  </svg>
                </div>
                <p className="footer__qr-label">扫码在线体验</p>
              </div>

              <div className="footer__competition">
                <h4 className="footer__competition-title">比赛信息</h4>
                <p className="footer__competition-name">挑战杯 · 阿里云命题赛</p>
                <p className="footer__competition-track">赛道三方向一A · 数字分身</p>
                <div className="footer__competition-tags">
                  <span className="footer__tag">千问大模型</span>
                  <span className="footer__tag">人体动作分析</span>
                  <span className="footer__tag">AI 数字分身</span>
                </div>
              </div>

              <div className="footer__contact">
                <h4 className="footer__contact-title">联系方式</h4>
                <p className="footer__contact-text">如有合作意向或问题反馈</p>
                <a href="mailto:contact@dongzhi.ai" className="footer__contact-email">
                  contact@dongzhi.ai
                </a>
              </div>
            </div>
          </div>

          <div className="footer__bottom-bar">
            <div className="footer__copyright">
              &copy; 2026 动知 DongZhi. All rights reserved.
            </div>
            <div className="footer__made">
              用 <span className="gradient-text">AI</span> 懂你的身体
            </div>
          </div>
        </div>
      </div>
    </footer>
  );
}
