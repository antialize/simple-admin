import * as React from "react";
import * as State from '../../shared/state'
import {IType, TypePropType} from '../../shared/type'
import {InformationList, InformationListRow} from './information_list'
import state from "./state";
import { observer } from "mobx-react";
import Editor from './editor'
import Typography from "@material-ui/core/Typography";

function CententInfo(p: {c:{[key:string]:any}, t: State.IObject2<IType>}) {
    if (!p.c) return <span>None</span>;

    return (
        <InformationList>
            <InformationListRow name="Name"><Typography>{p.c.name}</Typography></InformationListRow>
            {p.t.content.content.map(v => {
                switch (v.type) {
                case TypePropType.bool:
                    return <InformationListRow name={v.title}><Typography>{p.c[v.name]?"true":false}</Typography></InformationListRow>;
                case TypePropType.text:
                case TypePropType.choice:
                    return <InformationListRow name={v.title}><Typography>{p.c[v.name] || ""}</Typography></InformationListRow>;
                case TypePropType.number:
                    return <InformationListRow name={v.title}><Typography>{""+(p.c[v.name] || "")}</Typography></InformationListRow>;
                case TypePropType.document:
                    return <InformationListRow name={v.title}><Typography>{p.c[v.name] || ""}</Typography></InformationListRow>;
                }
            })}
        </InformationList>);
}

export default observer(({index}:{index:number}) => {
    const o = state.deployment.objects[index];
    const t = o && o.typeId !== null && state.types.get(o.typeId);
    return <div>
            <Typography variant="h4">Information</Typography>
            <InformationList>
                <InformationListRow name="Title"><Typography>{o.title}</Typography></InformationListRow>
                <InformationListRow name="Deploy Name"><Typography>{o.name}</Typography></InformationListRow>
                <InformationListRow name="Host"><Typography>{o.hostName}</Typography></InformationListRow>
                <InformationListRow name="Type"><Typography>{o.typeName}</Typography></InformationListRow>
                {o.typeId !== null? <InformationListRow name="Kind"><Typography>{t.content.kind}</Typography></InformationListRow>: null}
            </InformationList>
            {o.typeId !== null?
                <div>
                    <Typography variant="h4">Old</Typography>
                    <CententInfo c={o.prevContent} t={t}/>
                    <Typography variant="h4">New</Typography>
                    <CententInfo c={o.nextContent} t={t}/>
                </div>: null}
            <Typography variant="h4">Script</Typography>
            <Editor title="Script" setLang={(lang:string)=>{}} lang="Python" fixedLang={true} readOnly={true} setData={(data:string)=>{}} data={o.script} />
        </div>;
});

