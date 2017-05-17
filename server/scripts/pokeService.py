import os, sys
os.execvp("systemctl", ["systemctl", sys.argv[1], sys.argv[2]])
