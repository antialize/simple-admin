import sys, json, subprocess, pty, fcntl, os, select, grp

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


exists = False
isSystem = False
if new:
    try:
        ent = grp.getgrnam(new['name'])
        isSystem = ent.gr_gid < 1000
        exists = True
    except KeyError:
        pass

if not new or (old and new['name'] != old['name']) or new['system'] != isSystem or not exists:
    if old:
        run2(['groupdel', old['name']])
    if new:
        args = ['groupadd']
        if new['system']:
            args.append('-r')
        args.append(new['name'])
        run(args)
