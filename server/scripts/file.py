import sys, json, subprocess, pty, fcntl, os, select, tempfile

content = json.loads(sys.stdin.read())

(pid, fd) = pty.fork()
if pid != 0:
    try: 
        while True:
            d = os.read(fd, 1024*1024)
            if not d: break
            os.write(1, d)
    except OSError:
        pass

    (_, state) = os.waitpid(pid, 0)
    sys.exit(-os.WTERMSIG(state) if os.WTERMSIG(state) != 0 else os.WEXITSTATUS(state))

os.environ['name'] = 'xterm-color'
os.environ['TERM'] = 'xterm'

def run(args):
    os.write(1, ("> %s\n"%(" ".join(args))).encode("utf-8"))
    subprocess.check_call(args)

def run2(args):
    os.write(1, ("> %s\n"%(" ".join(args))).encode("utf-8"))
    subprocess.call(args)

old = content['old']
new = content['new']

if not new:
    run(["rm", "-f", old['path']])
else:
    d = os.path.dirname(new['path'])
    if not os.path.exists(d):
        run(["sudo", '-u', new['user'], 'mkdir', '-p', d])
    tf = tempfile.NamedTemporaryFile(dir=d, suffix="~", prefix=".tmp", delete=False, mode="w", encoding="utf-8")
    os.write(1, ("> #writing to %s\n"%tf.name).encode("utf-8"))
    tf.write(new['data'])
    tf.close()

    run(["chown", new['user']+":"+new['group'], tf.name])
    run(["chmod", new['mode'], tf.name])
    run(["mv", '-f', tf.name, new['path']])
