import * as express from 'express';
import { log } from 'winston';
import * as fs from 'fs';
import * as uuid from 'uuid/v4';
import * as crypto from 'crypto';
import { Stream, Writable } from 'stream';
import { db } from './instances';

const docker_upload_path = "/var/tmp/simpleadmin_docker_uploads/";
const docker_blobs_path = "/var/simpleadmin_docker_blobs/";
if (!fs.existsSync(docker_upload_path))
    fs.mkdirSync(docker_upload_path,  0o700);
if (!fs.existsSync(docker_blobs_path))
    fs.mkdirSync(docker_blobs_path,  0o700);

class Count extends Stream.Writable {
    value = 0;
    _write(chunk: any, enc: string, next: (err?: Error) => void) {
        this.value += chunk.length;
        next();
    }
};

class Upload {
    count: Count;
    hash: crypto.Hash;
    writer: fs.WriteStream;
    p: Writable;
    constructor(public un:string) {
        this.hash = crypto.createHash('sha256');
        this.count = new Count;
        this.writer = fs.createWriteStream(docker_upload_path+un);
    }
};

class Docker {
    activeUploads = new Map<string, Upload>();

    async checkAuth(req: express.Request, res: express.Response, readOnly: boolean ) {
        if (req.headers['authorization']) {
            const auth = Buffer.from(req.headers['authorization'].substr(6), 'base64').toString('utf8');
            const [user, cookie] = auth.split(":");
            let row;
            try {
                row = await db.get("SELECT `pwd`, `otp` FROM `sessions` WHERE `sid`=? AND `host`=? AND `user`=?", cookie, req.ip, user);
            } catch (e) {
                row = undefined;
            }
            const now = +new Date() / 1000;
            if (row && row['pwd'] +  24 * 60 * 60 > now && row['otp'] + 64 * 24 * 60 * 60> now)
                return false;

            res.status(404)
            .header("WWW-Authenticate", 'Basic realm="User Visible Realm", charset="UTF-8')
            .header('Content-Type', 'application/json; charset=utf-8')
            
            .json({errors: [{'code':'DENIED', 'message': row?'token expired':'NO', 'detail': 'null'}]}).end();
            return true;
        }

        res.status(401)
        .header("WWW-Authenticate", 'Basic realm="User Visible Realm", charset="UTF-8')
        .header('Content-Type', 'application/json; charset=utf-8')
        
        .json({errors: [{'code':'UNAUTHORIZED', 'message': 'authentication required', 'detail': 'null'}]}).end();
        return true;
    }

    async get(req: express.Request, res: express.Response) {
        res.header('Docker-Distribution-Api-Version', 'registry/2.0');
        if (await this.checkAuth(req, res, true)) return;

        const p = req.url.split("?")[0].split("/");

        // GET /v2/ Base Check that the endpoint implements Docker Registry API V2.
        if (req.url == "/v2/") {
            res.status(200).end();            
            return;            
        }

        // GET /v2/<name>/blobs/<digest> Blob Retrieve the blob from the registry identified by digest. A HEAD request can also be issued to this endpoint to obtain resource information without receiving all data.
        if (p.length == 5 && p[0] == "" && p[1] == 'v2' && p[3] == "blobs") {
            const b = p[4];
            const re = /sha256:[0-9A-Fa-f]{64}/g;
            if (!re.test(b)) {
                log('error', "Docker get blob: bad name", b);
                res.status(400).end();
                return;
            }
            const path = docker_blobs_path+b;
            if (!fs.existsSync(path)) {
                log('error', "Docker get blob: found ", b);
                res.status(404).end();
                return;
            }
            log('info', "Docker get blob", b);
            res.sendFile(path);
            return;
        }

        // GET 	/v2/<name>/manifests/<reference> Manifest Fetch the manifest identified by name and reference where reference can be a tag or digest. A HEAD request can also be issued to this endpoint to obtain resource information without receiving all data.
        if (p.length == 5 && p[0] == "" && p[1] == 'v2' && p[3] == "manifests") {
            const row = await db.get("SELECT `manifest`, `hash` FROM `docker_images` WHERE `project`=? AND (`tag`=? OR `hash`=?)", p[2], p[4], p[4]);
            if (!row) {
                log('error', "Docker get manifest: not found", p[2], [4])
                res.status(404).end();
                return;
            }
            log('info', "Docker get manifest", row['hash']);
            res.header("Content-Type", "application/vnd.docker.distribution.manifest.v2+json");
            res.send(row['manifest']).end();
            return;
        }

        //TODO
        // GET /v2/<name>/tags/list Tags Fetch the tags under the repository identified by name.
        // GET /v2/<name>/blobs/uploads/<uuid> Blob Upload Retrieve status of upload identified by uuid. The primary purpose of this endpoint is to resolve the current status of a resumable upload.
        // GET /v2/_catalog	Catalog	Retrieve a sorted, json list of repositories available in the registry.
        log('info', "Docker unhandled get", req.url, req.params);
        res.status(404).end();
    }

    handleUpload(req: express.Request, upload: Upload, final: boolean) : Promise<void> {
        //TODO read possible range parameters here
        return new Promise((resolve, reject) => {
            req.pipe(upload.count, {end: final});
            req.pipe(upload.hash, {end: final});
            req.pipe(upload.writer, {end: final});
            req.on('end', resolve);
            req.on('error', reject);
        });
    }

