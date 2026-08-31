"use client";

import { useCallback, useEffect, useRef, useState } from "react";

export type FeedbackKind = "success" | "error";

export function useFeedback() {
  const [feedback, setFeedback] = useState<{ message: string; kind: FeedbackKind } | null>(null);
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);

  const clearFeedback = useCallback(() => {
    if (timer.current) clearTimeout(timer.current);
    timer.current = null;
    setFeedback(null);
  }, []);

  const showFeedback = useCallback((message: string, kind: FeedbackKind = "success") => {
    if (timer.current) clearTimeout(timer.current);
    setFeedback({ message, kind });
    timer.current = kind === "success" ? setTimeout(() => {
      timer.current = null;
      setFeedback(null);
    }, 3000) : null;
  }, []);

  useEffect(() => () => {
    if (timer.current) clearTimeout(timer.current);
  }, []);

  return { feedback, showFeedback, clearFeedback };
}

export function FeedbackMessage({ feedback, onClose }: { feedback: { message: string; kind: FeedbackKind } | null; onClose: () => void }) {
  if (!feedback) return null;
  return <div className={`detail-message ${feedback.kind}`} role={feedback.kind === "error" ? "alert" : "status"} aria-live={feedback.kind === "error" ? "assertive" : "polite"}>
    <span>{feedback.message}</span>
    <button type="button" aria-label="Fechar mensagem" onClick={onClose}>×</button>
  </div>;
}
