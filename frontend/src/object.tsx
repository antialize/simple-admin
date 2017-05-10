import {User} from './user'
import {Group} from './group'
import {File} from './file'
import {Host} from './host'
import {Collection} from './collection'
import {IMainState} from './reducers'
import {Dispatch} from 'redux'
import {connect} from 'react-redux'
import * as React from "react"
import {IObject} from '../../shared/state'
import {ACTION, IDiscardObject, ISaveObject} from '../../shared/actions'
import CircularProgress from 'material-ui/CircularProgress'
import RaisedButton from 'material-ui/RaisedButton'
import {HostExtra} from './hostextra'
import {Box} from './box'

interface IProps {
    class: string;
    id:number;
    version?:number;
}

interface StateProps {
    class: string;
    id:number;
    hasCurrent: boolean;
}

interface DispactProps {
    discard: ()=>void;
    save: ()=>void;
}

function mapStateToProps(s:IMainState, p: IProps): StateProps {
    return {class: p.class, id: p.id, hasCurrent: p.id in s.objects && s.objects[p.id].current != null};
}

function mapDispatchToProps(dispatch:Dispatch<IMainState>, p: IProps): DispactProps{
     return {
        discard: () => {
            const a:IDiscardObject = {
                type: ACTION.DiscardObject,
                id: p.id
            };
            dispatch(a);
        },
        save: () => {
            const a:ISaveObject = {
                type: ACTION.SaveObject,
                id: p.id
            };
            dispatch(a);
        },
    }
}

function ObjectImpl(p:DispactProps & StateProps) {
    if (!p.hasCurrent) return <CircularProgress />;
    let isNew = p.id < 0;
    let content=null;
    let extra=null;
    switch (p.class) {
    case 'host':
        content = <Host id={p.id}/>
        if (!isNew) extra = <HostExtra id={p.id} />
        break;
    case 'user':
        content = <User id={p.id} />
        break;
    case 'group':
        content = <Group id={p.id} />
        break;
    case 'file':
        content = <File id={p.id} />
        break;
    case 'collection':
        content = <Collection id={p.id} />
        break;
    default:
        content = <div><h1>NOT IMPLEMENTED</h1></div>
    }

    //<RaisedButton label="Save and deploy" primary={true} style={{margin:10}}/>
    //<RaisedButton label="Delete" secondary={true} style={{margin:10}}/> ->>
    return (
        <div>
            <Box title={p.class} expanded={true} collapsable={true}>
                <div>{content}</div>
                <div>
                    <RaisedButton label="Save" primary={true} style={{margin:10}} onClick={p.save}/>
                    <RaisedButton label="Discard" secondary={true} style={{margin:10}} onClick={p.discard}/>  
                </div>
            </Box>
            <div>
                {extra}
            </div>
        </div>);
}

export const Object = connect(mapStateToProps, mapDispatchToProps)(ObjectImpl);
