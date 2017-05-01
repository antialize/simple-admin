#!/usr/bin/python3
"""
Send system status over stdout as json objects
"""

import json
import sys
import os
import dbus
from dbus import Interface
from dbus.mainloop.glib import DBusGMainLoop
from gi.repository import GLib
import time
from subprocess import check_output

DBusGMainLoop(set_as_default=True)
bus = dbus.SystemBus()

class Service:
    def __init__(self, path, monitor):
        self.path = path
        self.monitor = monitor
        self.obj = bus.get_object(
            'org.freedesktop.systemd1',
            path,)
        
        self.service = dbus.Interface(
            self.obj,
            'org.freedesktop.systemd1.Service',)

        self.unit = dbus.Interface(
            self.obj,
            'org.freedesktop.systemd1.Unit',)

        self.properties_interface = dbus.Interface(
            self.obj,
            'org.freedesktop.DBus.Properties')
        
        self.properties_interface.connect_to_signal(
            'PropertiesChanged',
            self.on_properties_changed)
        
        self.props = {}
        self.readProperties()

        
    def readProperties(self):
        for n in ['Names', 'LoadState', 'ActiveState', 'SubState']:
            self.props[n] = self.properties_interface.Get(self.unit.dbus_interface, n)
        for n in ['Slice', 'StatusText']:
            self.props[n] = self.properties_interface.Get(self.service.dbus_interface, n)
        
    def on_properties_changed(self, *arg, **kargs):
        self.readProperties()
        self.monitor.changed = True
        
class SystemdMonitor:
    def __init__(self):
        self.services = []
        self.systemd = bus.get_object('org.freedesktop.systemd1', '/org/freedesktop/systemd1')
        self.manager = Interface(self.systemd, dbus_interface='org.freedesktop.systemd1.Manager')
        self.manager.connect_to_signal('UnitNew', self.load)
        self.manager.connect_to_signal('UnitRemoved', self.load)
        self.manager.connect_to_signal('UnitFilesChanged', self.load)
        self.load()
        
    def load(self, *arg, **kargs):
        self.changed = True
        for ser in self.services:
            del ser

        for unit in self.manager.ListUnits():
            if not unit[0].endswith(".service"): continue
            self.services.append(Service(unit[6], self))
            
    def dump(self):
        ans = {}
        for ser in self.services:
            if ser.props['Slice'] != 'system.slice': continue
            ans[str(ser.props['Names'][0])] = {
                 'name': str(ser.props['Names'][0]),
                 'loadState': str(ser.props['LoadState']),
                 'activeState': str(ser.props['ActiveState']),
                 'subState': str(ser.props['SubState']),
                 'StatusText': str(ser.props['StatusText'])}
        return ans


def deltaEncode(old, new, delta):
    for k in new:
        v = new[k]
        if not k in old:
            delta[k] = v
        else: 
            ov = old[k]
            del old[k]
            if ov != v:
                delta[k] = v
    for k in old:
        delta[k] = None

systemdmon = SystemdMonitor()
lastState = {'mounts': {}, 'services': {}, 'first': True}
count = 0

