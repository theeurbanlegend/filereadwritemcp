fn main() {
    // Expose the compile target triple to the crate as env!("TARGET").
    // The agent reports this when asking the router for an update, so it must
    // match the CI release asset suffix `agent-<triple>` exactly.
    let target = std::env::var("TARGET").unwrap_or_default();
    println!("cargo:rustc-env=TARGET={target}");
    println!("cargo:rerun-if-changed=build.rs");
}
