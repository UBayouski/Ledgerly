"use client";

import { useEffect, useRef } from "react";

/** Keep the native modal (and its focus trap) open until its exit motion finishes. */
export function usePanelDialog(onClose: () => void) {
  const dialogRef = useRef<HTMLDialogElement>(null);
  const completionRef = useRef<(() => void) | null>(null);
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    const dialog = dialogRef.current;
    if (!dialog) return;
    dialog.classList.remove("is-closing");
    dialog.showModal();
    return () => {
      if (timerRef.current !== null) clearTimeout(timerRef.current);
      timerRef.current = null;
      completionRef.current = null;
      if (dialog.open) dialog.close();
    };
  }, []);

  const close = (afterClose?: () => void) => {
    const dialog = dialogRef.current;
    if (!dialog?.open || dialog.classList.contains("is-closing")) return;
    completionRef.current = afterClose ?? null;
    if (window.matchMedia("(prefers-reduced-motion: reduce)").matches) {
      dialog.close();
      return;
    }
    dialog.classList.add("is-closing");
    // A fallback also covers browsers that suppress transitionend events.
    timerRef.current = setTimeout(() => dialog.close(), 200);
  };

  const finishTransition = () => {
    const dialog = dialogRef.current;
    if (!dialog?.classList.contains("is-closing")) return;
    if (timerRef.current !== null) clearTimeout(timerRef.current);
    timerRef.current = null;
    dialog.close();
  };

  const handleClose = () => {
    // Ignore a queued close event from Strict Mode's initial effect cleanup.
    if (dialogRef.current?.open) return;
    const complete = completionRef.current ?? onClose;
    completionRef.current = null;
    complete();
  };

  return { dialogRef, close, handleClose, finishTransition };
}
