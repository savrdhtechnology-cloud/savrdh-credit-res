import type { VercelRequest, VercelResponse } from "@vercel/node";
import crypto from "crypto";

const DEFAULT_ADMIN_EMAIL = "admin@savrdhfinancialservices.com";
const DEFAULT_DIRECTOR_EMAIL = "savrdhcapital@gmail.com";

function safeEqual(a: string, b: string) {
  const aa = Buffer.from(a);
  const bb = Buffer.from(b);
  return aa.length === bb.length && crypto.timingSafeEqual(aa, bb);
}

export default function handler(req: VercelRequest, res: VercelResponse) {
  if (req.method !== "POST") return res.status(405).json({ success: false, message: "Method not allowed" });

  const username = String(req.body?.username || "").trim().toLowerCase();
  const password = String(req.body?.password || "");
  const configuredPassword = process.env.ADMIN_MASTER_PASSWORD || "Savrdh@Admin2026";
  const configuredAdmin = (process.env.ADMIN_EMAIL || DEFAULT_ADMIN_EMAIL).trim().toLowerCase();
  const configuredDirector = (process.env.ADMIN_DIRECTOR_EMAIL || DEFAULT_DIRECTOR_EMAIL).trim().toLowerCase();

  const isAllowedUser = username === configuredAdmin || username === configuredDirector;
  const validPassword = safeEqual(password, configuredPassword);
  if (!isAllowedUser || !validPassword) {
    return res.status(401).json({ success: false, message: "Invalid Admin credentials." });
  }

  const isDirector = username === configuredDirector;
  const token = crypto.randomBytes(32).toString("hex");
  return res.status(200).json({
    success: true,
    message: "Admin authenticated successfully.",
    admin: {
      id: isDirector ? "SAV-DIRECTOR-001" : "SAV-ADMIN-001",
      name: isDirector ? "SAVRDH Director" : "SAVRDH Administrator",
      email: username,
      role: isDirector ? "LEGAL_DIRECTOR" : "SUPER_ADMIN",
      token,
    },
  });
}
