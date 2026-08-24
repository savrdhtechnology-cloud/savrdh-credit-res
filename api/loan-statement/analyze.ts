function pdfGlobals(){
  const g:any=globalThis
  if(typeof g.DOMMatrix==='undefined')g.DOMMatrix=class{constructor(_x?:any){} multiply(){return this} preMultiplySelf(){return this} translate(){return this} scale(){return this} rotate(){return this} inverse(){return this}}
  if(typeof g.ImageData==='undefined')g.ImageData=class{data:any;width:number;height:number;constructor(a:any,b:any,c?:any){if(typeof a==='number'){this.width=a;this.height=b;this.data=new Uint8ClampedArray(a*b*4)}else{this.data=a;this.width=b;this.height=c||0}}}
  if(typeof g.Path2D==='undefined')g.Path2D=class{constructor(_x?:any){} addPath(){} moveTo(){} lineTo(){} rect(){} closePath(){} bezierCurveTo(){} quadraticCurveTo(){} arc(){} arcTo(){} ellipse(){}}
}

async function extractPdfText(dataUrl:string){
  pdfGlobals()
  const b64=dataUrl.includes(',')?dataUrl.split(',')[1]:dataUrl
  const buffer=Buffer.from(b64,'base64')
  const worker:any=await import('pdf-parse/worker')
  const mod:any=await import('pdf-parse')
  if(mod.PDFParse){
    if(typeof mod.PDFParse.setWorker==='function'){
      const workerPath=typeof worker.getPath==='function'?worker.getPath():typeof worker.getData==='function'?worker.getData():null
      if(workerPath)mod.PDFParse.setWorker(workerPath)
    }
    const parser=new mod.PDFParse({data:buffer,CanvasFactory:worker.CanvasFactory})
    try{const out:any=await parser.getText();return typeof out==='string'?out:String(out?.text||'')}
    finally{await parser.destroy?.()}
  }
  if(typeof mod.default==='function'){const out:any=await mod.default(buffer);return String(out?.text||'')}
  throw new Error('Local PDF text engine unavailable')
}

function cleanText(text:string){return String(text||'').replace(/\u00a0/g,' ').replace(/[ \t]+/g,' ').replace(/\r/g,'').trim()}
function amount(v:any){if(v==null||v==='')return null;const n=Number(String(v).replace(/[^0-9.-]/g,''));return Number.isFinite(n)?n:null}
function first(text:string,patterns:RegExp[]){for(const p of patterns){const m=text.match(p);if(m?.[1]!=null&&String(m[1]).trim()!=='')return String(m[1]).trim()}return null}
function moneyAfter(text:string,labels:string[]){for(const label of labels){const escaped=label.replace(/[.*+?^${}()|[\]\\]/g,'\\$&');const patterns=[
  new RegExp(`${escaped}\\s*(?:amount|balance|payable)?\\s*[:=-]?\\s*(?:rs\\.?|inr|₹)?\\s*([0-9][0-9,]*(?:\\.\\d{1,2})?)`,'i'),
  new RegExp(`${escaped}[^\\n]{0,45}?(?:rs\\.?|inr|₹)?\\s*([0-9][0-9,]*(?:\\.\\d{1,2})?)`,'i')
];for(const p of patterns){const m=text.match(p);if(m?.[1]){const n=amount(m[1]);if(n!==null)return n}}}return null}
function countAfter(text:string,labels:string[]){for(const label of labels){const escaped=label.replace(/[.*+?^${}()|[\]\\]/g,'\\$&');const m=text.match(new RegExp(`${escaped}\\s*[:=-]?\\s*(\\d{1,4})`,'i'));if(m?.[1])return Number(m[1])}return null}
function dateAfter(text:string,labels:string[]){for(const label of labels){const escaped=label.replace(/[.*+?^${}()|[\]\\]/g,'\\$&');const m=text.match(new RegExp(`${escaped}\\s*[:=-]?\\s*(\\d{1,2}[\\/-]\\d{1,2}[\\/-]\\d{2,4}|\\d{4}[\\/-]\\d{1,2}[\\/-]\\d{1,2}|\\d{1,2}\\s+[A-Za-z]{3,9}\\s+\\d{4})`,'i'));if(m?.[1])return m[1]}return null}

