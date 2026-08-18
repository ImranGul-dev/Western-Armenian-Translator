"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { DashboardShell } from "@/components/DashboardShell";
import { ProtectedRoute } from "@/components/ProtectedRoute";
import { useAuth } from "@/contexts/AuthContext";
import { CountryPicker } from "@/components/CountryPicker";
import {
  DEFAULT_LEARNING_PREFERENCES,
  normalizeLearningPreferences,
  type LearningMicrophoneLanguage,
  type LearningPlaybackSpeed,
  type LearningVoice,
} from "@/lib/learning-preferences";
import { getSupabaseBrowserClient } from "@/lib/supabase/client";
import styles from "./settings.module.css";

const PLAYBACK_SPEED_OPTIONS: LearningPlaybackSpeed[] = [
  0.75,
  1,
  1.25,
  1.5,
];

export default function SettingsPage() {
  const { profile, refreshProfile } = useAuth();
  const [name, setName] = useState("");
  const [countryCode, setCountryCode] = useState("");
  const [history, setHistory] = useState(true);
  const [queryReviewConsent, setQueryReviewConsent] = useState(false);
  const [ttsVoice, setTtsVoice] = useState<LearningVoice>(
    DEFAULT_LEARNING_PREFERENCES.tts_voice,
  );
  const [audioSpeed, setAudioSpeed] = useState<LearningPlaybackSpeed>(
    DEFAULT_LEARNING_PREFERENCES.audio_speed,
  );
  const [pronunciationSpeed, setPronunciationSpeed] =
    useState<LearningPlaybackSpeed>(
      DEFAULT_LEARNING_PREFERENCES.pronunciation_speed,
    );
  const [microphoneLanguage, setMicrophoneLanguage] =
    useState<LearningMicrophoneLanguage>(
      DEFAULT_LEARNING_PREFERENCES.microphone_language,
    );
  const [autoTranslate, setAutoTranslate] = useState(
    DEFAULT_LEARNING_PREFERENCES.auto_translate,
  );
  const [message, setMessage] = useState("");
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    const preferences = normalizeLearningPreferences(
      profile?.learning_preferences,
    );

    setName(profile?.display_name || "");
    setCountryCode(profile?.country_code || "");
    setHistory(profile?.history_enabled ?? true);
    setQueryReviewConsent(profile?.query_review_consent ?? false);
    setTtsVoice(preferences.tts_voice);
    setAudioSpeed(preferences.audio_speed);
    setPronunciationSpeed(preferences.pronunciation_speed);
    setMicrophoneLanguage(preferences.microphone_language);
    setAutoTranslate(preferences.auto_translate);
  }, [profile]);

  async function save(event: React.FormEvent) {
    event.preventDefault();

    if (!profile?.id || saving) return;

    setSaving(true);
    setMessage("");

    const supabase = getSupabaseBrowserClient();
    const allowAdminReview = history && queryReviewConsent;

    const { error } = await supabase
      .from("profiles")
      .update({
        display_name: name,
        country_code: countryCode || null,
        history_enabled: history,
        query_review_consent: allowAdminReview,
        learning_preferences: {
          tts_voice: ttsVoice,
          audio_speed: audioSpeed,
          pronunciation_speed: pronunciationSpeed,
          microphone_language: microphoneLanguage,
          auto_translate: autoTranslate,
        },
      })
      .eq("id", profile.id);

    if (!error && !allowAdminReview) {
      const { error: historyError } = await supabase
        .from("translation_history")
        .update({ admin_visible: false })
        .eq("user_id", profile.id);

      if (historyError) {
        setMessage(historyError.message);
        setSaving(false);
        return;
      }
    }

    setMessage(error ? error.message : "Settings saved.");

    if (!error) {
      await refreshProfile();
    }

    setSaving(false);
  }

  return (
    <ProtectedRoute>
      <DashboardShell
        title="Account settings"
        description="Control your profile, learning preferences and translation history privacy."
      >
        <form className="dashboard-card form-grid" onSubmit={save}>
          <h2>Profile</h2>

          <label>
            Display name
            <input
              value={name}
              onChange={(event) => setName(event.target.value)}
            />
          </label>

          <div className="country-field">
            <span className="country-field-label">Country</span>
            <CountryPicker
              value={countryCode}
              onChange={setCountryCode}
              allowEmpty
              emptyLabel="Not set"
            />
          </div>

          <hr />

          <div>
            <h2>Audio & learning</h2>
            <p className="form-help">
              These preferences are saved to your account and will be used
              across supported learning tools.
            </p>
          </div>

          <label>
            AI voice
            <select
              className={styles.settingsSelect}
              value={ttsVoice}
              onChange={(event) =>
                setTtsVoice(
                  event.target.value === "cedar" ? "cedar" : "marin",
                )
              }
            >
              <option value="marin">Marin</option>
              <option value="cedar">Cedar</option>
            </select>
          </label>

          <label>
            Audio playback speed
            <select
              className={styles.settingsSelect}
              value={audioSpeed}
              onChange={(event) =>
                setAudioSpeed(
                  Number(event.target.value) as LearningPlaybackSpeed,
                )
              }
            >
              {PLAYBACK_SPEED_OPTIONS.map((speed) => (
                <option key={speed} value={speed}>
                  {speed}x
                </option>
              ))}
            </select>
          </label>

          <label>
            Pronunciation playback speed
            <select
              className={styles.settingsSelect}
              value={pronunciationSpeed}
              onChange={(event) =>
                setPronunciationSpeed(
                  Number(event.target.value) as LearningPlaybackSpeed,
                )
              }
            >
              {PLAYBACK_SPEED_OPTIONS.map((speed) => (
                <option key={speed} value={speed}>
                  {speed}x
                </option>
              ))}
            </select>
          </label>

          <label>
            Default microphone language
            <select
              className={styles.settingsSelect}
              value={microphoneLanguage}
              onChange={(event) =>
                setMicrophoneLanguage(
                  event.target.value === "en" ? "en" : "hyw",
                )
              }
            >
              <option value="hyw">Western Armenian</option>
              <option value="en">English</option>
            </select>
          </label>

          <label className="checkbox-label">
            <input
              type="checkbox"
              checked={autoTranslate}
              onChange={(event) => setAutoTranslate(event.target.checked)}
            />
            <span>Automatically translate while typing when signed in</span>
          </label>

          <hr />

          <div>
            <h2>Translation history</h2>
          </div>

          <label className="checkbox-label">
            <input
              type="checkbox"
              checked={history}
              onChange={(event) => {
                setHistory(event.target.checked);

                if (!event.target.checked) {
                  setQueryReviewConsent(false);
                }
              }}
            />
            <span>Save translation history for my signed-in account</span>
          </label>

          <label className="checkbox-label">
            <input
              type="checkbox"
              checked={queryReviewConsent}
              disabled={!history}
              onChange={(event) =>
                setQueryReviewConsent(event.target.checked)
              }
            />
            <span>
              Allow administrators to review future saved translations to
              improve translation quality
            </span>
          </label>

          <p className="form-help">
            This consent is optional. Turning it off removes existing saved
            translations from the administrator query-review area.
          </p>

          <button className="primary-button" type="submit" disabled={saving}>
            {saving ? "Saving..." : "Save settings"}
          </button>

          {message && <p className="form-message">{message}</p>}
        </form>

        <section className="dashboard-card">
          <h2>Billing</h2>

          <p>
            View invoices, update your payment method, manage your plan or
            cancel your subscription from Billing.
          </p>

          <Link
            className="primary-button inline-button"
            href="/dashboard/billing"
          >
            Open billing settings
          </Link>
        </section>
      </DashboardShell>
    </ProtectedRoute>
  );
}
