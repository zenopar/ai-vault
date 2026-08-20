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
  } catch (error) {
    return (
      <div className="flex flex-col items-center justify-center min-h-screen bg-gray-50 text-red-600 p-4">
        <h1 className="text-3xl font-bold mb-4">Backend Offline</h1>
        <p className="text-gray-700">Could not connect to the Vault backend. Please ensure the Node.js server is running on port 4000.</p>
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
      <div className="min-h-screen bg-gray-50 p-4">
        <UnlockVaultForm />
      </div>
    );
  }

  // Otherwise, the vault is completely uninitialized
  return (
    <div className="min-h-screen bg-gray-50 p-4">
      <InitVaultForm />
    </div>
  );
}
