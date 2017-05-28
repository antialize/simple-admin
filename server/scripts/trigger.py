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

if content['type'] == 'reload':
    run(["systemctl", "reload", content['name']])
elif content['type'] == 'restart':
    run(["systemctl", "restart", content['name']])