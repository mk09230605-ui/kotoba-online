const memory = globalThis.__kotobaRooms || (globalThis.__kotobaRooms = new Map());

const keyFor = roomId => `kotoba:room:${roomId}`;
const kvEnabled = () => Boolean(process.env.KV_REST_API_URL && process.env.KV_REST_API_TOKEN);

async function kv(command, ...args) {
  const response = await fetch(`${process.env.KV_REST_API_URL}/${command}/${args.map(encodeURIComponent).join('/')}`, {
    headers: { Authorization: `Bearer ${process.env.KV_REST_API_TOKEN}` }
  });
  if (!response.ok) throw new Error(`KV error: ${response.status}`);
  return (await response.json()).result;
}

async function getRoom(roomId) {
  if (!kvEnabled()) return memory.get(roomId) || null;
  const value = await kv('get', keyFor(roomId));
  return value ? JSON.parse(value) : null;
}

async function setRoom(room) {
  if (!kvEnabled()) {
    memory.set(room.id, room);
    return;
  }
  await kv('set', keyFor(room.id), JSON.stringify(room), 'EX', '21600');
}

module.exports = { getRoom, setRoom, isPersistent: kvEnabled };
