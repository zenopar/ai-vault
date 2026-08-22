import { redirect } from "next/navigation";
import { verifySession } from "@/shared/lib/session";
import { getVaultStatus } from "@/features/vault/services/vault-status.service";
import { AutoLockGuard } from "@/features/vault/components/auto-lock-guard";
import { getSettingsAction } from "@/features/vault/actions/settings.action";
import { SettingsDashboard } from "@/features/vault/components/settings-dashboard";

export const dynamic = "force-dynamic";

export default async function SettingsPage() {
  const isValidSession = await verifySession();
  if (!isValidSession) {
    redirect("/");
  }

  const status = await getVaultStatus();
  if (status.status !== "UNLOCKED") {
    redirect("/");
  }

  const settingsResponse = await getSettingsAction();

  return (
    <AutoLockGuard>
      <div className="min-h-screen bg-[#0e0f12] text-neutral-100 flex flex-col">
        {settingsResponse.success && settingsResponse.settings ? (
          <SettingsDashboard initialSettings={settingsResponse.settings} />
        ) : (
          <div className="flex-1 flex items-center justify-center">
            <p className="text-red-400">Failed to load settings: {settingsResponse.error}</p>
          </div>
        )}
      </div>
    </AutoLockGuard>
  );
}
