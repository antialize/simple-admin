import * as State from ".././shared/state";
import state from "../state";
import {observer} from "mobx-react";
import Error from "../Error";
import {Button, Checkbox, styled, useTheme} from "@mui/material";

const Table = styled("table")({});
interface IProps {
    index: number;
}

const Item = observer(function Item(p: IProps) {
    const theme = useTheme();

    const deployment = state.deployment;
    if (deployment === null) return <Error>Missing state.deployment</Error>;
    const page = state.page;
    if (page === null) return <Error>Missing state.page</Error>;
    const o = deployment.objects[p.index];

    let s = {};
    switch (o.status) {
        case State.DEPLOYMENT_OBJECT_STATUS.Deplying:
            s = {backgroundColor: theme.palette.mode == "dark" ? "#990" : "yellow"};
            break;
        case State.DEPLOYMENT_OBJECT_STATUS.Failure:
            s = {backgroundColor: theme.palette.mode == "dark" ? "#600" : "#F77"};
            break;
        case State.DEPLOYMENT_OBJECT_STATUS.Success:
            s = {backgroundColor: theme.palette.mode == "dark" ? "#060" : "#7F7"};
            break;
        case State.DEPLOYMENT_OBJECT_STATUS.Normal:
            s = o.enabled ? {} : {color: theme.palette.text.disabled};
            break;
    }

    let act: string | null = null;
    switch (o.action) {
        case State.DEPLOYMENT_OBJECT_ACTION.Add:
            act = "Add";
            break;
        case State.DEPLOYMENT_OBJECT_ACTION.Modify:
            act = "Modify";
            break;
        case State.DEPLOYMENT_OBJECT_ACTION.Remove:
            act = "Remove";
            break;
        case State.DEPLOYMENT_OBJECT_ACTION.Trigger:
            act = "Trigger";
            break;
    }
    const canSelect = deployment.status == State.DEPLOYMENT_STATUS.ReviewChanges;
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
                    onChange={e => {
                        deployment.toggle(o.index, e.target.checked);
                    }}
                />
            </td>
            <td>
                <Button
                    onClick={e => {
                        page.onClick(e, {type: State.PAGE_TYPE.DeploymentDetails, index: o.index});
                    }}
                    href={page.link({type: State.PAGE_TYPE.DeploymentDetails, index: o.index})}>
                    Details
                </Button>
            </td>
        </tr>
    );
});

const Items = observer(function ItemImpl() {
    const deployment = state.deployment;
    if (deployment === null) return <Error>Missing state.deployment</Error>;

    switch (deployment.status) {
        case State.DEPLOYMENT_STATUS.BuildingTree:
        case State.DEPLOYMENT_STATUS.InvilidTree:
        case State.DEPLOYMENT_STATUS.ComputingChanges:
            return null;
        case State.DEPLOYMENT_STATUS.Deploying:
        case State.DEPLOYMENT_STATUS.Done:
        case State.DEPLOYMENT_STATUS.ReviewChanges:
            break;
    }
    const c = deployment.objects.length;
    const rows: JSX.Element[] = [];

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
                }}>
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
