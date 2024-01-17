import {Accordion, AccordionDetails, AccordionSummary, Typography} from "@mui/material";
import * as React from "react";

function Box({
    title,
    collapsable,
    expanded,
    children,
}: {
    title: React.ReactNode;
    collapsable?: boolean;
    expanded?: boolean;
    children?: React.ReactNode;
}): JSX.Element {
    return (
        <Accordion defaultExpanded={!collapsable || expanded} style={{marginBottom: "20px"}}>
            <AccordionSummary>
                <Typography variant="h5" component="h4">
                    {title}
                </Typography>
            </AccordionSummary>
            <AccordionDetails style={{display: "block"}}>{children}</AccordionDetails>
        </Accordion>
    );
}

export default Box;
