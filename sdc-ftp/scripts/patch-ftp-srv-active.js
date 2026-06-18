const fs = require("fs");
const path = require("path");

const activePath = path.join(__dirname, "..", "node_modules", "ftp-srv", "src", "connector", "active.js");

if (!fs.existsSync(activePath)) {
  console.warn("[sdc-ftp] ftp-srv active connector not found, skipping proxy patch");
  process.exit(0);
}

const original = fs.readFileSync(activePath, "utf8");

if (original.includes("FTP_ALLOW_ACTIVE_BEHIND_PROXY")) {
  console.log("[sdc-ftp] ftp-srv active connector already patched");
  process.exit(0);
}

const strictCheck = `      if (!ip.isEqual(this.connection.commandSocket.remoteAddress, host)) {
        throw new SocketError('The given address is not yours', 500);
      }
`;

const proxyAwareCheck = `      if (!ip.isEqual(this.connection.commandSocket.remoteAddress, host)) {
        const allowProxyActive = process.env.FTP_ALLOW_ACTIVE_BEHIND_PROXY === 'true';
        if (!allowProxyActive) {
          throw new SocketError('The given address is not yours', 500);
        }
        console.warn(
          '[sdc-ftp] FTP activo aceptado detras de proxy',
          {
            controlAddress: this.connection.commandSocket.remoteAddress,
            requestedHost: host,
            requestedPort: port,
            family
          }
        );
      }
`;

if (!original.includes(strictCheck)) {
  console.warn("[sdc-ftp] ftp-srv active connector changed upstream, proxy patch not applied");
  process.exit(0);
}

fs.writeFileSync(activePath, original.replace(strictCheck, proxyAwareCheck));
console.log("[sdc-ftp] ftp-srv active connector patched for optional proxy mode");
