import sys, json, subprocess

def run(args):
    print("> %s"%(" ".join(args)))
    subprocess.check_call(args)

content = json.loads(sys.stdin.read())
old = content['old']
new = content['new']

if not new or not old or new['name'] != old['name'] or new['system'] != old['system']:
    if old:
        run(['groupdel', old['name']])
    if new:
        args = ['groupadd']
        if content['system']:
            args.append('-r')
        args.append(content['name'])
        run(args)
