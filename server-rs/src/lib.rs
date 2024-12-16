use neon::prelude::*;
mod crypt;

fn crypt_hash(mut cx: FunctionContext) -> JsResult<JsString> {
    let key: Handle<JsString> = cx.argument(0)?;
    let v = crypt::hash(&key.value(&mut cx)).or_else(|e| cx.throw_error(format!("{:?}", e)))?;
    Ok(cx.string(v))
}

fn crypt_validate_password(mut cx: FunctionContext) -> JsResult<JsBoolean> {
    let provided: Handle<JsString> = cx.argument(0)?;
    let hash: Handle<JsString> = cx.argument(1)?;
    let v = crypt::validate_password(&provided.value(&mut cx), &hash.value(&mut cx))
        .or_else(|e| cx.throw_error(format!("{:?}", e)))?;
    Ok(cx.boolean(v))
}

fn crypt_validate_otp(mut cx: FunctionContext) -> JsResult<JsBoolean> {
    let token: Handle<JsString> = cx.argument(0)?;
    let base32_secret: Handle<JsString> = cx.argument(1)?;
    let v = crypt::validate_otp(&token.value(&mut cx), &base32_secret.value(&mut cx))
        .or_else(|e| cx.throw_error(format!("{:?}", e)))?;
    Ok(cx.boolean(v))
}

pub fn crypt_generate_otp_secret(mut cx: FunctionContext) -> JsResult<JsArray> {
    let name: Handle<JsString> = cx.argument(0)?;
    let (secret, url) = crypt::generate_otp_secret(name.value(&mut cx))
        .or_else(|e| cx.throw_error(format!("{:?}", e)))?;
    let secret = cx.string(secret);
    let url = cx.string(url);
    let res = cx.empty_array();
    res.set(&mut cx, 0, secret)?;
    res.set(&mut cx, 1, url)?;
    Ok(res)
}

#[neon::main]
fn main(mut cx: ModuleContext) -> NeonResult<()> {
    cx.export_function("cryptHash", crypt_hash)?;
    cx.export_function("cryptValidatePassword", crypt_validate_password)?;
    cx.export_function("cryptValidateOtp", crypt_validate_otp)?;
    cx.export_function("cryptGenerateOtpSecret", crypt_generate_otp_secret)?;
    Ok(())
}
