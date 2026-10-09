"use client";

import { useEffect, useState, type FormEvent } from "react";
import { RouteLoader } from "@/components/route-loader";
import { Button } from "@/components/ui";
import { createClient } from "@/lib/supabase/client";
import { cleanName, MAX_NAME_LENGTH } from "@/lib/user-name";

type AuthFormProps = {
  mode: "login" | "signup";
};

export function AuthForm({ mode }: AuthFormProps) {
  const [firstName, setFirstName] = useState("");
  const [lastName, setLastName] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(false);
  const [isEntering, setIsEntering] = useState(false);
  const [verificationEmail, setVerificationEmail] = useState<string | null>(null);
  const [otp, setOtp] = useState("");
  const [resendCooldown, setResendCooldown] = useState(0);
  const isSignUp = mode === "signup";

  useEffect(() => {
    if (resendCooldown <= 0) return;
    const timeout = window.setTimeout(() => setResendCooldown((seconds) => seconds - 1), 1000);
    return () => window.clearTimeout(timeout);
  }, [resendCooldown]);

  async function onSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (isLoading) return;
    setError(null);
    setNotice(null);
    setIsLoading(true);

    try {
      const supabase = createClient();
      if (verificationEmail) {
        if (!/^\d{6}$/.test(otp.trim())) throw new Error("Enter the six-digit code from your email.");
        const { data, error: verificationError } = await supabase.auth.verifyOtp({
          email: verificationEmail,
          token: otp.trim(),
          type: "email",
        });
        if (verificationError) {
          throw new Error(verificationError.status === 429
            ? "Too many attempts. Please wait before trying again."
            : "That code is invalid or expired. Try again or request a new code.");
        }
        if (!data.session || !data.user?.email_confirmed_at) {
          await supabase.auth.signOut({ scope: "local" });
          throw new Error("Unable to confirm your email. Please request a new code.");
        }
        setOtp("");
        enterApp();
        return;
      } else if (isSignUp) {
        const { data, error: signUpError } = await supabase.auth.signUp({
          email: email.trim(),
          password,
          options: {
            data: { first_name: cleanName(firstName), last_name: cleanName(lastName) },
            emailRedirectTo: `${window.location.origin}/auth/callback?next=/dashboard`,
          },
        });
        if (signUpError) throw signUpError;

        if (data.session) {
          if (!data.user?.email_confirmed_at) {
            await supabase.auth.signOut({ scope: "local" });
            throw new Error("Supabase returned a session without a confirmed email.");
          }
          enterApp();
          return;
        }
        setVerificationEmail(email.trim());
        setPassword("");
        setResendCooldown(60);
        setNotice("Check your inbox for a six-digit verification code. Check spam if it hasn't arrived.");
      } else {
        const { data, error: signInError } = await supabase.auth.signInWithPassword({ email: email.trim(), password });
        if (signInError?.code === "email_not_confirmed") {
          setVerificationEmail(email.trim());
          setPassword("");
          setNotice("Verify your email to continue. Enter your code or request a new one.");
          return;
        }
        if (signInError) throw signInError;
        if (!data.user?.email_confirmed_at) {
          await supabase.auth.signOut({ scope: "local" });
          setVerificationEmail(email.trim());
          setPassword("");
          setNotice("Verify your email to continue. Request a code below.");
          return;
        }
        enterApp();
        return;
      }
    } catch (caughtError) {
      setError(caughtError instanceof Error ? caughtError.message : "Something went wrong. Try again.");
    } finally {
      setIsLoading(false);
    }
  }

  async function resendCode() {
    if (!verificationEmail || resendCooldown > 0 || isLoading) return;
    setIsLoading(true);
    setError(null);
    setNotice(null);
    setResendCooldown(60);
    try {
      const { error: resendError } = await createClient().auth.resend({
        type: "signup",
        email: verificationEmail,
      });
      if (resendError) throw resendError;
      setOtp("");
      setNotice("If this email is awaiting confirmation, a new code has been sent. Use the latest code.");
    } catch (caughtError) {
      setError(caughtError instanceof Error ? caughtError.message : "Unable to resend your code. Try again later.");
    } finally {
      setIsLoading(false);
    }
  }

  // A full navigation sends the fresh auth cookies with a clean request. Mixing
  // router.replace with router.refresh re-renders the auth page, whose own
  // signed-in redirect races the client navigation and surfaces an error.
  function enterApp() {
    setIsEntering(true);
    window.location.replace("/dashboard");
  }

  return (
    <>
    {isEntering ? <RouteLoader overlay message="Entering your space..." /> : null}
    <form className="auth-form" onSubmit={onSubmit}>
      {verificationEmail ? (
        <>
          <p>Verify your email: {verificationEmail}</p>
          <label className="field">
            <span className="field__label">Verification code</span>
            <input
              className="input"
              type="text"
              inputMode="numeric"
              autoComplete="one-time-code"
              value={otp}
              onChange={(event) => setOtp(event.target.value)}
              pattern="[0-9]{6}"
              minLength={6}
              maxLength={6}
              placeholder="Six-digit code"
              autoFocus
              required
              disabled={isLoading}
            />
          </label>
        </>
      ) : (
        <>
      {isSignUp ? (
        <>
          <label className="field">
            <span className="field__label">First name</span>
            <input
              className="input"
              type="text"
              autoComplete="given-name"
              value={firstName}
              onChange={(event) => setFirstName(event.target.value)}
              maxLength={MAX_NAME_LENGTH}
              placeholder="First name"
              required
              disabled={isLoading}
            />
          </label>
          <label className="field">
            <span className="field__label">Last name</span>
            <input
              className="input"
              type="text"
              autoComplete="family-name"
              value={lastName}
              onChange={(event) => setLastName(event.target.value)}
              maxLength={MAX_NAME_LENGTH}
              placeholder="Last name"
              required
              disabled={isLoading}
            />
          </label>
        </>
      ) : null}
      <label className="field">
        <span className="field__label">Email</span>
        <input
          className="input"
          type="email"
          autoComplete="email"
          value={email}
          onChange={(event) => setEmail(event.target.value)}
          placeholder="you@example.com"
          required
          disabled={isLoading}
        />
      </label>
      <label className="field">
        <span className="field__label">Password</span>
        <input
          className="input"
          type="password"
          autoComplete={isSignUp ? "new-password" : "current-password"}
          value={password}
          onChange={(event) => setPassword(event.target.value)}
          minLength={6}
          placeholder="At least 6 characters"
          required
          disabled={isLoading}
        />
      </label>
        </>
      )}
      {error ? <p className="form-message form-message--error" role="alert">{error}</p> : null}
      {notice ? <p className="form-message form-message--success" role="status">{notice}</p> : null}
      <Button className="auth-submit" variant="primary" size="lg" type="submit" loading={isLoading} loadingText={verificationEmail ? "Verifying…" : isSignUp ? "Creating character…" : "Signing in…"}>
        {verificationEmail ? "Verify email" : isSignUp ? "Create character" : "Enter LifeStats"}
      </Button>
      {verificationEmail ? (
        <Button type="button" onClick={resendCode} disabled={isLoading || resendCooldown > 0}>
          {resendCooldown > 0 ? `Resend code in ${resendCooldown}s` : "Resend code"}
        </Button>
      ) : null}
    </form>
    </>
  );
}
