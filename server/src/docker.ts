import * as crypto from "node:crypto";
import * as fs from "node:fs";
import { Stream } from "node:stream";
import type * as express from "express";
import * as Mustache from "mustache";
import { v4 as uuid } from "uuid";
import { parse } from "yaml";
import {
    ACTION,
    type DockerImageTag,
    type IAction,
    type IDockerImageSetPin,
    type IDockerImageTagSetPin,
    type IDockerImageTagsCharged,
    type IDockerListDeploymentHistory,
    type IDockerListDeploymentHistoryRes,
    type IDockerListDeployments,
    type IDockerListDeploymentsRes,
    type IDockerListImageByHash,
    type IDockerListImageByHashRes,
    type IDockerListImageTagHistory,
    type IDockerListImageTagHistoryRes,
    type IDockerListImageTags,
    type IDockerListImageTagsRes,
    type IServiceDeployStart,
    type IServiceRedeployStart,
    type Ref,
} from "../../shared/actions";
import getOrInsert from "../../shared/getOrInsert";
import nullCheck from "../../shared/nullCheck";
import { config } from "./config";
import type { HostClient } from "./hostclient";
import { hostClients, rs, webClients } from "./instances";
import { Job } from "./job";
import type * as message from "./messages";
import type { WebClient } from "./webclient";
const serverRs = require("simple_admin_server_rs");

const docker_upload_path = "/var/tmp/simpleadmin_docker_uploads/";
const docker_blobs_path = "/var/simpleadmin_docker_blobs/";
if (!fs.existsSync(docker_upload_path)) fs.mkdirSync(docker_upload_path, 0o700);
if (!fs.existsSync(docker_blobs_path)) fs.mkdirSync(docker_blobs_path, 0o700);

class Count extends Stream.Writable {
    value = 0;
    _write(chunk: any, enc: string, next: (err?: Error) => void) {
        this.value += chunk.length;
        next();
    }
}

class Upload {
    count: Count;
    hash: crypto.Hash;
    writer: fs.WriteStream;
    constructor(public un: string) {
        this.hash = crypto.createHash("sha256");
        this.count = new Count();
        this.writer = fs.createWriteStream(docker_upload_path + un);
    }
}

const HASH_PATTERN = /^sha256:[0-9A-Fa-f]{64}$/;

interface IHostContainer {
    id: string;
    name: string;
    image: string;
    state: string;
    created: number;
}

interface IHostContainerState {
    type: "docker_container_state";
    id: string;
    state: string;
}

interface IHostContainers {
    type: "docker_containers";
    full: boolean;
    update: IHostContainer[];
    delete: string[];
}

interface IHostImage {
    id: string;
    digests: string[];
    tags: string[];
    created: number;
}

interface IHostImages {
    type: "docker_images";
    full: boolean;
    update: IHostImage[];
    delete: string[];
}

class Docker {
    activeUploads = new Map<string, Upload>();
    hostImages = new Map<number, Map<string, IHostImage>>();
    hostContainers = new Map<number, Map<string, IHostContainer>>();

    idc = 0;

    ca_key: string | null = null;
    ca_crt: string | null = null;

    async ensure_ca() {
        const r1 = await serverRs.getKvp(rs, "ca_key");
        if (r1) this.ca_key = r1;

        const r2 = await serverRs.getKvp(rs, "ca_crt");
        if (r2) this.ca_crt = r2;
        if (!this.ca_key) {
            console.log("Generating ca key");
            this.ca_key = await serverRs.crtGenerateKey();
            serverRs.setKvp(rs, "ca_key", this.ca_key);
        }

        if (!this.ca_crt) {
            console.log("Generating ca crt");
            this.ca_crt = await serverRs.crtGenerateCaCrt(this.ca_key);
            serverRs.setKvp(rs, "ca_crt", this.ca_crt);
        }
    }

    constructor() {
        setInterval(
            () => {
                serverRs.dockerPrune(rs);
            },
            1000 * 60 * 60 * 12,
        ); // prune docker images every 12 houers
    }

    getContainerState(host: number, container: string): string | undefined {
        const i = this.hostContainers.get(host);
        if (!i) return undefined;
        for (const [id, v] of i) {
            if (v.name !== `/${container}`) continue;
            return v.state;
        }
        return undefined;
    }

