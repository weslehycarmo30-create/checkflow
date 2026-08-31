"use client";

import { useCallback, useEffect, useRef, useState } from "react";

export type FeedbackKind = "success" | "error";
export const SUCCESS_FEEDBACK_DURATION_MS = 3000;

type FeedbackState = { id: number; message: string; kind: FeedbackKind };

export function useFeedback() {
  const [feedback, setFeedback] = useState<FeedbackState | null>(null);
  const nextFeedbackId = useRef(0);

  const clearFeedback = useCallback(() => {
    setFeedback(null);
  }, []);

  const showFeedback = useCallback((message: string, kind: FeedbackKind = "success") => {
    nextFeedbackId.current += 1;
    setFeedback({ id: nextFeedbackId.current, message, kind });
  }, []);

  useEffect(() => {
    if (!feedback || feedback.kind !== "success") return;
    const timer = window.setTimeout(() => {
      setFeedback(current => current?.id === feedback.id ? null : current);
    }, SUCCESS_FEEDBACK_DURATION_MS);
    return () => window.clearTimeout(timer);
  }, [feedback]);

  return { feedback, showFeedback, clearFeedback };
}

export function FeedbackMessage({ feedback, onClose }: { feedback: FeedbackState | null; onClose: () => void }) {
  if (!feedback) return null;
  return <div className={`detail-message ${feedback.kind}`} role={feedback.kind === "error" ? "alert" : "status"} aria-live={feedback.kind === "error" ? "assertive" : "polite"}>
    <span>{feedback.message}</span>
    <button type="button" aria-label="Fechar mensagem" onClick={onClose}>×</button>
  </div>;
}
