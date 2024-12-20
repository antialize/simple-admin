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
import { db, hostClients, rs, webClients } from "./instances";
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

interface DeploymentInfo {
    restore: number | null;
    host: number;
    image: string;
    container: string;
    hash: string | null;
    user: string;
    config: string;
    timeout: any;
    start: number;
    end: number | null;
    id: number | null;
    setup: string | null;
    postSetup: string | null;
    deploymentTimeout: number;
    softTakeover: boolean | null;
    startMagic: string | null;
    usePodman: boolean | null;
    stopTimeout: number;
    userService: boolean;
    deployUser: string | null;
    serviceFile: string | null;
    description: string | null;
}

class Docker {
    activeUploads = new Map<string, Upload>();
    hostImages = new Map<number, Map<string, IHostImage>>();
    hostContainers = new Map<number, Map<string, IHostContainer>>();

    idc = 0;
    delayedDeploymentInformations = new Map<number, DeploymentInfo>();

    ca_key: string | null = null;
    ca_crt: string | null = null;

    async ensure_ca() {
        const r1 = await db.get("SELECT `value` FROM `kvp` WHERE `key` = 'ca_key'");
        if (r1) this.ca_key = r1.value;

        const r2 = await db.get("SELECT `value` FROM `kvp` WHERE `key` = 'ca_crt'");
        if (r2) this.ca_crt = r2.value;
        if (!this.ca_key) {
            console.log("Generating ca key");
            this.ca_key = await serverRs.crtGenerateKey();
            await db.insert("REPLACE INTO kvp (key,value) VALUES (?, ?)", "ca_key", this.ca_key);
        }

        if (!this.ca_crt) {
            console.log("Generating ca crt");
            this.ca_crt = await serverRs.crtGenerateCaCrt(this.ca_key);
            await db.insert("REPLACE INTO kvp (key, value) VALUES (?,?)", "ca_crt", this.ca_crt);
        }
    }

