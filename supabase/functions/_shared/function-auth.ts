import type { SupabaseClient, User } from "@supabase/supabase-js";
export async function requireUser(admin:SupabaseClient,request:Request):Promise<User>{
  const match=(request.headers.get("authorization")||"").match(/^Bearer\s+(.+)$/i);
  if(!match)throw new Error("AUTH_REQUIRED");
  const{data,error}=await admin.auth.getUser(match[1]);if(error||!data.user)throw new Error("AUTH_REQUIRED");return data.user;
}
