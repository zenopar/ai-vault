"use client";

import { useState } from "react";
import { unlockVaultAction } from "../actions/unlock-vault.action";

export function UnlockVaultForm() {
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  const handleSubmit = async (e: React.SyntheticEvent<HTMLFormElement>) => {
    e.preventDefault();
    setLoading(true);
    setError(null);
    
    // Pass FormData instead of raw string to prevent Next.js from logging the password
    const formData = new FormData(e.currentTarget);
    const result = await unlockVaultAction(formData);
    
    // If successful, the action will redirect to /app.
    // We only get here if there is an error.
    if (!result.success) {
      setError(result.error || "Failed to unlock vault");
      setLoading(false);
    }
  };

  return (
    <div className="w-full max-w-md mx-auto p-8 mt-12 bg-white rounded-lg shadow-md border border-gray-100">
      <h2 className="text-2xl font-bold text-gray-900 mb-2">Vault Locked</h2>
      <p className="text-gray-500 text-sm mb-6">
        Enter your Master Password or Recovery Code to unlock the vault.
      </p>
      
      <form onSubmit={handleSubmit} className="flex flex-col gap-4">
        <div>
          <input 
            type="password" 
            name="password"
            placeholder="Password or Recovery Code" 
            required 
            className="w-full px-4 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-black focus:border-transparent transition-colors"
          />
        </div>
        
        {error && (
          <div className="p-3 text-sm text-red-700 bg-red-50 border border-red-200 rounded-md">
            {error}
          </div>
        )}
        
        <button 
          type="submit" 
          disabled={loading} 
          className="w-full px-4 py-2 mt-2 text-white bg-black rounded-md hover:bg-gray-800 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-black disabled:bg-gray-400 disabled:cursor-not-allowed transition-colors font-medium"
        >
          {loading ? "Unlocking..." : "Unlock Vault"}
        </button>
      </form>
    </div>
  );
}
