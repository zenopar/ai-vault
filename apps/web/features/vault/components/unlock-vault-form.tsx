"use client";

import { useState, useRef, useEffect } from "react";
import { unlockVaultAction } from "../actions/unlock-vault.action";
import { Button, Input, Card, ErrorAlert } from "@/shared/components";

export function UnlockVaultForm() {
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const widgetRef = useRef<HTMLElement>(null);
  const [altchaPayload, setAltchaPayload] = useState<string | null>(null);
  const [isVerified, setIsVerified] = useState(false);

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

  return (
    <Card className="w-full max-w-sm mx-auto p-8 animate-enter">
      <div className="text-center space-y-1.5 mb-6">
        <h2 className="text-lg font-medium text-neutral-100 tracking-tight font-sans">
          Unlock AI Vault
        </h2>
        <p className="text-xs text-neutral-500 leading-relaxed">
          Enter your Master Password or Recovery Code
        </p>
      </div>

      <form onSubmit={handleSubmit} className="space-y-4">
        <Input
          type="password"
          name="password"
          placeholder="Password or Recovery Code"
          required
          autoFocus
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
          size="lg"
          className="mt-2"
        >
          Unlock Vault
        </Button>
      </form>
    </Card>
  );
}


