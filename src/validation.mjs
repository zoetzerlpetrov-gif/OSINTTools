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
    const parts = value.split(".").map(Number);
    if (parts[0] === 10 || parts[0] === 127 || parts[0] === 0) return false;
    if (parts[0] === 169 && parts[1] === 254) return false;
    if (parts[0] === 172 && parts[1] >= 16 && parts[1] <= 31) return false;
    if (parts[0] === 192 && parts[1] === 168) return false;
    if (parts[0] >= 224) return false;
  }
  if (net.isIP(value) === 6) {
    const normalized = value.toLowerCase();
    if (normalized === "::1" || normalized === "::" || normalized.startsWith("fc") || normalized.startsWith("fd") || normalized.startsWith("fe8") || normalized.startsWith("fe9") || normalized.startsWith("fea") || normalized.startsWith("feb")) return false;
  }
  return true;
}
