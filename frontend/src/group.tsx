import * as React from "react";
import {InformationList, InformationListRow} from './information_list'
import TextField from 'material-ui/TextField';
import Toggle from 'material-ui/Toggle';
import RaisedButton from 'material-ui/RaisedButton';

export function Group({id:id, version:version}:{id?:number, version?:number}) {
    return (
        <div>
            <InformationList>
                <InformationListRow name="Name"><TextField /></InformationListRow>
                <InformationListRow name="System"><Toggle label=" "/></InformationListRow>
            </InformationList>
        </div>
    )    
}