import dns from "node:dns/promises";
import { isPublicIp } from "../validation.mjs";

function settledValue(result) {
  return result.status === "fulfilled" ? result.value : [];
}

export async function inspectDomain(domain) {
  const [a, aaaa, mx, ns, txt] = await Promise.allSettled([
    dns.resolve4(domain),
    dns.resolve6(domain),
    dns.resolveMx(domain),
    dns.resolveNs(domain),
    dns.resolveTxt(domain)
  ]);

  return {
    provider: "Node DNS resolver",
    source: "dns",
    observedAt: new Date().toISOString(),
    records: {
      A: settledValue(a),
      AAAA: settledValue(aaaa),
      MX: settledValue(mx).sort((left, right) => left.priority - right.priority),
      NS: settledValue(ns),
      TXT: settledValue(txt).map(parts => parts.join(""))
    }
  };
}

export async function inspectIp(ip) {
  if (!isPublicIp(ip)) {
    return {
      provider: "Node DNS resolver",
      source: "dns",
      observedAt: new Date().toISOString(),
      warning: "Private, local, multicast, or reserved addresses are not sent to external resolvers.",
      hostnames: []
    };
  }

  let hostnames = [];
  try {
    hostnames = await dns.reverse(ip);
  } catch {
    hostnames = [];
  }
  return { provider: "Node DNS resolver", source: "dns", observedAt: new Date().toISOString(), hostnames };
}
