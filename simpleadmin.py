#!/usr/bin/env python3

import argparse
import asyncio
import base64
import datetime
import getpass
import itertools
import json
import os
import random
import subprocess
import time
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
        self.socket = await websockets.connect('wss://%s/sysadmin'%remote,  read_limit=2**30, max_size=2**30)

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


async def login(c, user, pwd, otp):
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

    await login(c, user, pwd, otp)
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
        proc = await asyncio.create_subprocess_exec(os.environ.get('EDITOR', 'editor'), f.name)
        if await proc.wait() != 0:
            return
        with open(f.name, mode="r") as f2:
            if isinstance(w[t], str):
                w[t] = f2.read()
            else:
                w[t] = json.loads(f2.read())

    await c.socket.send(json.dumps({'type': 'SaveObject', 'id': id, 'obj': cur}))

    while True:
        res = json.loads(await c.socket.recv())
        if res['type'] == 'ObjectChanged' and res['id'] == id:
            print("Save")
            break


def rel_time(timestamp):
    seconds = time.time() - timestamp
    x = [("days", 86400), ("hours", 3600), ("minutes", 60)]
    for k, d in x:
        v = int(seconds / d)
        if v > 0:
            return "%s %s ago" % (v, k if v > 1 else k.rstrip("s"))
    return "%s seconds ago" % int(seconds)


async def list_deployments():
    c = Connection()
    await c.setup(requireAuth=True)
    ref = random.randint(0, 2 ** 48 - 1)

    await c.socket.send(json.dumps({"type": "RequestInitialState"}))
    while True:
        res = json.loads(await c.socket.recv())
        if res["type"] == "SetInitialState":
            break
    state = res
    type_ids = {o["name"]: str(o["id"]) for o in state["objectNamesAndIds"]["1"]}
    host_names = {
        int(o["id"]): o["name"] for o in state["objectNamesAndIds"][type_ids["Host"]]
    }

    await c.socket.send(json.dumps({"type": "DockerListDeployments", "ref": ref}))
    while True:
        res = json.loads(await c.socket.recv())
        if res["type"] == "DockerListDeploymentsRes" and res["ref"] == ref:
            break
    deployments = res["deployments"]
    deployments.sort(key=lambda d: (d["image"], d["host"]))
    groups = itertools.groupby(deployments, key=lambda d: (d["image"], d["host"]))
    for (image, host_id), group in groups:
        print("\n%s on %s" % (image, host_names.get(host_id, host_id)))
        for deployment in group:
            image_info = deployment.get("imageInfo", {})
            labels = image_info.get("labels", {})
            name = deployment["name"]
            bold = "\x1b[1m"
            red = "\x1b[31m"
            green = "\x1b[32m"
            reset = "\x1b[0m"
            deploy_time = green + bold + rel_time(deployment["start"]) + reset
            status = "%s by %s" % (deploy_time, deployment["user"])
            if image_info:
                push_time = green + bold + rel_time(image_info["time"]) + reset
                push_status = "%s by %s" % (push_time, image_info["user"])
                if status != push_status:
                    status = "pushed %s, deployed %s" % (push_status, status)
            git = ""
            if labels:
                commit = labels.get("GIT_COMMIT")
                branch = labels.get("GIT_BRANCH")
                git = "%s (%s %s)%s" % (reset + green, commit, branch, reset)
            print("- %s %s%s" % (bold + red + name + reset, status, git))


class UIPortal:
    def __init__(self, loop):
        self.old = None
        self.loop = loop
        self.connections = []

    def __enter__(self):
        self.old = self.loop.widget
        return self

    def connect(self, widget, name, fn, context=None):
        import urwid as u
        self.connections.append( (widget, name, fn, context) )
        u.connect_signal(widget, name, fn, context)
        return widget

    def __exit__(self, *args):
        import urwid as u
        for (widget, name, fn, context) in self.connections:
            u.disconnect_signal(widget, name, fn, context)
        self.connections = []
        self.loop.widget = self.old

