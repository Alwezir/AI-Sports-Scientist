import { BrowserRouter, Routes, Route, useNavigate, useLocation } from 'react-router-dom';
import { useEffect, Suspense, lazy } from 'react';
import PillNav from './components/PillNav';
import Hero from './components/Hero';
import PainPoints from './components/PainPoints';
import Features from './components/Features';
import TechHighlights from './components/TechHighlights';
import MuscleMap from './components/MuscleMap';
import ScienceCards from './components/ScienceCards';
import Footer from './components/Footer';
import ThemeToggle from './components/ThemeToggle/ThemeToggle';
import './App.css';

// 子页面独立 chunk，首屏不下发，移动端大幅减包
const EvaluationPage = lazy(() => import('./pages/EvaluationPage'));
const ProfilePage = lazy(() => import('./pages/ProfilePage'));
const ChatPage = lazy(() => import('./pages/ChatPage'));
const MuscleMapPage = lazy(() => import('./pages/MuscleMapPage'));

function PageSkeleton() {
  return (
    <div className="app-skeleton" aria-hidden="true">
      <div className="app-skeleton__nav" />
      <div className="app-skeleton__content">
        <div className="app-skeleton__line app-skeleton__line--lg" />
        <div className="app-skeleton__line app-skeleton__line--md" />
        <div className="app-skeleton__line app-skeleton__line--md" />
        <div className="app-skeleton__line app-skeleton__line--sm" />
      </div>
    </div>
  );
}

const navItems = [
  { label: '痛点', href: '#pain-points' },
  { label: '功能', href: '#features' },
  { label: '技术', href: '#tech' },
  { label: '团队', href: '#footer' },
];

function SpaRedirectRestore() {
  const navigate = useNavigate();
  const location = useLocation();

  useEffect(() => {
    const saved = sessionStorage.getItem('spa-redirect');
    if (!saved) return;
    sessionStorage.removeItem('spa-redirect');

    const base = import.meta.env.BASE_URL.replace(/\/$/, '');
    let target = saved;

    if (target.startsWith(base)) {
      target = target.slice(base.length);
    }
    if (!target.startsWith('/')) {
      target = '/' + target;
    }

    if (target && target !== '/' && target !== location.pathname) {
      navigate(target, { replace: true });
    }
  }, [navigate, location.pathname]);

  return null;
}

function HomePage() {
  return (
    <div className="app">
      <PillNav
        items={navItems}
        activeHref="#features"
      />
      <Hero />
      <PainPoints />
      <Features />
      <TechHighlights />
      <MuscleMap />
      <ScienceCards />
      <Footer />
    </div>
  );
}

export default function App() {
  return (
    <BrowserRouter basename={import.meta.env.BASE_URL.replace(/\/$/, '')}>
      <SpaRedirectRestore />
      <Routes>
        <Route path="/" element={<HomePage />} />
        <Route path="/evaluation" element={<Suspense fallback={<PageSkeleton />}><EvaluationPage /></Suspense>} />
        <Route path="/profile" element={<Suspense fallback={<PageSkeleton />}><ProfilePage /></Suspense>} />
        <Route path="/chat" element={<Suspense fallback={<PageSkeleton />}><ChatPage /></Suspense>} />
        <Route path="/muscle-map" element={<Suspense fallback={<PageSkeleton />}><MuscleMapPage /></Suspense>} />
      </Routes>
      <ThemeToggle />
    </BrowserRouter>
  );
}
