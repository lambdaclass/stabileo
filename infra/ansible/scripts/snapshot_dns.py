import socket
import sys


def require_dns(host):
    try:
        addresses = socket.getaddrinfo(host, 443, type=socket.SOCK_STREAM)
        if not addresses:
            raise OSError('no addresses')
    except OSError as error:
        raise RuntimeError(f'Snapshot host {host} does not resolve; configure its A/AAAA or CNAME DNS record before snapshot deployment') from error


if __name__ == '__main__':
    try:
        require_dns(sys.argv[1])
    except RuntimeError as error:
        sys.exit(str(error))
