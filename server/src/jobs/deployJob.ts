import type { HostClient } from "../hostclient";
import { deployment } from "../instances";
import { Job } from "../job";
import type * as message from "../messages";

export class DeployJob extends Job {
    stdoutPart = "";
    stderrPart = "";

    constructor(
        hostClient: HostClient,
        public script: string,
        public content: any,
        public cb: (ok: boolean, code: number) => void,
    ) {
        super(hostClient, null, hostClient);
        const msg: message.RunScript = {
            type: "run_script",
            id: this.id,
            name: "deploy.py",
            interperter: "/usr/bin/python3",
            content: script,
            args: [],
            stdin_type: "given_json",
            input_json: content,
            stdout_type: "binary",
            stderr_type: "binary",
        };
        hostClient.sendMessage(msg);
        this.running = true;
    }

    handleMessage(obj: message.Incomming) {
        switch (obj.type) {
            case "data":
                if (obj.source === "stdout" || obj.source === "stderr")
                    deployment.addLog(Buffer.from(obj.data, "base64").toString("binary"));
                break;
            case "success":
                this.cb(true, obj.code);
                break;
            case "failure":
                this.cb(false, -1);
                break;
        }
        super.handleMessage(obj);
    }
}
