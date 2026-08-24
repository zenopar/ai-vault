import { redirect } from "next/navigation";
import { verifySession } from "@/shared/lib/session";
import { getVaultStatus } from "@/features/vault/services/vault-status.service";
import { AutoLockGuard } from "@/features/vault/components/auto-lock-guard";
import { getSettingsAction } from "@/features/vault/actions/settings.action";
import { SettingsDashboard } from "@/features/vault/components/settings-dashboard";
import { listApiKeysService } from "@/features/keys/services/keys.service";
import { AiApiKeyMetadata } from "@ai-vault/types";

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
  let apiKeys: AiApiKeyMetadata[] = [];
  try {
    apiKeys = await listApiKeysService();
  } catch (e) {
    console.error("Failed to fetch api keys", e);
  }

  return (
    <AutoLockGuard>
      <div className="min-h-screen bg-[#0e0f12] text-neutral-100 flex flex-col">
        {settingsResponse.success && settingsResponse.settings ? (
          <SettingsDashboard initialSettings={settingsResponse.settings} apiKeys={apiKeys} />
        ) : (
          <div className="flex-1 flex items-center justify-center">
            <p className="text-red-400">Failed to load settings: {settingsResponse.error}</p>
          </div>
        )}
      </div>
    </AutoLockGuard>
  );
}
