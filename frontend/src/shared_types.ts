// Generated by export_ts, DO NOT EDIT

export type JsonValue =
    | number
    | string
    | boolean
    | Array<JsonValue>
    | { [key in string]?: JsonValue }
    | null;

export type JsonMap = { [key in string]?: JsonValue };

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

export type IObjectListPage = { objectType: number };

export type IObjectPage = { objectType: number; id?: number; version?: number };

export type IDeploymentDetailsPage = { index: number };

export type IDockerImageHistory = { project: string; tag: string };

export type IDockerContainerDetails = { host: number; container: string; id: number };

export type IDockerContainerHistory = { host: number; container: string };

export type IModifiedFilePage = { id: number };

export type IPage =
    | { type: PAGE_TYPE.Dashbord }
    | (
          | { type: PAGE_TYPE.Deployment }
          | ({ type: PAGE_TYPE.DeploymentDetails } & IDeploymentDetailsPage)
      )
    | ({ type: PAGE_TYPE.DockerContainerDetails } & IDockerContainerDetails)
    | ({ type: PAGE_TYPE.DockerContainerHistory } & IDockerContainerHistory)
    | { type: PAGE_TYPE.DockerServices }
    | ({ type: PAGE_TYPE.DockerImageHistory } & IDockerImageHistory)
    | { type: PAGE_TYPE.DockerImages }
    | ({ type: PAGE_TYPE.ModifiedFile } & IModifiedFilePage)
    | { type: PAGE_TYPE.ModifiedFiles }
    | ({ type: PAGE_TYPE.Object } & IObjectPage)
    | ({ type: PAGE_TYPE.ObjectList } & IObjectListPage)
    | { type: PAGE_TYPE.Search };

export const TYPE_ID = 1;

export const HOST_ID = 2;

export const ROOT_ID = 3;

export const USER_ID = 4;

export const COLLECTION_ID = 7;

export const COMPLEX_COLLECTION_ID = 8;

export const HOST_VARIABLE_ID = 10840;

export const PACKAGE_ID = 10;

export const ROOT_INSTANCE_ID = 100;

export enum TypePropType {
    none = 0,
    bool = 1,
    text = 2,
    password = 3,
    document = 4,
    choice = 5,
    typeContent = 6,
    number = 7,
    monitor = 8,
}

export type IBoolTypeProp = {
    title: string;
    name: string;
    description: string;
    default: boolean;
    variable?: string;
};

export type ITextTypeProp = {
    title: string;
    name: string;
    description: string;
    default: string;
    template: boolean;
    variable?: string;
    deployTitle?: boolean;
    lines?: number;
};

export type IPasswordTypeProp = { title: string; name: string; description: string };

export type IDocumentTypeProp = {
    title: string;
    name: string;
    langName?: string;
    lang?: string;
    description: string;
    template: boolean;
    variable?: string;
};

export type IChoiceTypeProp = {
    title: string;
    name: string;
    description: string;
    default: string;
    choices: Array<string>;
    variable?: string;
};

export type INumberTypeProp = { title: string; name: string; description: string; default: number };

export type ITypeContentTypeProp = { name: string };

export type ITypeProp =
    | { type: TypePropType.none }
    | ({ type: TypePropType.bool } & IBoolTypeProp)
    | ({ type: TypePropType.text } & ITextTypeProp)
    | ({ type: TypePropType.password } & IPasswordTypeProp)
    | ({ type: TypePropType.document } & IDocumentTypeProp)
    | ({ type: TypePropType.choice } & IChoiceTypeProp)
    | ({ type: TypePropType.typeContent } & ITypeContentTypeProp)
    | ({ type: TypePropType.number } & INumberTypeProp)
    | { type: TypePropType.monitor };

export type KindType =
    | "host"
    | "root"
    | "collection"
    | "delta"
    | "sum"
    | "type"
    | "trigger"
    | "hostvar"
    | "docker"
    | "monitor";

export type IType = {
    plural?: string;
    kind?: KindType;
    deployOrder?: number;
    script?: string;
    hasCategory?: boolean;
    hasVariables?: boolean;
    hasContains?: boolean;
    hasSudoOn?: boolean;
    hasTriggers?: boolean;
    hasDepends?: boolean;
    containsName?: string;
    content?: Array<ITypeProp>;
    nameVariable?: string;
};

export type IVariable = { key: string; value: string };

