import { observer } from "mobx-react";
import * as QRCode from "qrcode";
import Box from "./Box";
import state from "./state";

const UserExtra = observer(function UserExtra({ id }: { id: number }) {
    const obj = state.objects.get(id);
    if (!obj?.current?.content) return null;

    const ctx = obj.current.content;
    if (typeof ctx.otp_url !== "string") return null;
    const url = ctx.otp_url;
    return (
        <Box title="One time password">
            <img
                alt="user qr code"
                ref={(v) => {
                    QRCode.toDataURL(url).then(
                        (s) => {
                            if (v) v.src = s;
                        },
                        () => {},
                    );
                }}
            />
        </Box>
    );
});

export default UserExtra;
