import sys, json, subprocess, pty, fcntl, os, select, pwd

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

old = content['old']
new = content['new']

if not new or not old or old['allow'] != new['allow']:
    if old:
        run(["ufw", "reject", *old['allow'].split(" ")])
    if new:
        run(["ufw", "allow", *new['allow'].split(" ")])
