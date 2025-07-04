import { Button, Typography } from "@mui/material";
import { observer } from "mobx-react";
import Box from "./Box";
import DisplayError from "./Error";
import extractRemote from "./extractRemote";
import { InformationList, InformationListRow } from "./InformationList";
import InfoTable, { InfoTableHeader } from "./InfoTable";
import { HOST_ID, type IPage, PAGE_TYPE } from "./shared_types";
import state from "./state";
import UnixTime from "./UnixTime";

export const HostDockerContainers = observer(function DockerContainers(p: {
    host: number;
    title?: string;
    standalone: boolean;
}) {
    const dockerContainers = state.dockerContainers;
    if (!dockerContainers) return <DisplayError>Missing state.dockerContainers</DisplayError>;
    const r = extractRemote(dockerContainers.hosts);
    if (r.state !== "good") return r.error;
    const page = state.page;
    if (!page) return <DisplayError>Missing state.page</DisplayError>;
    const hosts = r.data;
    const hostDigests = state.objectDigests.get(HOST_ID);
    const hostDigest = hostDigests?.get(p.host);
    const hostName = hostDigest?.name;
    if (!hostName) return <DisplayError>Missing hostName</DisplayError>;
    const originalContainers = hosts.get(p.host);
    if (!originalContainers) return <DisplayError>Missing originalContainers</DisplayError>;
    const containers = originalContainers.slice();
    containers.sort((a, b) => {
        return a.name < b.name ? -1 : 1;
    });

    const rows = [];
    for (const container of containers) {
        let commit = "";
        if (container.imageInfo?.labels) {
            commit = `${container.imageInfo.labels.GIT_BRANCH || ""} ${container.imageInfo.labels.GIT_COMMIT || ""}`;
        }
        const historyPage: IPage = {
            type: PAGE_TYPE.DockerContainerHistory,
            host: p.host,
            container: container.name,
        };
        const detailsPage: IPage = {
            type: PAGE_TYPE.DockerContainerDetails,
            host: p.host,
            container: container.name,
            id: container.id,
        };
        rows.push(
            <tr key={container.name}>
                <td>{container.name}</td>
                <td>{container.image}</td>
                <td>{container.state ?? ""}</td>
                <td>{commit}</td>
                <td>{container.user}</td>
                <td>{container.hash ? container.hash.substr(7, 12) : ""}</td>
                <td>{container.start ? <UnixTime time={container.start} /> : null}</td>
                <td>{container.end ? <UnixTime time={container.end} /> : null}</td>
                <td>
                    <Button
                        onClick={() => {
                            confirm("Forget this container from host?") &&
                                state.sendMessage({
                                    type: "DockerContainerForget",
                                    host: p.host,
                                    container: container.name,
                                });
                        }}
                    >
                        Forget
                    </Button>
                    <Button
                        onClick={(e) => {
                            page.onClick(e, detailsPage);
                        }}
                        href={page.link(detailsPage)}
                    >
                        Details
                    </Button>
                    <Button
                        onClick={(e) => {
                            page.onClick(e, historyPage);
                        }}
                        href={page.link(historyPage)}
                    >
                        History
                    </Button>
                </td>
            </tr>,
        );
    }

    const headers = (
        <tr>
            <th>Service</th>
            <th>Project</th>
            <th>Status</th>
            <th>Commit</th>
            <th>User</th>
            <th>Hash</th>
            <th>Start</th>
            <th>End</th>
            <th>Actions</th>
        </tr>
    );

    if (p.standalone)
        return (
            <Box title="Docker services">
                <InfoTable>
                    <thead>{headers}</thead>
                    <tbody>{rows}</tbody>
                </InfoTable>
            </Box>
        );

    if (containers.length === 0) {
        return null;
    }
    return (
        <>
            <thead>
                <tr>
                    <InfoTableHeader colSpan={10}>{p.title ?? hostName}</InfoTableHeader>
                </tr>
                {headers}
            </thead>
            <tbody>{rows}</tbody>
        </>
    );
});

export const DockerServices = observer(function DockerServices(_: { host?: string }) {
    const dockerContainers = state.dockerContainers;
    if (!dockerContainers) return <DisplayError>Missing state.dockerContainers</DisplayError>;
    const r = extractRemote(dockerContainers.hosts);
    if (r.state !== "good") return r.error;
    const hosts = r.data;

    const lst = [];
    const keys = [];
    for (const key of hosts.keys()) keys.push(key);
    keys.sort();

    for (const host of keys)
        lst.push(<HostDockerContainers key={host} host={host} standalone={false} />);

    return (
        <Box title="Docker services">
            <InfoTable>{lst}</InfoTable>
        </Box>
    );
});

