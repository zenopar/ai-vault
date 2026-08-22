"use client";

import { useState } from "react";
import { initVaultAction, completeInitAction } from "../actions/init-vault.action";
import { Button, Input, Card, ErrorAlert } from "@/shared/components";

export function InitVaultForm() {
  const [password, setPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [recoveryCode, setRecoveryCode] = useState<string | null>(null);
  const [sessionToken, setSessionToken] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [redirecting, setRedirecting] = useState(false);
  const [copied, setCopied] = useState(false);

  const handleSubmit = async (e: React.SyntheticEvent<HTMLFormElement>) => {
    e.preventDefault();
    setLoading(true);
    setError(null);

    const formData = new FormData(e.currentTarget);
    const result = await initVaultAction(formData);

    if (result.success && result.recoveryPassword) {
      setRecoveryCode(result.recoveryPassword);
      if (result.sessionToken) {
        setSessionToken(result.sessionToken);
      }
    } else {
      setError(result.error || "Failed to initialize");
    }

    setLoading(false);
  };

  const handleCopy = () => {
    if (recoveryCode) {
      navigator.clipboard.writeText(recoveryCode);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    }
  };

  const handleContinue = async () => {
    if (!sessionToken) return;
    setRedirecting(true);
    await completeInitAction(sessionToken);
  };

  if (recoveryCode) {
    return (
      <Card className="w-full max-w-md mx-auto p-8 animate-enter space-y-6">
        <div className="text-center space-y-1.5">
          <h2 className="text-lg font-medium text-neutral-100 tracking-tight font-sans">
            Save Recovery Code
          </h2>
          <p className="text-xs text-neutral-400 leading-relaxed">
            Store this in a secure place. <span className="text-amber-400/90 font-medium">It will never be displayed again.</span>
          </p>
        </div>

        <div className="space-y-2">
          <div className="p-4 rounded-xl bg-[#181920] border border-white/[0.08] text-center shadow-inner">
            <code className="text-base sm:text-lg font-mono font-bold tracking-widest text-neutral-100 select-all block break-all">
              {recoveryCode}
            </code>
          </div>
          <Button
            variant="ghost"
            size="sm"
            onClick={handleCopy}
            className="w-full text-xs"
          >
            {copied ? "✓ copied to clipboard" : "copy recovery code"}
          </Button>
        </div>

        <Button
          onClick={handleContinue}
          isLoading={redirecting}
          size="lg"
        >
          I have saved the code, continue to App
        </Button>
      </Card>
    );
  }

  return (
    <Card className="w-full max-w-sm mx-auto p-8 animate-enter">
      <div className="text-center space-y-1.5 mb-6">
        <h2 className="text-lg font-medium text-neutral-100 tracking-tight font-sans">
          Initialize AI Vault
        </h2>
        <p className="text-xs text-neutral-500 leading-relaxed font-mono">
          min 16 chars · upper · lower · number · symbol
        </p>
      </div>

      <form onSubmit={handleSubmit} className="space-y-4">
        <Input
          type="password"
          name="masterPassword"
          value={password}
          onChange={(e) => setPassword(e.target.value)}
          placeholder="Create Master Password"
          required
          autoFocus
          isMono
        />

        <ErrorAlert message={error} onDismiss={() => setError(null)} />

        <Button
          type="submit"
          isLoading={loading}
          size="lg"
          className="mt-2"
        >
          Initialize Vault
        </Button>
      </form>
    </Card>
  );
}




