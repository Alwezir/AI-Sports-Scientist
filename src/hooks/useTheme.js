import { useState, useEffect, useCallback } from 'react';

const STORAGE_KEY = 'dongzhi_theme';

/**
 * 主题切换 hook
 * - 初值来自 <html data-theme>（由 index.html 的 inline script 提前设置，避免闪烁）
 * - 切换时同步写入 localStorage 与 <html data-theme>
 * - 跟随系统 prefers-color-scheme 变化（仅当用户未显式选择时）
 */
export default function useTheme() {
  const [theme, setTheme] = useState(() => {
    if (typeof document !== 'undefined') {
      return document.documentElement.getAttribute('data-theme') === 'light' ? 'light' : 'dark';
    }
    return 'dark';
  });

  useEffect(() => {
    const root = document.documentElement;
    root.setAttribute('data-theme', theme);
    try {
      localStorage.setItem(STORAGE_KEY, theme);
    } catch (e) {
      /* 忽略隐私模式写入失败 */
    }
  }, [theme]);

  // 系统偏好变化时跟随（仅当用户未手动选择过）
  useEffect(() => {
    const mq = window.matchMedia('(prefers-color-scheme: light)');
    const handler = (e) => {
      let saved = null;
      try {
        saved = localStorage.getItem(STORAGE_KEY);
      } catch (err) {
        /* 忽略 */
      }
      if (!saved) {
        setTheme(e.matches ? 'light' : 'dark');
      }
    };
    mq.addEventListener?.('change', handler);
    return () => mq.removeEventListener?.('change', handler);
  }, []);

  const toggle = useCallback(() => {
    setTheme((prev) => (prev === 'light' ? 'dark' : 'light'));
  }, []);

  return { theme, toggle, isLight: theme === 'light' };
}
