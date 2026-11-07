"use client";
import { FormEvent, useEffect, useRef, useState } from "react";
import Link from "next/link";
import { Eye, EyeOff } from "lucide-react";
import { extractAndClearEmailToken } from "../../lib/email-link";

export default function ResetPasswordPage() {
  const [message, setMessage] = useState("");
  const [busy, setBusy] = useState(false);
  const [token, setToken] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [showConfirmPassword, setShowConfirmPassword] = useState(false);
  const started = useRef(false);

  useEffect(() => {
    if (started.current) return;
    started.current = true;
    const extracted = extractAndClearEmailToken(
      window.location.hash,
      window.location.search,
      window.location.pathname,
      (url) => window.history.replaceState(null, "", url),
    );
    if (extracted) setToken(extracted);
  }, []);

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setBusy(true);
    const form = new FormData(event.currentTarget);
    try {
      const response = await fetch("/api/auth/reset-password", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ token, password: form.get("password"), confirmPassword: form.get("confirmPassword") }),
      });
      const data = await response.json();
      if (response.ok) { window.location.assign("/?reset=success"); return; }
      setMessage(data.error || "Unable to reset password.");
    } catch { setMessage("Unable to reset password. Please try again."); }
    finally { setBusy(false); }
  }

  return <main className="auth-screen"><div className="auth-frame">
    <section className="auth-brand"><div className="brand"><span className="brand-mark">K</span>KHEL<span className="brand-light">GRID</span></div><div className="auth-brand-copy"><span className="auth-overline">SECURE ACCOUNT ACCESS</span><h1>Fresh start<br/><em>ahead.</em></h1><p>Set a new password to get back to your academy desk.</p></div><div className="auth-brand-footer">KHELGRID · ACADEMY OPERATIONS</div></section>
    <section className="auth-card"><div className="auth-card-top"><span className="eyebrow">ACCOUNT RECOVERY</span></div><h2>Choose a new password</h2><p className="auth-intro">Use at least 8 characters. Your new password will replace the current one.</p>
      <form className="modal-form auth-form reset-password-form" onSubmit={submit}>
        <label htmlFor="new-password">NEW PASSWORD<div className="auth-password-field"><input id="new-password" name="password" type={showPassword ? "text" : "password"} autoComplete="new-password" required minLength={8} maxLength={128} placeholder="At least 8 characters"/><button className="password-visibility" type="button" aria-label={showPassword ? "Hide password" : "Show password"} aria-pressed={showPassword} onClick={() => setShowPassword(value => !value)}>{showPassword ? <EyeOff size={16}/> : <Eye size={16}/>}</button></div></label>
        <label htmlFor="confirm-password">CONFIRM NEW PASSWORD<div className="auth-password-field"><input id="confirm-password" name="confirmPassword" type={showConfirmPassword ? "text" : "password"} autoComplete="new-password" required minLength={8} maxLength={128} placeholder="Enter the new password again"/><button className="password-visibility" type="button" aria-label={showConfirmPassword ? "Hide confirmation password" : "Show confirmation password"} aria-pressed={showConfirmPassword} onClick={() => setShowConfirmPassword(value => !value)}>{showConfirmPassword ? <EyeOff size={16}/> : <Eye size={16}/>}</button></div></label>
        <button className="button button-accent modal-submit" disabled={busy || !token}>{busy ? "SAVING…" : "RESET PASSWORD"}</button>
      </form>
      {message && <p className="auth-status auth-status-error" role="status">{message}</p>}
      <div className="auth-page-links"><Link href="/forgot-password">Request a new reset link</Link><Link href="/">Back to sign in</Link></div><div className="auth-foot"><span>SECURE ACCOUNT RECOVERY</span><span>04 / 05</span></div>
    </section>
  </div></main>;
}
