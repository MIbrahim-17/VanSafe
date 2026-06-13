#!/usr/bin/env node
/**
 * Local HTTPS for phone testing WITHOUT a tunnel.
 *
 * iOS Safari won't grant geolocation on a self-signed cert you merely click
 * through — the cert must be *trusted*. So this creates a local Certificate
 * Authority (CA) once, signs a server cert (valid for localhost + your LAN IP),
 * and exports the CA to public/rootCA.crt so your iPhone can install + trust it.
 *
 * Steps:
 *   1. npm run cert
 *   2. npm run dev:https
 *   3. On the iPhone (same Wi-Fi), open  https://<LAN-IP>:3000/rootCA.crt
 *      -> Allow profile -> Settings -> Profile Downloaded -> Install
 *      -> Settings -> General -> About -> Certificate Trust Settings
 *         -> enable full trust for "VanSafe Local CA"
 *   4. Open https://<LAN-IP>:3000  (now trusted) -> GPS prompt works.
 *
 * Re-run `npm run cert` only if your LAN IP changes; the CA is reused so the
 * iPhone stays trusted.
 */
import { execFileSync } from "node:child_process";
import {
  mkdirSync,
  writeFileSync,
  rmSync,
  existsSync,
  readFileSync,
  appendFileSync,
} from "node:fs";
import { networkInterfaces } from "node:os";

const DIR = "certificates";
const CA_KEY = `${DIR}/rootCA-key.pem`;
const CA_CRT = `${DIR}/rootCA.pem`;
const SRV_KEY = `${DIR}/localhost-key.pem`;
const SRV_CRT = `${DIR}/localhost.pem`;

function lanIPs() {
  const ips = [];
  for (const iface of Object.values(networkInterfaces())) {
    for (const net of iface ?? []) {
      if (net.family === "IPv4" && !net.internal) ips.push(net.address);
    }
  }
  return ips;
}

const ossl = (args) => execFileSync("openssl", args, { stdio: ["ignore", "ignore", "inherit"] });

mkdirSync(DIR, { recursive: true });
mkdirSync("public", { recursive: true });

// 1. Local CA — created once and reused (so a trusted phone stays trusted).
if (!existsSync(CA_KEY) || !existsSync(CA_CRT)) {
  ossl(["genrsa", "-out", CA_KEY, "2048"]);
  ossl([
    "req", "-x509", "-new", "-nodes", "-key", CA_KEY, "-sha256",
    "-days", "3650", "-out", CA_CRT, "-subj", "/CN=VanSafe Local CA",
  ]);
  console.log("Created a new local CA.");
} else {
  console.log("Reusing existing local CA.");
}

// 2. Server certificate signed by the CA, valid for localhost + LAN IPs.
const ips = lanIPs();
const sans = [
  "DNS.1 = localhost",
  "IP.1 = 127.0.0.1",
  "IP.2 = ::1",
  ...ips.map((ip, i) => `IP.${i + 3} = ${ip}`),
].join("\n");

const ext = `authorityKeyIdentifier = keyid,issuer
basicConstraints = CA:FALSE
keyUsage = digitalSignature, keyEncipherment
extendedKeyUsage = serverAuth
subjectAltName = @alt
[alt]
${sans}
`;
writeFileSync(`${DIR}/ext.cnf`, ext);

ossl(["genrsa", "-out", SRV_KEY, "2048"]);
ossl(["req", "-new", "-key", SRV_KEY, "-out", `${DIR}/server.csr`, "-subj", "/CN=localhost"]);
ossl([
  "x509", "-req", "-in", `${DIR}/server.csr`,
  "-CA", CA_CRT, "-CAkey", CA_KEY, "-CAcreateserial",
  "-out", SRV_CRT, "-days", "825", "-sha256", "-extfile", `${DIR}/ext.cnf`,
]);

// Present the full chain (leaf + CA) to clients.
appendFileSync(SRV_CRT, "\n" + readFileSync(CA_CRT, "utf8"));

// 3. Export the CA in DER so iOS Safari installs it cleanly from /rootCA.crt.
ossl(["x509", "-in", CA_CRT, "-outform", "der", "-out", "public/rootCA.crt"]);

rmSync(`${DIR}/ext.cnf`, { force: true });
rmSync(`${DIR}/server.csr`, { force: true });

console.log("\n✓ Certificates ready.");
console.log("  Server cert valid for: localhost, 127.0.0.1" + (ips.length ? ", " + ips.join(", ") : ""));
console.log("\nNext steps:");
console.log("  1. npm run dev:https");
if (ips.length) {
  console.log(`  2. On the iPhone open: https://${ips[0]}:3000/rootCA.crt  -> install the profile`);
  console.log(`     then Settings -> General -> About -> Certificate Trust Settings -> enable "VanSafe Local CA"`);
  console.log(`  3. Open https://${ips[0]}:3000  -> Start Sharing -> allow location`);
}
