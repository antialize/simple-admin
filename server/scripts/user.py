import sys, json, subprocess

def run(args):
    print("> %s"%(" ".join(args)))
    subprocess.check_call(args)

content = json.loads(sys.stdin.read())
old = content['old']
new = content['new']

egroups = set()
for line in open('/etc/group', 'r'):
    group = line.split(":")[0]
    egroups.add(group)

if not new or not old or old['name'] != new['name'] or old['system'] != new['system']:
    if old:
        run(['userdel', old['name']])
    if new:
        args = ['useradd']
        groups = set(new['groups'])
        if new['system']:
            args.append('-M')
            args.append('-N')
            args.append('-r')
        else:
            args.append('-U')
            args.append('-m')
        if new['sudo']:
            groups.add('sudo')
        if new['password']:
            args.append('-p')
            args.append(new['password'])
                
    args.append('-G')
    args.append(','.join(groups & egroups))
    args.append(new['name'])
    run(args)
else:
    args = ['usermod']
    groups = set(new['groups'])
    if new['password']:
        args.append('-p')
        args.append(new['password'])
    else:
        run(['passwd', '-d',  new['name']])
    if new['sudo']:
        groups.add('sudo')
    if not new['system']:
        groups.add(new['name'])
    args.append('-G')
    args.append(','.join(groups & egroups))
    args.append(new['name'])
    run(args)
