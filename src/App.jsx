import { BrowserRouter, Routes, Route, useNavigate, useLocation } from 'react-router-dom';
import { useEffect } from 'react';
import PillNav from './components/PillNav';
import Hero from './components/Hero';
import PainPoints from './components/PainPoints';
import Features from './components/Features';
import TechHighlights from './components/TechHighlights';
import MuscleMap from './components/MuscleMap';
import ScienceCards from './components/ScienceCards';
import Footer from './components/Footer';
import ThemeToggle from './components/ThemeToggle/ThemeToggle';
import EvaluationPage from './pages/EvaluationPage';
import ProfilePage from './pages/ProfilePage';
import ChatPage from './pages/ChatPage';
import MuscleMapPage from './pages/MuscleMapPage';
import './App.css';

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
        <Route path="/evaluation" element={<EvaluationPage />} />
        <Route path="/profile" element={<ProfilePage />} />
        <Route path="/chat" element={<ChatPage />} />
        <Route path="/muscle-map" element={<MuscleMapPage />} />
      </Routes>
      <ThemeToggle />
    </BrowserRouter>
  );
}
