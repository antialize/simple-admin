import * as React from "react";
import {IMainState} from './reducers';
import * as State from '../../shared/state'
import {IType, TypePropType} from '../../shared/type'

import * as Actions from '../../shared/actions'
import {Dispatch} from 'redux'
import {connect} from 'react-redux'
import TextField from 'material-ui/TextField';
import RaisedButton from 'material-ui/RaisedButton';
import Checkbox from 'material-ui/Checkbox';

import Editor from './editor'

import * as page from './page'
import CircularProgress from 'material-ui/CircularProgress';
import {InformationList, InformationListRow} from './information_list'

interface IProps {
    index: number;
}

interface StateProps {
    o: State.IDeploymentObject;
    t: State.IObject2<IType>;
}

function mapStateToProps(s:IMainState, p:IProps): StateProps {
    const o = s.deployment.objects[p.index];
    const t = o && s.types[o.typeId];
    return {o, t};
}

interface StateProps {
    o: State.IDeploymentObject;
    t: State.IObject2<IType>;
}

function CententInfo(p: {c:{[key:string]:any}, t: State.IObject2<IType>}) {
    if (!p.c) return <span>None</span>;

    return (
        <InformationList>
            <InformationListRow name="Name">{p.c.name}</InformationListRow>
            {p.t.content.content.map(v => {
                switch (v.type) {
                case TypePropType.bool:
                    return <InformationListRow name={v.title}>{p.c[v.name]?"true":false}</InformationListRow>;
                case TypePropType.text:
                case TypePropType.choice:
                    return <InformationListRow name={v.title}>{p.c[v.name] || ""}</InformationListRow>;
                case TypePropType.number:
                    return <InformationListRow name={v.title}>{""+(p.c[v.name] || "")}</InformationListRow>;
                case TypePropType.document:
                    return <InformationListRow name={v.title}>{p.c[v.name] || ""}</InformationListRow>;
                }
            })}
        </InformationList>);
}

function DeploymentDetailsImpl(props: StateProps) {
    return (
        <div>
            <h1>Information</h1>
            <InformationList>
                <InformationListRow name="Title">{props.o.title}</InformationListRow>
                <InformationListRow name="Deploy Name">{props.o.name}</InformationListRow>
                <InformationListRow name="Host">{props.o.hostName}</InformationListRow>
                <InformationListRow name="Type">{props.o.typeName}</InformationListRow>
                <InformationListRow name="Kind">{props.t.content.kind}</InformationListRow>
            </InformationList>
            <h1>Old</h1>
            <CententInfo c={props.o.prevContent} t={props.t}/>
            <h1>New</h1>
            <CententInfo c={props.o.nextContent} t={props.t}/>
            <h1>Script</h1>
            <Editor setLang={(lang:string)=>{}} lang="Python" fixedLang={true} readOnly={true} setData={(data:string)=>{}} data={props.o.script} />
        </div>);
}

export const DeploymentDetails = connect(mapStateToProps)(DeploymentDetailsImpl);
