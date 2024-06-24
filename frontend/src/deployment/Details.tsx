import { Typography } from "@mui/material";
import { observer } from "mobx-react";
import nullCheck from ".././shared/nullCheck";
import type * as State from ".././shared/state";
import { type IType, TypePropType } from ".././shared/type";
import Editor from "../Editor";
import DisplayError from "../Error";
import { InformationList, InformationListRow } from "../InformationList";
import state from "../state";

function CententInfo(p: { c: Record<string, any> | null; t: State.IObject2<IType> }) {
    if (!p.c) return <DisplayError>Missing p.c</DisplayError>;
    const i = p.c[p.t.name];
    if (!i) return <DisplayError>missing i</DisplayError>;

    return (
        <InformationList>
            <InformationListRow name="Name">
                <Typography>{p.c.name}</Typography>
            </InformationListRow>
            {nullCheck(p.t.content.content).map((v) => {
                switch (v.type) {
                    case TypePropType.bool:
                        return (
                            <InformationListRow name={v.title}>
                                <Typography>{i ? "true" : false}</Typography>
                            </InformationListRow>
                        );
                    case TypePropType.text:
                    case TypePropType.choice:
                        return (
                            <InformationListRow name={v.title}>
                                <Typography>{i ?? ""}</Typography>
                            </InformationListRow>
                        );
                    case TypePropType.number:
                        return (
                            <InformationListRow name={v.title}>
                                <Typography>{`${i ?? ""}`}</Typography>
                            </InformationListRow>
                        );
                    case TypePropType.document:
                        return (
                            <InformationListRow name={v.title}>
                                <Typography>{i ?? ""}</Typography>
                            </InformationListRow>
                        );
                }
                // biome-ignore lint/correctness/useJsxKeyInIterable: there is only one element
                return <>Unhandled type</>;
            })}
        </InformationList>
    );
}

const Details = observer(function Details({ index }: { index: number }) {
    const p = state.deployment;
    if (p === null) return <DisplayError>Missing state.deployment</DisplayError>;
    const o = p.objects[index];
    const t = o?.typeId !== null && state.types.get(o.typeId);
    if (!t) return <DisplayError>Missing type</DisplayError>;

    return (
        <div>
            <Typography variant="h4">Information</Typography>
            <InformationList>
                <InformationListRow name="Title">
                    <Typography>{o.title}</Typography>
                </InformationListRow>
                <InformationListRow name="Deploy Name">
                    <Typography>{o.name}</Typography>
                </InformationListRow>
                <InformationListRow name="Host">
                    <Typography>{o.hostName}</Typography>
                </InformationListRow>
                <InformationListRow name="Type">
                    <Typography>{o.typeName}</Typography>
                </InformationListRow>
                {o.typeId !== null ? (
                    <InformationListRow name="Kind">
                        <Typography>{t.content.kind}</Typography>
                    </InformationListRow>
                ) : null}
            </InformationList>
            {o.typeId !== null ? (
                <div>
                    <Typography variant="h4">Old</Typography>
                    <CententInfo c={o.prevContent} t={t} />
                    <Typography variant="h4">New</Typography>
                    <CententInfo c={o.nextContent} t={t} />
                </div>
            ) : null}
            <Typography variant="h4">Script</Typography>
            <Editor
                title="Script"
                setLang={(_: string) => {}}
                lang="Python"
                fixedLang={true}
                readOnly={true}
                setData={(_: string) => {}}
                data={o.script}
            />
        </div>
    );
});

export default Details;
