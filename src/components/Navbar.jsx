import { useState, useEffect } from 'react';
import './Navbar.css';

export default function Navbar() {
  const [scrolled, setScrolled] = useState(false);
  const [mobileOpen, setMobileOpen] = useState(false);

  useEffect(() => {
    const onScroll = () => setScrolled(window.scrollY > 40);
    window.addEventListener('scroll', onScroll);
    return () => window.removeEventListener('scroll', onScroll);
  }, []);

  const links = [
    { label: '痛点', href: '#pain-points' },
    { label: '功能', href: '#features' },
    { label: '技术', href: '#tech' },
    { label: '团队', href: '#footer' },
  ];

  return (
    <nav className={`navbar ${scrolled ? 'navbar--scrolled' : ''}`}>
      <div className="navbar__inner">
        <a href="#" className="navbar__logo">
          <span className="navbar__logo-icon">
            <svg width="28" height="28" viewBox="0 0 28 28" fill="none">
              <circle cx="14" cy="14" r="12" stroke="url(#logoGrad)" strokeWidth="2" />
              <circle cx="14" cy="8" r="2" fill="#00d4ff" />
              <circle cx="8" cy="14" r="1.5" fill="#7c3aed" />
              <circle cx="20" cy="14" r="1.5" fill="#7c3aed" />
              <circle cx="10" cy="20" r="1.5" fill="#00d4ff" />
              <circle cx="18" cy="20" r="1.5" fill="#00d4ff" />
              <line x1="14" y1="8" x2="8" y2="14" stroke="#00d4ff" strokeWidth="1.2" />
              <line x1="14" y1="8" x2="20" y2="14" stroke="#00d4ff" strokeWidth="1.2" />
              <line x1="8" y1="14" x2="10" y2="20" stroke="#7c3aed" strokeWidth="1.2" />
              <line x1="20" y1="14" x2="18" y2="20" stroke="#7c3aed" strokeWidth="1.2" />
              <line x1="8" y1="14" x2="20" y2="14" stroke="#00d4ff" strokeWidth="0.8" opacity="0.4" />
              <defs>
                <linearGradient id="logoGrad" x1="0" y1="0" x2="28" y2="28">
                  <stop stopColor="#00d4ff" />
                  <stop offset="1" stopColor="#7c3aed" />
                </linearGradient>
              </defs>
            </svg>
          </span>
          <span className="navbar__logo-text">动知</span>
        </a>

        <div className="navbar__links">
          {links.map((l) => (
            <a key={l.href} href={l.href} className="navbar__link">
              {l.label}
            </a>
          ))}
        </div>

        <a href="#features" className="navbar__cta">开始体验</a>

        <button
          className={`navbar__hamburger ${mobileOpen ? 'navbar__hamburger--open' : ''}`}
          onClick={() => setMobileOpen(!mobileOpen)}
          aria-label="菜单"
        >
          <span />
          <span />
          <span />
        </button>
      </div>

      {mobileOpen && (
        <div className="navbar__mobile">
          {links.map((l) => (
            <a
              key={l.href}
              href={l.href}
              className="navbar__mobile-link"
              onClick={() => setMobileOpen(false)}
            >
              {l.label}
            </a>
          ))}
          <a href="#features" className="navbar__mobile-cta" onClick={() => setMobileOpen(false)}>
            开始体验
          </a>
        </div>
      )}
    </nav>
  );
}
