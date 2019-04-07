import * as QRCode from 'qrcode';
import * as React from "react";
import Box from './Box'
import Typography from "@material-ui/core/Typography";
import state from "./state";
import { observer } from "mobx-react";

const UserExtra = observer(({id}:{id:number})=>{
    const ctx = state.objects.get(id).current.content;
    let c: JSX.Element = null;
    if (!ctx.otp_url) return null;
    return (<Box title="One time password">
        <Typography>{ctx.otp_base32}</Typography>
        <img ref={(v) => {console.log("A"); QRCode.toDataURL(ctx.opt_url).then((s) => {console.log("B"); v.src = s;})}} />
    </Box>);
});

export default UserExtra;

