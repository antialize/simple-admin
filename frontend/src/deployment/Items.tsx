import { Button, Checkbox, styled, Tooltip, useTheme } from "@mui/material";
import * as Diff from "diff";
import { observer } from "mobx-react";
import DisplayError from "../Error";
import {
    DEPLOYMENT_OBJECT_ACTION,
    DEPLOYMENT_OBJECT_STATUS,
    DEPLOYMENT_STATUS,
    PAGE_TYPE,
} from "../shared_types";
import state from "../state";

const Table = styled("table")({});
interface IProps {
    index: number;
}

const ItemDetailsTooltip = observer(function ItemDetailsTooltip(p: IProps) {
    const deployment = state.deployment;
    if (deployment === null) return <DisplayError>Missing state.deployment</DisplayError>;
    const page = state.page;
    if (page === null) return <DisplayError>Missing state.page</DisplayError>;
    const o = deployment.objects[p.index];

    const pc = JSON.stringify(o.prevContent, null, 2);
    const nc = JSON.stringify(o.nextContent, null, 2);
    let patch = "";
    if (nc !== pc) {
        patch += Diff.createPatch("content", pc, nc, "", "");
    }
    if (o.prevScript !== o.script) {
        patch += Diff.createPatch("script", o.prevScript ?? "", o.script, "", "");
        return <pre>{patch}</pre>;
    }
    return <pre>{patch}</pre>;
});

const Item = observer(function Item(p: IProps) {
    const theme = useTheme();

    const deployment = state.deployment;
    if (deployment === null) return <DisplayError>Missing state.deployment</DisplayError>;
    const page = state.page;
    if (page === null) return <DisplayError>Missing state.page</DisplayError>;
    const o = deployment.objects[p.index];

    let s = {};
    switch (o.status) {
        case DEPLOYMENT_OBJECT_STATUS.Deplying:
            s = { backgroundColor: theme.palette.mode === "dark" ? "#990" : "yellow" };
            break;
        case DEPLOYMENT_OBJECT_STATUS.Failure:
            s = { backgroundColor: theme.palette.mode === "dark" ? "#600" : "#F77" };
            break;
        case DEPLOYMENT_OBJECT_STATUS.Success:
            s = { backgroundColor: theme.palette.mode === "dark" ? "#060" : "#7F7" };
            break;
        case DEPLOYMENT_OBJECT_STATUS.Normal:
            s = o.enabled ? {} : { color: theme.palette.text.disabled };
            break;
    }

    let act: string | null = null;
    switch (o.action) {
        case DEPLOYMENT_OBJECT_ACTION.Add:
            act = "Add";
            break;
        case DEPLOYMENT_OBJECT_ACTION.Modify:
            act = "Modify";
            break;
        case DEPLOYMENT_OBJECT_ACTION.Remove:
            act = "Remove";
            break;
        case DEPLOYMENT_OBJECT_ACTION.Trigger:
            act = "Trigger";
            break;
    }
    const canSelect = deployment.status === DEPLOYMENT_STATUS.ReviewChanges;
    return (
        <tr style={s} key={o.index}>
            <td>{o.hostName}</td>
            <td>{o.title}</td>
            <td>{o.typeName}</td>
            <td>{act}</td>
            <td>
                <Checkbox
                    checked={o.enabled}
                    disabled={!canSelect}
                    onChange={(e) => {
                        deployment.toggle(o.index, e.target.checked);
                    }}
                />
            </td>
            <td>
                <Tooltip title={<ItemDetailsTooltip index={o.index} />}>
                    <Button
                        onClick={(e) => {
                            page.onClick(e, {
                                type: PAGE_TYPE.DeploymentDetails,
                                index: o.index,
                            });
                        }}
                        href={page.link({ type: PAGE_TYPE.DeploymentDetails, index: o.index })}
                    >
                        Details
                    </Button>
                </Tooltip>
            </td>
        </tr>
    );
});

const Items = observer(function ItemImpl() {
    const deployment = state.deployment;
    if (deployment === null) return <DisplayError>Missing state.deployment</DisplayError>;

    switch (deployment.status) {
        case DEPLOYMENT_STATUS.BuildingTree:
        case DEPLOYMENT_STATUS.InvilidTree:
        case DEPLOYMENT_STATUS.ComputingChanges:
            return null;
        case DEPLOYMENT_STATUS.Deploying:
        case DEPLOYMENT_STATUS.Done:
        case DEPLOYMENT_STATUS.ReviewChanges:
            break;
    }
    const c = deployment.objects.length;
    const rows: React.ReactElement[] = [];

    for (let i = 0; i < c; ++i) rows.push(<Item index={i} />);

    return (
        <div className="deployment_items">
            <Table
                sx={{
                    borderCollapse: "collapse",
                    borderWidth: 1,
                    borderColor: "background.paper",
                    borderStyle: "solid",
                    width: "100%",
                    "& th": {
                        color: "text.primary",
                        borderWidth: 1,
                        borderColor: "background.paper",
                        borderStyle: "solid",
                    },
                    "& tr": {
                        borderWidth: 1,
                        borderColor: "background.paper",
                        borderStyle: "solid",
                        color: "text.primary",
                        backgroundColor: "background.default",
                    },
                    "& td": {
                        borderWidth: 1,
                        borderColor: "background.paper",
                        borderStyle: "solid",
                        padding: "4px",
                    },
                    "& tr:nth-child(even)": {
                        backgroundColor: "background.paper",
                    },
                }}
            >
                <thead>
                    <tr>
                        <th>Host</th>
                        <th>Object</th>
                        <th>Type</th>
                        <th>Action</th>
                        <th>Enable</th>
                        <th>Details</th>
                    </tr>
                </thead>
                <tbody>{rows}</tbody>
            </Table>
        </div>
    );
});

export default Items;
