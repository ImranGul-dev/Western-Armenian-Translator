import type { ChangeEvent, KeyboardEvent, ReactNode } from "react";
import { CharacterCounter } from "@/components/CharacterCounter";
import { CopyButton } from "@/components/CopyButton";
import { LanguageSelector } from "@/components/LanguageSelector";
import { LANGUAGES, type LanguageCode } from "@/lib/languages";

interface BasePanelProps {
  languageLabel: string;
  languageId: string;
  language: LanguageCode;
  languageOptions: LanguageCode[];
  onLanguageChange: (language: LanguageCode) => void;
  panelActions?: ReactNode;
}

interface InputPanelProps extends BasePanelProps {
  mode: "input";
  value: string;
  onChange: (value: string) => void;
  onKeyDown: (event: KeyboardEvent<HTMLTextAreaElement>) => void;
  onClear: () => void;
  onPaste: () => void;
  maxCharacters: number;
}

interface OutputPanelProps extends BasePanelProps {
  mode: "output";
  value: string;
  loading: boolean;
  transliteration?: string;
}

type Props = InputPanelProps | OutputPanelProps;

export function TranslationPanel(props: Props) {
  const armenian = props.language === "hyw" || props.language === "hye";

  return <section className={`translation-panel ${props.mode === "output" ? "output-panel" : "input-panel"}`}>
    <div className="panel-header">
      <LanguageSelector
        id={props.languageId}
        label={props.languageLabel}
        value={props.language}
        options={props.languageOptions}
        onChange={props.onLanguageChange}
      />
      <div className="panel-actions">
        {props.mode === "input" ? <>
          <button type="button" onClick={props.onPaste} className="panel-action" aria-label="Paste text"><span>▣</span><span>Paste</span></button>
          <button type="button" onClick={props.onClear} disabled={!props.value} className="panel-action"><span>×</span><span>Clear</span></button>
        </> : <CopyButton text={props.value} disabled={props.loading && !props.value} />}
      </div>
    </div>

    {props.mode === "input" ? <div className="panel-body">
      <label className="sr-only" htmlFor="source-text">Text to translate</label>
      <textarea
        id="source-text"
        value={props.value}
        onChange={(event: ChangeEvent<HTMLTextAreaElement>) => props.onChange(event.target.value)}
        onKeyDown={props.onKeyDown}
        maxLength={props.maxCharacters}
        className={armenian ? "armenian-text" : undefined}
        placeholder="Enter or paste text…"
        spellCheck
      />
      <div className="panel-footer-row">
        <span className="keyboard-hint">Ctrl + Enter · limit {props.maxCharacters.toLocaleString()}</span>
        <CharacterCounter count={Array.from(props.value).length} max={props.maxCharacters} />
      </div>
    </div> : <div className="panel-body output-body" aria-busy={props.loading}>
      <div className={`translation-output ${armenian ? "armenian-text" : ""}`} role="region" aria-label="Translation result" aria-live="polite">
        {props.value || <span className="output-placeholder">Your translation will appear here.</span>}
      </div>
      {props.language === "hyw" && props.transliteration ? <div className="transliteration-block" aria-live="polite">
        <span className="transliteration-label">Latin transliteration</span>
        <span className="transliteration-text">{props.transliteration}</span>
      </div> : null}
      <div className="panel-footer-row output-footer">
        <span>{props.value ? LANGUAGES[props.language].name : ""}</span>
        <CharacterCounter count={Array.from(props.value).length} />
      </div>
    </div>}
  </section>;
}