async def ui_login(loop, c):
    import urwid as u
    aloop = asyncio.get_event_loop()

    with UIPortal(loop) as portal:
        message = ""
        user = getpass.getuser()

        while True:
            f = aloop.create_future()

            class Root(u.AttrMap):
                def keypress(self, size, key):
                    if super(Dialog, self).keypress(size, key) is None:
                        return None
                    if key == 'enter':
                        f.set_result(True)
                        return None
                    if key == 'esc':
                        f.set_result(False)
                        return None
                    if key == 'tab':
                        return super(Dialog, self).keypress(size, 'down')
                    return key

            usr = u.Edit(multiline=False, caption="user: ", allow_tab=False, edit_text=user)
            pwd = u.Edit(multiline=False, caption="password: ", allow_tab=False, mask="*")
            otp = u.Edit(multiline=False, caption="one time: ", allow_tab=False) if not c.otp else None
            button = u.Button('Log in')
            portal.connect(button, 'click', lambda _: f.set_result(True))

            interior = u.Filler(u.Pile([
                u.Text('Enter username and password:'),
                u.Text(' '),
                u.AttrMap(usr, 'bg', 'focus'),
                u.AttrMap(pwd, 'bg', 'focus'),
                u.AttrMap(otp or u.Text(''), 'bg', 'focus'),
                u.Text(' '),
                u.AttrMap(u.Text(message), 'error'),
                u.Text(' '),
                u.AttrMap(button, 'button', 'focus')]))

            window = Root(u.LineBox(interior, title="Login"), 'bg')
            background = u.AttrMap(u.SolidFill(), 'back')
            topw = u.Overlay(window, background, 'center', 60, 'middle', 15)

            loop.widget = topw

            if not await f:
                return False
            try:
                user = usr.edit_text
                await login(c, user, pwd.edit_text, otp.edit_pos if otp else None)
                if c.otp and c.pwd:
                    return True
            except Exception as e:
                message = str(e)


async def ui_select_object(loop, c, state):
    with UIPortal(loop) as portal:
        import urwid as u
        aloop = asyncio.get_event_loop()
        typeNames = {int(o['id']): o['name'] for o in state['objectNamesAndIds']['1']}

        f = aloop.create_future()
        allButtons = []
        for c, v in state['objectNamesAndIds'].items():
            try:
                tn = typeNames[int(c)]
            except (ValueError, KeyError):
                continue
            for o in v:
                name = "%s: %s"%(tn, o['name'])
                allButtons.append((name, u.AttrMap(portal.connect(u.Button(name), 'click', lambda _, i=o['id']: f.set_result(i)), 'bg', 'focus')))
                
        selected = []
        class Root(u.AttrMap):
            def keypress(self, size, key):
                if super(Root, self).keypress(size, key) is None:
                    return None
                if key == 'esc':
                    f.set_result(None)
                    return None
                if key == 'enter':
                    if selected:
                        selected[0].keypress((15,), 'enter')
                    f.set_result(None)
                    return None
                if key == '/':
                    pile.focus_position = 0
                return key

        lstWalker = u.SimpleFocusListWalker([])
        def filter(pattern):
            p = pattern.lower()
            selected.clear()
            for (n, b) in allButtons:
                i = 0
                if not p:
                    selected.append(b)
                else:
                    nn = n.lower()
                    for c in nn:
                        if c != p[i]:
                            continue
                        i += 1
                        if i == len(p):
                            selected.append(b)
                            break
            lstWalker.clear()
            lstWalker.extend(selected)

        search = u.Edit()
        portal.connect(search, 'change', lambda a,b: filter(b))
        filter("")
        pile = u.Pile([
                ('pack', u.LineBox(
                    search,
                    title='filter',
                )),
                ('weight', 1, u.LineBox(
                    u.ListBox(lstWalker),
                    title='Objects'
                ))
            ])
        loop.widget = Root(pile, 'bg')
        return await f

