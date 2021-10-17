import * as React from "react";
import * as State from '.././shared/state';
import Item from './Item';
import state from "../state";
import { observer } from "mobx-react";
import { withStyles, Theme, StyleRules, createStyles, StyledComponentProps } from "@material-ui/core/styles";
import Error from "../Error";

const ItemsImpl = observer(function ItemImpl(p:StyledComponentProps) {
    const deployment = state.deployment;
    if (deployment === null) return <Error>Missing state.deployment</Error>;
    const classes = p.classes;
    if (!classes) return <Error>Missing classes</Error>;

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
    let rows: JSX.Element[] = [];
    
    for (let i=0; i < c; ++i)
        rows.push(<Item index={i} classes={classes}/>);

    return (
        <div className="deployment_items">
            <table className={classes.table}>
                <thead>
                    <tr>
                        <th >Host</th><th >Object</th><th >Type</th><th >Action</th><th >Enable</th><th >Details</th>
                    </tr>
                </thead>
                <tbody>
                    {rows}
                </tbody>
            </table>
        </div>);
});

const styles = (theme:Theme) : StyleRules => {
    return createStyles({
        table: {
            borderCollapse: 'collapse',
            borderWidth: 1,
            borderColor: theme.palette.background.paper,
            borderStyle: 'solid',
            width: '100%',
            '& th' :{
                color: theme.palette.text.primary,
                borderWidth: 1,
                borderColor: theme.palette.background.paper,
                borderStyle: 'solid',
            },
            "& tr" : {
                borderWidth: 1,
                borderColor: theme.palette.background.paper,
                borderStyle: 'solid',
                color: theme.palette.text.primary,
                backgroundColor: theme.palette.background.default,
            },
            "& td" : {
                borderWidth: 1,
                borderColor: theme.palette.background.paper,
                borderStyle: 'solid',
                padding: 4
            },
            '& tr:nth-child(even)': {
                backgroundColor: theme.palette.background.paper,
            }
        },
        active: {
            "& td" : {backgroundColor: theme.palette.type == "dark" ? "#990" : "yellow"}
        },
        failure: {
            "& td" : {backgroundColor: theme.palette.type == "dark" ? "#600" : "#F77"}
        },
        success: {
            "& td" : {backgroundColor: theme.palette.type == "dark" ? "#060" : "#7F7"}
        },
        normal: {
        },
        disabled: {
            "& td" : {color: theme.palette.text.disabled}
        }

        });
}

const Items = withStyles(styles)(ItemsImpl);
export default Items;
