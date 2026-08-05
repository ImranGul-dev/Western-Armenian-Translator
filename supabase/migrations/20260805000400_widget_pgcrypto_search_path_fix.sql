create extension if not exists pgcrypto with schema extensions;

alter function public.manage_widget_site(
  text,
  uuid,
  text,
  text,
  boolean,
  text,
  text,
  text,
  boolean
)
set search_path = public, extensions;
