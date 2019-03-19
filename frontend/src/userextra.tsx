import * as React from "react";
import { Box } from './box'
import * as QRCode from 'qrcode';
import { observer } from "mobx-react";
import state from "./state";

export default observer(({id}:{id:number})=>{
    const ctx = state.objects.get(id).current.content;
    let c: JSX.Element = null;
    if (!ctx.otp_url) return null;
    return (<Box title="One time password">
        <div>{ctx.otp_base32}</div>
        <img ref={(v) => QRCode.toDataURL(ctx.opt_url).then((s) => v.src = s)} />
    </Box>);
});



