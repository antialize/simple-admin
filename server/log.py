import os, sys

if sys.argv[1] == 'dmesg':
    os.execvp("dmesg", ['dmesg', '-w', '-L=never'])
elif sys.argv[1] == 'file':
    os.execvp("tail", ['tail', '-f', '-n', '1000', sys.argv[2]])
elif sys.argv[1] == 'journal':
    if len(sys.argv) > 2:
        os.execvp("journalctl", ['journalctl', '-f', '-n', '1000', '-u', sys.argv[2]])
    else:
        os.execvp("journalctl", ['journalctl', '-f', '-n', '1000'])
