import { json } from "@codemirror/lang-json";
import { python } from "@codemirror/lang-python";
import { EditorState } from "@codemirror/state";
import { Typography } from "@mui/material";
import CodeMirror from "@uiw/react-codemirror";
import { EditorView } from "codemirror";
import { observer } from "mobx-react";
import CodeMirrorMerge from "react-codemirror-merge";
import Box from "../Box";
import DisplayError from "../Error";
import { InformationList, InformationListRow } from "../InformationList";
import { type IObject2, type IType, type JsonMap, TypePropType } from "../shared_types";
import state from "../state";

function CententInfo({
    prev,
    next,
    t,
}: { prev: JsonMap | null; next: JsonMap | null; t: IObject2<IType> }) {
    const rows = [];
    for (const p of t.content.content ?? []) {
        if (
            p.type === TypePropType.none ||
            p.type === TypePropType.monitor ||
            p.type === TypePropType.typeContent
        )
            continue;
        const prev_value = prev?.[p.name];
        const next_value = next?.[p.name];

        let prev_element = <Typography>Missing</Typography>;
        let next_element = <Typography>Missing</Typography>;
        switch (p.type) {
            case TypePropType.bool:
                if (prev_value != null)
                    prev_element = <Typography>{prev_value ? "true" : "false"}</Typography>;
                if (next_value != null)
                    next_element = <Typography>{next_value ? "true" : "false"}</Typography>;
                break;
            case TypePropType.text:
            case TypePropType.choice:
            case TypePropType.document:
                if (prev_value != null) prev_element = <Typography>{prev_value as any}</Typography>;
                if (next_value != null) next_element = <Typography>{next_value as any}</Typography>;
                break;
            case TypePropType.number:
                if (prev_value != null) prev_element = <Typography>{`${prev_value}`}</Typography>;
                if (next_value != null) next_element = <Typography>{`${next_value}`}</Typography>;
                break;
        }
        if (prev_value === next_value) {
            rows.push(
                <tr>
                    <th>{p.title}</th>
                    <td>{prev_element}</td>
                    <td>{next_element}</td>
                </tr>,
            );
        } else {
            rows.push(
                <tr>
                    <th style={{ color: "orange" }}>{p.title}</th>
                    <td style={{ color: "red" }}>{prev_element}</td>
                    <td style={{ color: "green" }}>{next_element}</td>
                </tr>,
            );
        }
    }
    return <table>{rows}</table>;
}

const Details = observer(function Details({ index }: { index: number }) {
    const p = state.deployment;
    if (p === null) return <DisplayError>Missing state.deployment</DisplayError>;
    const o = p.objects[index];
    const t = o?.typeId !== null && state.types.get(o.typeId);
    if (!t) return <DisplayError>Missing type</DisplayError>;

    const Original = CodeMirrorMerge.Original;
    const Modified = CodeMirrorMerge.Modified;
    const oc = JSON.stringify(o.prevContent, null, 2);
    const nc = JSON.stringify(o.nextContent, null, 2);
    return (
        <Box title="Information" expanded={true} collapsable={false}>
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
                    <Typography variant="h4">Content (Old/New)</Typography>
                    <CententInfo prev={o.prevContent} next={o.nextContent} t={t} />
                </div>
            ) : null}
            {oc === nc ? (
                <div>
                    <Typography variant="h4">Content Unmodified</Typography>
                    <CodeMirror value={nc} theme={"dark"} extensions={[json()]} readOnly={true} />
                </div>
            ) : (
                <div>
                    <Typography variant="h4">Content (Old/New)</Typography>
                    <CodeMirrorMerge orientation="a-b" theme={"dark"}>
                        <Original
                            value={oc}
                            extensions={[
                                json(),
                                EditorView.editable.of(false),
                                EditorState.readOnly.of(true),
                            ]}
                        />
                        <Modified
                            value={nc}
                            extensions={[
                                json(),
                                EditorView.editable.of(false),
                                EditorState.readOnly.of(true),
                            ]}
                        />
                    </CodeMirrorMerge>
                </div>
            )}
            {o.prevScript === o.script ? (
                <div>
                    <Typography variant="h4">Script Unmodified</Typography>
                    <CodeMirror
                        value={o.script}
                        theme={"dark"}
                        extensions={[python()]}
                        readOnly={true}
                    />
                </div>
            ) : (
                <div>
                    <Typography variant="h4">Script (Old/New)</Typography>
                    <CodeMirrorMerge orientation="a-b" theme={"dark"}>
                        <Original
                            value={o.prevScript ?? ""}
                            extensions={[
                                python(),
                                EditorView.editable.of(false),
                                EditorState.readOnly.of(true),
                            ]}
                        />
                        <Modified
                            value={o.script}
                            extensions={[
                                python(),
                                EditorView.editable.of(false),
                                EditorState.readOnly.of(true),
                            ]}
                        />
                    </CodeMirrorMerge>
                </div>
            )}
        </Box>
    );
});

export default Details;