    constructor() {
        setInterval(serverRs.dockerPrune(rs), 1000 * 60 * 60 * 12); // prune docker images every 12 houers
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
                const images: DockerImageTag[] = [];
                const q =
                    "SELECT `id`, `hash`, `time`, `project`, `user`, `tag`, `pin`, `labels`, `removed` FROM `docker_images` WHERE `project` = ? ORDER BY `time`";
                for (const row of await db.all(q, p[3])) {
                    images.push({
                        id: row.id,
                        image: row.project,
                        hash: row.hash,
                        tag: row.tag,
                        user: row.user,
                        time: row.time,
                        pin: row.pin,
                        labels: JSON.parse(row.labels || "{}"),
                        removed: row.removed,
                    });
                }
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

                await db.run("UPDATE `docker_images` SET `used`=? WHERE `hash`=?", time, match[3]);
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
            const row = await db.get(
                "SELECT `manifest`, `hash` FROM `docker_images` WHERE `project`=? AND (`tag`=? OR `hash`=?) ORDER BY `time` DESC LIMIT 1",
                p[2],
                p[4],
                p[4],
            );
            if (!row) {
                console.error("Docker get manifest: not found", {
                    project: p[2],
                    identifier: p[4],
                });
                res.status(404).end();
                return;
            }
            // console.log("Docker get manifest", {row: row['hash']});
            res.header("Content-Type", "application/vnd.docker.distribution.manifest.v2+json");
            res.send(row.manifest).end();
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

            await db.run(
                "DELETE FROM `docker_images` WHERE `project`=? AND `tag`=? AND `hash`=?",
                p[2],
                p[4],
                h,
            );
            const time = +new Date() / 1000;
            const id = await db.insert(
                "INSERT INTO `docker_images` (`project`, `tag`, `manifest`, `hash`, `user`, `time`, `pin`, `labels`) VALUES (?, ?, ?, ?, ?, ?, 0, ?)",
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

    async findImage(id: string) {
        if (id.includes("@")) {
            const p = id.split("@");
            const image = p[0];
            const reference = p[1];
            let hash: string | null = null;
            for (const row of await db.all(
                "SELECT `hash`, `time` FROM `docker_images` WHERE `project`=? AND `hash`=? ORDER BY `time` DESC LIMIT 1",
                image,
                reference,
            )) {
                hash = row.hash;
            }
            return { image, hash };
        }
        const p = id.split(":");
        const image = p[0];
        const reference = p[1] || "latest";
        let hash: string | null = null;
        for (const row of await db.all(
            "SELECT `hash`, `time` FROM `docker_images` WHERE `project`=? AND `tag`=? ORDER BY `time` DESC LIMIT 1",
            image,
            reference,
        )) {
            hash = row.hash;
        }
        return { image, hash };
    }

    deployServiceJob(
        client: WebClient,
        host: HostClient,
        description: string,
        docker_auth: string,
        image: string | null,
        extra_env: { [key: string]: string },
        ref: Ref,
        user: string,
    ): Promise<void> {
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

    async deployServiceInner(
        client: WebClient,
        ref: Ref,
        hostIdentifier: string | number,
        descriptionTemplate: string,
        imageId: string | null,
        image: string | null,
        hash: string | null,
        project: string | null,
        doTemplate: boolean,
    ) {
        try {
            console.log("service deploy start", { ref: ref });
            let host: HostClient | null = null;
            for (const id in hostClients.hostClients) {
                const cl = hostClients.hostClients[id];
                if (cl.hostname === hostIdentifier || cl.id === hostIdentifier) host = cl;
            }
            const user = nullCheck(client.auth.user, "Missing user");
            if (!host || !host.id) {
                client.sendMessage({
                    type: ACTION.DockerDeployDone,
                    ref,
                    status: false,
                    message: "Invalid hostname or host is not up",
                });
                return;
            }

            const res = await db.getHostVariables(host.id);
            if (!res) {
                client.sendMessage({
                    type: ACTION.DockerDeployDone,
                    ref,
                    status: false,
                    message: "Could not find root or host",
                });
                return;
            }
            const [hostInfo, variables] = res;

            for (let i = 0; i < 10; ++i)
                variables[`token_${i}`] = crypto.randomBytes(24).toString("base64url");

            const extraEnv: { [key: string]: string } = {};

            if (descriptionTemplate.includes("ssl_service")) {
                variables.ca_pem = "TEMP";
                variables.ssl_key = "TEMP";
                variables.ssl_pem = "TEMP";
                const description_str = doTemplate
                    ? Mustache.render(descriptionTemplate, variables)
                    : descriptionTemplate;
                const description = parse(description_str);

                let ssl_subcerts: string[];
                if (description.ssl_subcerts) {
                    if (Array.isArray(description.ssl_subcerts)) {
                        ssl_subcerts = description.ssl_subcerts.map((v: string) => v.trim());
                    } else {
                        ssl_subcerts = [description.ssl_subcerts.trim()];
                    }
                } else {
                    ssl_subcerts = [];
                }

                if (description.ssl_service && description.ssl_identity) {
                    await this.ensure_ca();
                    const my_key = await serverRs.crtGenerateKey();
                    const my_srs = await serverRs.crtGenerateSrs(
                        my_key,
                        `${description.ssl_identity}.${description.ssl_service}`,
                    );
                    if (!this.ca_key || !this.ca_crt) throw Error("Logic error");

                    let ssl_subcerts: string[];
                    if (description.ssl_subcert) {
                        if (Array.isArray(description.ssl_subcert)) {
                            ssl_subcerts = description.ssl_subcert.map((v: string) => v.trim());
                        } else {
                            ssl_subcerts = [description.ssl_subcert.trim()];
                        }
                    } else {
                        ssl_subcerts = [];
                    }
                    const my_crt = await serverRs.crtGenerateCrt(
                        this.ca_key,
                        this.ca_crt,
                        my_srs,
                        ssl_subcerts,
                        999,
                    );
                    variables.ca_pem = serverRs.crtStrip(this.ca_crt);
                    variables.ssl_key = serverRs.crtStrip(my_key);
                    variables.ssl_pem = serverRs.crtStrip(my_crt);
                    extraEnv.CA_PEM = variables.ca_pem;
                    extraEnv[`${description.ssl_service.toUpperCase()}_KEY`] = variables.ssl_key;
                    extraEnv[`${description.ssl_service.toUpperCase()}_PEM`] = variables.ssl_pem;
                } else {
                    // biome-ignore lint/performance/noDelete: Does not type check
                    delete variables.ca_pem;
                    // biome-ignore lint/performance/noDelete: Does not type check
                    delete variables.ssl_key;
                    // biome-ignore lint/performance/noDelete: Does not type check
                    delete variables.ssl_pem;
                }
            }

            const description_str = doTemplate
                ? Mustache.render(descriptionTemplate, variables)
                : descriptionTemplate;
            const description = parse(description_str);
            const name = description.name;

            if (project != null) {
            } else if (imageId) {
                const p = await this.findImage(imageId);
                if (!p.hash) {
                    client.sendMessage({
                        type: ACTION.DockerDeployDone,
                        ref,
                        status: false,
                        message: "Could not find image to deploy",
                    });
                    return;
                }
                project = p.image;
                hash = p.hash;
                image = `${project}@${hash}`;
                if (description.project && description.project !== project) {
                    throw Error("Project and image does not match");
                }
            } else {
                if (!description.project) throw Error("Missing project in description");
                project = description.project;
                hash = null;
                image = null;
            }
            if (project == null) throw Error("Logic error");

            if (hash) extraEnv.DOCKER_HASH = hash;

            const now = (Date.now() / 1000) | 0;
            const session = crypto.randomBytes(64).toString("hex");
            try {
                await db.run(
                    "INSERT INTO `sessions` (`user`,`host`,`pwd`,`otp`, `sid`) VALUES (?, ?, ?, ?, ?)",
                    "docker_client",
                    "",
                    now,
                    now,
                    session,
                );

                await this.deployServiceJob(
                    client,
                    host,
                    description_str,
                    Buffer.from(`docker_client:${session}`).toString("base64"),
                    image,
                    extraEnv,
                    ref,
                    user,
                );

                const id = this.idc++;
                const o: DeploymentInfo = {
                    restore: null,
                    host: host.id,
                    image: project,
                    container: name,
                    hash: hash,
                    user,
                    config: "",
                    timeout: undefined,
                    start: now,
                    end: null,
                    id,
                    setup: null,
                    postSetup: null,
                    deploymentTimeout: 0,
                    softTakeover: null,
                    startMagic: null,
                    usePodman: null,
                    stopTimeout: 0,
                    userService: false,
                    deployUser: null,
                    serviceFile: null,
                    description: description_str,
                };

                const oldDeploy = await db.get(
                    "SELECT `id`, `endTime` FROM `docker_deployments` WHERE `host`=? AND `project`=? AND `container`=? ORDER BY `startTime` DESC LIMIT 1",
                    host.id,
                    project,
                    name,
                );
                if (oldDeploy && !oldDeploy.endTime)
                    await db.run(
                        "UPDATE `docker_deployments` SET `endTime` = ? WHERE `id`=?",
                        o.start,
                        oldDeploy.id,
                    );
                o.id = await db.insert(
                    "INSERT INTO `docker_deployments` (" +
                        "`project`, `container`, `host`, `startTime`, `hash`, `user`, `description`) " +
                        "VALUES (?, ?, ?, ?, ?, ?, ?)",
                    o.image,
                    o.container,
                    o.host,
                    o.start,
                    o.hash,
                    o.user,
                    o.description,
                );
                client.sendMessage({
                    type: ACTION.DockerDeployDone,
                    ref,
                    status: true,
                    message: "Success",
                    id: o.id,
                });
                await this.broadcastDeploymentChange(o);
            } finally {
                await db.run(
                    "DELETE FROM `sessions` WHERE `user`=? AND `sid`=?",
                    "docker_client",
                    session,
                );
            }
        } catch (e) {
            client.sendMessage({
                type: ACTION.DockerDeployDone,
                ref,
                status: false,
                message: "Deployment failed ",
            });
            console.error("Service deployment failed", e);
        }
    }

    async redeployService(client: WebClient, act: IServiceRedeployStart) {
        const deploymentRow = await db.get(
            "SELECT * FROM `docker_deployments` WHERE `id`=?",
            act.deploymentId,
        );
        if (!deploymentRow) {
            client.sendMessage({
                type: ACTION.DockerDeployDone,
                ref: act.ref,
                status: false,
                message: "Could not find deployment",
            });
            return;
        }
        const description = deploymentRow.description;
        if (!description) {
            client.sendMessage({
                type: ACTION.DockerDeployDone,
                ref: act.ref,
                status: false,
                message: "Not an service deployment",
            });
            return;
        }

        await this.deployServiceInner(
            client,
            act.ref,
            deploymentRow.host,
            description,
            null,
            deploymentRow.hash ? `${deploymentRow.project}@${deploymentRow.hash}` : null,
            deploymentRow.hash,
            deploymentRow.project,
            false,
        );
    }

    async deployService(client: WebClient, act: IServiceDeployStart) {
        await this.deployServiceInner(
            client,
            act.ref,
            act.host,
            act.description,
            act.image ?? null,
            null,
            null,
            null,
            true,
        );
    }

    async getTagsByHash(hashes: string[]) {
        const placeholders: string[] = [];
        for (const _ of hashes) placeholders.push("?");
        const tagByHash: { [hash: string]: DockerImageTag } = {};
        for (const row of await db.all(
            `SELECT \`id\`, \`hash\`, \`time\`, \`project\`, \`user\`, \`tag\`, \`pin\`, \`labels\`, \`removed\` FROM \`docker_images\` WHERE \`hash\` IN (${placeholders.join(",")})`,
            ...hashes,
        )) {
            tagByHash[row.hash] = {
                id: row.id,
                image: row.project,
                hash: row.hash,
                tag: row.tag,
                user: row.user,
                time: row.time,
                pin: row.pin,
                labels: JSON.parse(row.labels || "{}"),
                removed: row.removed,
            };
        }
        return tagByHash;
    }

    async listImageByHash(client: WebClient, act: IDockerListImageByHash) {
        const res: IDockerListImageByHashRes = {
            type: ACTION.DockerListImageByHashRes,
            ref: act.ref,
            tags: {},
        };
        try {
            res.tags = await this.getTagsByHash(act.hash);
        } finally {
            client.sendMessage(res);
        }
    }

    async listDeployments(client: WebClient, act: IDockerListDeployments) {
        const res: IDockerListDeploymentsRes = {
            type: ACTION.DockerListDeploymentsRes,
            ref: act.ref,
            deployments: [],
        };
        try {
            const hashes: string[] = [];
            for (const row of await db.all(
                "SELECT * FROM `docker_deployments` WHERE `id` IN (SELECT MAX(`id`) FROM `docker_deployments` GROUP BY `host`, `project`, `container`)",
            )) {
                if (act.host && row.host !== act.host) continue;
                if (act.image && row.project !== act.image) continue;
                hashes.push(row.hash);
                res.deployments.push({
                    id: row.id,
                    image: row.project,
                    hash: row.hash,
                    name: row.container,
                    host: row.host,
                    start: row.startTime,
                    end: row.endTime,
                    user: row.user,
                    state: this.getContainerState(row.host, row.container),
                    config: row.config,
                    timeout: row.timeout,
                    usePodman: !!row.usePodman,
                    service: !!row.description,
                });
            }
            const tagByHash = await this.getTagsByHash(hashes);
            for (const deployment of res.deployments) {
                deployment.imageInfo = deployment.hash ? tagByHash[deployment.hash] : undefined;
            }
        } finally {
            client.sendMessage(res);
        }
    }

    async listImageTags(
        client: WebClient,
        act: IDockerListImageTags,
        maxRemovedAge: number = 14 * 24 * 60 * 60,
    ) {
        const res: IDockerListImageTagsRes = {
            type: ACTION.DockerListImageTagsRes,
            ref: act.ref,
            tags: [],
            pinnedImageTags: [],
        };
        try {
            for (const row of await db.all(
                "SELECT `id`, `hash`, `time`, `project`, `user`, `tag`, `pin`, `labels`, `removed` FROM `docker_images` WHERE `id` IN (SELECT MAX(`id`) FROM `docker_images` GROUP BY `project`, `tag`) AND (`removed` > ? OR `removed` IS NULL)",
                +new Date() / 1000 - maxRemovedAge,
            ))
                res.tags.push({
                    id: row.id,
                    image: row.project,
                    hash: row.hash,
                    tag: row.tag,
                    user: row.user,
                    time: row.time,
                    pin: row.pin,
                    labels: JSON.parse(row.labels || "{}"),
                    removed: row.removed,
                });
            for (const row of await db.all("SELECT `project`, `tag` FROM `docker_image_tag_pins`"))
                nullCheck(res.pinnedImageTags).push({
                    image: row.project,
                    tag: row.tag,
                });
        } finally {
            client.sendMessage(res);
        }
    }

    async listDeploymentHistory(client: WebClient, act: IDockerListDeploymentHistory) {
        const res: IDockerListDeploymentHistoryRes = {
            type: ACTION.DockerListDeploymentHistoryRes,
            host: act.host,
            name: act.name,
            ref: act.ref,
            deployments: [],
        };
        try {
            const hashes: string[] = [];
            for (const row of await db.all(
                "SELECT * FROM `docker_deployments` WHERE `host`=? AND `container` = ?",
                act.host,
                act.name,
            )) {
                hashes.push(row.hash);
                res.deployments.push({
                    id: row.id,
                    image: row.project,
                    hash: row.hash,
                    name: row.container,
                    host: row.host,
                    start: row.startTime,
                    end: row.endTime,
                    user: row.user,
                    state: row.endTime
                        ? undefined
                        : this.getContainerState(row.host, row.container),
                    config: row.config,
                    timeout: row.timeout,
                    usePodman: !!row.usePodman,
                    service: !!row.description,
                });
            }
            const tagByHash = await this.getTagsByHash(hashes);
            for (const deployment of res.deployments) {
                deployment.imageInfo = deployment.hash ? tagByHash[deployment.hash] : undefined;
            }
        } finally {
            client.sendMessage(res);
        }
    }

    async listImageTagHistory(client: WebClient, act: IDockerListImageTagHistory) {
        const res: IDockerListImageTagHistoryRes = {
            type: ACTION.DockerListImageTagHistoryRes,
            ref: act.ref,
            images: [],
            image: act.image,
            tag: act.tag,
        };
        try {
            for (const row of await db.all(
                "SELECT `id`, `hash`, `time`, `project`, `user`, `tag`, `pin`, `labels`, `removed` FROM `docker_images` WHERE `tag` = ? AND `project`= ?",
                act.tag,
                act.image,
            ))
                res.images.push({
                    id: row.id,
                    image: row.project,
                    hash: row.hash,
                    tag: row.tag,
                    user: row.user,
                    time: row.time,
                    pin: row.pin,
                    labels: JSON.parse(row.labels || "{}"),
                    removed: row.removed,
                });
        } finally {
            client.sendMessage(res);
        }
    }

    async imageSetPin(client: WebClient, act: IDockerImageSetPin) {
        await db.run("UPDATE `docker_images` SET pin=? WHERE `id`=?", act.pin ? 1 : 0, act.id);
        const res: IDockerImageTagsCharged = {
            type: ACTION.DockerListImageTagsChanged,
            changed: [],
            removed: [],
        };

        for (const row of await db.all(
            "SELECT `id`, `hash`, `time`, `project`, `user`, `tag`, `pin`, `labels`, `removed` FROM `docker_images` WHERE `id`=?",
            act.id,
        ))
            res.changed.push({
                id: row.id,
                image: row.project,
                hash: row.hash,
                tag: row.tag,
                user: row.user,
                time: row.time,
                pin: row.pin,
                labels: JSON.parse(row.labels || "{}"),
                removed: row.removed,
            });
        webClients.broadcast(res);
    }

    async imageTagSetPin(client: WebClient, act: IDockerImageTagSetPin) {
        if (act.pin)
            await db.run(
                "INSERT INTO `docker_image_tag_pins` (`project`, `tag`) VALUES (?, ?)",
                act.image,
                act.tag,
            );
        else
            await db.run(
                "DELETE FROM `docker_image_tag_pins` WHERE `project`=? AND `tag`=?",
                act.image,
                act.tag,
            );
        const res: IDockerImageTagsCharged = {
            type: ACTION.DockerListImageTagsChanged,
            changed: [],
            removed: [],
            imageTagPinChanged: [{ image: act.image, tag: act.tag, pin: act.pin }],
        };
        webClients.broadcast(res);
    }

    async broadcastDeploymentChange(o: DeploymentInfo) {
        const imageInfo: DockerImageTag | undefined = o.hash
            ? (await this.getTagsByHash([o.hash]))[o.hash]
            : undefined;
        const msg: IAction = {
            type: ACTION.DockerDeploymentsChanged,
            changed: [
                {
                    id: nullCheck(o.id),
                    image: o.image,
                    imageInfo: imageInfo,
                    hash: o.hash || undefined,
                    name: o.container,
                    host: o.host,
                    start: o.start,
                    end: o.end,
                    user: o.user,
                    state: this.getContainerState(o.host, o.container),
                    config: o.config,
                    timeout: o.deploymentTimeout,
                    usePodman: !!o.usePodman,
                    service: !!o.description,
                },
            ],
            removed: [],
        };
        webClients.broadcast(msg);
    }

    async handleDeployment(o: DeploymentInfo) {
        if (o.restore) {
            await db.run(
                "DELETE FROM docker_deployments` WHERE `id` > ? AND `host`=? AND `project`=? AND `container`=?",
                o.restore,
                o.host,
                o.image,
                o.container,
            );
            await db.run(
                "UPDATE `docker_deployments` SET `endTime` = null WHERE `id`=?",
                o.restore,
            );
            o.id = o.restore;
        } else {
            const oldDeploy = await db.get(
                "SELECT `id`, `endTime` FROM `docker_deployments` WHERE `host`=? AND `project`=? AND `container`=? ORDER BY `startTime` DESC LIMIT 1",
                o.host,
                o.image,
                o.container,
            );
            if (oldDeploy && !oldDeploy.endTime)
                await db.run(
                    "UPDATE `docker_deployments` SET `endTime` = ? WHERE `id`=?",
                    o.start,
                    oldDeploy.id,
                );
            o.id = await db.insert(
                "INSERT INTO `docker_deployments` (" +
                    "`project`, `container`, `host`, `startTime`, `config`, `setup`, `hash`, `user`, `postSetup`, `timeout`, `softTakeover`, `startMagic`, `stopTimeout`, `usePodman`, `userService`, `deployUser`, `serviceFile`) " +
                    "VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)",
                o.image,
                o.container,
                o.host,
                o.start,
                o.config,
                o.setup,
                o.hash,
                o.user,
                o.postSetup,
                o.timeout,
                o.softTakeover,
                o.startMagic,
                o.stopTimeout,
                o.usePodman,
                o.userService,
                o.deployUser,
                o.serviceFile,
            );
        }
        await this.broadcastDeploymentChange(o);
    }

    async handleDeploymentTimeout(id: number) {
        try {
            const o = this.delayedDeploymentInformations.get(id);
            if (!o) return;
            console.log("We did an deployment but we did not hear anything from the client");
            o.timeout = null;
            this.delayedDeploymentInformations.delete(id);
            await this.handleDeployment(o);
        } catch (e) {
            console.log("Uncaught exception in handleDeploymentTimeout", e);
        }
    }

    async handleHostDockerContainers(host: HostClient, obj: IHostContainers) {
        try {
            if (!host.id) throw Error("Missing host id");
            const containers = getOrInsert(this.hostContainers, host.id, () => new Map());
            if (obj.full) containers.clear();
            const images = this.hostImages.get(host.id);
            if (!images) {
                console.error("No images for host", host.id);
                return;
            }

            const now = (Date.now() / 1000) | 0;

            for (const id of obj.delete) {
                const c = containers.get(id);
                if (!c) continue;
                containers.delete(id);
                const container = c.name.substr(1); //For some reason there is a slash in the string??
                const row = await db.get(
                    "SELECT * FROM `docker_deployments` WHERE `host`=? AND `container`=? ORDER BY `startTime` DESC LIMIT 1",
                    container,
                );
                if (!row || !row.project) continue;
                await db.run(
                    "UPDATE `docker_deployments` SET `endTime`=? WHERE `id`=?",
                    now,
                    row.id,
                );
                await this.broadcastDeploymentChange({
                    id: row.id,
                    host: host.id,
                    restore: null,
                    image: row.project,
                    container,
                    hash: row.hash,
                    user: row.user,
                    config: row.config,
                    setup: row.setup,
                    postSetup: row.postSetup,
                    timeout: null,
                    start: row.start,
                    end: now,
                    deploymentTimeout: row.timeout,
                    softTakeover: !!row.softTakeover,
                    startMagic: row.startMagic,
                    usePodman: !!row.usePodman,
                    stopTimeout: row.stopTimeout,
                    userService: !!row.userService,
                    deployUser: row.deployUser,
                    serviceFile: row.serviceFile,
                    description: null,
                });
            }

            for (const u of obj.update) {
                containers.set(u.id, u);
                const image = images.get(u.image);
                if (!image) {
                    //console.error("Could not find image for container")
                    continue;
                }
                const container = u.name.substr(1); //For some reason there is a slash in the string??
                const row = await db.get(
                    "SELECT * FROM `docker_deployments` WHERE `host`=? AND `container`=? ORDER BY `startTime` DESC LIMIT 1",
                    host.id,
                    container,
                );
                if (!row || !row.project) {
                    //console.log("Could not find project for container", container, row);
                    continue;
                }
                const project = row.project;

                let deploymentInfo: DeploymentInfo | null = null;
                let keep = false;
                for (const [id, info] of this.delayedDeploymentInformations) {
                    if (
                        info.host !== host.id ||
                        info.container !== container ||
                        info.image !== project
                    )
                        continue;
                    let match = false;
                    for (const d of image.digests)
                        if (info.hash === d || info.hash === d.split("@")[1]) match = true;
                    if (match) {
                        deploymentInfo = info;
                        this.delayedDeploymentInformations.delete(id);
                        break;
                    }
                }

                if (deploymentInfo) {
                    if (deploymentInfo.timeout) clearTimeout(deploymentInfo.timeout);
                } else {
                    for (const d of image.digests) {
                        if (row.hash === d || row.hash === d.split("@")[1]) keep = true;
                    }
                    if (row.endTime) keep = false;

                    deploymentInfo = {
                        host: host.id,
                        restore: null,
                        image: project,
                        container,
                        hash: keep ? row.hash : image.digests[0].split("@")[1],
                        user: keep ? row.user : null,
                        config: keep ? row.config : null,
                        setup: keep ? row.setup : null,
                        postSetup: keep ? row.postSetup : null,
                        timeout: null,
                        start: keep ? row.startTime : now,
                        end: null,
                        id: keep ? row.id : null,
                        deploymentTimeout: row.timeout,
                        softTakeover: keep ? row.softTakeover : false,
                        startMagic: keep ? row.startMagic : null,
                        usePodman: keep ? !!row.usePodman : false,
                        stopTimeout: row.stopTimeout,
                        userService: keep ? !!row.userService : false,
                        deployUser: keep ? row.deployUser : null,
                        serviceFile: keep ? row.serviceFile : null,
                        description: null,
                    };
                }
                if (!keep) await this.handleDeployment(deploymentInfo);
                else await this.broadcastDeploymentChange(deploymentInfo);
            }
        } catch (e) {
            console.log(e);
            console.log("Uncaught exception in handleHostDockerContainers", e);
        }
    }

    async forgetContainer(wc: WebClient, hostId: number, container: string) {
        const host = hostClients.hostClients[hostId];
        if (!host) return;
        await db.run(
            "DELETE FROM `docker_deployments` WHERE `host`=? AND `container`=?",
            hostId,
            container,
        );
        const msg: IAction = {
            type: ACTION.DockerDeploymentsChanged,
            changed: [],
            removed: [{ host: hostId, name: container }],
        };
        webClients.broadcast(msg);
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
