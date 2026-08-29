import useTheme from '../../hooks/useTheme';
import './ThemeToggle.css';

/**
 * 主题切换浮动按钮（日/夜模式）
 * - fixed 定位在右下角，所有页面统一生效
 * - 太阳/月亮图标带旋转过渡
 * - 移动端自动缩小
 */
export default function ThemeToggle() {
  const { theme, toggle, isLight } = useTheme();

  return (
    <button
      type="button"
      className={`theme-toggle theme-toggle--${theme}`}
      onClick={toggle}
      aria-label={isLight ? '切换到夜晚模式' : '切换到白天模式'}
      title={isLight ? '切换到夜晚模式' : '切换到白天模式'}
    >
      <span className="theme-toggle__moon-glow" />
      <span className="theme-toggle__icon">
        {/* 太阳图标 */}
        <span className="theme-toggle__sun">
          <svg width="100%" height="100%" viewBox="0 0 24 24" fill="none" aria-hidden="true">
            <circle cx="12" cy="12" r="4.5" fill="currentColor" />
            <g stroke="currentColor" strokeWidth="2" strokeLinecap="round">
              <line x1="12" y1="2" x2="12" y2="4" />
              <line x1="12" y1="20" x2="12" y2="22" />
              <line x1="2" y1="12" x2="4" y2="12" />
              <line x1="20" y1="12" x2="22" y2="12" />
              <line x1="4.9" y1="4.9" x2="6.3" y2="6.3" />
              <line x1="17.7" y1="17.7" x2="19.1" y2="19.1" />
              <line x1="4.9" y1="19.1" x2="6.3" y2="17.7" />
              <line x1="17.7" y1="6.3" x2="19.1" y2="4.9" />
            </g>
          </svg>
        </span>
        {/* 月亮图标 */}
        <span className="theme-toggle__moon">
          <svg width="100%" height="100%" viewBox="0 0 24 24" fill="none" aria-hidden="true">
            <path
              d="M21 12.8A9 9 0 1 1 11.2 3a7 7 0 0 0 9.8 9.8z"
              fill="currentColor"
              opacity="0.9"
            />
            <circle cx="17" cy="8.5" r="0.6" fill="var(--bg-card)" />
            <circle cx="15.5" cy="12" r="0.5" fill="var(--bg-card)" />
          </svg>
        </span>
      </span>
      <span className="theme-toggle__sr-text">
        {isLight ? '切换到夜晚模式' : '切换到白天模式'}
      </span>
    </button>
  );
}
