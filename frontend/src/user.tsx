import * as React from "react";
import {InformationList, InformationListRow} from './information_list'
import TextField from 'material-ui/TextField';
import Toggle from 'material-ui/Toggle';
import {ObjectSelector} from './object_selector'

export function User({id:id, version:version}:{id?:number, version?:number}) {
    return (
        <div>
            <InformationList>
                <InformationListRow name="Name"><TextField /></InformationListRow>
                <InformationListRow name="First Name"><TextField /></InformationListRow>
                <InformationListRow name="Last Name"><TextField /></InformationListRow>
                <InformationListRow name="Admin"><Toggle label=" "/></InformationListRow>
                <InformationListRow name="System"><Toggle label=" "/></InformationListRow>
                <InformationListRow name="Password"><TextField type="password"/></InformationListRow>
                <InformationListRow name="Password Again"><TextField type="password"/></InformationListRow>
            </InformationList>
            <ObjectSelector name="Groups"/>
            <ObjectSelector name="Files"/>
            <ObjectSelector name="In"/>
        </div>)
}