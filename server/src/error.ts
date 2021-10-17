import {webClients} from './instances';
import {WebClient} from './webclient'
import {IAlert, ACTION} from './shared/actions';
import {log} from 'winston';

export enum ErrorType {Database, Unknown, SyntaxError}

export class SAError {
    constructor(public type:ErrorType, public content: any) {}
};

export interface ErrorDescription {
    type: ErrorType;
    typeName: string;
    description: string;
}

export function descript(err:any) {
    let type: ErrorType;
    let description: string;
    let typeName: string = "Unknown";

    if (err instanceof SyntaxError) {
        type = ErrorType.SyntaxError;
        description = err.message;
    } else if (err instanceof Error) {
        type = ErrorType.Unknown;
        description = err.message;
    } else if (err instanceof SAError) {
        type = err.type;
        description = ""+err.content;
    } else {
        type = ErrorType.Unknown;
        description = ""+err;

    }

    switch (type) {
    case ErrorType.Database: typeName="Database"; break;
    case ErrorType.SyntaxError: typeName="Syntax"; break;
    case ErrorType.Unknown: typeName="Unknown"; break;
    }

    return {type, typeName, description};
}

export function errorHandler(place: string, webclient?: WebClient | false) {
    return (err:any) => {
        let d = descript(err);
        console.log(err);
        log('error', "An error occured in "+place, {typename: d.typeName, description: d.description, err});
        let res:IAlert = {type: ACTION.Alert, title: "Error: " + d.typeName , message: "A " + d.type + " error occurned "+place+": \n"+d.description };
        if (webclient === false) {}
        else if (webclient)
            webclient.sendMessage(res);
        else 
            webClients.broadcast(res);
    }
}
