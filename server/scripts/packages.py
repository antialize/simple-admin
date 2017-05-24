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
os.environ['DEBIAN_FRONTEND'] = 'noninteractive'

def run(args):
    os.write(1, ("> %s\n"%(" ".join(args))).encode("utf-8"))
    subprocess.check_call(args)

def run2(args):
    os.write(1, ("> %s\n"%(" ".join(args))).encode("utf-8"))
    subprocess.call(args)

version = 1
try:
    version = int(subprocess.check_output(["dpkg-query","-W","-f='${Version}'", "simple-admin-meta"]).decode("utf-8")[1:-1].split(".")[0]) + 1
except subprocess.CalledProcessError:
    pass

base = tempfile.mkdtemp()
os.chmod(base, 0o755)
d = os.path.join(base, "simple-admin-meta-%d.0"%version)

deb = "%s.deb"%d
os.mkdir(d)
os.mkdir(os.path.join(d,"DEBIAN"))
with open(os.path.join(d,"DEBIAN","control"), "w", encoding="utf-8") as f:
    f.write("""Section: unknown
Priority: optional
Maintainer: Simple admin <sadmin@example.com>
Standards-Version: 3.9.6
Version: %d.0
Package: simple-admin-meta
Architecture: all
Depends: %s
Description: Simple admin dependency package
"""%(version, ", ".join(content['packages'])))

run(["dpkg-deb", "--build", d, deb])
run(["apt", "install", "-y", deb])
run(["apt", "autoremove", "-y"])