def emitstatus():
    global lastState, count
    
    uptime = open("/proc/uptime", "r", encoding='ascii').read().strip().split(' ')
    loadavg = open("/proc/loadavg", "r", encoding='ascii').read().strip().split(' ')
    processes = loadavg[3].split('/')
        
    netread=0
    netwrite=0
    for line in open('/proc/net/dev', mode='r', encoding='ascii'):
        line = line.split()
        if line[0][-1] != ':' or line[0] == 'lo:': continue 
        netread += int(line[1])
        netwrite += int(line[9])

    #We assume USER_HZ = 100
    line = open('/proc/stat', mode='r', encoding='ascii').readline().split()
    cpu = (int(line[1]) + int(line[2]) + int(line[3])) / 100.0

    diskread=0
    diskwrite=0
    for line in open('/proc/diskstats', mode='r', encoding='ascii'):
        line = line.split()
        if not line[2].startswith('sd') or line[2][-1].isnumeric(): continue
        #We assue a block size of 512
        diskread += int(line[5])*512
        diskwrite += int(line[9])*512

    status = {'uptime': {'total': float(uptime[0]), 'idle': float(uptime[1])},
            'loadavg': {'minute': float(loadavg[0]),
                        'five_minute': float(loadavg[1]),
                        'ten_minute': float(loadavg[2]),
                        'active_processes': int(processes[0]),
                        'total_processes': int(processes[1])},
            'netread': netread,
            'netwrite': netwrite,
            'diskread': diskread,
            'diskwrite': diskwrite,
            'cpu': cpu,
            'mounts': {},
            'services': {},
            'meminfo': {},
            'uname': None,
            'lsb_release': None,
            'time': time.time()
    }
    state = {'mounts': {}, 'services': {}, 'first': False}

    if lastState['first']:
        un = os.uname()
        status['uname'] = {'sysname': un[0], 'nodename': un[1], 'release': un[2], 'version': un[3], 'machine': un[4]}
        status['lsb_release'] = {}

        for line in open("/etc/lsb-release", "r", encoding='ascii').read().strip().split('\n'):
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

    for line in open("/proc/meminfo", "r", encoding='ascii').read().strip().split('\n'):
        p = line.split()
        if len(p) < 2: continue
        elif p[0] == "MemTotal:": status['meminfo']['total'] = 1024 * int(p[1])
        elif p[0] == "MemFree:": status['meminfo']['free'] = 1024 * int(p[1])
        elif p[0] == "MemAvailable:": status['meminfo']['avail'] = 1024 * int(p[1])
        elif p[0] == "SwapTotal:": status['meminfo']['swap_total'] = 1024 * int(p[1])
        elif p[0] == "SwapFree:": status['meminfo']['swap_free'] = 1024 * int(p[1])



    if count % 6 == 0:
        #Write filesystem information every 30 seconds
        skipfs = frozenset(['cgroup', 'debugfs', 'fusectl', 'tmpfs', 'ecryptfs', 'fuse.gvfsd-fuse',
                            'hugetlbfs', 'sysfs', 'proc', 'devtmpfs', 'devpts', 'securityfs', 'autofs', 'pstore', 'mqueue'])
            
        for line in open("/proc/self/mountinfo", encoding='ascii').read().split('\n'):
            line = line.split(' ')
            if len(line) < 10: continue
            target, fstype, src = line[4], line[8], line[9]
            if fstype in skipfs or src[0] != '/': continue
            stat = os.statvfs(target)

            state['mounts'][target] = {
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
            }
        deltaEncode(lastState['mounts'], state['mounts'], status['mounts'])
    else:
        state['mounts'] = lastState['mounts']
      
    if systemdmon.changed:
         systemdmon.changed = False
         state['services'] = systemdmon.dump()
         deltaEncode(lastState['services'], state['services'], status['services'])

    if count % 180 == 0:
        # Write out smart information every 15 minutes
        scanOut = check_output(["smartctl", "--scan"]).decode('ascii')
        status['smart'] = {}
        for line in scanOut.split("\n"):
            if not line: continue
            dev = line.split()[0]

            status['smart'][dev] = []
            out = check_output(["smartctl", "-A", dev]).decode('ascii')
            start = True
            for line in out.split("\n"):
                if start:
                    if line.startswith("ID# "): start = False
                    continue
                if not line: break
                line = line.split()
                status['smart'][dev].append({'id':int(line[0]), 'name': line[1], 'raw_value': int(line[9])})
                
    sys.stdout.write(json.dumps(status, indent=4))
    sys.stdout.write('\00')
    sys.stdout.flush()
    lastState = state
    count += 1
    return True

#fd = sys.stdin.fileno()
#def readIn(fd, cond):
#    print("ReadIn %d"%len(os.read(fd, 1024*1024)))
#    return True

GLib.timeout_add_seconds(5, emitstatus)
#GLib.io_add_watch(fd, GLib.IO_IN | GLib.IO_PRI | GLib.IO_ERR | GLib.IO_HUP, readIn)

emitstatus()
loop = GLib.MainLoop()
loop.run()
