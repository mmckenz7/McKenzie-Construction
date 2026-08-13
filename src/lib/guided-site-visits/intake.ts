import { createHash } from "node:crypto";
import { GUIDED_PHOTO_MAX_BYTES, GUIDED_PHOTO_MIME_TYPES, safeFilename, UUID } from "./core";

export const GUIDED_INTAKE_MAX_MEMBERS = 30;
export const GUIDED_INTAKE_TOTAL_WARNING_BYTES = 180 * 1024 * 1024;
export type IntakeManifestEntry = { ordinal:number; originalFilename:string; mimeType:string; byteSize:number; sha256:string };

export function stableGuidedUuid(scope:string){
  const bytes=createHash("sha256").update(scope).digest().subarray(0,16);
  bytes[6]=(bytes[6]&0x0f)|0x50; bytes[8]=(bytes[8]&0x3f)|0x80;
  const hex=bytes.toString("hex");
  return `${hex.slice(0,8)}-${hex.slice(8,12)}-${hex.slice(12,16)}-${hex.slice(16,20)}-${hex.slice(20)}`;
}
export function intakeManifest(value:unknown):IntakeManifestEntry[]{
  if(!Array.isArray(value)||value.length<1||value.length>GUIDED_INTAKE_MAX_MEMBERS)throw new TypeError("Select between 1 and 30 photos.");
  const seen=new Set<number>();
  return value.map(raw=>{
    if(!raw||typeof raw!=="object"||Array.isArray(raw))throw new TypeError("Photo manifest is invalid.");
    const row=raw as Record<string,unknown>;
    if(Object.keys(row).length!==5||!Number.isSafeInteger(row.ordinal)||(row.ordinal as number)<1||(row.ordinal as number)>value.length||seen.has(row.ordinal as number)
      ||typeof row.mimeType!=="string"||!GUIDED_PHOTO_MIME_TYPES.has(row.mimeType)||!Number.isSafeInteger(row.byteSize)||(row.byteSize as number)<1||(row.byteSize as number)>GUIDED_PHOTO_MAX_BYTES
      ||typeof row.sha256!=="string"||!/^[0-9a-f]{64}$/.test(row.sha256))throw new TypeError("Photo manifest is invalid.");
    seen.add(row.ordinal as number);
    return {ordinal:row.ordinal as number,originalFilename:safeFilename(row.originalFilename),mimeType:row.mimeType,byteSize:row.byteSize as number,sha256:row.sha256};
  }).sort((a,b)=>a.ordinal-b.ordinal);
}
export function intakeFingerprint(visitId:string,manifest:IntakeManifestEntry[]){
  return createHash("sha256").update(JSON.stringify({visitId,manifest})).digest("hex");
}
export function intakeId(value:unknown,label:string){if(typeof value!=="string"||!UUID.test(value))throw new TypeError(`${label} is invalid.`);return value;}
