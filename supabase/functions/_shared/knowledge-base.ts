import type { SupabaseClient } from "@supabase/supabase-js";
import type { LanguageCode, TranslationContext } from "./types.ts";
const EMPTY: TranslationContext={glossary:[],grammarRules:[],approvedExamples:[]};
function arr<T>(v:unknown):T[]{return Array.isArray(v)?v as T[]:[]}
export async function findRelevantContext(admin:SupabaseClient,text:string,source:LanguageCode,target:LanguageCode):Promise<TranslationContext>{
  const{data,error}=await admin.rpc("find_translation_context",{p_text:text,p_source_language:source,p_target_language:target,p_glossary_limit:12,p_example_limit:4,p_rule_limit:6});
  if(error||!data||typeof data!=="object"||Array.isArray(data))return EMPTY;const r=data as Record<string,unknown>;
  const context={glossary:arr(r.glossary),grammarRules:arr(r.grammarRules),approvedExamples:arr(r.approvedExamples)};
  // Defensive cap: never allow the database context to grow without bound.
  if(JSON.stringify(context).length>14_000)return {glossary:context.glossary.slice(0,8),grammarRules:context.grammarRules.slice(0,3),approvedExamples:context.approvedExamples.slice(0,2)};
  return context;
}
