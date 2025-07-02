import subprocess
import socket
import json
from typing import Any

ufw_status: str | None = None
try:
    ufw_status = subprocess.check_output(["ufw", "status"], encoding='utf-8')
except Exception as e:
    firewall = "no_ufw_status"
    ufw_status = None
else:
    lines = iter(ufw_status.splitlines())
    if next(lines) != "Status: active":
        firewall = "inactive"
    else:
        firewall = "ok"
        next(lines)
        next(lines)
        next(lines)
        for line in lines:
            if not line:
                continue
            parts = line.rsplit(" # ", 1)
            if len(parts) != 2 or not parts[1].startswith("simple_admin_"):
                firewall = "dirty"

distribution = None
with open("/etc/lsb-release", "r") as f:
    for line in f:
        lp = line.strip().split("=", 2)
        match lp:
            case ["DISTRIB_DESCRIPTION", s]:
                distribution = s[1:-1]

try:
    uname = subprocess.check_output(["uname", "-a"], encoding='utf-8').strip()
except Exception as e:
    uname = None

data_encrypted: bool | None = None
root_encrypted: bool | None = None

try:
    lsblk_out = json.loads(subprocess.check_output(["/usr/bin/lsblk", "--json"], encoding='utf-8'))
    def visit_block_dev(dev: Any, encrypted: bool) -> None:
        global data_encrypted, root_encrypted
        match dev["type"]:
            case "lvm":
                pass
            case "crypt":
                encrypted = True
            case _:
                encrypted = False
        for mount_point in dev.get("mountpoints", []):
            match mount_point:
                case "/":
                    root_encrypted = encrypted
                case "/data":
                    data_encrypted = encrypted
        for child in dev.get("children", []):
            visit_block_dev(child, encrypted)
    for dev in lsblk_out['blockdevices']:
        visit_block_dev(dev, False)
except Exception as e:
    pass


status = {
    "firewall": firewall,
    "hostname": socket.gethostname(),
    "ufw_status": ufw_status,
    "distribution": distribution,
    "uname": uname,
    "data_encrypted": data_encrypted,
    "root_encrypted": root_encrypted,
}
print(json.dumps(status, indent=2))