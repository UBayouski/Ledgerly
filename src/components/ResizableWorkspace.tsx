"use client";

import { useEffect, useRef, useState, type CSSProperties, type ReactNode } from "react";

const DEFAULT_WIDTH = 400;
const MIN_WIDTH = 320;
const MAX_WIDTH = 640;
const GRID_MIN_WIDTH = 600;
const DIVIDER_WIDTH = 8;

export function ResizableWorkspace({ children }: { children: [ReactNode, ReactNode] }) {
  const workspaceRef = useRef<HTMLDivElement>(null);
  const dragRef = useRef<{ pointerId: number; startX: number; startWidth: number } | null>(null);
  const [width, setWidth] = useState(DEFAULT_WIDTH);
  const [maxWidth, setMaxWidth] = useState(MAX_WIDTH);
  const [dragging, setDragging] = useState(false);

  useEffect(() => {
    const workspace = workspaceRef.current;
    if (!workspace) return;
    const observer = new ResizeObserver(() => {
      if (window.matchMedia("(max-width: 1100px)").matches) {
        dragRef.current = null;
        setDragging(false);
        return;
      }
      const maximum = Math.max(MIN_WIDTH, Math.min(MAX_WIDTH, workspace.clientWidth - GRID_MIN_WIDTH - DIVIDER_WIDTH));
      setMaxWidth(maximum);
      setWidth((current) => Math.min(current, maximum));
    });
    observer.observe(workspace);
    return () => observer.disconnect();
  }, []);

  const resize = (next: number) => setWidth(Math.max(MIN_WIDTH, Math.min(maxWidth, next)));
  const stopDragging = () => {
    dragRef.current = null;
    setDragging(false);
  };

  return (
    <div
      ref={workspaceRef}
      className={`workspace${dragging ? " workspace-resizing" : ""}`}
      style={{ "--copilot-width": `${width}px` } as CSSProperties}
    >
      {children[0]}
      <div
        className="workspace-divider"
        role="separator"
        tabIndex={0}
        aria-label="Copilot width"
        aria-orientation="vertical"
        aria-valuemin={MIN_WIDTH}
        aria-valuemax={maxWidth}
        aria-valuenow={Math.round(width)}
        aria-valuetext={`${Math.round(width)} pixels`}
        title="Drag or use arrow keys to resize Copilot. Double-click or press Enter to reset."
        onDoubleClick={() => resize(DEFAULT_WIDTH)}
        onKeyDown={(event) => {
          const step = event.shiftKey ? 40 : 16;
          let next: number;
          switch (event.key) {
            case "ArrowLeft": next = width + step; break;
            case "ArrowRight": next = width - step; break;
            case "Home": next = MIN_WIDTH; break;
            case "End": next = maxWidth; break;
            case "Enter": next = DEFAULT_WIDTH; break;
            default: return;
          }
          event.preventDefault();
          resize(next);
        }}
        onPointerDown={(event) => {
          if (!event.isPrimary || event.button !== 0) return;
          event.preventDefault();
          event.currentTarget.focus();
          event.currentTarget.setPointerCapture(event.pointerId);
          dragRef.current = { pointerId: event.pointerId, startX: event.clientX, startWidth: width };
          setDragging(true);
        }}
        onPointerMove={(event) => {
          const drag = dragRef.current;
          if (!drag || drag.pointerId !== event.pointerId) return;
          resize(drag.startWidth + drag.startX - event.clientX);
        }}
        onPointerUp={(event) => {
          if (event.currentTarget.hasPointerCapture(event.pointerId)) {
            event.currentTarget.releasePointerCapture(event.pointerId);
          }
          stopDragging();
        }}
        onPointerCancel={stopDragging}
        onLostPointerCapture={stopDragging}
      />
      {children[1]}
    </div>
  );
}
