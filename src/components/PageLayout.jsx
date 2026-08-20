import { Link, useNavigate } from 'react-router-dom';
import './PageLayout.css';

export default function PageLayout({ children, title, subtitle }) {
  const navigate = useNavigate();

  const handleBackToHome = (e) => {
    e.preventDefault();
    navigate('/');
    setTimeout(() => {
      const el = document.getElementById('features');
      if (el) {
        el.scrollIntoView({ behavior: 'smooth' });
      } else {
        window.scrollTo({ top: 0, behavior: 'smooth' });
      }
    }, 100);
  };

  return (
    <div className="page-layout">
      <nav className="page-layout__nav">
        <div className="page-layout__nav-inner">
          <a href="/" onClick={handleBackToHome} className="page-layout__back">
            <svg width="20" height="20" viewBox="0 0 20 20" fill="none">
              <path d="M12 4L6 10L12 16" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
            </svg>
            返回首页
          </a>
          <Link to="/" className="page-layout__logo">
            <span className="page-layout__logo-text">动知</span>
          </Link>
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
          <a href="/" onClick={handleBackToHome} className="page-layout__footer-link">返回首页</a>
        </div>
      </footer>
    </div>
  );
}