    async put(req: express.Request, res: express.Response) {
        res.header('Docker-Distribution-Api-Version', 'registry/2.0');
        if (await this.checkAuth(req, res, false)) return;

        const p = req.url.split("?")[0].split("/");

        // PUT /v2/<name>/blobs/uploads/<uuid> Blob Upload Complete the upload specified by uuid, optionally appending the body as the final chunk.
        if (p.length == 6 && p[1] == 'v2' && p[3] == 'blobs' && p[4] == 'uploads') {
            const un = p[5]
            if (!this.activeUploads.has(un)) {
                log('error', "Docker put blob: missing", un);
                res.status(404).end();
                return;
            }
            const u = this.activeUploads.get(un);
            await this.handleUpload(req, u, true);

            log('info', "Docker put blob", un);
            const digest = req.query.digest;
            // TODO verify digest u.hash.digest('hex'));
            fs.renameSync(docker_upload_path+un, docker_blobs_path+digest);
            res.setHeader("Location", "/v2/"+p[2]+"/blobs/"+digest);
            //res.setHeader("Range", "0-"+u.count.value);
            res.setHeader("Content-Length", "0");
            res.setHeader("Docker-Content-Digest", digest);
            res.status(204);
            res.end();
            return;
        }


        // PUT /v2/<name>/manifests/<reference> Manifest Put the manifest identified by name and reference where reference can be a tag or digest.
        if (p.length == 5 && p[0] == "" && p[1] == 'v2' && p[3] == "manifests") {
            req.setEncoding('utf-8');
            let content = "";
            req.on('data', (chunk)=>content+= chunk);

            await new Promise((acc, rej) => {
                req.on('end', acc);
                req.on('error', rej);
            });

            log('info', "Docker put manifest", p[2], p[4]);

            let cv = JSON.parse(content);
            content = JSON.stringify(cv);

            const hash = crypto.createHash("sha256");
            hash.update(content, 'utf8');
            const h = "sha256:"+hash.digest('hex');

            await db.run("DELETE FROM `docker_images` WHERE `project`=? AND `tag`=? AND `hash`=?", p[2], p[4], h);
            const id = await db.insert("INSERT INTO `docker_images` (`project`, `tag`, `manifest`, `hash`) VALUES (?, ?, ?, ?)", p[2], p[4], content, h);
            // TODO validate that we have all the parts
            res.status(201).header("Location", "/v2/"+p[2]+"/manifests/"+hash).header("Content-Length", "0").header("Docker-Content-Digest", h).end();
            return;
        }

        log('info', "Docker unhandled put", req.url);
        res.status(404).end();
    }

    async patch(req: express.Request, res: express.Response) {
        res.header('Docker-Distribution-Api-Version', 'registry/2.0');
        if (await this.checkAuth(req, res, false)) return;

        const p = req.url.split("?")[0].split("/");

        // PATCH /v2/<name>/blobs/uploads/<uuid> Blob Upload Upload a chunk of data for the specified upload.
        if (p.length == 6 && p[1] == 'v2' && p[3] == 'blobs' && p[4] == 'uploads') {
            const un = p[5];
            if (!this.activeUploads.has(un)) {
                log('info', "Docker patch blob: missing", un);
                res.status(404).end();
                return;
            }
            const u = this.activeUploads.get(un);
            await this.handleUpload(req, u, false);
            res.setHeader("Location", req.url);
            res.setHeader("Range", "0-"+u.count.value);
            res.setHeader("Content-Length", "0");
            res.setHeader("Docker-Upload-UUID", un);
            res.status(204);
            res.end();
            return;
        }
    
        log('info', "Docker unhandled patch", req.url);
        res.status(404).end();
    }

    async post(req: express.Request, res: express.Response) {
        res.header('Docker-Distribution-Api-Version', 'registry/2.0');
        if (await this.checkAuth(req, res, false)) return;

        const p = req.url.split("?")[0].split("/");

        // POST	/v2/<name>/blobs/uploads/ Initiate Blob Upload Initiate a resumable blob upload. If successful, an upload location will be provided to complete the upload. Optionally, if the digest parameter is present, the request body will be used to complete the upload in a single request.
        if (p.length >= 5 && p[1] == 'v2' && p[3] == 'blobs' && p[4] == 'uploads') {
            const u = uuid();
            this.activeUploads.set(u, new Upload(u));
            res.setHeader("Content-Length", "0");
            res.setHeader("Location", "/v2/" + p[2] + "/blobs/uploads/"+u);
            res.setHeader("Range", "0-0");
            res.setHeader("Docker-Upload-UUID", u);
            res.status(202);
            res.end();
            log('info', "Docker post", u);
            return;
        }

        log('info', "Docker unhandled post", req.url);
        res.status(404).end();
    }

    delete(req: express.Request, res: express.Response) {
        res.header('Docker-Distribution-Api-Version', 'registry/2.0');
        if (this.checkAuth(req, res, false)) return;
        // DELETE /v2/<name>/manifests/<reference> Manifest	Delete the manifest identified by name and reference. Note that a manifest can only be deleted by digest.
        // DELETE /v2/<name>/blobs/<digest> Blob Delete the blob identified by name and digest
        // DELETE /v2/<name>/blobs/<digest> Blob Delete the blob identified by name and digest   
        log('info', "Docker unhandled delete", req.url);
        res.status(404).end();
    }
}

export const docker = new Docker;