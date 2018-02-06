import * as React from "react";
import { Status } from "./status"
import { IStatus, IService } from '../../shared/status';
import { IMainState } from './reducers';
import { connect, Dispatch } from 'react-redux';
import { Box } from './box'
import * as QRCode from 'qrcode';

interface ExternProps {
    id: number;
}

interface IProps {
    url: string;
    secret: string;
}

function mapStateToProps2(state: IMainState, props: ExternProps): IProps {
    const c = state.objects[props.id].current.content;
    return { url: c.otp_url, secret: c.otp_base32 };
}

function UserExtraImpl(props: IProps) {
    let c: JSX.Element = null;
    if (!props.url) return null;
    return (<Box title="One time password">
        <div>{props.secret}</div>
        <img ref={(v) => QRCode.toDataURL(props.url).then((s) => v.src = s)} />
    </Box>);
}

export let UserExtra = connect(mapStateToProps2)(UserExtraImpl);


