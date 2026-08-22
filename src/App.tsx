/**
 * Savrdh Financial Services Pvt. Ltd.
 * Customer Credit Resolution App
 */

import React, { useState, useEffect } from "react";
import { AppStep, UserProfile, KYCData, CreditBureauReport, AICreditAnalysis, ResolutionPackage, PaymentDetails, CRMLeadRecord, AssignedAdvisor } from "./types";
import { DEFAULT_CREDIT_REPORT, INITIAL_AI_ANALYSIS, RESOLUTION_PACKAGES, ASSIGNED_ADVISOR } from "./data/mockData";
import { MobileContainer } from "./components/common/MobileContainer";
import { FlowStepper } from "./components/common/FlowStepper";
import { Step1SplashWelcome } from "./components/steps/Step1SplashWelcome";
import { Step2Registration } from "./components/steps/Step2Registration";
import { Step3DigitalKYC } from "./components/steps/Step3DigitalKYC";
import { Step4CreditReport } from "./components/steps/Step4CreditReport";
import { Step5CreditAnalysis } from "./components/steps/Step5CreditAnalysis";
import { Step6Pricing } from "./components/steps/Step6Pricing";
import { Step7Payment } from "./components/steps/Step7Payment";
import { Step8LeadSyncing } from "./components/steps/Step8LeadSyncing";
import { CustomerDashboard } from "./components/dashboard/CustomerDashboard";
import { ReportViewerModal } from "./components/modals/ReportViewerModal";
import { SecuritySettingsModal } from "./components/modals/SecuritySettingsModal";
import { AdminCRMApp } from "./components/admin/AdminCRMApp";
import { AdminLoginModal } from "./components/admin/AdminLoginModal";
import { AdminLoginPage } from "./components/admin/AdminLoginPage";
import { CibilReportAnalyzer } from "./components/tools/CibilReportAnalyzer";
import { LoanStatementAnalyzer } from "./components/tools/LoanStatementAnalyzer";
import { AdminUser } from "./types";
import { ShieldCheck, X } from "lucide-react";

