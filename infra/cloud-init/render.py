#!/usr/bin/env python3
"""Writes infra/cloud-init/<environment>.yaml, the Hetzner user data for each host, from the Caddy and systemd files beside it."""
import pathlib

ROOT = pathlib.Path(__file__).resolve().parents[2]
HERE = ROOT / "infra" / "cloud-init"

HOSTS = {
    "staging": {"hostname": "staging-stabileo", "db": "stabileo_staging", "caddy_env": "staging.env", "sites": []},
    "production": {"hostname": "prod-stabileo", "db": "stabileo", "caddy_env": "production.env", "sites": ["www-redirect.caddy"]},
}

SUDO = [
    "/usr/bin/systemctl start stabileo-backend",
    "/usr/bin/systemctl stop stabileo-backend",
    "/usr/bin/systemctl restart stabileo-backend",
    "/usr/bin/systemctl status stabileo-backend",
    "/usr/bin/systemctl reload caddy",
    "/usr/bin/caddy validate --config /srv/stabileo/caddy/Caddyfile.next --adapter caddyfile --envfile /etc/caddy/stabileo.env",
    "/usr/bin/install -m 0644 -o root -g root /srv/stabileo/caddy/Caddyfile.next /etc/caddy/Caddyfile",
]

PACKAGES = ["caddy", "postgresql", "postgresql-client", "curl", "rsync", "gnupg", "ca-certificates",
            "unattended-upgrades", "util-linux", "xz-utils", "zstd"]


def indented(path, n):
    return "\n".join((" " * n + line) if line else "" for line in path.read_text().rstrip("\n").split("\n"))


def write_file(path, source, defer=True):
    out = f"  - path: {path}\n    permissions: \"0644\"\n"
    if defer:
        out += "    defer: true\n"
    return out + "    content: |\n" + indented(source, 6) + "\n"


def render(name, host):
    files = write_file("/etc/caddy/Caddyfile", ROOT / "infra/caddy/Caddyfile")
    files += write_file("/etc/caddy/stabileo.env", ROOT / "infra/caddy" / host["caddy_env"])
    for site in host["sites"]:
        files += write_file(f"/etc/caddy/sites.d/{site}", ROOT / "infra/caddy/sites.d" / site)
    files += write_file("/etc/systemd/system/caddy.service.d/stabileo.conf", ROOT / "infra/systemd/caddy-dropin.conf")
    files += write_file("/etc/systemd/system/stabileo-backend.service", ROOT / "infra/systemd/stabileo-backend.service")
    files += ("  - path: /etc/apt/apt.conf.d/20auto-upgrades\n    permissions: \"0644\"\n    content: |\n"
              "      APT::Periodic::Update-Package-Lists \"1\";\n      APT::Periodic::Unattended-Upgrade \"1\";\n")
    key = indented(HERE / "caddy-apt.gpg.asc", 8)
    sudo = "\n".join(f'      - "ALL=(root) NOPASSWD: {c}"' for c in SUDO)
    packages = "\n".join(f"  - {p}" for p in PACKAGES)
    db = host["db"]
    return f"""#cloud-config
# Hetzner user data for the {name} host (Debian 13), rendered by infra/cloud-init/render.py.
# Replace before pasting:
#   __DEPLOY_PUBKEY__    public half of DEPLOY_SSH_KEY
#   __DB_PASSWORD__      password in DATABASE_URL (ecto://stabileo:<it>@localhost/{db})
#   __NIX_TRUSTED_KEY__  public half of NIX_SIGNING_KEY
# Open 22, 80 and 443 in the Hetzner Cloud Firewall. See docs/DEPLOY.md.

hostname: {host["hostname"]}
timezone: UTC
package_update: true
package_upgrade: true

apt:
  sources:
    caddy-stable:
      source: "deb [signed-by=$KEY_FILE] https://dl.cloudsmith.io/public/caddy/stable/deb/debian any-version main"
      key: |
{key}

packages:
{packages}

users:
  - default
  - name: app
    gecos: Stabileo deploy and service user
    shell: /bin/bash
    lock_passwd: true
    groups: [systemd-journal]
    ssh_authorized_keys:
      - __DEPLOY_PUBKEY__
    sudo:
{sudo}

# defer: written after the packages, or dpkg keeps the package's Caddyfile over this one.
write_files:
{files}
runcmd:
  - mkdir -p /srv/stabileo/releases /srv/stabileo/gcroots /srv/stabileo/caddy /srv/stabileo/incoming /etc/caddy/sites.d
  - chown -R app:app /srv/stabileo
  - chmod 0755 /srv/stabileo
  - sudo -u postgres psql -v ON_ERROR_STOP=1 -c "CREATE ROLE stabileo LOGIN PASSWORD '__DB_PASSWORD__' CREATEDB;"
  - sudo -u postgres psql -v ON_ERROR_STOP=1 -c "GRANT pg_signal_backend TO stabileo;"
  - sudo -u postgres psql -v ON_ERROR_STOP=1 -c "CREATE DATABASE {db} OWNER stabileo;"
  - curl --proto '=https' --tlsv1.2 -sSf -L https://install.determinate.systems/nix -o /root/nix-installer.sh
  - sh /root/nix-installer.sh install linux --no-confirm
  # Determinate Nix regenerates nix.conf; only nix.custom.conf survives.
  - printf '\\nextra-trusted-public-keys = __NIX_TRUSTED_KEY__\\n' >> /etc/nix/nix.custom.conf
  - systemctl restart nix-daemon
  - systemctl daemon-reload
  - systemctl enable stabileo-backend
  - systemctl enable --now caddy
  - systemctl restart caddy
  - echo "stabileo cloud-init done" > /srv/stabileo/cloud-init-done

final_message: "stabileo {name} host ready after $UPTIME seconds"
"""


for name, host in HOSTS.items():
    (HERE / f"{name}.yaml").write_text(render(name, host))
    print(f"wrote infra/cloud-init/{name}.yaml")
