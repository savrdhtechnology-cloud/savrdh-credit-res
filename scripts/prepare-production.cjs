const fs = require('fs');

function replaceOrFail(path, from, to, label) {
  const source = fs.readFileSync(path, 'utf8');
  if (!source.includes(from)) {
    console.log(`[prepare-production] ${label}: already patched or source changed`);
    return;
  }
  fs.writeFileSync(path, source.replace(from, to));
  console.log(`[prepare-production] ${label}: patched`);
}

const apiPath = 'src/services/api.ts';
const oldFallback = `  } catch (err: any) {
    console.warn("Using offline CIBIL parsing fallback:", err);
    return {
      success: true,
      message: "CIBIL report parsed successfully",
      report: {
        bureauName: "TransUnion CIBIL",
        score: payload.manualDetails?.score || 582,
        scoreBand: "Poor",
        reportDate: new Date().toLocaleDateString("en-IN", { day: "2-digit", month: "short", year: "numeric" }),
        controlNumber: \`CIB-\${Math.floor(1000000000 + Math.random() * 9000000000)}\`,
        summary: {
          activeLoansCount: 3,
          activeCreditCardsCount: 2,
          totalOutstanding: 685000,
          totalOverdue: 485000,
          settledAccountsCount: 1,
          writtenOffAccountsCount: 2,
          totalEnquiries: 6,
          creditUtilizationPercent: 78,
          dpdInstances: 4,
        },
        accounts: [],
        enquiries: [],
      },
    };
  }
}`;
const strictFallback = `  } catch (err: any) {
    console.error("CIBIL parsing failed:", err);
    throw new Error(err?.message || "CIBIL report could not be analyzed. Please upload a valid text-based TransUnion CIBIL PDF and try again.");
  }
}`;
replaceOrFail(apiPath, oldFallback, strictFallback, 'remove fake CIBIL report fallback');

const step4Path = 'src/components/steps/Step4CreditReport.tsx';
const oldManual = `        manualDetails: {
          score: parseInt(manualScore) || 582,
          totalDefault: parseInt(manualOverdue) || 485000,
        },`;
const strictManual = `        manualDetails: {
          ...(manualScore.trim() ? { score: parseInt(manualScore, 10) } : {}),
          ...(manualOverdue.trim() ? { totalDefault: parseInt(manualOverdue, 10) } : {}),
        },`;
replaceOrFail(step4Path, oldManual, strictManual, 'remove 582/485000 upload defaults');

const oldDob = `        dob: kycData.fetchedProfile?.dob || "14/06/1988",`;
const strictDob = `        dob: kycData.fetchedProfile?.dob || undefined,`;
replaceOrFail(step4Path, oldDob, strictDob, 'remove fake DOB default');

// Fresh-session safety for standalone analyzer tools.
const cibilPath = 'src/components/tools/CibilReportAnalyzer.tsx';
replaceOrFail(cibilPath,
  '  const [successMsg, setSuccessMsg] = useState("");\n\n  // Filters & Expanded Accounts',
  '  const [successMsg, setSuccessMsg] = useState("");\n  const [hasAnalysis, setHasAnalysis] = useState(Boolean(initialReport));\n\n  // Filters & Expanded Accounts',
  'CIBIL add fresh-session gate state');
replaceOrFail(cibilPath,
  '      setReport(s.report);\n      setSuccessMsg(`Loaded sample report: ${s.name}`);',
  '      setReport(s.report);\n      setHasAnalysis(true);\n      setSuccessMsg(`Loaded sample report: ${s.name}`);',
  'CIBIL activate only selected demo');
replaceOrFail(cibilPath,
  '      const dataUrl = typeof reader.result === "string" ? reader.result : "";\n      setUploadedFile({',
  '      const dataUrl = typeof reader.result === "string" ? reader.result : "";\n      setHasAnalysis(false);\n      setActiveSampleId("");\n      setUploadedFile({',
  'CIBIL clear previous result on new file');
replaceOrFail(cibilPath,
  '        setReport(res.report);\n        setActiveSampleId("custom-upload");',
  '        setReport(res.report);\n        setHasAnalysis(true);\n        setActiveSampleId("custom-upload");',
  'CIBIL show result only after successful analysis');
