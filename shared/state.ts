import {IType} from './type'

export enum PAGE_TYPE {
    Dashbord,
    Deployment,
    DeploymentDetails,
    DockerContainerDetails,
    DockerContainerHistory,
    DockerContainers,
    DockerDeploy,
    DockerImageHistory,
    DockerImages,
    ModifiedFile,
    ModifiedFiles,
    Object,
    ObjectList,
    Search
}

export interface IObjectDigest {
    name: string;
    comment: string;
    id: number;
    type: number;
    category: string;
}
export interface IObjectListPage {
    type: PAGE_TYPE.ObjectList;
    objectType: number;
}

export interface IObjectPage {
    type: PAGE_TYPE.Object;
    objectType: number;
    id?: number;
    version?: number;
};

export interface IDashbordPage {
    type: PAGE_TYPE.Dashbord;
}

export interface IDeploymentPage {
    type: PAGE_TYPE.Deployment;
}

export interface ISearchPage {
    type: PAGE_TYPE.Search;
}

export interface IDeploymentDetailsPage {
    type: PAGE_TYPE.DeploymentDetails;
    index: number;
}

export interface IDockerImagesPage {
    type: PAGE_TYPE.DockerImages;
}

export interface IDockerContainersPage {
    type: PAGE_TYPE.DockerContainers;
}

export interface IDockerImageHistory {
    type: PAGE_TYPE.DockerImageHistory
    project: string;
    tag: string;
}

export interface IDockerContainerDetails {
    type: PAGE_TYPE.DockerContainerDetails;
    host: number;
    container: string;
    id: number;
}

export interface IDockerContainerHistory {
    type: PAGE_TYPE.DockerContainerHistory;
    host: number;
    container: string;
}

export interface IDockerDeploy {
    type: PAGE_TYPE.DockerDeploy;
}

export interface IModifiedFilesPage {
    type: PAGE_TYPE.ModifiedFiles;
}

export interface IModifiedFilePage {
    type: PAGE_TYPE.ModifiedFile;
    id: number;
}

export type IPage =
    | IDashbordPage
    | IDeploymentDetailsPage
    | IDeploymentPage
    | IDockerContainerDetails
    | IDockerContainerHistory
    | IDockerContainersPage
    | IDockerImageHistory
    | IDockerImagesPage
    | IDockerDeploy
    | IModifiedFilePage
    | IModifiedFilesPage
    | IObjectListPage
    | IObjectPage
    | ISearchPage
    ;

export interface IObject2<T> {
    id: number;
    type: number;
    name: string;
    category: string;
    content: T;
    version: number | null;
    comment: string;
    author: string | null;
    time: number | null;
}

export enum DEPLOYMENT_STATUS { Done, BuildingTree, InvilidTree, ComputingChanges, ReviewChanges, Deploying }

export enum DEPLOYMENT_OBJECT_STATUS { Normal, Deplying, Success, Failure }
export enum DEPLOYMENT_OBJECT_ACTION { Add, Modify, Remove, Trigger, Monitor }


export interface IDeploymentTrigger {
    typeId: number,
    script: string,
    content: {[key:string]:any},
    title: string,
}

export interface IDeploymentObject {
    index: number;
    host: number;
    hostName: string;
    title: string;
    name: string;
    enabled: boolean;
    status: DEPLOYMENT_OBJECT_STATUS;
    action: DEPLOYMENT_OBJECT_ACTION;

    script: string;
    prevScript: string | null;
    nextContent: {[key:string]: any} | null;
    prevContent: {[key:string]: any} | null;
    id: number | null;
    typeId: number | null;
    typeName: string;
    triggers: IDeploymentTrigger[];
    deploymentOrder: number;
}

