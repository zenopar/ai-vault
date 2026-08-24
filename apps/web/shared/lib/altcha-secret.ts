// Deterministic secret for Altcha challenges across all Next.js server chunks
export function getAltchaSecret(): string {
  return process.env.ALTCHA_SECRET || "YWNjb3VudGh1cnJpZWRjbGltYXRlZ3JhYmJlZHRlbGxmb2xsb3d0ZXJtc29vbnNvdXQ=y";
}
