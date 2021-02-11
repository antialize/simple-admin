#!/usr/bin/env python3

import argparse
import asyncio
import base64
import getpass
import itertools
import json
import os
import random
import re
import ssl
import subprocess
import sys
import time
from tempfile import NamedTemporaryFile
from typing import Any, Dict, List, Optional

import websockets

config: Dict[str, Any]

class Connection:
    def __init__(self):
        self.socket = None
        self.cookieFile = os.path.expanduser("~/.cache/simple_admin_cookie")
        self.caFile = os.path.expanduser("~/.cache/simple_admin_key.ca")
        self.keyFile = os.path.expanduser("~/.cache/simple_admin_key.key")
        self.crtFile = os.path.expanduser("~/.cache/simple_admin_key.crt")
        self.pwd = False
        self.otp = False
        
    async def setup(self, requireAuth=True):
        if config.get("server_insecure"):
            ssl_context = None
            protocol = "ws://"
        else:
            ssl_context = ssl.create_default_context()
            if config.get("server_cert"):
                ssl_context.load_verify_locations(capath=config["server_cert"])
            protocol = "wss://"
        self.socket = await websockets.connect(
            "%s%s:%s/sysadmin" % (protocol, config["server_host"], config["server_port"]),
            read_limit=2 ** 30,
            max_size=2 ** 30,
            ssl=ssl_context,
        )

        session = ""
        try:
            with open(self.cookieFile, 'r') as f:
                session = f.read()
        except FileNotFoundError:
            pass
        
        await self.socket.send(json.dumps({'type':'RequestAuthStatus', 'session': session}))

        res = json.loads(await self.socket.recv())
        if res['type'] != "AuthStatus":
            raise Exception("Bad result type")

        self.user = res['user']
        self.pwd = res['pwd']
        self.otp = res['otp']
        if requireAuth and not self.authenticated:
            raise Exception("Authentication required")

    @property
    def authenticated(self):
        return self.pwd and self.otp


class LoginFailed(Exception):
    pass


async def login(c, user, pwd, otp):
    await c.socket.send(json.dumps({'type': 'Login', 'user': user, 'pwd': pwd, 'otp': otp}))
    res = json.loads(await c.socket.recv())
    if res['type'] != "AuthStatus":
        raise Exception("Bad result type")
    if not res['session'] or not res['pwd'] or not res['otp']:
        raise LoginFailed("Could not authenticate: " + res['message'])


    with open(os.open(c.cookieFile, os.O_CREAT | os.O_WRONLY | os.O_TRUNC, 0o600), 'w') as f:
        f.write(res['session'])

    dockerconf = {}
    dockerconfpath = os.path.expanduser("~/.docker/config.json")
    try:
        dockerconf = json.load(open(dockerconfpath, "r"), )
    except:
        pass
    if not 'auths' in dockerconf:
        dockerconf['auths'] = {}
    dockerconf['auths'][config["server_host"]] = {'auth': base64.b64encode(("%s:%s"%(user, res['session'])).encode("ascii")).decode('ascii')}
    os.makedirs(os.path.expanduser("~/.docker"), exist_ok=True)
    with open(dockerconfpath, "w") as f:
        json.dump(dockerconf, f, indent=4)
        
    c.pwd = True
    c.otp = True

async def get_key(c):
    ref = random.randint(0, 2**48-1)
    await c.socket.send(json.dumps({'type': 'GenerateKey', 'ref': ref}))
    while True:
        res = json.loads(await c.socket.recv())
        if res['type'] == 'GenerateKeyRes' and res['ref'] == ref:

            with open(os.open(c.keyFile, os.O_CREAT | os.O_WRONLY | os.O_TRUNC, 0o600), 'w') as f:
                f.write(res['key'])

            with open(c.crtFile, 'w') as f:
                f.write(res['crt'])

            with open(c.caFile, 'w') as f:
                f.write(res['ca_pem'])

            break


async def main_auth(user):
    c = Connection()
    await c.setup(requireAuth=False)
    if c.user:
        user = c.user
    if c.authenticated:
        await get_key(c)
        print("Already authenticated as %s." % user)
        return

    await prompt_auth(c, user)
    print("Successfully authenticated.")


def input_stderr_prompt(prompt):
    # The builtin input() writes the prompt to stdout.
    # Tools should be able to parse the output of listDeployments --porcelain
    # and still have the prompt be shown properly, so use stderr instead.
    # Note that getpass prints the prompt to stderr already.
    sys.stderr.write(prompt)
    sys.stderr.flush()
    return input("")


