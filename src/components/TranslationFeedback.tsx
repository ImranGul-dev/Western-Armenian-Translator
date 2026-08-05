"use client";

import Link from "next/link";
import { useState } from "react";
import { getSupabaseBrowserClient } from "@/lib/supabase/client";
import { useAuth } from "@/contexts/AuthContext";
import type { LanguageCode } from "@/lib/languages";

interface Props { requestId: string; sourceText: string; translation: string; sourceLanguage: LanguageCode; targetLanguage: LanguageCode; }
export function TranslationFeedback(props: Props) {
  const { user } = useAuth();
  const [mode,setMode]=useState<"idle"|"correction"|"sent">("idle");
  const [suggestion,setSuggestion]=useState("");
  const [comment,setComment]=useState("");
  const [message,setMessage]=useState("");
  const [saving,setSaving]=useState(false);

  async function submit(rating: "helpful"|"not_accurate"|"correction") {
    if (!user) { setMessage("Please log in to submit feedback."); return; }
    setSaving(true); setMessage("");
    try {
      const supabase=getSupabaseBrowserClient();
      const { error }=await supabase.from("translation_feedback").insert({
        user_id:user.id, request_id:props.requestId, source_language:props.sourceLanguage,
        target_language:props.targetLanguage, source_text:props.sourceText, generated_translation:props.translation,
        rating, suggested_translation: suggestion.trim() || null, comment:comment.trim() || null, status:"pending"
      });
      if(error) throw error;
      setMode("sent"); setMessage("Thank you. Your feedback was saved for private review.");
    } catch(error) { setMessage(error instanceof Error ? error.message : "Could not save feedback."); }
    finally { setSaving(false); }
  }

  if (!user) return <div className="translation-feedback"><span>Sign in to submit private translation feedback.</span> <Link href="/login">Log in</Link></div>;
  if(mode==="sent") return <div className="feedback-success" role="status">✓ {message}</div>;
  return (
    <div className="translation-feedback">
      <div className="feedback-row"><span>Was this translation helpful?</span>
        <button type="button" disabled={saving} onClick={()=>void submit("helpful")}>Helpful</button>
        <button type="button" disabled={saving} onClick={()=>void submit("not_accurate")}>Not accurate</button>
        <button type="button" onClick={()=>setMode(mode==="correction"?"idle":"correction")}>Suggest a correction</button>
      </div>
      {mode==="correction" && <div className="correction-form">
        <label>Suggested translation<textarea value={suggestion} onChange={e=>setSuggestion(e.target.value)} required /></label>
        <label>Optional comment<textarea value={comment} onChange={e=>setComment(e.target.value)} /></label>
        <div><button className="primary-button" type="button" disabled={saving || !suggestion.trim()} onClick={()=>void submit("correction")}>{saving?"Saving…":"Submit correction"}</button></div>
      </div>}
      {message && <p className="form-message error">{message}</p>}
    </div>
  );
}
