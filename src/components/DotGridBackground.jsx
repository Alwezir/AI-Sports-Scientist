import './DotGridBackground.css';

export default function DotGridBackground({ className = '' }) {
  return <div className={`dot-grid-bg ${className}`} aria-hidden="true" />;
}
