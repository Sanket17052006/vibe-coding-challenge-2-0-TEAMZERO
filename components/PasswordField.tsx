"use client";
import { useState } from "react";
export function PasswordField({ mode }: { mode: "login" | "signup" }) {
  const [visible, setVisible] = useState(false);
  return <label htmlFor="auth-password">PASSWORD<div className="password-input"><input id="auth-password" name="password" type={visible ? "text" : "password"} autoComplete={mode === "login" ? "current-password" : "new-password"} placeholder={mode === "login" ? "Enter your password" : "At least 8 characters"} required minLength={8} maxLength={128}/><button type="button" className="text-button" aria-label={visible ? "Hide password" : "Show password"} aria-pressed={visible} aria-controls="auth-password" onClick={() => setVisible(value => !value)}>{visible ? "Hide" : "Show"}</button></div></label>;
}
