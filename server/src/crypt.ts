import * as crypt3 from "@idango/crypt3";
import { encrypt, verify } from "unixcrypt";

export function hash(password: string) {
    return new Promise<string>((cb, rej) => {
        cb(encrypt(password));
    });
}

export function validate(password: string, hash: string | undefined) {
    const ok = hash !== undefined;

    if (hash?.includes("=$")) {
        return verify(password, hash);
    }

    return new Promise<boolean>((cb, rej) => {
        crypt3(password, hash || "$1$SrkubyRm$DEQU3KupUxt4yfhbK1HyV/", (err, val) => {
            setTimeout(() => {}, 0);
            // TODO we should realy use a timing safe compare here
            cb(!err && val === hash && ok);
        });
    });
}
