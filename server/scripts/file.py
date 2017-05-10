import sys, json, subprocess, tempfile, os

def run(args):
    print("> %s"%(" ".join(args)))
    subprocess.check_call(args)

content = json.loads(sys.stdin.read())
old = content['old']
new = content['new']

if not new:
    run(["rm", "-f", old['path']])
else:
    tf = tempfile.NamedTemporaryFile(dir=os.path.dirname(new['path']), suffix="~", prefix=".tmp", delete=False, mode="w", encoding="utf-8")
    print("> writing to %s"%tf.name)
    tf.write(new['data'])
    tf.close()
    run(["chown", new['user']+":"+new['group'], tf.name])
    run(["chmod", new['mode'], tf.name])
    run(["mv", '-f', tf.name, new['path']])
