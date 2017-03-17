import * as React from "react";
import {InformationList, InformationListRow} from './information_list'
import TextField from 'material-ui/TextField';
import Toggle from 'material-ui/Toggle';
import RaisedButton from 'material-ui/RaisedButton';
import Editor from './editor'

export function File({id:id, version:version}:{id?:number, version?:number}) {
    return (
        <div>
            <InformationList>
                <InformationListRow name="Name"><TextField /></InformationListRow>
                <InformationListRow name="Path"><TextField /></InformationListRow>
            </InformationList>
            <Editor />
        </div>
    )
}