import express from "express";
import type { Request, Response } from "express";
import { PDFParse } from "pdf-parse";

// server.ts is written as a traditional long-running Express server. Vercel
// invokes functions per request, so capture the Express app instead of opening
// a TCP listener. This keeps all existing /api routes in one source of truth.
let capturedApp: any = null;

const originalListen = (express.application as any).listen;
(express.application as any).listen = function (..._args: any[]) {
  capturedApp = this;
  return {
    on() { return this; },
    close(callback?: () => void) { if (callback) callback(); },
  } as any;
};

process.env.NODE_ENV = "production";
await import("../server.ts");
(express.application as any).listen = originalListen;

function cleanAmount(value?: string): number | null {
  if (!value) return null;
  const n = Number(value.replace(/[^0-9.]/g, ""));
  return Number.isFinite(n) ? n : null;
}

function firstMatch(text: string, patterns: RegExp[]): string | null {
  for (const pattern of patterns) {
    const match = text.match(pattern);
    if (match?.[1]) return match[1].trim();
  }
  return null;
}

function countAccountStatuses(text: string, status: "written-off" | "settled"): number {
  const accountSection = text.split(/enquir(?:y|ies)\s+(?:details|information)/i)[0] || text;
  const blocks = accountSection.split(/member\s*name/i).slice(1);
  if (!blocks.length) return 0;
  const pattern = status === "written-off"
    ? /written[\s-]*off|write[\s-]*off/i
    : /\bsettled\b|settlement/i;
  return blocks.filter((block) => pattern.test(block)).length;
}

