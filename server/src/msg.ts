import * as webclient from './webclient'
import {db, webClients} from './instances'
import * as actions from '../../shared/actions'
import {errorHandler, ErrorType, SAError} from './error'

export class Msg {
    emit(host:number, type:string, message:string, subtype:string = null, url:string=null) {
        const time = +new Date() / 1000;
        db.db.run("INSERT INTO messages (`host`,`type`,`subtype`,`message`,`url`, `time`, `dismissed`) VALUES (?, ?, ?, ?, ?,?, 0)",
                [host, type, subtype, message, url, time],  function (err) {
                    if (err != null) {
                        errorHandler("Msg::emit", false)(new SAError(ErrorType.Database, err));
                        return;
                    }
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
                    webClients.broadcast(act);
                });
    }

    setDismissed(id: number, dismissed: boolean) {
        db.db.run("UPDATE `messages` SET `dismissed`=? WHERE `id`=?", [dismissed, id], (err)=>{
            if (err == null) return;
            errorHandler("Msg::setDismissed", false)(new SAError(ErrorType.Database, err));
        });
        const act: actions.ISetMessageDismissed = {
            type: actions.ACTION.SetMessageDismissed,
            id: id,
            dismissed: dismissed,
            source: "server"
        };

        webClients.broadcast(act);
    }

    getAll() {
        return new Promise<actions.IMessage[]>(
            (cb, cbe)=>{
                db.db.all("SELECT `id`, `host`, `type`, `subtype`, `message`, `url`, `time`, `dismissed` FROM `messages`", 
                    (err, rows) => {
                        if (err) {
                            cbe(new SAError(ErrorType.Database, err));
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
}   
 