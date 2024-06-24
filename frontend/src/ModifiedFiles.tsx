import { Button, CircularProgress, Switch, Typography, styled } from "@mui/material";
import * as Diff from "diff";
import { observer } from "mobx-react";
import { useState } from "react";
import Box from "./Box";
import Editor from "./Editor";
import DisplayError from "./Error";
import UnixTime from "./UnixTime";
import extractRemote from "./extractRemote";
import { type IModifiedFilePage, PAGE_TYPE } from "./shared/state";
import { hostId } from "./shared/type";
import state from "./state";

const Table = styled("table")({});
const Span = styled("span")({});

export const ModifiedFileRevolver = observer(function ModifiedFileRevolver(props: { id: number }) {
    const [content, setContent] = useState<string | null>(null);
    const [patch2, setPatch2] = useState(true);
    const [lang, setLang] = useState("");

    const s = state.modifiedFiles;
    if (s === null) return <DisplayError>Missing state.modifiedFiles</DisplayError>;
    const r = extractRemote(s.modifiedFiles);
    if (r.state !== "good") return r.error;
    const o = r.data.get(props.id);
    if (!o) return <DisplayError>Not found</DisplayError>;
    const current = o.current ?? "";

    const contentV = content ?? current;
    const patch = Diff.createPatch(o.path, o.deployed, o.actual ?? "", "", "");
    const patched = Diff.applyPatch(contentV, patch) || null;
    return (
        <div className="modified_container">
            <div style={{ gridArea: "head" }}>
                <Typography component="span" style={{ display: "inline" }}>
                    Show diff:{" "}
                </Typography>
                <Switch
                    checked={patch2}
                    onChange={(e) => {
                        setPatch2(e.target.checked);
                    }}
                />
                &nbsp;&nbsp;
                <Button
                    variant="contained"
                    disabled={current === contentV}
                    onClick={() => {
                        setContent(current);
                    }}
                >
                    Reset
                </Button>
                &nbsp;&nbsp;
                <Button
                    disabled={!patched}
                    variant="contained"
                    onClick={() => {
                        setContent(patched ?? "");
                    }}
                >
                    Apply patch
                </Button>
                &nbsp;&nbsp;
                <Button
                    variant="contained"
                    color="secondary"
                    onClick={() => {
                        s.revert(props.id);
                    }}
                >
                    Revert changes on host
                </Button>
                &nbsp;&nbsp;
                <Button
                    variant="contained"
                    color="primary"
                    disabled={current === content}
                    onClick={() => {
                        s.save(props.id, contentV);
                    }}
                >
                    {s.saveTime ? `Wait ${s.saveTime}` : "Save changes"}
                </Button>
            </div>
            {patch2 ? (
                <div style={{ gridArea: "lt / lb" }}>
                    {" "}
                    <Editor
                        lang={"diff"}
                        fixedLang={true}
                        title="Diff"
                        data={patch}
                        readOnly={true}
                    />{" "}
                </div>
            ) : (
                <>
                    <div className="modified_half" style={{ gridArea: "lt" }}>
                        <Editor
                            lang={lang}
                            setLang={(lang) => {
                                setLang(lang);
                            }}
                            fixedLang={false}
                            title="Deployed"
                            data={o.deployed}
                            readOnly={true}
                        />
                    </div>
                    <div className="modified_half" style={{ gridArea: "lb" }}>
                        <Editor
                            lang={lang}
                            setLang={(lang) => {
                                setLang(lang);
                            }}
                            fixedLang={false}
                            title="Current"
                            data={o.actual || ""}
                            readOnly={true}
                        />
                    </div>
                </>
            )}
            <div style={{ gridArea: "right" }}>
                <Editor
                    lang={lang}
                    setLang={(lang) => {
                        setLang(lang);
                    }}
                    fixedLang={false}
                    title="Deployed"
                    data={contentV}
                    setData={(d) => {
                        setContent(d);
                    }}
                />
            </div>
        </div>
    );
});

export const ModifiedFiles = observer(function ModifiedFiles() {
    const s = state.modifiedFiles;
    if (!s) return <DisplayError>Missing state.modifiedFiles</DisplayError>;
    const r = extractRemote(s.modifiedFiles);
    if (r.state !== "good") return r.error;
    const page = state.page;
    if (!page) return <DisplayError>Missing state.page</DisplayError>;
    const rows = [];
    for (const [id, f] of r.data) {
        const digests = state.objectDigests.get(f.type);
        const a: IModifiedFilePage = { type: PAGE_TYPE.ModifiedFile, id };
        const hosts = state.objectDigests.get(hostId);
        const host = hosts?.get(f.host);
        const type = state.types.get(f.type);
        const digest = digests?.get(f.object);
        rows.push(
            <tr key={id}>
                <td>{host?.name}</td>
                <td>{type ? type.name : f.type}</td>
                <td>{f.path}</td>
                <td>{digest ? digest.name : f.object}</td>
                <td>
                    <Button
                        onClick={(e) => {
                            page.onClick(e, a);
                        }}
                        href={page.link(a)}
                    >
                        Details
                    </Button>
                </td>
            </tr>,
        );
    }

    const sx = {
        borderCollapse: "collapse",
        borderWidth: "1px",
        borderColor: "background.default",
        borderStyle: "solid",
        width: "100%",
        "& th": {
            color: "text.primary",
            borderWidth: "1px",
            borderColor: "background.default",
            borderStyle: "solid",
        },
        "& tr": {
            borderWidth: "1px",
            borderColor: "background.default",
            borderStyle: "solid",
            color: "text.primary",
            backgroundColor: "background.paper",
        },
        "& td": {
            borderWidth: "1px",
            borderColor: "background.default",
            borderStyle: "solid",
            padding: "4px",
        },
        "& tr:nth-child(even)": {
            backgroundColor: "background.default",
        },
    };

    return (
        <Box title="Modified Files" expanded={true} collapsable={false}>
            {s.scanning ? (
                <div>
                    <CircularProgress />
                    <Span
                        className={"classes.scan"}
                        sx={{
                            marginLeft: "20px",
                            color: "text.primary",
                            fontSize: "120%",
                        }}
                    >
                        Scanning
                    </Span>
                </div>
            ) : (
                <div>
                    <Button
                        variant="contained"
                        onClick={() => {
                            s.scan();
                        }}
                    >
                        scan
                    </Button>
                    <span className={"classes.scan"}>
                        Last scan: {s.lastScanTime ? <UnixTime time={s.lastScanTime} /> : "Never"}
                    </span>
                </div>
            )}
            <Table sx={sx}>
                <thead>
                    <tr>
                        <th>Host</th>
                        <th>Type</th>
                        <th>Path</th>
                        <th>Name</th>
                        <th>Actions</th>
                    </tr>
                </thead>
                <tbody>{rows}</tbody>
            </Table>
        </Box>
    );
});
