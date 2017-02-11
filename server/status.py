import os
import json
import time
import sys

while True:
    un = os.uname()
    uptime = open("/proc/uptime", "r").read().strip().split(' ')
    loadavg = open("/proc/loadavg", "r").read().strip().split(' ')
    
    processes = loadavg[3].split('/')

    status = {'uname': {'sysname': un[0], 'nodename': un[1], 'release': un[2], 'version': un[3], 'machine': un[4]},
            'lsb_release': {},
            'uptime': {'total': float(uptime[0]), 'idle': float(uptime[1])},
            'loadavg': {'minute': float(loadavg[0]),
                        'five_minute': float(loadavg[1]),
                        'ten_minute': float(loadavg[2]),
                        'active_processes': int(processes[0]),
                        'total_processes': int(processes[1])},
            'mounts': [],
            'meminfo': {}
    }

    for line in open("/etc/lsb-release", "r").read().strip().split('\n'):
        p = line.split('=',2)
        if len(p) < 2: continue
        if p[0] == 'DISTRIB_ID':
            status['lsb_release']['id'] = p[1]
        elif p[0] == 'DISTRIB_RELEASE':
            status['lsb_release']['release'] = p[1]
        elif p[0] == 'DISTRIB_CODENAME':
            status['lsb_release']['codename'] = p[1]
        elif p[0] == 'DISTRIB_DESCRIPTION':
            status['lsb_release']['description'] = p[1]
    
    for line in open("/proc/meminfo", "r").read().strip().split('\n'):
        p = line.split()
        if len(p) < 2: continue
        elif p[0] == "MemTotal:": status['meminfo']['total'] = 1024 * int(p[1])
        elif p[0] == "MemFree:": status['meminfo']['free'] = 1024 * int(p[1])
        elif p[0] == "MemAvailable:": status['meminfo']['avail'] = 1024 * int(p[1])
        elif p[0] == "SwapTotal:": status['meminfo']['swap_total'] = 1024 * int(p[1])
        elif p[0] == "SwapFree:": status['meminfo']['swap_free'] = 1024 * int(p[1])

    skipfs = frozenset(['cgroup', 'debugfs', 'fusectl', 'tmpfs', 'ecryptfs', 'fuse.gvfsd-fuse',
                        'hugetlbfs', 'sysfs', 'proc', 'devtmpfs', 'devpts', 'securityfs', 'autofs', 'pstore', 'mqueue'])
        
    for line in open("/proc/self/mountinfo").read().split('\n'):
        line = line.split(' ')
        if len(line) < 10: continue
        target, fstype, src = line[4], line[8], line[9]
        if fstype in skipfs: continue
        stat = os.statvfs(target)
        status['mounts'].append(
            {
                'target': target,
                'src': src,
                'fstype': fstype,
                'block_size':  stat.f_bsize,
                'blocks': stat.f_blocks,
                'free_blocks': stat.f_bfree,
                'avail_blocks': stat.f_bavail,
                'files': stat.f_files,
                'free_files': stat.f_ffree,
                'avail_files': stat.f_favail,
            })

    sys.stdout.write(json.dumps(status, indent=4))
    sys.stdout.write('\00')
    sys.stdout.flush()
    time.sleep(10)
