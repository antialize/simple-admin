import * as React from "react";
import { IStatus, IService } from '../../shared/status';
import { IMainState } from './reducers';
import { ISetServiceListFilter, IPokeService, ISetServiceLogVisibilty, SERVICE_POKE, ACTION } from '../../shared/actions'
import { connect, Dispatch } from 'react-redux';
import TextField from 'material-ui/TextField';
import RaisedButton from 'material-ui/RaisedButton';
import { Log } from './log'

interface ExternProps {
    id: number;
}

interface StateProps {
    id: number;
    name: string;
    services: IService[];
    filter: string;
    logVisibility: { [service: string]: boolean };
}

interface DispatchProps {
    setFilter(filter: string): void;
    pokeService(name: string, poke: SERVICE_POKE): void;
    setLogVisibility(name: string, visibility: boolean): void;
}

function mapStateToProps(state: IMainState, props: ExternProps): StateProps {
    const filter = state.serviceListFilter[props.id];
    const services = state.status[props.id].services;
    const lst = Object.keys(services).filter((x) => (!filter || x.indexOf(filter) != -1));
    lst.sort();
    return { id: props.id, name: name, services: lst.map((name: string) => services[name]), filter: filter, logVisibility: state.serviceLogVisibility[props.id] || {} }
}

function mapDispatchToProps(dispatch: Dispatch<IMainState>, o: ExternProps): DispatchProps {
    return {
        setFilter: (filter: string) => {
            const p: ISetServiceListFilter = {
                type: ACTION.SetServiceListFilter,
                filter: filter,
                host: o.id
            };
            dispatch(p);
        },
        pokeService: (name: string, poke: SERVICE_POKE) => {
            const p: IPokeService = {
                type: ACTION.PokeService,
                host: o.id,
                service: name,
                poke: poke
            };
            dispatch(p);
        },
        setLogVisibility: (name: string, visible: boolean) => {
            const p: ISetServiceLogVisibilty = {
                type: ACTION.SetServiceLogVisibility,
                host: o.id,
                service: name,
                visibility: visible
            };
            dispatch(p);
        }
    }
}

function Service({ service, poke, logVisible, setLogVisibility }: { service: IService, poke: (name: string, poke: SERVICE_POKE) => void, logVisible: boolean, setLogVisibility: (name: string, visibility: boolean) => void }) {
    let actions = [];
    if (service.activeState == "active") {
        actions.push(<RaisedButton key="stop" label="Stop" secondary={true} onClick={() => { if (confirm("Stop service " + service.name + "?")) poke(service.name, SERVICE_POKE.Stop); }} style={{ marginRight: "5px" }} />);
        actions.push(<RaisedButton key="kill" label="Kill" secondary={true} onClick={() => { if (confirm("Kill service " + service.name + "?")) poke(service.name, SERVICE_POKE.Kill); }} style={{ marginRight: "5px" }} />);
        actions.push(<RaisedButton key="restart" label="Restart" secondary={true} onClick={() => { if (confirm("Restart service " + service.name + "?")) poke(service.name, SERVICE_POKE.Stop); }} style={{ marginRight: "5px" }} />);
        actions.push(<RaisedButton key="reload" label="Reload" primary={true} onClick={() => { poke(service.name, SERVICE_POKE.Reload); }} style={{ marginRight: "5px" }} />);
    } else {
        actions.push(<RaisedButton key="start" label="Start" primary={true} onClick={() => { poke(service.name, SERVICE_POKE.Start); }} style={{ marginRight: "5px" }} />);
    }
    if (logVisible)
        actions.push(<RaisedButton key="log" label="Hide log" primary={true} onClick={() => setLogVisibility(service.name, false)} style={{ marginRight: "5px" }} />);
    else
        actions.push(<RaisedButton key="log" label="Show log" primary={true} onClick={() => setLogVisibility(service.name, true)} style={{ marginRight: "5px" }} />);
    return (
        <tr key={service.name}>
            <td>{service.name}</td>
            <td>{service.activeState}</td>
            <td>{service.StatusText}</td>
            <td>{actions}</td>
        </tr>
    )
}

function ServiceLog({ host, service }: { host: number, service: string }) {
    return (<tr key={"hat_" + service}>
        <td colSpan={4}>
            <Log host={host} type="journal" unit={service} />
        </td>
    </tr>)
}


function ServicesImpl(p: StateProps & DispatchProps) {
    let rows: JSX.Element[] = [];
    for (const service of p.services) {
        const lv = p.logVisibility[service.name];
        rows.push(<Service key={"service_" + service.name} service={service} poke={p.pokeService} logVisible={lv} setLogVisibility={p.setLogVisibility} />);
        if (lv)
            rows.push(<ServiceLog key={"log_" + service.name} host={p.id} service={service.name} />);
    }
    return (
        <div>
            <TextField floatingLabelText="Filter" onChange={(a, v) => { p.setFilter(v); }} value={p.filter} />
            <table className="services_table">
                <thead>
                    <tr>
                        <th>Name</th><th>Status</th><th>Message</th><th>Actions</th>
                    </tr>
                </thead>
                <tbody>
                    {rows}
                </tbody>
            </table>
        </div>)
}

export let Services = connect(mapStateToProps, mapDispatchToProps)(ServicesImpl);
