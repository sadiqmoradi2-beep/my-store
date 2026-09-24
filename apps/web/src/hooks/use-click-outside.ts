import { RefObject, useEffect } from 'react';

/** Automatically close a menu/dropdown on an outside click or pressing Escape */
export function useClickOutside(ref: RefObject<HTMLElement | null>, onOutside: () => void) {
  useEffect(() => {
    function handlePointer(e: MouseEvent) {
      if (ref.current && !ref.current.contains(e.target as Node)) onOutside();
    }
    function handleKey(e: KeyboardEvent) {
      if (e.key === 'Escape') onOutside();
    }
    document.addEventListener('mousedown', handlePointer);
    document.addEventListener('keydown', handleKey);
    return () => {
      document.removeEventListener('mousedown', handlePointer);
      document.removeEventListener('keydown', handleKey);
    };
  }, [ref, onOutside]);
}
