#!/usr/bin/env python3

import argparse, getpass, os, json, asyncio, subprocess, base64, socket, random
import websockets
from tempfile import NamedTemporaryFile

remote = json.load(open("/etc/simpleadmin_client.json", "r"))['server_host']

class Connection:
    def __init__(self):
        self.socket = None
        self.cookieFile = os.path.expanduser("~/.cache/simple_admin_cookie")
        self.pwd = False
        self.otp = False
        
    async def setup(self, requireAuth=True):
        self.socket = await websockets.connect('wss://%s/sysadmin'%remote)

        session = ""
        if os.path.exists(self.cookieFile):
            with open(self.cookieFile, 'r') as f:
                session = f.read()
        
        await self.socket.send(json.dumps({'type':'RequestAuthStatus', 'session': session}))

        res = json.loads(await self.socket.recv())
        if res['type'] != "AuthStatus":
            raise Exception("Bad result type")

        self.pwd = res['pwd']
        self.otp = res['otp']
        if requireAuth and not (self.pwd and self.otp):
            raise Exception("Authentication required")
        
async def auth(user):
    c = Connection()
    await c.setup(requireAuth=False)
    if c.pwd and c.otp:
        print("Allready authenticated")
        return

    pwd = getpass.getpass()
    if not pwd:
        return
    
    otp = None
    if not c.otp:
        otp = getpass.getpass("One time password: ")
        if not otp:
            return
        
    await c.socket.send(json.dumps({'type': 'Login', 'user': user, 'pwd': pwd, 'otp': otp}))
    res = json.loads(await c.socket.recv())
    if res['type'] != "AuthStatus":
        raise Exception("Bad result type")
    if not res['session'] or not res['pwd'] or not res['otp']:
        raise Exception("Could not authenticate: " + res['message'])

    with open(c.cookieFile, 'w') as f:
        f.write(res['session'])

    dockerconf = {}
    dockerconfpath = os.path.expanduser("~/.docker/config.json")
    try:
        dockerconf = json.load(open(dockerconfpath, "r"), )
    except:
        pass
    if not 'auths' in dockerconf:
        dockerconf['auths'] = {}
    dockerconf['auths'][remote] = {'auth': base64.b64encode(("%s:%s"%(user, res['session'])).encode("ascii")).decode('ascii')}
    os.makedirs(os.path.expanduser("~/.docker"), exist_ok=True)
    with open(dockerconfpath, "w") as f:
        json.dump(dockerconf, f, indent=4)
        
    c.pwd = True
    c.otp = True
    print("Sucessfully authenticated")
    
async def deauth(full):
    c = Connection()
    await c.setup(requireAuth=False)
    if c.pwd and c.otp:
        await c.socket.send(json.dumps({'type': 'LogOut', 'forgetPwd': True, 'forgetOtp': full}))
        
    if full and os.path.exists(c.cookieFile):
        os.unlink(c.cookieFile)

async def deploy(server, image, container=None, config=None, restore_on_failure=True):
    c = Connection()
    await c.setup(requireAuth=True)
    ref = random.randint(0, 2**48-1)
    await c.socket.send(json.dumps({"type": "DockerDeployStart", "host": server, "image": image, "config": config, "restoreOnFailure": restore_on_failure, "ref": ref, "container": container}))

    while True:
        res = json.loads(await c.socket.recv())
        if res['type'] == 'DockerDeployLog' and res['ref'] == ref:
            print(res['message'])
        if res['type'] == 'DockerDeployEnd' and res['ref'] == ref:
            print(res['message'])
            break

async def edit(path):
    c = Connection()
    await c.setup(requireAuth=True)
    ref = random.randint(0, 2**48-1)
    await c.socket.send(json.dumps({"type": "GetObjectId", "path": path, "ref": ref}))

    id = None
    while True:
        res = json.loads(await c.socket.recv())
        if res['type'] == 'GetObjectIdRes' and res['ref'] == ref:
            id = res['id']
            break

    if not id:
        print("Object not found")
        return

    await c.socket.send(json.dumps({"type": "FetchObject", "id": id}))
    res = None
    while True:
        res = json.loads(await c.socket.recv())
        if res['type'] == 'ObjectChanged' and res['id'] == id:
            break
    cur = res['object'][-1]

    ext = ".json"
    path = "content"
    if cur['type'] == 10226:
        ext = ".txt"
        path = 'content.content'

    with NamedTemporaryFile(mode='w', suffix=ext) as f:
        w = cur
        for n in path.split('.')[:-1]:
            w = w[n]
        t = path.split('.')[-1]
        if isinstance(w[t], str):
            f.write(w[t])
        else:
            f.write(json.dumps(w[t], indent=4))
        f.flush()
        proc = await asyncio.create_subprocess_exec('vi', f.name)
        if await proc.wait() != 0:
            return
        with open(f.name, mode="r") as f2:
            if isinstance(w[t], str):
                w[t] = f2.read()
            else:
                w[t] = json.loads(f2.read())

    await c.socket.send(json.dumps({'type': 'SaveObject', 'id': id, 'obj': cur}));

    while True:
        res = json.loads(await c.socket.recv())
        if res['type'] == 'ObjectChanged' and res['id'] == id:
            print("Save")
            break

def main():
    parser = argparse.ArgumentParser(prog='simpleadmin')
    subparsers = parser.add_subparsers(help='commands', dest="command")
    
    parser_auth = subparsers.add_parser('auth', help='Authenticate user', description="Authenticate your user")
    parser_auth.add_argument('-u, --user', metavar="USER", dest="user", type=str, default=getpass.getuser(), help="the user to log in as")
    
    parser_deauth = subparsers.add_parser('deauth', help='Deauthenticate user', description="Deauthenticate your user")
    parser_deauth.add_argument('-f, --full', dest='full', action='store_true', help="Forget two factor authentication")

    parser_deploy = subparsers.add_parser('dockerDeploy', help='Deploy', description="Deploy image on server")
    parser_deploy.add_argument('server', help="The server to deploy on")
    parser_deploy.add_argument('image', help="The image to deploy")
    parser_deploy.add_argument('-s, --container', dest='container', help="The container to deloy to", default=None)
    parser_deploy.add_argument('-c, --config', dest='config', help="The config to use", default=None)
    parser_deploy.add_argument('--no-restore-on-failure', dest='restore_on_failure', action='store_false')


    parser_deploy = subparsers.add_parser('edit', help='Edit', description="Edit an object")
    parser_deploy.add_argument('object', help="The server to deploy on")

    args = parser.parse_args()
    if args.command == 'auth':
        asyncio.get_event_loop().run_until_complete(auth(args.user))
    elif args.command == 'deauth':
        asyncio.get_event_loop().run_until_complete(deauth(args.full))
    elif args.command == 'dockerDeploy':
        asyncio.get_event_loop().run_until_complete(deploy(args.server, args.image, args.container, args.config, args.restore_on_failure))
    elif args.command == 'edit':
        asyncio.get_event_loop().run_until_complete(edit(args.object))
    else:
        print("No command specified")

if __name__ == '__main__':
    main()
