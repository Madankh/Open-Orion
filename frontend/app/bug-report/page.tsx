"use client"
import React, { useEffect, useRef, useState } from "react";
import { motion } from "framer-motion";
import Navbar from "@/components/Navbar";
import { useSelector } from "react-redux";
import { nodeUrl } from "../../apiurl"
interface BugReportFormProps {
  prefill?: {
    name?: string;
    email?: string;
  };
}

type StatusState = "idle" | "sending" | "success" | "error" | "warning";

interface Status {
  state: StatusState;
  text: string;
}

interface Errors {
  email?: string;
  message?: string;
}

interface User {
  id: string;
  username: string;
  email: string;
  token_limit: number;
}

interface RootState {
  user: {
    currentUser: User | null;
    accessToken: string | null;
    isFetching: boolean;
    error: string | null;
  };
}


export default function BugReportForm({ prefill = {} }: BugReportFormProps) {
  const user = useSelector((state: RootState) => state.user);
  const accessToken = user?.accessToken;
  const [name, setName] = useState<string>(prefill.name || "");
  const [email, setEmail] = useState<string>(prefill.email || "");
  const [type, setType] = useState<"bug" | "support">("bug");
  const [message, setMessage] = useState<string>("");
  const [steps, setSteps] = useState<string>("");
  const [severity, setSeverity] = useState<"low" | "medium" | "high" | "critical">("medium");
  const [screenshotData, setScreenshotData] = useState<string | null>(null);
  const [screenshotName, setScreenshotName] = useState<string>("");
  const [isAdvancedOpen, setIsAdvancedOpen] = useState<boolean>(false);
  const [status, setStatus] = useState<Status>({ state: "idle", text: "" });
  const [titlePreview, setTitlePreview] = useState<string>("");
  const [errors, setErrors] = useState<Errors>({});
  const submitRef = useRef<HTMLButtonElement>(null);

  useEffect(() => {
    // Auto-generate a short preview title from message (client-side, just for UX)
    const t = generateTitleFromMessageClient(message, type);
    setTitlePreview(t);
  }, [message, type]);

  function validate(): Errors {
    const e: Errors = {};
    if (!email || !/^[\w-.+]+@[\w-]+\.[\w-.]+$/.test(email)) e.email = "Valid email required";
    if (!message || message.trim().length < 8) e.message = "Please describe the issue (8+ chars)";
    return e;
  }

  function generateTitleFromMessageClient(msg: string, type: "bug" | "support"): string {
    if (!msg) return type === "bug" ? "Bug report" : "Support request";
    // Heuristic: take first sentence or first 7 words
    const firstLine = msg.split(/\.|\n/)[0].trim();
    const words = firstLine.split(/\s+/).slice(0, 7).join(" ");
    const cap = words.charAt(0).toUpperCase() + words.slice(1);
    return `${type === "bug" ? "Bug:" : "Support:"} ${cap}${cap.length < firstLine.length ? "…" : ""}`;
  }

  // Simple safe-HTML escape to prevent broken markup in emails
  function escapeHtml(str: string = ""): string {
    return String(str)
      .replace(/&/g, "&amp;")
      .replace(/</g, "&lt;")
      .replace(/>/g, "&gt;")
      .replace(/"/g, "&quot;")
      .replace(/'/g, "&#039;");
  }

  // Compress an image (File) using canvas -> returns dataURL (JPEG) limited size
  async function compressImageFile(file: File, maxWidth: number = 1200, quality: number = 0.75): Promise<string> {
    return new Promise((resolve, reject) => {
      try {
        const img = new Image();
        const reader = new FileReader();
        reader.onload = (e) => {
          img.onload = () => {
            const ratio = img.width / img.height || 1;
            const w = Math.min(maxWidth, img.width);
            const h = Math.round(w / ratio);
            const canvas = document.createElement("canvas");
            canvas.width = w;
            canvas.height = h;
            const ctx = canvas.getContext("2d");
            if (ctx) {
              ctx.drawImage(img, 0, 0, w, h);
              // output jpeg data url
              const dataUrl = canvas.toDataURL("image/jpeg", quality);
              resolve(dataUrl);
            } else {
              reject(new Error("Could not get canvas context"));
            }
          };
          img.onerror = (err) => reject(err);
          img.src = e.target?.result as string;
        };
        reader.onerror = (err) => reject(err);
        reader.readAsDataURL(file);
      } catch (err) {
        reject(err);
      }
    });
  }

  async function onScreenshotChange(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;
    setStatus({ state: "idle", text: "" });
    setScreenshotName(file.name);
    try {
      const compressed = await compressImageFile(file, 1200, 0.75);
      // If too large, you can further compress or refuse
      const maxBytes = 1024 * 1024 * 2; // 2MB
      const size = Math.ceil((compressed.length - "data:image/jpeg;base64,".length) * (3 / 4));
      if (size > maxBytes) {
        setStatus({ state: "warning", text: "Screenshot compressed but still large (>2MB). Consider cropping." });
      }
      setScreenshotData(compressed);
    } catch (err) {
      console.error(err);
      setStatus({ state: "error", text: "Failed to process screenshot" });
    }
  }

  function removeScreenshot() {
    setScreenshotData(null);
    setScreenshotName("");
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    const v = validate();
    setErrors(v);
    if (Object.keys(v).length) return;

    setStatus({ state: "sending", text: "Sending…" });

    // Compose a rich HTML message but escape user text first
    const escapedMessage = escapeHtml(message).replace(/\n/g, "<br>");
    const escapedSteps = escapeHtml(steps).replace(/\n/g, "<br>");

    const metadataHtml = `
      <hr>
      <div style="font-family: Arial, sans-serif; font-size: 13px; color:#444;">
        <h4 style="margin:6px 0 8px;">Context</h4>
        <ul style="padding-left:18px; margin:0 0 8px;">
          <li><strong>Severity:</strong> ${escapeHtml(severity)}</li>
          <li><strong>URL:</strong> ${escapeHtml(window?.location?.href || 'N/A')}</li>
          <li><strong>Browser:</strong> ${escapeHtml(navigator.userAgent || 'N/A')}</li>
          <li><strong>Platform:</strong> ${escapeHtml(navigator.platform || 'N/A')}</li>
          <li><strong>Time:</strong> ${escapeHtml(new Date().toLocaleString())}</li>
        </ul>
        ${escapedSteps ? `<div style="margin-bottom:8px;"><strong>Steps to reproduce:</strong><div style="margin-top:6px;">${escapedSteps}</div></div>` : ""}
      </div>
    `;

    const screenshotHtml = screenshotData
      ? `<div style="margin-top:10px;"><strong>Screenshot:</strong><div style="margin-top:8px;"><img src="${screenshotData}" alt="screenshot" style="max-width:100%; border:1px solid #e2e8f0; border-radius:6px;"/></div></div>`
      : "";

    const combinedMessage = `${escapedMessage}${metadataHtml}${screenshotHtml}`;

    try {
      const resp = await fetch(`${nodeUrl}/api/auth/bug/report`, {
        method: "POST",
        headers: { "Content-Type": "application/json" , token:accessToken},
        body: JSON.stringify({ name, email, message: combinedMessage, type })
      });

      if (!resp.ok) {
        const j = await resp.json().catch(() => ({}));
        throw new Error(j?.error || `Server returned ${resp.status}`);
      }

      const j = await resp.json();
      setStatus({ state: "success", text: j?.message || "Sent successfully" });
      // clear form except name/email
      setMessage("");
      setSteps("");
      setScreenshotData(null);
      setScreenshotName("");
      // focus send button for keyboard users
      if (submitRef.current) submitRef.current.focus();
    } catch (err) {
      console.error("Submit error", err);
      const errorMessage = err instanceof Error ? err.message : "Send failed";
      setStatus({ state: "error", text: errorMessage });
    }
  }

  return (
    <div className="max-w-7xl mx-auto p-6">
        <Navbar url="http://localhost:5000"/>
      <div className="bg-white dark:bg-gray-900 shadow-md rounded-2xl p-6 grid gap-6 lg:grid-cols-2">
        <form onSubmit={handleSubmit} className="space-y-4" aria-label="Bug report form">
          <div className="flex items-center justify-between">
            <h2 className="text-lg font-semibold">Report an issue</h2>
            <div className="text-sm text-gray-500">Quick, helpful, and private</div>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <label className="block">
              <div className="text-sm font-medium mb-1">Your name</div>
              <input value={name} onChange={(e) => setName(e.target.value)} className="w-full rounded-md border p-2 text-sm" placeholder="Optional" />
            </label>

            <label className="block">
              <div className="text-sm font-medium mb-1">Email <span className="text-xs text-gray-400">(required)</span></div>
              <input value={email} onChange={(e) => setEmail(e.target.value)} type="email" required className={`w-full rounded-md border p-2 text-sm ${errors.email ? 'border-red-400' : ''}`} placeholder="you@domain.com" />
              {errors.email && <div className="text-xs text-red-500 mt-1">{errors.email}</div>}
            </label>
          </div>

          <div>
            <div className="flex items-center gap-3">
              <label className="text-sm font-medium">Type</label>
              <select value={type} onChange={(e) => setType(e.target.value as "bug" | "support")} className="rounded-md border p-2 text-sm">
                <option value="bug">Bug</option>
                <option value="support">General support</option>
              </select>

              <label className="ml-auto text-sm font-medium">Severity</label>
              <select value={severity} onChange={(e) => setSeverity(e.target.value as "low" | "medium" | "high" | "critical")} className="rounded-md border p-2 text-sm">
                <option value="low">Low</option>
                <option value="medium">Medium</option>
                <option value="high">High</option>
                <option value="critical">Critical</option>
              </select>
            </div>
          </div>

          <div>
            <label className="block">
              <div className="text-sm font-medium mb-1">Describe the issue</div>
              <textarea value={message} onChange={(e) => setMessage(e.target.value)} rows={6} className={`w-full rounded-md border p-3 text-sm ${errors.message ? 'border-red-400' : ''}`} placeholder={`What's happening? Be explicit: expected vs actual, when it started, steps you took.`} />
              {errors.message && <div className="text-xs text-red-500 mt-1">{errors.message}</div>}
            </label>
            <div className="flex items-center gap-3 mt-2">
              <button type="button" className="text-xs px-3 py-1 rounded-md border" onClick={() => setIsAdvancedOpen((v) => !v)}>
                {isAdvancedOpen ? 'Hide advanced' : 'Show advanced'}
              </button>

              <button type="button" onClick={() => setMessage((m) => `${m}\n\nSteps to reproduce:\n1. `)} className="text-xs px-3 py-1 rounded-md border">Insert template</button>

              <div className="text-xs text-gray-400 ml-auto">Preview title: <span className="font-medium">{titlePreview}</span></div>
            </div>
          </div>

          <motion.div initial={{ height: 0 }} animate={{ height: isAdvancedOpen ? 'auto' : 0 }} className="overflow-hidden">
            {isAdvancedOpen && (
              <div className="mt-3 space-y-3 bg-gray-50 p-3 rounded-md">
                <label className="block">
                  <div className="text-sm font-medium mb-1">Steps to reproduce (optional)</div>
                  <textarea value={steps} onChange={(e) => setSteps(e.target.value)} rows={4} style={{color:"black"}} className="w-full rounded-md border p-2 text-sm" placeholder={`1. ...\n2. ...`} />
                </label>

                <div>
                  <div className="text-sm font-medium mb-1" style={{color:"black"}}>Attach screenshot (optional)</div>
                  <div className="flex items-center gap-3">
                    <input type="file" accept="image/*" onChange={onScreenshotChange} />
                    {screenshotName && (
                      <div className="text-xs text-gray-500">{screenshotName} <button type="button" onClick={removeScreenshot} className="ml-2 text-red-500">Remove</button></div>
                    )}
                  </div>
                  <div className="text-xs text-gray-400 mt-2">Tip: crop to relevant area to reduce size.</div>
                </div>

              </div>
            )}
          </motion.div>

          <div className="flex items-center gap-3">
            <button ref={submitRef} type="submit" className="bg-blue-600 text-white px-4 py-2 rounded-md shadow-sm disabled:opacity-60" disabled={status.state === 'sending'}>
              {status.state === 'sending' ? (
                <span className="flex items-center gap-2"><svg className="w-4 h-4 animate-spin" viewBox="0 0 24 24"><circle cx="12" cy="12" r="10" stroke="white" strokeWidth="4" strokeDasharray="60" fill="none"></circle></svg> Sending</span>
              ) : (
                <span className="flex items-center gap-2">Send report</span>
              )}
            </button>

            <button type="button" onClick={() => { setMessage(""); setSteps(""); setScreenshotData(null); setScreenshotName(""); setStatus({ state: 'idle', text: '' }); }} className="px-3 py-2 border rounded-md text-sm">Clear</button>

            <div className="ml-auto text-sm text-gray-500">Or email <a href="mailto:contact@curiositylab.fun" className="underline">contact@curiositylab.fun</a></div>
          </div>

          {status.state === 'error' && <div className="text-sm text-red-600">Error: {status.text}</div>}
          {status.state === 'warning' && <div className="text-sm text-yellow-700">{status.text}</div>}
          {status.state === 'success' && <div className="text-sm text-green-600">{status.text}</div>}

        </form>

        {/* Right column: preview */}
        <aside className="hidden lg:block p-4 bg-gray-50 rounded-lg">
          <h3 className="text-sm font-semibold mb-2">Preview</h3>
          <div className="text-xs text-gray-600 mb-3">How your report will look to the support team (title preview is client-side):</div>

          <div className="bg-white p-3 rounded-md border">
            <div className="text-sm font-medium mb-1">{titlePreview}</div>
            <div className="text-xs text-gray-500 mb-2">From: {name || 'Anonymous'} — {email || 'no-email@example.com'}</div>
            <div className="text-sm text-gray-700">
              <div dangerouslySetInnerHTML={{ __html: escapeHtml(message).replace(/\n/g, '<br>') || '<em>No description yet</em>' }} />
            </div>
            {screenshotData && (
              <div className="mt-3">
                <div className="text-xs font-medium mb-1">Screenshot</div>
                <img src={screenshotData} alt="screenshot preview" className="max-w-full rounded-md border" />
              </div>
            )}

            <div className="mt-3 text-xs text-gray-500">
              Context: {severity} • {type === 'bug' ? 'Bug report' : 'General support'}
            </div>
          </div>

          <div className="mt-4 text-xs text-gray-400">Developer notes: the backend will generate the final email subject and wrap message content in an HTML template.</div>
        </aside>

      </div>

      <div className="mt-3 text-xs text-gray-500">By submitting you confirm you are not sending sensitive personal data. For attachments larger than 2MB, consider sharing a link (Drive/Dropbox) in the message.</div>
    </div>
  );
}