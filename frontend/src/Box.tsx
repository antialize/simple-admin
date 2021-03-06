import * as React from "react";
import ExpansionPanel from "@material-ui/core/ExpansionPanel";
import ExpansionPanelDetails from "@material-ui/core/ExpansionPanelDetails";
import ExpansionPanelSummary from "@material-ui/core/ExpansionPanelSummary";
import Typography from "@material-ui/core/Typography";

function Box( {title, collapsable, expanded, children}:{title:React.ReactNode, collapsable?:boolean, expanded?:boolean, children?:React.ReactNode}) {
    return (
        <ExpansionPanel defaultExpanded={!collapsable || expanded} style={{marginBottom:"20px"}}>
            <ExpansionPanelSummary>
                <Typography variant="h5" component="h4">
                    {title}
                </Typography>
            </ExpansionPanelSummary>
            <ExpansionPanelDetails style={{display:"block"}}>
                {children}
            </ExpansionPanelDetails>
        </ExpansionPanel>
    )
}

export default Box;