export const DockerServiceDetails = observer(function DockerServiceDetails() {
    const spage = state.page;
    if (!spage) return <DisplayError>Missing state.page</DisplayError>;
    const page = spage.current;
    if (page.type !== PAGE_TYPE.DockerContainerDetails)
        return <DisplayError>Wrong page type</DisplayError>;
    const hosts = state.objectDigests.get(HOST_ID);
    const host = hosts?.get(page.host);
    const hostName = host?.name;
    if (!hostName) return <DisplayError>Missing host name</DisplayError>;
    const dockerContainers = state.dockerContainers;
    if (!dockerContainers) return <DisplayError>Missing dockerContainers</DisplayError>;
    const ch = dockerContainers.containerHistory.get(page.host);
    const r = extractRemote(ch?.get(page.container));
    if (r.state !== "good") return r.error;
    const container = r.data.get(page.id);
    if (!container) return <DisplayError>Missing container</DisplayError>;

    let commit = "";
    const img = container.imageInfo;
    if (img?.labels) commit = `${img.labels.GIT_BRANCH || ""} ${img.labels.GIT_COMMIT || ""}`;

    return (
        <Box title={`Docker containers details: ${page.container}@${hostName}`}>
            <InformationList>
                <InformationListRow name="Project">
                    <Typography>{container.image}</Typography>
                </InformationListRow>
                <InformationListRow name="Deploy user">
                    <Typography>{container.user}</Typography>
                </InformationListRow>
                <InformationListRow name="Deploy start">
                    <Typography>
                        {container.start ? <UnixTime time={container.start} /> : null}
                    </Typography>
                </InformationListRow>
                <InformationListRow name="Deploy end">
                    <Typography>
                        {container.end ? <UnixTime time={container.end} /> : null}
                    </Typography>
                </InformationListRow>
                <InformationListRow name="Deploy state">
                    <Typography>{container.state}</Typography>
                </InformationListRow>
                <InformationListRow name="Push user">
                    <Typography>{img ? img.user : null}</Typography>
                </InformationListRow>
                <InformationListRow name="Push time">
                    <Typography>{img?.time ? <UnixTime time={img.time} /> : null}</Typography>
                </InformationListRow>
                <InformationListRow name="Push tag">
                    <Typography>{img ? img.tag : null}</Typography>
                </InformationListRow>
                <InformationListRow name="Build user">
                    <Typography>{img ? img.labels.BUILD_USER : null}</Typography>
                </InformationListRow>
                <InformationListRow name="Build host">
                    <Typography>{img ? img.labels.BUILD_HOST : null}</Typography>
                </InformationListRow>
                <InformationListRow name="Image hash">
                    <Typography>{img ? img.hash : null}</Typography>
                </InformationListRow>
                <InformationListRow name="Image Commit">
                    <Typography>{commit}</Typography>
                </InformationListRow>
                <InformationListRow name="Config">
                    <Typography>
                        <pre>{container.config}</pre>
                    </Typography>
                </InformationListRow>
            </InformationList>
        </Box>
    );
});

export const DockerServiceHistory = observer(function DockerServiceHistory() {
    const s = state.dockerContainers;
    if (!s) return <DisplayError>Missing state.dockerContainers</DisplayError>;
    const spage = state.page;
    if (!spage) return <DisplayError>Missing state.page</DisplayError>;
    const page = spage.current;
    if (page.type !== PAGE_TYPE.DockerContainerHistory)
        return <DisplayError>Wrong page type</DisplayError>;
    const hosts = state.objectDigests.get(HOST_ID);
    const host = hosts?.get(page.host);
    const hostName = host?.name;
    if (!hostName) return <DisplayError>Missing host name</DisplayError>;
    const ch = s.containerHistory.get(page.host);
    const r = extractRemote(ch?.get(page.container));
    if (r.state !== "good") return r.error;
    const history = r.data;

    const containers = [];
    for (const [_, c] of history) containers.push(c);

    containers.sort((a, b) => {
        return a.id < b.id ? 1 : -1;
    });

    const rows = [];
    for (const container of containers) {
        let commit = "";
        if (container.imageInfo?.labels) {
            commit = `${container.imageInfo.labels.GIT_BRANCH || ""} ${container.imageInfo.labels.GIT_COMMIT || ""}`;
        }
        const detailsPage: IPage = {
            type: PAGE_TYPE.DockerContainerDetails,
            host: page.host,
            container: container.name,
            id: container.id,
        };
        rows.push(
            <tr key={container.id}>
                <td>{commit}</td>
                <td>{container.user}</td>
                <td>{container.hash}</td>
                <td>{container.start ? <UnixTime time={container.start} /> : null}</td>
                <td>{container.end ? <UnixTime time={container.end} /> : null}</td>
                <td>
                    <Button
                        onClick={(e) => {
                            spage.onClick(e, detailsPage);
                        }}
                        href={spage.link(detailsPage)}
                    >
                        Details
                    </Button>
                </td>
            </tr>,
        );
    }
    return (
        <Box title={`Docker service history: ${page.container}@${hostName}`}>
            <InfoTable>
                <thead>
                    <tr>
                        <th>Commit</th>
                        <th>User</th>
                        <th>Image</th>
                        <th>Start</th>
                        <th>End</th>
                        <th>Actions</th>
                    </tr>
                </thead>
                <tbody>{rows}</tbody>
            </InfoTable>
        </Box>
    );
});
