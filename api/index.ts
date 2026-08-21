import express from "express";
import type { Request, Response } from "express";

let capturedApp: any = null;
let serverLoadPromise: Promise<void> | null = null;

async function ensureExpressServerLoaded() {
  if (capturedApp) return;
  if (!serverLoadPromise) serverLoadPromise = (async () => {
    const originalListen = (express.application as any).listen;
    try {
      (express.application as any).listen = function (..._args: any[]) { capturedApp = this; return { on(){return this;}, close(cb?:()=>void){cb?.();} } as any; };
      process.env.NODE_ENV = "production";
      await import("../server.ts");
    } finally { (express.application as any).listen = originalListen; }
  })();
  await serverLoadPromise;
}

function firstMatch(text:string, patterns:RegExp[]) { for (const p of patterns) { const m=text.match(p); if(m?.[1]) return m[1].trim(); } return null; }
function money(v?:string|null){ if(!v || v.trim()==="-") return null; const n=Number(v.replace(/[^0-9.-]/g,"")); return Number.isFinite(n)?n:null; }
function norm(v:any){ return String(v||"").toUpperCase().replace(/[^A-Z0-9]/g,""); }

// pdfjs references browser graphics globals even when we only request text.
// Vercel's Node runtime does not provide these globals and native canvas is not
// guaranteed to be bundled. Minimal no-op shims are enough for text extraction.
function ensurePdfJsNodeGlobals(){
  const g:any=globalThis as any;
  if(typeof g.DOMMatrix==="undefined") g.DOMMatrix=class DOMMatrix { constructor(_init?:any){} multiply(){return this;} preMultiplySelf(){return this;} translate(){return this;} scale(){return this;} rotate(){return this;} inverse(){return this;} };
  if(typeof g.ImageData==="undefined") g.ImageData=class ImageData { data:any; width:number; height:number; constructor(dataOrWidth:any,widthOrHeight:any,height?:any){ if(typeof dataOrWidth==="number"){this.width=dataOrWidth;this.height=widthOrHeight;this.data=new Uint8ClampedArray(this.width*this.height*4);}else{this.data=dataOrWidth;this.width=widthOrHeight;this.height=height||0;} } };
  if(typeof g.Path2D==="undefined") g.Path2D=class Path2D { constructor(_path?:any){} addPath(){} moveTo(){} lineTo(){} rect(){} closePath(){} bezierCurveTo(){} quadraticCurveTo(){} arc(){} arcTo(){} ellipse(){} };
}
async function extractPdfText(buffer:Buffer){ ensurePdfJsNodeGlobals(); const mod:any=await import("pdf-parse"); const PDFParse=mod.PDFParse; if(!PDFParse) throw new Error("PDF parser unavailable"); const parser=new PDFParse({data:buffer}); try { const r:any=await parser.getText(); return typeof r==="string"?r:String(r?.text||""); } finally { if(typeof parser.destroy==="function") await parser.destroy(); } }

function parseAccounts(text:string){
  const accountsPart=(text.split(/ENQUIRY DETAILS/i)[0]||text);
  const chunks=accountsPart.split(/\bMember Name\s*/i).slice(1);
  return chunks.map((chunk,index)=>{
    const member=firstMatch(chunk,[/^([^\n\r]+)/]);
    const accountType=firstMatch(chunk,[/Account Type\s*\n?\s*([^\n\r]+)/i]);
    const accountNumber=firstMatch(chunk,[/Account Number\s*\n?\s*([^\n\r]+)/i]);
    const ownership=firstMatch(chunk,[/Ownership\s*\n?\s*([^\n\r]+)/i]);
    const sanctioned=money(firstMatch(chunk,[/Sanctioned Amount\s*₹?\s*([\d,.-]+)/i]));
    const currentBalance=money(firstMatch(chunk,[/Current Balance\s*₹?\s*([\d,.-]+)/i]));
    const overdue=money(firstMatch(chunk,[/Amount Overdue\s*₹?\s*([\d,.-]+)/i]));
    const status=firstMatch(chunk,[/Credit Facility Status\s*\n?\s*([^\n\r]+)/i]);
    const writtenOffTotal=money(firstMatch(chunk,[/Written-off Amount \(Total\)\s*₹?\s*([\d,.-]+)/i]));
    const settlement=money(firstMatch(chunk,[/Settlement Amount\s*₹?\s*([\d,.-]+)/i]));
    const opened=firstMatch(chunk,[/Date Opened \/ Disbursed\s*(\d{1,2}\/\d{1,2}\/\d{4})/i]);
    const closed=firstMatch(chunk,[/Date Closed\s*(\d{1,2}\/\d{1,2}\/\d{4}|-)/i]);
    const reported=firstMatch(chunk,[/Date Reported And Certified\s*(\d{1,2}\/\d{1,2}\/\d{4})/i]);
    const emi=money(firstMatch(chunk,[/EMI Amount\s*₹?\s*([\d,.-]+)/i]));
    const dpds=[...chunk.matchAll(/(?:Jan|Feb|Mar|Apr|May|Jun|Jul|Aug|Sep|Oct|Nov|Dec)\s+20\d{2}\s+(\d{1,4})\b/gi)].map(m=>Number(m[1])).filter(Number.isFinite);
    return { id:index+1, memberName:member, accountType, accountNumber, ownership, sanctionedAmount:sanctioned, currentBalance, amountOverdue:overdue, creditFacilityStatus:status, writtenOffAmountTotal:writtenOffTotal, settlementAmount:settlement, dateOpened:opened, dateClosed:closed, dateReported:reported, emiAmount:emi, maxDpd:dpds.length?Math.max(...dpds):null, isOpen:!closed || closed==="-" };
  }).filter(a=>a.memberName && a.accountType && a.accountNumber);
}

