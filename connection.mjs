// Device-only credentials: never part of the interview document or its exports.
export const CONNECTION_KEY = 'interviewGitHubConnection.v1';
const repository = 'kimminji-design/interview';
export function readConnection(storage) {
  const raw = storage.getItem(CONNECTION_KEY);
  if (!raw) return '';
  const record = JSON.parse(raw);
  return record.repository === repository && typeof record.token === 'string' ? record.token.trim() : '';
}
export function saveConnection(storage, token, remember) {
  if (remember) storage.setItem(CONNECTION_KEY, JSON.stringify({ repository, token: token.trim() }));
  else storage.removeItem(CONNECTION_KEY);
}
