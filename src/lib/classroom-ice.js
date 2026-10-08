export function classroomIceServers() {
  if (!process.env.CLASSROOM_ICE_SERVERS) return [{ urls: "stun:stun.l.google.com:19302" }];
  const servers = JSON.parse(process.env.CLASSROOM_ICE_SERVERS);
  if (!Array.isArray(servers) || servers.length > 10 || servers.some((server) => {
    const urls = Array.isArray(server?.urls) ? server.urls : [server?.urls];
    return !urls.length || urls.some((url) => typeof url !== "string" || !/^(stun|stuns|turn|turns):/.test(url));
  })) throw new Error("CLASSROOM_ICE_SERVERS must be an ICE server array.");
  return servers.map(({ urls, username, credential }) => ({ urls, ...(username && { username }), ...(credential && { credential }) }));
}
