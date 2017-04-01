#!/usr/bin/python3

import asyncio, json, sys, base64, tempfile, os
from concurrent.futures import ThreadPoolExecutor
import logging, traceback, ssl

io_pool_exc = ThreadPoolExecutor()
logging.basicConfig(format='%(levelname)s:%(message)s', level=logging.DEBUG)

############################################################################################################################
# Configuration
############################################################################################################################

command_server_host = "127.0.0.1"
command_server_port = 18080
reconnect_time = 10 #In seconds
output_queue_size = 100
input_queue_size = 10

############################################################################################################################
# Job stuff
############################################################################################################################

class JobError(Exception):
    def __init__(self, id, msg):
        self.msg = msg
        self.id = id

    def __str__(self):
        return "%s (%s)"%(self.msg, self.id)

def job(func):
    """Decorate a job function to handle errors and return success and such"""
    async def inner(running_jobs, obj, output_queue, *args, **kwargs):
        id = obj['id']
        try:
            res = await func(obj, output_queue, *args, **kwargs)
            if res == True:
                await output.put({'type': 'success', 'id': d})
            elif isinstance(res, dict):
                res['id'] = id
                await output_queue.put(res)
            else:
                log.error("%d: Unknown error"%id)
                await output_queue.put({'type': 'failure', 'id':id, 'failure_type': 'unknown'})
        except asyncio.CancelledError as e:
            await output_queue.put({'type': 'failure', 'id':id, 'failure_type': type(e).__name__, 'message': str(e)})
        except Exception as e:
            logging.error("%d: %s : %s"%(id,  type(e).__name__, str(e)))
            logging.error(traceback.format_exc())
            await output_queue.put({'type': 'failure', 'id':id, 'failure_type': type(e).__name__, 'message': str(e)})
        finally:
            logging.info("%d: finished"%id)
            if id in running_jobs:
                del running_jobs[id]
    return inner

############################################################################################################################
# Jobs for running scripts
############################################################################################################################

@job
async def run_instant(obj, output_queue):
    """Run a script and return its output if it succeded""" 
    with tempfile.NamedTemporaryFile(mode="w", encoding="utf-8", suffix=obj['name']) as f:
        f.write(obj['content'])
        f.flush()
        try:
            proc = await asyncio.create_subprocess_exec(
                obj['interperter'], f.name, *obj['args'], stdin=None, stderr=asyncio.subprocess.PIPE, stdout=asyncio.subprocess.PIPE)
            stdout, stderr = await proc.communicate()
            code = await proc.wait()
            if code != 0:
                return {'type': 'failure', 'failure_type': 'script', 'code': code, 'stdout': stdout.decode('utf-8', 'replace'), 'stderr': stderr.decode('utf-8', 'replace')}
            if obj['output_type'] == 'base64':
                data = base64.b64encode(stdout).decode()
            elif obj['output_type'] == 'json':
                data = json.loads(stdout.decode("utf-8", "strict"))
            elif obj['output_type'] == 'utf-8':
                data = stdout.decode("utf-8", "strict")
            else:
                data = stdout.decode("utf-8", "replace")
            proc = None
        finally:
            if proc != None: proc.kill();
        return {'type': 'success', 'data': data}

async def script_input_handler(stdin, input_queue):
    """Send data to stdin"""
    while True:
        obj = await input_queue.get()
        if obj == None:
            stdin.close()
            break
        if 'data' in obj:
            stdin.write(base64.b64decode(obj['data']))
            await stdin.drain()
        if obj['type'] == 'close':
            stdin.close()
            break

async def script_output_handler(id, reader, src, output_queue, type):
    """Read data from stdout or std err"""
    part = b''
    while True:
        if type == 'blocked_json':
            try:
                data = await reader.readuntil(b'\0')
                data = json.loads(data[:-1].decode('utf-8','strict'))
            except asyncio.streams.IncompleteReadError:
                data = None
        elif type == 'text':
            data = await reader.read(1024*1024)
            data = part + data
            part = ""
            i = len(data)
            while i > 0 and data[i-1] > 127:
                i -= 1
            part = data[i:]
            data = data[:i].decode('utf-8', 'replace')
        else:
            data = await reader.read(1024*1024)
            if data: data = base64.b64encode(data).decode()
        eof = reader.at_eof() or not data
        await output_queue.put({'type': 'data', 'id': id, 'data': data, 'source': src, 'eof': eof})
        if eof: break

