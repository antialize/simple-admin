import * as React from "react";
import {CONNECTION_STATUS, ILogin, ACTION, ILogout} from '../../shared/actions';
import { observable, action } from "mobx";
import state from "./state";
import { observer } from "mobx-react";
import Cookies = require("js-cookie");
import CircularProgress from "@material-ui/core/CircularProgress";
import Dialog from "@material-ui/core/Dialog";
import TextField from "@material-ui/core/TextField";
import Button from "@material-ui/core/Button";
import DialogTitle from "@material-ui/core/DialogTitle";
import DialogContent from "@material-ui/core/DialogContent";

export class LoginState {
    @observable
    user: string;
    @observable
    pwd: string;
    @observable
    otp: string;

    @action
    login() {
        const l: ILogin  = {
            type: ACTION.Login,
            user: this.user,
            pwd: this.pwd,
            otp: this.otp
        }
        state.sendMessage(l);
        state.connectionStatus = CONNECTION_STATUS.AUTHENTICATING;
        this.user = "";
        this.pwd = "";
        this.otp = "";
    }

    @action
    logout(forgetOtp: boolean) {
        const l: ILogout = {
            type: ACTION.Logout,
            forgetPwd : true,
            forgetOtp
        };
        state.sendMessage(l);

        state.loaded = false;
        if (forgetOtp) {
            this.user = "";
            this.pwd = "";
            this.otp = "";
            Cookies.remove("simple-admin-session");
        }
    }
};

export const Login = observer(()=>{
    const l = state.login;
    let message="";
    switch (state.connectionStatus) {
    case CONNECTION_STATUS.AUTHENTICATING: message = "Authenticating"; break;
    case CONNECTION_STATUS.CONNECTED: message = "Connected"; break;
    case CONNECTION_STATUS.CONNECTING: message = "Connecting"; break;
    case CONNECTION_STATUS.INITING: message = "Loading initial state"; break;
    case CONNECTION_STATUS.LOGIN: message = state.authMessage; break;
    case CONNECTION_STATUS.WAITING: message = "Waiting"; break;
    }
    let progress = null;
    if (state.connectionStatus != CONNECTION_STATUS.LOGIN) progress = <CircularProgress />;

    const dis = state.connectionStatus != CONNECTION_STATUS.LOGIN;
    const o = (state.authUser == l.user && state.authOtp);
    const dlog = dis || !l.user || !l.pwd || (!l.otp && !o);

    return (<Dialog open={true} fullWidth={true}>
        <DialogTitle>Login</DialogTitle>
        <DialogContent>
            {progress} {message} <br />
            <form onSubmit={(e)=>{if (!dlog) l.login(); e.preventDefault()}}>
                <TextField name="user" helperText="User" disabled={dis} value={l.user} onChange={(e)=>l.user=e.target.value} error={!(dis || l.user)}/><br />
                <TextField name="pwd" helperText="Password" type="password" disabled={dis} value={l.pwd} onChange={(e)=>l.pwd = e.target.value} error={!(dis || l.pwd)}/><br />
                <TextField name="otp" helperText="One Time Password" disabled={dis || o} value={l.otp} onChange={(e)=>l.otp = e.target.value} error={!(dis || l.otp || o)} /> <br/>
                <Button variant="contained" color="primary" type="submit" disabled={dlog}>Login</Button>
            </form>
        </DialogContent>
    </Dialog>);
});

