fn main() {
    #[cfg(feature = "server")]
    println!("cargo::rustc-link-lib=crypt");
}
