export enum PAGE_TYPE {
    Dashbord = 0,
    Deployment = 1,
    DeploymentDetails = 2,
    DockerContainerDetails = 3,
    DockerContainerHistory = 4,
    DockerServices = 5,
    DockerImageHistory = 6,
    DockerImages = 7,
    ModifiedFile = 8,
    ModifiedFiles = 9,
    Object = 10,
    ObjectList = 11,
    Search = 12,
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
}

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
    type: PAGE_TYPE.DockerServices;
}

export interface IDockerImageHistory {
    type: PAGE_TYPE.DockerImageHistory;
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
    | IModifiedFilePage
    | IModifiedFilesPage
    | IObjectListPage
    | IObjectPage
    | ISearchPage;

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

export enum DEPLOYMENT_STATUS {
    Done = 0,
    BuildingTree = 1,
    InvilidTree = 2,
    ComputingChanges = 3,
    ReviewChanges = 4,
    Deploying = 5,
}

export enum DEPLOYMENT_OBJECT_STATUS {
    Normal = 0,
    Deplying = 1,
    Success = 2,
    Failure = 3,
}
export enum DEPLOYMENT_OBJECT_ACTION {
    Add = 0,
    Modify = 1,
    Remove = 2,
    Trigger = 3,
}

export interface IDeploymentTrigger {
    typeId: number;
    script: string;
    content: Record<string, any>;
    title: string;
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
    nextContent: Record<string, any> | null;
    prevContent: Record<string, any> | null;
    id: number | null;
    typeId: number | null;
    typeName: string;
    triggers: IDeploymentTrigger[];
    deploymentOrder: number;
}
