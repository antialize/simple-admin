import os, re, sys

r = re.compile(r'^var ([a-zA-Z_0-9]+) = require\("([^"]+)"\);?$', re.MULTILINE)

deps = {}


for d, _, fs in os.walk('public/js/'):
    for f in fs:
        if not f.endswith('.js'):
            continue
        x = os.path.join(d, f)[:-3]
        with open(os.path.join(d, f), 'r') as o:
            for m in r.finditer(o.read(), re.MULTILINE):
                if m.group(2)[0] != '.':
                    continue
                y = os.path.normpath(os.path.join(d, m.group(2)))
                deps.setdefault(x, []).append(y)

visited = set()
stack = []


def visit(name):
    if name in visited:
        return

    if name in stack:
        print(stack, name)
        sys.exit(1)
    
    stack.append(name)
    if name in deps:
        for d in deps[name]:
            visit(d)
    stack.pop()
    
    visited.add(name)

for x in deps:
    visit(x)


 
        
