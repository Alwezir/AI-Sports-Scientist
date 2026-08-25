import { useEffect, useState } from 'react';

export default function useFinePointer() {
  const [isFine, setIsFine] = useState(false);

  useEffect(() => {
    const fine = window.matchMedia('(pointer: fine)');
    const coarse = window.matchMedia('(pointer: coarse)');
    // 只要设备支持触控（pointer: coarse）就不启用镜面效果，避免部分移动端
    // 浏览器同时上报 fine 导致初始化 WebGL 黑屏/白屏。
    const update = () => setIsFine(fine.matches && !coarse.matches);
    update();
    fine.addEventListener?.('change', update);
    coarse.addEventListener?.('change', update);
    return () => {
      fine.removeEventListener?.('change', update);
      coarse.removeEventListener?.('change', update);
    };
  }, []);

  return isFine;
}
