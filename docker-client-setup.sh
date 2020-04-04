#!/bin/sh
if ! [ -e /var/sadmin ]; then
	echo This script must run with /var/sadmin existing
	exit 1
fi
if [ "$#" -eq 0 ]; then
	if ! [ -e /var/sadmin/simpleadmin_client.json ]; then
		echo This script must be run with an appropriate setup.sh URL
		exit 1
	fi
	exec ./client.py --config /var/sadmin/simpleadmin_client.json
fi
if [ -e /etc/simpleadmin_client.json ]; then
	echo This script must run inside a fresh Docker container
	exit 1
fi
if ! [ -x ./client.py ]; then
	echo This script must run in the same directory as client.py
	exit 1
fi
curl "$@" | grep "^echo" | bash
if ! grep -q password /etc/simpleadmin_client.json; then
	echo "Setup script did not work"
	exit 1
fi
cp /etc/simpleadmin_client.json /var/sadmin/simpleadmin_client.json
exec ./client.py --config /var/sadmin/simpleadmin_client.json
