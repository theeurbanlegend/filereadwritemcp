/// <reference types="vite/client" />

interface ImportMetaEnv {
  readonly VITE_GITHUB_REPO?: string;
  readonly VITE_OPERATOR_NAME?: string;
  readonly VITE_CONTACT_EMAIL?: string;
  readonly VITE_JURISDICTION?: string;
  readonly VITE_HOSTING_PROVIDER?: string;
  readonly VITE_LEGAL_UPDATED?: string;
  readonly VITE_BACKUP_RETENTION_DAYS?: string;
}
