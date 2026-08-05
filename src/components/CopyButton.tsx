"use client";

import { useEffect, useState } from "react";

interface CopyButtonProps {
  text: string;
  disabled?: boolean;
}

export function CopyButton({ text, disabled = false }: CopyButtonProps) {
  const [copied, setCopied] = useState(false);

  useEffect(() => {
    if (!copied) return;
    const timer = window.setTimeout(() => setCopied(false), 1800);
    return () => window.clearTimeout(timer);
  }, [copied]);

  async function copyText() {
    if (!text || disabled) return;
    try {
      await navigator.clipboard.writeText(text);
      setCopied(true);
    } catch {
      setCopied(false);
    }
  }

  return (
    <button
      type="button"
      onClick={copyText}
      disabled={disabled || !text}
      className={copied ? "panel-action panel-action-success" : "panel-action"}
      aria-label={copied ? "Translation copied" : "Copy translation"}
      title={copied ? "Copied" : "Copy translation"}
    >
      <span aria-hidden="true">{copied ? "✓" : "⧉"}</span>
      <span>{copied ? "Copied" : "Copy"}</span>
    </button>
  );
}
