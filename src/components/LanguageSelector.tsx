import type { ChangeEvent } from "react";
import { LANGUAGES, type LanguageCode } from "@/lib/languages";

interface LanguageSelectorProps {
  id: string;
  label: string;
  value: LanguageCode;
  options: LanguageCode[];
  onChange: (value: LanguageCode) => void;
  disabled?: boolean;
}

const LANGUAGE_FLAGS: Record<LanguageCode, string> = {
  en: "🇺🇸",
  hyw: "🇦🇲",
  hye: "🇦🇲",
};

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
            position: "absolute",
            left: "10px",
            top: "50%",
            transform: "translateY(-50%)",
            zIndex: 1,
            display: "inline-flex",
            alignItems: "center",
            justifyContent: "center",
            fontSize: "18px",
            lineHeight: 1,
            pointerEvents: "none"
          }}
        >
          {LANGUAGE_FLAGS[value]}
        </span>

        <select
          id={id}
          value={value}
          onChange={(event: ChangeEvent<HTMLSelectElement>) => onChange(event.target.value as LanguageCode)}
          disabled={disabled}
          style={{ paddingLeft: "36px" }}
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
