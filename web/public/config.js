// In production Caddy serves /config.js from config.js.tmpl instead. In dev this stays empty and
// the values come from web/.env through import.meta.env.
window.__FRW_CONFIG__ = {};
