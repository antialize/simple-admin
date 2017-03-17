import {User} from './user'
import {Group} from './group'
import {File} from './file'
import {IMainState} from './reducers';
import {Dispatch} from 'redux'
import {connect} from 'react-redux'
import * as React from "react";
import {IObject} from '../../shared/state'
import CircularProgress from 'material-ui/CircularProgress';
import RaisedButton from 'material-ui/RaisedButton';
import {HostExtra} from './hostextra'

interface IProps {
    class: string;
    id:number;
    version?:number;
}

interface Props {
    class: string;
    id:number;
    version?:number;
    objects?: {[version:number]:IObject};
}

function mapStateToProps(s:IMainState, p: IProps) {
    let ans:Props = {class: p.class, id: p.id, version: p.version, objects: p.id in s.objects ? s.objects[p.id] : null };
    return ans;
}

function mapDispatchToProps(dispatch:Dispatch<IMainState>, p: IProps) {
    return {};
}

function ObjectImpl(p:Props) {
    console.log(p.id, p.class);
    let obj = null;
    if (p.id < 0) {
        obj = {class:p.class, name:"", version:99999, content:{}};
    } else if (p.objects === null) {
        return <CircularProgress />
    } else if (p.version === null) {
        // TODO we need to copy the content from the newst item
    }

    let content=null;
    let extra=null;
    switch (p.class) {
    case 'host':
        content = <h1>HOST NOT IMPLEMENTED</h1>
        extra = <HostExtra id={p.id} />
        break;
    case 'user':
        content = <User id={p.id} version={p.version} />
        break;
    case 'group':
        content = <Group id={p.id} version={p.version} />
        break;
    case 'file':
        content = <File id={p.id} version={p.version} />
        break;
    default:
        content = <div><h1>NOT IMPLEMENTED</h1></div>
    }

    return (
        <div>
            <div>{content}</div>
            <div>
                <RaisedButton label="Save" primary={true} style={{margin:10}}/>
                <RaisedButton label="Save and deploy" primary={true} style={{margin:10}}/> 
                <RaisedButton label="Discard" secondary={true} style={{margin:10}}/>  
                <RaisedButton label="Delete" secondary={true} style={{margin:10}}/>  
            </div>
            <div>
                {extra}
            </div>
        </div>);
}

export const Object = connect(mapStateToProps, mapDispatchToProps)(ObjectImpl);