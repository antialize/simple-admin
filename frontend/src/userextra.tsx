import * as React from "react";
import { Box } from './box'
import * as QRCode from 'qrcode';
import { observer } from "mobx-react";
import state from "./state";
import Typography from "@material-ui/core/Typography";

export default observer(({id}:{id:number})=>{
    const ctx = state.objects.get(id).current.content;
    let c: JSX.Element = null;
    if (!ctx.otp_url) return null;
    return (<Box title="One time password">
        <Typography>{ctx.otp_base32}</Typography>
        <img ref={(v) => {console.log("A"); QRCode.toDataURL(ctx.opt_url).then((s) => {console.log("B"); v.src = s;})}} />
    </Box>);
});



