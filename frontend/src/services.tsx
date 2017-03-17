import * as React from "react";
import {IStatus, IService} from '../../shared/status';
import {IMainState} from './reducers';
import {ISetServiceListFilter, IPokeService, SERVICE_POKE, ACTION} from '../../shared/actions'
import { connect, Dispatch } from 'react-redux';
import TextField from 'material-ui/TextField';
import RaisedButton from 'material-ui/RaisedButton';

interface ExternProps {
    id: number;
}

interface StateProps {
    id: number;
    name: string;
    services: IService[];
    filter: string;
}

interface DispatchProps {
    setFilter(filter: string): void;
    pokeService(name:string, poke:SERVICE_POKE): void;
}

function mapStateToProps(state:IMainState, props:ExternProps): StateProps {
    let name = null;
    for (var p of state.objectNamesAndIds['host']) {
        if (p.id === props.id)
            name = p.name;
    }
    const filter = state.serviceListFilter[props.id];
    const lst = state.status[name].services.filter((x)=>(!filter|| x.name.indexOf(filter) != -1));
    lst.sort((a,b)=>(a.name < b.name ?-1: 1));
    return {id: props.id, name: name, services: lst, filter: filter}
}

function mapDispatchToProps(dispatch:Dispatch<IMainState>, o:ExternProps): DispatchProps {
    return {
        setFilter: (filter:string) => {
            const p:ISetServiceListFilter = {
                type: ACTION.SetServiceListFilter,
                filter: filter,
                host: o.id
            };
            dispatch(p);
        },
        pokeService: (name:string, poke:SERVICE_POKE) => {
            const p:IPokeService = {
                type: ACTION.PokeService,
                host: o.id,
                service: name,
                poke: poke
            };
            dispatch(p);
        }
    }
}

function Service({service, poke}: {service:IService, poke: (name:string, poke:SERVICE_POKE)=>void}) {
    let actions = [];
    if (service.activeState == "active") {
        actions.push(<RaisedButton key="stop" label="Stop" secondary={true} onClick={()=>{if(confirm("Stop service "+service.name+"?")) poke(service.name, SERVICE_POKE.Stop);}} style={{marginRight:"5px"}}/>);
        actions.push(<RaisedButton key="restart" label="Restart" secondary={true} onClick={()=>{if(confirm("Restart service "+service.name+"?")) poke(service.name, SERVICE_POKE.Stop);}} style={{marginRight:"5px"}}/>);
        actions.push(<RaisedButton key="reload" label="Reload" primary={true} onClick={()=>{if(confirm("Reload service "+service.name+"?")) poke(service.name, SERVICE_POKE.Stop);}} style={{marginRight:"5px"}}/>);
    } else {
        actions.push(<RaisedButton key="start" label="Start" primary={true} onClick={()=>{if(confirm("Start service "+service.name+"?")) poke(service.name, SERVICE_POKE.Stop);}}style={{marginRight:"5px"}}/>);
    }
    return (
        <tr key={service.name}>
            <td>{service.name}</td>
            <td>{service.activeState}</td>
            <td>{service.StatusText}</td>
            <td>{actions}</td>
        </tr>
    )
}


function ServicesImpl(p:StateProps & DispatchProps) {
        return (
        <div>
            <TextField floatingLabelText="Filter" onChange={(a, v)=>{p.setFilter(v);}} value={p.filter}/>
            <table style={{width:"100%"}}>
                <thead>
                    <tr>
                        <th>Name</th><th>Status</th><th>Message</th><th>Actions</th>
                    </tr>
                </thead>
                <tbody>
                    {p.services.map((service)=> <Service key={service.name} service={service} poke={p.pokeService} />)}
                </tbody>
            </table>
        </div>)
}

export let Services = connect(mapStateToProps, mapDispatchToProps)(ServicesImpl);
