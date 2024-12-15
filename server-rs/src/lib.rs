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

#[neon::main]
fn main(mut cx: ModuleContext) -> NeonResult<()> {
    cx.export_function("cryptHash", crypt_hash)?;
    cx.export_function("cryptValidatePassword", crypt_validate_password)?;
    Ok(())
}