replaceOrFail(cibilPath,
  '        customerName: report.verifiedProfile?.matchedName || "Customer",\n        panNumber: report.verifiedProfile?.matchedPan || "ABCDE1234F",',
  '        customerName: hasAnalysis ? (report.verifiedProfile?.matchedName || "Customer") : "Customer",\n        panNumber: hasAnalysis ? (report.verifiedProfile?.matchedPan || "") : "",',
  'CIBIL prevent stale identity reuse');
replaceOrFail(cibilPath,
  '      {/* MAIN ANALYSIS REPORT VIEW */}\n      <div className="space-y-5">',
  '      {!hasAnalysis && !isAnalyzing && (\n        <div className="p-8 rounded-2xl bg-navy-950 border border-slate-800 text-center space-y-2">\n          <FileText className="w-8 h-8 text-slate-500 mx-auto" />\n          <h3 className="text-sm font-bold text-slate-200">Start a New CIBIL Analysis</h3>\n          <p className="text-xs text-slate-400">Upload a new bureau PDF, paste report text, or manually choose a demo sample. No previous customer report is loaded.</p>\n        </div>\n      )}\n\n      {/* MAIN ANALYSIS REPORT VIEW */}\n      <div className={hasAnalysis ? "space-y-5" : "hidden"}>',
  'CIBIL hide old/default analysis view');

// IMPORTANT: standalone CIBIL tool must never inherit the app's current/previous customer report.
const appPath = 'src/App.tsx';
replaceOrFail(
  appPath,
  '<CibilReportAnalyzer initialReport={creditReport} onClose={() => setActiveStandaloneTool(null)}',
  '<CibilReportAnalyzer onClose={() => setActiveStandaloneTool(null)}',
  'Standalone CIBIL starts without previous report'
);

const loanPath = 'src/components/tools/LoanStatementAnalyzer.tsx';
replaceOrFail(loanPath,
  '      const dataUrl = typeof reader.result === "string" ? reader.result : "";\n      setUploadedFile({',
  '      const dataUrl = typeof reader.result === "string" ? reader.result : "";\n      setHasActiveStatement(false);\n      setActiveSampleId("");\n      setUploadedFile({',
  'Loan clear previous result on new file');
replaceOrFail(loanPath,
  '        setStatement(res.statement);\n        setActiveSampleId("custom-statement");',
  '        setStatement(res.statement);\n        setHasActiveStatement(true);\n        setActiveSampleId("custom-statement");',
  'Loan show result only after successful analysis');
replaceOrFail(loanPath,
  '      {/* 1. KEY LOAN SANCTION & REPAYMENT SUMMARY CARD */}\n      <div className="p-5 rounded-2xl navy-card-gold relative overflow-hidden space-y-4">',
  '      {!hasActiveStatement && !isAnalyzing && (\n        <div className="p-8 rounded-2xl bg-navy-950 border border-slate-800 text-center space-y-2">\n          <FileText className="w-8 h-8 text-slate-500 mx-auto" />\n          <h3 className="text-sm font-bold text-slate-200">Start a New Loan Statement Audit</h3>\n          <p className="text-xs text-slate-400">Upload a new PDF/CSV, paste statement text, or manually choose a demo sample. No previous loan data is loaded.</p>\n        </div>\n      )}\n\n      {/* 1. KEY LOAN SANCTION & REPAYMENT SUMMARY CARD */}\n      <div className={(hasActiveStatement ? "" : "hidden") + " p-5 rounded-2xl navy-card-gold relative overflow-hidden space-y-4"}>',
  'Loan hide old/default summary');
replaceOrFail(loanPath,
  '      <div\n        className={`p-5 rounded-2xl border-2 space-y-3.5 ${',
  '      <div\n        className={(hasActiveStatement ? "" : "hidden") + ` p-5 rounded-2xl border-2 space-y-3.5 ${',
  'Loan hide old/default forensic result');
replaceOrFail(loanPath,
  '{statement.transactions && statement.transactions.length > 0 && (',
  '{hasActiveStatement && statement.transactions && statement.transactions.length > 0 && (',
  'Loan hide old/default transactions');
