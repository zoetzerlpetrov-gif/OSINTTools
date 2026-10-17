import net from "node:net";

export const SEARCH_TYPES = new Set(["email", "username", "domain", "ip", "name", "phone"]);

export function normalizeSearchType(value) {
  const type = String(value ?? "").trim().toLowerCase();
  if (!SEARCH_TYPES.has(type)) throw new Error("Unsupported search type");
  return type;
}

export function validateTerm(type, rawValue) {
  const value = String(rawValue ?? "").trim();
  if (!value || value.length > 320) throw new Error("Search value must contain 1 to 320 characters");

  if (type === "email") {
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value)) throw new Error("Invalid email address");
    return value.toLowerCase();
  }

  if (type === "username") {
    if (!/^[\p{L}\p{N}._-]{2,64}$/u.test(value)) throw new Error("Username contains unsupported characters");
    return value;
  }

  if (type === "domain") {
    const domain = value.toLowerCase().replace(/\.$/, "");
    if (domain.length > 253 || !/^(?=.{1,253}$)(?:[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?\.)+[a-z]{2,63}$/.test(domain)) {
      throw new Error("Invalid domain");
    }
    return domain;
  }

  if (type === "ip") {
    if (!net.isIP(value)) throw new Error("Invalid IP address");
    return value;
  }

  if (type === "phone") {
    const compact = value.replace(/[\s()-]/g, "");
    if (!/^\+?[1-9]\d{7,14}$/.test(compact)) throw new Error("Use an international phone number, for example +525500000000");
    return compact;
  }

  if (!/^[\p{L}\p{M} .'’-]{2,120}$/u.test(value)) throw new Error("Name contains unsupported characters");
  return value;
}

export function validateSha1Prefix(value) {
  const prefix = String(value ?? "").trim().toUpperCase();
  if (!/^[A-F0-9]{5}$/.test(prefix)) throw new Error("SHA-1 prefix must contain exactly five hexadecimal characters");
  return prefix;
}

export function isPublicIp(value) {
  if (net.isIP(value) === 4) {
    const numeric = value.split(".").map(Number).reduce((total, part) => ((total << 8) | part) >>> 0, 0);
    const blockedCidrs = [
      ["0.0.0.0", 8], ["10.0.0.0", 8], ["100.64.0.0", 10], ["127.0.0.0", 8],
      ["169.254.0.0", 16], ["172.16.0.0", 12], ["192.0.0.0", 24], ["192.0.2.0", 24],
      ["192.88.99.0", 24], ["192.168.0.0", 16], ["198.18.0.0", 15], ["198.51.100.0", 24],
      ["203.0.113.0", 24], ["224.0.0.0", 4], ["240.0.0.0", 4]
    ];
    if (blockedCidrs.some(([network, prefix]) => {
      const base = network.split(".").map(Number).reduce((total, part) => ((total << 8) | part) >>> 0, 0);
      const mask = prefix === 0 ? 0 : (0xffffffff << (32 - prefix)) >>> 0;
      return (numeric & mask) === (base & mask);
    })) return false;
  }
  if (net.isIP(value) === 6) {
    const normalized = value.toLowerCase();
    if (normalized === "::1" || normalized === "::") return false;
    if (normalized.startsWith("::ffff:") || normalized.startsWith("64:ff9b:1:") || normalized.startsWith("100:")) return false;
    if (normalized.startsWith("fc") || normalized.startsWith("fd")) return false;
    if (["fe8", "fe9", "fea", "feb"].some(prefix => normalized.startsWith(prefix))) return false;
    if (normalized.startsWith("ff") || normalized.startsWith("2001:db8:") || normalized.startsWith("3fff:")) return false;
  }
  return true;
}
