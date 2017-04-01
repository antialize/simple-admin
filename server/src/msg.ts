import * as webclient from './webclient'
import * as db from './db'
import * as actions from '../../shared/actions'

export function emit(host:number, type:string, message:string, subtype:string = null, url:string=null) {
    const time = +new Date() / 1000;
    db.db.run("INSERT INTO messages (`host`,`type`,`subtype`,`message`,`url`, `time`, `dismissed`) VALUES (?, ?, ?, ?, ?,?, 0)",
            [host, type, subtype, message, url, time],  function (err) {
                if (err != null) return;
                const act: actions.IAddMessage = {
                type: actions.ACTION.AddMessage,
                message: {
                    id: this.lastId,
                    host,
                    type,
                    message,
                    subtype,
                    time,
                    url,
                    dismissed: false
                }};
                console.log("Message", act);
                webclient.broadcast(act);
            });
}

export function setDismissed(id: number, dismissed: boolean) {  
    db.db.run("UPDATE `messages` SET `dismissed`=? WHERE `id`=?", [id, dismissed], (err)=>{
        if (err == null) return;
        console.log("Failed to set dismiss status", err);
    });
    const act: actions.ISetMessageDismissed = {
        type: actions.ACTION.SetMessageDismissed,
        id: id,
        dismissed: dismissed,
        source: "server"
    };

    webclient.broadcast(act);
}

export function getAll() {
    return new Promise<actions.IMessage[]>(
        cb=>{
            db.db.all("SELECT `id`, `host`, `type`, `subtype`, `message`, `url`, `time`, `dismissed` FROM `messages`", 
                (err, rows) => {
                    if (err) {
                        console.log("Failed to find messages in database");
                        cb([]);
                        return;
                    }
                    const res: actions.IMessage[] = [];
                    for (const row of rows) {
                        res.push({
                            id: row['id'], 
                            host: row['host'], 
                            type: row['type'], 
                            subtype: row['subtype'], 
                            message: row['message'],
                            url: row['url'],
                            time: row['time'],
                            dismissed: row['dismissed'] == 1});
                    }
                    cb(res);
                })});
}
    
 