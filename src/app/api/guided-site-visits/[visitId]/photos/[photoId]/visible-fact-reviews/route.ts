import {NextRequest,NextResponse} from "next/server";
import {authorizeGuidedSiteVisit} from "@/lib/guided-site-visits/access";
import {exactObject,UUID} from "@/lib/guided-site-visits/core";
import {runOpenAiVisibleFactReview,VISIBLE_FACT_MODEL,VISIBLE_FACT_PROMPT_VERSION,VISIBLE_FACT_PROVIDER,VISIBLE_FACT_SCHEMA_VERSION} from "@/lib/guided-site-visits/ai-visible-facts";
import {createHash} from "node:crypto";
import {GUIDED_VISIBLE_FACT_CRITERIA} from "@/lib/guided-site-visits/visible-fact-criteria";
import {getServerFeatureMap} from "@/lib/features/server";
import {createAdminServerClient} from "@/lib/supabase/admin-server";

const FIELDS=new Set(["idempotencyKey","manualFallback"]);

export async function POST(request:NextRequest,{params}:{params:Promise<{visitId:string;photoId:string}>}){
 try{
  const auth=await authorizeGuidedSiteVisit(request);if(auth.response)return auth.response;
  const features=await getServerFeatureMap({scopeType:"global",scopeId:"default"});
  if(!features.guided_site_visit_ai_visible_facts)return NextResponse.json({success:false,error:"AI visible-fact review is disabled."},{status:403});
  const{visitId,photoId}=await params;if(!UUID.test(visitId)||!UUID.test(photoId))return NextResponse.json({success:false,error:"Invalid ID."},{status:400});
  const body=exactObject(await request.json(),FIELDS),idempotencyKey=typeof body.idempotencyKey==="string"?body.idempotencyKey.trim():"",manualFallback=body.manualFallback===true;
  if(!idempotencyKey||idempotencyKey.length>200||body.manualFallback!==undefined&&typeof body.manualFallback!=="boolean")return NextResponse.json({success:false,error:"Invalid review request."},{status:400});
  const db=createAdminServerClient();
  const existing=await db.from("guided_site_visit_ai_visible_fact_reviews").select("id,visit_id,photo_attempt_id,provider,created_by_auth_user_id,criteria,recommended_next_capture,created_at").eq("company_id",auth.authorization!.companyId).eq("idempotency_key",idempotencyKey).maybeSingle();
  if(existing.error)return NextResponse.json({success:false,error:"AI visible-fact review could not be loaded."},{status:500});
  if(existing.data){const modeMatches=manualFallback?existing.data.provider==="local_manual_boundary":existing.data.provider===VISIBLE_FACT_PROVIDER;return existing.data.visit_id===visitId&&existing.data.photo_attempt_id===photoId&&existing.data.created_by_auth_user_id===auth.authorization!.authUserId&&modeMatches?NextResponse.json({success:true,reviewId:existing.data.id,sourceMode:manualFallback?"manual":"ai",criteria:existing.data.criteria,recommendedNextCapture:existing.data.recommended_next_capture,createdAt:existing.data.created_at,idempotentReplay:true}):NextResponse.json({success:false,error:"Idempotency key already belongs to a different review request."},{status:409});}
  const attempt=await db.from("guided_site_visit_photo_attempts").select("id,asset_id,visit_item_id,state,ai_estimator_assets!inner(storage_path,mime_type,status),guided_site_visit_items!inner(item_key,title)").eq("id",photoId).eq("visit_id",visitId).eq("company_id",auth.authorization!.companyId).maybeSingle();
  if(attempt.error||!attempt.data||attempt.data.state!=="confirmed")return NextResponse.json({success:false,error:"Active confirmed photo not found."},{status:404});
  const linked=attempt.data as unknown as {asset_id:string;visit_item_id:string;ai_estimator_assets:{storage_path:string;mime_type:string;status:string};guided_site_visit_items:{item_key:string;title:string}};
  const criteria=GUIDED_VISIBLE_FACT_CRITERIA[linked.guided_site_visit_items.item_key];
  if(!criteria)return NextResponse.json({success:false,error:"This capture has no approved visible-fact checklist."},{status:422});
  const usability=await db.from("guided_site_visit_ai_usability_reviews").select("id,verdict").eq("company_id",auth.authorization!.companyId).eq("visit_id",visitId).eq("visit_item_id",linked.visit_item_id).eq("photo_attempt_id",photoId).eq("asset_id",linked.asset_id).eq("verdict","usable").order("created_at",{ascending:false}).order("id",{ascending:false}).limit(1).maybeSingle();
  if(usability.error)return NextResponse.json({success:false,error:"Photo usability evidence could not be loaded."},{status:500});
  if(!usability.data)return NextResponse.json({success:false,error:"A photo review is required before visible facts can be checked."},{status:409});
  const asset=linked.ai_estimator_assets;let result,requestSha256,responseSha256,providerName=VISIBLE_FACT_PROVIDER,modelVersion=VISIBLE_FACT_MODEL;
  if(manualFallback){result={criteria:criteria.map(entry=>({criterionKey:entry.key,status:"unclear" as const})),recommendedNextCapture:{criterionKey:criteria[0].key,actionCode:"change_angle" as const}};const boundary=JSON.stringify({schema:VISIBLE_FACT_SCHEMA_VERSION,photoId,usabilityReviewId:usability.data.id,criteria:criteria.map(entry=>entry.key)});requestSha256=createHash("sha256").update(boundary).digest("hex");responseSha256=createHash("sha256").update(JSON.stringify(result)).digest("hex");providerName="local_manual_boundary";modelVersion="human-check-required-v1";}
  else{if(asset.status!=="available"||["image/heic","image/heif"].includes(asset.mime_type))return NextResponse.json({success:false,error:"Choose a JPEG, PNG, or WebP photo for visible-fact review."},{status:409});const download=await db.storage.from("ai-estimator-private").download(asset.storage_path);if(download.error||!download.data)return NextResponse.json({success:false,error:"Private photo could not be downloaded."},{status:409});const provider=await runOpenAiVisibleFactReview({bytes:await download.data.arrayBuffer(),mimeType:asset.mime_type,idempotencyKey:`${auth.authorization!.companyId}:${idempotencyKey}`,captureTitle:linked.guided_site_visit_items.title,criteria});result=provider.result;requestSha256=provider.requestSha256;responseSha256=provider.responseSha256;}
  const saved=await db.rpc("record_guided_site_visit_ai_visible_fact_review",{requested_auth_user_id:auth.authorization!.authUserId,requested_visit_id:visitId,requested_visit_item_id:linked.visit_item_id,requested_photo_attempt_id:photoId,requested_asset_id:linked.asset_id,requested_usability_review_id:usability.data.id,requested_idempotency_key:idempotencyKey,requested_provider:providerName,requested_model_version:modelVersion,requested_prompt_version:VISIBLE_FACT_PROMPT_VERSION,requested_schema_version:VISIBLE_FACT_SCHEMA_VERSION,requested_request_sha256:requestSha256,requested_response_sha256:responseSha256,requested_criteria:result.criteria,requested_recommended_next_capture:result.recommendedNextCapture});
  if(saved.error)return NextResponse.json({success:false,error:"AI visible-fact review could not be recorded."},{status:500});
  const row=(saved.data as Record<string,unknown>[])[0];if(row.result_code==="idempotency_conflict")return NextResponse.json({success:false,error:"Idempotency key conflict."},{status:409});if(row.result_code!=="ok")return NextResponse.json({success:false,error:"AI visible-fact review was rejected."},{status:422});
  return NextResponse.json({success:true,reviewId:row.review_id,sourceMode:manualFallback?"manual":"ai",criteria:result.criteria,recommendedNextCapture:result.recommendedNextCapture,idempotentReplay:row.idempotent_replay},{status:row.idempotent_replay?200:201});
 }catch(error){return NextResponse.json({success:false,error:error instanceof TypeError?error.message:"AI visible-fact review failed."},{status:error instanceof TypeError?400:500});}
}