async def ui_select_list(loop, c, current, values):
    with UIPortal(loop) as portal:
        import urwid as u
        aloop = asyncio.get_event_loop()
        f = aloop.create_future()

        class Root(u.AttrMap):
            def keypress(self, size, key):
                if super(Root, self).keypress(size, key) is None:
                    return None
                if key == 'esc':
                    f.set_result(None)
                    return None
                return key
        lv = u.SimpleFocusListWalker(
            [u.AttrMap(portal.connect(u.Button(v), 'click', lambda _,v=v: f.set_result(v)), 'bg', 'focus') for v in values]
            )
        for i in range(len(values)):
            if values[i] == current:
                lv.set_focus(i)
        window = Root(u.LineBox(u.ListBox(lv), title="Choice"), 'bg')
        loop.widget = u.Overlay(window, loop.widget, 'center', 60, 'middle', 40)
        return await f

async def ui_edit_object(loop, c, id, types):
    with UIPortal(loop) as portal:
        import urwid as u
        aloop = asyncio.get_event_loop()

        loop.widget =  u.Overlay(
            u.AttrMap(
                u.LineBox(
                    u.Filler(
                        u.Text('Fetching object')
                    ),
                    title="Loading"
                ), 'bg'),
            u.AttrMap(u.SolidFill(), 'back'),
            'center', 40, 'middle', 10,
        )

        await c.socket.send(json.dumps({'type': 'FetchObject', 'id': id})) 
        state = None
        while True:
            res = json.loads(await c.socket.recv())
            if res['type'] == 'ObjectChanged' and res['id'] == id:
                state = res['object'][-1]
                break

        f = aloop.create_future()
        class Root(u.AttrMap):
            def keypress(self, size, key):
                if super(Root, self).keypress(size, key) is None:
                    return None
                if key == 'esc':
                    f.set_result(None)
                    return None
                return key

        # loop.stop()
        t = types[str(state['type'])]['content']
        fields = []
        store = []
        def addField(label, obj):
            fields.append(u.Columns([(25, u.Text(label))]+obj))

        def addStoreField(label, obj, type, name):
            store.append((type, name, obj))
            addField(label, [u.AttrMap(obj, 'bg', 'focus')])

        w = 25
        addStoreField('Name', u.Edit(edit_text=state.get('name', '')), 'outer,text', 'name')
        addStoreField('Comment', u.Edit(edit_text=state.get('comment', '')), 'outer,text', 'comment')
        if t['hasCategory']:
            addStoreField('Category', u.Edit(edit_text=state['category'] or ''), 'outer,text', 'category')

        content = state['content']
        for ic in t['content']:
            title = ic.get('title', '')
            name = ic['name']
            type = ic['type']
            if type == 0: #None
                pass
            elif type == 1: #Bool
                addStoreField(title, u.CheckBox(label="", state=content.get(name, False)), 'checkbox', name)
            elif type == 2: #text
                addStoreField(title, u.Edit(edit_text=content.get(name, False)), 'text', name)
            elif type == 3: #Password
                addStoreField(title, u.Edit(edit_text=content.get(name, False), mask="*"), 'password', name)
            elif type == 4: #document
                edit = u.Edit(edit_text=content.get(name, ''), multiline=True, allow_tab=True)
                def open_in_editor(_, edit=edit):
                    ext=".txt"
                    with NamedTemporaryFile(mode='w', suffix=ext) as f:
                        f.write(edit.edit_text)
                        f.flush()
                        loop.stop()
                        if subprocess.run([os.environ.get('EDITOR', 'editor'), f.name]).returncode == 0:
                            with open(f.name, mode="r") as f2:
                                edit.edit_text = f2.read()
                        loop.start()
                addField(title, [u.AttrMap(portal.connect(u.Button('Open in editor'), 'click', open_in_editor), 'button', 'focus')])
                fields.append(u.AttrMap(edit, 'bg', 'focus'))
                store.append(('text', name, edit))
            elif type == 5: #Choice
                button = u.Button(content.get(name, ''))
                async def change_choice(ic=ic, button=button):
                    ans = await ui_select_list(loop, c, button.label, ic['choices'])
                    if ans is not None:
                        button.set_label(ans)
                portal.connect(button, 'click', lambda _: asyncio.ensure_future(change_choice()))
                addStoreField(title, button, 'button', name)
            elif type == 6: #TypeContent
                pass
            elif type == 7: #Number
                pass
            elif type == 8: #monitorContent
                pass
        
        fields.append(u.Text(" "))
        fields.append(
            u.Columns([
                u.AttrMap(portal.connect(u.Button('Save'), 'click', lambda _: f.set_result(True)), 'button', 'focus'),
                u.AttrMap(portal.connect(u.Button('Cancle'), 'click', lambda _: f.set_result(False)), 'button', 'focus')
            ])
        )

        loop.widget = Root(
            u.Pile([
                ('weight', 1, u.LineBox(
                    u.ListBox(u.SimpleFocusListWalker(fields)),
                    title='Object %s (%d)'%(state['name'], id)
                ))
            ]),
            'bg')
        if not await f:
            return False

        for (type, name, obj) in store:
            type = type.split(',')
            if 'button' in type:
                value = obj.label
            elif 'text' in type:
                value = obj.edit_text
            elif 'checkbox' in type:
                value = obj.state
            elif 'password' in type:
                pass
            else:
                raise Error("Unknown store type")
            if 'outer' in type:
                state[name] = value
            else:
                content[name] = value
        await c.socket.send(json.dumps({'type': 'SaveObject', 'id': id, 'obj': state}))
        while True:
            res = json.loads(await c.socket.recv())
            if res['type'] == 'ObjectChanged' and res['id'] == id:
                break

