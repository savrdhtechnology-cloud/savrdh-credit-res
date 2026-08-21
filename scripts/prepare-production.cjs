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
