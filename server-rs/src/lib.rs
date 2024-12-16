mod crypt;
use neon::types::extract::{Error, Json};

#[neon::export(name = "cryptHash")]
fn crypt_hash(key: String) -> Result<String, Error> {
    Ok(crypt::hash(&key)?)
}

#[neon::export(name = "cryptValidatePassword")]
fn crypt_validate_password(provided: String, hash: String) -> Result<bool, Error> {
    Ok(crypt::validate_password(&provided, &hash)?)
}

#[neon::export(name = "cryptValidateOtp")]
fn crypt_validate_otp(token: String, base32_secret: String) -> Result<bool, Error> {
    Ok(crypt::validate_otp(&token, &base32_secret)?)
}

#[neon::export(name = "cryptGenerateOtpSecret")]
fn crypt_generate_otp_secret(name: String) -> Result<Json<(String, String)>, Error> {
    Ok(Json(crypt::generate_otp_secret(name)?))
}
