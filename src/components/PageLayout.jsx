import { Link, useLocation } from 'react-router-dom';
import './PageLayout.css';

export default function PageLayout({ children, title, subtitle }) {
  const location = useLocation();

  return (
    <div className="page-layout">
      <nav className="page-layout__nav">
        <div className="page-layout__nav-inner">
          <a href="/#features" className="page-layout__back">
            <svg width="20" height="20" viewBox="0 0 20 20" fill="none">
              <path d="M12 4L6 10L12 16" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
            </svg>
            返回首页
          </a>
          <a href="/#features" className="page-layout__logo">
            <span className="page-layout__logo-text">动知</span>
          </a>
        </div>
      </nav>

      <div className="page-layout__hero">
        <div className="page-layout__hero-inner">
          <h1 className="page-layout__title">{title}</h1>
          {subtitle && <p className="page-layout__subtitle">{subtitle}</p>}
        </div>
      </div>

      <main className="page-layout__content">
        {children}
      </main>

      <footer className="page-layout__footer">
        <div className="page-layout__footer-inner">
          <span>&copy; 2026 动知 DongZhi</span>
          <a href="/#features" className="page-layout__footer-link">返回首页</a>
        </div>
      </footer>
    </div>
  );
}
