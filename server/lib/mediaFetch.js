const dns = require("node:dns").promises;
const http = require("node:http");
const https = require("node:https");
const net = require("node:net");

const DEFAULT_MAX_MEDIA_BYTES = 15 * 1024 * 1024;

function ipv6Value(address = "") {
  let value = address.toLowerCase().split("%")[0];
  if (value.includes(".")) {
    const lastColon = value.lastIndexOf(":");
    const octets = value.slice(lastColon + 1).split(".").map(Number);
    if (octets.length !== 4 || octets.some((octet) => !Number.isInteger(octet) || octet < 0 || octet > 255)) return null;
    value = `${value.slice(0, lastColon)}:${((octets[0] << 8) | octets[1]).toString(16)}:${((octets[2] << 8) | octets[3]).toString(16)}`;
  }
  const halves = value.split("::");
  if (halves.length > 2) return null;
  const head = halves[0] ? halves[0].split(":") : [];
  const tail = halves[1] ? halves[1].split(":") : [];
  const fill = halves.length === 2 ? 8 - head.length - tail.length : 0;
  const groups = [...head, ...Array(Math.max(0, fill)).fill("0"), ...tail];
  if (groups.length !== 8 || groups.some((group) => !/^[0-9a-f]{1,4}$/.test(group))) return null;
  return groups.reduce((result, group) => (result << 16n) + BigInt(`0x${group}`), 0n);
}

function ipv6InCidr(value, network, prefix) {
  const networkValue = ipv6Value(network);
  if (value === null || networkValue === null) return false;
  const shift = BigInt(128 - prefix);
  return (value >> shift) === (networkValue >> shift);
}

const NON_PUBLIC_IPV6_CIDRS = [
  ["64:ff9b:1::", 48],
  ["100::", 64],
  ["2001::", 23],
  ["2001:db8::", 32],
  ["2002::", 16],
  ["3ffe::", 16],
  ["3fff::", 20],
  ["5f00::", 16],
  ["fc00::", 7],
  ["fe80::", 10],
  ["fec0::", 10],
  ["ff00::", 8],
];

// IANA IPv6 Global Unicast Address Space allocations, updated 2025-10-10:
// https://www.iana.org/assignments/ipv6-unicast-address-assignments/
// Unlisted address space within 2000::/3 remains reserved for future allocation.
const ALLOCATED_GLOBAL_IPV6_CIDRS = [
  ["2001::", 23], ["2001:200::", 23], ["2001:400::", 23], ["2001:600::", 23],
  ["2001:800::", 22], ["2001:c00::", 23], ["2001:e00::", 23], ["2001:1200::", 23],
  ["2001:1400::", 22], ["2001:1800::", 23], ["2001:1a00::", 23], ["2001:1c00::", 22],
  ["2001:2000::", 19], ["2001:4000::", 23], ["2001:4200::", 23], ["2001:4400::", 23],
  ["2001:4600::", 23], ["2001:4800::", 23], ["2001:4a00::", 23], ["2001:4c00::", 23],
  ["2001:5000::", 20], ["2001:8000::", 19], ["2001:a000::", 20], ["2001:b000::", 20],
  ["2002::", 16], ["2003::", 18], ["2400::", 12], ["2410::", 12], ["2600::", 12],
  ["2610::", 23], ["2620::", 23], ["2630::", 12], ["2800::", 12], ["2a00::", 12],
  ["2a10::", 12], ["2c00::", 12],
];

// Globally reachable more-specific assignments inside the otherwise non-global 2001::/23:
// https://www.iana.org/assignments/iana-ipv6-special-registry/
const GLOBAL_IPV6_SPECIAL_PURPOSE_CIDRS = [
  ["2001:1::1", 128], ["2001:1::2", 128], ["2001:1::3", 128], ["2001:3::", 32],
  ["2001:4:112::", 48], ["2001:20::", 28], ["2001:30::", 28],
];

// IANA IPv4 Special-Purpose Address Registry entries that are not globally reachable.
const NON_GLOBAL_IPV4_CIDRS = [
  ["0.0.0.0", 8], ["10.0.0.0", 8], ["100.64.0.0", 10], ["127.0.0.0", 8],
  ["169.254.0.0", 16], ["172.16.0.0", 12], ["192.0.2.0", 24], ["192.88.99.0", 24],
  ["192.168.0.0", 16], ["198.18.0.0", 15], ["198.51.100.0", 24], ["203.0.113.0", 24],
  ["224.0.0.0", 4], ["240.0.0.0", 4],
];

function ipv4Value(address = "") {
  const octets = address.split(".").map(Number);
  if (octets.length !== 4 || octets.some((octet) => !Number.isInteger(octet) || octet < 0 || octet > 255)) return null;
  return octets.reduce((value, octet) => value * 256 + octet, 0);
}

function ipv4InCidr(value, network, prefix) {
  const networkValue = ipv4Value(network);
  if (value === null || networkValue === null) return false;
  const blockSize = 2 ** (32 - prefix);
  return Math.floor(value / blockSize) === Math.floor(networkValue / blockSize);
}

