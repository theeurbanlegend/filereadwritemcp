const env = import.meta.env;

export const SITE = {
  operator: env.VITE_OPERATOR_NAME || '[Operator name]',
  contactEmail: env.VITE_CONTACT_EMAIL || '[contact email]',
  jurisdiction: env.VITE_JURISDICTION || '[country]',
  hostingProvider: env.VITE_HOSTING_PROVIDER || '[hosting provider]',
  legalUpdated: env.VITE_LEGAL_UPDATED || '2026-10-15',
  backupRetentionDays: Number(env.VITE_BACKUP_RETENTION_DAYS || 14),
  githubRepo: env.VITE_GITHUB_REPO || 'theeurbanlegend/filereadwritemcp',
};

export const GITHUB_URL = `https://github.com/${SITE.githubRepo}`;
