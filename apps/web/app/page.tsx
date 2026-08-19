import { getVaultStatus } from "../features/vault/services/vault-status.service";
import { InitVaultForm } from "../features/vault/components/init-vault-form";

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

  if (status.status !== "UNINITIALIZED") {
    return (
      <div className="flex flex-col items-center justify-center min-h-screen bg-gray-50 p-4">
        <h1 className="text-3xl font-bold text-gray-900">The code already exists</h1>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gray-50 p-4">
      <InitVaultForm />
    </div>
  );
}
