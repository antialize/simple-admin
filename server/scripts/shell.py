import pty
import os
import sys
import termios
import struct
import fcntl
import select

(pid, fd) = pty.fork()
if pid == 0:
    os.environ['name'] = 'xterm-color'
    os.environ['TERM'] = 'xterm'
    os.execl("/bin/bash", "/bin/bash")

flag = fcntl.fcntl(0, fcntl.F_GETFL)
fcntl.fcntl(0, fcntl.F_SETFL, flag | os.O_NONBLOCK)

flag = fcntl.fcntl(fd, fcntl.F_GETFL)
fcntl.fcntl(fd, fcntl.F_SETFL, flag | os.O_NONBLOCK)

data= b'';
while True:
    r, _, _ = select.select([fd, 0], [] ,[])
    if fd in r:
        os.write(1, os.read(fd, 1024*1024))
    if 0 in r:
        new = os.read(0, 1024*1024)
        data = data + new
        if not new: break
        while True:
            pkg, p, rem = data.partition(b'\0')
            if len(p) == 0: break
            data = rem
            if pkg[0] == ord(b'd'):
                os.write(fd, pkg[1:])
            elif pkg[0] == ord(b'r'):
                rows, cols = pkg[1:].split(b',')
                winsize = struct.pack("HHHH", int(rows), int(cols), 0, 0)
                fcntl.ioctl(fd, termios.TIOCSWINSZ, winsize)

os.waitpid(pid, 0)