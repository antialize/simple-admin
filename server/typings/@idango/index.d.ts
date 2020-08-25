interface Crypt3 {
    (password:string, salt:string): string;
    (password:string, salt:string, cb:(err:boolean, val:string)=>void): void;
    createSalt(salt?:"md5"|"blowfish"|"sha256"|"sha512"):string;
}

declare var Crypt3: Crypt3;

declare module '@idango/crypt3' {
    export = Crypt3;
}
