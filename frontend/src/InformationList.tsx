import * as React from "react";
import Typography from "@material-ui/core/Typography";

export function InformationList(props: {children?: React.ReactNode}) {
    return (
        <table>
            <tbody>
                {props.children}
            </tbody>
        </table>    
        );
}

export function InformationListRow(props: {name:string, long?:boolean, children?: React.ReactNode } ) {
    return (<tr><td style={props.long?{verticalAlign: "top", paddingTop: "4px"}:{}}><Typography>{props.name}</Typography></td><td>{props.children}</td></tr>)
}