function parseTransactions(text:string){
  const rows:any[]=[]
  const lines=text.split('\n').map(x=>x.trim()).filter(Boolean)
  const dateRe=/^(\d{1,2}[\/-]\d{1,2}[\/-]\d{2,4}|\d{1,2}\s+[A-Za-z]{3,9}\s+\d{2,4})\s+(.+)$/
  for(const line of lines){
    const m=line.match(dateRe);if(!m)continue
    const nums=[...m[2].matchAll(/(?:₹|Rs\.?|INR)?\s*(-?\d[\d,]*(?:\.\d{1,2})?)/gi)].map(x=>amount(x[1])).filter((x):x is number=>x!==null)
    const description=m[2].replace(/(?:₹|Rs\.?|INR)?\s*-?\d[\d,]*(?:\.\d{1,2})?/gi,' ').replace(/\s+/g,' ').trim()
    const lower=description.toLowerCase()
    let type='TRANSACTION'
    if(/bounce|return|dishonou?r|failed|nach rtn|ecs rtn/.test(lower))type='BOUNCE'
    else if(/penal|penalty|late fee|overdue charge/.test(lower))type='PENAL_CHARGE'
    else if(/emi|payment|receipt|repayment|credit|collection/.test(lower))type='PAYMENT'
    rows.push({date:m[1],description,amount:nums.length?nums[0]:null,balance:nums.length>1?nums[nums.length-1]:null,type})
  }
  return rows.slice(-250)
}