    async checkAuth(req: express.Request, res: express.Response, push: boolean) {
        if (req.headers.authorization) {
            const auth = Buffer.from(
                (req.headers.authorization as string).substr(6),
                "base64",
            ).toString("utf8");

            // req.connection.remoteAddress
            const parts = auth.split(":");
            if (parts.length > 1) {
                const a = await serverRs.getAuth(rs, null, parts.slice(1).join(":"));
                if (parts[0] === a.user && push ? a.dockerPush : a.dockerPull) return a.user;
            }

            console.error("Auth failure", { address: req.connection.remoteAddress, parts });
            res.status(403)
                .header("WWW-Authenticate", 'Basic realm="User Visible Realm", charset="UTF-8')
                .header("Content-Type", "application/json; charset=utf-8")

                .json({ errors: [{ code: "DENIED", message: "token expired", detail: "null" }] })
                .end();
            return null;
        }

        res.status(401)
            .header("WWW-Authenticate", 'Basic realm="User Visible Realm", charset="UTF-8')
            .header("Content-Type", "application/json; charset=utf-8")

            .json({
                errors: [
                    { code: "UNAUTHORIZED", message: "authentication required", detail: "null" },
                ],
            })
            .end();
        return null;
    }

    async images(req: express.Request, res: express.Response) {
        try {
            const user = await this.checkAuth(req, res, false);
            if (user === null) return;

            const p = req.url.split("?")[0].split("/");
            // GET /docker/images/image
            if (p.length === 4 && p[0] === "" && p[1] === "docker" && p[2] === "images") {
                const images = await serverRs.getImageTagsByProject(rs, p[3]);
                res.header("Content-Type", "application/json; charset=utf-8")
                    .json({ images: images })
                    .end();
            } else {
                res.status(404).end();
            }
        } catch (e) {
            console.error("EXCEPTION", { e });
            res.status(500).end();
        }
    }

    async usedImages(req: express.Request, res: express.Response) {
        try {
            const token = req.query.token;
            if (!token || token !== config.usedImagesToken) {
                console.error("access error");
                res.status(403).end();
                return;
            }
            const re = /^([^\/]*)\/([^\/@:]*)@(sha256:[a-fA-F0-9]*)$/;
            const time = +new Date() / 1000;
            for (const image of req.body.images) {
                const match = re.exec(image);
                if (!match) continue;
                await serverRs.markImageUsed(rs, match[3], time);
            }
            res.status(200).end();
        } catch (e) {
            console.error(e, (e as any).stack);
            console.error("EXCEPTION", { e });
            res.status(500).end();
        }
    }

    async get(req: express.Request, res: express.Response) {
        res.header("Docker-Distribution-Api-Version", "registry/2.0");
        const user = await this.checkAuth(req, res, false);
        if (user === null) return;

        const p = req.url.split("?")[0].split("/");

        // GET /v2/ Base Check that the endpoint implements Docker Registry API V2.
        if (req.url === "/v2/") {
            res.status(200).end();
            return;
        }

        // GET /v2/<name>/blobs/uploads/<uuid> Blob Upload Retrieve status of upload identified by uuid. The primary purpose of this endpoint is to resolve the current status of a resumable upload.
        if (
            p.length === 5 &&
            p[0] === "" &&
            p[1] === "v2" &&
            p[3] === "blobs" &&
            p[4] === "uploads"
        ) {
            const un = p[5];
            const u = this.activeUploads.get(un);
            if (!u) {
                //console.log("Docker get blob: missing", {uuid: un});
                res.status(404).end();
                return;
            }

            res.setHeader("Location", req.url);
            res.setHeader("Range", `0-${u.count.value - 1}`);
            res.setHeader("Docker-Upload-UUID", un);
            res.status(202);
            res.end();
            return;
        }

        // GET /v2/<name>/blobs/<digest> Blob Retrieve the blob from the registry identified by digest. A HEAD request can also be issued to this endpoint to obtain resource information without receiving all data.
        if (p.length === 5 && p[0] === "" && p[1] === "v2" && p[3] === "blobs") {
            const digest = p[4];
            if (!HASH_PATTERN.test(digest)) {
                console.error("Docker get blob: bad name", { digest });
                res.status(400).end();
                return;
            }
            const path = docker_blobs_path + digest;
            if (!fs.existsSync(path)) {
                //console.error("Docker get blob: not found", {digest});
                res.status(404).end();
                return;
            }

            res.sendFile(path, {
                headers: {
                    "Docker-Content-Digest": digest,
                    "Content-Type": "application/octet-stream",
                },
            });
            return;
        }

        // GET 	/v2/<name>/manifests/<reference> Manifest Fetch the manifest identified by name and reference where reference can be a tag or digest. A HEAD request can also be issued to this endpoint to obtain resource information without receiving all data.
        if (p.length === 5 && p[0] === "" && p[1] === "v2" && p[3] === "manifests") {
            const manifest = await serverRs.getDockerImageManifest(rs, p[2], p[4]);
            if (manifest == null) {
                console.error("Docker get manifest: not found", {
                    project: p[2],
                    identifier: p[4],
                });
                res.status(404).end();
                return;
            }
            res.header("Content-Type", "application/vnd.docker.distribution.manifest.v2+json");
            res.send(manifest).end();
            return;
        }

        //TODO
        // GET /v2/<name>/tags/list Tags Fetch the tags under the repository identified by name.
        // GET /v2/_catalog	Catalog	Retrieve a sorted, json list of repositories available in the registry.
        console.log("Docker unhandled get", { url: req.url, params: req.params });
        res.status(404).end();
    }

