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

    /** Wall-clock time (ms since epoch) until which the login form is locked by IP rate-limiting. */
    @observable
    rateLimitUntil = 0;

    /** Seconds remaining in the rate-limit countdown (updated by a ticker). */
    @observable
    rateLimitSecondsLeft = 0;

    private rateLimitTimer: ReturnType<typeof setInterval> | null = null;

    @action
    startRateLimit(delaySecs: number) {
        this.rateLimitUntil = Date.now() + delaySecs * 1000;
        this.rateLimitSecondsLeft = delaySecs;
        if (this.rateLimitTimer !== null) clearInterval(this.rateLimitTimer);
        this.rateLimitTimer = setInterval(
            action(() => {
                const left = Math.max(0, Math.ceil((this.rateLimitUntil - Date.now()) / 1000));
                this.rateLimitSecondsLeft = left;
                if (left === 0) {
                    clearInterval(this.rateLimitTimer!);
                    this.rateLimitTimer = null;
                    state.connectionStatus = CONNECTION_STATUS.LOGIN;
                }
            }),
            500,
        );
    }

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