function isGloballyRoutableIp(address = "") {
  const normalized = address.toLowerCase().replace(/^\[|\]$/g, "").split("%")[0];
  const family = net.isIP(normalized);
  if (family === 4) {
    const value = ipv4Value(normalized);
    if (value === null) return false;
    const ietfProtocolAssignments = ipv4InCidr(value, "192.0.0.0", 24);
    const globallyReachableIetfAnycast = normalized === "192.0.0.9" || normalized === "192.0.0.10";
    if (ietfProtocolAssignments && !globallyReachableIetfAnycast) return false;
    return !NON_GLOBAL_IPV4_CIDRS.some(([network, prefix]) => ipv4InCidr(value, network, prefix));
  }
  if (family === 6) {
    const value = ipv6Value(normalized);
    if (value === null) return false;
    const embeddedIpv4Prefix = [
      ["::", 96], ["::ffff:0:0", 96], ["::ffff:0:0:0", 96], ["64:ff9b::", 96],
    ].find(([network, prefix]) => ipv6InCidr(value, network, prefix));
    if (embeddedIpv4Prefix) {
      const ipv4 = Number(value & 0xffffffffn);
      return isGloballyRoutableIp(`${(ipv4 >>> 24) & 255}.${(ipv4 >>> 16) & 255}.${(ipv4 >>> 8) & 255}.${ipv4 & 255}`);
    }
    const isAllocatedGlobalUnicast = ALLOCATED_GLOBAL_IPV6_CIDRS
      .some(([network, prefix]) => ipv6InCidr(value, network, prefix));
    if (!isAllocatedGlobalUnicast) return false;
    if (GLOBAL_IPV6_SPECIAL_PURPOSE_CIDRS.some(([network, prefix]) => ipv6InCidr(value, network, prefix))) return true;
    return !NON_PUBLIC_IPV6_CIDRS.some(([network, prefix]) => ipv6InCidr(value, network, prefix));
  }
  return false;
}

async function assertPublicHttpTarget(target, lookup = dns.lookup) {
  if (!/^https?:$/.test(target.protocol)) throw new Error("Unsupported media url");
  const hostname = target.hostname.toLowerCase().replace(/^\[|\]$/g, "");
  if (!hostname || hostname === "localhost" || hostname.endsWith(".localhost") || hostname.endsWith(".local")) {
    throw new Error("Blocked private media url");
  }
  if (net.isIP(hostname)) {
    if (!isGloballyRoutableIp(hostname)) throw new Error("Blocked private media url");
    return { address: hostname, family: net.isIP(hostname) };
  }
  const addresses = await lookup(hostname, { all: true, verbatim: true });
  if (!addresses.length || addresses.some((entry) => !isGloballyRoutableIp(entry.address))) {
    throw new Error("Blocked private media url");
  }
  return addresses[0];
}

function createPinnedLookup(resolved) {
  return (_hostname, options, callback) => {
    if (typeof options === "function") {
      callback = options;
      options = {};
    }
    if (options?.all) {
      callback(null, [{ address: resolved.address, family: resolved.family }]);
      return;
    }
    callback(null, resolved.address, resolved.family);
  };
}

function requestMediaHop(target, resolved, options = {}) {
  const maxBytes = Math.max(1, Number(options.maxBytes || DEFAULT_MAX_MEDIA_BYTES));
  return new Promise((resolve, reject) => {
    const transport = target.protocol === "https:" ? https : http;
    const request = transport.request(target, {
      headers: {
        "user-agent": "Mozilla/5.0 AppleWebKit/537.36 Chrome/124 Safari/537.36",
        accept: "image/avif,image/webp,image/apng,image/svg+xml,image/*,*/*;q=0.8",
        referer: `${target.protocol}//${target.host}/`,
      },
      lookup: createPinnedLookup(resolved),
    }, (upstream) => {
      const chunks = [];
      let size = 0;
      upstream.on("data", (chunk) => {
        size += chunk.length;
        if (size > maxBytes) {
          request.destroy();
          reject(new Error("Media response too large"));
          return;
        }
        chunks.push(chunk);
      });
      upstream.on("end", () => resolve({ status: upstream.statusCode || 502, headers: upstream.headers, body: Buffer.concat(chunks) }));
      upstream.on("error", reject);
    });
    request.setTimeout(12000, () => request.destroy(new Error("Media request timed out")));
    request.on("error", reject);
    request.end();
  });
}

async function fetchPublicMedia(target, options = {}, redirectCount = 0) {
  const resolved = await assertPublicHttpTarget(target, options.lookup || dns.lookup);
  const requestOptions = { maxBytes: options.maxBytes || DEFAULT_MAX_MEDIA_BYTES };
  const response = await (options.requestHop || requestMediaHop)(target, resolved, requestOptions);
  if (response.status >= 300 && response.status < 400) {
    const location = response.headers?.location;
    if (!location) throw new Error("Media redirect missing location");
    if (redirectCount >= 4) throw new Error("Too many media redirects");
    return fetchPublicMedia(new URL(location, target), options, redirectCount + 1);
  }
  return response;
}

module.exports = {
  assertPublicHttpTarget,
  createPinnedLookup,
  fetchPublicMedia,
  isGloballyRoutableIp,
  requestMediaHop,
};