    handleUpload(req: express.Request, upload: Upload, final: boolean): Promise<void> {
        return new Promise((resolve, reject) => {
            req.pipe(upload.count, { end: final });
            req.pipe(upload.hash, { end: final });
            req.pipe(upload.writer, { end: final });
            req.on("end", resolve);
            req.on("error", reject);
        });
    }

    async put(req: express.Request, res: express.Response) {
        try {
            return await this.putInner(req, res);
        } catch (e) {
            console.error("Uncaught exception in docker.put", e);
            res.status(500).end();
        }
    }

    async putInner(req: express.Request, res: express.Response) {
        res.header("Docker-Distribution-Api-Version", "registry/2.0");
        const user = await this.checkAuth(req, res, true);
        if (user === null || user === "docker_client") return;

        const p = req.url.split("?")[0].split("/");

        // PUT /v2/<name>/blobs/uploads/<uuid> Blob Upload Complete the upload specified by uuid, optionally appending the body as the final chunk.
        if (p.length === 6 && p[1] === "v2" && p[3] === "blobs" && p[4] === "uploads") {
            const un = p[5];
            const u = this.activeUploads.get(un);
            if (!u) {
                console.error("Docker put blob: missing", { uuid: un });
                res.status(404).end();
                return;
            }

            const start_size = u.count.value;
            const cl = req.headers["content-length"];
            let expected_size: number | undefined = undefined;
            if (cl !== undefined) {
                expected_size = +cl;
            }
            const cr = req.headers["content-range"];
            if (cr !== undefined) {
                const [start, end] = cr.split("-").map((v) => +v);
                if (start !== start_size) {
                    console.error("Uploaded chunk not at end of", {
                        uuid,
                        start,
                        start_size,
                        url: req.url,
                    });
                    res.status(500).end();
                }
                if (expected_size !== undefined) {
                    if (end - start !== expected_size) {
                        console.error("Inconsistent content-range and content-length", {
                            uuid,
                            start,
                            end,
                            expected_size,
                            url: req.url,
                        });
                        res.status(400).end();
                        return;
                    }
                }
                expected_size = end - start;
            }

            this.activeUploads.delete(un);

            await this.handleUpload(req, u, true);
            const digest = req.query.digest;

            if (expected_size !== undefined) {
                if (u.count.value !== start_size + expected_size) {
                    console.error("Uploaded bytes does not match expected size", {
                        uuid,
                        recieved: u.count.value - start_size,
                        expected_size,
                        url: req.url,
                    });
                    res.status(400).end();
                    return;
                }
            }

            const actual_digest = `sha256:${u.hash.digest("hex")}`;

            if (digest !== actual_digest) {
                console.error("Invalid digest of uploaded chunk", { uuid, digest, actual_digest });
                res.status(400).end();
                return;
            }
            //console.log("Docker put blob", {uuid: un, total_size: u.count.value, expected_size, content_length: cl, contest_range: cr, digest});

            fs.renameSync(docker_upload_path + un, docker_blobs_path + digest);
            res.setHeader("Location", `/v2/${p[2]}/blobs/${digest}`);
            //res.setHeader("Range", "0-"+u.count.value);
            res.setHeader("Content-Length", "0");
            res.setHeader("Docker-Content-Digest", digest as string);
            res.statusCode = 201;
            res.statusMessage = "Created";
            res.end();
            return;
        }

        // PUT /v2/<name>/manifests/<reference> Manifest Put the manifest identified by name and reference where reference can be a tag or digest.
        if (p.length === 5 && p[0] === "" && p[1] === "v2" && p[3] === "manifests") {
            req.setEncoding("utf-8");
            let content = "";
            req.on("data", (chunk) => {
                content += chunk;
            });

            await new Promise((acc, rej) => {
                req.on("end", acc);
                req.on("error", rej);
            });

            // console.log("Docker put manifest", {name: p[2], reference: p[4]});

            // Validate that manifest is JSON.
            const manifest = JSON.parse(content);

            // Validate that we have all the parts.
            for (const layer of manifest.layers) {
                const { digest, size, mediaType } = layer;
                if (!HASH_PATTERN.test(digest)) {
                    console.error("Docker put manifest: bad layer digest", { digest });
                    res.status(400).end();
                    return;
                }
                if (mediaType !== "application/vnd.docker.image.rootfs.diff.tar.gzip") {
                    console.error("Docker put manifest: layer has invalid media type media type", {
                        digest,
                        mediaType,
                    });
                    res.status(400).end();
                    return;
                }

                try {
                    const s = await new Promise<fs.Stats>((resolve, reject) => {
                        fs.stat(docker_blobs_path + digest, (err, stat) => {
                            if (err != null) {
                                reject(err);
                            }
                            resolve(stat);
                        });
                    });
                    if (s.size !== size) {
                        console.error("Docker put manifest: layer has wrong size", {
                            digest,
                            diskSize: s.size,
                            manifestSize: size,
                        });
                        res.status(400).end();
                        return;
                    }
                } catch (e) {
                    console.error("Docker put manifest: layer digest does not exist", { digest });
                    res.status(400).end();
                    return;
                }
                // If file does not exist, an error is thrown.
            }

            // Read config
            const configDigest = manifest.config.digest;
            if (!HASH_PATTERN.test(configDigest)) {
                console.error("Docker put manifest: bad config digest", configDigest);
                res.status(400).end();
                return;
            }
            const configString = fs.readFileSync(docker_blobs_path + configDigest, {
                encoding: "utf-8",
            });
            const config = JSON.parse(configString);
            const labels = config.config.Labels || {};
            const labelsString = JSON.stringify(labels);

            const hash = crypto.createHash("sha256");
            hash.update(content, "utf8");
            const h = `sha256:${hash.digest("hex")}`;

            const time = +new Date() / 1000;
            const id = await serverRs.insertDockerImage(
                rs,
                p[2],
                p[4],
                content,
                h,
                user,
                time,
                labelsString,
            );

            webClients.broadcast({
                type: ACTION.DockerListImageTagsChanged,
                changed: [
                    {
                        id,
                        image: p[2],
                        hash: h,
                        tag: p[4],
                        user,
                        time,
                        pin: false,
                        labels: labels,
                        removed: null,
                    },
                ],
                removed: [],
            });

            res.status(201)
                .header("Location", `/v2/${p[2]}/manifests/${h}`)
                .header("Content-Length", "0")
                .header("Docker-Content-Digest", h)
                .end();
            return;
        }

        console.log("Docker unhandled put", { url: req.url });
        res.status(404).end();
    }

