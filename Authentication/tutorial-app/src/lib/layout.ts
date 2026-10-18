import { useCallback, useEffect, useState } from 'react';
import { readJson, writeJson } from './storage';

const MENU_KEY = 'auth-lab.menu-hidden';
const WIDTH_KEY = 'auth-lab.width';
export type Width = 'full' | 'reading';

/** The menu column (shown or hidden) and the content width (the full screen or a reading column), remembered. */
export function useLayout() {
  const [menuHidden, setMenuHidden] = useState(() => readJson<unknown>(MENU_KEY, false) === true);
  const [width, setWidth] = useState<Width>(() => (readJson<unknown>(WIDTH_KEY, 'full') === 'reading' ? 'reading' : 'full'));
  useEffect(() => writeJson(MENU_KEY, menuHidden), [menuHidden]);
  useEffect(() => writeJson(WIDTH_KEY, width), [width]);
  const toggleMenu = useCallback(() => setMenuHidden((h) => !h), []);
  const toggleWidth = useCallback(() => setWidth((w) => (w === 'full' ? 'reading' : 'full')), []);

  // "[" hides or shows the menu from anywhere, except while typing (fields and the code editor).
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key !== '[' || e.metaKey || e.ctrlKey || e.altKey) return;
      const target = e.target as HTMLElement | null;
      if (target && (['INPUT', 'TEXTAREA', 'SELECT'].includes(target.tagName) || target.isContentEditable)) return;
      e.preventDefault();
      toggleMenu();
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [toggleMenu]);

  return { menuHidden, toggleMenu, width, toggleWidth };
}
