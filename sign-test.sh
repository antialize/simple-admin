#!/bin/bash
< ca ssh-keygen -s /dev/stdin -I the_certificate_identity -n the_certificate_principal -V +20h -z 42 user.pub
