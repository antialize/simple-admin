import * as crypt3 from 'crypt3'
import * as crypto from 'crypto'


export function hash(password:string) {
    const salt = crypt3.createSalt("sha512");
    return new Promise<string>((cb, rej) => {
        crypt3(password, salt, (err, val)=> {
            if (err) rej(err);
            else cb(val);
        })});
}

export function validate(password: string, hash:string | undefined) {
    let ok = hash !== undefined;
    return new Promise<boolean>((cb, rej) => {
        crypt3(password, hash || "$1$SrkubyRm$DEQU3KupUxt4yfhbK1HyV/", (err, val)=> {
            if (err) rej(err);
            // TODO we should realy use a timing safe compare here
            cb(val === hash && ok);
        })});
}