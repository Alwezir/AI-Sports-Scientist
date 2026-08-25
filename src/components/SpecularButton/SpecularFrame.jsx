import { useRef } from 'react';
import { useSpecular } from './useSpecular';
import './SpecularFrame.css';

const SpecularFrame = ({
  children,
  as: Component = 'div',
  radius = 18,
  tint = '#ffffff',
  tintOpacity = 0,
  blur = 0,
  lineColor = '#ffffff',
  baseColor = '#525252',
  intensity = 1,
  shineSize = 10,
  shineFade = 40,
  thickness = 1,
  speed = 0.35,
  followMouse = true,
  proximity = 250,
  autoAnimate = false,
  className = '',
  ...rest
}) => {
  const containerRef = useRef(null);
  const fxRef = useRef(null);

  useSpecular(containerRef, fxRef, {
    radius,
    lineColor,
    baseColor,
    intensity,
    shineSize,
    shineFade,
    thickness,
    speed,
    followMouse,
    proximity,
    autoAnimate
  });

  return (
    <Component
      ref={containerRef}
      className={`specular-frame${className ? ` ${className}` : ''}`}
      style={{
        '--sf-radius': `${radius}px`,
        '--sf-tint': tint,
        '--sf-tint-opacity': tintOpacity,
        '--sf-blur': `${blur}px`
      }}
      {...rest}
    >
      <span ref={fxRef} className="specular-frame__fx" aria-hidden="true" />
      <div className="specular-frame__content">{children}</div>
    </Component>
  );
};

export default SpecularFrame;
