"use client";

import { useId, useState } from "react";

interface AdminHelpProps {
  description: string;
  example: string;
  label?: string;
}

export function AdminHelp({
  description,
  example,
  label = "More information",
}: AdminHelpProps) {
  const [open, setOpen] = useState(false);
  const tooltipId = useId();

  return (
    <span
      className="admin-help"
      onMouseEnter={() => setOpen(true)}
      onMouseLeave={() => setOpen(false)}
    >
      <button
        type="button"
        className="admin-help-button"
        aria-label={label}
        aria-expanded={open}
        aria-describedby={open ? tooltipId : undefined}
        onFocus={() => setOpen(true)}
        onBlur={() => setOpen(false)}
        onClick={() => setOpen((current) => !current)}
        onKeyDown={(event) => {
          if (event.key === "Escape") {
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
        >
          <span>{description}</span>

          <span className="admin-help-example">
            <strong>Example:</strong> {example}
          </span>
        </span>
      )}
    </span>
  );
}