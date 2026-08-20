"use client";

import { useState } from "react";
import { initVaultAction, completeInitAction } from "../actions/init-vault.action";

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
    
    // Pass FormData instead of raw string to prevent Next.js from logging the password
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
      <div className="w-full max-w-md mx-auto p-8 mt-12 bg-white rounded-lg shadow-md border border-gray-100">
        <h2 className="text-2xl font-bold text-green-600 mb-4">Vault Initialized Successfully</h2>
        <p className="text-gray-700 mb-6">
          Please save your recovery code. <strong className="font-semibold text-red-600">You will never see it again:</strong>
        </p>
        <div className="relative mb-6">
          <code className="block w-full bg-gray-50 text-gray-900 border border-gray-200 rounded p-4 text-center text-xl font-mono tracking-wider font-bold select-all">
            {recoveryCode}
          </code>
          <button
            type="button"
            onClick={handleCopy}
            className="mt-2 text-sm text-gray-600 hover:text-black font-medium underline flex items-center justify-center w-full"
          >
            {copied ? "✓ Copied to clipboard" : "Copy recovery code"}
          </button>
        </div>
        <button 
          onClick={handleContinue}
          disabled={redirecting}
          className="w-full px-4 py-2 text-white bg-black rounded-md hover:bg-gray-800 transition-colors font-medium cursor-pointer disabled:bg-gray-400"
        >
          {redirecting ? "Redirecting..." : "I have saved the code, continue to App"}
        </button>
      </div>
    );
  }

  return (
    <div className="w-full max-w-md mx-auto p-8 mt-12 bg-white rounded-lg shadow-md border border-gray-100">
      <h2 className="text-2xl font-bold text-gray-900 mb-2">Initialize Vault</h2>
      <p className="text-gray-500 text-sm mb-6">
        Enter a strong master password (min 16 chars, upper, lower, number, special).
      </p>
      
      <form onSubmit={handleSubmit} className="flex flex-col gap-4">
        <div>
          <input 
            type="password" 
            name="masterPassword"
            value={password} 
            onChange={(e) => setPassword(e.target.value)} 
            placeholder="Master Password" 
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
          {loading ? "Initializing..." : "Initialize"}
        </button>
      </form>
    </div>
  );
}