async def ui():
    import urwid as u
    u.set_encoding("UTF-8")
    aloop = asyncio.get_event_loop()
    evl = u.AsyncioEventLoop(loop=aloop)

    palette = [
        ('button', 'white', 'dark red'),
        ('focus', 'white', 'dark green'),
        ('back', 'black', 'black'),
        ('error', 'dark red', 'dark blue'),
        ('bg', 'white', 'dark blue'),]
    loop = u.MainLoop(u.SolidFill(), event_loop=evl, palette=palette)
    try:
        loop.start()

        c = Connection()
        await c.setup(requireAuth=False)

        if not c.pwd or not c.otp:
            await ui_login(loop, c)

        loop.widget =  u.Overlay(
            u.AttrMap(
                u.LineBox(
                    u.Filler(
                        u.Text('Reading initial state')
                    ),
                    title="Loading"
                ), 'bg'),
            u.AttrMap(u.SolidFill(), 'back'),
            'center', 40, 'middle', 10,
        )

        await c.socket.send(json.dumps({'type': 'RequestInitialState'}))
        state = None
        while True:
            res = json.loads(await c.socket.recv())
            if res['type'] == 'SetInitialState':
                state = res
                break

        while True:
            id = await ui_select_object(loop, c, state)
            if not id:
                return
            await ui_edit_object(loop, c, id, state['types'])

    finally:
        loop.stop()

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
    parser_deploy.add_argument('path', help="Path of object to edit")

    subparsers.add_parser('listDeployments', help='List deployments', description="List deployments")

    args = parser.parse_args()
    if args.command == 'auth':
        asyncio.get_event_loop().run_until_complete(auth(args.user))
    elif args.command == 'deauth':
        asyncio.get_event_loop().run_until_complete(deauth(args.full))
    elif args.command == 'dockerDeploy':
        asyncio.get_event_loop().run_until_complete(deploy(args.server, args.image, args.container, args.config, args.restore_on_failure))
    elif args.command == 'edit':
        asyncio.get_event_loop().run_until_complete(edit(args.path))
    elif args.command == 'listDeployments':
        asyncio.get_event_loop().run_until_complete(list_deployments())
    else:
        asyncio.get_event_loop().run_until_complete(ui())

if __name__ == '__main__':
    main()
