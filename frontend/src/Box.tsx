import { Accordion, AccordionDetails, AccordionSummary, Typography } from "@mui/material";
import type * as React from "react";

function Box({
    title,
    collapsable,
    expanded,
    children,
    onChange,
}: {
    title: React.ReactNode;
    collapsable?: boolean;
    expanded?: boolean;
    children?: React.ReactNode;
    onChange?: (event: React.SyntheticEvent, expanded: boolean) => void;
}): React.JSX.Element {
    return (
        <Accordion
            defaultExpanded={!collapsable || expanded}
            style={{ marginBottom: "20px" }}
            onChange={onChange}
        >
            <AccordionSummary>
                <Typography variant="h5" component="h4">
                    {title}
                </Typography>
            </AccordionSummary>
            <AccordionDetails style={{ display: "block" }}>{children}</AccordionDetails>
        </Accordion>
    );
}

export default Box;