@job
async def run_script(obj, output_queue, input_queue):
    """Run a script returning output as available"""
    
    with tempfile.NamedTemporaryFile(mode="w", encoding="utf-8", suffix=obj['name']) as f:
        f.write(obj['content'])
        f.flush()
        try:
            proc = await asyncio.create_subprocess_exec(
                obj['interperter'], f.name, *obj['args'], stdin=asyncio.subprocess.PIPE, stderr=asyncio.subprocess.PIPE, stdout=asyncio.subprocess.PIPE)
 
            stdin_type = obj.get('stdin_type', 'binary')
            stdout_type = obj.get('stdout_type', 'binary')
            stderr_type = obj.get('stderr_type', 'text')
            lst = []
            if stdin_type != "none":
                lst.append(script_input_handler(proc.stdin, input_queue))
            else:
                proc.stdin.close()

            if stdout_type != "none":
                lst.append(script_output_handler(
                    obj['id'], proc.stdout, 'stdout', output_queue, stdout_type))

            if stderr_type != "none":
                lst.append(script_output_handler(
                    obj['id'], proc.stderr, 'stderr', output_queue, stderr_type))
            logging.info("Wating for list %d", len(lst))
            await asyncio.wait(lst)
            logging.info("Waiting for process")
            code = await proc.wait()
            proc = None
            logging.info("Script done %d %d"%(obj['id'], code))
        finally:
            if proc != None:
                proc.kill()
        return {'type': 'success', 'code': code} 

############################################################################################################################
# Jobs for pty access
############################################################################################################################
    
############################################################################################################################
# Jobs for reading and writing files
############################################################################################################################

@job
async def read_small_text(obj, output_queue):
    """Read a small text file and send the output"""
    id = obj['id']
    path = obj['path']
    with open(path, 'r', encoding="utf-8") as f:
        data = await loop.run_in_executor(io_pool_exc, lambda: f.read())
        return {'type': 'success', 'data': data}

@job
async def write_small_text(obj, output_queue):
    """Write a file that we get in chunks"""
    path = obj['path']
    (fd, tmppath) = tempfile.mkstemp(dir=os.path.dirname(path), prefix = ".#", suffix = "~")
    try:
        os.write(fd, obj['data'].encode('utf-8'))
        os.close(fd)
        fd = -1
        os.rename(tmppath, path)
        tmppath = None
    finally:
        if tmppath:
            os.unlink(tmppath)
        if fd != -1:
            os.close(fd)
    return True
        
@job
async def read_file(obj, output_queue):
    """Read a file and send in in chunks"""
    id = obj['id']
    path = obj['path']
    with open(path, 'rb') as f:
        while True:
            data = await loop.run_in_executor(io_pool_exc, lambda: f.read(1024*512))
            if not data: break
            await output_queue.put({'type': 'data',  'id': id, 'data': base64.b64encode(data).decode()})
    return True

@job
async def write_file(obj, output_queue, input_queue):
    """Write a file that we get in chunks"""
    path = obj['path']
    (fd, tmppath) = tempfile.mkstemp(dir=os.path.dirname(path), prefix = ".#", suffix = "~")
    try:
        if 'data' in obj:
            data = base64.b64decode(obj['data'])
            await loop.run_in_executor(io_pool_exc, lambda: os.write(fd, data))
        while True:
            o = await input_queue.get()
            if 'data' in obj:
                data = base64.b64decode(o['data'])
                await loop.run_in_executor(io_pool_exc, lambda: f.write(fd, data))
            if o['type'] == 'done':
                break
        os.close(fd)
        fd = -1
        os.rename(tmppath, path)
        tmppath = None
    finally:
        if tmppath:
            os.unlink(tmppath)
        if fd != -1:
            os.close(fd)
    return True