function parseStatement(text:string,fileName:string){
  const t=cleanText(text)
  const transactions=parseTransactions(t)
  const bounceTx=transactions.filter(x=>x.type==='BOUNCE')
  const penalTx=transactions.filter(x=>x.type==='PENAL_CHARGE')
  const paymentTx=transactions.filter(x=>x.type==='PAYMENT'&&!/bounce|return|failed|reversal/i.test(x.description))
  const sum=(rows:any[])=>rows.reduce((s,x)=>s+(typeof x.amount==='number'?Math.abs(x.amount):0),0)

  const lender=first(t,[/Lender(?: Name)?\s*[:=-]\s*([^\n]+)/i,/Bank(?: Name)?\s*[:=-]\s*([^\n]+)/i,/NBFC(?: Name)?\s*[:=-]\s*([^\n]+)/i,/Financial Institution\s*[:=-]\s*([^\n]+)/i])
  const loanAccountNumber=first(t,[/Loan Account(?: Number| No\.?| #)?\s*[:=-]\s*([A-Z0-9\/-]{5,})/i,/Agreement(?: Number| No\.?)\s*[:=-]\s*([A-Z0-9\/-]{5,})/i,/LAN\s*[:=-]\s*([A-Z0-9\/-]{5,})/i])
  const sanctionedPrincipalAmount=moneyAfter(t,['sanctioned amount','sanctioned principal','loan amount','original principal','disbursed amount'])
  const currentPrincipalOutstanding=moneyAfter(t,['current principal outstanding','principal outstanding','outstanding principal','current outstanding','total outstanding','balance outstanding','outstanding balance','foreclosure principal'])
  const overdueAmount=moneyAfter(t,['total overdue','overdue amount','amount overdue','arrears','past due amount'])
  const emiAmount=moneyAfter(t,['emi amount','monthly emi','installment amount','instalment amount','monthly installment','monthly instalment'])
  const principalPaid=moneyAfter(t,['principal paid','principal repaid','total principal paid','principal recovered'])
  const interestPaid=moneyAfter(t,['interest paid','total interest paid','interest recovered'])
  let totalPaid=moneyAfter(t,['total amount paid','total paid','total repayment','total repaid','amount received till date','total amount received'])
  if(totalPaid===null&&principalPaid!==null&&interestPaid!==null)totalPaid=principalPaid+interestPaid
  if(totalPaid===null&&paymentTx.length)totalPaid=sum(paymentTx)
  const totalBounceChargesBilled=moneyAfter(t,['total bounce charges','bounce charges','nach return charges','ecs return charges']) ?? (bounceTx.length?sum(bounceTx):null)
  const totalPenalInterestBilled=moneyAfter(t,['total penal charges','penal charges','penal interest','late payment charges','overdue charges']) ?? (penalTx.length?sum(penalTx):null)
  const totalBounceCount=countAfter(t,['total bounce count','bounce count','number of bounces','emi bounce count']) ?? (bounceTx.length?bounceTx.length:null)
  const tenureMonths=countAfter(t,['tenure months','loan tenure','tenure'])
  const emisPaidCount=countAfter(t,['emis paid','emi paid','installments paid','instalments paid','paid installments'])
  let emisPendingCount=countAfter(t,['emis pending','emi pending','installments pending','instalments pending','pending installments'])
  if(emisPendingCount===null&&tenureMonths!==null&&emisPaidCount!==null)emisPendingCount=Math.max(tenureMonths-emisPaidCount,0)
  const interestRateRaw=first(t,[/(?:rate of interest|interest rate|roi)\s*[:=-]?\s*(\d+(?:\.\d+)?)\s*%/i])
  const interestRatePerAnnum=interestRateRaw?Number(interestRateRaw):null
  const disbursalDate=dateAfter(t,['disbursal date','disbursement date','loan start date','date of disbursement'])
  const lastPaymentDate=dateAfter(t,['last payment date','last receipt date','latest payment date'])
  const lastPaymentAmount=moneyAfter(t,['last payment amount','last receipt amount','latest payment amount'])
  const statementFrom=dateAfter(t,['statement from','period from','from date'])
  const statementTo=dateAfter(t,['statement to','period to','to date','statement date'])
  const foreclosureAmountPayoff=moneyAfter(t,['foreclosure amount','preclosure amount','pre-closure amount','payoff amount','closure amount'])
  const statusRaw=first(t,[/(?:loan status|account status)\s*[:=-]\s*([^\n]+)/i])
  let loanStatus=statusRaw?.split(/\s{2,}/)[0]?.trim()||null
  if(!loanStatus){if(/\bclosed\b|no dues/i.test(t))loanStatus='Closed';else if((overdueAmount||0)>0)loanStatus='Overdue';else if(currentPrincipalOutstanding!==null)loanStatus=currentPrincipalOutstanding>0?'Active':'Closed'}

  const detected=[sanctionedPrincipalAmount,currentPrincipalOutstanding,overdueAmount,emiAmount,totalPaid,principalPaid,interestPaid,totalBounceCount,totalBounceChargesBilled,totalPenalInterestBilled].filter(v=>v!==null).length
  return {
    source:'local_pdf_text_parser',parsed:detected>0,fileName,
    lenderName:lender,loanAccountNumber,sanctionedPrincipalAmount,disbursalDate,tenureMonths,interestRatePerAnnum,
    emiAmount,emisPaidCount,emisPendingCount,principalPaid,interestPaid,totalPaid,currentPrincipalOutstanding,overdueAmount,
    foreclosureAmountPayoff,totalBounceCount,totalBounceChargesBilled,totalPenalInterestBilled,lastPaymentDate,lastPaymentAmount,
    loanStatus,statementFrom,statementTo,transactions,
    executiveSummary:detected>0?`Loan statement read locally. ${detected} key financial fields were detected from the uploaded PDF. Values must be verified against the original statement before lender communication.`:'PDF text was extracted, but standard loan summary fields could not be confidently detected.',
    recommendationPlan:detected>0?'Review extracted figures and transaction rows, compare them with CIBIL reporting, and verify any mismatch before raising a dispute.':'Open the original PDF for manual verification; this statement format needs an additional parsing rule.',
    extractionMeta:{characters:t.length,keyFieldsDetected:detected,transactionRowsDetected:transactions.length}
  }
}

export default async function handler(req:any,res:any){
  if(req.method!=='POST')return res.status(405).json({success:false,message:'Method not allowed'})
  try{
    const {fileName='loan-statement.pdf',fileDataUrl,rawText}=req.body||{}
    let text=String(rawText||'')
    if(!text&&fileDataUrl)text=await extractPdfText(String(fileDataUrl))
    if(!text.trim())return res.status(422).json({success:false,message:'PDF contains no extractable text. Please upload the original text-based loan statement PDF rather than a scanned image.'})
    const statement=parseStatement(text,String(fileName))
    return res.json({success:true,message:statement.parsed?'Loan statement analyzed locally from uploaded PDF.':'Loan statement PDF was read, but key fields need manual verification.',statement})
  }catch(error:any){
    console.error('Local loan statement analyzer error',error)
    return res.status(500).json({success:false,message:error?.message||'Failed to analyze loan statement locally'})
  }
}
