export const GUIDED_PHOTO_MAX_BYTES=15*1024*1024;
export const GUIDED_PHOTO_MIME_TYPES=new Set(["image/jpeg","image/png","image/webp","image/heic","image/heif"]);
export const UUID=/^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
export function exactObject(value:unknown,fields:ReadonlySet<string>){
 if(!value||typeof value!=="object"||Array.isArray(value))throw new TypeError("A JSON object is required.");
 const record=value as Record<string,unknown>;if(Object.keys(record).some(k=>!fields.has(k)))throw new TypeError("Unsupported field.");return record;
}
export function revision(value:unknown){if(!Number.isSafeInteger(value)||(value as number)<0)throw new TypeError("expectedRevision is invalid.");return value as number;}
export function safeFilename(value:unknown){if(typeof value!=="string"||value.length<1||value.length>240||/[\\/\x00-\x1f]/.test(value))throw new TypeError("originalFilename is invalid.");return value;}
export function photoPath(company:string,caseId:string,assetId:string,filename:string){return `${company}/${caseId}/${assetId}/${filename.replace(/[^A-Za-z0-9._-]/g,"-")}`;}
