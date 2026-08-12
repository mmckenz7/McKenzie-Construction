import "server-only";
import { NextResponse, type NextRequest } from "next/server";
import { getAuthenticatedAccess } from "@/lib/api-auth";
import { getServerFeatureMap } from "@/lib/features/server";
import { createAdminServerClient } from "@/lib/supabase/admin-server";
import type { EffectiveWorkspaceAccess } from "@/lib/workspace-access";

export async function authorizeGuidedSiteVisit(_request: NextRequest | Request) {
  void _request;
  const authenticated = await getAuthenticatedAccess();
  if (!authenticated) return { authorization: null, response: NextResponse.json({success:false,error:"Authentication required."},{status:401}) };
  const supabase=createAdminServerClient();
  const result=await supabase.rpc("get_effective_user_access",{requested_auth_user_id:authenticated.user.id});
  const access=result.data as EffectiveWorkspaceAccess|null;
  const role=String(access?.role??"");
  if (result.error || !access || access.portal_access?.sales!==true || access.permissions?.capture_site_visits!==true
    || !["owner","administrator","estimator"].includes(role)) {
    return {authorization:null,response:NextResponse.json({success:false,error:"Guided site-visit access is required."},{status:403})};
  }
  const features=await getServerFeatureMap({scopeType:"global",scopeId:"default"});
  if (!features.guided_site_visits) return {authorization:null,response:NextResponse.json({success:false,error:"Guided site visits are disabled."},{status:403})};
  return {authorization:{authUserId:authenticated.user.id,companyId:String(access.company_id)},response:null};
}
