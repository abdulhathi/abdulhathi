import { useEffect, useLayoutEffect, useRef, type RefObject } from 'react';

/**
 * Keeps a scroll container pinned to the bottom while content streams in, unless the user has scrolled up to read:
 * then it leaves them where they are until they scroll back down.
 */
export function useStickToBottom(ref: RefObject<HTMLElement | null>, content: unknown) {
  const pinned = useRef(true);

  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    const onScroll = () => {
      pinned.current = el.scrollHeight - el.scrollTop - el.clientHeight < 40;
    };
    el.addEventListener('scroll', onScroll, { passive: true });
    return () => el.removeEventListener('scroll', onScroll);
  }, [ref]);

  useLayoutEffect(() => {
    const el = ref.current;
    if (el && pinned.current) el.scrollTop = el.scrollHeight;
  }, [ref, content]);
}
