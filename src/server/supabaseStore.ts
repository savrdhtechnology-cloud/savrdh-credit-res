type LeadPayload = Record<string, any>;

const getConfig = () => ({
  url: String(process.env.SUPABASE_URL || '').replace(/\/$/, ''),
  key: String(process.env.SUPABASE_SERVICE_ROLE_KEY || ''),
});

export function isSupabaseConfigured() {
  const { url, key } = getConfig();
  return Boolean(url && key);
}

async function supabaseRequest(path: string, init: RequestInit = {}) {
  const { url, key } = getConfig();
  if (!url || !key) throw new Error('Supabase is not configured');
  const response = await fetch(`${url}/rest/v1/${path}`, {
    ...init,
    headers: {
      apikey: key,
      Authorization: `Bearer ${key}`,
      'Content-Type': 'application/json',
      ...(init.headers || {}),
    },
  });
  const text = await response.text();
  const data = text ? JSON.parse(text) : null;
  if (!response.ok) throw new Error(data?.message || data?.hint || `Supabase ${response.status}`);
  return data;
}

export async function saveCrmLead(payload: LeadPayload) {
  const crmReferenceId = payload.crmReferenceId || `SAV-CRM-${Date.now()}`;
  const row = {
    crm_reference_id: crmReferenceId,
    customer_name: payload.customerName || 'Customer',
    mobile: payload.mobile || null,
    email: payload.email || null,
    pan_number: payload.panNumber || null,
    aadhaar_masked: payload.aadhaarNumberMasked || null,
    dob: payload.dob || null,
    gender: payload.gender || null,
    address: payload.address || null,
    credit_score: payload.creditScore ?? null,
    credit_bureau: payload.creditBureau || null,
    active_loans_count: payload.activeLoansCount || 0,
    credit_cards_count: payload.creditCardsCount || 0,
    settled_accounts_count: payload.settledAccountsCount || 0,
    written_off_accounts_count: payload.writtenOffAccountsCount || 0,
    total_default_amount: payload.totalDefaultAmount || 0,
    resolution_package: payload.resolutionPackage || null,
    package_amount: payload.packageAmount || 0,
    payment_id: payload.paymentId || null,
    cibil_fee_amount: payload.cibilFeeAmount || 350,
    cibil_fee_paid: Boolean(payload.cibilFeePaid ?? true),
    loa_status: payload.loaStatus || null,
    loa_reference_number: payload.loaReferenceNumber || null,
    loa_consent_timestamp: payload.loaConsentTimestamp || null,
    case_status: payload.caseStatus || 'New Lead',
    source: payload.source || 'CUSTOMER_APP',
    updated_at: new Date().toISOString(),
  };
  const result = await supabaseRequest('crm_leads?on_conflict=crm_reference_id', {
    method: 'POST',
    headers: { Prefer: 'resolution=merge-duplicates,return=representation' },
    body: JSON.stringify(row),
  });
  return result?.[0] || row;
}

export async function listCrmLeads(q?: string, status?: string) {
  const params = new URLSearchParams({ select: '*', order: 'created_at.desc' });
  if (status) params.set('case_status', `eq.${status}`);
  if (q) params.set('or', `(customer_name.ilike.*${q}*,mobile.ilike.*${q}*,email.ilike.*${q}*,pan_number.ilike.*${q}*,crm_reference_id.ilike.*${q}*)`);
  return (await supabaseRequest(`crm_leads?${params.toString()}`)) || [];
}

export async function getCrmStats() {
  const rows = await listCrmLeads();
  return {
    totalLeads: rows.length,
    cibilProcuredCount: rows.filter((r:any) => r.credit_score != null).length,
    totalDefaultUnderResolution: rows.reduce((s:number,r:any)=>s+Number(r.total_default_amount||0),0),
    totalRevenueCollected: rows.reduce((s:number,r:any)=>s+Number(r.package_amount||0)+(r.cibil_fee_paid?Number(r.cibil_fee_amount||0):0),0),
    activeDisputesCount: rows.filter((r:any)=>!['Settlement Sanctioned','CIBIL Rectified','Closed'].includes(r.case_status)).length,
  };
}
