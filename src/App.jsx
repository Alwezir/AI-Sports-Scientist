import { BrowserRouter, Routes, Route } from 'react-router-dom';
import PillNav from './components/PillNav';
import Hero from './components/Hero';
import Features from './components/Features';
import TechHighlights from './components/TechHighlights';
import MuscleMap from './components/MuscleMap';
import ScienceCards from './components/ScienceCards';
import Footer from './components/Footer';
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

function HomePage() {
  return (
    <div className="app">
      <PillNav
        items={navItems}
        activeHref="#features"
        baseColor="#0a0a14"
        pillColor="#1a1a2e"
        hoveredPillTextColor="#0a0a14"
      />
      <Hero />
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
      <Routes>
        <Route path="/" element={<HomePage />} />
        <Route path="/evaluation" element={<EvaluationPage />} />
        <Route path="/profile" element={<ProfilePage />} />
        <Route path="/chat" element={<ChatPage />} />
        <Route path="/muscle-map" element={<MuscleMapPage />} />
      </Routes>
    </BrowserRouter>
  );
}
