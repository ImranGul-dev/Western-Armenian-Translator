import { getSupabaseBrowserClient } from "@/lib/supabase/client";
import type { EffectivePlan, WidgetSite, WidgetTheme } from "@/types/database";

export interface WidgetDashboardData {
  effective_plan: EffectivePlan;
  sites: WidgetSite[];
}

export interface WidgetMutationInput {
  action: "create" | "update" | "rotate" | "delete" | "set_active";
  widgetId?: string | null;
  name?: string | null;
  allowedDomain?: string | null;
  active?: boolean | null;
  theme?: WidgetTheme | null;
  sourceLanguage?: "en" | "hyw" | "hye" | null;
  targetLanguage?: "en" | "hyw" | "hye" | null;
  showBranding?: boolean | null;
}

export async function loadWidgetDashboard(): Promise<WidgetDashboardData> {
  const { data, error } = await getSupabaseBrowserClient().rpc("get_my_widget_sites");
  if (error) throw new Error(error.message);
  return data as WidgetDashboardData;
}

export async function mutateWidget(input: WidgetMutationInput): Promise<WidgetSite> {
  const { data, error } = await getSupabaseBrowserClient().rpc("manage_widget_site", {
    p_action: input.action,
    p_widget_id: input.widgetId || null,
    p_name: input.name ?? null,
    p_allowed_domain: input.allowedDomain ?? null,
    p_active: input.active ?? null,
    p_theme: input.theme ?? null,
    p_source_language: input.sourceLanguage ?? null,
    p_target_language: input.targetLanguage ?? null,
    p_show_branding: input.showBranding ?? null
  });
  if (error) throw new Error(error.message);
  return data as WidgetSite;
}
