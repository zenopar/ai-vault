"use client";

import { useState, useRef, useEffect } from "react";
import { Fingerprint } from "lucide-react";
import { unlockVaultAction } from "../actions/unlock-vault.action";
import { getPasskeyChallengeAction, unlockWithPasskeyAction } from "../actions/passkey.action";
import { authenticateWebAuthnPasskey, isBiometricSupported } from "@/shared/lib/webauthn-client";
import { Button, Input, Card, ErrorAlert } from "@/shared/components";

interface UnlockVaultFormProps {
  hasPasskeys?: boolean;
}

export function UnlockVaultForm({ hasPasskeys = false }: UnlockVaultFormProps) {
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [biometricLoading, setBiometricLoading] = useState(false);
  const [supportsBiometrics, setSupportsBiometrics] = useState(false);
  const widgetRef = useRef<HTMLElement>(null);
  const [altchaPayload, setAltchaPayload] = useState<string | null>(null);
  const [isVerified, setIsVerified] = useState(false);

  useEffect(() => {
    isBiometricSupported().then((supported) => {
      setSupportsBiometrics(supported);
    });
  }, []);

  useEffect(() => {
    // Dynamically import the local npm 'altcha' package on client mount
    import("altcha");

    const handleStateChange = (ev: Event) => {
      const customEvent = ev as CustomEvent;
      const state = customEvent.detail?.state;
      if (state === "verified") {
        setAltchaPayload(customEvent.detail.payload);
        setIsVerified(true);
      } else if (state === "unverified" || state === "error") {
        setAltchaPayload(null);
        setIsVerified(false);
      }
    };

    const widget = widgetRef.current;
    if (widget) {
      widget.addEventListener("statechange", handleStateChange);
      return () => {
        widget.removeEventListener("statechange", handleStateChange);
      };
    }
  }, []);

  const handleBiometricUnlock = async () => {
    setError(null);
    setBiometricLoading(true);
    try {
      const challengeRes = await getPasskeyChallengeAction(true);
      if (!challengeRes.success || !challengeRes.challenge) {
        setError(challengeRes.error || "Failed to initialize biometric authentication.");
        setBiometricLoading(false);
        return;
      }

      const assertion = await authenticateWebAuthnPasskey(
        challengeRes.challenge,
        challengeRes.credentialIds
      );

      const result = await unlockWithPasskeyAction(assertion);
      if (!result.success) {
        setError(result.error || "Biometric unlock failed.");
        setBiometricLoading(false);
      }
    } catch (err: unknown) {
      if (err instanceof Error && err.name === "NotAllowedError") {
        setError("Ověření otiskem prstu bylo zrušeno nebo vypršelo.");
      } else {
        setError(err instanceof Error ? err.message : "Nepodařilo se ověřit otisk prstu.");
      }
      setBiometricLoading(false);
    }
  };

  const handleSubmit = async (e: React.SyntheticEvent<HTMLFormElement>) => {
    e.preventDefault();
    setError(null);

    const formData = new FormData(e.currentTarget);
    const widget = widgetRef.current as any;
    const hiddenInput = e.currentTarget.querySelector('input[name="altcha"]') as HTMLInputElement | null;

    // Check all possible sources for the Altcha payload
    const payload = altchaPayload || (widget?.value as string | undefined) || hiddenInput?.value;

    if (!payload) {
      setError("Please wait for the Proof of Work verification to finish computing.");
      return;
    }

    formData.set("altcha", payload);
    setLoading(true);

    const result = await unlockVaultAction(formData);

    if (!result.success) {
      setError(result.error || "Failed to unlock vault");
      setLoading(false);

      // Reset widget on failure so it can re-compute a fresh challenge
      setIsVerified(false);
      setAltchaPayload(null);
      if (widget && typeof widget.reset === "function") {
        widget.reset();
      }
    }
  };

  const showBiometricButton = hasPasskeys && supportsBiometrics;

  return (
    <Card className="w-full max-w-sm mx-auto p-8 animate-enter">
      <div className="text-center space-y-1.5 mb-6">
        <h2 className="text-lg font-medium text-neutral-100 tracking-tight font-sans">
          Unlock AI Vault
        </h2>
        <p className="text-xs text-neutral-500 leading-relaxed">
          {showBiometricButton
            ? "Use your fingerprint / biometrics or enter your Master Password"
            : "Enter your Master Password or Recovery Code"}
        </p>
      </div>

      {showBiometricButton && (
        <div className="mb-5 space-y-4">
          <button
            type="button"
            onClick={handleBiometricUnlock}
            disabled={biometricLoading || loading}
            className="w-full flex items-center justify-center gap-2.5 py-3 px-4 rounded-xl bg-indigo-500/15 hover:bg-indigo-500/25 active:bg-indigo-500/30 border border-indigo-500/30 text-indigo-200 font-medium text-sm transition-all cursor-pointer disabled:opacity-50 disabled:cursor-not-allowed shadow-sm"
          >
            <Fingerprint className="w-5 h-5 text-indigo-400" />
            <span>
              {biometricLoading ? "Ověřování otisku prstu..." : "Přihlásit se otiskem prstu"}
            </span>
          </button>

          <div className="relative flex items-center py-1">
            <div className="flex-grow border-t border-white/[0.06]" />
            <span className="flex-shrink mx-3 text-[10px] font-mono uppercase tracking-wider text-neutral-600">
              nebo heslem
            </span>
            <div className="flex-grow border-t border-white/[0.06]" />
          </div>
        </div>
      )}

      <form onSubmit={handleSubmit} className="space-y-4">
        <Input
          type="password"
          name="password"
          placeholder="Password or Recovery Code"
          required
          autoFocus={!showBiometricButton}
          isMono
        />

        {/* Invisible Altcha Proof-of-Work running quietly in the background */}
        <altcha-widget
          ref={widgetRef}
          challenge="/api/altcha"
          challengeurl="/api/altcha"
          auto="onload"
          style={{ display: "none" }}
        ></altcha-widget>

        <ErrorAlert message={error} onDismiss={() => setError(null)} />

        <Button
          type="submit"
          isLoading={loading}
          disabled={biometricLoading}
          size="lg"
          className="mt-2"
        >
          Unlock Vault
        </Button>
      </form>
    </Card>
  );
}
