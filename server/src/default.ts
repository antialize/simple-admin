import {
    IType,
    TypePropType,
    ITextTypeProp,
    IChoiceTypeProp,
    IBoolTypeProp,
    ITypeContentTypeProp,
    INumberTypeProp,
    IDocumentTypeProp,
    IPasswordTypeProp,
    typeId,
    hostId,
    rootId,
    userId,
    rootInstanceId,
} from "./shared/type";

export const groupId = 5;
export const fileId = 6;
export const collectionId = 7;
export const complexCollectionId = 8;
export const ufwAllowId = 9;
export const packageId = 10;

export const reloadServiceTriggerId = 50;
export const restartServiceTriggerId = 51;
export const runTriggerId = 52;

interface IDefault {
    type: number;
    id: number;
    name: string;
    category: string;
    content: object;
    comment: string;
}

export let defaults: IDefault[] = [
    ////////////////////////////////////////////////////// Type Type /////////////////////////////////////////////////////////
    {
        type: typeId,
        id: typeId,
        name: "Type",
        category: "Buildin",
        comment: "Type of types (buildin)",
        content: {
            deployOrder: 0,
            plural: "Types",
            kind: "type",
            hasCategory: true,
            hasDepends: true,
            hasContains: true,
            hasTriggers: true,
            content: [
                {
                    type: TypePropType.text,
                    title: "Name variable",
                    name: "nameVariable",
                    description: "nameVariable",
                    default: "",
                    template: false,
                    variable: "",
                } as ITextTypeProp,
                {
                    type: TypePropType.text,
                    title: "Plural",
                    name: "plural",
                    description: "Plural of name",
                    default: "",
                    template: false,
                    variable: "",
                } as ITextTypeProp,
                {
                    type: TypePropType.choice,
                    title: "Kind",
                    name: "kind",
                    description: "",
                    default: "delta",
                    choices: [
                        "delta",
                        "trigger",
                        "host",
                        "accumulate",
                        "collection",
                        "root",
                        "type",
                        "monitor",
                    ],
                } as IChoiceTypeProp,
                {
                    type: TypePropType.number,
                    title: "Deploy order",
                    name: "deployOrder",
                    description: "",
                    default: 0,
                } as INumberTypeProp,
                {
                    type: TypePropType.bool,
                    title: "Has category",
                    name: "hasCategory",
                    description: "",
                    default: false,
                    template: false,
                    variable: "",
                } as IBoolTypeProp,
                {
                    type: TypePropType.bool,
                    title: "Has variables",
                    name: "hasVariables",
                    description: "",
                    default: false,
                    template: false,
                    variable: "",
                } as IBoolTypeProp,
                {
                    type: TypePropType.bool,
                    title: "Has triggers",
                    name: "hasTriggers",
                    description: "",
                    default: false,
                    template: false,
                    variable: "",
                } as IBoolTypeProp,
                {
                    type: TypePropType.bool,
                    title: "Has depends",
                    name: "hasDepends",
                    description: "",
                    default: false,
                    template: false,
                    variable: "",
                } as IBoolTypeProp,
                {
                    type: TypePropType.bool,
                    title: "Has sudo on",
                    name: "hasSudoOn",
                    description: "",
                    default: false,
                    template: false,
                    variable: "",
                } as IBoolTypeProp,
                {
                    type: TypePropType.bool,
                    title: "Has contains",
                    name: "hasContains",
                    description: "",
                    default: false,
                    template: false,
                    variable: "",
                } as IBoolTypeProp,
                {
                    type: TypePropType.text,
                    title: "Contains name",
                    name: "contairsName",
                    description: "",
                    default: "Has",
                    template: false,
                    variable: "",
                } as ITextTypeProp,
                { type: TypePropType.typeContent, name: "content" } as ITypeContentTypeProp,
                {
                    type: TypePropType.document,
                    title: "Script",
                    name: "script",
                    description: "",
                    lang: "Python",
                    langName: "",
                    template: false,
                } as IDocumentTypeProp,
            ],
        } as IType,
    },

    //////////////////////////////////////////////// Host Type //////////////////////////////////////////////////////////////
    {
        type: typeId,
        id: hostId,
        name: "Host",
        category: "Buildin",
        comment: "The type of a host (buildin)",
        content: {
            plural: "Hosts",
            kind: "host",
            hasCategory: true,
            hasVariables: true,
            hasContains: true,
            containsName: "Has",
            nameVariable: "host",
            content: [
                {
                    type: TypePropType.password,
                    title: "Password",
                    name: "password",
                    description: "The password the python client connects with",
                } as IPasswordTypeProp,
                {
                    type: TypePropType.bool,
                    title: "Message on down",
                    name: "messageOnDown",
                    description: "Should we generate messages when the server goes down",
                    default: true,
                    template: false,
                    variable: "",
                } as IBoolTypeProp,
            ],
        } as IType,
    },

    //////////////////////////////////////////////// Root Type //////////////////////////////////////////////////////////////
    {
        type: typeId,
        id: rootId,
        name: "Root",
        category: "Buildin",
        comment: "The type of the singular root object (buildin)",
        content: {
            plural: "Roots",
            kind: "root",
            hasVariables: true,
            content: [
                {
                    type: TypePropType.document,
                    title: "Preamble",
                    name: "preamble",
                    description: "",
                    lang: "Python",
                    langName: "",
                    template: true,
                    variable: "preamble",
                } as IDocumentTypeProp,
            ],
        } as IType,
    },

    //////////////////////////////////////////////// Collection Type //////////////////////////////////////////////////////////////
    {
        type: typeId,
        id: collectionId,
        name: "Collection",
        category: "Buildin",
        comment: "Generic collection type, does not split elements",
        content: {
            deployOrder: 10,
            plural: "Collections",
            kind: "collection",
            hasCategory: true,
            hasContains: true,
            hasDepends: true,
            containsName: "Has",
        } as IType,
    },

    //////////////////////////////////////////////// Complex collection Type //////////////////////////////////////////////////////////////
    {
        type: typeId,
        id: complexCollectionId,
        name: "Complex collection",
        category: "Buildin",
        comment: "Complex collection type, has variables and such, causes element splits",
        content: {
            deployOrder: 10,
            plural: "Complex collections",
            kind: "collection",
            hasVariables: true,
            hasCategory: true,
            hasContains: true,
            hasDepends: true,
            containsName: "Has",
        } as IType,
    },

    ///////////////////////////////////////////////////// File type ///////////////////////////////////////////////////////////
    {
        type: typeId,
        id: fileId,
        name: "File",
        category: "Buildin",
        comment: "File type",
        content: {
            deployOrder: 40,
            plural: "Files",
            kind: "delta",
            hasCategory: true,
            hasTriggers: true,
            content: [
                {
                    type: TypePropType.text,
                    title: "Path",
                    name: "path",
                    description: "Where to store the file",
                    default: "",
                    template: true,
                    variable: "path",
                    deployTitle: true,
                },
                {
                    type: TypePropType.text,
                    title: "User",
                    name: "user",
                    description: "User to store as",
                    default: "{{{user}}}",
                    template: true,
                    variable: "",
                },
                {
                    type: TypePropType.text,
                    title: "Group",
                    name: "group",
                    description: "Group to store as",
                    default: "{{{user}}}",
                    template: true,
                    variable: "",
                },
                {
                    type: TypePropType.text,
                    title: "Mode",
                    name: "mode",
                    description: "Mode to use",
                    default: "644",
                    template: true,
                    variable: "",
                },
                {
                    type: TypePropType.document,
                    title: "Data",
                    name: "data",
                    description: "Mode to use",
                    default: "644",
                    langName: "lang",
                    lang: "",
                    template: true,
                    variable: "",
                },
            ],
            script:
                "{{{preamble}}}\n" +
                "import tempfile\n" +
                "old = content['old']\n" +
                "new = content['new']\n" +
                "\n" +
                "if not new:\n" +
                "    run(['rm','-f', old['path']])\n" +
                "else:\n" +
                "    d = os.path.dirname(new['path'])\n" +
                "    if not os.path.exists(d):\n" +
                "        run(['sudo', '-u', new['user'], 'mkdir', '-p', d])\n" +
                "    tf = tempfile.NamedTemporaryFile(dir=d, suffix='~', prefix='.tmp', delete=False, mode='w', encoding='utf-8')\n" +
                "    prompt('# writing to %s'%tf.name)\n" +
                "    tf.write(new['data'])\n" +
                "    tf.close()\n" +
                "\n" +
                "    run(['chown', new['user']+':'+new['group'], tf.name])\n" +
                "    run(['chmod', new['mode'], tf.name])\n" +
                "    run(['mv', '-f', tf.name, new['path']])\n",
        },
    },

    /////////////////////////////////////////////// User Type ////////////////////////////////////////////////////////////////
    {
        type: typeId,
        id: userId,
        name: "User",
        category: "Buildin",
        comment:
            "The type of a user\nDo not delete the password field, as that is also used when logging in to simple admin",
        content: {
            deployOrder: 30,
            plural: "Users",
            kind: "delta",
            hasCategory: true,
            hasVariables: true,
            hasContains: true,
            hasDepends: true,
            containsName: "Has",
            hasSudoOn: true,
            nameVariable: "user",
            content: [
                {
                    type: TypePropType.text,
                    title: "First Name",
                    name: "firstName",
                    description: "FirstName",
                    default: "",
                    template: false,
                    variable: "firstName",
                } as ITextTypeProp,
                {
                    type: TypePropType.text,
                    title: "Last Name",
                    name: "lastName",
                    description: "LastName",
                    default: "",
                    template: false,
                    variable: "lastName",
                } as ITextTypeProp,
                {
                    type: TypePropType.text,
                    title: "Email",
                    name: "email",
                    description: "Email",
                    default: "",
                    template: false,
                    variable: "email",
                } as ITextTypeProp,
                {
                    type: TypePropType.text,
                    title: "Shell",
                    name: "shell",
                    description: "Shell",
                    default: "/bin/bash",
                    template: true,
                    variable: "",
                } as ITextTypeProp,
                {
                    type: TypePropType.bool,
                    title: "System",
                    name: "system",
                    description: "Should it be a system user",
                    default: false,
                    template: false,
                    variable: "",
                } as IBoolTypeProp,
                {
                    type: TypePropType.bool,
                    title: "Sudo",
                    name: "sudo",
                    description: "Sudo",
                    default: false,
                    template: false,
                    variable: "",
                } as IBoolTypeProp,
                {
                    type: TypePropType.bool,
                    title: "Admin",
                    name: "admin",
                    description: "Allow login into simpleadmin",
                    default: false,
                    template: false,
                    variable: "",
                } as IBoolTypeProp,
                {
                    type: TypePropType.password,
                    title: "Password",
                    name: "password",
                    description: "The password to log in with",
                } as IPasswordTypeProp,
                {
                    type: TypePropType.text,
                    title: "Groups",
                    name: "groups",
                    description: "Groups the user is member of",
                    default: "",
                    template: true,
                    variable: "",
                } as ITextTypeProp,
            ],
            script:
                "{{{preamble}}}\n" +
                "import pwd\n" +
                "old = content['old']\n" +
                "new = content['new']\n" +
                "\n" +
                "egroups = set()\n" +
                "for line in open('/etc/group', 'r'):\n" +
                "    group = line.split(':')[0]\n" +
                "    egroups.add(group)\n" +
                "\n" +
                "exists = False\n" +
                "isSystem = False\n" +
                "if new:\n" +
                "    try:\n" +
                "        ent = pwd.getpwnam(new['name'])\n" +
                "        isSystem = ent.pw_uid < 1000\n" +
                "        exists = True\n" +
                "    except KeyError:\n" +
                "        pass\n" +
                "\n" +
                "if not new or (old and old['name'] != new['name']) or not exists or isSystem != new['system']:\n" +
                "    if old:\n" +
                "        runUnchecked(['userdel', old['name']])\n" +
                "    if new:\n" +
                "        runUnchecked(['userdel', new['name']])\n" +
                "        args = ['useradd']\n" +
                "        groups = set(new['groups'])\n" +
                "        if new['system']:\n" +
                "            args.append('-M')\n" +
                "            args.append('-N')\n" +
                "            args.append('-r')\n" +
                "        else:\n" +
                "            args.append('-U')\n" +
                "            args.append('-m')\n" +
                "        if new['sudo']:\n" +
                "            groups.add('sudo')\n" +
                "        if new['password']:\n" +
                "            args.append('-p')\n" +
                "            args.append(new['password'])\n" +
                "        if 'shell' in new and new['shell']:\n" +
                "            args.append('-s')\n" +
                "            args.append(new['shell'])\n" +
                "        mygroups = groups & egroups\n" +
                "        if mygroups:\n" +
                "            args.append('-G')\n" +
                "            args.append(','.join(mygroups))\n" +
                "        args.append(new['name'])\n" +
                "        run(args)\n" +
                "else:\n" +
                "    args = ['usermod']\n" +
                "    groups = set(new['groups'])\n" +
                "    if new['password']:\n" +
                "        args.append('-p')\n" +
                "        args.append(new['password'])\n" +
                "    else:\n" +
                "        run(['passwd', '-d',  new['name']])\n" +
                "    if 'shell' in new and new['shell']:\n" +
                "        args.append('-s')\n" +
                "        args.append(new['shell'])\n" +
                "    if new['sudo']:\n" +
                "        groups.add('sudo')\n" +
                "    if not new['system']:\n" +
                "        groups.add(new['name'])\n" +
                "    mygroups = groups & egroups\n" +
                "    args.append('-G')\n" +
                "    args.append(','.join(groups & egroups))\n" +
                "    args.append(new['name'])\n" +
                "    run(args)\n",
        },
    },

    ///////////////////////////////////////////////////////////////////////// Group type ///////////////////////////////////////////////////////
    {
        type: typeId,
        id: groupId,
        name: "Group",
        category: "Buildin",
        comment: "The type of a unix group",
        content: {
            deployOrder: 20,
            plural: "Groups",
            kind: "delta",
            hasCategory: false,
            hasVariables: false,
            hasContains: false,
            containsName: "Contains",
            content: [
                {
                    type: TypePropType.bool,
                    title: "System",
                    name: "system",
                    description: "Is this a system group",
                    default: false,
                    template: false,
                    variable: "",
                },
            ],
            script:
                "{{{preamble}}}\n" +
                "import grp\n" +
                "old = content['old']\n" +
                "new = content['new']\n" +
                "\n" +
                "exists = False\n" +
                "isSystem = False\n" +
                "if new:\n" +
                "    try:\n" +
                "        ent = grp.getgrnam(new['name'])\n" +
                "        isSystem = ent.gr_gid < 1000\n" +
                "        exists = True\n" +
                "    except KeyError:\n" +
                "        pass\n" +
                "\n" +
                "if not new or (old and new['name'] != old['name']) or new['system'] != isSystem or not exists:\n" +
                "    if old:\n" +
                "        runUnchecked(['groupdel', old['name']])\n" +
                "    if new:\n" +
                "        args = ['groupadd']\n" +
                "        if new['system']:\n" +
                "            args.append('-r')\n" +
                "        args.append(new['name'])\n" +
                "        run(args)\n",
        },
    },

    ///////////////////////////////////////////////////// UFWAllow type ///////////////////////////////////////////////////////////
    {
        type: typeId,
        id: ufwAllowId,
        name: "UFW Allow",
        category: "Buildin",
        comment: "Type to poke holes throu a ufw firewall",
        content: {
            deployOrder: 60,
            plural: "UFW Allows",
            kind: "delta",
            content: [
                {
                    type: TypePropType.text,
                    name: "allow",
                    title: "Allow",
                    default: "",
                    description: "ufw allow *",
                    template: false,
                    variable: "",
                },
            ],
            script:
                "{{{preamble}}}\n" +
                "old = content['old']\n" +
                "new = content['new']\n" +
                "\n" +
                "if not new or not old or old['allow'] != new['allow']:\n" +
                "    if old:\n" +
                "        run(['ufw', 'reject', *old['allow'].split(' ')])\n" +
                "    if new:\n" +
                "        run(['ufw', 'allow', *new['allow'].split(' ')])\n",
        },
    },

    ///////////////////////////////////////////////////// reload service trigger ///////////////////////////////////////////////////////////
    {
        type: typeId,
        id: reloadServiceTriggerId,
        name: "Reload service",
        category: "Buildin",
        comment: "Reloads a systemd service",
        content: {
            deployOrder: 0,
            plural: "",
            kind: "trigger",
            content: [
                {
                    type: TypePropType.text,
                    name: "service",
                    title: "Service",
                    default: "",
                    description: "Service to reload",
                    template: true,
                    variable: "",
                },
            ],
            script: "{{{preamble}}}\n" + "run(['systemctl', 'reload', content['service']])\n",
        },
    },

    ///////////////////////////////////////////////////// restart service trigger ///////////////////////////////////////////////////////////
    {
        type: typeId,
        id: restartServiceTriggerId,
        name: "Restart service",
        category: "Buildin",
        comment: "Restarts a systemd service",
        content: {
            deployOrder: 0,
            plural: "",
            kind: "trigger",
            content: [
                {
                    type: TypePropType.text,
                    name: "service",
                    title: "Service",
                    default: "",
                    description: "Service to restart",
                    template: true,
                    variable: "",
                },
            ],
            script: "{{{preamble}}}\n" + "run(['systemctl', 'restart', content['service']])\n",
        },
    },

    ///////////////////////////////////////////////////// run trigger ///////////////////////////////////////////////////////////
    {
        type: typeId,
        id: runTriggerId,
        name: "Run",
        category: "Buildin",
        comment: "Run some shell code",
        content: {
            deployOrder: 0,
            plural: "",
            kind: "trigger",
            content: [
                {
                    type: TypePropType.text,
                    name: "code",
                    title: "Code",
                    default: "",
                    description: "Shell code to run",
                    template: true,
                    variable: "",
                },
            ],
            script: "{{{preamble}}}\n" + "runShell(content['code'])\n",
        },
    },

    ///////////////////////////////////////////////////// Package type ///////////////////////////////////////////////////////////
    {
        type: typeId,
        id: packageId,
        name: "Package",
        category: "Buildin",
        comment: "Install debian packages",
        content: {
            deployOrder: 50,
            plural: "Packages",
            kind: "sum",
            content: [],
            script:
                "{{{preamble}}}\n" +
                "import tempfile\n" +
                "os.environ['DEBIAN_FRONTEND'] = 'noninteractive'\n" +
                "\n" +
                "version = 1\n" +
                "try:\n" +
                "    version = int(subprocess.check_output(['dpkg-query','-W',\"-f='${Version}'\", 'simple-admin-meta']).decode('utf-8')[1:-1].split('.')[0]) + 1\n" +
                "except subprocess.CalledProcessError:\n" +
                "    pass\n" +
                "\n" +
                "base = tempfile.mkdtemp()\n" +
                "os.chmod(base, 0o755)\n" +
                "d = os.path.join(base, 'simple-admin-meta-%d.0'%version)\n" +
                "\n" +
                "deb = '%s.deb'%d\n" +
                "os.mkdir(d)\n" +
                "os.mkdir(os.path.join(d,'DEBIAN'))\n" +
                "with open(os.path.join(d,'DEBIAN','control'), 'w', encoding='utf-8') as f:\n" +
                "    f.write('''Section: unknown\n" +
                "Priority: optional\n" +
                "Maintainer: Simple admin <sadmin@example.com>\n" +
                "Standards-Version: 3.9.6\n" +
                "Version: %d.0\n" +
                "Package: simple-admin-meta\n" +
                "Architecture: all\n" +
                "Depends: %s\n" +
                "Description: Simple admin dependency package\n" +
                "'''%(version, ', '.join(map(lambda x: x['name'], content['objects'].values()))))\n" +
                "\n" +
                "run(['dpkg-deb', '--build', d, deb])\n" +
                "run(['apt', 'install', '-y', deb])\n" +
                "run(['apt', 'autoremove', '-y'])\n",
        },
    },

    //////////////////////////////////////////////// Root instance //////////////////////////////////////////////////////////////
    {
        type: rootId,
        id: rootInstanceId,
        name: "Root",
        category: "",
        comment: "The singular root instance",
        content: {
            variables: [{ key: "user", value: "root" }],
            preamble:
                "import sys, json, subprocess, pty, fcntl, os, select, socket, shlex\n" +
                "\n" +
                "content = json.loads(sys.stdin.read())\n" +
                "\n" +
                "(pid, fd) = pty.fork()\n" +
                "if pid != 0:\n" +
                "    try:\n" +
                "        while True:\n" +
                "            d = os.read(fd, 1024*1024)\n" +
                "            if not d: break\n" +
                "            os.write(1, d)\n" +
                "    except OSError:\n" +
                "        pass\n" +
                "\n" +
                "    (_, state) = os.waitpid(pid, 0)\n" +
                "    sys.exit(-os.WTERMSIG(state) if os.WTERMSIG(state) != 0 else os.WEXITSTATUS(state))\n" +
                "\n" +
                "hostname = socket.gethostname()\n" +
                "os.environ['name'] = 'xterm-color'\n" +
                "os.environ['TERM'] = 'xterm'\n" +
                "\n" +
                "def prompt(value):\n" +
                "    os.write(1, ('\\033[94m%s$\\033[0m %s\\r\\n'%(hostname, value)).encode('utf-8'))\n" +
                "\n" +
                "def run(args):\n" +
                "    prompt(' '.join(map(shlex.quote, args)))\n" +
                "    subprocess.check_call(args)\n" +
                "\n" +
                "def runUnchecked(args):\n" +
                "    prompt(' '.join(map(shlex.quote, args)))\n" +
                "    subprocess.call(args)\n" +
                "\n" +
                "def runShell(cmd):\n" +
                "    prompt(cmd)\n" +
                "    subprocess.call([cmd], shell=True)\n",
        },
    },
];
