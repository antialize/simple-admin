import * as React from "react";

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
    return (<tr><td style={props.long?{verticalAlign: "top", paddingTop: "4px"}:{}}>{props.name}</td><td>{props.children}</td></tr>)
}