async def prompt_auth(c, user):
    if c.authenticated:
        return

    for i in range(3):
        if not user:
            user = input_stderr_prompt("Username: ")
        pwd = getpass.getpass("Password for %s: " % user)
        if not pwd:
            raise SystemExit("No password provided")

        otp = None
        if not c.otp:
            otp = input_stderr_prompt("One time password: ")
            if not otp:
                raise SystemExit("No one time password provided")

        try:
            await login(c, user, pwd, otp)
            await get_key(c)
            return
        except LoginFailed as e:
            print(e, file=sys.stderr, flush=True)
    raise SystemExit("Authentication failed after multiple attempts; aborting")


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
    print("%s> %s <%s"%( "="*(38 - len(server) // 2), server, "="*(37 - (len(server) + 1) // 2)))
    await c.socket.send(json.dumps({"type": "DockerDeployStart", "host": server, "image": image, "config": config, "restoreOnFailure": restore_on_failure, "ref": ref, "container": container}))
    while True:
        res = json.loads(await c.socket.recv())
        if res['type'] == 'DockerDeployLog' and res['ref'] == ref:
            print(res['message'])
        if res['type'] == 'DockerDeployEnd' and res['ref'] == ref:
            print(res['message'])
            if not res['status']:
                sys.exit(1)
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


def rel_time(timestamp: float) -> str:
    seconds = time.time() - timestamp
    x = [("days", 86400), ("hours", 3600), ("minutes", 60)]
    for k, d in x:
        v = int(seconds / d)
        if v > 0:
            return "%s %s ago" % (v, k if v > 1 else k.rstrip("s"))
    return "%s seconds ago" % int(seconds)


async def list_deployments(
    porcelain_version: Optional[str],
    format: Optional[str],
    host: Optional[str],
    container: Optional[str],
    image: Optional[str],
    history: bool,
):
    c = Connection()
    await c.setup(requireAuth=False)
    await prompt_auth(c, c.user)
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
    host_ids = {n: i for i, n in host_names.items()}

    request = {"type": "DockerListDeployments", "ref": ref}
    response_type = "DockerListDeploymentsRes"
    if host:
        try:
            request["host"] = host_ids[host]
        except KeyError:
            raise SystemExit("Unknown --host %r" % (host,)) from None
    if container:
        request["name"] = container
    if image:
        request["image"] = image
    if history:
        if not host or not container:
            raise SystemExit("--history requires --host and --container")
        request["type"] = "DockerListDeploymentHistory"
        response_type = "DockerListDeploymentHistoryRes"
    await c.socket.send(json.dumps(request))
    while True:
        res = json.loads(await c.socket.recv())
        if res["type"] == response_type and res["ref"] == ref:
            break
    deployments = res["deployments"]
    if porcelain_version:
        if porcelain_version != "v1":
            raise Exception("Unknown porcelain version")
        porcelain_data = {
            "version": porcelain_version,
            "deployments": deployments,
            "host_names": host_names,
        }
        print(json.dumps(porcelain_data, indent=2))
        return
    # DockerListDeployments currently doesn't support filtering by container,
    # and DockerListDeploymentHistory doesn't support filtering by image,
    # so do the filtering here. Also filter by host for good measure.
    if host:
        host_names = {host_ids[host]: host}
    deployments = [
        d
        for d in deployments
        if d["host"] in host_names
        and (not image or d["image"] == image)
        and (not container or d["name"] == container)
    ]
    list_deployment_groups(group_deployments(deployments, host_names), format)


class numeric_sort_key:
    def __init__(self, s):
        self.s = re.findall(r"[0-9]+|[^0-9]+", str(s))

    def __lt__(self, o):
        if self.__class__ is not o.__class__:
            return NotImplemented
        i = 0
        while i < len(self.s) and i < len(o.s) and self.s[i] == o.s[i]:
            i += 1
        try:
            return int(self.s[i]) < int(o.s[i])
        except (IndexError, ValueError):
            pass
        return "".join(self.s[i:]) < "".join(o.s[i:])


def group_deployments(deployments, host_names):
    deployments.sort(key=lambda d: (d["image"], d["host"]))
    image_groups = itertools.groupby(deployments, key=lambda d: d["image"])
    groups = []
    for image, image_group in image_groups:
        by_host_iter = itertools.groupby(image_group, key=lambda d: d["host"])
        by_host = [
            (host_names.get(host_id, str(host_id)), list(g)) for host_id, g in by_host_iter
        ]
        names = set(d["name"] for host, group in by_host for d in group)
        x = set(tuple(d["name"] for d in group) for host, group in by_host)
        one_per_host = all(len(n) == 1 for n in x)
        if len(by_host) >= 2 * len(names):
            # This image is deployed to many hosts under the same or few names,
            # as opposed to being deployed under many names to few hosts.
            # Switch the layout from {host: {name: deployment}}
            # to {name: {host: deployment}}
            by_name: Dict[str, List[Any]] = {}
            for host, deployments in by_host:
                for deployment in deployments:
                    k = deployment["name"] if one_per_host else "%s in %s" % (deployment["name"], image)
                    y = by_name.setdefault(k, [])
                    deployment["name"] = host
                    y.append(deployment)
            for y in by_name.values():
                y.sort(key=lambda o: numeric_sort_key(o["name"]))
            groups.extend(sorted(by_name.items()))
        else:
            for host, group in by_host:
                group.sort(key=lambda o: numeric_sort_key(o["name"]))
            groups += [("%s on %s" % (image, host), group) for host, group in by_host]
    return groups


def list_deployment_groups(groups, format: Optional[str]):
    if format is None:
        format = "({labels[GIT_COMMIT]} {labels[GIT_BRANCH]})"
    for name, group in groups:
        print("\n%s" % name)
        deployments = []
        for deployment in group:
            image_info = deployment.get("imageInfo", {})
            name = deployment["name"]
            deploy_time = rel_time(deployment["start"])
            deploy_user = deployment["user"]
            push_time = rel_time(image_info["time"]) if image_info else None
            push_user = image_info["user"] if image_info else None
            removed = image_info["removed"] if image_info else None
            key = (deploy_time, deploy_user, push_time, push_user, image_info, removed)
            deployments.append((name, key))
        grouped = itertools.groupby(deployments, key=lambda x: x[1])
        for key, g in grouped:
            name = ", ".join(str(n) for n, _ in g)
            deploy_time, deploy_user, push_time, push_user, image_info, removed = key
            bold = "\x1b[1m"
            red = "\x1b[31m"
            green = "\x1b[32m"
            reset = "\x1b[0m"
            deploy_time = green + bold + deploy_time + reset
            status = "%s by %s" % (deploy_time, deploy_user)
            if push_time is not None:
                push_time = green + bold + push_time + reset
                push_status = "%s by %s" % (push_time, push_user)
                if status != push_status:
                    status = "pushed %s, deployed %s" % (push_status, status)
            if removed is not None:
                status += ", removed %s" % rel_time(removed)
            git = ""
            try:
                extra = format.format(**image_info)
            except Exception as e:
                extra = type(e).__name__
            if extra.strip():
                git = "%s %s%s" % (reset + green, extra.strip(), reset)
            print("- %s %s%s" % (bold + red + name + reset, status, git))


async def list_images(
    *,
    format: Optional[str] = None,
    porcelain_version: Optional[str] = None,
    image: Optional[str] = None,
    follow: bool = False,
    tail: Optional[int] = None,
    hash: Optional[List[str]] = None,
):
    if format is None:
        format = "{image}:{red}{bold}{tag}{reset} pushed {green}{bold}{rel_time}{reset} by {user} {green}{image}@{hash}{reset}"
    c = Connection()
    await c.setup(requireAuth=False)
    await prompt_auth(c, c.user)
    assert c.socket is not None
    if hash:
        await c.socket.send(json.dumps({"type": "DockerListImageByHash", "ref": 1, "hash": hash}))
    else:
        await c.socket.send(json.dumps({"type": "DockerListImageTags", "ref": 1}))
    got_list = False
    while follow or not got_list:
        res = json.loads(await c.socket.recv())
        if res["type"] == "DockerListImageTagsRes":
            images = res["tags"]
            images.sort(key=lambda i: i["time"])
            got_list = True
        elif res["type"] == "DockerListImageByHashRes":
            images = sorted(res["tags"].values(), key=lambda i: i["time"])
            got_list = True
        elif res["type"] == "DockerListImageTagsChanged" and follow:
            images = res["changed"]
        else:
            continue
        if porcelain_version:
            for i in images:
                print(json.dumps(i), flush=follow)
            continue
        # Don't show "removed" images unless we have requested a specific hash.
        if not hash:
            images = [i for i in images if not i.get("removed")]
        if image is not None:
            images = [i for i in images if i["image"] == image]
        if tail is not None and res["type"] != "DockerListImageTagsChanged":
            images = images[len(images) - tail :]
        for i in images:
            message = format.format(
                bold="\x1b[1m",
                red="\x1b[31m",
                green="\x1b[32m",
                reset="\x1b[0m",
                rel_time=rel_time(i["time"]),
                **i,
            )
            print(message, flush=follow)


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
                addStoreField(title, u.Edit(edit_text=content.get(name, "")), 'text', name)
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

    parser.add_argument("--config", help="path to config file", dest="config_path")
    parser.add_argument("--server-host", help="the hostname of the server")
    parser.add_argument("--server-port", help="the port of the server")
    parser.add_argument("--server-cert", help="the TLS certificate of the server")
    parser.add_argument("--server-insecure", help="set if connecting to insecure ws", action="store_true")

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

    subparser = subparsers.add_parser(
        "listDeployments", help="List deployments", description="List deployments"
    )
    subparser.add_argument(
        "--porcelain",
        choices=["v1"],
        help="Give the output in an easy-to-parse format for scripts.",
    )
    subparser.add_argument(
        "-e",
        "--format",
        help="str.format style string using the keys: id,image,tag,hash,time,user,pin,labels,removed",
    )
    subparser.add_argument(
        "--host",
        help="Only show deployments for this server.",
    )
    subparser.add_argument(
        "-s",
        "--container",
        help="Only show deployments for this container.",
    )
    subparser.add_argument(
        "--image",
        help="Only show deployments for this image.",
    )
    subparser.add_argument(
        "--history",
        action="store_true",
        help="Show historical deployments (requires --host and --container)",
    )

    subparser = subparsers.add_parser(
        "listImages",
        help="List images",
        description="List currently available tagged docker images",
    )
    subparser.add_argument(
        "-f",
        "--follow",
        action="store_true",
        help="After listing the available images, list images as they are pushed",
    )
    subparser.add_argument(
        "-n", "--tail", type=int, help="Only display the most recent N images"
    )
    subparser.add_argument(
        "--porcelain",
        choices=["v1"],
        help="Give the output in an easy-to-parse format for scripts.",
    )
    subparser.add_argument("-i", "--image", help="Only print tags for this image")
    subparser.add_argument(
        "-e",
        "--format",
        help="str.format style string using the keys: id,image,tag,hash,time,user,pin,labels,removed",
    )
    subparser.add_argument(
        "-s",
        "--hash",
        action="append",
        help="Search by specific hash ('sha256:ab12...')",
    )

    args = parser.parse_args()

    global config
    config_keys = "server_host server_port server_cert server_insecure".split()
    config = {k: getattr(args, k) for k in config_keys if getattr(args, k, None)}
    if not config:
        with open(args.config_path or "/etc/simpleadmin_client.json") as fp:
            config = {**json.load(fp), **config}
    if config.get("server_port") is None:
        config["server_port"] = 443

    if args.command == 'auth':
        asyncio.get_event_loop().run_until_complete(main_auth(args.user))
    elif args.command == 'deauth':
        asyncio.get_event_loop().run_until_complete(deauth(args.full))
    elif args.command == 'dockerDeploy':
        asyncio.get_event_loop().run_until_complete(deploy(args.server, args.image, args.container, args.config, args.restore_on_failure))
    elif args.command == 'edit':
        asyncio.get_event_loop().run_until_complete(edit(args.path))
    elif args.command == 'listDeployments':
        asyncio.get_event_loop().run_until_complete(
            list_deployments(
                args.porcelain, args.format, args.host, args.container, args.image, args.history
            )
        )
    elif args.command == "listImages":
        try:
            asyncio.get_event_loop().run_until_complete(
                list_images(
                    format=args.format,
                    porcelain_version=args.porcelain,
                    image=args.image,
                    follow=args.follow,
                    tail=args.tail,
                    hash=args.hash,
                )
            )
        except KeyboardInterrupt:
            pass
    else:
        asyncio.get_event_loop().run_until_complete(ui())

if __name__ == '__main__':
    main()
