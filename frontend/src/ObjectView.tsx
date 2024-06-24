import state from "./state";
import Error from "./Error";
import { observer } from "mobx-react";
import { Button, CircularProgress, Link, MenuItem, Select } from "@mui/material";
import { DEPLOYMENT_STATUS, type IPage, PAGE_TYPE } from "./shared/state";
import UnixTime from "./UnixTime";
import { hostId, userId } from "./shared/type";
import Box from "./Box";
import { InformationList, InformationListRow } from "./InformationList";
import Type from "./Type";
import UserExtra from "./UserExtra";
import HostExtra from "./HostExtra";

const ObjectView = observer(function ObjectView({
    type,
    id,
}: {
    type: number;
    id?: number;
    version?: number;
}) {
    const deployment = state.deployment;
    if (!deployment) return <Error>Missing state.deployment</Error>;
    const o = id && state.objects.get(id);
    if (!id || !o || !o.current) return <CircularProgress />;
    const stype = state.types.get(type);
    if (!stype) return <Error>Missing type</Error>;

    const page = state.page;
    if (page === null) return <Error>Missing state.page</Error>;

    const typeName = stype.name;
    let extra = null;

    const canDeploy =
        deployment.status == DEPLOYMENT_STATUS.Done ||
        deployment.status == DEPLOYMENT_STATUS.InvilidTree ||
        deployment.status == DEPLOYMENT_STATUS.BuildingTree ||
        deployment.status == DEPLOYMENT_STATUS.ComputingChanges ||
        deployment.status == DEPLOYMENT_STATUS.ReviewChanges;
    const canCancel =
        deployment.status == DEPLOYMENT_STATUS.BuildingTree ||
        deployment.status == DEPLOYMENT_STATUS.ComputingChanges ||
        deployment.status == DEPLOYMENT_STATUS.ReviewChanges;
    const touched = o.touched;

    if (!o.history) {
        o.loadHistory();
    }
    let isLatest = true;
    const history: Array<{ version: number; time: number; author: string | null }> = [];

    for (const [k, v] of o.versions) {
        if (o.current.version && k > o.current.version) isLatest = false;
        history.push({ version: v.version ?? 0, time: v.time ?? 0, author: v.author });
    }

    if (o.history) {
        for (const item of o.history) {
            history.push(item);
            if (o.current.version && item.version > o.current.version) isLatest = false;
        }
    }
    history.sort((a, b) => b.version - a.version);

    let lastVersion = null;
    const historyItems = [];
    for (const item of history) {
        if (item.version == lastVersion) continue;
        lastVersion = item.version;
        historyItems.push(
            <MenuItem key={item.version} value={item.version}>
                {item.version} by {item.author ?? "unknown"}&nbsp;
                <UnixTime time={item.time ?? 0} />{" "}
            </MenuItem>,
        );
    }

    if (type == hostId) {
        extra = <HostExtra id={id} />;
    }
    if (type == userId) {
        extra = <UserExtra id={id} />;
    }

    const usedBy = [];
    const ub = state.objectUsedBy.get(id);
    if (ub) {
        for (const o of ub) {
            let found = false;
            for (const [t, d] of state.objectDigests.entries()) {
                const oo = d.get(o);
                if (oo) {
                    found = true;
                    const p: IPage = { type: PAGE_TYPE.Object, objectType: t, id: o };
                    usedBy.push(
                        <Link
                            style={{ marginRight: 4 }}
                            color={"textPrimary" as any}
                            onClick={(e) => {
                                page.onClick(e, p);
                            }}
                            href={page.link(p)}
                        >
                            {oo.name}
                        </Link>,
                    );
                    break;
                }
            }
            if (!found) {
                usedBy.push(<li>{o}</li>);
            }
        }
    }

    return (
        <div>
            <Box title={typeName} expanded={true} collapsable={true}>
                <div>
                    <InformationList key={id + "_history"}>
                        <InformationListRow name="Version">
                            <Select
                                variant="standard"
                                key="history"
                                value={o.current.version ?? 0}
                                onChange={(e) => {
                                    if (
                                        touched &&
                                        !confirm(
                                            "Discard current changes and load version " +
                                                (e.target.value as any) +
                                                "?",
                                        )
                                    )
                                        return;
                                    o.setCurrentVersion(e.target.value as number);
                                }}
                            >
                                {historyItems}
                            </Select>
                        </InformationListRow>
                        <InformationListRow name="Used by">
                            {usedBy.length == 0 ? "Nothing" : <ul>{usedBy}</ul>}
                        </InformationListRow>
                    </InformationList>
                </div>
                <div>
                    <Type id={id} typeId={type} />
                </div>
                <div>
                    <Button
                        variant="contained"
                        color="primary"
                        style={{ margin: 10 }}
                        onClick={() => {
                            if (
                                !isLatest &&
                                !confirm(
                                    "Overwrite latest version with a modification of a previous version?",
                                )
                            )
                                return;
                            o.save();
                        }}
                        disabled={!touched && isLatest}
                    >
                        {isLatest ? "Save" : "Overwrite newer"}
                    </Button>
                    <Button
                        variant="contained"
                        color="primary"
                        style={{ margin: 10 }}
                        onClick={() => {
                            o.deploy(canCancel, false);
                        }}
                        disabled={!canDeploy}
                    >
                        {canCancel ? "Deploy (cancel current)" : "Deploy"}
                    </Button>
                    <Button
                        variant="contained"
                        color="primary"
                        style={{ margin: 10 }}
                        onClick={() => {
                            o.deploy(canCancel, true);
                        }}
                        disabled={!canDeploy}
                    >
                        {canCancel ? "Redeploy (cancel current)" : "Redeploy"}
                    </Button>
                    <Button
                        variant="contained"
                        color="primary"
                        style={{ margin: 10 }}
                        onClick={() => {
                            o.discard();
                        }}
                        disabled={!touched}
                    >
                        Discard
                    </Button>
                    <Button
                        variant="contained"
                        color="primary"
                        style={{ margin: 10 }}
                        onClick={() => {
                            if (confirm("Are you sure you want to delete the object?")) o.delete();
                        }}
                        disabled={!canDeploy}
                    >
                        Delete
                    </Button>
                    {type == hostId ? (
                        <Button
                            variant="contained"
                            color="primary"
                            style={{ margin: 10 }}
                            onClick={() => {
                                if (confirm("Have you just reinstalled this server?"))
                                    o.resetState();
                            }}
                        >
                            Reset State
                        </Button>
                    ) : null}
                </div>
            </Box>
            <div>{extra}</div>
        </div>
    );
});

export default ObjectView;
