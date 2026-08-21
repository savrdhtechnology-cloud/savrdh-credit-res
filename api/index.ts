import express from "express";
import type { Request, Response } from "express";

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

export default function handler(req: Request, res: Response) {
  if (!capturedApp) {
    return res.status(503).json({
      success: false,
      message: "SAVRDH API is initializing. Please retry.",
    });
  }
  return capturedApp(req, res);
}