    async patch(req: express.Request, res: express.Response) {
        res.header("Docker-Distribution-Api-Version", "registry/2.0");
        const user = await this.checkAuth(req, res, true);
        if (user === null || user === "docker_client") return;

        const p = req.url.split("?")[0].split("/");

        // PATCH /v2/<name>/blobs/uploads/<uuid> Blob Upload Upload a chunk of data for the specified upload.
        if (p.length === 6 && p[1] === "v2" && p[3] === "blobs" && p[4] === "uploads") {
            const uuid = p[5];
            const u = this.activeUploads.get(uuid);
            if (!u) {
                console.error("Docker patch blob: missing", { uuid });
                res.status(404).end();
                return;
            }
            const start_size = u.count.value;

            const cl = req.headers["content-length"];
            let expected_size: number | undefined = undefined;
            if (cl !== undefined) {
                expected_size = +cl;
            }
            const cr = req.headers["content-range"];
            if (cr !== undefined) {
                const [start, end] = cr.split("-").map((v) => +v);
                if (start !== start_size) {
                    console.error("Uploaded chunk not at end of", { uuid, start, start_size });
                    res.status(500).end();
                }
                if (expected_size !== undefined) {
                    if (end - start !== expected_size) {
                        console.error("Inconsistent content-range and content-length", {
                            uuid,
                            start,
                            end,
                            expected_size,
                        });
                        res.status(400).end();
                        return;
                    }
                }
                expected_size = end - start;
            }

            await this.handleUpload(req, u, false);
            if (expected_size !== undefined) {
                if (u.count.value !== start_size + expected_size) {
                    console.error("Uploaded bytes does not match expected size", {
                        uuid,
                        recieved: u.count.value - start_size,
                        expected_size,
                    });
                    res.status(400).end();
                    return;
                }
            }

            //console.log("Docker patch", {uuid, uploaded: u.count.value, content_length: cl, content_range: cr });

            res.setHeader("Location", req.url);
            res.setHeader("Range", `0-${u.count.value - 1}`);
            res.setHeader("Content-Length", "0");
            res.setHeader("Docker-Upload-UUID", uuid);
            res.status(202);
            res.end();
            return;
        }

        console.log("Docker unhandled patch", { url: req.url });
        res.status(404).end();
    }

