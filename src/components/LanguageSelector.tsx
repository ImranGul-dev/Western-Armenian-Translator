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
        <select
          id={id}
          value={value}
          onChange={(event: ChangeEvent<HTMLSelectElement>) => onChange(event.target.value as LanguageCode)}
          disabled={disabled}
        >
          {options.map((code) => (
            <option key={code} value={code}>
              {LANGUAGE_FLAGS[code]} {LANGUAGES[code].name}
            </option>
          ))}
        </select>
        <span className="select-chevron" aria-hidden="true">⌄</span>
      </div>
    </div>
  );
}
