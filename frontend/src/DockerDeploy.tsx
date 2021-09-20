import * as React from 'react';
import { observable, action, makeObservable } from 'mobx';
import { PAGE_TYPE } from '../../shared/state';
import state from './state';
import nullCheck from '../../shared/nullCheck';
import { observer } from 'mobx-react';
import Box from './Box';
import { hostId } from '../../shared/type';
import Select from './Select'
import { InformationList, InformationListRow } from './InformationList';

export class DockerDeployState {
    constructor() {
        makeObservable(this)
    }
    
    @observable
    deploying: boolean = false;

    @observable
    host: number | null = null;

    @observable
    container: string | null = null;

    @observable
    config: string | null = null;

    @observable
    image: string | null = null;

    @action
    deploy(props: {host?: number, container?: string, config?:string, image?:string, event?: React.MouseEvent}) {
        if (props.event)
            nullCheck(state.page).onClick(props.event, {type: PAGE_TYPE.DockerDeploy})
    }

    @action
    setHost(host:number | null) {
        if (host == null) {
            this.host == null;
            this.container == null;
            return;
        }
        this.host = +host;
        this.container = null;
    }
};

export const DockerDeploy = observer(function DockerDeploy() {
    const deploy = state.dockerDeploy;
    const containers = state.dockerContainers;
    if (!deploy || !containers) return null;
    const hostDigests = state.objectDigests.get(hostId);
    if (!hostDigests) return null;

    let selectedHost = null;
    let hostItems = [];
    for (const v of hostDigests.values()) {
        if (v.id == deploy.host)
            selectedHost = {label:v.name, value:v.id};
        hostItems.push({label:v.name, value:v.id});
    }

    let hosts = containers.hosts;
    if (hosts.state != "data") return null;

    let containerItems = [];
    if (deploy.host !== null) {
        let containers = hosts.data.get(deploy.host);
        if (containers) {
            for (const container of containers)
                containerItems.push({label: container.name, value: container.name});
        }
    }
    //             <InformationListRow name="Image"><Select type="single" placeholder="Image" value={deploy.image?{label:deploy.image, value:deploy.image}:null} options={containerItems} onChange={(i) => deploy.container = i?i.value:null} create={true} /></InformationListRow>
    return <Box title={`DockerDeployment`}>
        <InformationList>
            <InformationListRow name="Host"><Select type="single" placeholder="Host" value={selectedHost} options={hostItems} onChange={(i) => deploy.setHost(i ? i.value: null)} create={false} /></InformationListRow>
            <InformationListRow name="Container"><Select type="single" placeholder="Container" value={deploy.container?{label:deploy.container, value:deploy.container}:null} options={containerItems} onChange={(i) => deploy.container = i?i.value:null} create={true} /></InformationListRow>
        </InformationList>
        </Box>;
});

export default DockerDeploy;