    async post(req: express.Request, res: express.Response) {
        res.header("Docker-Distribution-Api-Version", "registry/2.0");
        const user = await this.checkAuth(req, res, true);
        if (user === null || user === "docker_client") return;

        const p = req.url.split("?")[0].split("/");

        // POST	/v2/<name>/blobs/uploads/ Initiate Blob Upload Initiate a resumable blob upload. If successful, an upload location will be provided to complete the upload. Optionally, if the digest parameter is present, the request body will be used to complete the upload in a single request.
        if (p.length >= 5 && p[1] === "v2" && p[3] === "blobs" && p[4] === "uploads") {
            const u = uuid();
            this.activeUploads.set(u, new Upload(u));
            res.setHeader("Content-Length", "0");
            res.setHeader("Location", `/v2/${p[2]}/blobs/uploads/${u}`);
            res.setHeader("Range", "0-0");
            res.setHeader("Docker-Upload-UUID", u);
            res.statusCode = 202;
            res.statusMessage = "Accepted";
            res.end();
            //console.log("Docker post", {uuid: u});
            return;
        }

        console.log("Docker unhandled post", { url: req.url });
        res.status(404).end();
    }

    async delete(req: express.Request, res: express.Response) {
        res.header("Docker-Distribution-Api-Version", "registry/2.0");
        const user = await this.checkAuth(req, res, true);
        if (user === null || user === "docker_client") return;
        // DELETE /v2/<name>/manifests/<reference> Manifest	Delete the manifest identified by name and reference. Note that a manifest can only be deleted by digest.
        // DELETE /v2/<name>/blobs/<digest> Blob Delete the blob identified by name and digest
        // DELETE /v2/<name>/blobs/<digest> Blob Delete the blob identified by name and digest
        console.log("Docker unhandled delete", { url: req.url });
        res.status(404).end();
    }

    deployServiceJob(
        client: WebClient,
        hostId: number,
        description: string,
        docker_auth: string,
        image: string | null,
        extra_env: { [key: string]: string },
        ref: Ref,
        user: string,
    ): Promise<void> {
        let host: HostClient = hostClients.hostClients[hostId];
        return new Promise((accept, reject) => {
            class ServiceDeployJob extends Job {
                stdoutPart = "";
                stderrPart = "";

                constructor() {
                    super(host, null, host);
                    const msg: message.DeployService = {
                        type: "deploy_service",
                        id: this.id,
                        description,
                        extra_env,
                        docker_auth,
                        image: image || undefined,
                        user,
                    };
                    host.sendMessage(msg);
                    this.running = true;
                }

                handleMessage(obj: message.Incomming) {
                    super.handleMessage(obj);
                    switch (obj.type) {
                        case "data":
                            if (obj.source === "stdout" || obj.source === "stderr")
                                client.sendMessage({
                                    type: ACTION.DockerDeployLog,
                                    ref,
                                    message: Buffer.from(obj.data, "base64").toString("binary"),
                                });
                            break;
                        case "success":
                            if (obj.code === 0) accept();
                            else reject();
                            break;
                        case "failure":
                            reject();
                            break;
                    }
                }
            }
            new ServiceDeployJob();
        });
    }

    nextId() : number {
        return this.idc++;
    }

    getHostId(hostIdentifier: string) : number | null {
        for (const id in hostClients.hostClients) {
            const cl = hostClients.hostClients[id];
            if (cl.hostname === hostIdentifier) return cl.id;
        }
        return null;
    }

    handleHostDockerContainerState(host: HostClient, obj: IHostContainerState) {
        if (!host.id) throw Error("Missing host id");

        const containers = this.hostContainers.get(host.id);
        if (!containers) return;
        const o = containers.get(obj.id);
        if (!o) return;
        o.state = obj.state;
    }

    handleHostDockerImages(host: HostClient, obj: IHostImages) {
        if (!host.id) throw Error("Missing host id");

        const images = getOrInsert(this.hostImages, host.id, () => new Map());
        if (obj.full) images.clear();

        for (const id of obj.delete) images.delete(id);

        for (const u of obj.update) images.set(u.id, u);
    }
}

export const docker = new Docker();
