import type { ChangeEvent, CSSProperties } from "react";
import { LANGUAGES, type LanguageCode } from "@/lib/languages";

interface LanguageSelectorProps {
  id: string;
  label: string;
  value: LanguageCode;
  options: LanguageCode[];
  onChange: (value: LanguageCode) => void;
  disabled?: boolean;
}

function flagStyle(code: LanguageCode): CSSProperties {
  const base: CSSProperties = {
    width: "22px",
    height: "14px",
    display: "inline-block",
    flex: "0 0 22px",
    borderRadius: "2px",
    overflow: "hidden",
    boxShadow: "inset 0 0 0 1px rgba(0, 0, 0, 0.08)",
  };

  if (code === "en") {
    return {
      ...base,
      background:
        "repeating-linear-gradient(to bottom, #b22234 0 7.7%, #ffffff 7.7% 15.4%)",
      position: "relative",
    };
  }

  return {
    ...base,
    background:
      "linear-gradient(to bottom, #d90012 0 33.333%, #0033a0 33.333% 66.666%, #f2a800 66.666% 100%)",
  };
}

export function LanguageSelector({
  id,
  label,
  value,
  options,
  onChange,
  disabled = false
}: LanguageSelectorProps) {
  return (
    <div className="language-control">
      <label htmlFor={id}>{label}</label>
      <div className="select-wrap">
        <span
          aria-hidden="true"
          style={{
            ...flagStyle(value),
            position: "absolute",
            left: "10px",
            top: "50%",
            transform: "translateY(-50%)",
            zIndex: 1,
            pointerEvents: "none"
          }}
        >
          {value === "en" ? (
            <span
              style={{
                position: "absolute",
                left: 0,
                top: 0,
                width: "9px",
                height: "7px",
                background: "#3c3b6e",
              }}
            />
          ) : null}
        </span>

        <select
          id={id}
          value={value}
          onChange={(event: ChangeEvent<HTMLSelectElement>) => onChange(event.target.value as LanguageCode)}
          disabled={disabled}
          style={{ paddingLeft: "42px" }}
        >
          {options.map((code) => (
            <option key={code} value={code}>
              {LANGUAGES[code].name}
            </option>
          ))}
        </select>
        <span className="select-chevron" aria-hidden="true">⌄</span>
      </div>
    </div>
  );
}