function parseEnquiries(text:string){
  const part=text.split(/ENQUIRY DETAILS/i)[1]||"";
  const chunks=part.split(/\bMember Name\s*/i).slice(1);
  return chunks.map(c=>({ memberName:firstMatch(c,[/^([^\n\r]+)/]), dateOfEnquiry:firstMatch(c,[/Date Of Enquiry\s*(\d{1,2}\/\d{1,2}\/\d{4})/i]), enquiryPurpose:firstMatch(c,[/Enquiry Purpose\s*([^\n\r]+)/i]) })).filter(e=>e.memberName&&e.dateOfEnquiry);
}

async function handleCibil(req:Request,res:Response){
  try{
    const {fileName,fileDataUrl,manualDetails,customerName,panNumber,dob}=req.body||{};
    let text=String(manualDetails?.rawText||"");
    if(fileDataUrl && (String(fileName||"").toLowerCase().endsWith(".pdf")||String(fileDataUrl).includes("application/pdf"))) text=await extractPdfText(Buffer.from(String(fileDataUrl).split(",")[1]||String(fileDataUrl),"base64"));
    if(!text.trim()) return res.status(422).json({success:false,code:"CIBIL_TEXT_NOT_EXTRACTED",message:"Uploaded CIBIL PDF text could not be extracted."});

    const scoreRaw=firstMatch(text,[/Your CIBIL Score is\s*([3-9]\d{2})\s+as of Date/i,/CIBIL Score[^\d]{0,30}([3-9]\d{2})\b/i]);
    const score=scoreRaw?Number(scoreRaw):null;
    const controlNumber=firstMatch(text,[/Control Number\s*:\s*([\d,]+)/i]);
    const reportDate=firstMatch(text,[/Your CIBIL Score is\s*[3-9]\d{2}\s+as of Date\s*:\s*(\d{1,2}\/\d{1,2}\/\d{4})/i,/Control Number[^\n]*\nDate\s*:\s*(\d{1,2}\/\d{1,2}\/\d{4})/i]);
    const detectedPan=firstMatch(text,[/Identification Type\s+Income Tax ID Number \(PAN\)[\s\S]{0,100}?ID Number\s+([A-Z]{5}\d{4}[A-Z])/i,/\b([A-Z]{5}\d{4}[A-Z])\b/]);
    const detectedDob=firstMatch(text,[/Date Of Birth\s+(\d{1,2}\/\d{1,2}\/\d{4})/i]);
    const detectedName=firstMatch(text,[/Hello,\s*([^\n\r]+?)(?:\.|\n)/i,/PERSONAL DETAILS[\s\S]{0,100}?Name\s*\n?\s*([^\n\r]+)/i]);
    const accounts=parseAccounts(text);
    const enquiries=parseEnquiries(text);
    const openAccounts=accounts.filter(a=>a.isOpen);
    const writtenOff=accounts.filter(a=>/written[\s-]*off/i.test(a.creditFacilityStatus||"") || (a.writtenOffAmountTotal||0)>0);
    const settled=accounts.filter(a=>/settled/i.test(a.creditFacilityStatus||"") || (a.settlementAmount||0)>0);
    const totalOverdue=accounts.reduce((s,a)=>s+(a.amountOverdue||0),0);
    const totalOutstanding=openAccounts.reduce((s,a)=>s+Math.max(a.currentBalance||0,0),0);
    const activeCreditCardsCount=openAccounts.filter(a=>/credit card/i.test(a.accountType||"")).length;
    const activeLoansCount=openAccounts.length-activeCreditCardsCount;
    const dpdInstances=accounts.reduce((s,a)=>s+(a.maxDpd&&a.maxDpd>0?1:0),0);

    return res.json({success:true,message:"TransUnion CIBIL report parsed from uploaded source data.",report:{bureauName:"TransUnion CIBIL",score,controlNumber,reportDate,customerDetails:{name:detectedName,pan:detectedPan,dob:detectedDob},verifiedProfile:{matchedName:detectedName,matchedPan:detectedPan,matchedDob:detectedDob,isPanVerified:Boolean(panNumber&&detectedPan&&norm(panNumber)===norm(detectedPan)),isNameVerified:Boolean(customerName&&detectedName&&norm(customerName)===norm(detectedName)),isDobVerified:Boolean(dob&&detectedDob&&String(dob).replace(/\D/g,"")===String(detectedDob).replace(/\D/g,""))},summary:{activeLoansCount,activeCreditCardsCount,totalOutstanding,totalOverdue,settledAccountsCount:settled.length,writtenOffAccountsCount:writtenOff.length,totalEnquiries:enquiries.length,creditUtilizationPercent:null,dpdInstances},accounts,enquiries,extractionMeta:{mode:"TRANSUNION_CIBIL_SOURCE_ONLY",sourceTextCharacters:text.length,detectedAccounts:accounts.length,detectedEnquiries:enquiries.length,warnings:[]}}});
  }catch(error:any){ console.error("CIBIL parsing error",error); return res.status(500).json({success:false,message:"Failed to parse uploaded CIBIL report",error:error?.message}); }
}

export default async function handler(req:Request,res:Response){
  const path=req.url?.split("?")[0]||"";
  if(req.method==="GET"&&path==="/api/health") return res.json({status:"ok",app:"Savrdh Credit Resolution Customer App",runtime:"vercel-serverless"});
  if(req.method==="POST"&&path==="/api/cibil/parse-report") return handleCibil(req,res);
  try{await ensureExpressServerLoaded();}catch(error:any){return res.status(500).json({success:false,message:"Backend initialization failed",error:error?.message});}
  if(!capturedApp)return res.status(503).json({success:false,message:"SAVRDH API is initializing. Please retry."});
  return capturedApp(req,res);
}
