"use client";

import { useState } from "react";
import { unlockVaultAction } from "../actions/unlock-vault.action";
import { Button, Input, Card, ErrorAlert } from "@/shared/components";

export function UnlockVaultForm() {
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  const handleSubmit = async (e: React.SyntheticEvent<HTMLFormElement>) => {
    e.preventDefault();
    setLoading(true);
    setError(null);

    const formData = new FormData(e.currentTarget);
    const result = await unlockVaultAction(formData);

    if (!result.success) {
      setError(result.error || "Failed to unlock vault");
      setLoading(false);
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
