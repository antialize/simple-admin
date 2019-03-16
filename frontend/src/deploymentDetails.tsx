import * as React from "react";
import * as State from '../../shared/state'
import {IType, TypePropType} from '../../shared/type'
import {InformationList, InformationListRow} from './information_list'
import state from "./state";
import { observer } from "mobx-react";

interface IProps {
    index: number;
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

export default observer((p:IProps) => {
    const o = state.deployment.objects[p.index];
    return <div>nop</div>;
    //TODO fixme once we are done
    /*const t = o && o.typeId !== null && state.types[o.typeId];
    return <div>
            <h1>Information</h1>
            <InformationList>
                <InformationListRow name="Title">{props.o.title}</InformationListRow>
                <InformationListRow name="Deploy Name">{props.o.name}</InformationListRow>
                <InformationListRow name="Host">{props.o.hostName}</InformationListRow>
                <InformationListRow name="Type">{props.o.typeName}</InformationListRow>
                {props.o.typeId !== null? <InformationListRow name="Kind">{props.t.content.kind}</InformationListRow>: null}
            </InformationList>
            {props.o.typeId !== null?
                <div>
                    <h1>Old</h1>
                    <CententInfo c={props.o.prevContent} t={props.t}/>
                    <h1>New</h1>
                    <CententInfo c={props.o.nextContent} t={props.t}/>
                </div>: null}
            <h1>Script</h1>
            <Editor title="Script" setLang={(lang:string)=>{}} lang="Python" fixedLang={true} readOnly={true} setData={(data:string)=>{}} data={props.o.script} />
        </div>*/
});

