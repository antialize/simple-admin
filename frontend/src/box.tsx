import * as React from "react";
import {Card, CardActions, CardHeader, CardMedia, CardTitle, CardText} from 'material-ui/Card';

export function Box( {title, collapsable, expanded, children}:{title:React.ReactNode, collapsable?:boolean, expanded?:boolean, children?:JSX.Element|JSX.Element[]}) {
    return (
        <Card initiallyExpanded={!collapsable || expanded} style={{marginBottom:"20px"}}>
            <CardHeader style={{backgroundColor:"lightgray"}} titleStyle={{fontWeight:"bold", fontSize:"130%"}} title={title} actAsExpander={collapsable} showExpandableButton={collapsable}/>                         
            <CardText expandable={collapsable}>
                {children}
            </CardText>
        </Card>
    )
}