export enum DEPLOYMENT_STATUS {
    Done = 0,
    BuildingTree = 1,
    InvilidTree = 2,
    ComputingChanges = 3,
    ReviewChanges = 4,
    Deploying = 5,
    Stopping = 6,
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

export type IObjectDigest = {
    name: string;
    comment: string;
    id: number;
    type: ObjectType;
    category: string;
};

export type IDeploymentTrigger = {
    typeId: number;
    script: string;
    content: { [key in string]?: JsonValue };
    title: string;
};

export type IDeploymentObject = {
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
    nextContent: { [key in string]?: JsonValue } | null;
    prevContent: { [key in string]?: JsonValue } | null;
    id: number | null;
    typeId: number;
    typeName: string;
    triggers: Array<IDeploymentTrigger>;
    deploymentOrder: number;
};

export type IObject2<T> = {
    id: number;
    type: ObjectType;
    name: string;
    category: string;
    content: T;
    version: number | null;
    comment: string;
    author: string | null;
    time: number | null;
};

export type Ref = number | string;

export type IFetchObject = { id: number };

export type IObjectChanged = {
    id: number;
    object: Array<IObject2<{ [key in string]?: JsonValue }>>;
};

export type ISetPageAction = { page: IPage };

export type IMessage = {
    id: number;
    host: number | null;
    type: string;
    subtype: string | null;
    message: string;
    fullMessage: boolean;
    time: number;
    url: string | null;
    dismissed: boolean;
};

export type ISetInitialState = {
    objectNamesAndIds: { [key in string | number]?: Array<IObjectDigest> };
    messages: Array<IMessage>;
    deploymentObjects: Array<IDeploymentObject>;
    deploymentStatus: DEPLOYMENT_STATUS;
    deploymentMessage: string;
    deploymentLog: Array<string>;
    types: { [key in number]?: IObject2<IType> };
    hostsUp: Array<number>;
    usedBy: Array<[number, number]>;
};

export type IStartLogLogType = "file" | "dmesg" | "journal";

export type IStartLog = {
    host: number;
    logtype: IStartLogLogType;
    id: number;
    unit: string | null;
};

export type IEndLog = { host: number; id: number };

export type IAddLogLines = { id: number; lines: Array<string> };

export type IMessageTextReqAction = { id: number };

export type IMessageTextRepAction = { id: number; message: string };

export type IAddMessage = { message: IMessage };

export type ISetMessagesDismissed = { ids: Array<number>; dismissed: boolean; source: ISource };

export type ISaveObject = { id: number; obj: IObject2<{ [key in string]?: JsonValue }> | null };

export type ISearch = { ref: Ref; pattern: string };

export type ObjectType = number | "root" | "type";

export type ISearchResObject = {
    type: ObjectType;
    id: number;
    version: number;
    name: string;
    comment: string;
    content: string;
};

export type ISearchRes = { ref: Ref; objects: Array<ISearchResObject> };

export type IHostDown = { id: number };

export type IHostUp = { id: number };

export type IDeployObject = { id: number | null; redeploy: boolean; cancel: boolean };

export type IMarkDeployed = Record<string, unknown>;

export type IDeleteObject = { id: number };

export type ISetDeploymentStatus = { status: DEPLOYMENT_STATUS };

export type IResetServerState = { host: number };

export type ISetDeploymentMessage = { message: string };

export type ISetDeploymentObjects = { objects: Array<IDeploymentObject> };

export type IClearDeploymentLog = Record<string, unknown>;

export type IAddDeploymentLog = { bytes: string };

export type ISetDeploymentObjectStatus = { index: number; status: DEPLOYMENT_OBJECT_STATUS };

export type ISource = "server" | "webclient";

export type IToggleDeploymentObject = { index: number | null; enabled: boolean; source: ISource };

export type IStopDeployment = Record<string, unknown>;

export type IStartDeployment = Record<string, unknown>;

export type ICancelDeployment = Record<string, unknown>;

export type IAlert = { message: string; title: string };

export type IRequestAuthStatus = { session?: string };

export type IAuthStatus = {
    message: string | null;
    auth: boolean;
    user: string | null;
    pwd: boolean;
    otp: boolean;
    admin: boolean;
    dockerPull: boolean;
    dockerPush: boolean;
    dockerDeploy: boolean;
    session: string | null;
    sslname: string | null;
    authDays: number | null;
};

export type ILogin = { user: string; pwd: string; otp: string | null };

export type ILogout = { forgetPwd: boolean; forgetOtp: boolean };

export type IRequestInitialState = Record<string, unknown>;

export type ISubscribeStatValues = { target: number; host: number; values: Array<string> | null };

export type IStatValueChanges = {
    target: number;
    host: number;
    name: string;
    value: number;
    level: number;
    index: number;
};

export type HostEnum = number | string;

export type IServiceDeployStart = { ref: Ref; host: HostEnum; description: string; image?: string };

export type IServiceRedeployStart = { ref: Ref; deploymentId: number };

export type IDockerDeployLog = { ref: Ref; message: string };

export type IDockerDeployEnd = { ref: Ref; status: boolean; message: string; id?: number };

export type IGenerateKey = { ref: Ref; ssh_public_key?: string };

export type IGenerateKeyRes = {
    ref: Ref;
    ca_pem: string;
    key: string;
    crt: string;
    ssh_host_ca?: string;
    ssh_crt?: string;
};

export type IGetObjectId = { ref: Ref; path: string };

export type IGetObjectIdRes = { ref: Ref; id: number | null };

export type IGetObjectHistory = { ref: Ref; id: number };

export type IGetObjectHistoryResHistory = { version: number; time: number; author: string | null };

export type IGetObjectHistoryRes = {
    ref: Ref;
    id: number;
    history: Array<IGetObjectHistoryResHistory>;
};

export type IDockerListImageTags = { ref: Ref };

export type DockerImageTag = {
    id: number;
    image: string;
    tag: string;
    hash: string;
    time: number;
    user: string;
    pin: boolean;
    labels: { [key in string]?: string };
    removed: number | null;
    pinnedImageTag: boolean;
};

export type IDockerListImageTagsResTag = { image: string; tag: string };

export type IDockerListImageTagsRes = {
    ref: Ref;
    tags: Array<DockerImageTag>;
    pinnedImageTags: Array<IDockerListImageTagsResTag>;
};

export type IDockerImageTagsChargedRemoved = { image: string; hash: string };

export type IDockerImageTagsChargedImageTagPin = { image: string; tag: string; pin: boolean };

export type IDockerListImageTagsCharged = {
    changed: Array<DockerImageTag>;
    removed: Array<IDockerImageTagsChargedRemoved>;
    imageTagPinChanged?: Array<IDockerImageTagsChargedImageTagPin>;
};

export type IDockerListDeployments = { ref: Ref; host?: number; image?: string };

export type DockerDeployment = {
    id: number;
    image: string;
    imageInfo?: DockerImageTag;
    hash?: string;
    name: string;
    user: string;
    start: number;
    end: number | null;
    host: number;
    state?: string;
    config: string;
    timeout: number;
    usePodman: boolean;
    service: boolean;
};

export type IDockerListDeploymentsRes = { ref: Ref; deployments: Array<DockerDeployment> };

export type IDockerDeploymentsChangedRemoved = { host: number; name: string };

export type IDockerDeploymentsChanged = {
    changed: Array<DockerDeployment>;
    removed: Array<IDockerDeploymentsChangedRemoved>;
};

export type IDockerContainerForget = { host: number; container: string };

export type IDockerListImageByHash = { hash: Array<string>; ref: Ref };

export type IDockerListImageByHashRes = { ref: Ref; tags: { [key in string]?: DockerImageTag } };

export type IDockerImageSetPin = { id: number; pin: boolean };

export type IDockerImageTagSetPin = { image: string; tag: string; pin: boolean };

export type IDockerListDeploymentHistory = { host: number; name: string; ref: Ref };

export type IDockerListDeploymentHistoryRes = {
    host: number;
    name: string;
    ref: Ref;
    deployments: Array<DockerDeployment>;
};

export type IDockerListImageTagHistory = { image: string; tag: string; ref: Ref };

export type IDockerListImageTagHistoryRes = {
    image: string;
    tag: string;
    ref: Ref;
    images: Array<DockerImageTag>;
};

export type ModifiedFile = {
    id: number;
    type: number;
    host: number;
    object: number;
    deployed: string;
    actual: string;
    current: string | null;
    path: string;
};

export type IModifiedFilesScan = Record<string, unknown>;

export type IModifiedFilesList = Record<string, unknown>;

export type IModifiedFilesChanged = {
    lastScanTime: number | null;
    scanning: boolean;
    full: boolean;
    changed: Array<ModifiedFile>;
    removed: Array<number>;
};

export type IModifiedFilesResolveAction = "redeploy" | "updateCurrent";

export type IModifiedFilesResolve = {
    id: number;
    action: IModifiedFilesResolveAction;
    newCurrent: string | null;
};

export type IDebug = Record<string, unknown>;

export type IRunCommand = { id: number; host: string; command: string; args: Array<string> };

export type IRunCommandTerminate = { id: number };

export type IRunCommandOutput = { id: number; stdout?: string; stderr?: string };

export type IRunCommandFinished = { id: number; status: number };

export type IServerAction =
    | ({ type: "AddDeploymentLog" } & IAddDeploymentLog)
    | ({ type: "AddMessage" } & IAddMessage)
    | ({ type: "Alert" } & IAlert)
    | ({ type: "AuthStatus" } & IAuthStatus)
    | ({ type: "ClearDeploymentLog" } & IClearDeploymentLog)
    | ({ type: "DockerDeployEnd" } & IDockerDeployEnd)
    | ({ type: "DockerDeployLog" } & IDockerDeployLog)
    | ({ type: "DockerDeploymentsChanged" } & IDockerDeploymentsChanged)
    | ({ type: "DockerListDeploymentHistoryRes" } & IDockerListDeploymentHistoryRes)
    | ({ type: "DockerListDeploymentsRes" } & IDockerListDeploymentsRes)
    | ({ type: "DockerListImageByHashRes" } & IDockerListImageByHashRes)
    | ({ type: "DockerListImageTagHistoryRes" } & IDockerListImageTagHistoryRes)
    | ({ type: "DockerListImageTagsChanged" } & IDockerListImageTagsCharged)
    | ({ type: "DockerListImageTagsRes" } & IDockerListImageTagsRes)
    | ({ type: "GenerateKeyRes" } & IGenerateKeyRes)
    | ({ type: "GetObjectHistoryRes" } & IGetObjectHistoryRes)
    | ({ type: "GetObjectIdRes" } & IGetObjectIdRes)
    | ({ type: "HostDown" } & IHostDown)
    | ({ type: "HostUp" } & IHostUp)
    | ({ type: "MessageTextRep" } & IMessageTextRepAction)
    | ({ type: "ModifiedFilesChanged" } & IModifiedFilesChanged)
    | ({ type: "ObjectChanged" } & IObjectChanged)
    | ({ type: "RunCommandFinished" } & IRunCommandFinished)
    | ({ type: "RunCommandOutput" } & IRunCommandOutput)
    | ({ type: "SearchRes" } & ISearchRes)
    | ({ type: "SetDeploymentMessage" } & ISetDeploymentMessage)
    | ({ type: "SetDeploymentObjects" } & ISetDeploymentObjects)
    | ({ type: "SetDeploymentObjectStatus" } & ISetDeploymentObjectStatus)
    | ({ type: "SetDeploymentStatus" } & ISetDeploymentStatus)
    | ({ type: "SetInitialState" } & ISetInitialState)
    | ({ type: "SetMessagesDismissed" } & ISetMessagesDismissed)
    | ({ type: "SetPage" } & ISetPageAction)
    | ({ type: "ToggleDeploymentObject" } & IToggleDeploymentObject);

export type IClientAction =
    | ({ type: "CancelDeployment" } & ICancelDeployment)
    | ({ type: "Debug" } & IDebug)
    | ({ type: "DeleteObject" } & IDeleteObject)
    | ({ type: "DeployObject" } & IDeployObject)
    | ({ type: "MarkDeployed" } & IMarkDeployed)
    | ({ type: "DockerContainerForget" } & IDockerContainerForget)
    | ({ type: "DockerImageSetPin" } & IDockerImageSetPin)
    | ({ type: "DockerImageTagSetPin" } & IDockerImageTagSetPin)
    | ({ type: "DockerListDeploymentHistory" } & IDockerListDeploymentHistory)
    | ({ type: "DockerListDeployments" } & IDockerListDeployments)
    | ({ type: "DockerListImageByHash" } & IDockerListImageByHash)
    | ({ type: "DockerListImageTagHistory" } & IDockerListImageTagHistory)
    | ({ type: "DockerListImageTags" } & IDockerListImageTags)
    | ({ type: "FetchObject" } & IFetchObject)
    | ({ type: "GenerateKey" } & IGenerateKey)
    | ({ type: "GetObjectHistory" } & IGetObjectHistory)
    | ({ type: "GetObjectId" } & IGetObjectId)
    | ({ type: "Login" } & ILogin)
    | ({ type: "Logout" } & ILogout)
    | ({ type: "MessageTextReq" } & IMessageTextReqAction)
    | ({ type: "ModifiedFilesList" } & IModifiedFilesList)
    | ({ type: "ModifiedFilesResolve" } & IModifiedFilesResolve)
    | ({ type: "ModifiedFilesScan" } & IModifiedFilesScan)
    | ({ type: "RequestAuthStatus" } & IRequestAuthStatus)
    | ({ type: "RequestInitialState" } & IRequestInitialState)
    | ({ type: "ResetServerState" } & IResetServerState)
    | ({ type: "RunCommand" } & IRunCommand)
    | ({ type: "RunCommandTerminate" } & IRunCommandTerminate)
    | ({ type: "SaveObject" } & ISaveObject)
    | ({ type: "Search" } & ISearch)
    | ({ type: "ServiceDeployStart" } & IServiceDeployStart)
    | ({ type: "ServiceRedeployStart" } & IServiceRedeployStart)
    | ({ type: "SetMessageDismissed" } & ISetMessagesDismissed)
    | ({ type: "StartDeployment" } & IStartDeployment)
    | ({ type: "StopDeployment" } & IStopDeployment)
    | ({ type: "ToggleDeploymentObject" } & IToggleDeploymentObject);
