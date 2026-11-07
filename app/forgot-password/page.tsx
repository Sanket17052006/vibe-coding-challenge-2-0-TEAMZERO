"use client";
import { FormEvent, useState } from "react";
import Link from "next/link";

export default function ForgotPasswordPage() {
  const [message, setMessage] = useState("");
  const [messageKind, setMessageKind] = useState<"success" | "error" | "">("");
  const [busy, setBusy] = useState(false);

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setBusy(true);
    const email = new FormData(event.currentTarget).get("email");
    try {
      const response = await fetch("/api/auth/forgot-password", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ email }) });
      const data = await response.json();
      setMessage(response.ok ? data.message : data.error || "Unable to process request.");
      setMessageKind(response.ok ? "success" : "error");
    } catch {
      setMessage("Unable to process the request. Please try again.");
      setMessageKind("error");
    } finally { setBusy(false); }
  }

  return <main className="auth-screen"><div className="auth-frame">
    <section className="auth-brand"><div className="brand"><span className="brand-mark">K</span>KHEL<span className="brand-light">GRID</span></div><div className="auth-brand-copy"><span className="auth-overline">SECURE ACCOUNT ACCESS</span><h1>Back in<br/><em>the game.</em></h1><p>Recover access to your academy desk.</p></div><div className="auth-brand-footer">KHELGRID · ACADEMY OPERATIONS</div></section>
    <section className="auth-card"><div className="auth-card-top"><span className="eyebrow">ACCOUNT RECOVERY</span></div><h2>Forgot password?</h2><p className="auth-intro">Enter your account email. If it is verified, we will send a secure reset link.</p>
      <form className="modal-form auth-form" onSubmit={submit}><label htmlFor="recovery-email">EMAIL ADDRESS<input id="recovery-email" name="email" type="email" autoComplete="email" required maxLength={254} placeholder="you@example.com"/></label><button className="button button-accent modal-submit" disabled={busy}>{busy ? "SENDING…" : "SEND RESET LINK"}</button></form>
      {message && <p className={`auth-status auth-status-${messageKind}`} role="status">{message}</p>}
      <div className="auth-page-links"><Link href="/">Back to sign in</Link></div><div className="auth-foot"><span>SECURE ACCOUNT RECOVERY</span><span>02 / 05</span></div>
    </section>
  </div></main>;
}
