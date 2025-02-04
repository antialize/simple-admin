import Cookies from "js-cookie";
import { action, makeObservable, observable } from "mobx";
import type { IClientAction } from "./shared_types";
import state, { CONNECTION_STATUS } from "./state";

class LoginState {
    constructor() {
        makeObservable(this);
    }

    @observable
    user = "";

    @observable
    pwd = "";

    @observable
    otp = "";

    @action
    login() {
        const l: IClientAction = {
            type: "Login",
            user: this.user,
            pwd: this.pwd,
            otp: this.otp,
        };
        state.sendMessage(l);
        state.connectionStatus = CONNECTION_STATUS.AUTHENTICATING;
        this.user = "";
        this.pwd = "";
        this.otp = "";
    }

    @action
    logout(forgetOtp: boolean) {
        const l: IClientAction = {
            type: "Logout",
            forgetPwd: true,
            forgetOtp,
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
}

export default LoginState;
