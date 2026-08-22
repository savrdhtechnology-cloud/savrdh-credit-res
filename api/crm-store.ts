import type { VercelRequest, VercelResponse } from '@vercel/node';
import { saveCrmLead, listCrmLeads, getCrmStats } from '../src/server/supabaseStore';

function toUiLead(r:any){
  return {
    leadId:r.id, crmReferenceId:r.crm_reference_id, customerName:r.customer_name, mobile:r.mobile||'', email:r.email||'',
    aadhaarNumberMasked:r.aadhaar_masked||'', panNumber:r.pan_number||'', dob:r.dob||'', gender:r.gender||'', address:r.address||'',
    creditScore:r.credit_score, creditBureau:r.credit_bureau||'TransUnion CIBIL', activeLoansCount:r.active_loans_count||0,
    creditCardsCount:r.credit_cards_count||0, settledAccountsCount:r.settled_accounts_count||0, writtenOffAccountsCount:r.written_off_accounts_count||0,
    totalDefaultAmount:Number(r.total_default_amount||0), resolutionPackage:r.resolution_package||'', packageAmount:Number(r.package_amount||0),
    paymentId:r.payment_id||'', paymentStatus:r.package_amount>0?'PAID_SUCCESSFUL':'NOT_SUBSCRIBED', cibilFee:{isPaid:!!r.cibil_fee_paid,amount:Number(r.cibil_fee_amount||350)},
    loaStatus:r.loa_status||'', loaReferenceNumber:r.loa_reference_number||'', loaConsentTimestamp:r.loa_consent_timestamp||'',
    caseStatus:r.case_status||'New Lead', registrationDate:r.created_at, syncedAt:r.updated_at, crmSyncStatus:'SYNCED', source:r.source||'CUSTOMER_APP'
  };
}

export default async function handler(req:VercelRequest,res:VercelResponse){
  try{
    const action=String(req.query.action||'');
    if(req.method==='POST' && action==='create'){
      const row=await saveCrmLead(req.body||{}); return res.status(200).json({success:true,message:'Lead saved to SAVRDH CRM database',lead:toUiLead(row)});
    }
    if(req.method==='GET' && action==='leads'){
      const rows=await listCrmLeads(String(req.query.q||''), String(req.query.status||'')==='ALL'?'':String(req.query.status||''));
      const leads=rows.map(toUiLead); return res.status(200).json({success:true,totalCount:leads.length,leads});
    }
    if(req.method==='GET' && action==='stats'){
      const stats=await getCrmStats(); return res.status(200).json({success:true,stats});
    }
    return res.status(404).json({success:false,message:'Unknown CRM action'});
  }catch(e:any){ console.error('[Supabase CRM]',e); return res.status(500).json({success:false,message:e?.message||'CRM database error'}); }
}
