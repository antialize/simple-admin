import {
    type IBoolTypeProp,
    type IChoiceTypeProp,
    type IDocumentTypeProp,
    type INumberTypeProp,
    type IPasswordTypeProp,
    type ITextTypeProp,
    type IType,
    type ITypeContentTypeProp,
    TypePropType,
    hostId,
    rootId,
    rootInstanceId,
    typeId,
    userId,
} from "./shared/type";

export const collectionId = 7;
export const complexCollectionId = 8;
export const fileId = 6;
export const groupId = 5;
export const ufwAllowId = 9;
export const reloadServiceTriggerId = 50;
export const restartServiceTriggerId = 51;
export const runTriggerId = 52;
export const packageId = 10;
export const cronId = 10240;
export const fstabId = 10616;
export const hostVariableId = 10840;
export const limitId = 10675;
export const runId = 10072;
export const shellTriggerId = 52;
export const systemdServiceId = 10206;

interface IDefault {
    type: number;
    id: number;
    name: string;
    category: string;
    content: object;
    comment: string;
}

export const defaults: IDefault[] = [
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
                        "docker",
                        "hostvar",
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
                {
                    type: TypePropType.typeContent,
                    name: "content",
                } as ITypeContentTypeProp,
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
            contains: [],
            depends: [],
            nameVariable: "",
            hasVariables: false,
            hasSudoOn: false,
            contairsName: "Has",
            script: "",
        } as IType,
    },
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
                {
                    type: TypePropType.bool,
                    name: "debPackages",
                    title: "Debian packages",
                    default: true,
                    variable: "depPackages",
                    description: "Do we have debian packages",
                } as IBoolTypeProp,
                {
                    type: TypePropType.text,
                    lines: 5,
                    name: "notes",
                    title: "Notes",
                } as ITextTypeProp,
                {
                    type: TypePropType.bool,
                    name: "usePodman",
                    title: "Use podman",
                    description: "Should we use podman instead of docker",
                    variable: "usePodman",
                } as IBoolTypeProp,
            ],
            contains: [],
            depends: [],
            hasTriggers: false,
            hasDepends: false,
            hasSudoOn: false,
            contairsName: "Has",
            script: "",
        } as IType,
    },
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
                {},
                {},
            ],
            contains: [],
            depends: [],
            nameVariable: "",
            hasCategory: false,
            hasTriggers: false,
            hasDepends: false,
            hasSudoOn: false,
            hasContains: false,
            contairsName: "Has",
            script: "",
        } as IType,
    },
    {
        type: typeId,
        id: collectionId,
        name: "Collection",
        category: "Buildin",
        comment: "",
        content: {
            deployOrder: 10,
            plural: "Collections",
            kind: "collection",
            hasCategory: true,
            hasContains: true,
            hasDepends: true,
            containsName: "Has",
            contains: [],
            depends: [],
            nameVariable: "",
            hasVariables: false,
            hasTriggers: false,
            hasSudoOn: false,
            contairsName: "Has",
            content: [
                {
                    type: TypePropType.text,
                    name: "comment",
                    title: "Comment",
                } as ITextTypeProp,
            ],
            script: "",
        } as IType,
    },
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
                } as ITextTypeProp,
                {
                    type: TypePropType.text,
                    title: "User",
                    name: "user",
                    description: "User to store as",
                    default: "{{{user}}}",
                    template: true,
                    variable: "",
                } as ITextTypeProp,
                {
                    type: TypePropType.text,
                    title: "Group",
                    name: "group",
                    description: "Group to store as",
                    default: "{{{user}}}",
                    template: true,
                    variable: "",
                } as ITextTypeProp,
                {
                    type: TypePropType.text,
                    title: "Mode",
                    name: "mode",
                    description: "Mode to use",
                    default: "644",
                    template: true,
                    variable: "",
                } as ITextTypeProp,
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
                } as IDocumentTypeProp,
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
                "        run(['mkdir', '-p', d])\n" +
                "    tf = tempfile.NamedTemporaryFile(dir=d, suffix='~', prefix='.tmp', delete=False, mode='w', encoding='utf-8')\n" +
                "    prompt('# writing to %s'%tf.name)\n" +
                "    tf.write(new['data'])\n" +
                "    tf.close()\n" +
                "\n" +
                "    run(['chown', new['user']+':'+new['group'], tf.name])\n" +
                "    run(['chmod', new['mode'], tf.name])\n" +
                "    run(['mv', '-f', tf.name, new['path']])\n",
            contains: [],
            depends: [],
            nameVariable: "name",
            hasVariables: false,
            hasDepends: true,
            hasSudoOn: false,
            hasContains: false,
            contairsName: "Has",
        } as IType,
    },
    {
        type: typeId,
        id: userId,
        name: "User",
        category: "Buildin",
        comment: "",
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
                {
                    type: TypePropType.text,
                    name: "uid",
                    title: "ID",
                    variable: "uid",
                    description: "User id of user",
                } as ITextTypeProp,
                {
                    type: TypePropType.bool,
                    name: "dockerPull",
                    title: "Docker Pull",
                    description: "Allow user to pull from docker",
                } as IBoolTypeProp,
                {
                    type: TypePropType.bool,
                    name: "dockerDeploy",
                    title: "Docker Deploy",
                    description: "Allow the user to deploy using docker",
                } as IBoolTypeProp,
                {
                    type: TypePropType.text,
                    name: "sessions",
                    title: "Sessions",
                    template: true,
                    description: "Static sessions to allow",
                } as ITextTypeProp,
                {
                    type: TypePropType.bool,
                    name: "dockerPush",
                    title: "Docker Push",
                    description: "Allow the user to push to docker",
                } as IBoolTypeProp,
                {
                    type: TypePropType.text,
                    name: "sslname",
                    title: "SSLName",
                    template: true,
                } as ITextTypeProp,
            ],
            script:
                "{{{preamble}}}\n" +
                "import pwd\n" +
                "old = content['old']\n" +
                "new = content['new']\n" +
                "\n" +
                "egroups = set()\n" +
                "for line in open('/etc/group', 'r', encoding='utf-8'):\n" +
                "    group = line.split(':')[0]\n" +
                "    egroups.add(group)\n" +
                "\n" +
                "new_exists = False\n" +
                "isSystem = False\n" +
                "if new:\n" +
                "    try:\n" +
                "        new_ent = pwd.getpwnam(new['name'])\n" +
                "        isSystem = new_ent.pw_uid < 1000\n" +
                "        new_exists = True\n" +
                "    except KeyError:\n" +
                "        pass\n" +
                "\t\n" +
                "\n" +
                "gid = new['uid'] if new and not new['system'] else \"100\"\n" +
                "\n" +
                "# Should we recreate with userdel/useradd just to change the UID/GID?\n" +
                "# If the new user exists on system and already has the correct ID, don't change.\n" +
                "change_uid_gid = new and new_exists and (str(new_ent.pw_uid) != new['uid'] or str(new_ent.pw_gid) != gid) and (not old or old['name'] == new['name'])\n" +
                "\n" +
                "with open('/tmp/kkk', 'w') as f:\n" +
                "\tf.write(json.dumps(content))\n" +
                "\n" +
                "if not new or (old and old['name'] != new['name']) or not new_exists or isSystem != new['system'] or change_uid_gid:\n" +
                '    if new and \'name\' in new: run(["bash", "-c", "! pgrep -U %s -l"%new[\'name\']])\n' +
                '    if old and \'name\' in old: run(["bash", "-c", "! pgrep -U %s -l"%old[\'name\']])\n' +
                "    \n" +
                "    if (new and old and old.get('uid', '') != new['uid']) or (new_exists and str(new_ent.pw_uid) != new['uid']):\n" +
                "        assert new['uid']\n" +
                "        run([\"find\", \"/data\", \"/opt\", \"/home\", \"-xdev\", \"-group\", old['uid'], '-exec', 'chgrp', '-h', new['uid'], '{}', '+'])\n" +
                "        run([\"find\", \"/data\", \"/opt\", \"/home\", \"-xdev\", \"-user\", old['uid'], '-exec', 'chown', '-h', new['uid'], '{}', '+'])\n" +
                "\n" +
                "    if old:\n" +
                "        runUnchecked(['userdel', old['name']])\n" +
                "        runUnchecked(['groupdel', old['name']])\n" +
                "\n" +
                "    if new:\n" +
                "        runUnchecked(['userdel', new['name']])\n" +
                "        runUnchecked(['groupdel', new['name']])\n" +
                "        args = ['useradd']\n" +
                "        groups = set(map(lambda x: x.strip(), new['groups'].split(',')))\n" +
                "        if new['system']:\n" +
                "            args.append('-M')\n" +
                "            args.append('-N')\n" +
                "            args.append('-r')\n" +
                "        else:\n" +
                "            args.append('-U')\n" +
                "            args.append('-m')\n" +
                "        if new['sudo'] or new['sudoOn']:\n" +
                "            groups.add('sudo')\n" +
                "            groups.add('wheel')\n" +
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
                "        if 'uid' in new:\n" +
                "            args.append('-u')\n" +
                "            args.append(new['uid'])\n" +
                "        args.append(new['name'])\n" +
                "        run(args)\n" +
                "else:\n" +
                "    args = ['usermod']\n" +
                "    groups = set(map(lambda x: x.strip(), new['groups'].split(',')))\n" +
                "    if new['password']:\n" +
                "        args.append('-p')\n" +
                "        args.append(new['password'])\n" +
                "    else:\n" +
                "        run(['passwd', '-d',  new['name']])\n" +
                "    if 'shell' in new and new['shell']:\n" +
                "        args.append('-s')\n" +
                "        args.append(new['shell'])\n" +
                "    if new['sudo'] or new['sudoOn']:\n" +
                "        groups.add('sudo')\n" +
                "        groups.add('wheel')\n" +
                "    if not new['system']:\n" +
                "        groups.add(new['name'])\n" +
                "    mygroups = groups & egroups\n" +
                "    args.append('-G')\n" +
                "    args.append(','.join(groups & egroups))\n" +
                "    args.append(new['name'])\n" +
                "    run(args)\n",
            contains: [],
            depends: [],
            hasTriggers: false,
            contairsName: "Has",
        } as IType,
    },
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
                } as IBoolTypeProp,
                {
                    type: TypePropType.text,
                    name: "id",
                    title: "ID",
                    description: "Group id",
                } as ITextTypeProp,
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
                "if not new or (old and new['name'] != old['name']) or new['system'] != isSystem or not exists or (not old or old.get('id', '') != new['id']):\n" +
                "    if (old and old.get('id', '') != new['id']) or (exists and str(ent.gr_gid) != new['id']):\n" +
                "        ent = grp.getgrnam(new['name'])\n" +
                "        if ent.gr_gid != int(new['id']):\n" +
                "            run([\"find\", \"/data\", \"/opt\", \"/home\", \"-xdev\", \"-group\", new['name'], '-exec', 'chgrp', '-h', new['id'], '{}', '+'])\n" +
                "    if old: runUnchecked(['groupdel', old['name']])\n" +
                "    if new: runUnchecked(['groupdel', new['name']])\n" +
                "    if new:\n" +
                "        args = ['groupadd']\n" +
                "        if new['system']:\n" +
                "            args.append('-r')\n" +
                "        if 'id' in new:\n" +
                "            args.append('-g')\n" +
                "            args.append(new['id'])\n" +
                "        args.append(new['name'])\n" +
                "        run(args)\n" +
                "elif 'id' in new:\n" +
                "    run([\"groupmod\", \"-g\", new['id'], new['name']])\n" +
                "\t\n",
            contains: [],
            depends: [],
            nameVariable: "",
            hasTriggers: false,
            hasDepends: false,
            hasSudoOn: false,
            contairsName: "Has",
        } as IType,
    },
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
                } as ITextTypeProp,
            ],
            script:
                "{{{preamble}}}\n" +
                "import hashlib\n" +
                "\n" +
                "old = content['old']\n" +
                "new = content['new']\n" +
                "\n" +
                "oldmagic = hashlib.sha224(old['allow'].encode('utf-8')).hexdigest() if old else None\n" +
                "newmagic = hashlib.sha224(new['allow'].encode('utf-8')).hexdigest() if new else None\n" +
                "\n" +
                "if not new or not old or old['allow'] != new['allow']:\n" +
                "    if oldmagic:\n" +
                '        oldcomment = "simple_admin_"+oldmagic\n' +
                '        output = subprocess.check_output(["ufw", "status", "numbered"]).decode()\n' +
                "        for line in reversed(output.split('\\n')):\n" +
                "            if not oldcomment in line:\n" +
                "               continue\n" +
                '            run(["ufw", "-f", "delete", line[1:].split(\']\',1)[0].strip()])\n' +
                "    if new:\n" +
                "        run(['ufw', 'allow', *new['allow'].split(' '), 'comment', \"simple_admin_\"+newmagic])\n",
            contains: [],
            depends: [],
            nameVariable: "",
            hasCategory: false,
            hasVariables: false,
            hasTriggers: false,
            hasDepends: false,
            hasSudoOn: false,
            hasContains: false,
            contairsName: "Has",
        } as IType,
    },
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
                } as ITextTypeProp,
            ],
            script: "{{{preamble}}}\n" + "run(['systemctl', 'reload', content['service']])\n",
        } as IType,
    },
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
                } as ITextTypeProp,
            ],
            script: "{{{preamble}}}\n" + "run(['systemctl', 'restart', content['service']])\n",
        } as IType,
    },
    {
        type: typeId,
        id: runTriggerId,
        name: "Shell",
        category: "Buildin",
        comment: "",
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
                } as ITextTypeProp,
            ],
            script: "{{{preamble}}}\n" + "runShell(content['code'])\n",
            nameVariable: "",
            hasCategory: false,
            hasVariables: false,
            hasTriggers: false,
            hasDepends: false,
            hasSudoOn: false,
            hasContains: false,
            contairsName: "Has",
        } as IType,
    },
    {
        type: typeId,
        id: packageId,
        name: "Package",
        category: "Buildin",
        comment: "",
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
                "os.umask(0o022)\n" +
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
                "run(['apt', 'update', '-y'])\n" +
                "run(['apt', 'install', '-y', deb])\n" +
                "run(['apt', 'autoremove', '-y'])\n",
            nameVariable: "",
            hasCategory: false,
            hasVariables: false,
            hasTriggers: false,
            hasDepends: false,
            hasSudoOn: false,
            hasContains: false,
            contairsName: "Has",
            contains: [],
            depends: [],
        } as IType,
    },
    {
        type: typeId,
        id: cronId,
        name: "Cron",
        category: "Buildin",
        comment: "Cron scripts",
        content: {
            contains: [],
            depends: [],
            nameVariable: "name",
            plural: "Cron",
            kind: "delta",
            hasCategory: false,
            hasVariables: false,
            hasTriggers: false,
            hasDepends: true,
            hasSudoOn: false,
            hasContains: false,
            contairsName: "Has",
            content: [
                {
                    type: TypePropType.text,
                    name: "user",
                    title: "User",
                    template: true,
                    lines: 0,
                    deployTitle: false,
                    variable: "myUser",
                    description: "The cron line to add",
                    default: "{{{user}}}",
                } as ITextTypeProp,
                {
                    type: TypePropType.text,
                    name: "mode",
                    title: "Mode",
                    template: true,
                    default: "755",
                    description: "The mode to store the script as",
                } as ITextTypeProp,
                {
                    type: TypePropType.text,
                    name: "path",
                    title: "Path",
                    template: true,
                    default: "/opt/cron/{{{name}}}",
                    variable: "path",
                    description: "The path to store the script at",
                } as ITextTypeProp,
                {
                    type: TypePropType.text,
                    name: "line",
                    title: "Line",
                    default: "2  1  1 * *  {{{myUser}}} {{{path}}}",
                    template: true,
                    lines: 1,
                    description: "The line to add to the cron tab",
                } as ITextTypeProp,
                {
                    type: TypePropType.text,
                    name: "group",
                    title: "Group",
                    default: "{{{group}}}",
                    template: true,
                    deployTitle: false,
                    description: "The group to store the script as",
                } as ITextTypeProp,
                {
                    type: TypePropType.document,
                    name: "script",
                    title: "Script",
                    template: true,
                    langName: "lang",
                    description: "The script",
                } as IDocumentTypeProp,
            ],
            script:
                "{{{preamble}}}\n" +
                "import tempfile, hashlib\n" +
                "old = content['old']\n" +
                "new = content['new']\n" +
                "\t\n" +
                "oldmagic = hashlib.sha224(old['name'].encode('utf-8')).hexdigest() if old else None\n" +
                "newmagic = hashlib.sha224(new['name'].encode('utf-8')).hexdigest() if new else None\n" +
                "\n" +
                "if old and (not new or not new['script']):\n" +
                "    run(['rm','-f', old['path']])\n" +
                "\n" +
                "if new:\n" +
                "    d = os.path.dirname(new['path'])\n" +
                "    if not os.path.exists(d):\n" +
                "        run(['mkdir', '-p', d])\n" +
                "    tf = tempfile.NamedTemporaryFile(dir=d, suffix='~', prefix='.tmp', delete=False, mode='w', encoding='utf-8')\n" +
                "    prompt('# writing to %s'%tf.name)\n" +
                "    tf.write(new['script'])\n" +
                "    tf.close()\n" +
                "\n" +
                "    # run(['chown', new['user']+':'+new['group'], tf.name])\n" +
                "    run(['chmod', new['mode'], tf.name])\n" +
                "    run(['mv', '-f', tf.name, new['path']])\n" +
                "\n" +
                "\n" +
                "\n" +
                'cron = ""\n' +
                'if os.path.exists("/etc/crontab"):\n' +
                '\twith open("/etc/crontab", "r", encoding="utf-8") as f:\n' +
                "\t\tcron = f.read()\n" +
                "\t\t\n" +
                "if oldmagic:\n" +
                '\tcron = "\\n".join([line for line in cron.split("\\n") if not line.endswith("#simple admin cron %s"%oldmagic)])\n' +
                "if newmagic:\n" +
                '\tcron = "\\n".join([line for line in cron.split("\\n") if not line.endswith("#simple admin cron %s"%newmagic)])\n' +
                "\n" +
                "if newmagic and new['line']:\n" +
                "\tif not cron.endswith('\\n'): \n" +
                "\t\tcron += '\\n'\n" +
                "\tcron += \"%s #simple admin cron %s\\n\"%(new['line'].strip(), newmagic)\n" +
                "\t\n" +
                'print("Write chron tab:")\n' +
                "print(cron)\n" +
                'with open("/etc/crontab~", "w", encoding="utf-8") as f:\n' +
                "\tf.write(cron)\n" +
                "run(['mv', '-f', \"/etc/crontab~\", \"/etc/crontab\"])\n",
            deployOrder: 0,
        } as IType,
    },
    {
        type: typeId,
        id: fstabId,
        name: "Fstab",
        category: "Buildin",
        comment: "Fstab entry",
        content: {
            contains: [],
            depends: [],
            nameVariable: "name",
            plural: "Fstab",
            kind: "delta",
            hasCategory: false,
            hasVariables: false,
            hasTriggers: false,
            hasDepends: true,
            hasSudoOn: false,
            hasContains: false,
            contairsName: "Has",
            content: [
                {
                    type: TypePropType.text,
                    name: "line",
                    title: "Line",
                    template: true,
                    description: "fstab entry",
                } as ITextTypeProp,
            ],
            script:
                "{{{preamble}}}\n" +
                "import tempfile, hashlib\n" +
                "old = content['old']\n" +
                "new = content['new']\n" +
                "\t\n" +
                "oldmagic = hashlib.sha224(old['name'].encode('utf-8')).hexdigest() if old else None\n" +
                "newmagic = hashlib.sha224(new['name'].encode('utf-8')).hexdigest() if new else None\n" +
                "\n" +
                'fstab = ""\n' +
                'if os.path.exists("/etc/fstab"):\n' +
                '\twith open("/etc/fstab", "r", encoding="utf-8") as f:\n' +
                "\t\tfstab = f.read()\n" +
                "\t\t\n" +
                "if oldmagic:\n" +
                '\tfstab = "\\n".join([line for line in fstab.split("\\n") if not line.endswith("#simple admin fstab %s"%oldmagic)])\n' +
                "if newmagic:\n" +
                '\tfstab = "\\n".join([line for line in fstab.split("\\n") if not line.endswith("#simple admin fstab %s"%newmagic)])\n' +
                "\n" +
                "if newmagic and new['line']:\n" +
                "\tif not fstab.endswith('\\n'): \n" +
                "\t\tfstab += '\\n'\n" +
                "\tfstab += \"%s #simple admin fstab %s\\n\"%(new['line'].strip(), newmagic)\n" +
                "\t\n" +
                'print("Write fstab tab:")\n' +
                "print(fstab)\n" +
                'with open("/etc/fstab~", "w", encoding="utf-8") as f:\n' +
                "\tf.write(fstab)\n" +
                "run(['mv', '-f', \"/etc/fstab~\", \"/etc/fstab\"])\n",
        } as IType,
    },
    {
        type: typeId,
        id: hostVariableId,
        name: "Host Variabel",
        category: "",
        comment: "",
        content: {
            contains: [],
            depends: [],
            nameVariable: "",
            plural: "Host Variabels",
            kind: "hostvar",
            hasCategory: false,
            hasVariables: true,
            hasTriggers: false,
            hasDepends: false,
            hasSudoOn: false,
            hasContains: false,
            contairsName: "Has",
            content: [],
            script: "",
        } as IType,
    },
    {
        type: typeId,
        id: limitId,
        name: "Limit",
        category: "Buildin",
        comment: "/etc/security/limits.conf entry",
        content: {
            contains: [],
            depends: [],
            nameVariable: "name",
            plural: "Limits",
            kind: "delta",
            hasCategory: false,
            hasVariables: false,
            hasTriggers: false,
            hasDepends: false,
            hasSudoOn: false,
            hasContains: false,
            contairsName: "Has",
            content: [
                {
                    type: TypePropType.text,
                    name: "line",
                    title: "Line",
                    template: true,
                    description: "limits line",
                } as ITextTypeProp,
            ],
            script:
                "{{{preamble}}}\n" +
                "import tempfile, hashlib\n" +
                "old = content['old']\n" +
                "new = content['new']\n" +
                "\t\n" +
                "oldmagic = hashlib.sha224(old['name'].encode('utf-8')).hexdigest() if old else None\n" +
                "newmagic = hashlib.sha224(new['name'].encode('utf-8')).hexdigest() if new else None\n" +
                "\n" +
                'fstab = ""\n' +
                'if os.path.exists("/etc/security/limits.conf"):\n' +
                '\twith open("/etc/security/limits.conf", "r", encoding="utf-8") as f:\n' +
                "\t\tfstab = f.read()\n" +
                "\t\t\n" +
                "if oldmagic:\n" +
                '\tfstab = "\\n".join([line for line in fstab.split("\\n") if not line.endswith("#simple admin limit %s"%oldmagic)])\n' +
                "if newmagic:\n" +
                '\tfstab = "\\n".join([line for line in fstab.split("\\n") if not line.endswith("#simple admin limit %s"%newmagic)])\n' +
                "\n" +
                "if newmagic and new['line']:\n" +
                "\tif not fstab.endswith('\\n'): \n" +
                "\t\tfstab += '\\n'\n" +
                "\tfstab += \"%s #simple admin limit %s\\n\"%(new['line'].strip(), newmagic)\n" +
                "\t\n" +
                'print("Write /etc/security/limits.conf:")\n' +
                "print(fstab)\n" +
                'with open("/etc/security/limits.conf~", "w", encoding="utf-8") as f:\n' +
                "\tf.write(fstab)\n" +
                "run(['mv', '-f', \"/etc/security/limits.conf~\", \"/etc/security/limits.conf\"])\n",
        } as IType,
    },
    {
        type: typeId,
        id: runId,
        name: "Run",
        category: "",
        comment: "",
        content: {
            nameVariable: "",
            plural: "Run instances",
            kind: "delta",
            hasCategory: true,
            hasVariables: false,
            hasTriggers: true,
            hasDepends: true,
            hasSudoOn: false,
            hasContains: false,
            contairsName: "Has",
            content: [
                {
                    type: TypePropType.document,
                    name: "run",
                    title: "Run",
                    variable: "run",
                    template: true,
                    lang: "Python",
                } as IDocumentTypeProp,
            ],
            script: "{{{preamble}}}\n" + "{{{run}}}\n",
        } as IType,
    },
    {
        type: typeId,
        id: shellTriggerId,
        name: "Shell",
        category: "Buildin",
        comment: "",
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
                } as ITextTypeProp,
            ],
            script: "{{{preamble}}}\n" + "runShell(content['code'])\n",
            nameVariable: "",
            hasCategory: false,
            hasVariables: false,
            hasTriggers: false,
            hasDepends: false,
            hasSudoOn: false,
            hasContains: false,
            contairsName: "Has",
        } as IType,
    },
    {
        type: typeId,
        id: systemdServiceId,
        name: "Systemd service",
        category: "",
        comment: "",
        content: {
            contains: [],
            depends: [],
            nameVariable: "systemdService",
            plural: "Systemd services",
            kind: "delta",
            hasCategory: false,
            hasVariables: false,
            hasTriggers: false,
            hasDepends: true,
            hasSudoOn: false,
            hasContains: false,
            contairsName: "Has",
            content: [
                {
                    type: TypePropType.document,
                    name: "unit",
                    template: true,
                } as IDocumentTypeProp,
                {
                    type: TypePropType.document,
                    name: "env",
                    template: true,
                } as IDocumentTypeProp,
            ],
            script:
                "{{{preamble}}}\n" +
                "\n" +
                "old = content['old']\n" +
                "new = content['new']\n" +
                "if old:\n" +
                '    runUnchecked(["systemctl", "disable", old["name"]])\n' +
                '    runUnchecked(["systemctl", "stop", old["name"]])\n' +
                '    path = "/etc/systemd/system/%s.service" % old["name"]\n' +
                "    if os.path.exists(path):\n" +
                "        os.unlink(path)\n" +
                '    path = "/etc/systemd/system/%s.env" % old["name"]\n' +
                "    if os.path.exists(path):\n" +
                "        os.unlink(path)\n" +
                "\n" +
                "if new:\n" +
                '    path = "/etc/systemd/system/%s.service" % new["name"]\n' +
                '    with open(path + "~", "w") as fp:\n' +
                '        fp.write(new["unit"])\n' +
                '    os.rename(path + "~", path)\n' +
                "    \n" +
                '    if new["env"]:\n' +
                '        path = "/etc/systemd/system/%s.env" % new["name"]\n' +
                '        with open(os.open(path+"~", os.O_CREAT | os.O_WRONLY, 0o400), "w") as fp:\n' +
                '            fp.write(new["env"])\n' +
                '            os.rename(path + "~", path)\n' +
                "    \n" +
                '    run(["systemctl", "daemon-reload"])\n' +
                '    run(["systemctl", "enable", new["name"]])\n' +
                '    run(["systemctl", "start", new["name"]])\n',
        } as IType,
    },
    {
        type: rootId,
        id: rootInstanceId,
        name: "Root",
        category: "",
        comment: "",
        content: {
            variables: [],
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
                "os.environ['DEBIAN_FRONTEND'] = 'noninteractive'\n" +
                'runas = "root"\n' +
                "\n" +
                "def prompt(value):\n" +
                "\tglobal runas\n" +
                "\tos.write(1, ('\\033[94m%s@%s:%s$\\033[0m %s\\r\\n'%(runas, hostname, os.getcwd(), value)).encode('utf-8'))\n" +
                "\n" +
                "def run(args):\n" +
                "\tglobal runas\n" +
                "\tprompt(' '.join(map(shlex.quote, args)))\n" +
                '\tif runas != "root":\n' +
                "\t\tsubprocess.check_call(['sudo', '-u', runas] + args)\n" +
                "\telse:\n" +
                "\t\tsubprocess.check_call(args)\n" +
                "\n" +
                "def runUnchecked(args):\n" +
                "\tglobal runas\n" +
                "\tprompt(' '.join(map(shlex.quote, args)))\n" +
                '\tif runas != "root":\n' +
                "\t\tsubprocess.call(['sudo', '-u', runas] + args)\n" +
                "\telse:\n" +
                "\t\tsubprocess.call(args)\n" +
                "\n" +
                "def runShell(cmd):\n" +
                '\tcmd = "%s" % (cmd,)\n' +
                "\tprompt(cmd)\n" +
                '\tif runas != "root":\n' +
                '\t\tcmd = "sudo -u %s %s" % (runas, cmd)\n' +
                "\tsubprocess.call(cmd, shell=True)\n" +
                "\n" +
                'def su(user="root"):\n' +
                "\tglobal runas\n" +
                '\tprompt("su %s"%shlex.quote(user))\n' +
                "\trunas = user\n" +
                "\n" +
                "def cd(d):\n" +
                '\tprompt("cd %s"%shlex.quote(d))\n' +
                "\tos.chdir(d)\n",
            status: "",
            monitor: "",
            path: "",
            user: "{{{user}}}",
            group: "{{{user}}}",
            mode: "644",
            lang: "",
            data: "",
            secrets: [],
        },
    },
];