############################################################################################################################
# Setup
############################################################################################################################

# TODO


############################################################################################################################
# Main loop
############################################################################################################################

loop = asyncio.get_event_loop()

async def package_sender(writer, output_queue):
    """Send packages to the control server"""
    while True:
        item = await output_queue.get()
        if item == None: break
        writer.write(json.dumps(item).encode("utf-8", "strict"))
        writer.write(b'\36')
        await writer.drain()
    writer.write(b'\4')
    await writer.drain()

async def client():
    jobtypes = {
        'write_small_text': {
            'func': write_small_text,
            'input': False
        },
        'read_small_text': {
            'func': read_small_text,
            'input': False
        },
        'write_file': {
            'func': write_file,
            'input': True
        },
        'read_file': {
            'func': read_file,
            'input': False
        },
        'run_instant': {
            'func': run_instant,
            'input': False
        },
        'run_script': {
            'func': run_script,
            'input': True
        }
    }

    try:
        sc = ssl.create_default_context(ssl.Purpose.SERVER_AUTH)
        sc.check_hostname = False
        sc.load_verify_locations('cert.pem')

        output_queue = asyncio.Queue(100)
        reader, writer = await asyncio.open_connection('127.0.0.1', 8888, ssl=sc)


        writer.write(json.dumps({'type': 'auth', 'hostname': 'navi', 'password': 'IeghaeNgaKaht7ai'}).encode("utf-8", "strict"))
        writer.write(b'\36')
        await writer.drain()


        logging.info("Connected to server")                          
        sender = asyncio.ensure_future(package_sender(writer, output_queue))
  
        running_jobs = {} #Map from id to job descriptor
        while True:
            try:
                package = await reader.readuntil(b'\36')
            except asyncio.streams.IncompleteReadError:
                break
            if not package: break
            id = None
            try:
                obj = json.loads(package[:-1].decode("utf-8", "strict"))
                id = obj['id']
                t = obj['type']
                if t == 'ping':
                    await output_queue.put({'type': 'pong', 'id':obj['id']})
                elif t in jobtypes:
                    if id in running_jobs:
                        raise JobError(id, "id is allready running")
                    logging.info("%d: start %s"%(id, t))
                    jt = jobtypes[t]
                    if jt['input']:
                        input_queue = asyncio.Queue(input_queue_size)
                        task = asyncio.ensure_future(jt['func'](running_jobs, obj, output_queue, input_queue))
                    else:
                        input_queue = None
                        task = asyncio.ensure_future(jt['func'](running_jobs, obj, output_queue))
                    running_jobs[id] = {'task': task, 'input_queue': input_queue, 'type': t}
                elif id not in running_jobs:
                    raise JobError(id, "No job with the given id %d is running"%id)
                elif t == 'cancel':
                    logging.info("%s: cancle", id)
                    running_jobs[id]['task'].cancel()
                elif t == 'kill':
                    logging.info("%s: kill", id)
                    running_jobs[id]['task'].cancel()
                elif running_jobs[id]['input_queue'] == None:
                    raise JobError(id, "Does not accept input")
                elif t not in ('done', 'data'):
                    raise JobError(id, "Unknown command type")
                else:
                    await running_jobs[id]['input_queue'].put(obj)
            except Exception as e:
                logging.error("%s: %s: %s"%(id, type(e).__name__, str(e)))
                await output_queue.put({'type': 'failure', 'id':id, 'failure_type': type(e).__name__, 'message': str(e)})
        
        if running_jobs:
            for t in running_jobs.values():
                t['task'].cancel()
            await asyncio.wait([t['task'] for t in running_jobs.values()])
        await output_queue.put(None)
        await sender
        writer.close()
        logging.info("Disconnected from server")
    except ConnectionError as e:
        await asyncio.sleep(1)
        print(e, e.args)
    except Exception as e:
        await asyncio.sleep(1)
        print(e, e.args)
        
try:
    while True:
        loop.run_until_complete(client())
except KeyboardInterrupt:
    pass

loop.close()
