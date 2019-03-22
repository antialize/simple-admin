import * as React from "react";
import Typography from "@material-ui/core/Typography";

export function InformationList(props:any) {
    return (
        <table>
            <tbody>
                {props.children}
            </tbody>
        </table>    
        );
}

export function InformationListRow(props:any) {
    return (<tr><td style={props.long?{verticalAlign: "top", paddingTop: "4px"}:{}}><Typography>{props.name}</Typography></td><td>{props.children}</td></tr>)
}