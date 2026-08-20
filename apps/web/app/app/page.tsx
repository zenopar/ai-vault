import { getVaultStatus } from "../../features/vault/services/vault-status.service";
import { redirect } from "next/navigation";
import { verifySession } from "../../shared/lib/session";

export const dynamic = "force-dynamic";

export default async function AppDashboard() {
  const isValidSession = await verifySession();
  
  if (!isValidSession) {
    redirect("/");
  }

  const status = await getVaultStatus();

  if (status.status !== "UNLOCKED") {
    // If the vault isn't unlocked, throw them back to the login page
    redirect("/");
  }

  return (
    <div className="flex flex-col items-center justify-center min-h-screen bg-gray-50 p-4">
      <h1 className="text-6xl font-bold text-gray-900 tracking-widest">APP</h1>
    </div>
  );
}
