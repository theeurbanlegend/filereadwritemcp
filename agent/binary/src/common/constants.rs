pub const CMD_TIMEOUT_MS: usize = 120_000;
pub const CMD_OUTPUT_CAP: usize = 100_000;
pub const MAX_SEARCH_RESULTS: usize = 500;
pub const READ_PREVIEW_MAX_LINES: usize = 2000;
pub const AGENT_VERSION: &str = env!("CARGO_PKG_VERSION");
pub const MAX_BINARY_BYTES: u64 = 5 * 1024 * 1024;
pub const MAX_INFO_HASH_BYTES: u64 = 100 * 1024 * 1024;
pub const SNIFF_BYTES: u64 = 8192;
