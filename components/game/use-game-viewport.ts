'use client';

import { useEffect } from 'react';

export function useGameViewport(playing: boolean) {
  useEffect(() => {
    const viewport = window.visualViewport;
    if (!playing || !viewport) return;
    const root = document.documentElement;

    function clear() {
      root.removeAttribute('data-game-keyboard');
      root.style.removeProperty('--game-viewport-height');
      root.style.removeProperty('--game-viewport-top');
    }

    const fit = () => {
      // A soft keyboard can shrink the visual viewport without changing viewport units.
      if (viewport.scale !== 1 || root.clientHeight - viewport.height < 120) {
        clear();
        return;
      }
      root.style.setProperty('--game-viewport-height', `${Math.floor(viewport.height)}px`);
      root.style.setProperty('--game-viewport-top', `${viewport.offsetTop}px`);
      root.setAttribute('data-game-keyboard', '');
    };

    fit();
    viewport.addEventListener('resize', fit);
    viewport.addEventListener('scroll', fit);
    return () => {
      viewport.removeEventListener('resize', fit);
      viewport.removeEventListener('scroll', fit);
      clear();
    };
  }, [playing]);
}
