import {db, webClients} from './instances'
import { log } from 'winston';
import { WebClient } from './webclient';
import { ACTION, ISubscribeStatValues, IStatValueChanges} from '../../shared/actions';

const epoc = 1514764800

interface StatBucket {
    id: number;
    host: number;
    name: string;
    index: number;
    level: number;
    values: Buffer;
    dirty: boolean;
    ttl: number;
};

//let dirty: StatBucket[] = [];
const cache = new Map<string, StatBucket>();
const max_ttl = 5;

function key(host:number, name:string, level:number, index:number) {
    return host + "|" + "|" + name + "|" + level + "|" + index;
}

export async function flush() {
    //if (dirty.length == 0) return;
    let dirty:StatBucket[] = [];
    cache.forEach( (v, k) => {
        if (v.dirty)
            dirty.push(v);
        else if (v.ttl == 0)
            cache.delete(k);
        else
            v.ttl--;
    });

    log("info", "Start flush", "Dirty: ", dirty.length, "Cache size: ", cache.size);
    while (dirty.length != 0) {
        let q = "REPLACE INTO `stats` (`host`, `name`, `level`, `index`, `values`) VALUES ";
        let first = true;
        let params: any[] = [];
        while (dirty.length != 0 && params.length < 980) {
            const e = dirty.pop();
            e.dirty = false;
            if (first) first = false;
            else q += ", "
            q += "(?,?,?,?,?)";
            params.push(e.host);
            params.push(e.name);
            params.push(e.level);
            params.push(e.index);
            params.push(e.values);
        }
        log("info", "Flush", params.length / 5);
        await db.run(q, ...params);
    }
    log("info", "End flush", "Cache size: ", cache.size);
}

export async function get(host:number, name:string, level:number, index:number, create:boolean = false) {
    const k = key(host, name, level, index);
    if (cache.has(k)) {
        const res = cache.get(k);
        res.ttl = max_ttl;
        return cache.get(k);
    }
    const row = await db.get("SELECT `id`, `values` FROM `stats` WHERE `host`=? AND `name`=? AND `level`=? AND `index`=?", host, name, level, index);
    if (!row && !create) return null;
    const res: StatBucket = {id: null, host, name, level, index, dirty:false, values: null, ttl:max_ttl};
    if (row && row.values) {
        res.values = row.values;
        res.id = row.id;
    }
    if (res.values == null) res.values = new Buffer(4*1024);
    cache.set(k, res);
    return res;
}

interface Subscription {
    client: WebClient;
    target: number;
    host: number;
    name: string;
}

let subscriptions = new Map<number, Map<string, Map<number, Subscription> >>(); //host, name, target
let clientSubscriptions = new Map<WebClient, Map<number, Subscription[]>>(); //client, target

export async function register(host:number, name:string, time:number, interval:number, value:number) {
    let level = 20;
    let index = time;
    while (interval > 1) {
        interval = interval >> 1;
        index = index >> 1;
        level -= 1;
    }
    
    const ss = subscriptions.get(host);
    if (ss) {
        const sss = ss.get(name);
        if (sss) {
            sss.forEach( (s) => {
                const a: IStatValueChanges = {
                    type: ACTION.StatValueChanges,
                    target: s.target,
                    host,
                    name,
                    value,
                    level,
                    index
                };
                s.client.sendMessage(a);
            });
        }
    }
   
    do {
        const o = index & 1023;
        let bucket = await get(host, name, level, index >> 10, true);
        bucket.values.writeFloatBE((bucket.values.readFloatBE(o*4) || 0) + value, o*4);
        bucket.dirty = true;
        index = index >> 1;
        level -= 1;
    } while (level != 0);
}


export async function subscribe(client: WebClient, sub: ISubscribeStatValues) {
    if (sub == null) {
        const vs = clientSubscriptions.get(client);
        if (vs) {
            vs.forEach( (ss, t) => {
                for (const s of ss) {
                    let vv = subscriptions.get(s.host);
                    if (vv) {
                        let vvv = vv.get(s.name);
                        if (vvv) vvv.delete(sub.target);
                    }
                }
            });
        }
        clientSubscriptions.delete(client);
    } else {
        let vs = clientSubscriptions.get(client);
        if (vs) {
            let ss = vs.get(sub.target);
            if (ss) {
                for (const s of ss) {
                    let vv = subscriptions.get(s.host);
                    if (vv) {
                        let vvv = vv.get(s.name);
                        if (vvv) vvv.delete(sub.target);
                    }
                }
                vs.delete(sub.target);
            }
        }
    }

    if (sub && sub.values) {
        if (!subscriptions.has(sub.host)) subscriptions.set(sub.host, new Map<string, Map<number, Subscription> >());
        if (!clientSubscriptions.has(client)) clientSubscriptions.set(client, new Map<number, Subscription[]>());
        let subs: Subscription[] = [];
        for (const name of sub.values) {
            const s: Subscription = {
                client,
                target: sub.target,
                host: sub.host,
                name
            }
            subs.push(s);
            let x = subscriptions.get(s.host);
            if (!x.has(s.name)) x.set(s.name, new Map<number, Subscription>());
            x.get(s.name).set(sub.target, s);
        }
        clientSubscriptions.get(client).set(sub.target, subs);
    }
}

setInterval(flush, 10*60*1000);
