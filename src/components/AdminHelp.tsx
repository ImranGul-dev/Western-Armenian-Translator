"use client";

import {
  useCallback,
  useEffect,
  useId,
  useRef,
  useState,
} from "react";

interface AdminHelpProps {
  title: string;
  description: string;
  example: string;
  label?: string;
}

interface TooltipPosition {
  top: number;
  left: number;
  width: number;
}

export function AdminHelp({
  title,
  description,
  example,
  label,
}: AdminHelpProps) {
  const [open, setOpen] = useState(false);

  const [position, setPosition] =
    useState<TooltipPosition>({
      top: 0,
      left: 0,
      width: 340,
    });

  const buttonRef =
    useRef<HTMLButtonElement | null>(null);

  const tooltipId = useId();

  const updatePosition = useCallback(() => {
    const button = buttonRef.current;

    if (
      !button ||
      typeof window === "undefined"
    ) {
      return;
    }

    const rect =
      button.getBoundingClientRect();

    const width = Math.min(
      340,
      window.innerWidth - 24,
    );

    const left = Math.max(
      12,
      Math.min(
        rect.left,
        window.innerWidth - width - 12,
      ),
    );

    let top = rect.bottom + 8;

    const estimatedHeight = 190;

    if (
      top + estimatedHeight >
      window.innerHeight - 12
    ) {
      top = Math.max(
        12,
        rect.top - estimatedHeight - 8,
      );
    }

    setPosition({
      top,
      left,
      width,
    });
  }, []);

  useEffect(() => {
    if (!open) {
      return;
    }

    updatePosition();

    const syncPosition = () => {
      updatePosition();
    };

    window.addEventListener(
      "resize",
      syncPosition,
    );

    window.addEventListener(
      "scroll",
      syncPosition,
      true,
    );

    return () => {
      window.removeEventListener(
        "resize",
        syncPosition,
      );

      window.removeEventListener(
        "scroll",
        syncPosition,
        true,
      );
    };
  }, [open, updatePosition]);

  return (
    <span className="admin-help">
      <button
        ref={buttonRef}
        type="button"
        className="admin-help-button"
        aria-label={
          label || `Help for ${title}`
        }
        aria-expanded={open}
        aria-describedby={
          open
            ? tooltipId
            : undefined
        }
        onMouseEnter={() =>
          setOpen(true)
        }
        onMouseLeave={() =>
          setOpen(false)
        }
        onFocus={() =>
          setOpen(true)
        }
        onBlur={() =>
          setOpen(false)
        }
        onClick={() => {
          setOpen(
            (current) => !current,
          );
        }}
        onKeyDown={(event) => {
          if (
            event.key === "Escape"
          ) {
            setOpen(false);
          }
        }}
      >
        i
      </button>

      {open && (
        <span
          id={tooltipId}
          role="tooltip"
          className="admin-help-tooltip"
          style={{
            top: position.top,
            left: position.left,
            width: position.width,
          }}
        >
          <strong className="admin-help-title">
            {title}
          </strong>

          <span>
            {description}
          </span>

          <span className="admin-help-example">
            <strong>Example:</strong>{" "}
            {example}
          </span>
        </span>
      )}
    </span>
  );
}