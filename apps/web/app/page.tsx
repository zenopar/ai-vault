import { getVaultStatus } from "../features/vault/services/vault-status.service";
import { InitVaultForm } from "../features/vault/components/init-vault-form";
import { UnlockVaultForm } from "../features/vault/components/unlock-vault-form";
import { redirect } from "next/navigation";
import { verifySession } from "../shared/lib/session";

export const dynamic = "force-dynamic";

export default async function Home() {
  let status;

  try {
    status = await getVaultStatus();
  } catch {
    return (
      <div className="min-h-screen bg-[#0e0f12] bg-[radial-gradient(ellipse_80%_60%_at_50%_-15%,rgba(120,119,198,0.08),transparent)] text-neutral-100 flex flex-col items-center justify-center p-6 select-none animate-enter">
        <div className="w-full max-w-sm p-8 rounded-2xl border border-white/[0.08] bg-[#14151a]/90 backdrop-blur-xl text-center space-y-4 shadow-xl">
          <div className="w-2.5 h-2.5 rounded-full bg-red-500/80 mx-auto animate-pulse" />
          <div className="space-y-1">
            <h1 className="text-sm font-mono uppercase tracking-widest text-neutral-300">Vault Offline</h1>
            <p className="text-xs text-neutral-500 font-mono">port 4000 · connection refused</p>
          </div>
          <p className="text-xs text-neutral-400 leading-relaxed pt-2">
            Could not connect to the backend server. Please verify the Vault service is running.
          </p>
        </div>
      </div>
    );
  }

  // If the vault is fully unlocked in RAM, and the user has a valid session, redirect straight to the app
  if (status.status === "UNLOCKED") {
    const isValidSession = await verifySession();
    if (isValidSession) {
      redirect("/app");
    }
  }

  // If the vault has keys but is locked in RAM, or if they just lack a session, show the unlock form
  if (status.status === "LOCKED" || status.status === "UNLOCKED") {
    return (
      <div className="min-h-screen bg-[#0e0f12] bg-[radial-gradient(ellipse_80%_60%_at_50%_-15%,rgba(120,119,198,0.08),transparent)] text-neutral-100 flex flex-col items-center justify-center p-6">
        <UnlockVaultForm />
      </div>
    );
  }

  // Otherwise, the vault is completely uninitialized
  return (
    <div className="min-h-screen bg-[#0e0f12] bg-[radial-gradient(ellipse_80%_60%_at_50%_-15%,rgba(120,119,198,0.08),transparent)] text-neutral-100 flex flex-col items-center justify-center p-6">
      <InitVaultForm />
    </div>
  );
}


