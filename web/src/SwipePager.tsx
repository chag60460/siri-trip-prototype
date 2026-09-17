import { useCallback, useEffect, useRef, useState } from 'react';
import type { PointerEvent, ReactNode } from 'react';
import { screenAfterSwipe, screenNames, screens, swipeAxis } from './navigation';
import type { Screen } from './navigation';
import './swipe-pager.css';

interface Gesture {
  pointer: number;
  startX: number;
  startY: number;
  lastX: number;
  lastTime: number;
  velocity: number;
  width: number;
  scale: number;
  translation: number;
  horizontal: boolean;
}

function ignoresSwipes(target: EventTarget | null) {
  return target instanceof Element
    && Boolean(target.closest('input, textarea, select, [contenteditable="true"], [role="dialog"], [data-swipe-ignore]'));
}

export function SwipePager({ active, onChange, disabled, pages }: {
  active: Screen;
  onChange: (screen: Screen) => void;
  disabled: boolean;
  pages: Record<Screen, ReactNode>;
}) {
  const viewport = useRef<HTMLDivElement>(null);
  const track = useRef<HTMLDivElement>(null);
  const gesture = useRef<Gesture | null>(null);
  const suppressClickUntil = useRef(0);
  const wheel = useRef({ distance: 0, lastTime: 0, committed: false });
  const [offset, setOffset] = useState(0);
  const [dragging, setDragging] = useState(false);
  const index = screens.indexOf(active);

  const cancelGesture = useCallback(() => {
    const current = gesture.current;
    gesture.current = null;
    setOffset(0);
    setDragging(false);
    if (current && viewport.current?.hasPointerCapture(current.pointer)) {
      viewport.current.releasePointerCapture(current.pointer);
    }
  }, []);

  useEffect(() => {
    cancelGesture();
    window.addEventListener('resize', cancelGesture);
    return () => window.removeEventListener('resize', cancelGesture);
  }, [active, disabled, cancelGesture]);

  useEffect(() => {
    const node = viewport.current;
    if (!node) return;
    const onWheel = (event: WheelEvent) => {
      if (disabled || event.ctrlKey || ignoresSwipes(event.target)
        || Math.abs(event.deltaX) <= Math.abs(event.deltaY) * 1.15) return;
      event.preventDefault();
      const now = performance.now();
      if (now - wheel.current.lastTime > 220) {
        wheel.current.distance = 0;
        wheel.current.committed = false;
      }
      wheel.current.lastTime = now;
      if (wheel.current.committed) return;
      const unit = event.deltaMode === 1 ? 16 : event.deltaMode === 2 ? node.clientWidth : 1;
      const scale = node.getBoundingClientRect().width / node.clientWidth;
      wheel.current.distance -= event.deltaX * unit / scale;
      if (Math.abs(wheel.current.distance) >= node.clientWidth * 0.22) {
        wheel.current.committed = true;
        onChange(screenAfterSwipe(active, wheel.current.distance, 0, node.clientWidth));
      }
    };
    node.addEventListener('wheel', onWheel, { passive: false });
    return () => node.removeEventListener('wheel', onWheel);
  }, [active, disabled, onChange]);

  const pointerDown = (event: PointerEvent<HTMLDivElement>) => {
    if (disabled || !event.isPrimary || event.button !== 0 || gesture.current || ignoresSwipes(event.target)) return;
    suppressClickUntil.current = 0;
    const width = event.currentTarget.clientWidth;
    gesture.current = {
      pointer: event.pointerId, startX: event.clientX, startY: event.clientY,
      lastX: event.clientX, lastTime: performance.now(), velocity: 0, width,
      scale: event.currentTarget.getBoundingClientRect().width / width,
      translation: -index * width, horizontal: false,
    };
  };

  const pointerMove = (event: PointerEvent<HTMLDivElement>) => {
    const current = gesture.current;
    if (!current || event.pointerId !== current.pointer) return;
    const x = (event.clientX - current.startX) / current.scale;
    const y = (event.clientY - current.startY) / current.scale;
    if (!current.horizontal) {
      const axis = swipeAxis(x, y);
      if (axis === 'vertical') {
        cancelGesture();
        return;
      }
      if (!axis) return;
      current.horizontal = true;
      // Continue from the visible position if a new swipe interrupts the previous snap.
      const transform = track.current ? getComputedStyle(track.current).transform : 'none';
      current.translation = transform === 'none' ? 0 : new DOMMatrixReadOnly(transform).m41;
      event.currentTarget.setPointerCapture(event.pointerId);
      setDragging(true);
    }
    event.preventDefault();
    const now = performance.now();
    current.velocity = (event.clientX - current.lastX) / current.scale / Math.max(1, now - current.lastTime);
    current.lastX = event.clientX;
    current.lastTime = now;
    const atEdge = (index === 0 && x > 0) || (index === screens.length - 1 && x < 0);
    setOffset(current.translation + index * current.width + (atEdge ? x * 0.25 : x));
  };

  const pointerUp = (event: PointerEvent<HTMLDivElement>) => {
    const current = gesture.current;
    if (!current || current.pointer !== event.pointerId) return;
    const distance = (event.clientX - current.startX) / current.scale;
    const velocity = performance.now() - current.lastTime < 100 ? current.velocity : 0;
    if (current.horizontal) {
      suppressClickUntil.current = performance.now() + 350;
      onChange(screenAfterSwipe(active, distance, velocity, current.width));
    }
    cancelGesture();
  };

  return <div ref={viewport} className={`screen-pager${dragging ? ' dragging' : ''}`}
    role="region" aria-label={`Phone screens, ${screenNames[active]}`} tabIndex={0}
    data-active-screen={active}
    onPointerDown={pointerDown} onPointerMove={pointerMove} onPointerUp={pointerUp}
    onPointerCancel={cancelGesture}
    onLostPointerCapture={event => {
      if (event.target === event.currentTarget) cancelGesture();
    }}
    onDragStart={event => event.preventDefault()}
    onClickCapture={event => {
      if (event.detail > 0 && performance.now() < suppressClickUntil.current) {
        event.preventDefault();
        event.stopPropagation();
        suppressClickUntil.current = 0;
      }
    }}
    onKeyDown={event => {
      if (disabled || ignoresSwipes(event.target)) return;
      const direction = event.key === 'ArrowLeft' ? -1 : event.key === 'ArrowRight' ? 1 : 0;
      if (!direction) return;
      event.preventDefault();
      const destination = screens[index + direction];
      if (destination) onChange(destination);
    }}>
    <div className="screen-track" ref={track}
      style={{ transform: `translate3d(calc(${-index * 100}% + ${offset}px), 0, 0)` }}>
      {screens.map(screen => <div className={`swipe-page swipe-page--${screen}`}
        key={screen} data-screen={screen} inert={screen !== active} aria-hidden={screen !== active}>
        {pages[screen]}
      </div>)}
    </div>
  </div>;
}
