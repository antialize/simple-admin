import * as React from "react";
import Dialog from 'material-ui/Dialog';
import TextField from 'material-ui/TextField';
import RaisedButton from 'material-ui/RaisedButton';
import {CONNECTION_STATUS, ILogin, ACTION, ILogout} from '../../shared/actions';
import CircularProgress from 'material-ui/CircularProgress';
import { observable, action } from "mobx";
import state from "./state";
import { observer } from "mobx-react";
import Cookies = require("js-cookie");

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

    return (<Dialog title="Login" modal={true} open={true}>
        {progress} {message} <br />
        <form onSubmit={(e)=>{if (!dlog) l.login(); e.preventDefault()}}>
            <TextField name="user" hintText="User" floatingLabelText="User" disabled={dis} value={l.user} onChange={(_,value)=>l.user=value} errorText={(dis || l.user)?null:"Required"}/><br />
            <TextField name="pwd" hintText="Password" floatingLabelText="Password" type="password" disabled={dis} value={l.pwd} onChange={(_,value)=>l.pwd = value} errorText={(dis || l.pwd)?null:"Required"}/><br />
            <TextField name="otp" hintText="One Time Password" floatingLabelText="One Time Password" disabled={dis || o} value={l.otp} onChange={(_,value)=>l.otp = value} errorText={(dis || l.otp || o)?null:"Required"} /> <br/>
            <RaisedButton label="Login" primary={true} type="submit" disabled={dlog}/>
        </form>
    </Dialog>);
});

