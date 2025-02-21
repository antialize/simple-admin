use anyhow::{Result, bail};
use std::io::Write;
use tempfile::{NamedTempFile, TempDir};

pub fn strip(crt: &str) -> &str {
    let mut ans = crt;
    while let Some((head, rem)) = ans.split_once('\n') {
        if head.starts_with("-----") && head.ends_with("-----") {
            ans = rem;
        } else {
            break;
        }
    }
    while let Some((rem, tail)) = ans.rsplit_once("\n") {
        if tail.is_empty() || (tail.starts_with("-----") && tail.ends_with("-----")) {
            ans = rem;
        } else {
            break;
        }
    }
    ans
}

pub async fn generate_key() -> Result<String> {
    let res = tokio::process::Command::new("openssl")
        .args([
            "ecparam",
            "-name",
            "prime256v1",
            "-genkey",
            "-noout",
            "-out",
            "-",
        ])
        .stdin(std::process::Stdio::null())
        .stderr(std::process::Stdio::inherit())
        .stdout(std::process::Stdio::piped())
        .output()
        .await?;
    if !res.status.success() {
        bail!("openssl exited with code {} in generate_key", res.status);
    }
    Ok(String::from_utf8(res.stdout)?)
}

pub async fn generate_ca_crt(key: &str) -> Result<String> {
    let mut t1 = NamedTempFile::new()?;
    t1.write_all(
        "[req]\nprompt = no\ndistinguished_name = distinguished_name\n[distinguished_name]\nC=US\n"
            .as_bytes(),
    )?;

    let mut t2 = NamedTempFile::new()?;
    t2.write_all(key.as_bytes())?;

    let res = tokio::process::Command::new("openssl")
        .args(["req", "-x509", "-new", "-nodes", "-key"])
        .arg(t2.path())
        .args(["-sha256", "-days", "9999", "-out", "-", "-config"])
        .arg(t1.path())
        .stdin(std::process::Stdio::null())
        .stderr(std::process::Stdio::inherit())
        .stdout(std::process::Stdio::piped())
        .output()
        .await?;
    if !res.status.success() {
        bail!("openssl exited with code {} in generate_ca_crt", res.status);
    }
    Ok(String::from_utf8(res.stdout)?)
}

pub async fn generate_srs(key: &str, cn: &str) -> Result<String> {
    let mut t1 = NamedTempFile::new()?;
    write!(
        &mut t1,
        "[req]\nprompt = no\ndistinguished_name = distinguished_name\n[distinguished_name]\nCN={}\n",
        cn
    )?;
    let mut t2 = NamedTempFile::new()?;
    t2.write_all(key.as_bytes())?;
    let res = tokio::process::Command::new("openssl")
        .args(["req", "-new", "-key"])
        .arg(t2.path())
        .args(["-out", "-", "-config"])
        .arg(t1.path())
        .stdin(std::process::Stdio::null())
        .stderr(std::process::Stdio::inherit())
        .stdout(std::process::Stdio::piped())
        .output()
        .await?;
    if !res.status.success() {
        bail!("openssl exited with code {} in generate_srs", res.status);
    }
    Ok(String::from_utf8(res.stdout)?)
}

pub async fn generate_crt(
    ca_key: &str,
    ca_crt: &str,
    srs: &str,
    subcerts: &[String],
    timeout_days: u32,
) -> Result<String> {
    let mut t1 = NamedTempFile::new()?;
    let mut t2 = NamedTempFile::new()?;
    let mut t3 = NamedTempFile::new()?;
    let mut t4 = NamedTempFile::new()?;
    t1.write_all(srs.as_bytes())?;
    t2.write_all(ca_crt.as_bytes())?;
    t4.write_all(ca_key.as_bytes())?;

    let mut cmd = tokio::process::Command::new("openssl");
    cmd.arg("x509");
    cmd.arg("-req");
    cmd.arg("-days");
    cmd.arg(timeout_days.to_string());
    cmd.arg("-in");
    cmd.arg(t1.path());
    cmd.arg("-CA");
    cmd.arg(t2.path());
    cmd.arg("-CAkey");
    cmd.arg(t4.path());
    cmd.arg("-CAcreateserial");
    cmd.arg("-out");
    cmd.arg("-");
    if !subcerts.is_empty() {
        write!(&mut t3, "basicConstraints = critical, CA:TRUE
keyUsage = critical, keyCertSign, cRLSign, digitalSignature, nonRepudiation, keyEncipherment, keyAgreement
subjectKeyIdentifier = hash
nameConstraints = critical")?;
        for v in subcerts {
            write!(&mut t3, ", permitted;DNS:{}", v)?;
        }
        cmd.arg("-extfile");
        cmd.arg(t3.path());
    }
    let res = cmd
        .stdin(std::process::Stdio::null())
        .stderr(std::process::Stdio::piped())
        .stdout(std::process::Stdio::piped())
        .output()
        .await?;
    if !res.status.success() {
        bail!(
            "openssl exited with code {} in generate_crt:{}{}",
            res.status,
            String::from_utf8_lossy(&res.stdout),
            String::from_utf8_lossy(&res.stderr)
        );
    }
    Ok(String::from_utf8(res.stdout)?)
}

pub enum Type {
    Host,
    User,
}

pub async fn generate_ssh_crt(
    key_id: &str,
    principal: &str,
    ca_private_key: &str,
    client_public_key: &str,
    validity_days: u32,
    r#type: Type,
) -> Result<String> {
    let mut ssh_host_ca_key_file = NamedTempFile::with_suffix(".pem")?;
    let tmp_dir = TempDir::new()?;
    let client_public_key_path = tmp_dir.path().join("thing.pub");
    std::fs::write(&client_public_key_path, client_public_key.as_bytes())?;
    let output_certificate_path = tmp_dir.path().join("thing-cert.pub");
    writeln!(
        ssh_host_ca_key_file,
        "-----BEGIN OPENSSH PRIVATE KEY-----\n{}\n-----END OPENSSH PRIVATE KEY-----",
        ca_private_key
    )?;
    ssh_host_ca_key_file.flush()?;

    let mut cmd = tokio::process::Command::new("ssh-keygen");
    cmd.arg("-s");
    cmd.arg(ssh_host_ca_key_file.path());
    cmd.arg("-I");
    cmd.arg(key_id);
    if matches!(r#type, Type::Host) {
        cmd.arg("-h");
    }
    cmd.arg("-n");
    cmd.arg(principal);
    cmd.arg("-V");
    cmd.arg(format!("-5m:+{}d", validity_days));
    cmd.arg("-z");
    cmd.arg("42");
    cmd.arg(&client_public_key_path);
    let res = cmd
        .stdin(std::process::Stdio::null())
        .stderr(std::process::Stdio::piped())
        .stdout(std::process::Stdio::piped())
        .output()
        .await?;

    if !res.status.success() {
        bail!(
            "ssh-keygen exited with code {}: {}{}",
            res.status,
            String::from_utf8_lossy(&res.stdout),
            String::from_utf8_lossy(&res.stderr)
        );
    }
    Ok(std::fs::read_to_string(output_certificate_path)?)
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_strip() {
        assert_eq!(
            strip("-----BEGIN EC PRIVATE KEY-----\nX\nY\n-----END EC PRIVATE KEY-----\n"),
            "X\nY"
        );
        assert_eq!(
            strip("-----BEGIN EC PRIVATE KEY-----\nX\nY\n-----END EC PRIVATE KEY-----"),
            "X\nY"
        );
    }
}
