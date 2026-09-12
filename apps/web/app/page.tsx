"use client";
import { FormEvent, useState } from "react";
import { useAuth } from "./auth";
import { Workspace } from "./workspace";
import "./product.css";

export default function Home() {
  const auth = useAuth();
  if (auth.loading) return <div className="center-state"><span className="spinner"/>Loading TransWave…</div>;
  if (auth.session && auth.user) return <Workspace/>;
  return <Login accountError={auth.error}/>;
}

function Login({ accountError }: { accountError: string }) {
  const auth = useAuth();
  const [error, setError] = useState(accountError);
  const [busy, setBusy] = useState(false);
  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault(); setBusy(true); setError("");
    const data = new FormData(event.currentTarget);
    try { await auth.signIn(String(data.get("email")), String(data.get("password"))); }
    catch (reason) { setError(reason instanceof Error ? reason.message : "Sign in failed"); setBusy(false); }
  }
  return <main className="login-shell"><section className="login-brand"><div className="logo large"><b>T</b><span>TransWave</span></div><p>SHIPPING AND LOGISTICS</p><h1>Operations and invoicing in one reliable workflow.</h1><p>Manage customers, routes, services, containers, job charges and tax invoices with company-level access controls.</p></section><form className="login-card" onSubmit={submit}><p className="kicker">SECURE ACCESS</p><h2>Sign in</h2><p>Use your TransWave operations account.</p><label>Email<input name="email" type="email" autoComplete="username" required placeholder="name@transwave.com"/></label><label>Password<input name="password" type="password" autoComplete="current-password" required/></label>{error && <p className="error-banner" role="alert">{error}</p>}<button className="button wide" disabled={busy}>{busy ? "Signing in…" : "Sign in"}</button><small>Local setup account: finance@transwave.local</small></form></main>;
}
