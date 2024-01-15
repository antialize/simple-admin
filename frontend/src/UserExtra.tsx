import * as QRCode from 'qrcode';
import Box from './Box'
import state from "./state";
import { observer } from "mobx-react";

const UserExtra = observer(function UserExtra({id}:{id:number}) {
    const obj = state.objects.get(id);
    if (!obj || !obj.current || !obj.current.content) return null;

    const ctx = obj.current.content;
    if (!ctx.otp_url) return null;
    return (<Box title="One time password">
        <img ref={(v) => {QRCode.toDataURL(ctx.otp_url).then((s) => {if (v) v.src = s;})}} />
    </Box>);
});

export default UserExtra;

