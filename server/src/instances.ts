import {WebClients} from './webclient'
import {HostClients} from './hostclient'
import {Deployment} from './deployment'
import {Msg} from './msg'
import {DB} from './db'
import { ModifiedFiles } from './modifiedfiles';
import { Ssh } from './ssh';

export let webClients:WebClients;
export let hostClients:HostClients ;
export let deployment:Deployment;
export let msg:Msg;
export let db:DB;
export let modifiedFiles:ModifiedFiles;
export let ssh:Ssh;
export function setWebClients(_:WebClients) {webClients = _;}
export function setHostClients(_:HostClients) {hostClients = _;}
export function setDeployment(_:Deployment) {deployment = _;}
export function setMsg(_:Msg) {msg = _;}
export function setDb(_:DB) {db = _;}
export function setModifiedFiles(_:ModifiedFiles) {modifiedFiles = _;}
export function setSsh(_:Ssh) {ssh = _;}