async function handleStrictCibilParse(req: Request, res: Response) {
  try {
    const { fileName, fileDataUrl, manualDetails, customerName, panNumber, dob } = req.body || {};
    let text = String(manualDetails?.rawText || "");

    if (fileDataUrl && (String(fileName || "").toLowerCase().endsWith(".pdf") || String(fileDataUrl).includes("application/pdf"))) {
      const base64Data = String(fileDataUrl).split(",")[1] || String(fileDataUrl);
      const buffer = Buffer.from(base64Data, "base64");
      const parser = new PDFParse({ data: buffer });
      const parsed: any = await parser.getText();
      if (typeof (parser as any).destroy === "function") await (parser as any).destroy();
      text = typeof parsed === "string" ? parsed : String(parsed?.text || "");
    }

    if (!text.trim()) {
      return res.status(422).json({
        success: false,
        code: "CIBIL_TEXT_NOT_EXTRACTED",
        message: "Uploaded credit report could not be read. No demo/default values were used. Please upload a text-readable official PDF.",
      });
    }

    const scoreRaw = firstMatch(text, [
      /your\s+cibil\s+score\s+is\s+([3-9]\d{2})\b/i,
      /(?:transunion\s+cibil\s+score|cibil\s+score|credit\s+score|bureau\s+score|score\s+value)\s*[:=-]?\s*([3-9]\d{2})\b/i,
      /\b([3-9]\d{2})\b(?=[\s\S]{0,35}(?:cibil\s+score|score\s+range|300\s*[-–]\s*900))/i,
    ]);
    const score = scoreRaw ? Number(scoreRaw) : null;

    const detectedPan = firstMatch(text, [/\b([A-Z]{5}[0-9]{4}[A-Z])\b/]);
    const controlNumber = firstMatch(text, [
      /control\s*(?:number|no\.?)[\s:#-]*([A-Z0-9,./-]{6,30})/i,
      /(?:report\s*(?:number|no\.?)|ecn)[\s:#-]*([A-Z0-9,./-]{6,30})/i,
    ]);
    const reportDate = firstMatch(text, [
      /(?:date\s+of\s+report|report\s+date|generated\s+on)\s*[:=-]?\s*(\d{1,2}[/-]\d{1,2}[/-]\d{2,4})/i,
      /\bdate\s*:\s*(\d{1,2}[/-]\d{1,2}[/-]\d{2,4})/i,
    ]);
    const detectedDob = firstMatch(text, [/(?:date\s+of\s+birth|dob)\s*[:=-]?\s*(\d{1,2}[/-]\d{1,2}[/-]\d{2,4})/i]);
    const detectedName = firstMatch(text, [
      /(?:consumer\s+name|applicant\s+name|customer\s+name)\s*[:=-]?\s*([A-Za-z][A-Za-z .]{2,60})/i,
      /hello,\s*([A-Za-z][A-Za-z .]{2,60}?)(?:\n|$)/i,
    ]);

    let bureauName = "Credit Bureau";
    if (/transunion\s*cibil|\bcibil\b/i.test(text)) bureauName = "TransUnion CIBIL";
    else if (/experian/i.test(text)) bureauName = "Experian";
    else if (/equifax/i.test(text)) bureauName = "Equifax";
    else if (/crif|high\s*mark/i.test(text)) bureauName = "CRIF High Mark";

    const overdueValues = [...text.matchAll(/amount\s+overdue\s*[:₹Rs.\s]*([\d,]+)/gi)]
      .map((m) => cleanAmount(m[1]))
      .filter((v): v is number => v !== null);
    const totalOverdue = overdueValues.length ? overdueValues.reduce((a, b) => a + b, 0) : null;

    const accountBlocks = text.split(/member\s*name/i).slice(1);
    const writtenOffAccountsCount = countAccountStatuses(text, "written-off");
    const settledAccountsCount = countAccountStatuses(text, "settled");

    const normalized = (v: any) => String(v || "").toUpperCase().replace(/[^A-Z0-9]/g, "");
    const panExpected = normalized(panNumber);
    const panActual = normalized(detectedPan);
    const isPanVerified = Boolean(panExpected && panActual && panExpected === panActual);

    const report = {
      bureauName,
      score,
      controlNumber,
      reportDate,
      customerDetails: {
        name: detectedName,
        pan: detectedPan,
        dob: detectedDob,
      },
      verifiedProfile: {
        matchedName: detectedName,
        matchedPan: detectedPan,
        matchedDob: detectedDob,
        isPanVerified,
        isNameVerified: Boolean(customerName && detectedName && normalized(customerName) === normalized(detectedName)),
        isDobVerified: Boolean(dob && detectedDob && String(dob).replace(/\D/g, "") === String(detectedDob).replace(/\D/g, "")),
        verificationScore: null,
        verificationNotes: "Identity fields are marked verified only when the uploaded bureau report contains an exact matching value. Missing fields are not auto-filled.",
      },
      summary: {
        activeLoansCount: null,
        activeCreditCardsCount: null,
        totalOutstanding: null,
        totalOverdue,
        settledAccountsCount,
        writtenOffAccountsCount,
        totalEnquiries: null,
        creditUtilizationPercent: null,
        dpdInstances: null,
      },
      accounts: [],
      enquiries: [],
      extractionMeta: {
        mode: "STRICT_SOURCE_ONLY",
        sourceTextCharacters: text.length,
        detectedAccountBlocks: accountBlocks.length,
        warnings: [
          ...(score === null ? ["CIBIL score could not be confidently extracted"] : []),
          ...(controlNumber === null ? ["Control number could not be confidently extracted"] : []),
          ...(detectedPan === null ? ["PAN was not found in report text"] : []),
          "No hardcoded customer, score, balance, account, DPD, utilization or enquiry fallback data is used.",
        ],
      },
    };

    return res.json({
      success: true,
      message: "Credit report analyzed in strict source-only mode. Only values found in the uploaded report are returned.",
      report,
    });
  } catch (error: any) {
    console.error("Strict CIBIL parsing error:", error);
    return res.status(500).json({ success: false, message: "Failed to parse uploaded credit report", error: error?.message });
  }
}

export default async function handler(req: Request, res: Response) {
  if (req.method === "POST" && req.url && req.url.split("?")[0] === "/api/cibil/parse-report") {
    return handleStrictCibilParse(req, res);
  }

  if (!capturedApp) {
    return res.status(503).json({
      success: false,
      message: "SAVRDH API is initializing. Please retry.",
    });
  }
  return capturedApp(req, res);
}
