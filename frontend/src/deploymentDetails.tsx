import * as React from "react";
import * as State from '../../shared/state'
import {IType, TypePropType} from '../../shared/type'
import {InformationList, InformationListRow} from './information_list'
import state from "./state";
import { observer } from "mobx-react";
import Editor from './editor'

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

export default observer(({index}:{index:number}) => {
    const o = state.deployment.objects[index];
    const t = o && o.typeId !== null && state.types.get(o.typeId);
    return <div>
            <h1>Information</h1>
            <InformationList>
                <InformationListRow name="Title">{o.title}</InformationListRow>
                <InformationListRow name="Deploy Name">{o.name}</InformationListRow>
                <InformationListRow name="Host">{o.hostName}</InformationListRow>
                <InformationListRow name="Type">{o.typeName}</InformationListRow>
                {o.typeId !== null? <InformationListRow name="Kind">{t.content.kind}</InformationListRow>: null}
            </InformationList>
            {o.typeId !== null?
                <div>
                    <h1>Old</h1>
                    <CententInfo c={o.prevContent} t={t}/>
                    <h1>New</h1>
                    <CententInfo c={o.nextContent} t={t}/>
                </div>: null}
            <h1>Script</h1>
            <Editor title="Script" setLang={(lang:string)=>{}} lang="Python" fixedLang={true} readOnly={true} setData={(data:string)=>{}} data={o.script} />
        </div>;
});

