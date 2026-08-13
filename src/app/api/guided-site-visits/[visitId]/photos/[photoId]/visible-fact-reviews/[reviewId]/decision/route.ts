import {NextRequest,NextResponse} from "next/server";
import {authorizeGuidedSiteVisit} from "@/lib/guided-site-visits/access";
import {exactObject,revision,UUID} from "@/lib/guided-site-visits/core";
import {validateVisibleFactResult} from "@/lib/guided-site-visits/ai-visible-facts";
import {GUIDED_VISIBLE_FACT_CRITERIA} from "@/lib/guided-site-visits/visible-fact-criteria";
import {getServerFeatureMap} from "@/lib/features/server";
import {createAdminServerClient} from "@/lib/supabase/admin-server";

const FIELDS=new Set(["itemId","expectedRevision","idempotencyKey","decision","nextAction","finalCriteria","recommendedNextCapture","observation"]);

export async function POST(request:NextRequest,{params}:{params:Promise<{visitId:string;photoId:string;reviewId:string}>}){
 try{
  const auth=await authorizeGuidedSiteVisit(request);if(auth.response)return auth.response;
  const features=await getServerFeatureMap({scopeType:"global",scopeId:"default"});if(!features.guided_site_visit_ai_visible_facts)return NextResponse.json({success:false,error:"AI visible-fact review is disabled."},{status:403});
  const{visitId,photoId,reviewId}=await params;if(!UUID.test(visitId)||!UUID.test(photoId)||!UUID.test(reviewId))return NextResponse.json({success:false,error:"Invalid ID."},{status:400});
  const body=exactObject(await request.json(),FIELDS),itemId=typeof body.itemId==="string"?body.itemId:"",idempotencyKey=typeof body.idempotencyKey==="string"?body.idempotencyKey.trim():"",decision=body.decision,nextAction=body.nextAction;
  if(!UUID.test(itemId)||!idempotencyKey||idempotencyKey.length>200||!(["accepted","corrected"] as unknown[]).includes(decision)||!(["confirm_item","retake_photo"] as unknown[]).includes(nextAction))throw new TypeError("Invalid visible-fact decision.");
  const db=createAdminServerClient();const item=await db.from("guided_site_visit_items").select("item_key").eq("id",itemId).eq("visit_id",visitId).eq("company_id",auth.authorization!.companyId).maybeSingle();if(item.error||!item.data)return NextResponse.json({success:false,error:"Visit item not found."},{status:404});
  const declared=GUIDED_VISIBLE_FACT_CRITERIA[item.data.item_key];if(!declared)throw new TypeError("This item has no approved visible-fact checklist.");
  const final=validateVisibleFactResult({criteria:body.finalCriteria,recommendedNextCapture:body.recommendedNextCapture??null},declared.map(entry=>entry.key));
  if(nextAction==="confirm_item"&&final.criteria.some(entry=>entry.status!=="visible"))return NextResponse.json({success:false,error:"Retake the photo or confirm every requested item is visible before continuing."},{status:422});
  if(nextAction==="retake_photo"&&final.criteria.every(entry=>entry.status==="visible"))return NextResponse.json({success:false,error:"A retake needs a missing or unclear checklist item."},{status:422});
  const saved=await db.rpc("decide_guided_site_visit_visible_facts",{requested_auth_user_id:auth.authorization!.authUserId,requested_visit_id:visitId,requested_item_id:itemId,requested_photo_attempt_id:photoId,requested_review_id:reviewId,requested_expected_revision:revision(body.expectedRevision),requested_idempotency_key:idempotencyKey,requested_decision:decision,requested_next_action:nextAction,requested_final_criteria:final.criteria,requested_final_recommended_next_capture:final.recommendedNextCapture,requested_observation:nextAction==="confirm_item"?body.observation:null});
  if(saved.error)return NextResponse.json({success:false,error:"Visible-fact decision could not be recorded."},{status:500});const row=(saved.data as Record<string,unknown>[])[0];
  const status=row.result_code==="ok"?200:["idempotency_conflict","stale_revision","not_editable","stale_photo"].includes(String(row.result_code))?409:row.result_code==="not_found"?404:row.result_code==="forbidden"?403:422;
  if(row.result_code!=="ok")return NextResponse.json({success:false,error:"Capture confirmation was rejected.",resultCode:row.result_code,nextRevision:row.next_revision},{status});
  return NextResponse.json({success:true,decisionId:row.decision_id,nextRevision:row.next_revision,idempotentReplay:row.idempotent_replay});
 }catch(error){return NextResponse.json({success:false,error:error instanceof TypeError?error.message:"Visible-fact decision failed."},{status:error instanceof TypeError?400:500});}
}
