use anyhow::{bail, Context, Result};
use base64::Engine;
use libc::{size_t, ssize_t};
use std::{
    ffi::{CStr, CString},
    os::raw::{c_char, c_int, c_uint, c_ulong, c_void},
};

extern "C" {
    pub fn crypt_rn(
        __phrase: *const c_char,
        __setting: *const c_char,
        __data: *mut c_void,
        __size: c_int,
    ) -> *mut c_char;

    pub fn crypt_gensalt_rn(
        __prefix: *const c_char,
        __count: c_ulong,
        __rbytes: *const c_char,
        __nrbytes: c_int,
        __output: *mut c_char,
        __output_size: c_int,
    ) -> *mut c_char;

    pub fn getrandom(__buf: *mut c_void, buflen: size_t, flags: c_uint) -> ssize_t;
}

const CRYPT_DATA_SIZE: usize = 384 + 384 + 512 + 767 + 1 + 30720 + 128;

pub fn hash(key: &str) -> Result<String> {
    let key = CString::new(key)?;
    unsafe {
        let mut buf = [0; 128];
        let salt = crypt_gensalt_rn(
            std::ptr::null(),
            0,
            std::ptr::null(),
            0,
            buf.as_mut_ptr(),
            buf.len() as c_int,
        );
        if salt.is_null() {
            Err(std::io::Error::last_os_error()).context("Unable to generate salt")?;
        }
        let mut buf = [0u8; CRYPT_DATA_SIZE];
        let res = crypt_rn(
            key.as_ptr(),
            salt,
            (&mut buf) as *mut u8 as *mut c_void,
            buf.len() as c_int,
        );
        if res.is_null() {
            Err(std::io::Error::last_os_error()).context("Unable to crypt password")?;
        }
        Ok(CStr::from_ptr(res).to_str().map(|v| v.to_string())?)
    }
}

pub fn validate_password(provided: &str, hash: &str) -> Result<bool> {
    let provided = CString::new(provided)?;
    let chash = CString::new(hash)?;
    unsafe {
        let mut buf = [0u8; CRYPT_DATA_SIZE];
        let res = crypt_rn(
            provided.as_ptr(),
            chash.as_ptr(),
            (&mut buf) as *mut u8 as *mut c_void,
            buf.len() as c_int,
        );
        if res.is_null() {
            Err(std::io::Error::last_os_error()).context("Unable to crypt password")?;
        }
        let l = libc::strlen(res);
        if l != hash.len() {
            bail!("Wrong hash size");
        }
        // Based on netbsd consttime_memequal.c
        // https://github.com/intel/linux-sgx/blob/main/sdk/tlibc/string/consttime_memequal.c
        let mut sum = 0;
        for i in 0..l {
            sum |= *chash.as_ptr().add(i) ^ *res.add(i);
        }
        let sum = sum as u32;
        Ok((1 & (sum.wrapping_sub(1) >> 8)) != 0)
    }
}

pub fn validate_otp(token: &str, base64_secret: &str) -> Result<bool> {
    let otp_secret = base64::engine::general_purpose::STANDARD.decode(base64_secret)?;
    let totp = totp_rs::Rfc6238::with_defaults(otp_secret)?;
    let totp = totp_rs::TOTP::from_rfc6238(totp)?;
    Ok(totp.check_current(token)?)
}

pub fn generate_otp_secret(name: String) -> Result<(String, String)> {
    let mut secret = vec![0u8; 32];
    unsafe {
        // We use getrandom here because the function used in totp_rs is unsafe
        if getrandom(
            secret.as_mut_ptr() as *mut c_void,
            secret.len(),
            0,
        ) != secret.len() as ssize_t
        {
            Err(std::io::Error::last_os_error()).context("getrandom failed")?;
        }
    }
    let mut totp = totp_rs::Rfc6238::with_defaults(secret).context("Creating Rfc6238")?;
    totp.issuer("Simple Admin".to_string());
    totp.account_name(name);
    let totp = totp_rs::TOTP::from_rfc6238(totp).context("from_rfc6238")?;
    Ok((totp.get_secret_base32(), totp.get_url()))
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn crypt() -> Result<()> {
        let v1 = hash("my_password")?;
        assert!(validate_password("my_password", &v1)?);
        assert!(!(validate_password("my_password2", &v1)?));
        Ok(())
    }

    #[test]
    fn otp() -> Result<()> {
        let (secret, _) = generate_otp_secret("monkey".to_string())?;

        let token = {
            let otp_secret = base64::engine::general_purpose::STANDARD.decode(&secret)?;
            let totp = totp_rs::Rfc6238::with_defaults(otp_secret)?;
            totp_rs::TOTP::from_rfc6238(totp)?.generate_current()?
        };
        assert!(!validate_otp("0000009", &secret)?);
        assert!(validate_otp(&token, &secret)?);
        Ok(())
    }
}