export default function App() {
  const [currentStep, setCurrentStep] = useState<AppStep>("SPLASH");
  const [activeStandaloneTool, setActiveStandaloneTool] = useState<"CIBIL_ANALYZER" | "LOAN_ANALYZER" | null>(null);
  const [isAdminMode, setIsAdminMode] = useState<boolean>(() => {
    const search = window.location.search.toLowerCase(); const hash = window.location.hash.toLowerCase(); const pathname = window.location.pathname.toLowerCase();
    return search.includes("admin") || search.includes("page=admin") || hash.includes("admin") || pathname.includes("admin");
  });
  const [isAdminLoginOpen, setIsAdminLoginOpen] = useState(false);
  const [adminUser, setAdminUser] = useState<AdminUser | null>(() => { try { const saved = localStorage.getItem("SAVRDH_ADMIN_USER"); return saved ? JSON.parse(saved) : null; } catch { return null; } });
  useEffect(() => { const handleUrlChange = () => { const search = window.location.search.toLowerCase(); const hash = window.location.hash.toLowerCase(); const pathname = window.location.pathname.toLowerCase(); if (search.includes("admin") || search.includes("page=admin") || hash.includes("admin") || pathname.includes("admin")) setIsAdminMode(true); }; window.addEventListener("popstate", handleUrlChange); window.addEventListener("hashchange", handleUrlChange); return () => { window.removeEventListener("popstate", handleUrlChange); window.removeEventListener("hashchange", handleUrlChange); }; }, []);

  const [userProfile, setUserProfile] = useState<UserProfile>({ fullName: "", mobile: "", email: "", isMobileVerified: false, isEmailVerified: false, biometricEnabled: false });
  const [kycData, setKycData] = useState<KYCData>({ aadhaarNumber: "", maskedAadhaar: "", panNumber: "", isVerified: false });
  const [creditReport, setCreditReport] = useState<CreditBureauReport>(DEFAULT_CREDIT_REPORT);
  const [aiAnalysis, setAiAnalysis] = useState<AICreditAnalysis>(INITIAL_AI_ANALYSIS);
  const [selectedPackage, setSelectedPackage] = useState<ResolutionPackage>(RESOLUTION_PACKAGES[1]);
  const [paymentDetails, setPaymentDetails] = useState<PaymentDetails | null>(null);
  const [crmLead, setCrmLead] = useState<CRMLeadRecord | null>(null);
  const [advisor, setAdvisor] = useState<AssignedAdvisor>(ASSIGNED_ADVISOR);
  const [activeReportModal, setActiveReportModal] = useState<"CREDIT_REPORT" | "INVOICE" | "RESOLUTION_REPORT" | "NDC_CERTIFICATE" | "LETTER_OF_AUTHORITY" | null>(null);
  const [showSecurityModal, setShowSecurityModal] = useState(false);

  const syncVerifiedCibilIdentity = (report: CreditBureauReport) => {
    const v = report.verifiedProfile;
    if (!v) return;
    if (v.matchedName?.trim()) setUserProfile(prev => ({ ...prev, fullName: v.matchedName.trim() }));
    setKycData(prev => ({
      ...prev,
      panNumber: v.matchedPan?.trim() ? v.matchedPan.trim().toUpperCase() : prev.panNumber,
      fetchedProfile: {
        name: v.matchedName?.trim() || prev.fetchedProfile?.name || "",
        dob: v.matchedDob?.trim() || prev.fetchedProfile?.dob || "",
        gender: v.matchedGender?.trim() || prev.fetchedProfile?.gender || "",
        address: v.matchedAddress?.trim() || prev.fetchedProfile?.address || "",
        photoUrl: prev.fetchedProfile?.photoUrl || "",
        fatherName: prev.fetchedProfile?.fatherName,
      },
    }));
  };

  const handleGetStarted = () => setCurrentStep("REGISTRATION");
  const handleBiometricLogin = () => { if (crmLead && paymentDetails) setCurrentStep("DASHBOARD"); else if (userProfile.fullName && userProfile.isMobileVerified) setCurrentStep("KYC"); else setCurrentStep("REGISTRATION"); };
  const handleRegistrationComplete = (profile: UserProfile) => { setUserProfile(profile); setCurrentStep("KYC"); };
  const handleKycComplete = (kyc: KYCData) => { setKycData(kyc); if (kyc.fetchedProfile?.name) setUserProfile(prev => ({ ...prev, fullName: kyc.fetchedProfile!.name })); setCurrentStep("CREDIT_REPORT"); };
  const handleProceedToAnalysis = (report: CreditBureauReport) => { setCreditReport(report); syncVerifiedCibilIdentity(report); setCurrentStep("CREDIT_ANALYSIS"); };
  const handleProceedToPricing = (analysisData: AICreditAnalysis) => { setAiAnalysis(analysisData); setCurrentStep("PRICING"); };
  const handleSelectPackage = (pkg: ResolutionPackage) => { setSelectedPackage(pkg); setCurrentStep("PAYMENT"); };
  const handlePaymentSuccess = (pDetails: PaymentDetails) => { setPaymentDetails(pDetails); setCurrentStep("CRM_SYNC"); };
  const handleLeadSynced = (lead: CRMLeadRecord, assignedAdv: AssignedAdvisor) => { setCrmLead(lead); setAdvisor(assignedAdv); setCurrentStep("DASHBOARD"); };
  const handleResetFlow = () => { setCurrentStep("SPLASH"); setUserProfile({ fullName: "", mobile: "", email: "", isMobileVerified: false, isEmailVerified: false, biometricEnabled: false }); setKycData({ aadhaarNumber: "", maskedAadhaar: "", panNumber: "", isVerified: false }); setPaymentDetails(null); setCrmLead(null); };

  if (isAdminMode) {
    if (adminUser) return <AdminCRMApp adminUser={adminUser} onLogout={() => { localStorage.removeItem("SAVRDH_ADMIN_TOKEN"); localStorage.removeItem("SAVRDH_ADMIN_USER"); setAdminUser(null); setIsAdminMode(false); }} onSwitchToCustomerApp={() => setIsAdminMode(false)} />;
    return <AdminLoginPage onLoginSuccess={admin => { setAdminUser(admin); setIsAdminMode(true); }} onReturnToCustomerApp={() => setIsAdminMode(false)} />;
  }

  return <MobileContainer currentStep={currentStep} onResetFlow={handleResetFlow} onOpenAdminCRM={() => setIsAdminMode(true)} onOpenCibilAnalyzer={() => setActiveStandaloneTool("CIBIL_ANALYZER")} onOpenLoanAnalyzer={() => setActiveStandaloneTool("LOAN_ANALYZER")}>
    {currentStep !== "SPLASH" && currentStep !== "DASHBOARD" && <FlowStepper currentStep={currentStep} />}
    {currentStep === "SPLASH" && <Step1SplashWelcome onGetStarted={handleGetStarted} onBiometricLogin={handleBiometricLogin} onOpenAdminCRM={() => setIsAdminMode(true)} />}
    {currentStep === "REGISTRATION" && <Step2Registration initialProfile={userProfile} onComplete={handleRegistrationComplete} />}
    {currentStep === "KYC" && <Step3DigitalKYC userProfile={userProfile} initialKYC={kycData} onComplete={handleKycComplete} />}
    {currentStep === "CREDIT_REPORT" && <Step4CreditReport kycData={kycData} userProfile={userProfile} initialReport={creditReport} onProceedToAnalysis={handleProceedToAnalysis} />}
    {currentStep === "CREDIT_ANALYSIS" && <Step5CreditAnalysis creditReport={creditReport} userProfile={userProfile} initialAnalysis={aiAnalysis} onProceedToPricing={handleProceedToPricing} />}
    {currentStep === "PRICING" && <Step6Pricing analysis={aiAnalysis} selectedPackage={selectedPackage} onSelectPackage={handleSelectPackage} />}
    {currentStep === "PAYMENT" && <Step7Payment packageSelected={selectedPackage} userProfile={userProfile} onPaymentSuccess={handlePaymentSuccess} onViewInvoice={() => setActiveReportModal("INVOICE")} onViewConsent={() => setActiveReportModal("LETTER_OF_AUTHORITY")} />}
    {currentStep === "CRM_SYNC" && paymentDetails && <Step8LeadSyncing userProfile={userProfile} kycData={kycData} creditReport={creditReport} packageSelected={selectedPackage} paymentDetails={paymentDetails} onLeadSynced={handleLeadSynced} onViewLoa={() => setActiveReportModal("LETTER_OF_AUTHORITY")} />}
    {currentStep === "DASHBOARD" && paymentDetails && crmLead && <CustomerDashboard userProfile={userProfile} kycData={kycData} creditReport={creditReport} analysis={aiAnalysis} packageSelected={selectedPackage} paymentDetails={paymentDetails} crmLead={crmLead} advisor={advisor} onOpenReportModal={type => setActiveReportModal(type)} onOpenSecurityModal={() => setShowSecurityModal(true)} onLogout={handleResetFlow} onOpenAdminCRM={() => setIsAdminMode(true)} />}
    {currentStep === "DASHBOARD" && (!paymentDetails || !crmLead) && <div className="p-8 text-center space-y-4"><p className="text-sm text-slate-300">Initializing session...</p><button onClick={handleBiometricLogin} className="py-2.5 px-4 rounded-xl bg-gold-gradient text-navy-950 font-bold text-xs">Load Customer Session</button></div>}
    {activeReportModal && <ReportViewerModal type={activeReportModal} userProfile={userProfile} kycData={kycData} creditReport={creditReport} paymentDetails={paymentDetails} crmLead={crmLead} onClose={() => setActiveReportModal(null)} />}
    {activeStandaloneTool === "CIBIL_ANALYZER" && <div className="fixed inset-0 z-50 bg-black/85 backdrop-blur-md flex items-center justify-center p-2 sm:p-4 overflow-y-auto"><div className="w-full max-w-4xl max-h-[92vh] overflow-y-auto rounded-3xl bg-navy-950 border border-amber-500/30 shadow-2xl shadow-black/90 p-4 sm:p-6 relative"><button onClick={() => setActiveStandaloneTool(null)} className="absolute top-4 right-4 p-2 rounded-xl bg-navy-900 border border-slate-700 text-slate-400 hover:text-white hover:border-amber-500/50 transition-all z-10" title="Close Tool"><X className="w-5 h-5" /></button><CibilReportAnalyzer initialReport={creditReport} onClose={() => setActiveStandaloneTool(null)} onApplyToApp={newReport => { setCreditReport(newReport); syncVerifiedCibilIdentity(newReport); if (currentStep === "SPLASH" || currentStep === "REGISTRATION" || currentStep === "KYC") setCurrentStep("CREDIT_REPORT"); setActiveStandaloneTool(null); }} isStandalone={true} /></div></div>}
    {activeStandaloneTool === "LOAN_ANALYZER" && <div className="fixed inset-0 z-50 bg-black/85 backdrop-blur-md flex items-center justify-center p-2 sm:p-4 overflow-y-auto"><div className="w-full max-w-4xl max-h-[92vh] overflow-y-auto rounded-3xl bg-navy-950 border border-indigo-500/30 shadow-2xl shadow-black/90 p-4 sm:p-6 relative"><button onClick={() => setActiveStandaloneTool(null)} className="absolute top-4 right-4 p-2 rounded-xl bg-navy-900 border border-slate-700 text-slate-400 hover:text-white hover:border-indigo-500/50 transition-all z-10" title="Close Tool"><X className="w-5 h-5" /></button><LoanStatementAnalyzer onClose={() => setActiveStandaloneTool(null)} isStandalone={true} /></div></div>}
    {showSecurityModal && <SecuritySettingsModal userProfile={userProfile} onClose={() => setShowSecurityModal(false)} onUpdateProfile={updated => setUserProfile(updated)} onLogout={handleResetFlow} />}
    <div className="fixed bottom-3 right-3 z-40"><button onClick={() => { if (adminUser) setIsAdminMode(true); else setIsAdminLoginOpen(true); }} className="py-2 px-3.5 rounded-2xl bg-gradient-to-r from-amber-500 via-yellow-400 to-amber-600 text-navy-950 font-bold text-xs shadow-xl flex items-center gap-2"><ShieldCheck className="w-4 h-4" /><span>Staff Admin CRM</span></button></div>
    <AdminLoginModal isOpen={isAdminLoginOpen} onClose={() => setIsAdminLoginOpen(false)} onLoginSuccess={admin => { setAdminUser(admin); setIsAdminMode(true); }} />
  </MobileContainer>;
}
